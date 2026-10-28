import type { ExpenseNote } from '@/domain/ExpenseNote'
import type { UserRole } from '@/domain/Role'

// Note enrichie du contexte de son auteur, nécessaire à la politique
// d'accès (peutConsulter, calculerValideurs, I7–I9). Le domaine ne lit
// jamais `users` lui-même : l'adaptateur fournit ce contexte. Côté SQL,
// la jointure `expense_notes` ⋈ `users` est assumée — elle permet de
// borner la lecture à l'entreprise et de réévaluer l'autorisation dans
// la même écriture conditionnelle que la décision (I6, ADR-ARCH-002 §3).
export interface NoteAvecAuteur {
  note: ExpenseNote
  auteurId: string
  auteurCompanyId: string
  auteurManagerId: string | null
  auteurRole: UserRole
}
