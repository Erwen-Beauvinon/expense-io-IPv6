// Compare une capture du contrat client à la référence
// (tests/contract/golden.reference.json) — revue phase/1 §5 :
// le golden est une preuve exécutable, pas un fichier lu par personne.
// Usage : node scripts/capture-golden.mjs > /tmp/golden.live.json
//         && node scripts/check-golden.mjs /tmp/golden.live.json
//         (ou `make golden`, BASE identique à la capture).
// Sortie 0 si identique, 1 avec les écarts sinon (max 20 affichés).
import fs from 'node:fs'

const [fichier] = process.argv.slice(2)
if (!fichier) {
  console.error('Usage : node scripts/check-golden.mjs <capture.json>')
  process.exit(2)
}

const reference = JSON.parse(
  fs.readFileSync('tests/contract/golden.reference.json', 'utf8')
)
const capture = JSON.parse(fs.readFileSync(fichier, 'utf8'))

const ecarts = []
function comparer(chemin, attendu, recu) {
  if (Object.is(attendu, recu)) return
  if (
    attendu &&
    recu &&
    typeof attendu === 'object' &&
    typeof recu === 'object'
  ) {
    const cles = new Set([...Object.keys(attendu), ...Object.keys(recu)])
    for (const cle of cles) {
      comparer(`${chemin}.${cle}`, attendu[cle], recu[cle])
      if (ecarts.length >= 20) return
    }
    return
  }
  ecarts.push(`${chemin} : attendu ${JSON.stringify(attendu)}, reçu ${JSON.stringify(recu)}`)
}

comparer('$', reference, capture)

if (ecarts.length > 0) {
  console.error(`GOLDEN ÉCART (${ecarts.length}) :`)
  for (const ecart of ecarts) console.error(`  ${ecart}`)
  process.exit(1)
}
console.log('GOLDEN OK : capture identique à la référence.')
