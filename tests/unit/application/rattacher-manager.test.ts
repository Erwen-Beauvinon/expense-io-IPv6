import { describe, expect, it, vi } from 'vitest'
import type { Acteur } from '@/domain/Acteur'
import {
  AccesRefuse,
  CycleHierarchique,
  DonneesInvalides,
  ManagerIneligible,
  UtilisateurIntrouvable,
} from '@/domain/errors'
import type { UtilisateurAnnuaire } from '@/domain/UtilisateurAnnuaire'
import type { AnnuaireOrganisation } from '@/ports/AnnuaireOrganisation'
import type { UnitOfWork } from '@/ports/UnitOfWork'
import {
  detecterCycle,
  rattacherAuManager,
} from '@/application/RattacherAuManager'

const RH: Acteur = { id: 'rh', role: 'hr_admin', companyId: 'c1' }

function utilisateur(partiel: Partial<UtilisateurAnnuaire> & { id: string }): UtilisateurAnnuaire {
  return {
    companyId: 'c1',
    role: 'employee',
    managerId: null,
    name: 'N',
    email: `${partiel.id}@x.io`,
    ...partiel,
  }
}

function deps(parPersonne: Record<string, UtilisateurAnnuaire>) {
  const annuaire = {
    trouverUtilisateur: vi.fn(async (...args: [string, string, unknown?]) =>
      parPersonne[args[1]] ?? null
    ),
    listerCollaborateurs: vi.fn(async () => []),
    listerRh: vi.fn(async () => []),
    rattacher: vi.fn(async () => {}),
    verrouillerRattachements: vi.fn(async () => {}),
    trouverUtilisateurParEmail: vi.fn(async () => null),
    creerEntreprise: vi.fn(async () => ({ id: 'c1', nouvelle: false })),
    creerUtilisateur: vi.fn(async () => utilisateur({ id: 'u' })),
  } satisfies AnnuaireOrganisation
  const unitOfWork = {
    executer: vi.fn(async (_acteur: Acteur, travail: (tx: unknown) => Promise<UtilisateurAnnuaire>) =>
      travail({})
    ),
    executerPublic: vi.fn(async (travail: (tx: unknown) => Promise<UtilisateurAnnuaire>) =>
      travail({})
    ),
  } as unknown as UnitOfWork & {
    executer: ReturnType<typeof vi.fn>
    executerPublic: ReturnType<typeof vi.fn>
  }
  return { annuaire, unitOfWork }
}

const EQUIPE: Record<string, UtilisateurAnnuaire> = {
  emp: utilisateur({ id: 'emp', role: 'employee', managerId: 'm1' }),
  m1: utilisateur({ id: 'm1', role: 'manager', managerId: null }),
  m2: utilisateur({ id: 'm2', role: 'manager', managerId: null }),
}

describe('rattacherAuManager (I11–I13)', () => {
  it('refuse un acteur non RH sans toucher à la base', async () => {
    const d = deps(EQUIPE)
    const employe = { ...RH, role: 'manager' as const }
    await expect(rattacherAuManager(employe, 'emp', 'm2', d)).rejects.toThrow(AccesRefuse)
    expect(d.annuaire.rattacher).not.toHaveBeenCalled()
  })

  it('refuse une cible inconnue ou hors entreprise (404, pas de fuite)', async () => {
    const d = deps(EQUIPE)
    await expect(rattacherAuManager(RH, 'inconnu', 'm2', d)).rejects.toThrow(UtilisateurIntrouvable)
    expect(d.annuaire.rattacher).not.toHaveBeenCalled()
  })

  it('refuse un manager d’une autre entreprise (I11)', async () => {
    const d = deps(EQUIPE)
    // 'ext' n'existe pas dans l'entreprise c1 : introuvable = 409.
    await expect(rattacherAuManager(RH, 'emp', 'ext', d)).rejects.toThrow(ManagerIneligible)
    expect(d.annuaire.rattacher).not.toHaveBeenCalled()
  })

  it('refuse l’auto-rattachement et le non-manager (I13)', async () => {
    const d = deps(EQUIPE)
    await expect(rattacherAuManager(RH, 'emp', 'emp', d)).rejects.toThrow(ManagerIneligible)
    const avecEmploye = { ...EQUIPE, autre: utilisateur({ id: 'autre', role: 'employee' }) }
    const d2 = deps(avecEmploye)
    await expect(rattacherAuManager(RH, 'emp', 'autre', d2)).rejects.toThrow(ManagerIneligible)
    expect(d.annuaire.rattacher).not.toHaveBeenCalled()
  })

  it('refuse un corps invalide sans rien écrire', async () => {
    const d = deps(EQUIPE)
    await expect(rattacherAuManager(RH, 'emp', 42, d)).rejects.toThrow(DonneesInvalides)
    expect(d.annuaire.rattacher).not.toHaveBeenCalled()
  })

  it('détecte un cycle transitif (I12)', async () => {
    const cyclique = {
      ...EQUIPE,
      emp: utilisateur({ id: 'emp', role: 'manager', managerId: 'm1' }),
      m1: utilisateur({ id: 'm1', role: 'manager', managerId: 'emp' }),
    }
    const d = deps(cyclique)
    await expect(rattacherAuManager(RH, 'm1', 'emp', d)).rejects.toThrow(CycleHierarchique)
    expect(d.annuaire.rattacher).not.toHaveBeenCalled()
  })

  it('rattache en transaction et relit, détachement compris', async () => {
    const d = deps(EQUIPE)
    const relue = await rattacherAuManager(RH, 'emp', 'm2', d)
    expect(d.unitOfWork.executer).toHaveBeenCalledTimes(1)
    expect(d.annuaire.rattacher).toHaveBeenCalledWith(expect.anything(), 'c1', 'emp', 'm2')
    expect(relue.id).toBe('emp')
    await rattacherAuManager(RH, 'emp', null, d)
    expect(d.annuaire.rattacher).toHaveBeenLastCalledWith(expect.anything(), 'c1', 'emp', null)
  })

  it('sérialise par verrou avant toute lecture (I12, revue phase/6 §1)', async () => {
    const d = deps(EQUIPE)
    await rattacherAuManager(RH, 'emp', 'm2', d)
    // Le verrou est posé dans la transaction, avant les lectures.
    expect(d.annuaire.verrouillerRattachements).toHaveBeenCalledWith(
      expect.anything(),
      'c1'
    )
    const ordreVerrou = d.annuaire.verrouillerRattachements.mock.invocationCallOrder[0]
    const ordreLecture = d.annuaire.trouverUtilisateur.mock.invocationCallOrder[0]
    expect(ordreVerrou).toBeLessThan(ordreLecture)
    // Les lectures participent à la transaction (poignée transmise).
    for (const appel of d.annuaire.trouverUtilisateur.mock.calls) {
      expect(appel[2]).toBeDefined()
    }
  })
})

describe('detecterCycle', () => {
  it('laisse passer une chaîne saine même profonde', async () => {
    const chaine: Record<string, UtilisateurAnnuaire> = {
      a: utilisateur({ id: 'a', managerId: 'b' }),
      b: utilisateur({ id: 'b', role: 'manager', managerId: 'c' }),
      c: utilisateur({ id: 'c', role: 'manager', managerId: null }),
    }
    const d = deps(chaine)
    await expect(detecterCycle(d.annuaire, 'c1', 'a', 'x')).resolves.toBe(false)
  })

  it('détecte une boucle sans manager impliqué', async () => {
    const boucle: Record<string, UtilisateurAnnuaire> = {
      a: utilisateur({ id: 'a', managerId: 'b' }),
      b: utilisateur({ id: 'b', managerId: 'a' }),
    }
    const d = deps(boucle)
    await expect(detecterCycle(d.annuaire, 'c1', 'a', 'b')).resolves.toBe(true)
  })
})
