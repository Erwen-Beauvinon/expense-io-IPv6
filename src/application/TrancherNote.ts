import type { Acteur } from '@/domain/Acteur'
import {
  DejaTranchee,
  DonneesInvalides,
  NoteIntrouvable,
} from '@/domain/errors'
import type { NoteAvecAuteur } from '@/domain/NoteAvecAuteur'
import type { Decision } from '@/domain/NoteTranchee'
import type { AnnuaireOrganisation } from '@/ports/AnnuaireOrganisation'
import type { ExpenseNoteRepository } from '@/ports/ExpenseNoteRepository'
import type { NotificationPort } from '@/ports/NotificationPort'
import { resoudreValidateurs } from '@/application/resoudreValidateurs'

// Cas d'usage unique de décision (phase 4) : remplace les 4 routes
// approve/reject. S'appuie sur la machine à états du domaine (I5) et
// la règle valideursDe (I7, I8, ADR-ARCH-002). Transition atomique :
// la mise à jour ne s'applique qu'à une note encore pending, sinon
// DéjàTranchée → 409.
export interface TrancherNoteDeps {
  notes: ExpenseNoteRepository
  annuaire: AnnuaireOrganisation
  notificateur: NotificationPort
}

// Motif : obligatoire et non vide au rejet (ADR-DOMAIN-002 accepted,
// dérogation contrat client ADR-ARCH-003), facultatif à l'approbation,
// 500 caractères maximum, texte brut dans les deux cas.
export function validerMotif(decision: Decision, reason: unknown): string | null {
  if (reason === null || reason === undefined || reason === '') {
    if (decision === 'rejected') throw new DonneesInvalides('Motif invalide')
    return null
  }
  if (typeof reason !== 'string') throw new DonneesInvalides('Motif invalide')
  const motif = reason.trim()
  if (motif.length === 0) {
    if (decision === 'rejected') throw new DonneesInvalides('Motif invalide')
    return null
  }
  // Longueur en points de code (pas en unités UTF-16) : 500 caractères
  // perçus, y compris avec des émojis (revues phase/4).
  if ([...motif].length > 500) throw new DonneesInvalides('Motif invalide')
  return motif
}

export async function trancherNote(
  acteur: Acteur,
  noteId: string,
  decision: Decision,
  reason: unknown,
  deps: TrancherNoteDeps
): Promise<NoteAvecAuteur> {
  // Seuls manager et RH tranchent ; tout autre rôle reçoit la même
  // réponse qu'une note inexistante (pas de fuite d'existence).
  if (acteur.role !== 'manager' && acteur.role !== 'hr_admin') {
    throw new NoteIntrouvable('Not found')
  }
  const cible = await deps.notes.trouverParId(acteur, noteId)
  if (!cible) throw new NoteIntrouvable('Not found')

  // Autorisation AVANT l'état (tableau ligne 4 + ADR-ARCH-002 §3) : un
  // acteur non valideur reçoit 404 même si le motif est invalide —
  // jamais de fuite par un 400 (revues phase/4).
  const valideurs = await resoudreValidateurs(
    acteur,
    {
      id: cible.auteurId,
      role: cible.auteurRole,
      managerId: cible.auteurManagerId,
    },
    deps.annuaire
  )
  if (!valideurs.includes(acteur.id)) throw new NoteIntrouvable('Not found')

  const motif = validerMotif(decision, reason)
  const appliquee = await deps.notes.trancherSiEnAttente(
    acteur,
    noteId,
    decision,
    motif
  )
  // L'écriture conditionnelle a perdu la course : une seule décision
  // gagne (I6). Rien n'est écrit, pas même le motif.
  if (!appliquee) throw new DejaTranchee('Already decided')

  // Notification après commit : son échec ne fait jamais échouer la
  // décision persistée (contrats-ports §9). decidedAt applicatif
  // (affichage) ; la colonne fait foi avec now() SQL.
  try {
    await deps.notificateur.notifierDecision({
      noteId,
      auteurId: cible.auteurId,
      decision,
      decidedBy: acteur.id,
      decidedAt: new Date(),
      motif,
    })
  } catch (erreur) {
    console.error('[notification] échec d’envoi après décision', erreur)
  }

  const relue = await deps.notes.trouverParId(acteur, noteId)
  if (!relue) throw new NoteIntrouvable('Not found')
  return relue
}
