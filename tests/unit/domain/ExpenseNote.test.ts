import { describe, expect, it } from 'vitest'
import { ExpenseNote, type ExpenseNoteStatus } from '@/domain/ExpenseNote'

function note(status: ExpenseNoteStatus): ExpenseNote {
  return new ExpenseNote({
    id: 'note-1',
    userId: 'user-1',
    amount: 42.5,
    expenseDate: '2026-01-15',
    description: 'Déjeuner client',
    receiptKey: 'receipts/1.png',
    status,
  })
}

// ADR-DOMAIN-001 : pending → approved | rejected, une seule fois.
describe('ExpenseNote', () => {
  it('approuve une note en attente', () => {
    expect(note('pending').approve().status).toBe('approved')
  })

  it('rejette une note en attente', () => {
    expect(note('pending').reject().status).toBe('rejected')
  })

  it('ne modifie pas l’instance d’origine', () => {
    const pending = note('pending')
    pending.approve()
    expect(pending.status).toBe('pending')
  })

  it.each<ExpenseNoteStatus>(['approved', 'rejected'])(
    'refuse d’approuver une note déjà %s',
    (status) => {
      expect(() => note(status).approve()).toThrow('déjà été tranchée')
    }
  )

  it.each<ExpenseNoteStatus>(['approved', 'rejected'])(
    'refuse de rejeter une note déjà %s',
    (status) => {
      expect(() => note(status).reject()).toThrow('déjà été tranchée')
    }
  )

  it('conserve les autres champs lors d’une décision', () => {
    const { status, ...rest } = note('pending').approve().toJSON()
    expect(status).toBe('approved')
    expect(rest).toEqual({
      id: 'note-1',
      userId: 'user-1',
      amount: 42.5,
      expenseDate: '2026-01-15',
      description: 'Déjeuner client',
      receiptKey: 'receipts/1.png',
    })
  })
})
