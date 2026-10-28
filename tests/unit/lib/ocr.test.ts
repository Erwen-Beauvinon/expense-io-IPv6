import { describe, expect, it, vi } from 'vitest'
import { createWorker } from 'tesseract.js'
import { suggestFields } from '@/lib/ocr'

vi.mock('tesseract.js', () => ({
  createWorker: vi.fn(),
}))

const creerWorker = vi.mocked(createWorker)

// Annulation pendant l'initialisation du worker (revues croisées du
// 2026-10-28) : l'événement abort survient pendant createWorker(),
// avant que l'écouteur d'abandon ne soit posé. La reconnaissance ne
// doit pas démarrer, et le worker obtenu doit être terminé.
describe('suggestFields — abandon pendant createWorker', () => {
  it('ne lance pas recognize et termine le worker si le signal expire pendant l’initialisation', async () => {
    const recognize = vi.fn(async () => ({ data: { text: 'TOTAL 10,00' } }))
    const terminate = vi.fn(async () => {})
    let resoudreWorker!: (worker: unknown) => void
    creerWorker.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resoudreWorker = resolve as (worker: unknown) => void
        }) as never
    )

    const controleur = new AbortController()
    const promesse = suggestFields(
      { data: Buffer.from([1]), mimeType: 'image/png' },
      { signal: controleur.signal }
    )
    // Le délai expire pendant que le worker s'initialise.
    controleur.abort()
    resoudreWorker({ recognize, terminate })

    await expect(promesse).resolves.toEqual({})
    expect(recognize).not.toHaveBeenCalled()
    expect(terminate).toHaveBeenCalledTimes(1)
  })

  it('reconnaît normalement sans abandon', async () => {
    const recognize = vi.fn(async () => ({ data: { text: 'TOTAL TTC 42,50 EUR' } }))
    const terminate = vi.fn(async () => {})
    creerWorker.mockResolvedValueOnce({ recognize, terminate } as never)

    await expect(
      suggestFields({ data: Buffer.from([1]), mimeType: 'image/png' })
    ).resolves.toEqual({ amount: 42.5, expenseDate: undefined })
    expect(recognize).toHaveBeenCalledTimes(1)
    expect(terminate).toHaveBeenCalledTimes(1)
  })
})
