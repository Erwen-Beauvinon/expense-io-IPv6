import { describe, expect, it } from 'vitest'
import { DateDepense } from '@/domain/DateDepense'
import { Description } from '@/domain/Description'
import { DonneesInvalides } from '@/domain/errors'
import {
  horsGabaritSuggestion,
  TAILLE_MAX_RECU,
  TAILLE_MAX_SUGGESTION,
  verifierContenantRecu,
  verifierOctetsRecu,
} from '@/domain/Justificatif'
import { Montant, MONTANT_MAX } from '@/domain/Montant'

// Règles de saisie d'une note (I1–I3), testées sans infrastructure.
describe('Montant (I1)', () => {
  it.each([
    ['12.50', 12.5],
    ['12', 12],
    ['0.01', 0.01],
    [' 7 ', 7],
    ['99999999.99', MONTANT_MAX],
  ])('accepte %s', (brut, attendu) => {
    expect(Montant.depuis(brut).valeur).toBe(attendu)
  })

  it.each(['12abc', '-5', '0', '', '12.345', '.5', '1e2', 'abc', '100000000', NaN, null, undefined, 12.5])(
    'refuse %s sans tronquer ni arrondir',
    (brut) => {
      expect(() => Montant.depuis(brut)).toThrow(DonneesInvalides)
      expect(() => Montant.depuis(brut)).toThrow('Montant invalide')
    }
  )
})

describe('DateDepense (I2)', () => {
  it.each(['2026-10-01', '2024-02-29'])('accepte %s et la garde en chaîne', (brute) => {
    expect(DateDepense.depuis(brute).valeur).toBe(brute)
  })

  it.each(['30/01/2026', '2026-02-30', '2026-13-01', '', '2026-1-1', null])('refuse %s', (brute) => {
    expect(() => DateDepense.depuis(brute)).toThrow('Date invalide')
  })
})

describe('Description (I3)', () => {
  it('rogne les espaces de bord', () => {
    expect(Description.depuis('  Taxi  ').valeur).toBe('Taxi')
  })

  it.each(['', '   ', null, 42])('refuse %s', (brute) => {
    expect(() => Description.depuis(brute)).toThrow('Description invalide')
  })
})

describe('Justificatif (I3)', () => {
  it.each(['image/png', 'image/jpeg', 'image/webp', 'application/pdf'])('accepte %s', (mimeType) => {
    expect(verifierContenantRecu({ mimeType, size: 3 })).toBe(mimeType)
  })

  it('refuse un type hors liste, sans lire les octets', () => {
    expect(() => verifierContenantRecu({ mimeType: 'text/plain', size: 3 })).toThrow(
      'Type de fichier non autorisé pour le reçu'
    )
  })

  it('refuse au-delà de 10 Mio, accepte 10 Mio pile', () => {
    expect(() => verifierContenantRecu({ mimeType: 'image/png', size: TAILLE_MAX_RECU + 1 })).toThrow(
      'Fichier trop volumineux'
    )
    expect(verifierContenantRecu({ mimeType: 'image/png', size: TAILLE_MAX_RECU })).toBe('image/png')
  })
})

describe('signature réelle des octets (revue V2, point 8)', () => {
  const PNG = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
  const WEBP = Uint8Array.from([...'RIFF'].map((c) => c.charCodeAt(0)).concat([0, 0, 0, 0], [...'WEBP'].map((c) => c.charCodeAt(0))))

  it.each([
    ['image/png', PNG],
    ['image/jpeg', Uint8Array.from([0xff, 0xd8, 0xff, 0xe0])],
    ['image/webp', WEBP],
    ['application/pdf', Uint8Array.from([...'%PDF-1.7'].map((c) => c.charCodeAt(0)))],
  ])('accepte un %s authentique', (mimeType, data) => {
    expect(() => verifierOctetsRecu({ mimeType, data })).not.toThrow()
  })

  it('refuse des octets qui ne correspondent pas au type déclaré', () => {
    const html = Uint8Array.from([...'<html>'].map((c) => c.charCodeAt(0)))
    expect(() => verifierOctetsRecu({ mimeType: 'image/png', data: html })).toThrow(
      'Type de fichier non autorisé pour le reçu'
    )
    expect(() => verifierOctetsRecu({ mimeType: 'application/pdf', data: PNG })).toThrow(DonneesInvalides)
  })

  it('refuse un contenu tronqué et un type hors liste', () => {
    expect(() => verifierOctetsRecu({ mimeType: 'image/png', data: PNG.subarray(0, 4) })).toThrow(DonneesInvalides)
    expect(() => verifierOctetsRecu({ mimeType: 'text/plain', data: PNG })).toThrow(DonneesInvalides)
  })
})

describe('gabarit de suggestion OCR (distinct de la soumission)', () => {
  it('exclut le PDF, accepté à la soumission', () => {
    expect(horsGabaritSuggestion({ mimeType: 'application/pdf', size: 3 })).toBe(true)
    expect(horsGabaritSuggestion({ mimeType: 'image/png', size: 3 })).toBe(false)
  })

  it('aligne sa taille maximale sur celle du reçu', () => {
    expect(TAILLE_MAX_SUGGESTION).toBe(TAILLE_MAX_RECU)
    expect(horsGabaritSuggestion({ mimeType: 'image/png', size: TAILLE_MAX_SUGGESTION + 1 })).toBe(true)
  })
})
