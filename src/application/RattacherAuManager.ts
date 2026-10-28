import type { Acteur } from '@/domain/Acteur'
import {
  AccesRefuse,
  CycleHierarchique,
  DonneesInvalides,
  ManagerIneligible,
  NoteIntrouvable,
} from '@/domain/errors'
import type { UtilisateurAnnuaire } from '@/domain/UtilisateurAnnuaire'
import type { AnnuaireOrganisation } from '@/ports/AnnuaireOrganisation'
import type { UnitOfWork } from '@/ports/UnitOfWork'

// Cas d'usage de rattachement d'un collaborateur à un manager
// (phase 6) : garantit I11 à I13 dans le domaine Organisation —
// même entreprise, rôle manager, pas d'auto-rattachement, pas de
// cycle — en une seule transaction (revue §1 : verrou consultatif par
// entreprise + lectures dans le executer, donc plus de course
// A→B / B→A). Le sort des notes en attente suit le rattachement
// courant (ADR-ARCH-002) : aucun transfert explicite n'est écrit ici.
export interface RattacherAuManagerDeps {
  annuaire: AnnuaireOrganisation
  unitOfWork: UnitOfWork
}

// Remonte la chaîne hiérarchique depuis `depuisId` et refuse si elle
// boucle sur `cibleId` (I12). Boucle bornée par un ensemble de
// visités : aucune chaîne corrompue ne peut boucler indéfiniment.
export async function detecterCycle(
  annuaire: Pick<AnnuaireOrganisation, 'trouverUtilisateur'>,
  companyId: string,
  depuisId: string,
  cibleId: string
): Promise<boolean> {
  const visites = new Set<string>()
  let courant: string | null = depuisId
  while (courant !== null) {
    if (courant === cibleId) return true
    if (visites.has(courant)) return true
    visites.add(courant)
    const utilisateur = await annuaire.trouverUtilisateur(companyId, courant)
    if (!utilisateur) return false
    courant = utilisateur.managerId
  }
  return false
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
    if (!cible || (cible.role !== 'employee' && cible.role !== 'manager')) {
      throw new NoteIntrouvable('Not found')
    }

    if (managerIdValide !== null) {
      // I13 : pas d'auto-rattachement, manager éligible de la même
      // entreprise (la recherche bornée à l'entreprise fait du
      // manager inter-entreprises un simple introuvable, I11).
      if (managerIdValide === userId) throw new ManagerIneligible('Invalid manager')
      const manager = await lire(managerIdValide)
      if (!manager || manager.role !== 'manager') {
        throw new ManagerIneligible('Invalid manager')
      }
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
    if (!relue) throw new NoteIntrouvable('Not found')
    return relue
  })
}
