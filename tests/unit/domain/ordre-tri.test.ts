import { describe, expect, it } from 'vitest'
import { DonneesInvalides } from '@/domain/errors'
import {
  ORDRE_TRI_DEFAUT,
  parseOrdreTri,
  type OrdreTri,
} from '@/domain/OrdreTri'

describe('OrdreTri (liste fermée, phase 2)', () => {
  it.each([
    'created_at_desc',
    'created_at_asc',
    'expense_date_desc',
    'expense_date_asc',
    'amount_desc',
    'amount_asc',
  ] satisfies OrdreTri[])('accepte %s', (tri) => {
    expect(parseOrdreTri(tri)).toBe(tri)
  })

  it('retourne le défaut sans paramètre (contrat client : créé récent d’abord)', () => {
    expect(parseOrdreTri(null)).toBe(ORDRE_TRI_DEFAUT)
    expect(ORDRE_TRI_DEFAUT).toBe('created_at_desc')
  })

  it('retourne le défaut pour une chaîne vide (ex. `?sort=`, revues phase/2)', () => {
    expect(parseOrdreTri('')).toBe(ORDRE_TRI_DEFAUT)
  })

  it.each(['created_at DESC', 'created_at; DROP TABLE users', 'amount'])(
    'refuse %s en DonneesInvalides (400 côté route)',
    (tri) => {
      expect(() => parseOrdreTri(tri)).toThrow(DonneesInvalides)
    }
  )
})
