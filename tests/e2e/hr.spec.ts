import { RECEIPT_PNG, createNote, noteStatus } from './support/data'
import { expect, login, noteRow, test } from './support/fixtures'

test.describe('RH', () => {
  test('voit l’organigramme de son entreprise', async ({ page, company }) => {
    await login(page, company.hr)
    await page.getByRole('link', { name: 'RH' }).click()
    await expect(page).toHaveURL(/\/hr$/)

    // L'organigramme liste employés et managers, pas le RH lui-même.
    await expect(page.getByRole('heading', { name: 'Organigramme (2)' })).toBeVisible()
    const employeeRow = page.getByRole('row').filter({ hasText: company.employee.email })
    await expect(employeeRow).toContainText('employee')
    await expect(employeeRow.getByRole('combobox')).toHaveValue(company.manager.id)
    const managerRow = page.getByRole('row').filter({ hasText: company.manager.email })
    await expect(managerRow.getByRole('combobox')).toHaveValue('')
  })

  test('tranche les notes des managers racine, pas celles des employés', async ({
    page,
    company,
  }) => {
    const approvedId = await createNote(company.manager, { description: 'Salon pro' })
    const rejectedId = await createNote(company.manager, { description: 'Dîner perso' })
    await createNote(company.employee, { description: 'Note employé' })

    await login(page, company.hr)
    await page.goto('/hr')
    await expect(
      page.getByRole('heading', { name: 'Notes des managers racine en attente (2)' })
    ).toBeVisible()
    await expect(noteRow(page, 'Note employé')).toHaveCount(0)
    // La colonne auteur affiche le nom du manager.
    await expect(noteRow(page, 'Salon pro')).toContainText(company.manager.name)

    await noteRow(page, 'Salon pro').getByRole('button', { name: 'Approuver' }).click()
    await expect(noteRow(page, 'Salon pro')).toHaveCount(0)
    await noteRow(page, 'Dîner perso').getByRole('button', { name: 'Rejeter' }).click()
    await expect(noteRow(page, 'Dîner perso')).toHaveCount(0)

    expect(await noteStatus(approvedId)).toBe('approved')
    expect(await noteStatus(rejectedId)).toBe('rejected')
  })

  test('ouvre le reçu d’une note de manager racine', async ({ page, company }) => {
    await createNote(company.manager, { description: 'Péage autoroute' })

    await login(page, company.hr)
    await page.goto('/hr')
    const popupPromise = page.context().waitForEvent('page')
    await noteRow(page, 'Péage autoroute').getByRole('button', { name: 'Voir le reçu' }).click()
    const popup = await popupPromise
    // La popup naît sur about:blank : attendre l'URL signée avant de la lire.
    await popup.waitForURL(/\/receipts\/receipts\/\d+\.png\?/)

    const response = await popup.request.get(popup.url())
    expect(response.ok()).toBe(true)
    expect(Buffer.from(await response.body())).toEqual(RECEIPT_PNG)
  })

  test('détacher puis rattacher un employé change ce que voit le manager', async ({
    page,
    company,
  }) => {
    await createNote(company.employee, { description: 'Formation sécurité' })
    const managerSelect = () =>
      page
        .getByRole('row')
        .filter({ hasText: company.employee.email })
        .getByRole('combobox')

    await login(page, company.hr)
    await page.goto('/hr')
    await managerSelect().selectOption('')
    await expect(managerSelect()).toBeEnabled()
    await page.reload()
    await expect(managerSelect()).toHaveValue('')

    await page.getByRole('button', { name: 'Se déconnecter' }).click()
    await login(page, company.manager)
    await page.goto('/manager')
    await expect(page.getByText('Aucune note en attente.')).toBeVisible()

    await page.getByRole('button', { name: 'Se déconnecter' }).click()
    await login(page, company.hr)
    await page.goto('/hr')
    await managerSelect().selectOption(company.manager.id)
    await expect(managerSelect()).toBeEnabled()
    await page.reload()
    await expect(managerSelect()).toHaveValue(company.manager.id)

    await page.getByRole('button', { name: 'Se déconnecter' }).click()
    await login(page, company.manager)
    await page.goto('/manager')
    await expect(noteRow(page, 'Formation sécurité')).toBeVisible()
  })
})
