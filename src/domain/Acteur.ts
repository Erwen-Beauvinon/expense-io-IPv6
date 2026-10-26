import type { UserRole } from '@/domain/Role'

// Acteur serveur (docs/contrats-ports.md §1.2) : identité + rôle +
// entreprise, construits côté serveur depuis la session. Jamais depuis
// le corps d'une requête.
export interface Acteur {
  id: string
  role: UserRole
  companyId: string
}
