import { rattacherAuManager } from '@/application/RattacherAuManager'
import { DonneesInvalides } from '@/domain/errors'
import { ouvrirEspace, ESPACE_RH } from '@/app/api/_partage/espace'
import { auth } from '@/lib/auth'
import { getAnnuaire, getUnitOfWork } from '@/lib/container'
import { respondError } from '@/lib/errors'

export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const acteur = await ouvrirEspace(await auth(), ESPACE_RH)
    if (acteur instanceof Response) return acteur
    const { id } = await params

    // Phase 6 (revue §2) : un corps illisible est refusé en 400 —
    // il n'efface plus le rattachement (audit A). La clé `managerId`
    // doit être EXPLICITEMENT présente : `{}` ou une clé mal
    // orthographiée (`manager_id`) ne détache plus silencieusement.
    // Seul un `null` volontaire détache. La validation métier vit
    // dans le cas d'usage.
    let body: unknown
    try {
      body = await request.json()
    } catch {
      throw new DonneesInvalides('Corps invalide')
    }
    if (typeof body !== 'object' || body === null || !('managerId' in body)) {
      throw new DonneesInvalides('Corps invalide')
    }
    const managerId = (body as { managerId?: unknown }).managerId ?? null

    const utilisateur = await rattacherAuManager(acteur, id, managerId, {
      annuaire: getAnnuaire(),
      unitOfWork: getUnitOfWork(),
    })
    return Response.json({
      id: utilisateur.id,
      name: utilisateur.name,
      email: utilisateur.email,
      role: utilisateur.role,
      managerId: utilisateur.managerId,
    })
  } catch (error) {
    return respondError(error)
  }
}
