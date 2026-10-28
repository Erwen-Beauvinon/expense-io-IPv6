import path from 'node:path'
import { config as loadEnv } from 'dotenv'
import { defineConfig } from 'vitest/config'

// Même base et mêmes secrets que l'application (revue phase/7 §4) :
// en local via .env, en CI via les variables du job.
loadEnv({ quiet: true })

export default defineConfig({
  resolve: {
    alias: { '@': path.resolve(__dirname, 'src') },
  },
  test: {
    // Les tests d'intégration s'auto-ignorent sans RUN_INTEGRATION=1
    // (revues phases/7-8) : inclus ici pour supprimer le contournement
    // par copie temporaire — `npm test` reste vert sans base.
    include: ['tests/unit/**/*.test.ts', 'tests/integration/**/*.test.ts'],
    environment: 'node',
  },
})
