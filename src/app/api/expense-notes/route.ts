import path from 'node:path'
import type { NextRequest } from 'next/server'
import { consulterMesNotes } from '@/application/ConsulterMesNotes'
import { ExpenseNote } from '@/domain/ExpenseNote'
import { resolveActeur } from '@/lib/actor'
import { auth } from '@/lib/auth'
import { getNotes } from '@/lib/container'
import { toExpenseNoteView } from '@/lib/serialisation'
import { getPool, withUserScope } from '@/lib/db'
import { respondError } from '@/lib/errors'
import { receiptKeyFor, uploadReceipt } from '@/lib/storage'

const ALLOWED_RECEIPT_TYPES = ['image/png', 'image/jpeg', 'image/webp', 'application/pdf']
const MAX_RECEIPT_BYTES = 10 * 1024 * 1024

const EXTENSION_BY_MIME: Record<string, string> = {
  'image/png': '.png',
  'image/jpeg': '.jpg',
  'image/webp': '.webp',
  'application/pdf': '.pdf',
}

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

    const formData = await request.formData()
    const amountRaw = formData.get('amount')
    const expenseDate = formData.get('expenseDate')
    const description = formData.get('description')
    const receipt = formData.get('receipt')

    const amount = typeof amountRaw === 'string' ? Number.parseFloat(amountRaw) : NaN

    if (
      !Number.isFinite(amount) ||
      amount <= 0 ||
      typeof expenseDate !== 'string' ||
      typeof description !== 'string' ||
      description.trim().length === 0 ||
      !(receipt instanceof File)
    ) {
      return Response.json({ error: 'Champs invalides' }, { status: 400 })
    }
    if (!ALLOWED_RECEIPT_TYPES.includes(receipt.type)) {
      return Response.json({ error: 'Type de fichier non autorisé pour le reçu' }, { status: 400 })
    }
    if (receipt.size > MAX_RECEIPT_BYTES) {
      return Response.json({ error: 'Fichier trop volumineux' }, { status: 400 })
    }

    const note = await withUserScope(session.user.id, async (client) => {
      const inserted = await client.query(
        `INSERT INTO expense_notes (user_id, amount, expense_date, description, receipt_key)
         VALUES ($1, $2, $3, $4, $5)
         RETURNING *`,
        [session.user.id, amount, expenseDate, description, '']
      )
      return inserted.rows[0]
    })

    const extension = EXTENSION_BY_MIME[receipt.type] ?? path.extname(receipt.name) ?? ''
    const receiptKey = receiptKeyFor(note.receipt_seq, extension)
    const buffer = Buffer.from(await receipt.arrayBuffer())
    await uploadReceipt(receiptKey, buffer, receipt.type)

    const updated = await getPool().query(
      `UPDATE expense_notes SET receipt_key = $1 WHERE id = $2 RETURNING *`,
      [receiptKey, note.id]
    )
    const ligne = updated.rows[0]

    // Phase 2 : réutilise la sérialisation unique, qui ne prend que la
    // note — aucun contexte auteur fabriqué (revues phase/2 ; la vue
    // JSON n'expose pas l'auteur). Le repository fournira le contexte
    // quand SoumettreNote migrera en phase 5.
    return Response.json(
      toExpenseNoteView({
        note: new ExpenseNote({
          id: ligne.id,
          userId: ligne.user_id,
          amount: Number.parseFloat(ligne.amount),
          expenseDate: ligne.expense_date,
          description: ligne.description,
          receiptKey: ligne.receipt_key,
          status: ligne.status,
          createdAt: ligne.created_at,
        }),
      }),
      { status: 201 }
    )
  } catch (error) {
    return respondError(error)
  }
}
