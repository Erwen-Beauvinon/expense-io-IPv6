import { describe, expect, it } from 'vitest'
import { ExpenseNote } from '@/domain/ExpenseNote'
import { toExpenseNoteView } from '@/lib/serialisation'

// Forme JSON gelée (contrat client figé §4, revues phase/2) : clés
// exactes, montant numérique, date ISO.
describe('toExpenseNoteView (sérialisation unique)', () => {
  it('produit exactement les champs du contrat', () => {
    const vue = toExpenseNoteView({
      note: new ExpenseNote({
        id: 'note-1',
        userId: 'user-1',
        amount: 42.5,
        expenseDate: '2026-01-15',
        description: 'Déjeuner client',
        receiptKey: 'receipts/7.png',
        status: 'pending',
        createdAt: '2026-01-15T10:00:00.000Z',
      }),
    })
    expect(vue).toEqual({
      id: 'note-1',
      userId: 'user-1',
      amount: 42.5,
      expenseDate: '2026-01-15',
      description: 'Déjeuner client',
      receiptKey: 'receipts/7.png',
      status: 'pending',
      createdAt: '2026-01-15T10:00:00.000Z',
    })
    expect(typeof vue.amount).toBe('number')
  })
})
