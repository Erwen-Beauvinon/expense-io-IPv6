'use server'

import bcrypt from 'bcryptjs'
import { AuthError } from 'next-auth'
import { inscrire } from '@/application/Inscrire'
import { DonneesInvalides } from '@/domain/errors'
import { getAnnuaire, getUnitOfWork } from '@/lib/container'
import { signIn, signOut } from '@/lib/auth'

export interface AuthFormState {
  error?: string
}

export async function signup(
  _prevState: AuthFormState,
  formData: FormData
): Promise<AuthFormState> {
  const name = formData.get('name')
  const email = formData.get('email')
  const password = formData.get('password')

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

  if (typeof email !== 'string' || typeof password !== 'string') {
    return { error: 'Champs invalides.' }
  }

  try {
    await signIn('credentials', { email, password, redirectTo: '/expenses' })
  } catch (error) {
    if (error instanceof AuthError) {
      return { error: 'Email ou mot de passe incorrect.' }
    }
    throw error
  }
  return {}
}

export async function logout(): Promise<void> {
  await signOut({ redirectTo: '/login' })
}
