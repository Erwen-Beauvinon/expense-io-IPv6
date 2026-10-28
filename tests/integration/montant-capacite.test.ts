// MONTANT_MAX (domaine) prouvé contre la colonne numeric(10,2) réelle :
// si l'une des deux bornes change sans l'autre, ce test échoue.
// Lancer avec : RUN_INTEGRATION=1 npx vitest run tests/integration
// Exécuté dans le job E2E de la CI (PostgreSQL éphémère).
import { Pool } from 'pg'
import { describe, expect, it } from 'vitest'
import { MONTANT_MAX } from '@/domain/Montant'

const LANCER = process.env.RUN_INTEGRATION === '1'
const suite = LANCER ? describe : describe.skip

suite('capacité de expense_notes.amount (I1)', () => {
  it('accepte MONTANT_MAX et refuse le centime au-dessus', async () => {
    const admin = new Pool({ connectionString: process.env.DATABASE_URL, max: 1 })
    try {
      const accepte = await admin.query<{ valeur: string }>(
        'SELECT $1::numeric(10,2)::text AS valeur',
        [MONTANT_MAX]
      )
      expect(accepte.rows[0].valeur).toBe('99999999.99')
      await expect(
        admin.query('SELECT $1::numeric(10,2)', [MONTANT_MAX + 0.01])
      ).rejects.toThrow(/numeric field overflow/)
    } finally {
      await admin.end()
    }
  })
})
