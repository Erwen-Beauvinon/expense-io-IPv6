import type { Acteur } from '@/domain/Acteur'
import type { NoteAvecAuteur } from '@/domain/NoteAvecAuteur'
import { parseOrdreTri } from '@/domain/OrdreTri'
import type { ExpenseNoteRepository } from '@/ports/ExpenseNoteRepository'

// Lecture de l'historique personnel (contrat C01, revues phase/2).
// Le tri est validé ici (OrdreTri fermé) : toute valeur hors liste
// lève DonneesInvalides (400) ; la sérialisation reste à la route.
export async function consulterMesNotes(
  acteur: Acteur,
  triBrut: string | null,
  notes: ExpenseNoteRepository
): Promise<NoteAvecAuteur[]> {
  return notes.listerParAuteur(acteur, acteur.id, parseOrdreTri(triBrut))
}
