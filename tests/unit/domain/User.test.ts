import { describe, expect, it } from 'vitest'
import { User, type UserRole } from '@/domain/User'

function user(id: string, role: UserRole, managerId: string | null = null): User {
  return new User({ id, email: `${id}@expense.io`, name: id, role, managerId })
}

describe('User', () => {
  it('reconnaît un manager racine (sans manager)', () => {
    expect(user('m', 'manager').isRootManager()).toBe(true)
  })

  it('ne considère pas un manager rattaché comme racine', () => {
    expect(user('m', 'manager', 'boss').isRootManager()).toBe(false)
  })

  it.each<UserRole>(['employee', 'hr_admin'])('%s n’est jamais manager racine', (role) => {
    expect(user('x', role).isRootManager()).toBe(false)
  })

  it('un manager gère ses rattachés directs', () => {
    expect(user('m', 'manager').canManage(user('e', 'employee', 'm'))).toBe(true)
  })

  it('un manager ne gère pas les rattachés d’un autre', () => {
    expect(user('m', 'manager').canManage(user('e', 'employee', 'other'))).toBe(false)
  })

  it('un non-manager ne gère personne, même s’il est référencé', () => {
    expect(user('h', 'hr_admin').canManage(user('e', 'employee', 'h'))).toBe(false)
  })
})
