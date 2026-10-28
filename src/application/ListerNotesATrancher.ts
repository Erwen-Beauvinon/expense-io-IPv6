import type { Acteur } from '@/domain/Acteur'
import type { NoteAvecAuteur } from '@/domain/NoteAvecAuteur'
import type { ExpenseNoteRepository } from '@/ports/ExpenseNoteRepository'

// Cas d'usage unique de liste des notes en attente (phase 4) :
// remplace les 2 requêtes manager/RH. S'appuie sur la même règle
// valideursDe que TrancherNote, via le repository.
export async function listerNotesATrancher(
  acteur: Acteur,
  notes: ExpenseNoteRepository
): Promise<NoteAvecAuteur[]> {
  if (acteur.role !== 'manager' && acteur.role !== 'hr_admin') return []
  return notes.listerEnAttentePour(acteur)
}
