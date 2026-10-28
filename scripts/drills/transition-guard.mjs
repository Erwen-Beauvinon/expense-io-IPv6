// Drill ADR-DOMAIN-001 : les tests unitaires sont couplés à la garde de
// transition de ExpenseNote. Dans une copie jetable, on retire la garde de
// approve() puis de reject() ; la suite doit alors échouer sur le test qui
// protège cette transition. Un contrôle sans mutation doit passer d'abord.
import { readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { bin, fail, run, withWorkspace } from './workspace.mjs'

const SUBJECT = 'src/domain/ExpenseNote.ts'
const TEST = 'tests/unit/domain/ExpenseNote.test.ts'

const MUTATIONS = [
  { method: 'approve', expectedFailure: 'refuse d’approuver une note déjà' },
  { method: 'reject', expectedFailure: 'refuse de rejeter une note déjà' },
]

function vitest(dir) {
  return run(dir, bin(dir, 'vitest'), ['run', TEST, '--reporter=verbose'])
}

withWorkspace((dir) => {
  const control = vitest(dir)
  if (control.code !== 0) fail(`Le contrôle sans mutation échoue déjà :\n${control.output}`)
  console.log('✓ contrôle : la suite passe sans mutation')

  const file = path.join(dir, SUBJECT)
  const original = readFileSync(file, 'utf8')
  for (const { method, expectedFailure } of MUTATIONS) {
    const guard = new RegExp(
      `(${method}\\(\\): ExpenseNote \\{)\\s*if \\(!this\\.canBeDecided\\(\\)\\) \\{[^}]*\\}`
    )
    const mutated = original.replace(guard, '$1')
    // Une substitution qui ne trouve rien donnerait un drill « vert » qui
    // n'a rien testé : on exige que la mutation ait bien été appliquée.
    if (mutated === original) fail(`Garde de ${method}() introuvable dans ${SUBJECT}`)
    writeFileSync(file, mutated)

    const result = vitest(dir)
    if (result.code === 0) fail(`Garde de ${method}() retirée, mais les tests passent toujours`)
    if (!result.output.includes(expectedFailure)) {
      fail(`Les tests échouent sans viser ${method}() :\n${result.output}`)
    }
    console.log(`✓ garde de ${method}() retirée → « ${expectedFailure} … » échoue`)
    writeFileSync(file, original)
  }
})
