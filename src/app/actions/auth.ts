'use server'

import bcrypt from 'bcryptjs'
import { AuthError } from 'next-auth'
import { headers } from 'next/headers'
import { inscrire } from '@/application/Inscrire'
import { DonneesInvalides } from '@/domain/errors'
import { getAnnuaire, getUnitOfWork } from '@/lib/container'
import {
  MESSAGE_TROP_DE_TENTATIVES,
  limiteurAuth,
} from '@/lib/rate-limit'
import { signIn, signOut } from '@/lib/auth'

export interface AuthFormState {
  error?: string
}

// Clés de limitation (revue phase/8 §4) : seau par IP appelante ET seau
// par compte visé — un réseau partagé ne se verrouille pas mutuellement
// (comptes distincts) et forger l'en-tête IP ne contourne pas le seau
// compte. Confiance proxy : le premier `x-forwarded-for` n'est fiable
// que derrière un proxy de confiance qui l'écrase ; sinon tous les
// clients sans en-tête partagent le seau `inconnue` (documenté, pas
// silencieux). Seuls les échecs sont comptés.
async function clesLimite(action: string, email: unknown): Promise<string[]> {
  const entetes = await headers()
  const ip =
    entetes.get('x-forwarded-for')?.split(',')[0]?.trim() ??
    entetes.get('x-real-ip') ??
    'inconnue'
  const compte =
    typeof email === 'string' && email.includes('@')
      ? email.trim().toLowerCase()
      : 'sans-compte'
  return [`${action}:ip:${ip}`, `${action}:compte:${compte}`]
}

function quotaEpuise(cles: string[]): string[] {
  return cles.filter((cle) => !limiteurAuth.autorise(cle))
}

function signalerEchec(cles: string[]): void {
  for (const cle of cles) limiteurAuth.signalerEchec(cle)
}

export async function signup(
  _prevState: AuthFormState,
  formData: FormData
): Promise<AuthFormState> {
  const name = formData.get('name')
  const email = formData.get('email')
  const password = formData.get('password')
  const cles = await clesLimite('signup', email)
  if (quotaEpuise(cles).length > 0) {
    return { error: MESSAGE_TROP_DE_TENTATIVES }
  }

  // Phase 7 : la Server Action ne fait que traduire le formulaire en
  // entrée du cas d'usage. Validation, règle du premier inscrit et
  // transaction vivent dans Inscrire ; messages publics inchangés.
  try {
    await inscrire(
      { nom: name, email, motDePasse: password },
      {
        annuaire: getAnnuaire(),
        unitOfWork: getUnitOfWork(),
        hacherMotDePasse: (clair: string) => bcrypt.hash(clair, 12),
      }
    )
  } catch (error) {
    if (error instanceof DonneesInvalides) {
      signalerEchec(cles)
      return { error: error.message }
    }
    throw error
  }

  try {
    await signIn('credentials', { email, password, redirectTo: '/expenses' })
  } catch (error) {
    if (error instanceof AuthError) {
      return { error: 'Le compte a été créé mais la connexion automatique a échoué.' }
    }
    throw error
  }
  return {}
}

export async function login(
  _prevState: AuthFormState,
  formData: FormData
): Promise<AuthFormState> {
  const email = formData.get('email')
  const password = formData.get('password')
  const cles = await clesLimite('login', email)
  if (quotaEpuise(cles).length > 0) {
    return { error: MESSAGE_TROP_DE_TENTATIVES }
  }

  if (typeof email !== 'string' || typeof password !== 'string') {
    signalerEchec(cles)
    return { error: 'Champs invalides.' }
  }

  try {
    await signIn('credentials', { email, password, redirectTo: '/expenses' })
  } catch (error) {
    if (error instanceof AuthError) {
      signalerEchec(cles)
      return { error: 'Email ou mot de passe incorrect.' }
    }
    throw error
  }
  return {}
}

export async function logout(): Promise<void> {
  await signOut({ redirectTo: '/login' })
}
