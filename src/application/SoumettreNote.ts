import type { Acteur } from '@/domain/Acteur'
import { DonneesInvalides } from '@/domain/errors'
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

// Borne « contenant » (revue phase/5 §1, F7) : type et taille déclarés,
// vérifiables SANS lire les octets. Les routes l'appellent sur
// `receipt.size`/`receipt.type` AVANT `arrayBuffer()` : un fichier de
// plusieurs centaines de Mo est refusé sans être chargé en mémoire.
// Le cas d'usage la réapplique par défense en profondeur.
export function validerContenantRecu(contenant: {
  mimeType: string
  size: number
}): void {
  if (!TYPES_RECUS_ACCEPTES.includes(contenant.mimeType)) {
    throw new DonneesInvalides('Type de fichier non autorisé pour le reçu')
  }
  if (contenant.size > TAILLE_MAX_RECU) {
    throw new DonneesInvalides('Fichier trop volumineux')
  }
}

export interface SoumissionBrute {
  montant: unknown
  dateDepense: unknown
  description: unknown
  recu: RecuSoumission | null
}

export const TYPES_RECUS_ACCEPTES = ['image/png', 'image/jpeg', 'image/webp', 'application/pdf']
export const TAILLE_MAX_RECU = 10 * 1024 * 1024
export const MONTANT_MAX = 99999999.99

const EXTENSION_PAR_MIME: Record<string, string> = {
  'image/png': '.png',
  'image/jpeg': '.jpg',
  'image/webp': '.webp',
  'application/pdf': '.pdf',
}

// Objet métier Montant (I1) : refuse tout ce qui n'est pas un décimal
// strictement positif à 2 décimales maximum, dans la capacité de
// numeric(10,2). '12abc' est refusé, jamais tronqué.
export function validerMontant(brut: unknown): number {
  if (typeof brut !== 'string') throw new DonneesInvalides('Montant invalide')
  const texte = brut.trim()
  if (!/^\d+(\.\d{1,2})?$/.test(texte)) {
    throw new DonneesInvalides('Montant invalide')
  }
  const montant = Number.parseFloat(texte)
  if (!Number.isFinite(montant) || montant <= 0 || montant > MONTANT_MAX) {
    throw new DonneesInvalides('Montant invalide')
  }
  return montant
}

// Objet métier DateDépense (I2) : date calendaire réelle au format
// YYYY-MM-DD. Jamais d'erreur 500 sur une date invalide.
export function validerDateDepense(brute: unknown): string {
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
  return brute
}

// Extension dérivée du seul type MIME validé (revue phase/5 §7) :
// la branche de repli sur le nom de fichier était inatteignable (le
// type est déjà validé) et le nom est contrôlé par le client.
export function extensionPour(mimeType: string): string {
  return EXTENSION_PAR_MIME[mimeType] ?? ''
}

export async function soumettreNote(
  acteur: Acteur,
  soumission: SoumissionBrute,
  deps: SoumettreNoteDeps
): Promise<NoteAvecAuteur> {
  const montant = validerMontant(soumission.montant)
  const dateDepense = validerDateDepense(soumission.dateDepense)
  if (typeof soumission.description !== 'string' || soumission.description.trim().length === 0) {
    throw new DonneesInvalides('Description invalide')
  }
  const description = soumission.description.trim()
  const recu = soumission.recu
  if (!recu) throw new DonneesInvalides('Justificatif manquant')
  validerContenantRecu(recu)

  // Clé préservée au format gelé (contrat client §4) : la séquence est
  // réservée avant l'envoi ; un trou après échec est sans signification.
  const sequence = await deps.notes.reserverSequence()
  const receiptKey = `receipts/${sequence}${extensionPour(recu.mimeType)}`
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
