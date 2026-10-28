import { consulterAnnuaire } from '@/application/ConsulterAnnuaire'
import { ouvrirEspace, ESPACE_RH } from '@/app/api/_partage/espace'
import { auth } from '@/lib/auth'
import { getAnnuaire } from '@/lib/container'
import { respondError } from '@/lib/errors'

export async function GET() {
  try {
    const acteur = await ouvrirEspace(await auth(), ESPACE_RH)
    if (acteur instanceof Response) return acteur

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
