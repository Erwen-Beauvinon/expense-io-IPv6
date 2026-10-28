import { toExpenseNoteView } from '@/lib/serialisation'
import { listerNotesATrancher } from '@/application/ListerNotesATrancher'
import { ouvrirEspace, ESPACE_MANAGER } from '@/app/api/_partage/espace'
import { auth } from '@/lib/auth'
import { getNotes } from '@/lib/container'
import { respondError } from '@/lib/errors'

export async function GET() {
  try {
    const acteur = await ouvrirEspace(await auth(), ESPACE_MANAGER)
    if (acteur instanceof Response) return acteur

    const notes = await listerNotesATrancher(acteur, getNotes())
    return Response.json(notes.map(toExpenseNoteView))
  } catch (error) {
    return respondError(error)
  }
}
