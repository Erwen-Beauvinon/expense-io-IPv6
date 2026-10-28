import type { Session } from 'next-auth'
import type { Acteur } from '@/domain/Acteur'
import type { UserRole } from '@/domain/Role'
import { resolveActeur } from '@/lib/actor'

// Contrôle d'espace d'URL, commun à toutes les routes API. Il protège un
// espace (`/api/expense-notes`, `/api/manager`, `/api/hr`) avec les codes
// de refus FIGÉS du contrat client (§3) : 401 côté personnel et manager,
// 403 côté RH. C'est une règle d'interface ; qui peut trancher ou
// consulter reste décidé par le domaine (PolitiqueAcces).
export interface Espace {
  role?: UserRole
  statut: 401 | 403
}

export const ESPACE_PERSONNEL: Espace = { statut: 401 }
export const ESPACE_MANAGER: Espace = { role: 'manager', statut: 401 }
export const ESPACE_RH: Espace = { role: 'hr_admin', statut: 403 }

function refus(espace: Espace): Response {
  return Response.json({ error: 'Unauthorized' }, { status: espace.statut })
}

// Session absente ou rôle hors espace : réponse de refus, sinon null.
export function refusEspace(session: Session | null, espace: Espace): Response | null {
  if (!session?.user || (espace.role && session.user.role !== espace.role)) {
    return refus(espace)
  }
  return null
}

// Refus d'espace, puis acteur serveur (rôle et entreprise relus en base,
// jamais depuis la requête). Renvoie l'acteur, ou la réponse de refus.
export async function ouvrirEspace(
  session: Session | null,
  espace: Espace
): Promise<Acteur | Response> {
  const refusSession = refusEspace(session, espace)
  if (refusSession) return refusSession
  const acteur = await resolveActeur(session)
  return acteur ?? refus(espace)
}
