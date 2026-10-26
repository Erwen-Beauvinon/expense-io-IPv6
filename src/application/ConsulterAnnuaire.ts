import type { Acteur } from '@/domain/Acteur'
import { AccesRefuse } from '@/domain/errors'
import type { UtilisateurAnnuaire } from '@/domain/UtilisateurAnnuaire'
import type { AnnuaireOrganisation } from '@/ports/AnnuaireOrganisation'

// Cas d'usage de consultation de l'annuaire (phase 6) : remplace la
// requête SQL de GET /api/hr/users. Lecture bornée à l'entreprise,
// sans jointure avec le domaine Notes.
export async function consulterAnnuaire(
  acteur: Acteur,
  annuaire: AnnuaireOrganisation
): Promise<UtilisateurAnnuaire[]> {
  if (acteur.role !== 'hr_admin') throw new AccesRefuse('Unauthorized')
  return annuaire.listerCollaborateurs(acteur.companyId)
}
