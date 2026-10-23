import { describe, expect, it, vi } from 'vitest'
import type { SuggestionRecu } from '@/ports/AnalyseurDeRecu'
import {
  suggererChamps,
  TAILLE_MAX_SUGGESTION,
} from '@/application/SuggererChamps'

function analyseur(resultat: SuggestionRecu, delai = 0) {
  return {
    analyser: vi.fn(
      (): Promise<SuggestionRecu> =>
        new Promise<SuggestionRecu>((resoudre) => {
          setTimeout(() => resoudre(resultat), delai)
        })
    ),
  }
}

describe('suggererChamps (contrat C03 : {} est une réponse valide)', () => {
  it('renvoie la suggestion du moteur dans le gabarit', async () => {
    const deps = { analyseur: analyseur({ amount: 12.5 }) }
    await expect(
      suggererChamps(
        { data: Buffer.from([1]), mimeType: 'image/png', size: 10 },
        deps
      )
    ).resolves.toEqual({ amount: 12.5 })
  })

  it.each(['application/pdf', 'text/plain'])(
    'répond {} sans appeler le moteur pour %s',
    async (mimeType) => {
      const deps = { analyseur: analyseur({}) }
      await expect(
        suggererChamps({ data: Buffer.from([1]), mimeType, size: 10 }, deps)
      ).resolves.toEqual({})
      expect(deps.analyseur.analyser).not.toHaveBeenCalled()
    }
  )

  it('répond {} au-delà de 10 Mio sans appeler le moteur', async () => {
    const deps = { analyseur: analyseur({}) }
    await expect(
      suggererChamps(
        { data: Buffer.from([1]), mimeType: 'image/png', size: TAILLE_MAX_SUGGESTION + 1 },
        deps
      )
    ).resolves.toEqual({})
    expect(deps.analyseur.analyser).not.toHaveBeenCalled()
  })

  it('répond {} quand le moteur échoue', async () => {
    const deps = {
      analyseur: { analyser: vi.fn(async () => { throw new Error('tesseract down') }) },
    }
    await expect(
      suggererChamps({ data: Buffer.from([1]), mimeType: 'image/png', size: 10 }, deps)
    ).resolves.toEqual({})
  })

  it('répond {} quand le moteur dépasse le délai', async () => {
    const deps = { analyseur: analyseur({}, 5000) }
    await expect(
      suggererChamps({ data: Buffer.from([1]), mimeType: 'image/png', size: 10 }, deps, 50)
    ).resolves.toEqual({})
  })

  it('annule le moteur coopératif au délai (signal honoré)', async () => {
    let avorte = false
    const deps = {
      analyseur: {
        analyser: vi.fn(
          (entree: { signal?: AbortSignal }): Promise<SuggestionRecu> =>
            new Promise<SuggestionRecu>((resoudre) => {
              entree.signal?.addEventListener(
                'abort',
                () => {
                  avorte = true
                  resoudre({})
                },
                { once: true }
              )
            })
        ),
      },
    }
    await expect(
      suggererChamps({ data: Buffer.from([1]), mimeType: 'image/png', size: 10 }, deps, 20)
    ).resolves.toEqual({})
    expect(avorte).toBe(true)
    const appel = deps.analyseur.analyser.mock.calls[0][0]
    expect(appel.signal).toBeInstanceOf(AbortSignal)
  })
})
