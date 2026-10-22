import { describe, expect, it, vi } from 'vitest'
import {
  accederAuJustificatif,
  type AccesJustificatifDeps,
} from '@/application/AccederAuJustificatif'
import type { Acteur } from '@/domain/Acteur'
import { ExpenseNote } from '@/domain/ExpenseNote'
import { NoteIntrouvable } from '@/domain/errors'
import type { NoteAvecAuteur } from '@/domain/NoteAvecAuteur'
import type { AnnuaireOrganisation } from '@/ports/AnnuaireOrganisation'
import type { ExpenseNoteRepository } from '@/ports/ExpenseNoteRepository'
import type { ReceiptStoragePort } from '@/ports/ReceiptStoragePort'

// Ports en mémoire (revues phase/3) : aucune base, aucune I/O.
function noteDe(
  auteurId: string,
  companyId: string,
  managerId: string | null,
  role: 'employee' | 'manager' | 'hr_admin' = 'employee'
): NoteAvecAuteur {
  return {
    note: new ExpenseNote({
      id: 'note-1',
      userId: auteurId,
      amount: 10,
      expenseDate: '2026-01-15',
      description: 'x',
      receiptKey: 'receipts/1.png',
      status: 'pending',
      createdAt: '2026-01-15T10:00:00.000Z',
    }),
    auteurId,
    auteurCompanyId: companyId,
    auteurManagerId: managerId,
    auteurRole: role,
  }
}

function deps(
  overrides: Partial<{
    note: NoteAvecAuteur | null
    utilisateurs: Record<
      string,
      { role: 'employee' | 'manager' | 'hr_admin'; managerId: string | null }
    >
    rh: string[]
  }>
): AccesJustificatifDeps & { espions: { url: ReturnType<typeof vi.fn> } } {
  const utilisateurs = overrides.utilisateurs ?? {}
  const rh = overrides.rh ?? []
  const url = vi.fn(async (clef: string) => `https://s3/${clef}`)
  return {
    notes: {
      trouverParId: vi.fn(async () => overrides.note ?? null),
      listerParAuteur: vi.fn(async () => []),
    } as unknown as ExpenseNoteRepository,
    annuaire: {
      trouverUtilisateur: vi.fn(async (_companyId: string, userId: string) => {
        const u = utilisateurs[userId]
        return u
          ? { id: userId, companyId: 'c1', role: u.role, managerId: u.managerId, name: userId, email: `${userId}@x.io` }
          : null
      }),
      listerRh: vi.fn(async () => rh.map((id) => ({ id, companyId: 'c1', role: 'hr_admin' as const, managerId: null, name: id, email: `${id}@x.io` }))),
    } as unknown as AnnuaireOrganisation,
    stockage: { getSignedUrl: url } as unknown as ReceiptStoragePort,
    espions: { url },
  }
}

const emp: Acteur = { id: 'emp', role: 'employee', companyId: 'c1' }
const m1: Acteur = { id: 'm1', role: 'manager', companyId: 'c1' }
const m2: Acteur = { id: 'm2', role: 'manager', companyId: 'c1' }
const rh: Acteur = { id: 'rh', role: 'hr_admin', companyId: 'c1' }
const autre: Acteur = { id: 'autre', role: 'employee', companyId: 'c2' }

describe('accederAuJustificatif (F2, ports en mémoire)', () => {
  const organigramme = {
    emp: { role: 'employee' as const, managerId: 'm1' },
    m1: { role: 'manager' as const, managerId: null },
  }

  it("l'auteur consulte sa note sans toucher l'annuaire", async () => {
    const d = deps({ note: noteDe('emp', 'c1', 'm1'), utilisateurs: organigramme, rh: ['rh'] })
    const url = await accederAuJustificatif(emp, 'note-1', d)
    expect(url).toBe('https://s3/receipts/1.png')
  })

  it('le manager direct consulte la note de son managé', async () => {
    const d = deps({ note: noteDe('emp', 'c1', 'm1'), utilisateurs: organigramme, rh: ['rh'] })
    await expect(accederAuJustificatif(m1, 'note-1', d)).resolves.toBe(
      'https://s3/receipts/1.png'
    )
  })

  it("le RH consulte la note d'une équipe à manager racine (tableau ligne 2)", async () => {
    const d = deps({ note: noteDe('emp', 'c1', 'm1'), utilisateurs: organigramme, rh: ['rh'] })
    await expect(accederAuJustificatif(rh, 'note-1', d)).resolves.toBe(
      'https://s3/receipts/1.png'
    )
  })

  it("le manager d'une autre branche ne voit rien (404, pas de fuite)", async () => {
    const d = deps({ note: noteDe('emp', 'c1', 'm1'), utilisateurs: organigramme, rh: ['rh'] })
    await expect(accederAuJustificatif(m2, 'note-1', d)).rejects.toThrow(
      NoteIntrouvable
    )
    expect(d.espions.url).not.toHaveBeenCalled()
  })

  it("une note d'une autre entreprise n'existe pas (404)", async () => {
    const d = deps({ note: null, utilisateurs: organigramme, rh: ['rh'] })
    await expect(accederAuJustificatif(autre, 'note-1', d)).rejects.toThrow(
      NoteIntrouvable
    )
  })
})
