import type { Transaction } from '@/ports/UnitOfWork'
import type { UtilisateurAnnuaire } from '@/domain/UtilisateurAnnuaire'

// Port AnnuaireOrganisation, lecture (docs/contrats-ports.md §4).
// Les écritures (rattacher, créer) et l'inscription arrivent avec les
// phases 6 et 7. Toutes les lectures sont bornées à une entreprise.
export interface AnnuaireOrganisation {
  trouverUtilisateur(
    companyId: string,
    userId: string,
    tx?: Transaction
  ): Promise<UtilisateurAnnuaire | null>

  // Tous les hr_admin de l'entreprise (routage RH : I8, ADR-ARCH-002).
  listerRh(companyId: string): Promise<UtilisateurAnnuaire[]>

  // Phase 6 : collaborateurs gérés (employés + managers) de
  // l'entreprise, pour la consultation RH (aucune jointure avec le
  // domaine Notes). Les comptes RH sont exclus, comme l'ancienne
  // route (parité C08).
  listerCollaborateurs(companyId: string): Promise<UtilisateurAnnuaire[]>

  // Phase 6 (revue §3) : rattachement d'un collaborateur à un
  // manager (I11–I13), dans la transaction du cas d'usage. managerId
  // null détache. Le type est string | null : la validation a déjà eu
  // lieu dans RattacherAuManager, l'inconnu ne traverse pas le port.
  // L'éligibilité est déjà vérifiée par RattacherAuManager.
  rattacher(
    tx: Transaction,
    companyId: string,
    userId: string,
    managerId: string | null
  ): Promise<void>

  // Verrou de sérialisation des rattachements (revue phase/6 §1, I12) :
  // verrou consultatif transactionnel par entreprise — deux
  // rattachements concurrents ne s'entrelacent jamais, la détection de
  // cycle par lectures reste donc exacte.
  verrouillerRattachements(tx: Transaction, companyId: string): Promise<void>

  // Phase 7 : inscription (I14, I15). Toutes ces opérations prennent
  // la transaction du parcours public (executerPublic) : l'unicité
  // email et email_domain est portée par les contraintes UNIQUE.
  trouverUtilisateurParEmail(
    tx: Transaction,
    email: string
  ): Promise<UtilisateurAnnuaire | null>

  creerEntreprise(
    tx: Transaction,
    nom: string,
    domaine: string
  ): Promise<{ id: string; nouvelle: boolean }>

  creerUtilisateur(
    tx: Transaction,
    entree: NouvelUtilisateur
  ): Promise<UtilisateurAnnuaire>
}

// Entrée de création d'utilisateur (phase 7, revue §1) : exactement
// ces 5 champs, ni plus ni moins — le rôle ne peut être que hr_admin
// ou employee ici (I15 — jamais manager à l'inscription).
export interface NouvelUtilisateur {
  name: string
  email: string
  passwordHash: string
  companyId: string
  role: 'hr_admin' | 'employee'
}
