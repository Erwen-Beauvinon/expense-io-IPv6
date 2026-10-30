import { RECEIPT_PNG, createNote, noteStatus } from './support/data'
import { expect, login, noteRow, test } from './support/fixtures'

const ERREUR_RESEAU = 'Connexion impossible. Vérifie ton réseau et réessaie.'

test.describe('Manager', () => {
  test('voit les notes en attente de son équipe, pas les siennes', async ({ page, company }) => {
    await createNote(company.employee, { description: 'Déjeuner équipe', amount: 64 })
    await createNote(company.manager, { description: 'Note perso du manager' })

    await login(page, company.manager)
    await page.getByRole('link', { name: 'Manager' }).click()
    await expect(page).toHaveURL(/\/manager$/)

    await expect(page.getByRole('heading', { name: 'En attente (1)' })).toBeVisible()
    await expect(noteRow(page, 'Déjeuner équipe')).toContainText('64,00')
    await expect(noteRow(page, 'Note perso du manager')).toHaveCount(0)
  })

  test('approuve une note : elle quitte la liste et l’employé la voit approuvée', async ({
    page,
    company,
  }) => {
    const noteId = await createNote(company.employee, { description: 'Taxi client' })

    await login(page, company.manager)
    await page.goto('/manager')
    await noteRow(page, 'Taxi client').getByRole('button', { name: 'Approuver' }).click()

    await expect(noteRow(page, 'Taxi client')).toHaveCount(0)
    await expect(page.getByText('Aucune note en attente.')).toBeVisible()
    expect(await noteStatus(noteId)).toBe('approved')

    await page.getByRole('button', { name: 'Se déconnecter' }).click()
    await login(page, company.employee)
    await expect(noteRow(page, 'Taxi client')).toContainText('approuvée')
  })

  test('rejette une note : l’employé la voit rejetée', async ({ page, company }) => {
    const noteId = await createNote(company.employee, { description: 'Abonnement presse' })

    await login(page, company.manager)
    await page.goto('/manager')
    await noteRow(page, 'Abonnement presse').getByRole('button', { name: 'Rejeter' }).click()
    await noteRow(page, 'Abonnement presse').getByLabel(/Motif du rejet/).fill('Justificatif illisible')
    await noteRow(page, 'Abonnement presse').getByRole('button', { name: 'Confirmer le rejet' }).click()

    await expect(noteRow(page, 'Abonnement presse')).toHaveCount(0)
    expect(await noteStatus(noteId)).toBe('rejected')

    await page.getByRole('button', { name: 'Se déconnecter' }).click()
    await login(page, company.employee)
    await expect(noteRow(page, 'Abonnement presse')).toContainText('rejetée')
  })

  test('ouvre le reçu d’une note de son équipe', async ({ page, company }) => {
    await createNote(company.employee, { description: 'Parking gare' })

    await login(page, company.manager)
    await page.goto('/manager')
    const popupPromise = page.context().waitForEvent('page')
    await noteRow(page, 'Parking gare').getByRole('button', { name: 'Voir le reçu' }).click()
    const popup = await popupPromise
    // La popup naît sur about:blank : attendre l'URL signée avant de la lire.
    await popup.waitForURL(/\/receipts\/receipts\/\d+\.png\?/)

    const response = await popup.request.get(popup.url())
    expect(response.ok()).toBe(true)
    expect(Buffer.from(await response.body())).toEqual(RECEIPT_PNG)
  })

  // Audit F12 : une décision perdue sur le réseau ne bloque pas la ligne.
  test('une coupure réseau à l’approbation affiche une alerte et réactive le bouton', async ({
    page,
    company,
  }) => {
    const noteId = await createNote(company.employee, { description: 'Hôtel Nantes' })
    await page.route('**/api/manager/expense-notes/*/approve', (route) =>
      route.abort('internetdisconnected')
    )

    await login(page, company.manager)
    await page.goto('/manager')
    await noteRow(page, 'Hôtel Nantes').getByRole('button', { name: 'Approuver' }).click()

    await expect(page.getByRole('main').getByRole('alert')).toHaveText(ERREUR_RESEAU)
    await expect(noteRow(page, 'Hôtel Nantes').getByRole('button', { name: 'Approuver' })).toBeEnabled()
    expect(await noteStatus(noteId)).toBe('pending')
  })

  test('une coupure réseau au rejet conserve le motif saisi', async ({ page, company }) => {
    await createNote(company.employee, { description: 'Location voiture' })
    await page.route('**/api/manager/expense-notes/*/reject', (route) =>
      route.abort('internetdisconnected')
    )

    await login(page, company.manager)
    await page.goto('/manager')
    const row = noteRow(page, 'Location voiture')
    await row.getByRole('button', { name: 'Rejeter' }).click()
    await row.getByLabel(/Motif du rejet/).fill('Hors politique voyage')
    await row.getByRole('button', { name: 'Confirmer le rejet' }).click()

    await expect(page.getByRole('main').getByRole('alert')).toHaveText(ERREUR_RESEAU)
    await expect(row.getByLabel(/Motif du rejet/)).toHaveValue('Hors politique voyage')
    await expect(row.getByRole('button', { name: 'Confirmer le rejet' })).toBeEnabled()
  })
})
