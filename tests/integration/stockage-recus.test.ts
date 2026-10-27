// Cohérence note / reçu contre PostgreSQL et S3 réels (LocalStack), sous le
// rôle applicatif expense_app (I4, audit F07, contrat client §4).
//
// Le chemin testé est celui de POST /api/expense-notes : cas d'usage
// soumettreNote avec les adaptateurs réels (PgExpenseNoteRepository,
// PgUnitOfWork, S3ReceiptAdapter). Les pannes sont injectées à un seul
// endroit chacune, en enveloppant l'adaptateur réel : tout le reste (la base,
// le bucket, la compensation) est réel, et c'est l'état réel des deux
// systèmes qui est vérifié après coup.
//
// Prérequis : comme rls-policies.test.ts, plus LocalStack démarré et le
// bucket créé (npm run ensure-bucket).
import { randomUUID } from 'node:crypto'
import { GetObjectCommand, HeadObjectCommand, S3Client } from '@aws-sdk/client-s3'
import { Pool } from 'pg'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { PgExpenseNoteRepository } from '@/adapters/PgExpenseNoteRepository'
import { PgUnitOfWork } from '@/adapters/PgUnitOfWork'
import { S3ReceiptAdapter } from '@/adapters/S3ReceiptAdapter'
import { soumettreNote, type SoumissionBrute } from '@/application/SoumettreNote'
import type { Acteur } from '@/domain/Acteur'
import type { ExpenseNoteRepository } from '@/ports/ExpenseNoteRepository'
import type { ReceiptStoragePort } from '@/ports/ReceiptStoragePort'

const LANCER = process.env.RUN_INTEGRATION === '1'
const suite = LANCER ? describe : describe.skip

const BUCKET = process.env.S3_BUCKET ?? 'receipts'

// PNG 1x1 valide : passe la vérification de signature (validerOctetsRecu).
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
  'base64'
)

// Octets uniques par soumission : un PNG valide suivi d'un identifiant
// aléatoire (la signature reste celle d'un PNG). Le bucket local survit aux
// bases jetables et les clés receipts/{seq} se répètent d'une base à
// l'autre : avec des octets identiques, un objet resté d'un run précédent
// passerait pour le reçu qui vient d'être envoyé.
function recuUnique(): Buffer {
  return Buffer.concat([PNG, Buffer.from(randomUUID())])
}

function soumission(description: string, octets = recuUnique()): SoumissionBrute {
  return {
    montant: '18.40',
    dateDepense: '2026-10-15',
    description,
    recu: { data: octets, mimeType: 'image/png', size: octets.length },
  }
}

// Remplace une seule méthode d'un adaptateur réel ; le reste lui est délégué.
function avecPanne<T extends object>(reel: T, methode: keyof T, panne: () => never): T {
  return new Proxy(reel, {
    get(cible, propriete, recepteur) {
      if (propriete === methode) return async () => panne()
      const valeur = Reflect.get(cible, propriete, recepteur)
      return typeof valeur === 'function' ? valeur.bind(cible) : valeur
    },
  })
}

// Stockage réel qui enregistre les clés envoyées et, au moment d'une
// compensation, si l'objet existait encore : sans cela, « absent du bucket »
// pourrait aussi vouloir dire « jamais envoyé ».
function stockageObserve(reel: ReceiptStoragePort, existe: (cle: string) => Promise<boolean>) {
  const journal = { envoyees: [] as string[], presentAvantSuppression: [] as boolean[] }
  const port: ReceiptStoragePort = {
    upload: async (cle, octets, type) => {
      journal.envoyees.push(cle)
      await reel.upload(cle, octets, type)
    },
    getSignedUrl: (cle, duree) => reel.getSignedUrl(cle, duree),
    supprimer: async (cle) => {
      journal.presentAvantSuppression.push(await existe(cle))
      await reel.supprimer(cle)
    },
  }
  return { port, journal }
}

suite('soumission d’une note : PostgreSQL et S3 restent cohérents (I4, F07)', () => {
  const admin = new Pool({ connectionString: process.env.DATABASE_URL, max: 2 })
  const s3 = new S3Client({
    endpoint: process.env.S3_ENDPOINT,
    region: process.env.S3_REGION ?? 'us-east-1',
    forcePathStyle: process.env.S3_FORCE_PATH_STYLE !== 'false',
    credentials: {
      accessKeyId: process.env.S3_ACCESS_KEY_ID ?? '',
      secretAccessKey: process.env.S3_SECRET_ACCESS_KEY ?? '',
    },
  })
  const notes = new PgExpenseNoteRepository()
  const stockage = new S3ReceiptAdapter()
  const unitOfWork = new PgUnitOfWork()
  let companyId: string
  let employe: Acteur

  async function objetExiste(cle: string): Promise<boolean> {
    try {
      await s3.send(new HeadObjectCommand({ Bucket: BUCKET, Key: cle }))
      return true
    } catch (erreur) {
      if ((erreur as { name?: string }).name === 'NotFound') return false
      throw erreur
    }
  }

  async function notesDe(auteur: Acteur, description: string) {
    const { rows } = await admin.query<{ id: string; receipt_key: string }>(
      'SELECT id, receipt_key FROM expense_notes WHERE user_id = $1 AND description = $2',
      [auteur.id, description]
    )
    return rows
  }

  beforeAll(async () => {
    const domaine = `stockage-${randomUUID().slice(0, 8)}.test`
    const entreprise = await admin.query<{ id: string }>(
      'INSERT INTO companies (name, email_domain) VALUES ($1, $2) RETURNING id',
      ['stockage', domaine]
    )
    companyId = entreprise.rows[0].id
    const utilisateur = await admin.query<{ id: string }>(
      `INSERT INTO users (company_id, name, email, password_hash, role)
       VALUES ($1, 'Employe', $2, 'non-utilise', 'employee') RETURNING id`,
      [companyId, `employe@${domaine}`]
    )
    employe = { id: utilisateur.rows[0].id, role: 'employee', companyId }
  })

  afterAll(async () => {
    if (companyId) {
      await admin.query(
        'DELETE FROM expense_notes WHERE user_id IN (SELECT id FROM users WHERE company_id = $1)',
        [companyId]
      )
      await admin.query('DELETE FROM users WHERE company_id = $1', [companyId])
      await admin.query('DELETE FROM companies WHERE id = $1', [companyId])
    }
    await admin.end()
    s3.destroy()
    await globalThis.__pgPool?.end()
    globalThis.__pgPool = undefined
  })

  it('une note soumise pointe vers un reçu présent dans le bucket, octets et type intacts', async () => {
    const octets = recuUnique()
    const vue = await soumettreNote(employe, soumission('Nominal', octets), {
      notes,
      stockage,
      unitOfWork,
    })
    const cle = vue.note.toJSON().receiptKey

    // Format gelé de la clé (contrat client §4).
    expect(cle).toMatch(/^receipts\/\d+\.png$/)
    expect(await notesDe(employe, 'Nominal')).toEqual([
      { id: vue.note.id, receipt_key: cle },
    ])

    const objet = await s3.send(new GetObjectCommand({ Bucket: BUCKET, Key: cle }))
    expect(objet.ContentType).toBe('image/png')
    expect(Buffer.from(await objet.Body!.transformToByteArray())).toEqual(octets)
  })

  it('l’URL signée sert exactement le reçu de la note', async () => {
    const octets = recuUnique()
    const vue = await soumettreNote(employe, soumission('URL signée', octets), {
      notes,
      stockage,
      unitOfWork,
    })
    const url = await stockage.getSignedUrl(vue.note.toJSON().receiptKey)

    const reponse = await fetch(url)
    expect(reponse.status).toBe(200)
    expect(Buffer.from(await reponse.arrayBuffer())).toEqual(octets)
  })

  it('S3 indisponible : aucune note n’est créée', async () => {
    const stockageEnPanne = avecPanne<ReceiptStoragePort>(stockage, 'upload', () => {
      throw new Error('S3 indisponible (panne injectée)')
    })

    await expect(
      soumettreNote(employe, soumission('Panne S3'), {
        notes,
        stockage: stockageEnPanne,
        unitOfWork,
      })
    ).rejects.toThrow('S3 indisponible')

    // Pas de note sans justificatif (I4) : rien en base.
    expect(await notesDe(employe, 'Panne S3')).toEqual([])
  })

  it('base en échec après l’envoi : le reçu est supprimé du bucket (compensation)', async () => {
    const { port, journal } = stockageObserve(stockage, objetExiste)
    const notesEnPanne = avecPanne<ExpenseNoteRepository>(notes, 'creer', () => {
      throw new Error('PostgreSQL indisponible (panne injectée)')
    })

    await expect(
      soumettreNote(employe, soumission('Panne base'), {
        notes: notesEnPanne,
        stockage: port,
        unitOfWork,
      })
    ).rejects.toThrow('PostgreSQL indisponible')

    // Le reçu a bien été envoyé, existait encore au moment de la
    // compensation, et n'existe plus : c'est la compensation qui l'a retiré.
    expect(journal.envoyees).toHaveLength(1)
    expect(journal.presentAvantSuppression).toEqual([true])
    expect(await objetExiste(journal.envoyees[0])).toBe(false)
    expect(await notesDe(employe, 'Panne base')).toEqual([])
  })

  it('un INSERT refusé par PostgreSQL déclenche aussi la compensation', async () => {
    // Refus réel de la base cette fois, sans exception simulée : un montant
    // hors de numeric(10,2) fait échouer l'INSERT et annule la transaction.
    const { port, journal } = stockageObserve(stockage, objetExiste)
    const notesHorsCapacite = new Proxy(notes, {
      get(cible, propriete, recepteur) {
        if (propriete === 'creer') {
          return (...[tx, entree]: Parameters<ExpenseNoteRepository['creer']>) =>
            cible.creer(tx, { ...entree, montant: 1e12 })
        }
        const valeur = Reflect.get(cible, propriete, recepteur)
        return typeof valeur === 'function' ? valeur.bind(cible) : valeur
      },
    })

    await expect(
      soumettreNote(employe, soumission('Refus base'), {
        notes: notesHorsCapacite,
        stockage: port,
        unitOfWork,
      })
    ).rejects.toThrow(/numeric field overflow/)

    expect(journal.presentAvantSuppression).toEqual([true])
    expect(await objetExiste(journal.envoyees[0])).toBe(false)
    expect(await notesDe(employe, 'Refus base')).toEqual([])
  })
})
