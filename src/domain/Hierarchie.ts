import { ManagerIneligible, UtilisateurIntrouvable } from '@/domain/errors'
import type { UserRole } from '@/domain/Role'

// Règles de l'organigramme (I11–I13), appliquées par RattacherAuManager
// dans sa transaction, sous verrou (revue phase/6). Fonctions pures :
// les lectures restent dans le cas d'usage.

// Collaborateurs qu'un RH peut rattacher et que l'annuaire RH liste.
// Les comptes RH n'ont pas de manager (parité C08).
export const ROLES_RATTACHABLES = ['employee', 'manager'] as const satisfies readonly UserRole[]

interface Membre {
  id: string
  role: UserRole
  companyId: string
}

export function estRattachable(role: UserRole): boolean {
  return (ROLES_RATTACHABLES as readonly UserRole[]).includes(role)
}

// La cible doit exister dans l'entreprise et être rattachable.
export function verifierCibleRattachable<T extends Membre>(
  cible: T | null
): asserts cible is T {
  if (!cible || !estRattachable(cible.role)) {
    throw new UtilisateurIntrouvable('Not found')
  }
}

// I13 : personne n'est son propre manager. Vérifiable avant toute lecture.
export function verifierPasAutoRattachement(collaborateurId: string, managerId: string): void {
  if (collaborateurId === managerId) throw new ManagerIneligible('Invalid manager')
}

// I11 + I13 : le manager désigné existe, a le rôle manager et appartient à
// la même entreprise que le collaborateur — condition explicite, même si
// la lecture de l'annuaire est déjà bornée à l'entreprise.
export function verifierManagerEligible(collaborateur: Membre, manager: Membre | null): void {
  if (!manager || manager.role !== 'manager' || manager.companyId !== collaborateur.companyId) {
    throw new ManagerIneligible('Invalid manager')
  }
}

// Guidage de saisie (console RH) : candidats proposables comme manager.
export function peutEtreDesigneManagerDe(
  candidat: { id: string; role: string },
  collaborateurId: string
): boolean {
  return candidat.role === 'manager' && candidat.id !== collaborateurId
}

// Chaîne hiérarchique lue en remontant depuis le manager proposé :
// `ids` dans l'ordre de lecture, `boucle` si un identifiant est revenu
// (organigramme déjà corrompu).
export interface ChaineHierarchique {
  ids: readonly string[]
  boucle: boolean
}

// I12 : rattacher `collaborateurId` sous la chaîne fermerait un cycle si
// le collaborateur y figure déjà (cycle direct ou transitif). Une chaîne
// déjà bouclée est refusée par prudence.
export function creeraitUnCycle(chaine: ChaineHierarchique, collaborateurId: string): boolean {
  return chaine.boucle || chaine.ids.includes(collaborateurId)
}
