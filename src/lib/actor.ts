import type { Session } from 'next-auth'
import { getPool } from '@/lib/db'

// Acteur serveur (docs/contrats-ports.md §1.2) : identité + rôle +
// entreprise, construits côté serveur depuis la session. Jamais depuis
// le corps d'une requête.
export interface Acteur {
  id: string
  role: 'employee' | 'manager' | 'hr_admin'
  companyId: string
}

export async function resolveActeur(session: Session | null): Promise<Acteur | null> {
  if (!session?.user?.id || !session.user.role) return null

  const result = await getPool().query<{ company_id: string }>(
    'SELECT company_id FROM users WHERE id = $1',
    [session.user.id]
  )
  const companyId = result.rows[0]?.company_id
  if (!companyId) return null

  return { id: session.user.id, role: session.user.role, companyId }
}
