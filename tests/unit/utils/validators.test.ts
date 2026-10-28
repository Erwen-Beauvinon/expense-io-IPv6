import { describe, expect, it } from 'vitest'
import { isNonEmptyString, isValidEmail } from '@/utils/validators'

describe('validators', () => {
  it.each(['demo@expense.io', 'a.b@sub.example.fr'])('accepte %s', (email) => {
    expect(isValidEmail(email)).toBe(true)
  })

  it.each(['', 'demo', 'demo@expense', 'de mo@expense.io'])('refuse "%s"', (email) => {
    expect(isValidEmail(email)).toBe(false)
  })

  it('distingue chaîne vide, blanche et non-chaîne', () => {
    expect(isNonEmptyString('x')).toBe(true)
    expect(isNonEmptyString('   ')).toBe(false)
    expect(isNonEmptyString(42)).toBe(false)
  })
})
