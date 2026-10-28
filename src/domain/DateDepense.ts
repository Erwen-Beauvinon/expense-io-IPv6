import { DonneesInvalides } from '@/domain/errors'

// Objet valeur DateDépense (I2) : une date calendaire réelle au format
// YYYY-MM-DD. Elle reste une chaîne, jamais un `Date` côté serveur
// (AGENTS.md : parser OID 1082 de src/lib/db.ts). Jamais d'erreur 500
// sur une date invalide : `400 Date invalide`.
export class DateDepense {
  private constructor(private readonly date: string) {}

  get valeur(): string {
    return this.date
  }

  static depuis(brute: unknown): DateDepense {
    if (typeof brute !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(brute)) {
      throw new DonneesInvalides('Date invalide')
    }
    const [annee, mois, jour] = brute.split('-').map(Number)
    const date = new Date(Date.UTC(annee, mois - 1, jour))
    if (
      date.getUTCFullYear() !== annee ||
      date.getUTCMonth() !== mois - 1 ||
      date.getUTCDate() !== jour
    ) {
      throw new DonneesInvalides('Date invalide')
    }
    return new DateDepense(brute)
  }
}
