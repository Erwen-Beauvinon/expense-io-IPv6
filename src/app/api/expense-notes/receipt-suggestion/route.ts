import { suggererChamps } from '@/application/SuggererChamps'
import { horsGabaritSuggestion } from '@/domain/Justificatif'
import { ESPACE_PERSONNEL, refusEspace } from '@/app/api/_partage/espace'
import { auth } from '@/lib/auth'
import { getAnalyseur } from '@/lib/container'
import { respondError } from '@/lib/errors'

export async function POST(request: Request) {
  try {
    const refus = refusEspace(await auth(), ESPACE_PERSONNEL)
    if (refus) return refus

    const formData = await request.formData()
    const receipt = formData.get('receipt')
    if (!(receipt instanceof File)) {
      return Response.json({ error: 'Champs invalides' }, { status: 400 })
    }

    // Les bornes (types, taille) vivent dans le domaine (Justificatif).
    // Les réponses restent celles du contrat gelé C03.
    // Revue phase/5 §1 (F7) : gabarit vérifié sur les métadonnées AVANT
    // de charger les octets — un hors-gabarit rend {} sans lecture.
    if (horsGabaritSuggestion({ mimeType: receipt.type, size: receipt.size })) {
      return Response.json({})
    }
    const buffer = Buffer.from(await receipt.arrayBuffer())
    const suggestion = await suggererChamps(
      { data: buffer, mimeType: receipt.type, size: receipt.size },
      { analyseur: getAnalyseur() }
    )
    return Response.json(suggestion)
  } catch (error) {
    return respondError(error)
  }
}
