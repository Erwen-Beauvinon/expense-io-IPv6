// Drill ADR-ARCH-001 : les frontières d'import ESLint rejettent chaque arête
// interdite, laissent passer chaque arête légale, et une erreur de syntaxe
// n'est pas confondue avec une violation de frontière.
//
// Usage : node scripts/drills/boundaries.mjs deny|permit|reason
import { writeFileSync } from 'node:fs'
import path from 'node:path'
import { bin, fail, run, withWorkspace } from './workspace.mjs'

const FORBIDDEN = [
  ['src/domain', "import { getPool } from '@/lib/db'"],
  ['src/domain', "import { getPool } from '../lib/db'"],
  ['src/domain', "import { Pool } from 'pg'"],
  ['src/domain', "import { S3ReceiptAdapter } from '@/adapters/S3ReceiptAdapter'"],
  ['src/ports', "import { S3ReceiptAdapter } from '@/adapters/S3ReceiptAdapter'"],
  ['src/ports', "import { getPool } from '@/lib/db'"],
  ['src/utils', "import { User } from '@/domain/User'"],
  ['src/utils', "import { auth } from '@/lib/auth'"],
  ['src/lib', "import { NavItem } from '@/components/NavItem'"],
  ['src/adapters', "import { NavItem } from '@/components/NavItem'"],
  ['src/components', "import { getPool } from '@/lib/db'"],
  ['src/components', "import { S3Client } from '@aws-sdk/client-s3'"],
]

const PERMITTED = [
  ['src/domain', "import { User } from './User'"],
  ['src/ports', "import { ExpenseNote } from '@/domain/ExpenseNote'"],
  ['src/adapters', "import type { ReceiptStoragePort } from '@/ports/ReceiptStoragePort'"],
  ['src/adapters', "import { getPool } from '@/lib/db'"],
  ['src/app', "import { ExpenseNote } from '@/domain/ExpenseNote'"],
  ['src/app', "import { getPool } from '@/lib/db'"],
  ['src/components', "import { formatCurrency } from '@/utils/format'"],
]

// Plante une sonde par cas, puis lance ESLint une seule fois sur toutes.
function lintProbes(dir, cases) {
  const probes = cases.map(([layer, statement], index) => {
    const file = path.join(layer, `__drill_${index}__.ts`)
    const binding = statement.match(/\{\s*(?:type\s+)?(\w+)/)[1]
    writeFileSync(path.join(dir, file), `${statement}\nexport const probe = ${binding}\n`)
    return { file, layer, statement }
  })
  const { stdout } = run(dir, bin(dir, 'eslint'), [
    '--no-cache',
    '--format',
    'json',
    ...probes.map((p) => p.file),
  ])
  const reports = JSON.parse(stdout)
  return probes.map((probe) => {
    const report = reports.find((r) => r.filePath === path.join(dir, probe.file))
    if (!report) fail(`ESLint n'a pas analysé ${probe.file}`)
    return { ...probe, messages: report.messages }
  })
}

const isBoundary = (m) => m.ruleId === 'no-restricted-imports' && m.message.includes('ADR-ARCH-001')

const mode = process.argv[2]
withWorkspace((dir) => {
  if (mode === 'deny') {
    for (const probe of lintProbes(dir, FORBIDDEN)) {
      if (!probe.messages.some(isBoundary)) {
        fail(`Arête interdite non rejetée : ${probe.layer} ← ${probe.statement}`)
      }
      console.log(`✓ rejetée  ${probe.layer.padEnd(15)} ${probe.statement}`)
    }
  } else if (mode === 'permit') {
    for (const probe of lintProbes(dir, PERMITTED)) {
      const blocked = probe.messages.filter(isBoundary)
      if (blocked.length > 0) {
        fail(`Arête légale rejetée : ${probe.layer} ← ${probe.statement}\n${blocked[0].message}`)
      }
      console.log(`✓ permise  ${probe.layer.padEnd(15)} ${probe.statement}`)
    }
  } else if (mode === 'reason') {
    const [probe] = lintProbes(dir, [['src/domain', "import { getPool } from '@/lib/db' {{{"]])
    const fatal = probe.messages.find((m) => m.fatal)
    if (!fatal || probe.messages.some(isBoundary)) {
      fail(`Erreur de syntaxe non distinguée d'une violation de frontière :\n${JSON.stringify(probe.messages)}`)
    }
    console.log(`✓ erreur de syntaxe distinguée d'une violation de frontière (${fatal.message})`)
  } else {
    fail(`Mode inconnu : ${mode} (deny|permit|reason)`)
  }
})
