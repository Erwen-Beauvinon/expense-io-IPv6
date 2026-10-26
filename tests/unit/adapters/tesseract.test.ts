import { describe, expect, it, vi } from 'vitest'
import { suggestFields } from '@/lib/ocr'
import { TesseractAnalyseurDeRecu } from '@/adapters/TesseractAnalyseurDeRecu'

vi.mock('@/lib/ocr', () => ({
  suggestFields: vi.fn(async () => ({ amount: 12.5 })),
}))

const moteur = vi.mocked(suggestFields)

// Plafond de concurrence (revue phase/5 §2, F7) : prouvé sans lancer
// Tesseract — le moteur est simulé, la saturation rend {} avant appel.
describe('TesseractAnalyseurDeRecu (saturation)', () => {
  it('rend {} sans appeler le moteur quand saturé', async () => {
    moteur.mockClear()
    const analyseur = new TesseractAnalyseurDeRecu(0)
    await expect(
      analyseur.analyser({ data: Buffer.from([1]), mimeType: 'image/png' })
    ).resolves.toEqual({})
    expect(moteur).not.toHaveBeenCalled()
  })

  it('délègue au moteur quand un créneau est libre', async () => {
    moteur.mockClear()
    const analyseur = new TesseractAnalyseurDeRecu()
    await expect(
      analyseur.analyser({ data: Buffer.from([1]), mimeType: 'image/png' })
    ).resolves.toEqual({ amount: 12.5 })
    expect(moteur).toHaveBeenCalledTimes(1)
  })

  it('rend {} sur signal déjà abandonné', async () => {
    moteur.mockClear()
    const analyseur = new TesseractAnalyseurDeRecu()
    const controleur = new AbortController()
    controleur.abort()
    await expect(
      analyseur.analyser({
        data: Buffer.from([1]),
        mimeType: 'image/png',
        signal: controleur.signal,
      })
    ).resolves.toEqual({})
    expect(moteur).not.toHaveBeenCalled()
  })
})
