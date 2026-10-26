import path from 'node:path'
import { createWorker } from 'tesseract.js'
import { parseAmount, parseExpenseDate } from '@/lib/lectureTicket'

// Capacité du moteur, pas une règle métier : Tesseract ne lit que des
// images (le gabarit métier de la suggestion vit dans le domaine,
// Justificatif). Garde de l'adaptateur : un type illisible rend {}.
const TYPES_LISIBLES_PAR_LE_MOTEUR = ['image/png', 'image/jpeg', 'image/webp']
const TESSDATA_PATH = path.join(process.cwd(), 'tessdata')

export interface ExpenseNoteSuggestion {
  amount?: number
  expenseDate?: string
}

// Pas de limite de taille de fichier ici : le gabarit (types, taille) est
// une règle du domaine (Justificatif), appliquée par la route et par
// SuggererChamps avant d'appeler le moteur (revue phase/5 §1). La lecture
// du texte (montant, date) est dans src/lib/lectureTicket.ts.
export async function suggestFields(
  receipt: {
    data: Buffer
    mimeType: string
  },
  options: { signal?: AbortSignal } = {}
): Promise<ExpenseNoteSuggestion> {
  if (!TYPES_LISIBLES_PAR_LE_MOTEUR.includes(receipt.mimeType)) {
    return {}
  }
  if (options.signal?.aborted) return {}

  try {
    const worker = await createWorker('fra', undefined, {
      langPath: TESSDATA_PATH,
      cacheMethod: 'none',
    })
    try {
      // Annulation réelle (revue phase/5 §2) : à l'abandon, le worker
      // est terminé au lieu de tourner en tâche de fond après le délai.
      const abandon = new Promise<never>((_, rejeter) => {
        options.signal?.addEventListener('abort', () => rejeter(options.signal?.reason), {
          once: true,
        })
      })
      const {
        data: { text },
      } = await Promise.race([worker.recognize(receipt.data), abandon])
      return { amount: parseAmount(text), expenseDate: parseExpenseDate(text) }
    } finally {
      await worker.terminate()
    }
  } catch (error) {
    // Abandon volontaire : suggestion vide, sans log d'erreur.
    if (options.signal?.aborted) return {}
    console.error('[ocr] Extraction échouée, suggestion vide renvoyée', error)
    return {}
  }
}
