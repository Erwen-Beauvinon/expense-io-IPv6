import { suggestFields } from '@/lib/ocr'
import type {
  AnalyseurDeRecu,
  SuggestionRecu,
} from '@/ports/AnalyseurDeRecu'

// Adaptateur Tesseract derrière le port AnalyseurDeReçu : reprend le
// comportement actuel (réponse vide en cas d'échec, jamais d'exception
// métier). Un adaptateur IA pourra le remplacer sans toucher au métier.
export class TesseractAnalyseurDeRecu implements AnalyseurDeRecu {
  private analysesEnCours = 0

  // Plafond de concurrence (revue phase/5 §2, F7) : Tesseract monopolise
  // CPU/mémoire — au-delà, réponse vide immédiate plutôt qu'empilement.
  constructor(private readonly maxConcurrents: number = 2) {}

  async analyser(entree: {
    data: Buffer
    mimeType: string
    signal?: AbortSignal
  }): Promise<SuggestionRecu> {
    if (entree.signal?.aborted) return {}
    if (this.analysesEnCours >= this.maxConcurrents) {
      console.error('[ocr] saturation du moteur, suggestion vide renvoyée')
      return {}
    }
    this.analysesEnCours += 1
    try {
      return await suggestFields(entree, { signal: entree.signal })
    } finally {
      this.analysesEnCours -= 1
    }
  }
}
