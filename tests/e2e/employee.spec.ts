import type { Page } from '@playwright/test'
import { RECEIPT_PNG, createNote } from './support/data'
import { expect, login, noteRow, test } from './support/fixtures'

// Rend un ticket de caisse lisible par Tesseract : du texte noir sur fond
// blanc, en grand, capturé en PNG par le navigateur lui-même.
async function renderReceipt(page: Page, lines: string[]): Promise<Buffer> {
  const receiptPage = await page.context().newPage()
  await receiptPage.setViewportSize({ width: 800, height: 400 })
  await receiptPage.setContent(
    `<body style="margin:0;background:#fff">
       <div id="receipt" style="padding:40px;font:48px Arial,sans-serif;color:#000;line-height:1.4">
         ${lines.map((line) => `<div>${line}</div>`).join('')}
       </div>
     </body>`
  )
  const png = await receiptPage.locator('#receipt').screenshot()
  await receiptPage.close()
  return png
}

test.describe('Employé', () => {
  test('soumet une note avec son reçu et la retrouve dans l’historique', async ({
    page,
    company,
  }) => {
    await login(page, company.employee)
    await expect(page.getByText('Aucune note de frais pour le moment.')).toBeVisible()

    await page.getByLabel('Montant (€)').fill('23.40')
    await page.getByLabel('Date').fill('2026-10-01')
    await page.getByLabel('Description').fill('Train Paris-Lyon')
    await page
      .getByLabel('Reçu (image ou PDF)')
      .setInputFiles({ name: 'recu.png', mimeType: 'image/png', buffer: RECEIPT_PNG })
    await page.getByRole('button', { name: 'Soumettre' }).click()

    const row = noteRow(page, 'Train Paris-Lyon')
    await expect(row).toBeVisible()
    await expect(row).toContainText('23,40')
    await expect(row).toContainText('en attente')
    await expect(page.getByText(/1 note · 23,40\s€ au total/)).toBeVisible()
    // Le formulaire est réinitialisé après succès.
    await expect(page.getByLabel('Description')).toHaveValue('')

    // La note survit à un rechargement : elle vient bien de l'API.
    await page.reload()
    await expect(noteRow(page, 'Train Paris-Lyon')).toContainText('en attente')
  })

  test('ne voit que ses propres notes', async ({ page, company }) => {
    await createNote(company.employee, { description: 'Note de l’employé' })
    await createNote(company.manager, { description: 'Note du manager' })

    await login(page, company.employee)
    await expect(noteRow(page, 'Note de l’employé')).toBeVisible()
    await expect(noteRow(page, 'Note du manager')).toHaveCount(0)
  })

  test('ouvre le reçu d’une de ses notes', async ({ page, company }) => {
    await createNote(company.employee, { description: 'Hôtel Lyon' })
    await login(page, company.employee)

    const popupPromise = page.context().waitForEvent('page')
    await noteRow(page, 'Hôtel Lyon').getByRole('button', { name: 'Voir le reçu' }).click()
    const popup = await popupPromise
    // La popup naît sur about:blank : attendre l'URL signée avant de la lire.
    await popup.waitForURL(/\/receipts\/receipts\/\d+\.png\?/)

    // URL signée vers le bucket : le fichier est servi et c'est bien le reçu.
    expect(popup.url()).toMatch(/\/receipts\/receipts\/\d+\.png\?/)
    const response = await popup.request.get(popup.url())
    expect(response.ok()).toBe(true)
    expect(Buffer.from(await response.body())).toEqual(RECEIPT_PNG)
  })

  test('pré-remplit montant et date depuis le reçu (OCR)', async ({ page, company }) => {
    test.slow() // Tesseract tourne dans le serveur web, premier appel lent.
    const receipt = await renderReceipt(page, [
      'RESTAURANT LE BISTROT',
      'Date : 14/03/2026',
      'TOTAL TTC 37,80 EUR',
    ])

    await login(page, company.employee)
    await page
      .getByLabel('Reçu (image ou PDF)')
      .setInputFiles({ name: 'ticket.png', mimeType: 'image/png', buffer: receipt })
    await page.getByRole('button', { name: 'Pré-remplir depuis le reçu' }).click()

    await expect(page.getByLabel('Montant (€)')).toHaveValue('37.8', { timeout: 45_000 })
    await expect(page.getByLabel('Date')).toHaveValue('2026-03-14')
  })

  test('le pré-remplissage sans reçu demande d’en choisir un', async ({ page, company }) => {
    await login(page, company.employee)
    await page.getByRole('button', { name: 'Pré-remplir depuis le reçu' }).click()
    await expect(page.getByRole('main').getByRole('alert')).toHaveText('Sélectionne d’abord un reçu.')
  })
})
