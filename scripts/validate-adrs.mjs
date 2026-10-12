// Vérifie le format des ADR de docs/adr/ (port Node de validate_adrs.py
// d'ai-ready-repo). Chaque ADR doit avoir :
//   - un frontmatter avec id, status (accepted|proposed|deprecated|superseded), scope
//   - un id identique au préfixe du nom de fichier
//   - une section « ## Verification » (commande qui prouve la contrainte)
//   - une section « ## Retirement » (quand supprimer ou revoir la règle)
import { readdirSync, readFileSync } from 'node:fs'
import path from 'node:path'

const ADR_DIR = path.resolve(import.meta.dirname, '..', 'docs', 'adr')
const VALID_STATUSES = new Set(['accepted', 'proposed', 'deprecated', 'superseded'])

const files = readdirSync(ADR_DIR)
  .filter((name) => name.endsWith('.md'))
  .sort()
if (files.length === 0) {
  console.error('✗ Aucun ADR dans docs/adr/')
  process.exit(1)
}

const errors = []
for (const name of files) {
  const content = readFileSync(path.join(ADR_DIR, name), 'utf8')
  const match = content.match(/^---\n([\s\S]*?)\n---/)
  if (!match) {
    errors.push(`${name}: frontmatter manquant ou mal formé (doit commencer par ---)`)
    continue
  }
  const frontmatter = match[1]
  for (const field of ['id', 'status', 'scope']) {
    if (!new RegExp(`^${field}:`, 'm').test(frontmatter)) {
      errors.push(`${name}: champ requis « ${field} » manquant`)
    }
  }
  const id = frontmatter.match(/^id:\s*(\S+)/m)?.[1]
  if (id && !name.startsWith(`${id}-`)) {
    errors.push(`${name}: l'id « ${id} » ne correspond pas au nom du fichier`)
  }
  const status = frontmatter.match(/^status:\s*(\S+)/m)?.[1]?.toLowerCase()
  if (status && !VALID_STATUSES.has(status)) {
    errors.push(`${name}: statut « ${status} » invalide (${[...VALID_STATUSES].join(', ')})`)
  }
  for (const section of ['Verification', 'Retirement']) {
    if (!new RegExp(`^## ${section}\\b`, 'm').test(content)) {
      errors.push(`${name}: section « ## ${section} » manquante`)
    }
  }
}

if (errors.length > 0) {
  console.error(`✗ Validation des ADR échouée (${errors.length} erreur(s)) :`)
  for (const error of errors) console.error(`  - ${error}`)
  process.exit(1)
}
console.log(`✓ ${files.length} ADR valides`)
