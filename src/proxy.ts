import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import {
  MESSAGE_TROP_DE_TENTATIVES,
  creerLimiteur,
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
  const ip =
    req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ??
    req.headers.get('x-real-ip') ??
    'inconnue'
  if (!limiteurCallback.autorise(`auth-callback:ip:${ip}`)) {
    return NextResponse.json({ error: MESSAGE_TROP_DE_TENTATIVES }, { status: 429 })
  }
  limiteurCallback.signalerEchec(`auth-callback:ip:${ip}`)
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
