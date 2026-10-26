import { servirJustificatif } from '@/app/api/_partage/justificatif'
import { auth } from '@/lib/auth'
import { getAnnuaire, getNotes, getStockageRecus } from '@/lib/container'
import { respondError } from '@/lib/errors'

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await auth()
    if (!session?.user || session.user.role !== 'manager') {
      return Response.json({ error: 'Unauthorized' }, { status: 401 })
    }
    const { id } = await params

    // Phase 3 : la vérification « note de mon équipe » n'est plus
    // supposée — le cas d'usage l'applique (peutConsulter, I9).
    return await servirJustificatif(session, id, {
      notes: getNotes(),
      annuaire: getAnnuaire(),
      stockage: getStockageRecus(),
    })
  } catch (error) {
    return respondError(error)
  }
}
