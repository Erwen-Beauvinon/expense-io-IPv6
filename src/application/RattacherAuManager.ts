import type { Acteur } from '@/domain/Acteur'
import {
  AccesRefuse,
  CycleHierarchique,
  DonneesInvalides,
  UtilisateurIntrouvable,
} from '@/domain/errors'
import {
  creeraitUnCycle,
  verifierCibleRattachable,
  verifierManagerEligible,
  verifierPasAutoRattachement,
  type ChaineHierarchique,
} from '@/domain/Hierarchie'
import type { UtilisateurAnnuaire } from '@/domain/UtilisateurAnnuaire'
import type { AnnuaireOrganisation } from '@/ports/AnnuaireOrganisation'
import type { UnitOfWork } from '@/ports/UnitOfWork'

// Cas d'usage de rattachement d'un collaborateur à un manager
// (phase 6) : applique les règles I11 à I13 du domaine (Hierarchie) —
// même entreprise, rôle manager, pas d'auto-rattachement, pas de
// cycle — en une seule transaction (revue §1 : verrou consultatif par
// entreprise + lectures dans le executer, donc plus de course
// A→B / B→A). Le sort des notes en attente suit le rattachement
// courant (ADR-ARCH-002) : aucun transfert explicite n'est écrit ici.
export interface RattacherAuManagerDeps {
  annuaire: AnnuaireOrganisation
  unitOfWork: UnitOfWork
}

// Lit la chaîne hiérarchique en remontant depuis `depuisId`, arrêtée au
// premier identifiant revu (organigramme corrompu) : aucune chaîne ne
// peut boucler indéfiniment. Lecture seulement ; la règle est dans le
// domaine (creeraitUnCycle, I12).
export async function lireChaine(
  annuaire: Pick<AnnuaireOrganisation, 'trouverUtilisateur'>,
  companyId: string,
  depuisId: string,
  arretSur?: string
): Promise<ChaineHierarchique> {
  const ids: string[] = []
  let courant: string | null = depuisId
  while (courant !== null) {
    if (ids.includes(courant)) return { ids, boucle: true }
    ids.push(courant)
    // Le collaborateur trouvé dans la chaîne suffit à conclure.
    if (courant === arretSur) return { ids, boucle: false }
    const utilisateur = await annuaire.trouverUtilisateur(companyId, courant)
    if (!utilisateur) return { ids, boucle: false }
    courant = utilisateur.managerId
  }
  return { ids, boucle: false }
}

// I12 : rattacher `cibleId` sous `depuisId` fermerait-il un cycle ?
export async function detecterCycle(
  annuaire: Pick<AnnuaireOrganisation, 'trouverUtilisateur'>,
  companyId: string,
  depuisId: string,
  cibleId: string
): Promise<boolean> {
  return creeraitUnCycle(await lireChaine(annuaire, companyId, depuisId, cibleId), cibleId)
}

export async function rattacherAuManager(
  acteur: Acteur,
  userId: string,
  managerId: unknown,
  deps: RattacherAuManagerDeps
): Promise<UtilisateurAnnuaire> {
  if (acteur.role !== 'hr_admin') throw new AccesRefuse('Unauthorized')

  // Validation de forme AVANT toute lecture (le port, lui, ne reçoit
  // que string | null — revue phase/6 §3).
  if (managerId !== null && (typeof managerId !== 'string' || managerId.length === 0)) {
    throw new DonneesInvalides('Manager invalide')
  }
  const managerIdValide: string | null = managerId

  // Tout dans le executer (revue phase/6 §1) : le verrou consultatif
  // sérialise les rattachements de l'entreprise, puis lectures et
  // écriture partagent la même transaction — la détection de cycle
  // (lectures) vaut pour l'écriture qui suit.
  return deps.unitOfWork.executer(acteur, async (tx) => {
    await deps.annuaire.verrouillerRattachements(tx, acteur.companyId)
    const lire = (id: string) => deps.annuaire.trouverUtilisateur(acteur.companyId, id, tx)

    const cible = await lire(userId)
    verifierCibleRattachable(cible)

    if (managerIdValide !== null) {
      // I13 avant toute lecture du manager, puis I11 + I13 explicites
      // (domaine Hierarchie) : rôle manager, même entreprise.
      verifierPasAutoRattachement(userId, managerIdValide)
      verifierManagerEligible(cible, await lire(managerIdValide))
      // I12 : pas de cycle, même transitif — lectures verrouillées.
      const chaine = {
        trouverUtilisateur: (companyId: string, id: string) =>
          deps.annuaire.trouverUtilisateur(companyId, id, tx),
      }
      if (await detecterCycle(chaine, acteur.companyId, managerIdValide, userId)) {
        throw new CycleHierarchique('Cycle hiérarchique détecté')
      }
    }

    await deps.annuaire.rattacher(tx, acteur.companyId, userId, managerIdValide)
    const relue = await lire(userId)
    if (!relue) throw new UtilisateurIntrouvable('Not found')
    return relue
  })
}
