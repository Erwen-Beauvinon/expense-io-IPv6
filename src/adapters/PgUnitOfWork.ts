import type { PoolClient } from 'pg'
import type { Acteur } from '@/domain/Acteur'
import type { Transaction } from '@/domain/Transaction'
import { executerTransaction } from '@/lib/db'
import type { UnitOfWork } from '@/ports/UnitOfWork'

// Généralisation de withUserScope : même moteur transactionnel
// (src/lib/db.ts : détection d'imbrication, rollback sûr, écriture
// incertaine typée — revue phase/5 §5/§6), mais la transaction est
// remise au travail sous forme de poignée opaque au lieu d'être
// cachée dans le port.
export class PgUnitOfWork implements UnitOfWork {
  async executer<T>(acteur: Acteur, travail: (tx: Transaction) => Promise<T>): Promise<T> {
    return executerTransaction(acteur.id, (client) =>
      travail({ client } as unknown as Transaction)
    )
  }

  async executerPublic<T>(travail: (tx: Transaction) => Promise<T>): Promise<T> {
    return executerTransaction(null, (client) =>
      travail({ client } as unknown as Transaction)
    )
  }
}

// Accès interne réservé aux repositories : extrait le client pg de la
// poignée opaque. Jamais importé hors de src/adapters.
export function clientDe(tx: Transaction): PoolClient {
  return (tx as unknown as { client: PoolClient }).client
}
