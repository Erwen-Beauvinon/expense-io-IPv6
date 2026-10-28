import { DonneesInvalides } from '@/domain/errors'
import {
  champsInscriptionValides,
  domaineDe,
  estDomainePublic,
  LONGUEUR_MIN_MOT_DE_PASSE,
  nomEntrepriseDepuisDomaine,
  roleALInscription,
} from '@/domain/Inscription'
import type { UtilisateurAnnuaire } from '@/domain/UtilisateurAnnuaire'
import type { AnnuaireOrganisation } from '@/ports/AnnuaireOrganisation'
import type { UnitOfWork } from '@/ports/UnitOfWork'

// Cas d'usage d'inscription (phase 7) : crée ou rejoint une entreprise
// en une seule transaction. Les règles (champs, domaine, nom
// d'entreprise, rôle : I14, I15) sont celles du domaine (Inscription) ;
// la concurrence est arbitrée par les contraintes UNIQUE de la base.
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

// Messages publics gelés : identiques à ceux de l'ancienne Server
// Action (contrat client : Server Action inchangée).
export const MESSAGE_CHAMPS_INSCRIPTION = `Nom requis, email invalide, ou mot de passe trop court (${LONGUEUR_MIN_MOT_DE_PASSE} caractères minimum).`
export const MESSAGE_EMAIL_EXISTANT = 'Un compte existe déjà avec cet email.'
export const MESSAGE_DOMAINE_PUBLIC =
  'Inscription impossible avec un domaine e-mail public : utilise l’adresse de ton entreprise.'

export async function inscrire(
  inscription: InscriptionBrute,
  deps: InscrireDeps
): Promise<UtilisateurAnnuaire> {
  const { nom, email, motDePasse } = inscription
  if (!champsInscriptionValides({ nom, email, motDePasse })) {
    throw new DonneesInvalides(MESSAGE_CHAMPS_INSCRIPTION)
  }
  // Champs validés par le domaine : ce sont des chaînes.
  const nomValide = nom as string
  const emailValide = email as string
  const domaine = domaineDe(emailValide)
  // Domaine e-mail public refusé avant tout hachage ni écriture (revue
  // V2, point 4 : un tel domaine ne fonde ni ne rejoint une entreprise).
  if (estDomainePublic(domaine)) {
    throw new DonneesInvalides(MESSAGE_DOMAINE_PUBLIC)
  }
  const motDePasseHash = await deps.hacherMotDePasse(motDePasse as string)

  // Parcours public, sans acteur : l'isolation est portée par le
  // domaine email, pas par une entreprise (executerPublic).
  return deps.unitOfWork.executerPublic(async (tx) => {
    const existant = await deps.annuaire.trouverUtilisateurParEmail(tx, emailValide)
    if (existant) throw new DonneesInvalides(MESSAGE_EMAIL_EXISTANT)

    const entreprise = await deps.annuaire.creerEntreprise(
      tx,
      nomEntrepriseDepuisDomaine(domaine),
      domaine
    )
    const cree = await deps.annuaire.creerUtilisateur(tx, {
      name: nomValide.trim(),
      email: emailValide,
      passwordHash: motDePasseHash,
      companyId: entreprise.id,
      role: roleALInscription(entreprise.nouvelle),
    })
    // Course perdue sur l'email (contrainte UNIQUE, traduite en null par
    // l'adaptateur) : même réponse que le contrôle préalable (message
    // gelé du contrat). L'énumération de comptes reste possible, comme
    // avant — comportement du contrat gelé (revue phase/7).
    if (!cree) throw new DonneesInvalides(MESSAGE_EMAIL_EXISTANT)
    return cree
  })
}
