// Inscrire branché sur la vraie base (revue phase/7 §4) : rejouable —
// domaine aléatoire par passage, nettoyage en afterAll. Les tests
// s'auto-ignorent sans RUN_INTEGRATION=1 (inclus dans `npm test` via
// vitest.config, exécutés pour de vrai dans le job E2E de la CI).
// Lancer avec : RUN_INTEGRATION=1 npx vitest run tests/integration
import { Pool } from 'pg'
import { afterAll, describe, expect, it } from 'vitest'
import { PgAnnuaireOrganisation } from '@/adapters/PgAnnuaireOrganisation'
import { PgUnitOfWork } from '@/adapters/PgUnitOfWork'
import { inscrire } from '@/application/Inscrire'
import { DonneesInvalides } from '@/domain/errors'

const LANCER = process.env.RUN_INTEGRATION === '1'
const suite = LANCER ? describe : describe.skip

suite('inscrire contre PostgreSQL réel (I14, I15)', () => {
  const deps = {
    annuaire: new PgAnnuaireOrganisation(),
    unitOfWork: new PgUnitOfWork(),
    hacherMotDePasse: async (clair: string) => `hash(${clair})`,
  }
  // Domaine unique par passage : rejouer le fichier ne rejoue jamais
  // les mêmes lignes (revue phase/7 §4).
  const suffix = `it7-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}.example.com`

  afterAll(async () => {
    // Nettoyage via le compte d'administration : le rôle applicatif
    // n'a aucun DELETE (privilèges minimaux, revue phase/8 §5).
    const admin = new Pool({ connectionString: process.env.DATABASE_URL, max: 1 })
    try {
      await admin.query('DELETE FROM users WHERE email LIKE $1', [`%@${suffix}`])
      await admin.query('DELETE FROM companies WHERE email_domain = $1', [suffix])
    } finally {
      await admin.end()
    }
  })

  it('premier inscrit = RH, second = employé, doublon refusé', async () => {
    const premier = await inscrire(
      { nom: 'Première', email: `premiere@${suffix}`, motDePasse: 's3cret!!' },
      deps
    )
    const second = await inscrire(
      { nom: 'Second', email: `second@${suffix}`, motDePasse: 's3cret!!' },
      deps
    )
    expect(premier.role).toBe('hr_admin')
    expect(second.role).toBe('employee')
    expect(second.companyId).toBe(premier.companyId)
    await expect(
      inscrire({ nom: 'Doublon', email: `premiere@${suffix}`, motDePasse: 's3cret!!' }, deps)
    ).rejects.toThrowError(new DonneesInvalides('Un compte existe déjà avec cet email.'))
  })
})
