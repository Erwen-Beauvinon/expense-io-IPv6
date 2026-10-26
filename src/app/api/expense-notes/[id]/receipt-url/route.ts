import { servirJustificatif } from '@/app/api/_partage/justificatif'
import { ouvrirEspace, ESPACE_PERSONNEL } from '@/app/api/_partage/espace'
import { auth } from '@/lib/auth'
import { getAnnuaire, getNotes, getStockageRecus } from '@/lib/container'
import { respondError } from '@/lib/errors'

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const acteur = await ouvrirEspace(await auth(), ESPACE_PERSONNEL)
    if (acteur instanceof Response) return acteur
    const { id } = await params

    return await servirJustificatif(acteur, id, {
      notes: getNotes(),
      annuaire: getAnnuaire(),
      stockage: getStockageRecus(),
    })
  } catch (error) {
    return respondError(error)
  }
}
