import { config as loadEnv } from 'dotenv'
import { defineConfig, devices } from '@playwright/test'

// Les E2E parlent à la même base et au même bucket que l'application :
// en local via .env, en CI via les variables du job.
loadEnv({ quiet: true })

const PORT = Number(process.env.E2E_PORT ?? 3000)
const BASE_URL = `http://localhost:${PORT}`

export default defineConfig({
  testDir: 'tests/e2e',
  // Chaque test crée sa propre entreprise (tests/e2e/support/data.ts) :
  // les tests sont indépendants et peuvent tourner en parallèle.
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: process.env.CI ? 2 : undefined,
  reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : 'list',
  timeout: 60_000,
  use: {
    baseURL: BASE_URL,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    // En CI on teste le build de production ; en local `next dev` suffit et
    // un serveur déjà lancé (make dev) est réutilisé.
    command: process.env.CI ? 'npm run start' : 'npm run dev',
    url: BASE_URL,
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
    env: { PORT: String(PORT), AUTH_TRUST_HOST: 'true' },
  },
})
