import { describe, expect, it } from 'vitest'
import {
  AccesRefuse,
  CycleHierarchique,
  DejaTranchee,
  DonneesInvalides,
  ManagerIneligible,
  NoteIntrouvable,
} from '@/domain/errors'
import { respondError, respondErreurMetier } from '@/lib/errors'

describe('traducteur d’erreurs (contrats-ports §7)', () => {
  it.each([
    [new DonneesInvalides('Champs invalides'), 400],
    [new AccesRefuse('Unauthorized'), 403],
    [new NoteIntrouvable('Not found'), 404],
    [new DejaTranchee('Already decided'), 409],
    [new ManagerIneligible('Invalid manager'), 409],
    [new CycleHierarchique('Cycle'), 409],
  ])('traduit %s en %i avec le message public', async (erreur, statut) => {
    const reponse = respondError(erreur)
    expect(reponse.status).toBe(statut)
    expect(await reponse.json()).toEqual({ error: erreur.message })
  })

  // Phase 1 : la 500 expose encore le message technique et la stack
  // (état P0). Durci en phase 8 : 500 générique « Erreur interne »,
  // sans stack ni détail (voir le test final de tests/unit/lib).
  it('500 : message technique et stack visibles (durcis en phase 8)', async () => {
    const erreur = new Error('boom')
    erreur.stack = 'stack-trace-interne'
    const reponse = respondErreurMetier(
      new DonneesInvalides('Champs invalides')
    )
    expect(reponse.status).toBe(400)
    const generique = respondError(erreur)
    expect(generique.status).toBe(500)
    expect(await generique.json()).toEqual({
      error: 'boom',
      stack: 'stack-trace-interne',
    })
  })
})
