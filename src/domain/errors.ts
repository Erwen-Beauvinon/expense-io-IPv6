// Erreurs métier typées (docs/contrats-ports.md §7). Le domaine ne lève
// que ces erreurs ; les pannes d'infrastructure remontent telles quelles
// et sont traduites en 500 générique par la couche interface.
export abstract class ErreurMetier extends Error {
  abstract readonly code:
    | 'DonneesInvalides'
    | 'NoteIntrouvable'
    | 'AccesRefuse'
    | 'DejaTranchee'
    | 'ManagerIneligible'
    | 'CycleHierarchique'
}

export class DonneesInvalides extends ErreurMetier {
  readonly code = 'DonneesInvalides' as const
}

export class NoteIntrouvable extends ErreurMetier {
  readonly code = 'NoteIntrouvable' as const
}

export class AccesRefuse extends ErreurMetier {
  readonly code = 'AccesRefuse' as const
}

export class DejaTranchee extends ErreurMetier {
  readonly code = 'DejaTranchee' as const
}

export class ManagerIneligible extends ErreurMetier {
  readonly code = 'ManagerIneligible' as const
}

export class CycleHierarchique extends ErreurMetier {
  readonly code = 'CycleHierarchique' as const
}

export function estErreurMetier(error: unknown): error is ErreurMetier {
  return error instanceof ErreurMetier
}
