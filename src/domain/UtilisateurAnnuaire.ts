import type { UserRole } from '@/domain/User'

// Vue annuaire d'un utilisateur (docs/contrats-ports.md §4) : le
// domaine Notes ne joint jamais la table `users` ; l'adaptateur
// AnnuaireOrganisation fournit ce contexte.
export interface UtilisateurAnnuaire {
  id: string
  companyId: string
  role: UserRole
  managerId: string | null
  name: string
  email: string
}
