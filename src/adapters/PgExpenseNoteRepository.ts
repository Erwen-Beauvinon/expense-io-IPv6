import type { Acteur } from '@/domain/Acteur'
import { ExpenseNote } from '@/domain/ExpenseNote'
import type { NoteAvecAuteur } from '@/domain/NoteAvecAuteur'
import type { Motif } from '@/domain/Motif'
import type { Decision } from '@/domain/NoteTranchee'
import type { OrdreTri } from '@/domain/OrdreTri'
import { peutLireHistoriqueDe } from '@/domain/PolitiqueAcces'
import type { Transaction } from '@/ports/UnitOfWork'
import { getPool, withUserScope } from '@/lib/db'
import type {
  ExpenseNoteRepository,
  NouvelleNote,
} from '@/ports/ExpenseNoteRepository'
import { clientDe } from './PgUnitOfWork'

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

// Prédicat unique « l'acteur est valideur courant de la note `en` »
// (tableau ADR-ARCH-002 : direct, N+1, RH des lignes 2-3), toujours dans
// l'entreprise de l'acteur et jamais sur sa propre note (I7). Partagé
// par la décision et la file de tous les décideurs ; translitération en SQL de
// calculerValideurs (domaine), et des policies RLS de la migration 0005.
// Les trois versions sont confrontées à la même table de vérité par
// tests/integration/concordance-valideurs.test.ts. Paramètres : les
// placeholders SQL de l'acteur et de son entreprise.
export function predicatValideur(acteur: string, entreprise: string): string {
  return `en.user_id <> ${acteur}
         AND EXISTS (
           SELECT 1
           FROM users AS a
           LEFT JOIN users AS m ON m.id = a.manager_id
           WHERE a.id = en.user_id
             AND a.company_id = ${entreprise}
             AND (
               EXISTS (
                 SELECT 1 FROM users AS direct
                 WHERE direct.id = a.manager_id
                   AND direct.role = 'manager'
                   AND direct.id = ${acteur}
                   AND direct.company_id = ${entreprise}
               )
               OR EXISTS (
                 SELECT 1 FROM users AS direct
                 JOIN users AS superieur ON superieur.id = direct.manager_id
                 WHERE direct.id = a.manager_id
                   AND direct.role = 'manager'
                   AND superieur.id = ${acteur}
                   AND superieur.role = 'manager'
                   AND superieur.company_id = ${entreprise}
               )
               OR (
                 EXISTS (
                   SELECT 1 FROM users AS h
                   WHERE h.id = ${acteur}
                     AND h.role = 'hr_admin'
                     AND h.company_id = ${entreprise}
                 )
                 AND (
                   a.role = 'hr_admin'
                   OR a.manager_id IS NULL
                   OR m.id IS NULL
                   OR NOT (m.role = 'manager' AND m.manager_id IS NOT NULL)
                 )
               )
             )
         )`
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
    // Phase 3 : périmètre entreprise (I9/I10). Le refus (null) ne dit
    // pas si la note existe hors périmètre.
    return withUserScope(acteur.id, async (client) => {
      const result = await client.query<LigneNote>(
        `${SELECT_AVEC_AUTEUR} WHERE en.id = $1 AND u.company_id = $2`,
        [noteId, acteur.companyId]
      )
      const ligne = result.rows[0]
      if (!ligne) return null
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
    if (!peutLireHistoriqueDe(acteur, auteurId)) return []
    return withUserScope(acteur.id, async (client) => {
      const result = await client.query<LigneNote>(
        `${SELECT_AVEC_AUTEUR} WHERE en.user_id = $1 ORDER BY ${ORDRE_SQL[tri]}`,
        [auteurId]
      )
      return result.rows.map(versNoteAvecAuteur)
    })
  }

  async trancherSiEnAttente(
    acteur: Acteur,
    noteId: string,
    decision: Decision,
    motif: Motif | null
  ): Promise<boolean> {
    // Phase 4 (revues) : écriture conditionnelle unique (I6) +
    // traçabilité interne (migration 0002). Le WHERE réplique la
    // règle PolitiqueAcces (tableau ADR-ARCH-002) : entreprise de
    // l'auteur + valideur courant — direct, N+1, ou RH des cas
    // lignes 2-3 — vérifiés sur les lignes `users` (rôles lus en
    // base, jamais le jeton). L'autorisation reste d'abord vérifiée
    // par le cas d'usage (404 propre) ; l'écriture la réévalue
    // atomiquement. `decided_at` vient de now() SQL (horloge unique).
    // Une seule décision gagne la course ; la perdante (déjà tranchée
    // ou valideur perdu entre-temps) rend false → 409.
    return withUserScope(acteur.id, async (client) => {
      const ecrit = await client.query(
        `UPDATE expense_notes AS en
         SET status = $1, decided_by = $2, decided_at = now(), decision_reason = $3
         WHERE en.id = $4 AND en.status = 'pending'
         AND ${predicatValideur('$2', '$5')}`,
        [decision, acteur.id, motif?.valeur ?? null, noteId, acteur.companyId]
      )
      return (ecrit.rowCount ?? 0) > 0
    })
  }

  async listerEnAttentePour(acteur: Acteur): Promise<NoteAvecAuteur[]> {
    // Files déduites du rattachement courant (tableau ADR-ARCH-002), tri
    // croissant comme les anciennes requêtes. Lecture A (2026-10-26) : la
    // file de chaque décideur — manager ou RH — est exactement l'ensemble
    // des notes en attente dont il est valideur (figureDansLaFile côté
    // domaine), avec le même prédicat que la décision. Un RH y voit donc
    // aussi les équipes des managers racines, dont il est N+1.
    return withUserScope(acteur.id, async (client) => {
      const result = await client.query<LigneNote>(
        `${SELECT_AVEC_AUTEUR} WHERE u.company_id = $1 AND en.status = 'pending'
         AND ${predicatValideur('$2', '$1')}
         ORDER BY en.created_at ASC`,
        [acteur.companyId, acteur.id]
      )
      return result.rows.map(versNoteAvecAuteur)
    })
  }


  async reserverSequence(): Promise<number> {
    // Phase 5 (revue §7) : numéro unique pour la clé receipts/{seq}.
    // Nom de séquence résolu dynamiquement (indépendant du nom
    // auto-généré table_colonne_seq). Les trous (échec après
    // réservation) sont sans signification.
    const result = await getPool().query<{ seq: string }>(
      `SELECT nextval(pg_get_serial_sequence('expense_notes', 'receipt_seq')) AS seq`
    )
    return Number.parseInt(result.rows[0].seq, 10)
  }

  async creer(tx: Transaction, entree: NouvelleNote): Promise<NoteAvecAuteur> {
    // Phase 5 : création dans la transaction du cas d'usage. La vue
    // auteur est relue en jointure (I9/I10 : périmètre entreprise).
    const client = clientDe(tx)
    const inserted = await client.query<{ id: string }>(
      `INSERT INTO expense_notes (user_id, amount, expense_date, description, receipt_key)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id`,
      [
        entree.auteurId,
        entree.montant.valeur,
        entree.dateDepense.valeur,
        entree.description.valeur,
        entree.receiptKey,
      ]
    )
    const relu = await client.query<LigneNote>(
      `${SELECT_AVEC_AUTEUR} WHERE en.id = $1`,
      [inserted.rows[0].id]
    )
    const ligne = relu.rows[0]
    if (!ligne) throw new Error('Note créée introuvable')
    return versNoteAvecAuteur(ligne)
  }
}
