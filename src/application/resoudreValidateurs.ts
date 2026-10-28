import type { Acteur } from '@/domain/Acteur'
import {
  calculerValideurs,
  type AuteurNote,
  type NoeudHierarchique,
} from '@/domain/PolitiqueAcces'
import type { AnnuaireOrganisation } from '@/ports/AnnuaireOrganisation'

// Résout les valideurs d'une note depuis l'organigramme courant
// (ADR-ARCH-002) : manager direct + N+1, ou RH de l'entreprise pour
// les auteurs sans manager et les notes de RH. L'auteur est toujours
// exclu. Partagé par AccéderAuJustificatif et TrancherNote.
export async function resoudreValidateurs(
  acteur: Acteur,
  auteur: AuteurNote,
  annuaire: AnnuaireOrganisation
): Promise<string[]> {
  const parents = new Map<string, NoeudHierarchique>()
  async function parentDe(userId: string): Promise<NoeudHierarchique | null> {
    const present = parents.get(userId)
    if (present) return present
    const utilisateur = await annuaire.trouverUtilisateur(
      acteur.companyId,
      userId
    )
    if (!utilisateur) return null
    const noeud: NoeudHierarchique = {
      id: utilisateur.id,
      role: utilisateur.role,
      managerId: utilisateur.managerId,
    }
    parents.set(userId, noeud)
    return noeud
  }
  // Deux niveaux suffisent : manager direct et son propre manager.
  // Les RH ne sont lus que si la règle peut en avoir besoin (revues
  // phase/3 : auteur RH, sans manager, ou direct racine/inconnu —
  // jamais pour un auteur rattaché à une ligne non racine).
  const direct = auteur.managerId ? await parentDe(auteur.managerId) : null
  if (direct && direct.managerId) await parentDe(direct.managerId)
  const besoinRh =
    auteur.role === 'hr_admin' ||
    !auteur.managerId ||
    !direct ||
    direct.role !== 'manager' ||
    !direct.managerId
  const rh = besoinRh ? await annuaire.listerRh(acteur.companyId) : []
  return calculerValideurs(auteur, {
    parentDe: (userId: string) => parents.get(userId) ?? null,
    rhDeEntreprise: () => rh.map((utilisateur) => utilisateur.id),
  })
}
