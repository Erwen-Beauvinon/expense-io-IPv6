import { lireRaison, toExpenseNoteView } from '@/lib/serialisation'
import { trancherNote } from '@/application/TrancherNote'
import { resolveActeur } from '@/lib/actor'
import { auth } from '@/lib/auth'
import { getAnnuaire, getNotes, getNotificateur } from '@/lib/container'
import { respondError } from '@/lib/errors'

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await auth()
    if (!session?.user || session.user.role !== 'hr_admin') {
      return Response.json({ error: 'Unauthorized' }, { status: 403 })
    }
    const acteur = await resolveActeur(session)
    if (!acteur) {
      return Response.json({ error: 'Unauthorized' }, { status: 403 })
    }
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
