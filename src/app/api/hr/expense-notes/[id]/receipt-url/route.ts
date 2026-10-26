import { servirJustificatif } from '@/app/api/_partage/justificatif'
import { auth } from '@/lib/auth'
import { getAnnuaire, getNotes, getStockageRecus } from '@/lib/container'
import { respondError } from '@/lib/errors'

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await auth()
    if (!session?.user || session.user.role !== 'hr_admin') {
      return Response.json({ error: 'Unauthorized' }, { status: 403 })
    }
    const { id } = await params

    return await servirJustificatif(session, id, {
      notes: getNotes(),
      annuaire: getAnnuaire(),
      stockage: getStockageRecus(),
    }, 403)
  } catch (error) {
    return respondError(error)
  }
}
