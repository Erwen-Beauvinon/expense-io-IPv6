// Table de vérité unique des valideurs (ADR-ARCH-002), partagée par :
// - tests/unit/domain/table-valideurs.test.ts (calculerValideurs, domaine) ;
// - tests/integration/concordance-valideurs.test.ts (prédicat SQL de
//   l'adaptateur et policies RLS de la migration 0005).
// Si l'une des trois versions de la règle diverge, l'un des deux tests
// échoue. Seuls des organigrammes atteignables par les parcours y figurent
// (un RH n'a jamais de manager, un rattachement reste dans l'entreprise).
export type Role = 'employee' | 'manager' | 'hr_admin'

export interface MembreTable {
  role: Role
  entreprise: 'A' | 'B'
  manager: string | null
}

// Entreprise A : deux RH, un manager racine, un manager intermédiaire, un
// employé de chaque niveau et un employé sans manager. Entreprise B : de
// quoi prouver l'étanchéité.
export const ORGANIGRAMME: Record<string, MembreTable> = {
  hrA: { role: 'hr_admin', entreprise: 'A', manager: null },
  hrA2: { role: 'hr_admin', entreprise: 'A', manager: null },
  mRacine: { role: 'manager', entreprise: 'A', manager: null },
  eDirect: { role: 'employee', entreprise: 'A', manager: 'mRacine' },
  mInter: { role: 'manager', entreprise: 'A', manager: 'mRacine' },
  eN1: { role: 'employee', entreprise: 'A', manager: 'mInter' },
  eOrphelin: { role: 'employee', entreprise: 'A', manager: null },
  hrB: { role: 'hr_admin', entreprise: 'B', manager: null },
  mB: { role: 'manager', entreprise: 'B', manager: null },
  eB: { role: 'employee', entreprise: 'B', manager: 'mB' },
}

// Auteur d'une note → ses valideurs attendus (lignes du tableau ADR-ARCH-002).
export const VALIDEURS_ATTENDUS: Record<string, string[]> = {
  eDirect: ['mRacine', 'hrA', 'hrA2'], // ligne 2 : direct racine + RH
  eN1: ['mInter', 'mRacine'], // ligne 1 : direct + N+1, sans RH
  mInter: ['mRacine', 'hrA', 'hrA2'], // ligne 2 : manager sous racine
  mRacine: ['hrA', 'hrA2'], // ligne 3 : sans manager
  eOrphelin: ['hrA', 'hrA2'], // ligne 3 : employé non rattaché
  hrA: ['hrA2'], // note de RH : les autres RH, jamais soi-même (I7)
  eB: ['mB', 'hrB'], // entreprise B, ligne 2
}

// File « à trancher » attendue de chaque décideur (figureDansLaFile) :
// manager = toutes ses notes de valideur ; RH = file restreinte (auteurs
// sans manager et RH).
export const FILES_ATTENDUES: Record<string, string[]> = {
  mRacine: ['eDirect', 'mInter', 'eN1'],
  mInter: ['eN1'],
  mB: ['eB'],
  hrA: ['mRacine', 'eOrphelin'],
  hrA2: ['mRacine', 'eOrphelin', 'hrA'],
  hrB: [],
}

export const AUTEURS = Object.keys(VALIDEURS_ATTENDUS)
export const ACTEURS = Object.keys(ORGANIGRAMME)

export function estValideurAttendu(acteur: string, auteur: string): boolean {
  return VALIDEURS_ATTENDUS[auteur].includes(acteur)
}
