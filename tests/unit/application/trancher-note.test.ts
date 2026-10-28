import { describe, expect, it, vi } from 'vitest'
import { trancherNote, validerMotif } from '@/application/TrancherNote'
import type { Acteur } from '@/domain/Acteur'
import { ExpenseNote } from '@/domain/ExpenseNote'
import {
  DejaTranchee,
  DonneesInvalides,
  NoteIntrouvable,
} from '@/domain/errors'
import type { NoteAvecAuteur } from '@/domain/NoteAvecAuteur'
import type { AnnuaireOrganisation } from '@/ports/AnnuaireOrganisation'
import type { ExpenseNoteRepository } from '@/ports/ExpenseNoteRepository'
import type { NotificationPort } from '@/ports/NotificationPort'
import { lireRaison } from '@/lib/serialisation'
import { respondError } from '@/lib/errors'

// Motif de rejet obligatoire (revues phase/4, ADR-ARCH-003) : longueur
// en points de code (pas en unités UTF-16), rognage, ordre
// autorisation-avant-motif, et distinction 409/404 des courses.
describe('validerMotif', () => {
  it('exige un motif non vide au rejet', () => {
    for (const reason of [null, undefined, '', '   ']) {
      expect(() => validerMotif('rejected', reason)).toThrow(DonneesInvalides)
    }
  })

  it('ignore le motif absent ou blanc à l’approbation', () => {
    for (const reason of [null, undefined, '', '   ']) {
      expect(validerMotif('approved', reason)).toBeNull()
    }
  })

  it('rogne le motif et refuse les non-chaînes', () => {
    expect(validerMotif('rejected', '  Justificatif illisible  ')).toBe(
      'Justificatif illisible'
    )
    expect(validerMotif('approved', '  ok  ')).toBe('ok')
    for (const reason of [42, true, {}, ['x']]) {
      expect(() => validerMotif('rejected', reason)).toThrow(DonneesInvalides)
      expect(() => validerMotif('approved', reason)).toThrow(DonneesInvalides)
    }
  })

  it('compte 500 caractères perçus, émojis inclus', () => {
    expect(validerMotif('rejected', '😀'.repeat(500))).toBe('😀'.repeat(500))
    expect(() => validerMotif('rejected', '😀'.repeat(501))).toThrow(
      DonneesInvalides
    )
    expect(() => validerMotif('rejected', 'x'.repeat(501))).toThrow(
      DonneesInvalides
    )
    expect(validerMotif('rejected', 'x'.repeat(500))).toBe('x'.repeat(500))
  })
})

function noteDe(
  auteurId: string,
  auteurManagerId: string | null,
  status: 'pending' | 'approved' | 'rejected' = 'pending'
): NoteAvecAuteur {
  return {
    note: new ExpenseNote({
      id: 'note-1',
      userId: auteurId,
      amount: 20,
      expenseDate: '2026-01-15',
      description: 'Taxi client',
      receiptKey: 'receipts/1.png',
      status,
      createdAt: '2026-01-15T10:00:00.000Z',
    }),
    auteurId,
    auteurCompanyId: 'c1',
    auteurManagerId,
    auteurRole: 'employee',
  }
}

function fauxDeps(
  cible: NoteAvecAuteur | null,
  trancher: (acteur: Acteur, noteId: string) => Promise<boolean> = async () =>
    true
) {
  const trancherSiEnAttente = vi.fn(trancher)
  const notes = {
    trouverParId: vi.fn(async () => cible),
    trancherSiEnAttente,
  } as unknown as ExpenseNoteRepository
  // Organigramme : employé rattaché à « manager-1 » (lui-même rattaché
  // à « top ») ; aucun RH listé.
  const annuaire = {
    trouverUtilisateur: vi.fn(async (_entreprise: string, id: string) => {
      if (id === 'manager-1') {
        return {
          id,
          role: 'manager',
          managerId: 'top',
          companyId: 'c1',
          email: 'm@x.fr',
          name: 'M',
        }
      }
      if (id === 'top') {
        return {
          id,
          role: 'manager',
          managerId: null,
          companyId: 'c1',
          email: 't@x.fr',
          name: 'T',
        }
      }
      return null
    }),
    listerRh: vi.fn(async () => []),
  } as unknown as AnnuaireOrganisation
  const notifierDecision = vi.fn(async () => undefined)
  const notificateur = {
    notifierDecision,
  } as unknown as NotificationPort
  return { notes, annuaire, notificateur, notifierDecision, trancherSiEnAttente }
}

const valideur: Acteur = { id: 'manager-1', role: 'manager', companyId: 'c1' }
const intrus: Acteur = { id: 'autre-manager', role: 'manager', companyId: 'c1' }

describe('trancherNote (ordre autorisation → motif)', () => {
  it('rend 404 (jamais 400) à un acteur non valideur même sans motif', async () => {
    const deps = fauxDeps(noteDe('employe-1', 'manager-1'))
    await expect(
      trancherNote(intrus, 'note-1', 'rejected', null, deps)
    ).rejects.toBeInstanceOf(NoteIntrouvable)
    expect(deps.trancherSiEnAttente).not.toHaveBeenCalled()
  })

  it('distingue la course perdue (409) de l’inexistant (404)', async () => {
    const depsCourse = fauxDeps(noteDe('employe-1', 'manager-1'), async () => false)
    await expect(
      trancherNote(valideur, 'note-1', 'approved', null, depsCourse)
    ).rejects.toBeInstanceOf(DejaTranchee)
    const depsAbsente = fauxDeps(null)
    await expect(
      trancherNote(valideur, 'note-1', 'approved', null, depsAbsente)
    ).rejects.toBeInstanceOf(NoteIntrouvable)
    expect(respondError(new DejaTranchee('x')).status).toBe(409)
    expect(respondError(new NoteIntrouvable('x')).status).toBe(404)
  })

  it('refuse tout rôle non décideur sans fuite d’existence', async () => {
    const employe: Acteur = { id: 'employe-1', role: 'employee', companyId: 'c1' }
    const deps = fauxDeps(noteDe('employe-1', 'manager-1'))
    await expect(
      trancherNote(employe, 'note-1', 'approved', null, deps)
    ).rejects.toBeInstanceOf(NoteIntrouvable)
  })

  it('enregistre, notifie après commit et renvoie la vue', async () => {
    const deps = fauxDeps(noteDe('employe-1', 'manager-1'))
    const relue = await trancherNote(valideur, 'note-1', 'rejected', 'montant incohérent', deps)
    expect(relue.note.id).toBe('note-1')
    expect(deps.trancherSiEnAttente).toHaveBeenCalledWith(
      valideur,
      'note-1',
      'rejected',
      'montant incohérent'
    )
    expect(deps.notifierDecision).toHaveBeenCalledWith(
      expect.objectContaining({
        noteId: 'note-1',
        auteurId: 'employe-1',
        decision: 'rejected',
        decidedBy: 'manager-1',
        motif: 'montant incohérent',
      })
    )
  })

  it('une notification en échec ne fait pas échouer la décision', async () => {
    const deps = fauxDeps(noteDe('employe-1', 'manager-1'))
    deps.notifierDecision.mockRejectedValueOnce(new Error('smtp down'))
    await expect(
      trancherNote(valideur, 'note-1', 'approved', null, deps)
    ).resolves.toBeDefined()
  })
})

describe('lireRaison (revues phase/4)', () => {
  it('rend undefined sans corps, corps illisible ou non objet', async () => {
    await expect(
      lireRaison(new Request('http://x', { method: 'POST' }))
    ).resolves.toBeUndefined()
    await expect(
      lireRaison(
        new Request('http://x', { method: 'POST', body: 'pas du json' })
      )
    ).resolves.toBeUndefined()
    await expect(
      lireRaison(
        new Request('http://x', { method: 'POST', body: '["r"]' })
      )
    ).resolves.toBeUndefined()
    await expect(
      lireRaison(new Request('http://x', { method: 'POST', body: '"r"' }))
    ).resolves.toBeUndefined()
  })

  it('extrait reason telle quelle, même absente ou non chaîne', async () => {
    await expect(
      lireRaison(
        new Request('http://x', { method: 'POST', body: '{"reason":"x"}' })
      )
    ).resolves.toBe('x')
    await expect(
      lireRaison(new Request('http://x', { method: 'POST', body: '{}' }))
    ).resolves.toBeUndefined()
    await expect(
      lireRaison(
        new Request('http://x', { method: 'POST', body: '{"reason":42}' })
      )
    ).resolves.toBe(42)
  })
})
