import { describe, expect, it } from 'vitest'
import { DonneesInvalides } from '@/domain/errors'
import {
  LONGUEUR_MAX_MOTIF,
  longueurMotif,
  Motif,
  motifDeRejetRenseigne,
} from '@/domain/Motif'

// Motif de décision (ADR-DOMAIN-002, dérogation ADR-ARCH-003).
describe('Motif.pour', () => {
  it('exige un motif non vide au rejet', () => {
    for (const brut of [null, undefined, '', '   ']) {
      expect(() => Motif.pour('rejected', brut)).toThrow(DonneesInvalides)
      expect(() => Motif.pour('rejected', brut)).toThrow('Motif invalide')
    }
  })

  it('accepte l’absence de motif à l’approbation', () => {
    for (const brut of [null, undefined, '', '   ']) {
      expect(Motif.pour('approved', brut)).toBeNull()
    }
  })

  it('rogne le motif et refuse les non-chaînes', () => {
    expect(Motif.pour('rejected', '  Justificatif illisible  ')?.valeur).toBe('Justificatif illisible')
    expect(Motif.pour('approved', '  ok  ')?.valeur).toBe('ok')
    for (const brut of [42, true, {}, ['x']]) {
      expect(() => Motif.pour('rejected', brut)).toThrow(DonneesInvalides)
      expect(() => Motif.pour('approved', brut)).toThrow(DonneesInvalides)
    }
  })

  it('compte 500 caractères perçus, émojis inclus', () => {
    expect(Motif.pour('rejected', '😀'.repeat(500))?.valeur).toBe('😀'.repeat(500))
    expect(() => Motif.pour('rejected', '😀'.repeat(501))).toThrow(DonneesInvalides)
    expect(() => Motif.pour('rejected', 'x'.repeat(501))).toThrow(DonneesInvalides)
    expect(Motif.pour('rejected', 'x'.repeat(500))?.valeur).toBe('x'.repeat(500))
  })
})

describe('règles partagées avec le front', () => {
  it('un motif d’espaces n’est pas renseigné', () => {
    expect(motifDeRejetRenseigne('   ')).toBe(false)
    expect(motifDeRejetRenseigne(' ok ')).toBe(true)
  })

  it('longueur en points de code ; maxLength du champ (UTF-16) est plus strict', () => {
    expect(LONGUEUR_MAX_MOTIF).toBe(500)
    expect(longueurMotif('😀')).toBe(1)
    // Un émoji occupe 2 unités UTF-16 : `maxLength` du front en compte 2.
    expect('😀'.length).toBe(2)
  })
})
