// Tests fonctionnels ajoutés comme référence « vue client » : ils décrivent
// ce qu'un utilisateur voit et obtient, sans dépendre de l'implémentation.
// Écrits sur la version de référence (main), ils doivent passer à
// l'identique sur la version refactorée (V2 + phases 1 à 8).
import { RECEIPT_PNG, createCompany, createNote, deleteCompanyByDomain } from './support/data'
import { expect, login, noteRow, test } from './support/fixtures'

test.describe('Référence client — ajouts', () => {
  test('le compteur et le total suivent les notes soumises par l’employé', async ({
    page,
    company,
  }) => {
    await login(page, company.employee)

    for (const [description, montant] of [
      ['Taxi gare', '10.00'],
      ['Repas client', '32.50'],
    ] as const) {
      await page.getByLabel('Montant (€)').fill(montant)
      await page.getByLabel('Date').fill('2026-10-02')
      await page.getByLabel('Description').fill(description)
      await page
        .getByLabel('Reçu (image ou PDF)')
        .setInputFiles({ name: 'recu.png', mimeType: 'image/png', buffer: RECEIPT_PNG })
      await page.getByRole('button', { name: 'Soumettre' }).click()
      await expect(noteRow(page, description)).toBeVisible()
    }

    await expect(page.getByText(/2 notes · 42,50\s€ au total/)).toBeVisible()
    await expect(noteRow(page, 'Taxi gare')).toContainText('en attente')
    await expect(noteRow(page, 'Repas client')).toContainText('en attente')
  })

  test('une soumission sans reçu est refusée par le formulaire et ne crée rien', async ({
    page,
    company,
  }) => {
    await login(page, company.employee)
    await page.getByLabel('Montant (€)').fill('15.00')
    await page.getByLabel('Date').fill('2026-10-02')
    await page.getByLabel('Description').fill('Note sans reçu')
    await page.getByRole('button', { name: 'Soumettre' }).click()

    // Le champ reçu est requis : le navigateur bloque l'envoi.
    const receiptInput = page.getByLabel('Reçu (image ou PDF)')
    await expect(receiptInput).toHaveJSProperty('validity.valueMissing', true)
    await expect(noteRow(page, 'Note sans reçu')).toHaveCount(0)
    await expect(page.getByText('Aucune note de frais pour le moment.')).toBeVisible()
  })

  test('un employé ne voit ni les notes ni le reçu d’une autre entreprise', async ({
    page,
    company,
  }) => {
    const autre = await createCompany()
    try {
      const foreignId = await createNote(autre.employee, { description: 'Note étrangère' })
      await createNote(company.employee, { description: 'Note maison' })

      await login(page, company.employee)
      await expect(noteRow(page, 'Note maison')).toBeVisible()
      await expect(noteRow(page, 'Note étrangère')).toHaveCount(0)

      // Même en forgeant l'appel que ferait le bouton « Voir le reçu »,
      // le serveur ne délivre pas d'URL pour la note d'une autre entreprise.
      const status = await page.evaluate(async (id) => {
        const response = await fetch(`/api/expense-notes/${id}/receipt-url`)
        return response.status
      }, foreignId)
      expect([403, 404]).toContain(status)
    } finally {
      await deleteCompanyByDomain(autre.domain)
    }
  })

  test('le reçu d’un collègue de la même entreprise reste inaccessible à l’employé', async ({
    page,
    company,
  }) => {
    const colleagueNoteId = await createNote(company.manager, {
      description: 'Note du manager',
    })

    await login(page, company.employee)
    await expect(noteRow(page, 'Note du manager')).toHaveCount(0)

    const status = await page.evaluate(async (id) => {
      const response = await fetch(`/api/expense-notes/${id}/receipt-url`)
      return response.status
    }, colleagueNoteId)
    expect([403, 404]).toContain(status)
  })

  test('une note approuvée reste visible et comptée après rechargement', async ({
    page,
    company,
  }) => {
    await createNote(company.employee, { description: 'Hôtel mission', amount: 89.9 })

    await login(page, company.manager)
    await page.goto('/manager')
    await noteRow(page, 'Hôtel mission').getByRole('button', { name: 'Approuver' }).click()
    await expect(noteRow(page, 'Hôtel mission')).toHaveCount(0)

    await page.getByRole('button', { name: 'Se déconnecter' }).click()
    await login(page, company.employee)
    await page.reload()
    const row = noteRow(page, 'Hôtel mission')
    await expect(row).toContainText('approuvée')
    await expect(row).toContainText('89,90')
    await expect(page.getByText(/1 note · 89,90\s€ au total/)).toBeVisible()
  })
})
