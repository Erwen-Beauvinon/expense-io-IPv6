import { rattacherAuManager } from '@/application/RattacherAuManager'
import { DonneesInvalides } from '@/domain/errors'
import { resolveActeur } from '@/lib/actor'
import { auth } from '@/lib/auth'
import { getAnnuaire, getUnitOfWork } from '@/lib/container'
import { respondError } from '@/lib/errors'

export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
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
