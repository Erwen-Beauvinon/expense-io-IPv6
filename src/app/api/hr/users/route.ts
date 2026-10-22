import { consulterAnnuaire } from '@/application/ConsulterAnnuaire'
import { resolveActeur } from '@/lib/actor'
import { auth } from '@/lib/auth'
import { getAnnuaire } from '@/lib/container'
import { respondError } from '@/lib/errors'

export async function GET() {
  try {
    const session = await auth()
    if (!session?.user || session.user.role !== 'hr_admin') {
      return Response.json({ error: 'Unauthorized' }, { status: 403 })
    }
    const acteur = await resolveActeur(session)
    if (!acteur) {
      return Response.json({ error: 'Unauthorized' }, { status: 403 })
    }

    const utilisateurs = await consulterAnnuaire(acteur, getAnnuaire())
    return Response.json(
      utilisateurs.map((utilisateur) => ({
        id: utilisateur.id,
        name: utilisateur.name,
        email: utilisateur.email,
        role: utilisateur.role,
        managerId: utilisateur.managerId,
      }))
    )
  } catch (error) {
    return respondError(error)
  }
}
