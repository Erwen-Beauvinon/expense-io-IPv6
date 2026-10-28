import { toExpenseNoteView } from '@/lib/serialisation'
import { listerNotesATrancher } from '@/application/ListerNotesATrancher'
import { resolveActeur } from '@/lib/actor'
import { auth } from '@/lib/auth'
import { getNotes } from '@/lib/container'
import { respondError } from '@/lib/errors'

export async function GET() {
  try {
    const session = await auth()
    if (!session?.user || session.user.role !== 'manager') {
      return Response.json({ error: 'Unauthorized' }, { status: 401 })
    }
    const acteur = await resolveActeur(session)
    if (!acteur) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const notes = await listerNotesATrancher(acteur, getNotes())
    return Response.json(notes.map(toExpenseNoteView))
  } catch (error) {
    return respondError(error)
  }
}
