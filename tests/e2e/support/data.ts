// Données de test des E2E, écrites directement en base et dans S3.
//
// Chaque test reçoit une entreprise neuve (domaine unique) avec un RH, un
// manager racine et un employé rattaché. Rien ne dépend du seed de démo :
// les décisions d'un test ne changent pas l'état vu par un autre, et
// l'ordre d'exécution n'a pas d'importance.
//
// On passe par la base plutôt que par l'interface parce que le rôle
// `manager` n'est attribuable que par SQL (voir README). Les parcours testés,
// eux, passent toujours par l'interface.
import { randomUUID } from 'node:crypto'
import bcrypt from 'bcryptjs'
import { Pool } from 'pg'
import { PutObjectCommand, S3Client } from '@aws-sdk/client-s3'

export const PASSWORD = 'e2e-password'

// PNG 1x1 valide, comme dans scripts/seed.mjs.
export const RECEIPT_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
  'base64'
)

export interface TestUser {
  id: string
  email: string
  name: string
  password: string
}

export interface TestCompany {
  id: string
  domain: string
  hr: TestUser
  manager: TestUser
  employee: TestUser
}

let pool: Pool | undefined
function db(): Pool {
  pool ??= new Pool({ connectionString: process.env.DATABASE_URL })
  return pool
}

let s3: S3Client | undefined
function storage(): S3Client {
  s3 ??= new S3Client({
    endpoint: process.env.S3_ENDPOINT,
    region: process.env.S3_REGION ?? 'us-east-1',
    forcePathStyle: process.env.S3_FORCE_PATH_STYLE !== 'false',
    credentials: {
      accessKeyId: process.env.S3_ACCESS_KEY_ID ?? '',
      secretAccessKey: process.env.S3_SECRET_ACCESS_KEY ?? '',
    },
  })
  return s3
}

// Coût bcrypt minimal : le hash n'a pas besoin d'être robuste ici, et
// bcrypt.compare accepte n'importe quel coût.
const passwordHash = bcrypt.hashSync(PASSWORD, 4)

async function insertUser(
  companyId: string,
  domain: string,
  name: string,
  role: 'employee' | 'manager' | 'hr_admin',
  managerId: string | null = null
): Promise<TestUser> {
  const email = `${name.toLowerCase()}@${domain}`
  const { rows } = await db().query<{ id: string }>(
    `INSERT INTO users (company_id, name, email, password_hash, role, manager_id)
     VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
    [companyId, name, email, passwordHash, role, managerId]
  )
  return { id: rows[0].id, email, name, password: PASSWORD }
}

export function uniqueDomain(): string {
  return `e2e-${randomUUID().slice(0, 8)}.test`
}

export async function createCompany(): Promise<TestCompany> {
  const domain = uniqueDomain()
  const { rows } = await db().query<{ id: string }>(
    'INSERT INTO companies (name, email_domain) VALUES ($1, $2) RETURNING id',
    [domain.split('.')[0], domain]
  )
  const companyId = rows[0].id
  const hr = await insertUser(companyId, domain, 'Rh', 'hr_admin')
  const manager = await insertUser(companyId, domain, 'Manager', 'manager')
  const employee = await insertUser(companyId, domain, 'Employe', 'employee', manager.id)
  return { id: companyId, domain, hr, manager, employee }
}

// Crée une note `pending` avec un vrai reçu dans S3, comme le seed.
export async function createNote(
  user: TestUser,
  { description, amount = 12.5 }: { description: string; amount?: number }
): Promise<string> {
  const { rows } = await db().query<{ id: string; receipt_seq: number }>(
    `INSERT INTO expense_notes (user_id, amount, expense_date, description, receipt_key)
     VALUES ($1, $2, CURRENT_DATE, $3, '') RETURNING id, receipt_seq`,
    [user.id, amount, description]
  )
  const { id, receipt_seq: receiptSeq } = rows[0]
  const receiptKey = `receipts/${receiptSeq}.png`
  await storage().send(
    new PutObjectCommand({
      Bucket: process.env.S3_BUCKET ?? 'receipts',
      Key: receiptKey,
      Body: RECEIPT_PNG,
      ContentType: 'image/png',
    })
  )
  await db().query('UPDATE expense_notes SET receipt_key = $1 WHERE id = $2', [receiptKey, id])
  return id
}

export async function noteStatus(noteId: string): Promise<string | undefined> {
  const { rows } = await db().query<{ status: string }>(
    'SELECT status FROM expense_notes WHERE id = $1',
    [noteId]
  )
  return rows[0]?.status
}

export async function userByEmail(
  email: string
): Promise<{ role: string; companyId: string } | undefined> {
  const { rows } = await db().query<{ role: string; company_id: string }>(
    'SELECT role, company_id FROM users WHERE email = $1',
    [email]
  )
  return rows[0] && { role: rows[0].role, companyId: rows[0].company_id }
}

// Supprime une entreprise et tout ce qui en dépend (aucune FK n'est en
// cascade dans le schéma). Les objets S3 restent : le bucket local est jetable.
export async function deleteCompanyByDomain(domain: string): Promise<void> {
  const client = await db().connect()
  try {
    await client.query('BEGIN')
    const { rows } = await client.query<{ id: string }>(
      'SELECT id FROM companies WHERE email_domain = $1',
      [domain]
    )
    if (rows[0]) {
      const companyId = rows[0].id
      await client.query(
        'DELETE FROM expense_notes WHERE user_id IN (SELECT id FROM users WHERE company_id = $1)',
        [companyId]
      )
      await client.query('UPDATE users SET manager_id = NULL WHERE company_id = $1', [companyId])
      await client.query('DELETE FROM users WHERE company_id = $1', [companyId])
      await client.query('DELETE FROM companies WHERE id = $1', [companyId])
    }
    await client.query('COMMIT')
  } catch (error) {
    await client.query('ROLLBACK')
    throw error
  } finally {
    client.release()
  }
}

export async function closeConnections(): Promise<void> {
  await pool?.end()
  pool = undefined
  s3?.destroy()
  s3 = undefined
}
