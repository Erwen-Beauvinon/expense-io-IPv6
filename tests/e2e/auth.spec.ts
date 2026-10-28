import { expect, login, test } from './support/fixtures'

test.describe('Authentification', () => {
  test('une page protégée redirige vers /login sans session', async ({ page }) => {
    for (const path of ['/expenses', '/manager', '/hr']) {
      await page.goto(path)
      await expect(page).toHaveURL(/\/login$/)
    }
  })

  test('un mauvais mot de passe affiche une erreur et reste sur /login', async ({
    page,
    company,
  }) => {
    await page.goto('/login')
    await page.getByLabel('Email').fill(company.employee.email)
    await page.getByLabel('Mot de passe').fill('mauvais-mot-de-passe')
    await page.getByRole('button', { name: 'Se connecter' }).click()

    await expect(page.getByRole('main').getByRole('alert')).toHaveText('Email ou mot de passe incorrect.')
    await expect(page).toHaveURL(/\/login$/)
  })

  test('chaque rôle arrive sur /expenses avec la navigation qui lui correspond', async ({
    page,
    company,
  }) => {
    const nav = page.getByRole('banner')

    await login(page, company.employee)
    await expect(nav.getByText(company.employee.email)).toBeVisible()
    await expect(nav.getByRole('link', { name: 'Manager' })).toHaveCount(0)
    await expect(nav.getByRole('link', { name: 'RH' })).toHaveCount(0)
    await nav.getByRole('button', { name: 'Se déconnecter' }).click()
    await expect(page).toHaveURL(/\/login$/)

    await login(page, company.manager)
    await expect(nav.getByRole('link', { name: 'Manager' })).toBeVisible()
    await expect(nav.getByRole('link', { name: 'RH' })).toHaveCount(0)
    await nav.getByRole('button', { name: 'Se déconnecter' }).click()

    await login(page, company.hr)
    await expect(nav.getByRole('link', { name: 'RH' })).toBeVisible()
    await expect(nav.getByRole('link', { name: 'Manager' })).toHaveCount(0)
  })

  test('après déconnexion, les pages protégées redeviennent inaccessibles', async ({
    page,
    company,
  }) => {
    await login(page, company.employee)
    await page.getByRole('button', { name: 'Se déconnecter' }).click()
    await expect(page).toHaveURL(/\/login$/)

    await page.goto('/expenses')
    await expect(page).toHaveURL(/\/login$/)
  })

  test('un employé ne voit pas le contenu des espaces manager et RH', async ({
    page,
    company,
  }) => {
    await login(page, company.employee)

    await page.goto('/manager')
    await expect(page.getByRole('heading', { name: 'Accès réservé aux managers' })).toBeVisible()

    await page.goto('/hr')
    await expect(page.getByRole('heading', { name: 'Accès réservé aux RH' })).toBeVisible()
  })
})
