import type { NextRequest } from 'next/server'
import { consulterMesNotes } from '@/application/ConsulterMesNotes'
import { soumettreNote, validerContenantRecu } from '@/application/SoumettreNote'
import { resolveActeur } from '@/lib/actor'
import { auth } from '@/lib/auth'
import { getNotes, getStockageRecus, getUnitOfWork } from '@/lib/container'
import { toExpenseNoteView } from '@/lib/serialisation'
import { respondError } from '@/lib/errors'


export async function GET(request: NextRequest) {
  try {
    const session = await auth()
    if (!session?.user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 })
    }
    const acteur = await resolveActeur(session)
    if (!acteur) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Phase 2 : historique personnel via le cas d'usage (tri fermé :
    // toute valeur hors liste est refusée en 400 ; le client web
    // n'envoie aucun `sort`, défaut inchangé).
    const notes = await consulterMesNotes(
      acteur,
      new URL(request.url).searchParams.get('sort'),
      getNotes()
    )
    return Response.json(notes.map(toExpenseNoteView))
  } catch (error) {
    return respondError(error)
  }
}


export async function POST(request: NextRequest) {
  try {
    const session = await auth()
    if (!session?.user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 })
    }
    const acteur = await resolveActeur(session)
    if (!acteur) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Phase 5 : toute la validation métier (I1, I2, bornes OCR) vit dans
    // SoumettreNote ; la route ne fait que l'adaptation HTTP. Réponses
    // inchangées (contrat C02 : 201, mêmes champs, mêmes 400).
    // Revue phase/5 §1 (F7) : les bornes du contenant sont vérifiées sur
    // les métadonnées AVANT de charger les octets en mémoire (mêmes 400
    // que le cas d'usage, qui les réapplique par défense en profondeur).
    const formData = await request.formData()
    const receipt = formData.get('receipt')
    if (receipt instanceof File) {
      validerContenantRecu({ mimeType: receipt.type, size: receipt.size })
    }
    const created = await soumettreNote(
      acteur,
      {
        montant: formData.get('amount'),
        dateDepense: formData.get('expenseDate'),
        description: formData.get('description'),
        recu:
          receipt instanceof File
            ? {
                data: Buffer.from(await receipt.arrayBuffer()),
                mimeType: receipt.type,
                size: receipt.size,
              }
            : null,
      },
      {
        notes: getNotes(),
        stockage: getStockageRecus(),
        unitOfWork: getUnitOfWork(),
      }
    )
    return Response.json(toExpenseNoteView(created), { status: 201 })
  } catch (error) {
    return respondError(error)
  }
}
