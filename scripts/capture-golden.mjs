// Capture de référence du contrat client (docs/contrat-client-fige.md §7).
// Usage : serveur Next lancé sur $BASE (défaut http://localhost:3100),
// base re-seedée avant chaque capture. Sortie : JSON normalisé sur stdout.
const BASE = process.env.BASE || 'http://localhost:3100'

const USERS = {
  employee: { email: 'demo@expense.io', password: 'demo1234' },
  manager: { email: 'manager@expense.io', password: 'manager1234' },
  hr: { email: 'hr@expense.io', password: 'hr1234' },
}

function normalize(value) {
  if (Array.isArray(value)) return value.map(normalize)
  if (value && typeof value === 'object') {
    const out = {}
    for (const [k, v] of Object.entries(value)) out[k] = normalize(v)
    if (typeof out.id === 'string') out.id = '<uuid>'
    if (typeof out.userId === 'string') out.userId = '<uuid>'
    if (typeof out.managerId === 'string') out.managerId = '<uuid>'
    if (typeof out.receiptKey === 'string') out.receiptKey = '<receiptKey>'
    if (typeof out.url === 'string') out.url = '<signedUrl>'
    if (typeof out.createdAt === 'string') out.createdAt = '<isoDate>'
    // Les notes décidées portent déjà decided_by/at en base ? Non : pas de
    // colonnes à cette révision — si présentes un jour, elles resteraient
    // internes et absentes du JSON. Rien à normaliser.
    return out
  }
  return value
}

async function login({ email, password }) {
  const csrfRes = await fetch(`${BASE}/api/auth/csrf`)
  const { csrfToken } = await csrfRes.json()
  const cookies = csrfRes.headers.get('set-cookie') || ''
  const body = new URLSearchParams({ csrfToken, email, password, json: 'true' })
  const res = await fetch(`${BASE}/api/auth/callback/credentials`, {
    method: 'POST',
    headers: {
      'content-type': 'application/x-www-form-urlencoded',
      cookie: cookies.split(',').map((c) => c.split(';')[0]).join('; '),
    },
    body,
    redirect: 'manual',
  })
  const setCookie = res.headers.get('set-cookie') || ''
  if (res.status !== 200 && res.status !== 302) {
    throw new Error(`login ${email} -> ${res.status}: ${await res.text()}`)
  }
  const jar = [...cookies.split(','), ...setCookie.split(',')]
    .map((c) => c.split(';')[0].trim())
    .filter(Boolean)
    .join('; ')
  return async (path, init = {}) => {
    const r = await fetch(`${BASE}${path}`, {
      ...init,
      headers: { ...(init.headers || {}), cookie: jar },
    })
    let json = null
    try { json = await r.json() } catch { /* corps vide */ }
    return { status: r.status, body: json }
  }
}

const png1x1 = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64'
)

const out = {}
for (const [role, creds] of Object.entries(USERS)) {
  const api = await login(creds)
  out[role] = {
    C01_list: await api('/api/expense-notes'),
    C03_suggest: await api('/api/expense-notes/receipt-suggestion', {
      method: 'POST',
      body: (() => { const f = new FormData(); f.set('receipt', new File([png1x1], 'r.png', { type: 'image/png' })); return f })(),
    }),
  }
}
// URLs de reçus sur la première note de chacun
for (const role of Object.keys(USERS)) {
  const list = out[role].C01_list.body
  const firstOwn = Array.isArray(list) && list[0] ? list[0] : null
  out[role].C04_receipt = firstOwn
    ? await (await login(USERS[role]))(`/api/expense-notes/${firstOwn.id}/receipt-url`)
    : { status: 'skip', body: null }
}
// Parcours manager (liste, reçu, décision sur la note de demo si présente)
{
  const api = await login(USERS.manager)
  out.manager.C05_list = await api('/api/manager/expense-notes')
  const first = Array.isArray(out.manager.C05_list.body) ? out.manager.C05_list.body[0] : null
  if (first && first.id) {
    out.manager.C06_receipt = await api(`/api/manager/expense-notes/${first.id}/receipt-url`)
    out.manager.C07_reject_sans_motif = await api(`/api/manager/expense-notes/${first.id}/reject`, { method: 'POST' })
    out.manager.C07_reject = await api(`/api/manager/expense-notes/${first.id}/reject`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ reason: 'Montant incohérent avec le reçu' }),
    })
  } else {
    out.manager.C06_receipt = { status: 'skip', body: null }
    out.manager.C07_reject_sans_motif = { status: 'skip', body: null }
    out.manager.C07_reject = { status: 'skip', body: null }
  }
}
// Parcours RH (annuaire, liste, reçu, rattachement idempotent, décision)
{
  const api = await login(USERS.hr)
  out.hr.C08_users = await api('/api/hr/users')
  out.hr.C09_list = await api('/api/hr/expense-notes')
  const users = Array.isArray(out.hr.C08_users.body) ? out.hr.C08_users.body : []
  const demo = users.find((u) => u.email === 'demo@expense.io')
  const mgr = users.find((u) => u.role === 'manager')
  out.hr.C11_assign_same = demo && mgr
    ? await api(`/api/hr/users/${demo.id}/manager`, {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ managerId: mgr.id }),
      })
    : { status: 'skip', body: null }
  const first = Array.isArray(out.hr.C09_list.body) ? out.hr.C09_list.body[0] : null
  if (first && first.id) {
    out.hr.C10_receipt = await api(`/api/hr/expense-notes/${first.id}/receipt-url`)
    out.hr.C11_reject_sans_motif = await api(`/api/hr/expense-notes/${first.id}/reject`, { method: 'POST' })
    out.hr.C11_reject = await api(`/api/hr/expense-notes/${first.id}/reject`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ reason: 'Justificatif illisible' }),
    })
  } else {
    out.hr.C10_receipt = { status: 'skip', body: null }
    out.hr.C11_reject_sans_motif = { status: 'skip', body: null }
    out.hr.C11_reject = { status: 'skip', body: null }
  }
}
// Soumission employé en dernier (écriture) : normaliser id/seq de la note créée
{
  const api = await login(USERS.employee)
  const f = new FormData()
  f.set('amount', '12.5')
  f.set('expenseDate', '2026-10-01')
  f.set('description', 'Taxi golden')
  f.set('receipt', new File([png1x1], 'r.png', { type: 'image/png' }))
  out.employee.C02_submit = await api('/api/expense-notes', { method: 'POST', body: f })
  const b = out.employee.C02_submit.body
  if (b && typeof b === 'object' && typeof b.receiptKey === 'string') {
    b.receiptKey = b.receiptKey.replace(/receipts\/\d+/, 'receipts/<seq>')
  }
  // Entrée invalide (revue phase/5 §3, contrat §5) : 400 au texte acté,
  // sans écriture — le seed reste identique pour les captures suivantes.
  const fInvalide = new FormData()
  fInvalide.set('amount', '12abc')
  fInvalide.set('expenseDate', '2026-10-01')
  fInvalide.set('description', 'Taxi golden')
  fInvalide.set('receipt', new File([png1x1], 'r.png', { type: 'image/png' }))
  out.employee.C02_invalid = await api('/api/expense-notes', { method: 'POST', body: fInvalide })
}

console.log(JSON.stringify(normalize(out), null, 2))
