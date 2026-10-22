import type { UtilisateurAnnuaire } from '@/domain/UtilisateurAnnuaire'
import { getPool } from '@/lib/db'
import type { AnnuaireOrganisation } from '@/ports/AnnuaireOrganisation'

// Ligne SQL brute lue dans `users`.
interface LigneUtilisateur {
  id: string
  company_id: string
  role: 'employee' | 'manager' | 'hr_admin'
  manager_id: string | null
  name: string
  email: string
}

// Projection unique ligne → vue annuaire (revues phase/3) : un seul
// endroit à tenir à jour quand la vue évolue.
function versUtilisateur(ligne: LigneUtilisateur): UtilisateurAnnuaire {
  return {
    id: ligne.id,
    companyId: ligne.company_id,
    role: ligne.role,
    managerId: ligne.manager_id,
    name: ligne.name,
    email: ligne.email,
  }
}

// Lectures bornées à l'entreprise en WHERE : la table `users` n'a pas
// de RLS (ADR-DATA-001), donc aucune lecture ne s'en passe.
export class PgAnnuaireOrganisation implements AnnuaireOrganisation {
  async trouverUtilisateur(
    companyId: string,
    userId: string
  ): Promise<UtilisateurAnnuaire | null> {
    const result = await getPool().query<LigneUtilisateur>(
      'SELECT id, company_id, role, manager_id, name, email FROM users WHERE id = $1 AND company_id = $2',
      [userId, companyId]
    )
    const ligne = result.rows[0]
    if (!ligne) return null
    return versUtilisateur(ligne)
  }

  async listerRh(companyId: string): Promise<UtilisateurAnnuaire[]> {
    const result = await getPool().query<LigneUtilisateur>(
      `SELECT id, company_id, role, manager_id, name, email FROM users
       WHERE company_id = $1 AND role = 'hr_admin'
       ORDER BY name`,
      [companyId]
    )
    return result.rows.map(versUtilisateur)
  }
}
