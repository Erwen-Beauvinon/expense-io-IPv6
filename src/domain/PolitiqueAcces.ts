import type { Acteur } from '@/domain/Acteur'
import type { NoteAvecAuteur } from '@/domain/NoteAvecAuteur'
import type { UserRole } from '@/domain/Role'

// Politique d'accès centralisée (I7–I10, ADR-ARCH-002 `accepted`) :
// les valideurs sont calculés depuis l'organigramme courant, jamais
// stockés sur la note. Le N+1 a le même droit permanent que le
// valideur direct ; un auteur ne tranche jamais sa propre note.

// Rôles qui peuvent trancher une note (décider et lister les notes à
// trancher). Les routes gardent en plus leur contrôle d'espace d'URL
// (`/api/manager`, `/api/hr`), qui porte les codes figés 401/403 du
// contrat client : c'est une règle d'interface, pas celle-ci.
export const ROLES_DECIDEURS = ['manager', 'hr_admin'] as const satisfies readonly UserRole[]

export function peutDecider(role: UserRole): boolean {
  return (ROLES_DECIDEURS as readonly UserRole[]).includes(role)
}

// Historique personnel : on ne lit que ses propres notes par cette voie
// (les valideurs passent par la file à trancher).
export function peutLireHistoriqueDe(acteur: Acteur, auteurId: string): boolean {
  return acteur.id === auteurId
}

export interface NoeudHierarchique {
  id: string
  role: 'employee' | 'manager' | 'hr_admin'
  managerId: string | null
}

export interface ContexteValidateurs {
  // Parent hiérarchique direct, ou null si inconnu / hors entreprise.
  parentDe(userId: string): NoeudHierarchique | null
  // Tous les hr_admin de l'entreprise de l'auteur.
  rhDeEntreprise(): string[]
}

export interface AuteurNote {
  id: string
  role: 'employee' | 'manager' | 'hr_admin'
  managerId: string | null
}

export function calculerValideurs(
  auteur: AuteurNote,
  annuaire: ContexteValidateurs
): string[] {
  const valideurs = new Set<string>()

  if (auteur.role !== 'hr_admin' && auteur.managerId) {
    const direct = annuaire.parentDe(auteur.managerId)
    if (direct && direct.role === 'manager') {
      valideurs.add(direct.id)
      if (direct.managerId) {
        // Ligne 1 du tableau : M + N+1, sans les RH.
        const superieur = annuaire.parentDe(direct.managerId)
        if (superieur && superieur.role === 'manager') {
          valideurs.add(superieur.id)
        }
        valideurs.delete(auteur.id)
        return [...valideurs]
      }
      // Ligne 2 du tableau : manager racine → M + les RH. Pas de
      // retour anticipé : la branche RH ci-dessous ajoute les RH
      // (revues phase/3 — le retour anticipé les excluait à tort).
    }
    // Manager direct inconnu ou non-manager : repli vers les RH.
  }

  // Auteur sans manager (manager racine, employé non rattaché) ou
  // auteur RH : les valideurs sont les RH de la même entreprise,
  // l'auteur toujours exclu (I7 : jamais sa propre note).
  for (const rh of annuaire.rhDeEntreprise()) {
    if (rh !== auteur.id) valideurs.add(rh)
  }
  return [...valideurs]
}

export function peutConsulter(
  acteur: Acteur,
  note: NoteAvecAuteur,
  valideurs: string[]
): boolean {
  // I9 : même entreprise, et auteur ou valideur légitime. Toujours
  // false hors entreprise, même pour un RH ou un manager.
  if (acteur.companyId !== note.auteurCompanyId) return false
  if (acteur.id === note.auteurId) return true
  return valideurs.includes(acteur.id)
}
