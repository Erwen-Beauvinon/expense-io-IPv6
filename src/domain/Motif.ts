import { DonneesInvalides } from '@/domain/errors'
import type { Decision } from '@/domain/NoteTranchee'

// Motif de décision (ADR-DOMAIN-002, dérogation ADR-ARCH-003) :
// obligatoire et non vide au rejet, facultatif à l'approbation,
// 500 caractères au plus, texte brut. Les composants client importent
// les mêmes règles pour le guidage de saisie (ADR-ARCH-001 : components
// → domain permis) ; la base garde ses CHECK en filet (migration 0002).
export const LONGUEUR_MAX_MOTIF = 500

// Longueur en points de code, pas en unités UTF-16 : 500 caractères
// perçus, émojis compris (revues phase/4). L'attribut `maxLength` d'un
// champ HTML compte, lui, en unités UTF-16 : le front est donc plus
// strict que cette règle, jamais plus permissif (écart documenté).
export function longueurMotif(texte: string): number {
  return [...texte].length
}

// Guidage de saisie du rejet : un motif fait d'espaces ne compte pas.
export function motifDeRejetRenseigne(saisie: string): boolean {
  return saisie.trim().length > 0
}

export class Motif {
  private constructor(private readonly texte: string) {}

  get valeur(): string {
    return this.texte
  }

  // null = pas de motif (permis à l'approbation uniquement).
  static pour(decision: Decision, brut: unknown): Motif | null {
    if (brut === null || brut === undefined || brut === '') {
      if (decision === 'rejected') throw new DonneesInvalides('Motif invalide')
      return null
    }
    if (typeof brut !== 'string') throw new DonneesInvalides('Motif invalide')
    const texte = brut.trim()
    if (texte.length === 0) {
      if (decision === 'rejected') throw new DonneesInvalides('Motif invalide')
      return null
    }
    if (longueurMotif(texte) > LONGUEUR_MAX_MOTIF) {
      throw new DonneesInvalides('Motif invalide')
    }
    return new Motif(texte)
  }
}
