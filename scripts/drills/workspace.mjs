// Copie jetable du dépôt pour les drills de mutation.
//
// Les drills plantent des violations dans le code ; ils ne doivent jamais
// toucher le checkout de l'utilisateur. On copie les fichiers suivis et non
// ignorés (modifications en cours comprises) dans un dossier temporaire, et
// node_modules est lié plutôt que copié. Ce n'est pas un bac à sable de
// sécurité : le code exécuté garde les droits de l'utilisateur.
import { execFileSync, spawnSync } from 'node:child_process'
import { cpSync, existsSync, mkdtempSync, rmSync, symlinkSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'

export const ROOT = path.resolve(import.meta.dirname, '..', '..')

export function withWorkspace(fn) {
  const dir = mkdtempSync(path.join(tmpdir(), 'expense-io-drill-'))
  try {
    const files = execFileSync('git', ['ls-files', '-co', '--exclude-standard', '-z'], {
      cwd: ROOT,
      encoding: 'utf8',
    })
      .split('\0')
      .filter((file) => file && existsSync(path.join(ROOT, file)))
    for (const file of files) {
      cpSync(path.join(ROOT, file), path.join(dir, file), { recursive: true })
    }
    symlinkSync(path.join(ROOT, 'node_modules'), path.join(dir, 'node_modules'), 'dir')
    return fn(dir)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
}

// Binaire local du projet, sans passer par `npx` : un outil manquant doit
// échouer comme tel (ENOENT), pas comme un résultat d'analyse.
export const bin = (dir, name) => path.join(dir, 'node_modules', '.bin', name)

export function run(cwd, command, args) {
  const result = spawnSync(command, args, { cwd, encoding: 'utf8' })
  if (result.error) throw result.error
  return {
    code: result.status,
    stdout: result.stdout,
    output: `${result.stdout}${result.stderr}`,
  }
}

export function fail(message) {
  console.error(`✗ ${message}`)
  process.exit(1)
}
