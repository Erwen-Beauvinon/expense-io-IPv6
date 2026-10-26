import type { Transaction } from '@/domain/Transaction'
import type { UtilisateurAnnuaire } from '@/domain/UtilisateurAnnuaire'
import { getPool } from '@/lib/db'
import type { AnnuaireOrganisation } from '@/ports/AnnuaireOrganisation'
import { clientDe } from './PgUnitOfWork'

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
    userId: string,
    tx?: Transaction
  ): Promise<UtilisateurAnnuaire | null> {
    // Revue phase/6 §1 : avec tx, la lecture participe à la transaction
    // du cas d'usage (même snapshot, même connexion) au lieu d'ouvrir
    // sa propre transaction.
    const client = tx ? clientDe(tx) : getPool()
    const result = await client.query<LigneUtilisateur>(
      'SELECT id, company_id, role, manager_id, name, email FROM users WHERE id = $1 AND company_id = $2',
      [userId, companyId]
    )
    const ligne = result.rows[0]
    if (!ligne) return null
    return versUtilisateur(ligne)
  }

  async verrouillerRattachements(
    tx: Transaction,
    companyId: string
  ): Promise<void> {
    // Sérialise les rattachements d'une entreprise (revue phase/6 §1,
    // I12) : verrou consultatif transactionnel — libéré au commit ou
    // au rollback, jamais de verrou oublié.
    await clientDe(tx).query(
      'SELECT pg_advisory_xact_lock(2147483647, hashtext($1))',
      [`rattacher:${companyId}`]
    )
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

  async listerCollaborateurs(companyId: string): Promise<UtilisateurAnnuaire[]> {
    // Phase 6 : annuaire des collaborateurs gérés (employés + managers),
    // à l'identique de l'ancienne route (WHERE role IN ... de main) :
    // les comptes RH n'y figurent pas (C08 gelé à 2 utilisateurs en
    // démo). Lecture bornée à l'entreprise, sans jointure Notes.
    const result = await getPool().query<{
      id: string
      company_id: string
      role: 'employee' | 'manager' | 'hr_admin'
      manager_id: string | null
      name: string
      email: string
    }>(
      `SELECT id, company_id, role, manager_id, name, email FROM users
       WHERE company_id = $1 AND role IN ('employee', 'manager')
       ORDER BY name`,
      [companyId]
    )
    return result.rows.map((ligne) => ({
      id: ligne.id,
      companyId: ligne.company_id,
      role: ligne.role,
      managerId: ligne.manager_id,
      name: ligne.name,
      email: ligne.email,
    }))
  }

  async rattacher(
    tx: Transaction,
    companyId: string,
    userId: string,
    managerId: string | null
  ): Promise<void> {
    // Phase 6 : écriture bornée à l'entreprise, dans la transaction du
    // cas d'usage. Aucune note n'est déplacée : leur sort suit le
    // rattachement courant (ADR-ARCH-002).
    const client = clientDe(tx)
    await client.query(
      'UPDATE users SET manager_id = $1 WHERE id = $2 AND company_id = $3',
      [managerId, userId, companyId]
    )
  }
}
