import type { UtilisateurAnnuaire } from '@/domain/UtilisateurAnnuaire'

// Port AnnuaireOrganisation, lecture (docs/contrats-ports.md §4).
// Les écritures (rattacher, créer) et l'inscription arrivent avec les
// phases 6 et 7. Toutes les lectures sont bornées à une entreprise.
export interface AnnuaireOrganisation {
  trouverUtilisateur(
    companyId: string,
    userId: string
  ): Promise<UtilisateurAnnuaire | null>

  // Tous les hr_admin de l'entreprise (routage RH : I8, ADR-ARCH-002).
  listerRh(companyId: string): Promise<UtilisateurAnnuaire[]>
}
