// Fige le comportement actuel de l'inscription : le premier compte d'un
// domaine fonde l'entreprise et devient RH, les suivants la rejoignent comme
// employés. L'audit (F06) juge ce comportement inadapté à un service réel :
// si le pilote 2 le change, ce test doit changer avec lui, dans la même PR.
import { deleteCompanyByDomain, uniqueDomain, userByEmail } from './support/data'
import { expect, test } from './support/fixtures'

// L'inscription enchaîne deux bcrypt de coût 12 (hachage puis vérification
// par signIn) en JavaScript pur, plus la transaction et le rendu de
// /expenses : 2 à 5 s mesurées sous `next dev` avec deux workers, au-delà
// des 5 s par défaut d'expect. Seul le délai change, pas ce qui est vérifié.
const DELAI_REDIRECTION_INSCRIPTION = 10_000

test.describe('Inscription', () => {
  let domain: string

  test.beforeEach(() => {
    domain = uniqueDomain()
  })

  test.afterEach(async () => {
    await deleteCompanyByDomain(domain)
  })

  test('le premier inscrit devient RH, le second rejoint l’entreprise comme employé', async ({
    page,
  }) => {
    const nav = page.getByRole('banner')

    await page.goto('/signup')
    await page.getByLabel('Nom').fill('Fondatrice')
    await page.getByLabel('Email').fill(`fondatrice@${domain}`)
    await page.getByLabel('Mot de passe').fill('motdepasse-1')
    await page.getByRole('button', { name: "S'inscrire" }).click()

    await expect(page).toHaveURL(/\/expenses$/, { timeout: DELAI_REDIRECTION_INSCRIPTION })
    await expect(nav.getByRole('link', { name: 'RH' })).toBeVisible()
    await nav.getByRole('button', { name: 'Se déconnecter' }).click()

    await page.goto('/signup')
    await page.getByLabel('Nom').fill('Recrue')
    await page.getByLabel('Email').fill(`recrue@${domain}`)
    await page.getByLabel('Mot de passe').fill('motdepasse-2')
    await page.getByRole('button', { name: "S'inscrire" }).click()

    await expect(page).toHaveURL(/\/expenses$/, { timeout: DELAI_REDIRECTION_INSCRIPTION })
    await expect(nav.getByRole('link', { name: 'RH' })).toHaveCount(0)

    const founder = await userByEmail(`fondatrice@${domain}`)
    const recruit = await userByEmail(`recrue@${domain}`)
    expect(founder?.role).toBe('hr_admin')
    expect(recruit?.role).toBe('employee')
    expect(recruit?.companyId).toBe(founder?.companyId)
  })

  test('un email déjà utilisé est refusé', async ({ page }) => {
    async function signup() {
      await page.goto('/signup')
      await page.getByLabel('Nom').fill('Doublon')
      await page.getByLabel('Email').fill(`doublon@${domain}`)
      await page.getByLabel('Mot de passe').fill('motdepasse-1')
      await page.getByRole('button', { name: "S'inscrire" }).click()
    }

    await signup()
    await expect(page).toHaveURL(/\/expenses$/, { timeout: DELAI_REDIRECTION_INSCRIPTION })
    await page.getByRole('button', { name: 'Se déconnecter' }).click()

    await signup()
    await expect(page.getByRole('main').getByRole('alert')).toHaveText('Un compte existe déjà avec cet email.')
    await expect(page).toHaveURL(/\/signup$/)
  })
})
