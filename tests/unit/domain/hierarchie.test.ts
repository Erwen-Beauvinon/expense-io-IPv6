import { describe, expect, it } from 'vitest'
import { ManagerIneligible, UtilisateurIntrouvable } from '@/domain/errors'
import {
  creeraitUnCycle,
  estRattachable,
  peutEtreDesigneManagerDe,
  verifierCibleRattachable,
  verifierManagerEligible,
  verifierPasAutoRattachement,
} from '@/domain/Hierarchie'

// Règles de l'organigramme (I11–I13), sans annuaire ni transaction.
const employe = { id: 'e1', role: 'employee' as const, companyId: 'c1' }
const manager = { id: 'm1', role: 'manager' as const, companyId: 'c1' }

describe('cibles rattachables', () => {
  it('employés et managers, jamais un RH', () => {
    expect(estRattachable('employee')).toBe(true)
    expect(estRattachable('manager')).toBe(true)
    expect(estRattachable('hr_admin')).toBe(false)
  })

  it('cible absente ou RH : introuvable (404)', () => {
    expect(() => verifierCibleRattachable(null)).toThrow(UtilisateurIntrouvable)
    expect(() => verifierCibleRattachable({ id: 'h', role: 'hr_admin', companyId: 'c1' })).toThrow(
      UtilisateurIntrouvable
    )
    expect(() => verifierCibleRattachable(employe)).not.toThrow()
  })
})

describe('manager éligible (I11, I13)', () => {
  it('personne n’est son propre manager', () => {
    expect(() => verifierPasAutoRattachement('m1', 'm1')).toThrow(ManagerIneligible)
    expect(() => verifierPasAutoRattachement('e1', 'm1')).not.toThrow()
  })

  it('exige le rôle manager et la même entreprise', () => {
    expect(() => verifierManagerEligible(employe, manager)).not.toThrow()
    expect(() => verifierManagerEligible(employe, null)).toThrow('Invalid manager')
    expect(() => verifierManagerEligible(employe, { ...manager, role: 'employee' })).toThrow(ManagerIneligible)
    expect(() => verifierManagerEligible(employe, { ...manager, companyId: 'c2' })).toThrow(ManagerIneligible)
  })

  it('guidage de la console RH : managers, sauf soi-même', () => {
    expect(peutEtreDesigneManagerDe(manager, 'e1')).toBe(true)
    expect(peutEtreDesigneManagerDe(manager, 'm1')).toBe(false)
    expect(peutEtreDesigneManagerDe({ id: 'e2', role: 'employee' }, 'e1')).toBe(false)
  })
})

describe('hiérarchie sans cycle (I12)', () => {
  it('refuse si le collaborateur est déjà dans la chaîne (direct ou transitif)', () => {
    expect(creeraitUnCycle({ ids: ['a'], boucle: false }, 'a')).toBe(true)
    expect(creeraitUnCycle({ ids: ['b', 'c', 'a'], boucle: false }, 'a')).toBe(true)
  })

  it('accepte une chaîne légitime profonde', () => {
    expect(creeraitUnCycle({ ids: ['b', 'c', 'd', 'e'], boucle: false }, 'a')).toBe(false)
  })

  it('refuse par prudence une chaîne déjà bouclée', () => {
    expect(creeraitUnCycle({ ids: ['b', 'c'], boucle: true }, 'a')).toBe(true)
  })
})
