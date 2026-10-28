import { DonneesInvalides } from '@/domain/errors'
import type { UtilisateurAnnuaire } from '@/domain/UtilisateurAnnuaire'
import type { AnnuaireOrganisation } from '@/ports/AnnuaireOrganisation'
import type { UnitOfWork } from '@/ports/UnitOfWork'
import { isNonEmptyString, isValidEmail } from '@/utils/validators'

// Cas d'usage d'inscription (phase 7) : crée ou rejoint une entreprise
// en une seule transaction. « Le premier inscrit d'un domaine devient
// RH, les suivants employés » (I14) : l'unicité est portée par la
// contrainte UNIQUE(email_domain) — même en cas d'inscriptions
// simultanées, une seule crée l'entreprise. Le rôle manager n'est
// jamais attribué ici (I15) : seulement hr_admin ou employee.
export interface InscrireDeps {
  annuaire: AnnuaireOrganisation
  unitOfWork: UnitOfWork
  hacherMotDePasse: (clair: string) => Promise<string>
}

export interface InscriptionBrute {
  nom: unknown
  email: unknown
  motDePasse: unknown
}

export const LONGUEUR_MIN_MOT_DE_PASSE = 8

// Messages publics gelés : identiques à ceux de l'ancienne Server
// Action (contrat client : Server Action inchangée).
export const MESSAGE_CHAMPS_INSCRIPTION = `Nom requis, email invalide, ou mot de passe trop court (${LONGUEUR_MIN_MOT_DE_PASSE} caractères minimum).`
export const MESSAGE_EMAIL_EXISTANT = 'Un compte existe déjà avec cet email.'
export const MESSAGE_DOMAINE_PUBLIC =
  'Inscription impossible avec un domaine e-mail public : utilise l’adresse de ton entreprise.'

// Domaines grand public refusés (revue V2, point 4) : le premier
// inscrit d'un domaine devient RH sans vérification d'e-mail — avec
// un domaine public (ou celui d'une vraie entreprise usurpé par un
// tiers), n'importe qui prendrait la main sur les notes des inscrits
// suivants. La vérification de domaine complète reste au pilote 2 ;
// en attendant, ces domaines ne peuvent fonder ni rejoindre une
// entreprise par l'inscription libre.
export const DOMAINES_PUBLICS = new Set([
  'gmail.com', 'googlemail.com',
  'yahoo.com', 'yahoo.fr',
  'hotmail.com', 'hotmail.fr',
  'outlook.com', 'outlook.fr',
  'live.com', 'live.fr', 'msn.com',
  'aol.com', 'icloud.com', 'me.com',
  'protonmail.com', 'proton.me',
  'gmx.com', 'gmx.fr', 'mail.com',
  'orange.fr', 'free.fr', 'sfr.fr', 'laposte.net',
])

function estViolationUnicite(erreur: unknown): boolean {
  return (
    typeof erreur === 'object' &&
    erreur !== null &&
    'code' in erreur &&
    (erreur as { code: unknown }).code === '23505'
  )
}

export async function inscrire(
  inscription: InscriptionBrute,
  deps: InscrireDeps
): Promise<UtilisateurAnnuaire> {
  const { nom, email, motDePasse } = inscription
  if (
    !isNonEmptyString(nom) ||
    typeof email !== 'string' ||
    !isValidEmail(email) ||
    typeof motDePasse !== 'string' ||
    motDePasse.length < LONGUEUR_MIN_MOT_DE_PASSE
  ) {
    throw new DonneesInvalides(MESSAGE_CHAMPS_INSCRIPTION)
  }

  const domaine = email.split('@')[1].toLowerCase()
  if (DOMAINES_PUBLICS.has(domaine)) {
    throw new DonneesInvalides(MESSAGE_DOMAINE_PUBLIC)
  }
  const motDePasseHash = await deps.hacherMotDePasse(motDePasse)

  // Parcours public, sans acteur : l'isolation est portée par le
  // domaine email, pas par une entreprise (executerPublic).
  try {
    return await deps.unitOfWork.executerPublic(async (tx) => {
      const existant = await deps.annuaire.trouverUtilisateurParEmail(tx, email)
      if (existant) throw new DonneesInvalides(MESSAGE_EMAIL_EXISTANT)

      const entreprise = await deps.annuaire.creerEntreprise(
        tx,
        domaine.split('.')[0],
        domaine
      )
      return deps.annuaire.creerUtilisateur(tx, {
        name: nom.trim(),
        email,
        passwordHash: motDePasseHash,
        companyId: entreprise.id,
        role: entreprise.nouvelle ? 'hr_admin' : 'employee',
      })
    })
  } catch (erreur) {
    // Course perdue sur l'email (contrainte UNIQUE) : même réponse que
    // le contrôle préalable (message gelé du contrat). L'énumération
    // de comptes reste possible, comme avant — le comportement est
    // celui du contrat gelé, pas une absence de fuite (revue phase/7).
    if (estViolationUnicite(erreur)) {
      throw new DonneesInvalides(MESSAGE_EMAIL_EXISTANT)
    }
    throw erreur
  }
}
