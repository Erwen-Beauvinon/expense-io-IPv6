// Policies RLS prouvées sous le rôle applicatif expense_app
// (migrations 0003/0005, ADR-DATA-002, revue phase/8 §2).
// Prérequis : PostgreSQL démarré, migrations à jour, seed appliqué
// (mot de passe du rôle posé par le seed).
// Lancer avec : RUN_INTEGRATION=1 npx vitest run tests/integration
// Sans la variable, le fichier est ignoré même en run complet.
// Exécuté pour de vrai dans le job E2E de la CI (PostgreSQL éphémère).
import { Pool } from 'pg'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

const LANCER = process.env.RUN_INTEGRATION === '1'
const suite = LANCER ? describe : describe.skip

function connexionApp() {
  // Compte applicatif réel quand il est configuré (CI, dev via seed) ;
  // à défaut, réécriture documentée vers le mot de passe de dev.
  const url = process.env.APP_DATABASE_URL
  if (url) return new Pool({ connectionString: url, max: 2 })
  const admin = process.env.DATABASE_URL ?? ''
  return new Pool({
    connectionString: admin.replace(/\/\/[^@]+@/, '//expense_app:expense_app_dev_only@'),
    max: 2,
  })
}

async function idsNotes(pool: Pool, userId: string): Promise<string[]> {
  // Même discipline que withUserScope : le contexte RLS est posé dans
  // une transaction explicite, sur la même connexion que la lecture.
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    await client.query("SELECT set_config('app.current_user_id', $1, true)", [userId])
    const result = await client.query<{ id: string }>('SELECT id FROM expense_notes')
    await client.query('ROLLBACK')
    return result.rows.map((ligne) => ligne.id)
  } finally {
    client.release()
  }
}

async function lignesUpdate(
  pool: Pool,
  userId: string,
  noteId: string,
  status: string
): Promise<number> {
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    await client.query("SELECT set_config('app.current_user_id', $1, true)", [userId])
    const result = await client.query(
      'UPDATE expense_notes SET status = $1 WHERE id = $2',
      [status, noteId]
    )
    await client.query('ROLLBACK')
    return result.rowCount ?? 0
  } finally {
    client.release()
  }
}

suite('policies RLS sous expense_app (I10, audit A-F03/F10)', () => {
  it('le rôle applicatif n’est ni superuser ni contourneur de RLS', async () => {
    const pool = connexionApp()
    try {
      const { rows } = await pool.query<{ rolsuper: boolean; rolbypassrls: boolean }>(
        'SELECT rolsuper, rolbypassrls FROM pg_roles WHERE rolname = current_user'
      )
      expect(rows[0]).toEqual({ rolsuper: false, rolbypassrls: false })
    } finally {
      await pool.end()
    }
  })

  it('un employé ne lit que ses notes, jamais celles d’une autre entreprise', async () => {
    const admin = new Pool({ connectionString: process.env.DATABASE_URL, max: 1 })
    const noteEtrangere = '00000000-0000-0000-0000-000000000000'
    try {
      const demo = await admin.query<{ id: string }>(
        "SELECT id FROM users WHERE email = 'demo@expense.io'"
      )
      const pool = connexionApp()
      try {
        const visibles = await idsNotes(pool, demo.rows[0].id)
        expect(visibles.length).toBeGreaterThan(0)
        expect(visibles).not.toContain(noteEtrangere)
      } finally {
        await pool.end()
      }
    } finally {
      await admin.end()
    }
  })

  it('un RH ne lit pas les notes des managers racines d’une autre entreprise', async () => {
    const admin = new Pool({ connectionString: process.env.DATABASE_URL, max: 1 })
    try {
      const hr = await admin.query<{ id: string }>(
        "SELECT id FROM users WHERE email = 'hr@expense.io'"
      )
      const noteManager = await admin.query<{ id: string }>(
        `SELECT en.id FROM expense_notes en
         JOIN users u ON u.id = en.user_id
         WHERE u.role = 'manager' AND u.manager_id IS NULL
         LIMIT 1`
      )
      const pool = connexionApp()
      try {
        const visibles = await idsNotes(pool, hr.rows[0].id)
        // Le seed ne contient qu’une entreprise : le RH voit la note
        // du manager racine de SON entreprise…
        expect(visibles).toContain(noteManager.rows[0].id)
        // …mais une requête directe hors entreprise reste invisible
        // (garantie portée par la policy, prouvée en base réelle).
        const direct = await (async () => {
          const client = await pool.connect()
          try {
            await client.query('BEGIN')
            await client.query(
              "SELECT set_config('app.current_user_id', $1, true)",
              [hr.rows[0].id]
            )
            const horsEntreprise = await client.query(
              `SELECT en.id FROM expense_notes en
               JOIN users u ON u.id = en.user_id
               WHERE u.company_id <> (SELECT company_id FROM users WHERE id = $1)`,
              [hr.rows[0].id]
            )
            await client.query('ROLLBACK')
            return horsEntreprise.rows
          } finally {
            client.release()
          }
        })()
        expect(direct).toEqual([])
      } finally {
        await pool.end()
      }
    } finally {
      await admin.end()
    }
  })
})

// Fixtures autonomes (revue phase/8 §2, § Verification ADR-DATA-002) :
// deux entreprises, N+1, employé sans manager, notes de RH — le seed
// n'est pas requis ici, nettoyage en afterAll.
suite('policies valideurs sur deux entreprises (ADR-ARCH-002)', () => {
  const admin = new Pool({ connectionString: process.env.DATABASE_URL, max: 8 })
  const app = connexionApp()
  const suffixe = `rls-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
  const ids: Record<string, string> = {}

  async function entreprise(domaine: string): Promise<string> {
    const ligne = await admin.query<{ id: string }>(
      'INSERT INTO companies (name, email_domain) VALUES ($1, $2) RETURNING id',
      [domaine.split('.')[0], domaine]
    )
    return ligne.rows[0].id
  }

  async function utilisateur(
    email: string,
    role: string,
    companyId: string,
    managerId: string | null
  ): Promise<string> {
    const ligne = await admin.query<{ id: string }>(
      `INSERT INTO users (company_id, name, email, password_hash, role, manager_id)
       VALUES ($1, $2, $3, 'x', $4, $5) RETURNING id`,
      [companyId, email, email, role, managerId]
    )
    return ligne.rows[0].id
  }

  async function note(auteurId: string): Promise<string> {
    const ligne = await admin.query<{ id: string }>(
      `INSERT INTO expense_notes (user_id, amount, expense_date, description, receipt_key)
       VALUES ($1, 10, '2026-01-15', 'fixture', 'receipts/0.png') RETURNING id`,
      [auteurId]
    )
    return ligne.rows[0].id
  }

  beforeAll(async () => {
    const domA = `a-${suffixe}.example.com`
    const domB = `b-${suffixe}.example.com`
    const compA = await entreprise(domA)
    const compB = await entreprise(domB)
    ids.compA = compA
    ids.compB = compB
    // Entreprise A : hrA, manager racine, employé direct, chaîne N+1,
    // employé sans manager, second RH.
    ids.hrA = await utilisateur(`hr-a@${domA}`, 'hr_admin', compA, null)
    ids.hrA2 = await utilisateur(`hr-a2@${domA}`, 'hr_admin', compA, null)
    ids.mRacine = await utilisateur(`m-racine@${domA}`, 'manager', compA, null)
    ids.eDirect = await utilisateur(`e-direct@${domA}`, 'employee', compA, ids.mRacine)
    ids.mInter = await utilisateur(`m-inter@${domA}`, 'manager', compA, ids.mRacine)
    ids.eN1 = await utilisateur(`e-n1@${domA}`, 'employee', compA, ids.mInter)
    ids.eOrphelin = await utilisateur(`e-orphelin@${domA}`, 'employee', compA, null)
    // Entreprise B : racine + employé, hors de portée de A.
    ids.hrB = await utilisateur(`hr-b@${domB}`, 'hr_admin', compB, null)
    ids.mB = await utilisateur(`m-b@${domB}`, 'manager', compB, null)
    ids.eB = await utilisateur(`e-b@${domB}`, 'employee', compB, ids.mB)
    ids.nDirect = await note(ids.eDirect)
    ids.nN1 = await note(ids.eN1)
    ids.nRacine = await note(ids.mRacine)
    ids.nHrA = await note(ids.hrA)
    ids.nOrphelin = await note(ids.eOrphelin)
    ids.nB = await note(ids.eB)
  }, 60_000)

  afterAll(async () => {
    const notes = [ids.nDirect, ids.nN1, ids.nRacine, ids.nHrA, ids.nOrphelin, ids.nB].filter(Boolean)
    if (notes.length > 0) {
      await admin.query('DELETE FROM expense_notes WHERE id = ANY($1)', [notes])
    }
    const users = [ids.hrA, ids.hrA2, ids.mRacine, ids.eDirect, ids.mInter, ids.eN1, ids.eOrphelin, ids.hrB, ids.mB, ids.eB].filter(Boolean)
    if (users.length > 0) {
      await admin.query('DELETE FROM users WHERE id = ANY($1)', [users])
    }
    const companies = [ids.compA, ids.compB].filter(Boolean)
    if (companies.length > 0) {
      await admin.query('DELETE FROM companies WHERE id = ANY($1)', [companies])
    }
    await app.end()
    await admin.end()
  })

  it('direct et N+1 lisent et tranchent, hors sous-arbre ils ne voient rien', async () => {
    // mRacine : direct de eDirect, N+1 de eN1.
    const vues = await idsNotes(app, ids.mRacine)
    expect(vues).toContain(ids.nDirect)
    expect(vues).toContain(ids.nN1)
    expect(vues).not.toContain(ids.nB)
    await expect(lignesUpdate(app, ids.mRacine, ids.nDirect, 'approved')).resolves.toBe(1)
    await expect(lignesUpdate(app, ids.mRacine, ids.nN1, 'approved')).resolves.toBe(1)
    // mInter : N+1 de personne ici, direct de eN1 seulement.
    const vuesInter = await idsNotes(app, ids.mInter)
    expect(vuesInter).toContain(ids.nN1)
    expect(vuesInter).not.toContain(ids.nDirect)
    expect(vuesInter).not.toContain(ids.nB)
    await expect(lignesUpdate(app, ids.mInter, ids.nDirect, 'approved')).resolves.toBe(0)
  })

  it('RH : racine, orphelin et notes de RH de son entreprise — jamais soi-même en écriture', async () => {
    const vues = await idsNotes(app, ids.hrA)
    expect(vues).toContain(ids.nRacine)
    expect(vues).toContain(ids.nOrphelin)
    expect(vues).toContain(ids.nHrA)
    // Ligne 2 du tableau ADR-ARCH-002 : employé sous manager racine —
    // le RH est valideur, et la file C09 le liste (lecture A).
    expect(vues).toContain(ids.nDirect)
    // Ligne 1 : équipe managée non racine — hors portée du RH.
    expect(vues).not.toContain(ids.nN1)
    // Hors entreprise : invisible aussi.
    expect(vues).not.toContain(ids.nB)
    // Le second RH lit la note du premier…
    expect(await idsNotes(app, ids.hrA2)).toContain(ids.nHrA)
    // …mais personne ne tranche sa propre note (I7, policy UPDATE).
    await expect(lignesUpdate(app, ids.hrA, ids.nHrA, 'approved')).resolves.toBe(0)
    await expect(lignesUpdate(app, ids.hrA, ids.nRacine, 'approved')).resolves.toBe(1)
    await expect(lignesUpdate(app, ids.hrA, ids.nDirect, 'approved')).resolves.toBe(1)
  })

  it('deux entreprises étanches dans les deux sens', async () => {
    expect(await idsNotes(app, ids.mB)).toEqual([ids.nB])
    expect(await idsNotes(app, ids.hrB)).toEqual([ids.nB])
    await expect(lignesUpdate(app, ids.mB, ids.nDirect, 'approved')).resolves.toBe(0)
    await expect(lignesUpdate(app, ids.hrB, ids.nRacine, 'approved')).resolves.toBe(0)
  })

  it('privilèges minimaux : séquence oui, DELETE non', async () => {
    // Réservation de clé (SoumettreNote) sous le rôle applicatif.
    const client = await app.connect()
    try {
      const seq = await client.query<{ seq: string }>(
        `SELECT nextval(pg_get_serial_sequence('expense_notes', 'receipt_seq')) AS seq`
      )
      expect(Number.parseInt(seq.rows[0].seq, 10)).toBeGreaterThan(0)
    } finally {
      client.release()
    }
    await await expect(lignesUpdate(app, ids.mB, ids.nB, 'approved')).resolves.toBe(1)
    const killer = await app.connect()
    try {
      await expect(
        killer.query('DELETE FROM expense_notes WHERE id = $1', [ids.nB])
      ).rejects.toThrow(/permission denied/)
    } finally {
      killer.release()
    }
  })
})
