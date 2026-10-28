import { describe, expect, it } from 'vitest'
import { isNonEmptyString, isPositiveAmount, isValidEmail } from '@/utils/validators'

describe('validators', () => {
  it.each(['demo@expense.io', 'a.b@sub.example.fr'])('accepte %s', (email) => {
    expect(isValidEmail(email)).toBe(true)
  })

  it.each(['', 'demo', 'demo@expense', 'de mo@expense.io'])('refuse "%s"', (email) => {
    expect(isValidEmail(email)).toBe(false)
  })

  it.each([0.01, 1, 999.99])('montant positif %s', (amount) => {
    expect(isPositiveAmount(amount)).toBe(true)
  })

  it.each([0, -1, Number.NaN, Number.POSITIVE_INFINITY])('montant invalide %s', (amount) => {
    expect(isPositiveAmount(amount)).toBe(false)
  })

  it('distingue chaîne vide, blanche et non-chaîne', () => {
    expect(isNonEmptyString('x')).toBe(true)
    expect(isNonEmptyString('   ')).toBe(false)
    expect(isNonEmptyString(42)).toBe(false)
  })
})
