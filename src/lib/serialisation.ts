import type { ExpenseNote } from '@/domain/ExpenseNote'

// Sérialisation unique ligne SQL → JSON (contrat client figé §4).
// Vit dans la couche interface (revues phase/2, §1.5 et §10) : les
// adaptateurs persistent, les routes sérialisent — jamais l'inverse.
// `createdAt` est garanti par le type (obligatoire dans
// `ExpenseNoteProps`) : plus de garde à l'exécution.
// Lecture du motif de rejet depuis le corps JSON (revues phase/4) :
// corps absent, illisible ou non objet → raison absente (undefined).
// Le cas d'usage décide : 400 au rejet sans motif, ignorée à
// l'approbation. Un corps malformé ne fait donc plus 500.
export async function lireRaison(request: Request): Promise<unknown> {
  const corps: unknown = await request.json().catch(() => null)
  if (!corps || typeof corps !== 'object' || Array.isArray(corps)) {
    return undefined
  }
  return (corps as { reason?: unknown }).reason
}

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
