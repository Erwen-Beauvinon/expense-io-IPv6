import type { Session } from 'next-auth'
import {
  accederAuJustificatif,
  type AccesJustificatifDeps,
} from '@/application/AccederAuJustificatif'
import { resolveActeur } from '@/lib/actor'

// Morceau commun aux trois routes receipt-url (revues phase/3).
// La porte de rôle reste dans chaque route (codes 401/403 inchangés,
// contrat figé) ; tout le reste — acteur serveur, cas d'usage,
// sérialisation — est factorisé ici.
export async function servirJustificatif(
  session: Session | null,
  noteId: string,
  deps: AccesJustificatifDeps,
  statutSansActeur = 401
): Promise<Response> {
  const acteur = await resolveActeur(session)
  if (!acteur) {
    return Response.json(
      { error: 'Unauthorized' },
      { status: statutSansActeur }
    )
  }
  const url = await accederAuJustificatif(acteur, noteId, deps)
  return Response.json({ url })
}
