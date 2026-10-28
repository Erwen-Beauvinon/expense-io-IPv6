import { describe, expect, it, vi } from 'vitest'
import { consulterMesNotes } from '@/application/ConsulterMesNotes'
import type { Acteur } from '@/domain/Acteur'
import { DonneesInvalides } from '@/domain/errors'
import type { ExpenseNoteRepository } from '@/ports/ExpenseNoteRepository'

const acteur: Acteur = { id: 'emp', role: 'employee', companyId: 'c1' }

function notes() {
  return {
    listerParAuteur: vi.fn(async () => []),
  } as unknown as ExpenseNoteRepository
}

describe('consulterMesNotes (contrat C01)', () => {
  it("liste l'historique de l'acteur avec le tri par défaut", async () => {
    const deps = notes()
    await consulterMesNotes(acteur, null, deps)
    expect(deps.listerParAuteur).toHaveBeenCalledWith(
      acteur,
      'emp',
      'created_at_desc'
    )
  })

  it('propague un tri valide et refuse un tri hors liste', async () => {
    const deps = notes()
    await consulterMesNotes(acteur, 'amount_desc', deps)
    expect(deps.listerParAuteur).toHaveBeenCalledWith(
      acteur,
      'emp',
      'amount_desc'
    )
    await expect(
      consulterMesNotes(acteur, 'created_at; DROP TABLE users', deps)
    ).rejects.toThrow(DonneesInvalides)
  })
})
