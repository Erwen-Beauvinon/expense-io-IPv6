import type {
  AnalyseurDeRecu,
  SuggestionRecu,
} from '@/ports/AnalyseurDeRecu'
import { validerOctetsRecu } from '@/application/SoumettreNote'

// Cas d'usage de suggestion du montant et de la date par OCR
// (phase 5) : porte les limites (taille, types acceptés) comme règles
// explicites. Le moteur reste remplaçable derrière le port
// AnalyseurDeReçu (adaptateur IA possible sans toucher au métier).
export interface SuggererChampsDeps {
  analyseur: AnalyseurDeRecu
}

export const SUGGESTION_MIME_TYPES = ['image/png', 'image/jpeg', 'image/webp']
export const TAILLE_MAX_SUGGESTION = 10 * 1024 * 1024
export const DELAI_SUGGESTION_MS = 15000

// Gabarit vérifiable sur les métadonnées (revue phase/5 §1) : la route
// le teste AVANT de lire les octets ; le cas d'usage le réapplique.
export function contenantHorsGabarit(contenant: {
  mimeType: string
  size: number
}): boolean {
  return (
    !SUGGESTION_MIME_TYPES.includes(contenant.mimeType) ||
    contenant.size > TAILLE_MAX_SUGGESTION
  )
}

export async function suggererChamps(
  entree: { data: Buffer; mimeType: string; size: number },
  deps: SuggererChampsDeps,
  delaiMs: number = DELAI_SUGGESTION_MS
): Promise<SuggestionRecu> {
  // Hors gabarit : réponse vide, comme pour un reçu illisible
  // (contrat client C03 : {} est une réponse valide).
  if (contenantHorsGabarit(entree)) return {}
  // Octets incohérents avec le type déclaré (revue V2, point 8) :
  // même réponse vide, rien n'est transmis au moteur OCR.
  try {
    validerOctetsRecu(entree)
  } catch {
    return {}
  }
  // Annulation réelle (revue phase/5 §2, F7) : au délai, le signal
  // demande au moteur de terminer son travail (worker Tesseract tué)
  // au lieu de le laisser tourner en tâche de fond. La course borne
  // en plus le délai client même pour un moteur non coopératif.
  const controleur = new AbortController()
  const minuteur = setTimeout(() => controleur.abort(), delaiMs)
  const abandon = new Promise<never>((_, rejeter) => {
    controleur.signal.addEventListener('abort', () => rejeter(new Error('Analyse expirée')), {
      once: true,
    })
  })
  try {
    return await Promise.race([
      deps.analyseur.analyser({
        data: entree.data,
        mimeType: entree.mimeType,
        signal: controleur.signal,
      }),
      abandon,
    ])
  } catch (erreur) {
    console.error('[suggestion] analyse indisponible, suggestion vide', erreur)
    return {}
  } finally {
    clearTimeout(minuteur)
  }
}
