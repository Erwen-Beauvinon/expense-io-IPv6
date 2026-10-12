import { describe, expect, it } from 'vitest'
import { formatCurrency, truncate } from '@/utils/format'

describe('format', () => {
  it('formate un montant en euros, locale fr-FR', () => {
    // Intl insère des espaces insécables : on normalise pour comparer.
    expect(formatCurrency(1234.5).replace(/\s/g, ' ')).toBe('1 234,50 €')
  })

  it('ne tronque pas une chaîne courte', () => {
    expect(truncate('court', 10)).toBe('court')
  })

  it('tronque à la longueur maximale, ellipse comprise', () => {
    const result = truncate('abcdefghijklmnop', 10)
    expect(result).toBe('abcdefghi…')
    expect(result).toHaveLength(10)
  })
})
