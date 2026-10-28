// Règles de l'inscription (I14, I15). La concurrence reste arbitrée par
// la base (UNIQUE(email_domain), UNIQUE(email)) : ces fonctions disent
// QUOI décider, l'adaptateur garantit qu'une seule inscription gagne.

export const LONGUEUR_MIN_MOT_DE_PASSE = 8

const EMAIL_PATTERN = /^[^\s@]+@([^\s@]+\.[^\s@]+)$/

export function estEmailValide(valeur: string): boolean {
  return EMAIL_PATTERN.test(valeur)
}

export interface ChampsInscription {
  nom: string
  email: string
  motDePasse: string
}

// Nom non vide, email valide, mot de passe d'au moins 8 caractères.
export function champsInscriptionValides(champs: {
  nom: unknown
  email: unknown
  motDePasse: unknown
}): boolean {
  const { nom, email, motDePasse } = champs
  return (
    typeof nom === 'string' &&
    nom.trim().length > 0 &&
    typeof email === 'string' &&
    estEmailValide(email) &&
    typeof motDePasse === 'string' &&
    motDePasse.length >= LONGUEUR_MIN_MOT_DE_PASSE
  )
}

// L'entreprise est identifiée par le domaine de l'email, en minuscules.
// Seul le domaine est normalisé (backlog #012 pour le reste de l'adresse).
export function domaineDe(email: string): string {
  return email.split('@')[1].toLowerCase()
}

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

export function estDomainePublic(domaine: string): boolean {
  return DOMAINES_PUBLICS.has(domaine.toLowerCase())
}

// Nom d'une entreprise créée à l'inscription : premier segment du domaine.
// (scripts/seed.mjs applique la même règle aux données de démonstration.)
export function nomEntrepriseDepuisDomaine(domaine: string): string {
  return domaine.split('.')[0]
}

// I14 : le premier inscrit d'un domaine devient RH, les suivants employés.
// I15 : le type de retour exclut `manager` — aucune inscription ne peut
// l'attribuer, le compilateur le garantit.
export type RoleInscription = 'hr_admin' | 'employee'

export function roleALInscription(entrepriseNouvelle: boolean): RoleInscription {
  return entrepriseNouvelle ? 'hr_admin' : 'employee'
}
