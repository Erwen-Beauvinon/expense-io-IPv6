import type { Acteur } from '@/domain/Acteur'
import { DateDepense } from '@/domain/DateDepense'
import { Description } from '@/domain/Description'
import { DonneesInvalides } from '@/domain/errors'
import {
  verifierContenantRecu,
  verifierOctetsRecu,
  type TypeRecuAccepte,
} from '@/domain/Justificatif'
import { Montant } from '@/domain/Montant'
import type { NoteAvecAuteur } from '@/domain/NoteAvecAuteur'
import type { ExpenseNoteRepository } from '@/ports/ExpenseNoteRepository'
import type { ReceiptStoragePort } from '@/ports/ReceiptStoragePort'
import { EcritureIncertaine, type UnitOfWork } from '@/ports/UnitOfWork'

// Cas d'usage de soumission d'une note avec son reçu (phase 5) :
// garantit I4 de façon atomique — envoi du reçu d'abord, puis création
// de la note avec sa clé en une seule transaction. Si l'envoi échoue,
// la note n'existe pas ; si la création échoue après l'envoi, le reçu
// est supprimé en compensation (jamais de note sans justificatif).
export interface SoumettreNoteDeps {
  notes: ExpenseNoteRepository
  stockage: ReceiptStoragePort
  unitOfWork: UnitOfWork
}

export interface RecuSoumission {
  data: Buffer
  mimeType: string
  size: number
}

export interface SoumissionBrute {
  montant: unknown
  dateDepense: unknown
  description: unknown
  recu: RecuSoumission | null
}

// Extension de la clé `receipts/{seq}{ext}` : format gelé du contrat
// client (§4), donc règle d'interface et non métier. Typée sur la liste
// fermée du domaine : une clé manquante ne compilerait pas.
const EXTENSION_PAR_TYPE: Record<TypeRecuAccepte, string> = {
  'image/png': '.png',
  'image/jpeg': '.jpg',
  'image/webp': '.webp',
  'application/pdf': '.pdf',
}

export function extensionPour(type: TypeRecuAccepte): string {
  return EXTENSION_PAR_TYPE[type]
}

export async function soumettreNote(
  acteur: Acteur,
  soumission: SoumissionBrute,
  deps: SoumettreNoteDeps
): Promise<NoteAvecAuteur> {
  // Règles de saisie portées par le domaine (I1–I3), dans l'ordre des
  // messages du contrat client §5.
  const montant = Montant.depuis(soumission.montant)
  const dateDepense = DateDepense.depuis(soumission.dateDepense)
  const description = Description.depuis(soumission.description)
  const recu = soumission.recu
  if (!recu) throw new DonneesInvalides('Justificatif manquant')
  const type = verifierContenantRecu(recu)
  // Signature réelle des octets (revue V2, point 8) : refusée avant tout
  // envoi au stockage.
  verifierOctetsRecu(recu)

  // Clé préservée au format gelé (contrat client §4) : la séquence est
  // réservée avant l'envoi ; un trou après échec est sans signification.
  const sequence = await deps.notes.reserverSequence()
  const receiptKey = `receipts/${sequence}${extensionPour(type)}`
  await deps.stockage.upload(receiptKey, recu.data, recu.mimeType)

  try {
    return await deps.unitOfWork.executer(acteur, (tx) =>
      deps.notes.creer(tx, {
        auteurId: acteur.id,
        montant,
        dateDepense,
        description,
        receiptKey,
      })
    )
  } catch (erreur) {
    // Écriture d'issue incertaine (revue phase/5 §6) : la transaction a
    // peut-être abouti malgré l'échec du COMMIT — supprimer le reçu
    // créerait une note sans justificatif (I4). On ne compense pas.
    if (erreur instanceof EcritureIncertaine) {
      console.error('[soumission] écriture incertaine, reçu conservé', {
        receiptKey,
        erreur,
      })
      throw erreur
    }
    try {
      await deps.stockage.supprimer(receiptKey)
    } catch (compensation) {
      console.error('[soumission] reçu orphelin, suppression manuelle requise', { receiptKey, compensation })
    }
    throw erreur
  }
}
