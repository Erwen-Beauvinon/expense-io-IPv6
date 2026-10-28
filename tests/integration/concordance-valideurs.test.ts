// Concordance des trois versions de la règle des valideurs (ADR-ARCH-002) :
// la table de vérité de tests/support/table-valideurs.ts, déjà vérifiée
// contre calculerValideurs (domaine, tests/unit/domain/table-valideurs),
// est ici rejouée contre :
// 1. le prédicat SQL de l'adaptateur (predicatValideur, décision et file) ;
// 2. les policies RLS de la migration 0005, sous le rôle expense_app.
// Si une version diverge, ce test ou le test du domaine échoue.
// Lancer avec : RUN_INTEGRATION=1 npx vitest run tests/integration
// Exécuté dans le job E2E de la CI (PostgreSQL éphémère, seed appliqué).
import { Pool } from 'pg'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import {
  PgExpenseNoteRepository,
  predicatValideur,
} from '@/adapters/PgExpenseNoteRepository'
import type { Acteur } from '@/domain/Acteur'
import { getPool } from '@/lib/db'
import {
  ACTEURS,
  AUTEURS,
  FILES_ATTENDUES,
  ORGANIGRAMME,
  estValideurAttendu,
} from '../support/table-valideurs'

const LANCER = process.env.RUN_INTEGRATION === '1'
const suite = LANCER ? describe : describe.skip

function connexionApp() {
  const url = process.env.APP_DATABASE_URL
  if (url) return new Pool({ connectionString: url, max: 2 })
  const admin = process.env.DATABASE_URL ?? ''
  return new Pool({
    connectionString: admin.replace(/\/\/[^@]+@/, '//expense_app:expense_app_dev_only@'),
    max: 2,
  })
}

suite('concordance des valideurs : domaine, SQL, RLS (ADR-ARCH-002)', () => {
  const admin = new Pool({ connectionString: process.env.DATABASE_URL, max: 4 })
  const app = connexionApp()
  const suffixe = `conc-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
  const entreprises: Record<'A' | 'B', string> = { A: '', B: '' }
  const ids: Record<string, string> = {}
  const notes: Record<string, string> = {}

  beforeAll(async () => {
    for (const lettre of ['A', 'B'] as const) {
      const domaine = `${lettre.toLowerCase()}-${suffixe}.example.com`
      const ligne = await admin.query<{ id: string }>(
        'INSERT INTO companies (name, email_domain) VALUES ($1, $2) RETURNING id',
        [domaine.split('.')[0], domaine]
      )
      entreprises[lettre] = ligne.rows[0].id
    }
    // Managers avant leurs rattachés : l'ordre de l'organigramme le garantit.
    for (const [nom, membre] of Object.entries(ORGANIGRAMME)) {
      const ligne = await admin.query<{ id: string }>(
        `INSERT INTO users (company_id, name, email, password_hash, role, manager_id)
         VALUES ($1, $2, $3, 'x', $4, $5) RETURNING id`,
        [
          entreprises[membre.entreprise],
          nom,
          `${nom.toLowerCase()}@${suffixe}.example.com`,
          membre.role,
          membre.manager ? ids[membre.manager] : null,
        ]
      )
      ids[nom] = ligne.rows[0].id
    }
    for (const auteur of AUTEURS) {
      const ligne = await admin.query<{ id: string }>(
        `INSERT INTO expense_notes (user_id, amount, expense_date, description, receipt_key)
         VALUES ($1, 10, '2026-01-15', 'concordance', 'receipts/0.png') RETURNING id`,
        [ids[auteur]]
      )
      notes[auteur] = ligne.rows[0].id
    }
  }, 60_000)

  afterAll(async () => {
    const lesNotes = Object.values(notes)
    if (lesNotes.length > 0) {
      await admin.query('DELETE FROM expense_notes WHERE id = ANY($1)', [lesNotes])
    }
    // Rattachés d'abord (clé étrangère manager_id).
    const lesUsers = Object.keys(ORGANIGRAMME).reverse().map((nom) => ids[nom]).filter(Boolean)
    for (const id of lesUsers) await admin.query('DELETE FROM users WHERE id = $1', [id])
    await admin.query('DELETE FROM companies WHERE id = ANY($1)', [Object.values(entreprises).filter(Boolean)])
    await app.end()
    await admin.end()
    await getPool().end()
  })

  function acteur(nom: string): Acteur {
    const membre = ORGANIGRAMME[nom]
    return { id: ids[nom], role: membre.role, companyId: entreprises[membre.entreprise] }
  }

  async function predicatSql(nom: string, auteur: string): Promise<boolean> {
    const qui = acteur(nom)
    const { rows } = await admin.query<{ ok: boolean }>(
      `SELECT EXISTS (
         SELECT 1 FROM expense_notes en
         WHERE en.id = $3 AND ${predicatValideur('$1', '$2')}
       ) AS ok`,
      [qui.id, qui.companyId, notes[auteur]]
    )
    return rows[0].ok
  }

  async function updateRls(nom: string, auteur: string): Promise<boolean> {
    const client = await app.connect()
    try {
      await client.query('BEGIN')
      await client.query("SELECT set_config('app.current_user_id', $1, true)", [ids[nom]])
      const result = await client.query(
        "UPDATE expense_notes SET status = 'approved' WHERE id = $1",
        [notes[auteur]]
      )
      await client.query('ROLLBACK')
      return (result.rowCount ?? 0) === 1
    } finally {
      client.release()
    }
  }

  const paires = ACTEURS.flatMap((nom) => AUTEURS.map((auteur) => [nom, auteur] as const))

  it.each(paires)('%s valideur d’une note de %s : SQL et RLS d’accord avec la table', async (nom, auteur) => {
    const attendu = estValideurAttendu(nom, auteur)
    await expect(predicatSql(nom, auteur)).resolves.toBe(attendu)
    await expect(updateRls(nom, auteur)).resolves.toBe(attendu)
  })

  it.each(Object.keys(FILES_ATTENDUES))('file à trancher de %s (listerEnAttentePour)', async (nom) => {
    const file = await new PgExpenseNoteRepository().listerEnAttentePour(acteur(nom))
    const parNom = Object.fromEntries(Object.entries(ids).map(([n, id]) => [id, n]))
    expect(file.map((n) => parNom[n.auteurId]).sort()).toEqual([...FILES_ATTENDUES[nom]].sort())
  })
})
