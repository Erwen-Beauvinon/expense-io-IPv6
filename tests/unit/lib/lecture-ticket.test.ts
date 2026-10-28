import { describe, expect, it } from 'vitest'
import { parseAmount, parseExpenseDate } from '@/lib/lectureTicket'

// Heuristiques de lecture d'un ticket (texte OCR), testées sans moteur
// (backlog #005).
describe('parseAmount', () => {
  it('lit le montant de la ligne « total »', () => {
    expect(parseAmount('Café 2,50\nTOTAL TTC 42,50 €')).toBe(42.5)
  })

  it('préfère la ligne « total » à un nombre plus grand ailleurs', () => {
    expect(parseAmount('Ticket n° 9999,99\nTOTAL 12,30')).toBe(12.3)
  })

  it('comprend les séparateurs de milliers', () => {
    expect(parseAmount('Montant à payer 1 234,56')).toBe(1234.56)
  })

  it('se rabat sur un entier près d’un mot-clé ou d’une devise', () => {
    expect(parseAmount('TOTAL 15 EUR')).toBe(15)
  })

  it('ne devine rien sans indice', () => {
    expect(parseAmount('Merci de votre visite')).toBeUndefined()
  })
})

describe('parseExpenseDate', () => {
  it.each([
    ['Date : 15/01/2026', '2026-01-15'],
    ['2026-01-15 12:04', '2026-01-15'],
    ['le 15.01.26', '2026-01-15'],
    ['15 janvier 2026', '2026-01-15'],
    ['3 février 2026', '2026-02-03'],
  ])('lit « %s »', (texte, attendu) => {
    expect(parseExpenseDate(texte)).toBe(attendu)
  })

  it('ignore une date calendaire impossible', () => {
    expect(parseExpenseDate('31/02/2026')).toBeUndefined()
  })
})
