import { describe, expect, it } from 'vitest'
import type { Acteur } from '@/domain/Acteur'
import type { NoteAvecAuteur } from '@/domain/NoteAvecAuteur'
import {
  calculerValideurs,
  peutConsulter,
  type AuteurNote,
  type ContexteValidateurs,
} from '@/domain/PolitiqueAcces'
import { ExpenseNote } from '@/domain/ExpenseNote'

function annuaire(
  parents: Record<string, { role: 'employee' | 'manager' | 'hr_admin'; managerId: string | null }>,
  rh: string[]
): ContexteValidateurs {
  return {
    parentDe: (userId: string) => {
      const noeud = parents[userId]
      return noeud ? { id: userId, ...noeud } : null
    },
    rhDeEntreprise: () => rh,
  }
}

function noteDe(auteurId: string, companyId: string): NoteAvecAuteur {
  return {
    note: new ExpenseNote({
      id: 'note-1',
      userId: auteurId,
      amount: 10,
      expenseDate: '2026-01-15',
      description: 'x',
      receiptKey: 'receipts/1.png',
      status: 'pending',
      createdAt: '2026-01-15T10:00:00.000Z',
    }),
    auteurId,
    auteurCompanyId: companyId,
    auteurManagerId: null,
    auteurRole: 'employee',
  }
}

function acteur(id: string, role: Acteur['role'], companyId: string): Acteur {
  return { id, role, companyId }
}

const AUTEUR: AuteurNote = { id: 'emp', role: 'employee', managerId: 'm1' }

describe('calculerValideurs (ADR-ARCH-002)', () => {
  const base = {
    m1: { role: 'manager' as const, managerId: 'm2' },
    m2: { role: 'manager' as const, managerId: null },
  }

  it('retourne manager direct et N+1, sans doublon', () => {
    expect(calculerValideurs(AUTEUR, annuaire(base, ['rh']))).toEqual(['m1', 'm2'])
  })

  it("ajoute les RH quand le direct est un manager racine (tableau ligne 2, revues phase/3)", () => {
    const racine = { m1: { role: 'manager' as const, managerId: null } }
    expect(
      calculerValideurs(AUTEUR, annuaire(racine, ['rh1', 'rh2']))
    ).toEqual(['m1', 'rh1', 'rh2'])
  })

  it('ignore un N+1 qui ne serait pas manager', () => {
    const ctx = annuaire(
      { m1: { role: 'manager', managerId: 'x' }, x: { role: 'employee', managerId: null } },
      ['rh']
    )
    expect(calculerValideurs(AUTEUR, ctx)).toEqual(['m1'])
  })

  it('route les auteurs sans manager vers les RH de l’entreprise', () => {
    const racine: AuteurNote = { id: 'm9', role: 'manager', managerId: null }
    expect(calculerValideurs(racine, annuaire({}, ['rh1', 'rh2']))).toEqual(['rh1', 'rh2'])
  })

  it('exclut l’auteur RH de ses propres valideurs', () => {
    const rh: AuteurNote = { id: 'rh1', role: 'hr_admin', managerId: null }
    expect(calculerValideurs(rh, annuaire({}, ['rh1', 'rh2']))).toEqual(['rh2'])
  })

  it('replie vers les RH quand le manager direct est inconnu', () => {
    expect(calculerValideurs(AUTEUR, annuaire({}, ['rh']))).toEqual(['rh'])
  })
})

describe('peutConsulter (I9)', () => {
  const note = noteDe('emp', 'c1')

  it('autorise l’auteur, même sans être valideur', () => {
    expect(peutConsulter(acteur('emp', 'employee', 'c1'), note, [])).toBe(true)
  })

  it('autorise le valideur de la même entreprise', () => {
    expect(peutConsulter(acteur('m1', 'manager', 'c1'), note, ['m1'])).toBe(true)
  })

  it('refuse hors entreprise, même valideur putatif', () => {
    expect(peutConsulter(acteur('m1', 'manager', 'c2'), note, ['m1'])).toBe(false)
  })

  it('refuse le tiers de la même entreprise', () => {
    expect(peutConsulter(acteur('autre', 'employee', 'c1'), note, ['m1'])).toBe(false)
  })
})
