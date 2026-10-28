import { describe, expect, it } from 'vitest'
import { ExpenseNote, type ExpenseNoteStatus } from '@/domain/ExpenseNote'
import { DejaTranchee } from '@/domain/errors'

function note(status: ExpenseNoteStatus): ExpenseNote {
  return new ExpenseNote({
    id: 'note-1',
    userId: 'user-1',
    amount: 42.5,
    expenseDate: '2026-01-15',
    description: 'Déjeuner client',
    receiptKey: 'receipts/1.png',
    status,
    createdAt: '2026-01-15T10:00:00.000Z',
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
      expect(() => note(status).approve()).toThrow(DejaTranchee)
      expect(() => note(status).approve()).toThrow('Already decided')
    }
  )

  it.each<ExpenseNoteStatus>(['approved', 'rejected'])(
    'refuse de rejeter une note déjà %s',
    (status) => {
      expect(() => note(status).reject()).toThrow(DejaTranchee)
      expect(() => note(status).reject()).toThrow('Already decided')
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
      createdAt: '2026-01-15T10:00:00.000Z',
    })
  })
})
