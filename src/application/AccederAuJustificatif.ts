import type { Acteur } from '@/domain/Acteur'
import { NoteIntrouvable } from '@/domain/errors'
import { peutConsulter } from '@/domain/PolitiqueAcces'
import type { AnnuaireOrganisation } from '@/ports/AnnuaireOrganisation'
import type { ExpenseNoteRepository } from '@/ports/ExpenseNoteRepository'
import type { ReceiptStoragePort } from '@/ports/ReceiptStoragePort'
import { resoudreValidateurs } from '@/application/resoudreValidateurs'

// Cas d'usage unique d'accès au justificatif (phase 3) : remplace les
// 3 routes receipt-url. Il applique la même règle que la consultation
// de la note (peutConsulter, I9) puis demande l'URL signée au port
// ReceiptStorage, qui ne vérifie aucune autorisation lui-même.
export interface AccesJustificatifDeps {
  notes: ExpenseNoteRepository
  annuaire: AnnuaireOrganisation
  stockage: ReceiptStoragePort
}

export async function accederAuJustificatif(
  acteur: Acteur,
  noteId: string,
  deps: AccesJustificatifDeps
): Promise<string> {
  const cible = await deps.notes.trouverParId(acteur, noteId)
  // Absente ou hors entreprise : même réponse, pour ne révéler ni
  // l'existence ni l'appartenance de la note (contrat figé).
  if (!cible) throw new NoteIntrouvable('Not found')

  // La règle est entièrement dans peutConsulter (I9), auteur compris.
  // Optimisation seulement (revues phase/3) : pour l'auteur, les
  // valideurs ne sont pas résolus — peutConsulter n'en a pas besoin.
  const valideurs =
    acteur.id === cible.auteurId
      ? []
      : await resoudreValidateurs(
          acteur,
          {
            id: cible.auteurId,
            role: cible.auteurRole,
            managerId: cible.auteurManagerId,
          },
          deps.annuaire
        )
  if (!peutConsulter(acteur, cible, valideurs)) {
    throw new NoteIntrouvable('Not found')
  }
  return deps.stockage.getSignedUrl(cible.note.toJSON().receiptKey)
}
