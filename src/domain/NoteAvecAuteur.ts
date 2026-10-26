import type { ExpenseNote } from '@/domain/ExpenseNote'
import type { UserRole } from '@/domain/User'

// Note enrichie du contexte de son auteur, nécessaire à la politique
// d'accès (peutConsulter, valideurDe, I7–I9) sans joindre `users` dans
// le domaine Notes : l'adaptateur fournit ce contexte en une seule
// lecture bornée à l'entreprise.
export interface NoteAvecAuteur {
  note: ExpenseNote
  auteurId: string
  auteurCompanyId: string
  auteurManagerId: string | null
  auteurRole: UserRole
}
