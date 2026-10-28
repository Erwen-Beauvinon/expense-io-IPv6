import { describe, expect, it, vi } from 'vitest'
import { DonneesInvalides } from '@/domain/errors'
import type { UtilisateurAnnuaire } from '@/domain/UtilisateurAnnuaire'
import type {
  AnnuaireOrganisation,
  NouvelUtilisateur,
} from '@/ports/AnnuaireOrganisation'
import type { UnitOfWork } from '@/ports/UnitOfWork'
import {
  MESSAGE_CHAMPS_INSCRIPTION,
  MESSAGE_DOMAINE_PUBLIC,
  MESSAGE_EMAIL_EXISTANT,
  inscrire,
} from '@/application/Inscrire'

function utilisateur(partiel: Record<string, unknown> = {}) {
  return {
    id: 'u1',
    companyId: 'c1',
    role: 'hr_admin' as const,
    managerId: null,
    name: 'N',
    email: 'n@x.io',
    ...partiel,
  }
}

// Annuaire en mémoire qui rejoue la sémantique de la contrainte
// UNIQUE(email_domain) : une seule création d'entreprise gagne par
// domaine, les autres rejoignent l'existante.
function deps() {
  const entreprises = new Map<string, string>()
  const annuaire = {
    trouverUtilisateur: vi.fn(async () => null),
    listerCollaborateurs: vi.fn(async () => []),
    listerRh: vi.fn(async () => []),
    rattacher: vi.fn(async () => {}),
    verrouillerRattachements: vi.fn(async () => {}),
    trouverUtilisateurParEmail: vi.fn(
      async (): Promise<UtilisateurAnnuaire | null> => null
    ),
    creerEntreprise: vi.fn(async (_tx: unknown, _nom: string, domaine: string) => {
      if (entreprises.has(domaine)) return { id: entreprises.get(domaine)!, nouvelle: false }
      const id = `c-${domaine}`
      entreprises.set(domaine, id)
      return { id, nouvelle: true }
    }),
    creerUtilisateur: vi.fn(
      async (_tx: unknown, entree: NouvelUtilisateur): Promise<UtilisateurAnnuaire | null> =>
        utilisateur({ ...entree })
    ),
  } satisfies AnnuaireOrganisation
  const unitOfWork = {
    executer: vi.fn(async (_acteur: unknown, travail: (tx: unknown) => Promise<never>) => travail({})),
    executerPublic: vi.fn(async (travail: (tx: unknown) => Promise<never>) => travail({})),
  } as unknown as UnitOfWork & { executerPublic: ReturnType<typeof vi.fn> }
  const hacherMotDePasse = vi.fn(async (clair: string) => `hash(${clair})`)
  return { annuaire, unitOfWork, hacherMotDePasse }
}

const INSCRIPTION = { nom: 'Nadia', email: 'nadia@acme.io', motDePasse: 's3cret!!' }

describe('inscrire (I14, I15)', () => {
  it.each([
    [{ ...INSCRIPTION, nom: '  ' }],
    [{ ...INSCRIPTION, email: 'pas-un-email' }],
    [{ ...INSCRIPTION, motDePasse: 'court' }],
    [{ nom: null, email: 'a@b.io', motDePasse: 's3cret!!' }],
  ])('refuse la saisie invalide avec le message gelé %s', async (partiel) => {
    const d = deps()
    await expect(inscrire(partiel, d)).rejects.toThrowError(
      new DonneesInvalides(MESSAGE_CHAMPS_INSCRIPTION)
    )
    expect(d.annuaire.creerEntreprise).not.toHaveBeenCalled()
  })

  it('le premier inscrit d’un domaine devient RH de sa nouvelle entreprise', async () => {
    const d = deps()
    const cree = await inscrire(INSCRIPTION, d)
    expect(d.annuaire.creerEntreprise).toHaveBeenCalledWith(
      expect.anything(),
      'acme',
      'acme.io'
    )
    expect(d.annuaire.creerUtilisateur).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        name: 'Nadia',
        email: 'nadia@acme.io',
        passwordHash: 'hash(s3cret!!)',
        companyId: 'c-acme.io',
        role: 'hr_admin',
      })
    )
    expect(cree.role).toBe('hr_admin')
    // Seul le hash quitte le cas d’usage vers la base, jamais le clair.
    expect(d.annuaire.creerUtilisateur).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ passwordHash: 'hash(s3cret!!)' })
    )
  })

  it('le second inscrit rejoint en employé, sans recréer l’entreprise', async () => {
    const d = deps()
    await inscrire(INSCRIPTION, d)
    await inscrire({ nom: 'Karim', email: 'karim@acme.io', motDePasse: 's3cret!!' }, d)
    expect(d.annuaire.creerUtilisateur).toHaveBeenNthCalledWith(
      2,
      expect.anything(),
      expect.objectContaining({ role: 'employee', companyId: 'c-acme.io' })
    )
  })

  it('un email déjà pris est refusé avec le message gelé', async () => {
    const d = deps()
    d.annuaire.trouverUtilisateurParEmail.mockResolvedValueOnce(utilisateur({ email: 'nadia@acme.io' }))
    await expect(inscrire(INSCRIPTION, d)).rejects.toThrowError(
      new DonneesInvalides(MESSAGE_EMAIL_EXISTANT)
    )
    expect(d.annuaire.creerUtilisateur).not.toHaveBeenCalled()
  })

  it('une course sur un domaine nouveau ne produit qu’un seul RH (I14)', async () => {
    const d = deps()
    const [premier, second] = await Promise.all([
      inscrire({ nom: 'A', email: 'a@startup.io', motDePasse: 's3cret!!' }, d),
      inscrire({ nom: 'B', email: 'b@startup.io', motDePasse: 's3cret!!' }, d),
    ])
    const roles = [premier.role, second.role].sort()
    expect(roles).toEqual(['employee', 'hr_admin'])
  })

  it('une course sur le même email échoue en double avec le message gelé', async () => {
    const d = deps()
    // L'adaptateur traduit la violation d'unicité en null (port).
    d.annuaire.creerUtilisateur.mockResolvedValueOnce(null)
    await expect(inscrire(INSCRIPTION, d)).rejects.toThrowError(
      new DonneesInvalides(MESSAGE_EMAIL_EXISTANT)
    )
  })

  it('refuse un domaine e-mail public, même en premier inscrit (revue V2, point 4)', async () => {
    const d = deps()
    await expect(
      inscrire({ nom: 'Eve', email: 'eve@gmail.com', motDePasse: 's3cret!!' }, d)
    ).rejects.toThrowError(new DonneesInvalides(MESSAGE_DOMAINE_PUBLIC))
    expect(d.annuaire.creerEntreprise).not.toHaveBeenCalled()
    expect(d.hacherMotDePasse).not.toHaveBeenCalled()
  })

  it('n’attribue jamais le rôle manager (I15)', async () => {
    const d = deps()
    await inscrire(INSCRIPTION, d)
    await inscrire({ nom: 'K', email: 'k@acme.io', motDePasse: 's3cret!!' }, d)
    for (const appel of d.annuaire.creerUtilisateur.mock.calls) {
      expect((appel[1] as { role: string }).role).not.toBe('manager')
    }
  })
})
