'use server'

import bcrypt from 'bcryptjs'
import { AuthError } from 'next-auth'
import { headers } from 'next/headers'
import { inscrire } from '@/application/Inscrire'
import { DonneesInvalides } from '@/domain/errors'
import { getAnnuaire, getUnitOfWork } from '@/lib/container'
import {
  MESSAGE_TROP_DE_TENTATIVES,
  clesLimite as construireClesLimite,
  ipCliente,
  limiteurAuth,
} from '@/lib/rate-limit'
import { signIn, signOut } from '@/lib/auth'

export interface AuthFormState {
  error?: string
}

// Clés de limitation (revue phase/8 §4) : seau par compte visé et,
// si l'IP est connue, seau par IP — un réseau partagé ne se verrouille
// pas mutuellement (comptes distincts) et forger l'en-tête IP ne
// contourne pas le seau compte. Construction : `clesLimite` dans
// rate-limit (pas de seau IP global sur IP inconnue, revues croisées
// du 2026-10-28). Login : seuls les échecs sont comptés ;
// inscription : chaque tentative est comptée, succès compris.
async function clesLimite(action: string, email: unknown): Promise<string[]> {
  const entetes = await headers()
  return construireClesLimite(action, email, ipCliente(entetes))
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
  // Chaque tentative coûte (bcrypt, création d'entreprise possible) :
  // comptée avant traitement, succès compris (revue V2, point 3).
  for (const cle of cles) limiteurAuth.signalerTentative(cle)

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
      // Déjà comptée comme tentative ci-dessus : pas de double compte.
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
