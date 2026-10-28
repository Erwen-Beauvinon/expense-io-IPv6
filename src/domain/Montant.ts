import { DonneesInvalides } from '@/domain/errors'

// Capacité de la colonne `numeric(10,2)` (migration 0001) : 8 chiffres
// avant la virgule, 2 après. Le test d'intégration
// tests/integration/montant-capacite.test.ts prouve que la base accepte
// ce plafond — les deux bornes ne peuvent pas diverger sans qu'il échoue.
export const MONTANT_MAX = 99999999.99

// Objet valeur Montant (I1) : un décimal strictement positif, 2 décimales
// au plus, sans arrondi silencieux ('12abc', '12.345', '1e2' refusés).
// Le constructeur privé garantit qu'aucun Montant invalide n'existe ;
// le champ privé rend le type nominal (un objet de même forme ne passe pas).
export class Montant {
  private constructor(private readonly montant: number) {}

  get valeur(): number {
    return this.montant
  }

  static depuis(brut: unknown): Montant {
    if (typeof brut !== 'string') throw new DonneesInvalides('Montant invalide')
    const texte = brut.trim()
    if (!/^\d+(\.\d{1,2})?$/.test(texte)) {
      throw new DonneesInvalides('Montant invalide')
    }
    const montant = Number.parseFloat(texte)
    if (!Number.isFinite(montant) || montant <= 0 || montant > MONTANT_MAX) {
      throw new DonneesInvalides('Montant invalide')
    }
    return new Montant(montant)
  }
}
