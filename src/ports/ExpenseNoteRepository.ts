import type { Acteur } from '@/domain/Acteur'
import type { NoteAvecAuteur } from '@/domain/NoteAvecAuteur'
import type { OrdreTri } from '@/domain/OrdreTri'

// Port ExpenseNoteRepository (docs/contrats-ports.md §3) : persister et
// relire les notes, toujours dans le périmètre d'un acteur ou d'une
// entreprise (I9, I10). La lecture manager/RH (peutConsulter) et les
// écritures suivent avec les phases 3 à 5.
export interface ExpenseNoteRepository {
  // Phase 2 : périmètre propriétaire uniquement (l'accès manager/RH
  // arrive en phase 3). null si absente ou hors périmètre. Jamais
  // d'exception pour un cas métier.
  trouverParId(acteur: Acteur, noteId: string): Promise<NoteAvecAuteur | null>

  // Historique personnel : hors de son propre périmètre (appelée avec
  // un auteurId différent), le résultat est vide, sans erreur
  // (revues phase/2 — pas de fuite d'existence inter-employés).
  listerParAuteur(
    acteur: Acteur,
    auteurId: string,
    tri: OrdreTri
  ): Promise<NoteAvecAuteur[]>
}
