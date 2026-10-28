// Port AnalyseurDeReçu (docs/contrats-ports.md §8) : suggère montant
// et date depuis un justificatif, derrière une interface remplaçable
// (Tesseract aujourd'hui, moteur IA demain), sans toucher au métier.
export interface SuggestionRecu {
  amount?: number
  expenseDate?: string
}

export interface AnalyseurDeRecu {
  // Jamais d'exception pour un reçu illisible ou non pris en charge :
  // renvoyer {} dans ce cas. Exception réservée à la panne du moteur.
  // Le signal d'annulation DOIT être honoré (revue phase/5 §2, F7) : un
  // moteur qui l'ignore laisse son travail tourner après le délai. Un
  // abandon rend {} comme un reçu illisible.
  analyser(entree: {
    data: Buffer
    mimeType: string
    signal?: AbortSignal
  }): Promise<SuggestionRecu>
}
