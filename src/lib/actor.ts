import type { Session } from 'next-auth'
import type { Acteur } from '@/domain/Acteur'
import { getPool } from '@/lib/db'

export type { Acteur }

export async function resolveActeur(session: Session | null): Promise<Acteur | null> {
  if (!session?.user?.id) return null

  // Le rôle est relu en base à chaque requête : un rôle retiré ne
  // survit pas au jeton (revues phase/1). La table `users` n'a pas
  // de RLS (ADR-DATA-001) : lecture directe, pas besoin d'annuaire.
  const result = await getPool().query<{
    company_id: string
    role: 'employee' | 'manager' | 'hr_admin'
  }>('SELECT company_id, role FROM users WHERE id = $1', [session.user.id])
  const ligne = result.rows[0]
  if (!ligne) return null

  return { id: session.user.id, role: ligne.role, companyId: ligne.company_id }
}
