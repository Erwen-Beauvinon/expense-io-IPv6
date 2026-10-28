import { DonneesInvalides } from '@/domain/errors'

// Objet valeur Description (I3) : texte non vide, stocké rogné (les
// espaces de bord ne sont pas conservés, tranché en revue phase/5).
export class Description {
  private constructor(private readonly texte: string) {}

  get valeur(): string {
    return this.texte
  }

  static depuis(brute: unknown): Description {
    if (typeof brute !== 'string' || brute.trim().length === 0) {
      throw new DonneesInvalides('Description invalide')
    }
    return new Description(brute.trim())
  }
}
