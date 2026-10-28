import { describe, expect, it, vi } from 'vitest'
import type { Acteur } from '@/domain/Acteur'
import { DonneesInvalides } from '@/domain/errors'
import type { ExpenseNoteRepository } from '@/ports/ExpenseNoteRepository'
import type { ReceiptStoragePort } from '@/ports/ReceiptStoragePort'
import type { UnitOfWork } from '@/ports/UnitOfWork'
import { EcritureIncertaine } from '@/ports/UnitOfWork'
import {
  extensionPour,
  soumettreNote,
  type SoumissionBrute,
} from '@/application/SoumettreNote'

const ACTEUR: Acteur = { id: 'emp', role: 'employee', companyId: 'c1' }

const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])

function recu(partiel = {}) {
  return { data: PNG, mimeType: 'image/png', size: PNG.length, ...partiel }
}

function soumission(partiel: Partial<SoumissionBrute> = {}): SoumissionBrute {
  return {
    montant: '12.50',
    dateDepense: '2026-10-01',
    description: 'Taxi',
    recu: recu(),
    ...partiel,
  }
}

function deps(overrides: { creer?: unknown; upload?: unknown } = {}) {
  const notes = {
    trouverParId: vi.fn(),
    listerParAuteur: vi.fn(),
    listerEnAttentePour: vi.fn(),
    trancherSiEnAttente: vi.fn(),
    reserverSequence: vi.fn(async () => 42),
    creer: vi.fn(async (_tx: unknown, entree: Record<string, unknown>) => ({
      note: {
        toJSON: () => ({ ...entree, id: 'n1', userId: 'emp', status: 'pending', createdAt: '2026-01-01T00:00:00.000Z' }),
      },
      auteurId: 'emp',
      auteurCompanyId: 'c1',
      auteurManagerId: 'm1',
      auteurRole: 'employee',
    })),
    ...('creer' in overrides ? { creer: overrides.creer } : {}),
  } as unknown as ExpenseNoteRepository & { creer: ReturnType<typeof vi.fn> }
  const stockage = {
    upload: vi.fn(async () => {}),
    getSignedUrl: vi.fn(async () => 'url'),
    supprimer: vi.fn(async () => {}),
    ...('upload' in overrides ? { upload: overrides.upload } : {}),
  } as unknown as ReceiptStoragePort & {
    upload: ReturnType<typeof vi.fn>
    supprimer: ReturnType<typeof vi.fn>
  }
  const unitOfWork = {
    executer: vi.fn(async (_acteur: Acteur, travail: (tx: unknown) => Promise<never>) => travail({})),
  } as unknown as UnitOfWork & { executer: ReturnType<typeof vi.fn> }
  return { notes, stockage, unitOfWork }
}

describe('soumettreNote (I4)', () => {
  it('envoie le reçu avant de créer la note, clé au format gelé', async () => {
    const d = deps()
    const ordre: string[] = []
    d.stockage.upload.mockImplementation(async () => { ordre.push('upload') })
    d.notes.creer.mockImplementation(async () => { ordre.push('creer'); return {} })
    await soumettreNote(ACTEUR, soumission(), d)
    expect(ordre).toEqual(['upload', 'creer'])
    expect(d.stockage.upload).toHaveBeenCalledWith('receipts/42.png', expect.any(Buffer), 'image/png')
  })

  it('aucune note si l’envoi du reçu échoue', async () => {
    const d = deps({ upload: vi.fn(async () => { throw new Error('s3 down') }) })
    await expect(soumettreNote(ACTEUR, soumission(), d)).rejects.toThrow('s3 down')
    expect(d.notes.creer).not.toHaveBeenCalled()
    expect(d.stockage.supprimer).not.toHaveBeenCalled()
  })

  it('compense par suppression du reçu si la création échoue', async () => {
    const d = deps({ creer: vi.fn(async () => { throw new Error('db down') }) })
    await expect(soumettreNote(ACTEUR, soumission(), d)).rejects.toThrow('db down')
    expect(d.stockage.supprimer).toHaveBeenCalledWith('receipts/42.png')
  })

  it.each([
    [{ montant: '12abc' }],
    [{ dateDepense: '2026-02-30' }],
    [{ description: '   ' }],
    [{ recu: null }],
    [{ recu: recu({ mimeType: 'text/plain' }) }],
    [{ recu: recu({ size: 10 * 1024 * 1024 + 1 }) }],
  ])('refuse la saisie invalide sans toucher ni S3 ni la base %s', async (partiel) => {
    const d = deps()
    await expect(soumettreNote(ACTEUR, soumission(partiel), d)).rejects.toThrow(DonneesInvalides)
    expect(d.stockage.upload).not.toHaveBeenCalled()
    expect(d.notes.creer).not.toHaveBeenCalled()
  })

  it('refuse des octets qui ne correspondent pas au type déclaré (revue V2, point 8)', async () => {
    const d = deps()
    await expect(
      soumettreNote(
        ACTEUR,
        soumission({ recu: recu({ data: Buffer.from('<html>pas un png</html>') }) }),
        d
      )
    ).rejects.toThrow(DonneesInvalides)
    expect(d.stockage.upload).not.toHaveBeenCalled()
  })

  it('accepte le PDF avec la bonne extension de clé', async () => {
    const d = deps()
    await soumettreNote(
      ACTEUR,
      soumission({
        recu: recu({ mimeType: 'application/pdf', data: Buffer.from('%PDF-1.7 contenu') }),
      }),
      d
    )
    expect(d.stockage.upload).toHaveBeenCalledWith('receipts/42.pdf', expect.any(Buffer), 'application/pdf')
  })

  it('ne compense jamais sur écriture incertaine (COMMIT sans accusé)', async () => {
    const incertaine = new EcritureIncertaine('COMMIT sans accusé', new Error('connexion perdue'))
    const d = deps({})
    d.unitOfWork.executer.mockRejectedValueOnce(incertaine)
    await expect(soumettreNote(ACTEUR, soumission(), d)).rejects.toBe(incertaine)
    expect(d.stockage.upload).toHaveBeenCalledWith('receipts/42.png', expect.any(Buffer), 'image/png')
    expect(d.stockage.supprimer).not.toHaveBeenCalled()
  })

  it('extensionPour ne dépend que du type validé (liste fermée du domaine)', () => {
    expect(extensionPour('image/png')).toBe('.png')
    expect(extensionPour('image/jpeg')).toBe('.jpg')
    expect(extensionPour('application/pdf')).toBe('.pdf')
  })

  it('transmet au port les objets valeur du domaine, pas des primitives', async () => {
    const d = deps()
    await soumettreNote(ACTEUR, soumission({ montant: ' 12.50 ', description: '  Taxi  ' }), d)
    const entree = d.notes.creer.mock.calls[0][1] as {
      montant: { valeur: number }
      dateDepense: { valeur: string }
      description: { valeur: string }
    }
    expect(entree.montant.valeur).toBe(12.5)
    expect(entree.dateDepense.valeur).toBe('2026-10-01')
    expect(entree.description.valeur).toBe('Taxi')
  })
})
