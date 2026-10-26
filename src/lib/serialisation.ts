import type { ExpenseNote } from '@/domain/ExpenseNote'

// Sérialisation unique ligne SQL → JSON (contrat client figé §4).
// Vit dans la couche interface (revues phase/2, §1.5 et §10) : les
// adaptateurs persistent, les routes sérialisent — jamais l'inverse.
// `createdAt` est garanti par le type (obligatoire dans
// `ExpenseNoteProps`) : plus de garde à l'exécution.
export function toExpenseNoteView(entree: { note: ExpenseNote }): {
  id: string
  userId: string
  amount: number
  expenseDate: string
  description: string
  receiptKey: string
  status: string
  createdAt: string
} {
  const props = entree.note.toJSON()
  return {
    id: props.id,
    userId: props.userId,
    amount: props.amount,
    expenseDate: props.expenseDate,
    description: props.description,
    receiptKey: props.receiptKey,
    status: props.status,
    createdAt: new Date(props.createdAt).toISOString(),
  }
}
