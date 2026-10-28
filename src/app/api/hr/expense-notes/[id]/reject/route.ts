import { lireRaison, toExpenseNoteView } from '@/lib/serialisation'
import { trancherNote } from '@/application/TrancherNote'
import { ouvrirEspace, ESPACE_RH } from '@/app/api/_partage/espace'
import { auth } from '@/lib/auth'
import { getAnnuaire, getNotes, getNotificateur } from '@/lib/container'
import { respondError } from '@/lib/errors'

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const acteur = await ouvrirEspace(await auth(), ESPACE_RH)
    if (acteur instanceof Response) return acteur
    const { id } = await params
    // Motif obligatoire au rejet (ADR-DOMAIN-002, dérogation
    // ADR-ARCH-003) : absent ou invalide → 400, rien n'est écrit.
    const reason = await lireRaison(request)

    const cible = await trancherNote(acteur, id, 'rejected', reason ?? null, {
      notes: getNotes(),
      annuaire: getAnnuaire(),
      notificateur: getNotificateur(),
    })
    return Response.json(toExpenseNoteView(cible))
  } catch (error) {
    return respondError(error)
  }
}
