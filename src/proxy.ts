import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import {
  MESSAGE_TROP_DE_TENTATIVES,
  cleCallback,
  creerLimiteur,
  ipCliente,
} from '@/lib/rate-limit'

const PROTECTED_PREFIXES = ['/expenses', '/manager', '/hr']

// Limiteur dédié à l'endpoint Auth.js direct (revue phase/8 §4) :
// `POST /api/auth/callback/credentials` est appelable sans passer par
// les Server Actions, donc sans leur limiteur. Ici l'issue est
// inconnue au moment du contrôle : les tentatives sont comptées
// (quota plus large que les échecs des actions), avec un vrai 429.
const limiteurCallback = creerLimiteur({
  fenetreMs: 10 * 60 * 1000,
  maxEssais: 30,
})

function limiterCallbackReponse(req: Request): NextResponse | null {
  const ip = ipCliente(req.headers)
  // IP inconnue : le seau partagé `inconnue` est conservé ICI, sur
  // le seul endpoint direct. Les connexions normales passent par la
  // Server Action `signIn` (appel serveur, sans requête HTTP vers ce
  // callback) : ce seau ne peut donc pas bloquer les utilisateurs du
  // formulaire, seulement les appels directs — scripts ou attaquant
  // qui contourneraient sinon tout quota, celui par compte compris
  // (contre-revues du 2026-10-28). Sans lui, le brute-force direct
  // ne serait freiné que par le coût bcrypt.
  if (!limiteurCallback.autorise(cleCallback(ip))) {
    return NextResponse.json({ error: MESSAGE_TROP_DE_TENTATIVES }, { status: 429 })
  }
  limiteurCallback.signalerEchec(cleCallback(ip))
  return null
}

export default auth((req) => {
  const chemin = req.nextUrl.pathname
  if (chemin.startsWith('/api/auth/callback/') && req.method === 'POST') {
    return limiterCallbackReponse(req) ?? NextResponse.next()
  }
  const isProtected = PROTECTED_PREFIXES.some((prefix) =>
    chemin.startsWith(prefix)
  )
  if (isProtected && !req.auth) {
    return NextResponse.redirect(new URL('/login', req.nextUrl))
  }
})

export const config = {
  matcher: [
    '/((?!api|_next/static|_next/image|.*\\.(?:svg|png|jpg|jpeg|webp|ico)$).*)',
    '/api/auth/callback/:path*',
  ],
}
