import { test as base, expect, type Page } from '@playwright/test'
import {
  closeConnections,
  createCompany,
  deleteCompanyByDomain,
  type TestCompany,
  type TestUser,
} from './data'

export async function login(page: Page, user: Pick<TestUser, 'email' | 'password'>) {
  await page.goto('/login')
  await page.getByLabel('Email').fill(user.email)
  await page.getByLabel('Mot de passe').fill(user.password)
  await page.getByRole('button', { name: 'Se connecter' }).click()
  await expect(page).toHaveURL(/\/expenses$/)
}

// Ligne d'un tableau identifiée par la description de la note.
export function noteRow(page: Page, description: string) {
  return page.getByRole('row').filter({ hasText: description })
}

// Rejette une note depuis une liste de décision. Le résultat client est le
// même sur la référence et sur la version refactorée, mais la refactorée
// demande un motif (dérogation ADR-ARCH-003) : on le remplit quand le champ
// est présenté, sans l'exiger sur la référence.
export async function rejectNote(page: Page, description: string, motif: string) {
  const row = noteRow(page, description)
  await row.getByRole('button', { name: 'Rejeter' }).click()
  const motifField = row.getByLabel(/Motif du rejet/)
  if ((await motifField.count()) > 0) {
    await motifField.fill(motif)
    await row.getByRole('button', { name: 'Confirmer le rejet' }).click()
  }
  await expect(row).toHaveCount(0)
}

export const test = base.extend<{ company: TestCompany }, { dbConnections: void }>({
  // Une entreprise neuve par test, supprimée ensuite.
  company: async ({ dbConnections }, provide) => {
    void dbConnections
    const company = await createCompany()
    await provide(company)
    await deleteCompanyByDomain(company.domain)
  },
  // Ferme le pool PostgreSQL et le client S3 à la fin de chaque worker.
  dbConnections: [
    async ({}, provide) => {
      await provide()
      await closeConnections()
    },
    { scope: 'worker' },
  ],
})

export { expect }
