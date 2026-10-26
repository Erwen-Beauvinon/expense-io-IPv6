import type { Acteur } from '@/domain/Acteur'
import { ExpenseNote } from '@/domain/ExpenseNote'
import type { NoteAvecAuteur } from '@/domain/NoteAvecAuteur'
import type { OrdreTri } from '@/domain/OrdreTri'
import { withUserScope } from '@/lib/db'
import type { ExpenseNoteRepository } from '@/ports/ExpenseNoteRepository'

// Correspondance interne enum → SQL. Jamais construite depuis une
// entrée client : seules les valeurs du type OrdreTri y entrent.
const ORDRE_SQL: Record<OrdreTri, string> = {
  created_at_desc: 'en.created_at DESC',
  created_at_asc: 'en.created_at ASC',
  expense_date_desc: 'en.expense_date DESC',
  expense_date_asc: 'en.expense_date ASC',
  amount_desc: 'en.amount DESC',
  amount_asc: 'en.amount ASC',
}

interface LigneNote {
  id: string
  user_id: string
  amount: string
  expense_date: string
  description: string
  receipt_key: string
  status: 'pending' | 'approved' | 'rejected'
  created_at: string
  auteur_company_id: string
  auteur_manager_id: string | null
  auteur_role: 'employee' | 'manager' | 'hr_admin'
}

function versNoteAvecAuteur(ligne: LigneNote): NoteAvecAuteur {
  return {
    note: new ExpenseNote({
      id: ligne.id,
      userId: ligne.user_id,
      amount: Number.parseFloat(ligne.amount),
      expenseDate: ligne.expense_date,
      description: ligne.description,
      receiptKey: ligne.receipt_key,
      status: ligne.status,
      createdAt: ligne.created_at,
    }),
    auteurId: ligne.user_id,
    auteurCompanyId: ligne.auteur_company_id,
    auteurManagerId: ligne.auteur_manager_id,
    auteurRole: ligne.auteur_role,
  }
}

const SELECT_AVEC_AUTEUR = `
  SELECT en.*, u.company_id AS auteur_company_id,
         u.manager_id AS auteur_manager_id, u.role AS auteur_role
  FROM expense_notes en
  JOIN users u ON u.id = en.user_id`

export class PgExpenseNoteRepository implements ExpenseNoteRepository {
  async trouverParId(
    acteur: Acteur,
    noteId: string
  ): Promise<NoteAvecAuteur | null> {
    // Phase 2 : périmètre propriétaire uniquement. L'accès manager/RH
    // (peutConsulter, I9) est branché en phase 3.
    return withUserScope(acteur.id, async (client) => {
      const result = await client.query<LigneNote>(
        `${SELECT_AVEC_AUTEUR} WHERE en.id = $1`,
        [noteId]
      )
      const ligne = result.rows[0]
      if (!ligne) return null
      if (ligne.user_id !== acteur.id) return null
      return versNoteAvecAuteur(ligne)
    })
  }

  async listerParAuteur(
    acteur: Acteur,
    auteurId: string,
    tri: OrdreTri
  ): Promise<NoteAvecAuteur[]> {
    // Phase 2 : historique personnel uniquement. Les listes
    // manager/RH arrivent avec ListerNotesÀTrancher (phase 4).
    if (acteur.id !== auteurId) return []
    return withUserScope(acteur.id, async (client) => {
      const result = await client.query<LigneNote>(
        `${SELECT_AVEC_AUTEUR} WHERE en.user_id = $1 ORDER BY ${ORDRE_SQL[tri]}`,
        [auteurId]
      )
      return result.rows.map(versNoteAvecAuteur)
    })
  }
}
