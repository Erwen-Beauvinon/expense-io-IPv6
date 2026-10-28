// Deux décisions simultanées sur la même note, contre PostgreSQL réel
// sous le rôle applicatif expense_app (I6, ADR-DOMAIN-001, backlog #002).
//
// Le chemin testé est celui des routes : cas d'usage trancherNote avec les
// adaptateurs PostgreSQL. Une barrière retient chaque décision juste avant
// l'écriture, jusqu'à ce que les deux aient lu la note `pending` : la course
// est donc certaine, pas laissée au hasard de l'ordonnancement. Seule
// l'écriture conditionnelle (`status = 'pending'`) peut alors départager.
//
// Un témoin rejoue la même course avec un UPDATE sans ce prédicat : les deux
// écritures y réussissent, ce qui prouve que le dispositif produit bien une
// concurrence réelle et que le premier test échouerait sans la garde.
//
// Prérequis et lancement : comme rls-policies.test.ts.
import { randomUUID } from 'node:crypto'
import { Pool } from 'pg'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { PgAnnuaireOrganisation } from '@/adapters/PgAnnuaireOrganisation'
import { PgExpenseNoteRepository } from '@/adapters/PgExpenseNoteRepository'
import { trancherNote } from '@/application/TrancherNote'
import type { Acteur } from '@/domain/Acteur'
import { DejaTranchee } from '@/domain/errors'
import type { Decision } from '@/domain/NoteTranchee'
import type { ExpenseNoteRepository } from '@/ports/ExpenseNoteRepository'
import type { NotificationPort } from '@/ports/NotificationPort'

const LANCER = process.env.RUN_INTEGRATION === '1'
const suite = LANCER ? describe : describe.skip

// Chaque scénario est rejoué sur des notes neuves : un seul passage pourrait
// réussir par chance, dix passages identiques ne le peuvent pas.
const PASSAGES = 10

function connexionApp() {
  const url = process.env.APP_DATABASE_URL
  if (url) return new Pool({ connectionString: url, max: 4 })
  const admin = process.env.DATABASE_URL ?? ''
  return new Pool({
    connectionString: admin.replace(/\/\/[^@]+@/, '//expense_app:expense_app_dev_only@'),
    max: 4,
  })
}

// Libère tous les appelants quand `n` d'entre eux sont arrivés.
function barriere(n: number): () => Promise<void> {
  let arrives = 0
  let liberer!: () => void
  const ouverte = new Promise<void>((resolve) => {
    liberer = resolve
  })
  return async () => {
    arrives += 1
    if (arrives >= n) liberer()
    await ouverte
  }
}

// Repository réel, retenu avant l'écriture : les deux décisions ont déjà
// lu la note et vérifié leurs droits quand l'une d'elles écrit.
function notesAvecBarriere(attendre: () => Promise<void>): ExpenseNoteRepository {
  const reel = new PgExpenseNoteRepository()
  return new Proxy(reel, {
    get(cible, propriete, recepteur) {
      if (propriete === 'trancherSiEnAttente') {
        return async (...args: Parameters<ExpenseNoteRepository['trancherSiEnAttente']>) => {
          await attendre()
          return cible.trancherSiEnAttente(...args)
        }
      }
      const valeur = Reflect.get(cible, propriete, recepteur)
      return typeof valeur === 'function' ? valeur.bind(cible) : valeur
    },
  })
}

const notificateurMuet: NotificationPort = { notifierDecision: async () => {} }

interface Entreprise {
  id: string
  hr: Acteur
  manager: Acteur
  employe: Acteur
}

suite('deux décisions simultanées sur une note (I6, PostgreSQL réel)', () => {
  const admin = new Pool({ connectionString: process.env.DATABASE_URL, max: 2 })
  const app = connexionApp()
  const annuaire = new PgAnnuaireOrganisation()
  let entreprise: Entreprise

  async function creerUtilisateur(
    companyId: string,
    domaine: string,
    nom: string,
    role: Acteur['role'],
    managerId: string | null = null
  ): Promise<Acteur> {
    const { rows } = await admin.query<{ id: string }>(
      `INSERT INTO users (company_id, name, email, password_hash, role, manager_id)
       VALUES ($1, $2, $3, 'non-utilise', $4, $5) RETURNING id`,
      [companyId, nom, `${nom.toLowerCase()}@${domaine}`, role, managerId]
    )
    return { id: rows[0].id, role, companyId }
  }

  async function creerNote(auteur: Acteur): Promise<string> {
    const { rows } = await admin.query<{ id: string }>(
      `INSERT INTO expense_notes (user_id, amount, expense_date, description, receipt_key)
       VALUES ($1, 10, CURRENT_DATE, 'Course', 'receipts/concurrence.png') RETURNING id`,
      [auteur.id]
    )
    return rows[0].id
  }

  async function etatNote(noteId: string) {
    const { rows } = await admin.query<{
      status: string
      decided_by: string | null
      decision_reason: string | null
    }>('SELECT status, decided_by, decision_reason FROM expense_notes WHERE id = $1', [noteId])
    return rows[0]
  }

  interface Tentative {
    acteur: Acteur
    decision: Decision
    motif: string | null
  }

  // Lance les tentatives en même temps, retenues jusqu'à ce que toutes
  // aient atteint l'écriture.
  async function course(noteId: string, tentatives: Tentative[]) {
    const notes = notesAvecBarriere(barriere(tentatives.length))
    return Promise.allSettled(
      tentatives.map(({ acteur, decision, motif }) =>
        trancherNote(acteur, noteId, decision, motif, {
          notes,
          annuaire,
          notificateur: notificateurMuet,
        })
      )
    )
  }

  // Exactement une décision gagne, l'autre reçoit DéjàTranchée (409), et la
  // ligne porte la décision, l'auteur et le motif du gagnant, sans mélange.
  async function verifierUnSeulGagnant(noteId: string, tentatives: Tentative[]) {
    const resultats = await course(noteId, tentatives)
    const gagnants = resultats.flatMap((resultat, i) =>
      resultat.status === 'fulfilled' ? [tentatives[i]] : []
    )
    const perdants = resultats.filter((resultat) => resultat.status === 'rejected')

    expect(gagnants).toHaveLength(1)
    expect(perdants).toHaveLength(tentatives.length - 1)
    for (const perdant of perdants) {
      expect((perdant as PromiseRejectedResult).reason).toBeInstanceOf(DejaTranchee)
    }

    const [gagnant] = gagnants
    const etat = await etatNote(noteId)
    expect(etat.status).toBe(gagnant.decision)
    expect(etat.decided_by).toBe(gagnant.acteur.id)
    expect(etat.decision_reason).toBe(gagnant.motif)
  }

  beforeAll(async () => {
    const domaine = `concurrence-${randomUUID().slice(0, 8)}.test`
    const { rows } = await admin.query<{ id: string }>(
      'INSERT INTO companies (name, email_domain) VALUES ($1, $2) RETURNING id',
      ['concurrence', domaine]
    )
    const companyId = rows[0].id
    const hr = await creerUtilisateur(companyId, domaine, 'Rh', 'hr_admin')
    const manager = await creerUtilisateur(companyId, domaine, 'Manager', 'manager')
    const employe = await creerUtilisateur(companyId, domaine, 'Employe', 'employee', manager.id)
    entreprise = { id: companyId, hr, manager, employe }
  })

  afterAll(async () => {
    if (entreprise) {
      await admin.query(
        'DELETE FROM expense_notes WHERE user_id IN (SELECT id FROM users WHERE company_id = $1)',
        [entreprise.id]
      )
      await admin.query('UPDATE users SET manager_id = NULL WHERE company_id = $1', [entreprise.id])
      await admin.query('DELETE FROM users WHERE company_id = $1', [entreprise.id])
      await admin.query('DELETE FROM companies WHERE id = $1', [entreprise.id])
    }
    await admin.end()
    await app.end()
    await globalThis.__pgPool?.end()
    globalThis.__pgPool = undefined
  })

  it('manager racine et RH tranchent en même temps : un seul gagne, l’autre reçoit 409', async () => {
    // Note d'un employé sous manager racine : les deux sont valideurs
    // (ADR-ARCH-002, ligne 2) et, avec la lecture A, la voient dans leur file.
    for (let passage = 0; passage < PASSAGES; passage += 1) {
      const noteId = await creerNote(entreprise.employe)
      await verifierUnSeulGagnant(noteId, [
        { acteur: entreprise.manager, decision: 'approved', motif: null },
        { acteur: entreprise.hr, decision: 'rejected', motif: 'Justificatif illisible' },
      ])
    }
  })

  it('le même valideur envoie deux décisions (double clic) : une seule est écrite', async () => {
    for (let passage = 0; passage < PASSAGES; passage += 1) {
      const noteId = await creerNote(entreprise.employe)
      await verifierUnSeulGagnant(noteId, [
        { acteur: entreprise.manager, decision: 'approved', motif: null },
        { acteur: entreprise.manager, decision: 'approved', motif: null },
      ])
    }
  })

  it('témoin : sans le prédicat status = pending, les deux écritures réussissent', async () => {
    // Même course, même rôle, même barrière, mais l'écriture naïve de
    // l'ancienne route (UPDATE par id seul, audit F08). Si ce témoin
    // échouait, la barrière ne créerait pas de concurrence et les tests
    // ci-dessus ne prouveraient rien.
    const noteId = await creerNote(entreprise.employe)
    const attendre = barriere(2)
    const ecritureNaive = async (acteur: Acteur, decision: Decision) => {
      const client = await app.connect()
      try {
        await client.query('BEGIN')
        await client.query("SELECT set_config('app.current_user_id', $1, true)", [acteur.id])
        const lue = await client.query<{ status: string }>(
          'SELECT status FROM expense_notes WHERE id = $1',
          [noteId]
        )
        expect(lue.rows[0].status).toBe('pending')
        await attendre()
        const ecrite = await client.query(
          `UPDATE expense_notes SET status = $1, decided_by = $2, decision_reason = 'témoin'
           WHERE id = $3`,
          [decision, acteur.id, noteId]
        )
        await client.query('COMMIT')
        return ecrite.rowCount
      } catch (erreur) {
        await client.query('ROLLBACK')
        throw erreur
      } finally {
        client.release()
      }
    }

    const lignes = await Promise.all([
      ecritureNaive(entreprise.manager, 'approved'),
      ecritureNaive(entreprise.hr, 'rejected'),
    ])
    expect(lignes).toEqual([1, 1])
  })
})
