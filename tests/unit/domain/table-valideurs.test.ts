import { describe, expect, it } from 'vitest'
import type { Acteur } from '@/domain/Acteur'
import {
  calculerValideurs,
  figureDansLaFile,
  type ContexteValidateurs,
} from '@/domain/PolitiqueAcces'
import {
  AUTEURS,
  FILES_ATTENDUES,
  ORGANIGRAMME,
  VALIDEURS_ATTENDUS,
} from '../../support/table-valideurs'

// Version TypeScript de la règle, confrontée à la table de vérité partagée
// avec le test d'intégration (SQL et RLS). Comme resoudreValidateurs, la
// lecture de l'organigramme est bornée à l'entreprise de la note.
function contexte(entreprise: 'A' | 'B'): ContexteValidateurs {
  return {
    parentDe: (id) => {
      const membre = ORGANIGRAMME[id]
      if (!membre || membre.entreprise !== entreprise) return null
      return { id, role: membre.role, managerId: membre.manager }
    },
    rhDeEntreprise: () =>
      Object.entries(ORGANIGRAMME)
        .filter(([, membre]) => membre.role === 'hr_admin' && membre.entreprise === entreprise)
        .map(([id]) => id),
  }
}

function valideursDe(auteur: string): string[] {
  const membre = ORGANIGRAMME[auteur]
  return calculerValideurs(
    { id: auteur, role: membre.role, managerId: membre.manager },
    contexte(membre.entreprise)
  )
}

describe('table de vérité des valideurs (ADR-ARCH-002) — domaine', () => {
  it.each(AUTEURS)('valideurs d’une note de %s', (auteur) => {
    expect(valideursDe(auteur).sort()).toEqual([...VALIDEURS_ATTENDUS[auteur]].sort())
  })

  it.each(Object.keys(FILES_ATTENDUES))('file à trancher de %s', (decideur) => {
    const membre = ORGANIGRAMME[decideur]
    const acteur: Acteur = { id: decideur, role: membre.role, companyId: membre.entreprise }
    const file = AUTEURS.filter((auteur) => {
      const auteurMembre = ORGANIGRAMME[auteur]
      if (auteurMembre.entreprise !== membre.entreprise) return false
      return figureDansLaFile(acteur, valideursDe(auteur))
    })
    expect(file.sort()).toEqual([...FILES_ATTENDUES[decideur]].sort())
  })
})
