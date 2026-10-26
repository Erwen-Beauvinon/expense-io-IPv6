import { AsyncLocalStorage } from 'node:async_hooks'
import { Pool, types, type PoolClient } from 'pg'
import {
  EcritureIncertaine,
  TransactionImbriquee,
} from '@/ports/UnitOfWork'

// OID 1082 = date. Garde la chaîne "YYYY-MM-DD" brute renvoyée par Postgres
// plutôt qu'un objet Date JS calé sur le fuseau local.
types.setTypeParser(1082, (value: string) => value)

// Transaction en cours par chaîne async (revue phase/5 §5) : sert la
// détection d'imbrication sans faux positif entre requêtes concurrentes
// (un simple compteur module casserait sous concurrence).
const transactionEnCours = new AsyncLocalStorage<PoolClient>()

declare global {
  var __pgPool: Pool | undefined
}

export function getPool(): Pool {
  if (!global.__pgPool) {
    // RLS effective (phase 8, ADR-DATA-002, revue §1) : le serveur
    // applicatif se connecte avec le rôle non-superutilisateur
    // `expense_app`, soumis aux policies. Le repli sur DATABASE_URL
    // n'existe que pour les scripts outillés (migrate, seed) qui
    // exigent le compte d'administration — jamais en production.
    // Repli explicite (revue phase/8 §1) : sans APP_DATABASE_URL,
    // le serveur tourne superutilisateur et la RLS est contournée —
    // signalé une fois dans les logs, jamais silencieux.
    if (!process.env.APP_DATABASE_URL) {
      console.error(
        '[db] APP_DATABASE_URL absent : repli sur DATABASE_URL (RLS contournée, réservé à migrate/seed)'
      )
    }
    const connectionString =
      process.env.APP_DATABASE_URL ?? process.env.DATABASE_URL
    if (!connectionString) {
      throw new Error('APP_DATABASE_URL ou DATABASE_URL requis')
    }
    global.__pgPool = new Pool({ connectionString, max: 20 })
  }
  return global.__pgPool
}

// Moteur transactionnel unique (revue phase/5 §5) : `withUserScope` et
// `PgUnitOfWork` y délèguent — une seule implémentation du
// BEGIN/COMMIT/ROLLBACK. `userId: null` = sans contexte RLS (parcours
// publics sur tables non RLS).
export async function executerTransaction<T>(
  userId: string | null,
  travail: (client: PoolClient) => Promise<T>
): Promise<T> {
  if (transactionEnCours.getStore()) {
    throw new TransactionImbriquee(
      'executer imbriqué : composer en passant tx aux repositories, pas en réouvrant une transaction'
    )
  }
  const client = await getPool().connect()
  let ecarter = false
  try {
    await client.query('BEGIN')
    if (userId !== null) {
      await client.query("SELECT set_config('app.current_user_id', $1, true)", [userId])
    }
    const resultat = await transactionEnCours.run(client, () => travail(client))
    try {
      await client.query('COMMIT')
    } catch (erreurCommit) {
      // COMMIT sans accusé : validé ou avorté côté serveur, on ne sait
      // pas (revue phase/5 §6). Pas de ROLLBACK (transaction terminée),
      // connexion écartée par prudence, erreur typée (pas de compensation
      // chez l'appelant).
      ecarter = true
      throw new EcritureIncertaine('COMMIT sans accusé : écriture incertaine', erreurCommit)
    }
    return resultat
  } catch (erreur) {
    if (!(erreur instanceof EcritureIncertaine)) {
      try {
        await client.query('ROLLBACK')
      } catch (erreurRollback) {
        // Connexion cassée : le rollback ne doit pas masquer l'erreur
        // d'origine ; le client est écarté du pool, pas rendu.
        console.error('[transaction] ROLLBACK impossible, connexion écartée', erreurRollback)
        ecarter = true
      }
    }
    throw erreur
  } finally {
    client.release(ecarter ? new Error('connexion écartée du pool') : undefined)
  }
}

/**
 * Pose le contexte utilisateur pour la durée de la transaction — l'isolation
 * entre utilisateurs et entre entreprises est garantie par PostgreSQL (Row
 * Level Security, voir migrations/), ce helper ne fait qu'exposer l'id
 * courant aux policies. Délègue au moteur unique (revue phase/5 §5).
 */
export async function withUserScope<T>(
  userId: string,
  fn: (client: PoolClient) => Promise<T>
): Promise<T> {
  return executerTransaction(userId, fn)
}
