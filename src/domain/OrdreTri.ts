import { DonneesInvalides } from '@/domain/errors'

// Liste fermée des tris autorisés sur l'historique des notes
// (docs/contrats-ports.md §2). Remplace le paramètre `sort` interpolé
// dans le SQL (injection P0, audit A-F02).
export type OrdreTri =
  | 'created_at_desc'
  | 'created_at_asc'
  | 'expense_date_desc'
  | 'expense_date_asc'
  | 'amount_desc'
  | 'amount_asc'

const ORDRES_VALIDES: readonly OrdreTri[] = [
  'created_at_desc',
  'created_at_asc',
  'expense_date_desc',
  'expense_date_asc',
  'amount_desc',
  'amount_asc',
]

export const ORDRE_TRI_DEFAUT: OrdreTri = 'created_at_desc'

export function parseOrdreTri(value: string | null): OrdreTri {
  // `?sort=` (chaîne vide, ex. lien copié) = tri par défaut, comme
  // l'absence de paramètre : seul un tri hors liste est un 400.
  if (value === null || value === '') return ORDRE_TRI_DEFAUT
  if ((ORDRES_VALIDES as readonly string[]).includes(value)) {
    return value as OrdreTri
  }
  throw new DonneesInvalides(`Tri invalide : ${value}`)
}
