import {
  accederAuJustificatif,
  type AccesJustificatifDeps,
} from '@/application/AccederAuJustificatif'
import type { Acteur } from '@/domain/Acteur'

// Morceau commun aux trois routes receipt-url (revues phase/3). Le
// contrôle d'espace reste dans chaque route (ouvrirEspace, codes 401/403
// figés) ; l'autorisation fine est décidée par le cas d'usage
// (peutConsulter, I9).
export async function servirJustificatif(
  acteur: Acteur,
  noteId: string,
  deps: AccesJustificatifDeps
): Promise<Response> {
  const url = await accederAuJustificatif(acteur, noteId, deps)
  return Response.json({ url })
}
