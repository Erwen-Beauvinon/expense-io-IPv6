import { DonneesInvalides } from '@/domain/errors'

// Règles du justificatif (I3) et du gabarit de suggestion OCR. Vérifiables
// sur les métadonnées seules (type et taille déclarés) : les routes les
// appliquent AVANT de lire les octets (revue phase/5 §1, F7), les cas
// d'usage les réappliquent.

// Soumission d'une note : les 4 types acceptés, 10 Mio au plus.
export const TYPES_RECUS_ACCEPTES = [
  'image/png',
  'image/jpeg',
  'image/webp',
  'application/pdf',
] as const
export type TypeRecuAccepte = (typeof TYPES_RECUS_ACCEPTES)[number]
export const TAILLE_MAX_RECU = 10 * 1024 * 1024

export interface Contenant {
  mimeType: string
  size: number
}

function estTypeRecuAccepte(mimeType: string): mimeType is TypeRecuAccepte {
  return (TYPES_RECUS_ACCEPTES as readonly string[]).includes(mimeType)
}

// Refuse un contenant hors règles ; renvoie le type validé, que le
// compilateur sait désormais appartenir à la liste fermée.
export function verifierContenantRecu(contenant: Contenant): TypeRecuAccepte {
  if (!estTypeRecuAccepte(contenant.mimeType)) {
    throw new DonneesInvalides('Type de fichier non autorisé pour le reçu')
  }
  if (contenant.size > TAILLE_MAX_RECU) {
    throw new DonneesInvalides('Fichier trop volumineux')
  }
  return contenant.mimeType
}

// Signature réelle des octets (revue V2, point 8) : le type MIME déclaré
// par le client ne prouve rien sur le contenu. Un contenu qui ne commence
// pas par la signature de son type déclaré est refusé. Typée sur la liste
// fermée : un type accepté sans signature ne compilerait pas. Octets
// comparés en Uint8Array, sans dépendre de Buffer (domaine pur).
function commencePar(octets: Uint8Array, attendu: readonly number[], decalage = 0): boolean {
  if (octets.length < decalage + attendu.length) return false
  return attendu.every((octet, i) => octets[decalage + i] === octet)
}

function ascii(texte: string): number[] {
  return [...texte].map((caractere) => caractere.charCodeAt(0))
}

const SIGNATURES: Record<TypeRecuAccepte, (octets: Uint8Array) => boolean> = {
  'image/png': (d) => commencePar(d, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  'image/jpeg': (d) => commencePar(d, [0xff, 0xd8, 0xff]),
  'image/webp': (d) => commencePar(d, ascii('RIFF')) && commencePar(d, ascii('WEBP'), 8),
  'application/pdf': (d) => commencePar(d, ascii('%PDF-')),
}

export function verifierOctetsRecu(recu: { data: Uint8Array; mimeType: string }): void {
  if (!estTypeRecuAccepte(recu.mimeType) || !SIGNATURES[recu.mimeType](recu.data)) {
    throw new DonneesInvalides('Type de fichier non autorisé pour le reçu')
  }
}

// Suggestion OCR : règle DISTINCTE de la soumission — images seules (pas
// le PDF), taille alignée sur celle du reçu (contrats des ports §11.3).
// Hors gabarit, la suggestion est vide, jamais une erreur (contrat C03).
export const TYPES_SUGGESTION = [
  'image/png',
  'image/jpeg',
  'image/webp',
] as const satisfies readonly TypeRecuAccepte[]
export const TAILLE_MAX_SUGGESTION = TAILLE_MAX_RECU

export function horsGabaritSuggestion(contenant: Contenant): boolean {
  return (
    !(TYPES_SUGGESTION as readonly string[]).includes(contenant.mimeType) ||
    contenant.size > TAILLE_MAX_SUGGESTION
  )
}
