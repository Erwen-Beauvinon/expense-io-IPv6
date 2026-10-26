// Événement de décision (docs/contrats-ports.md §9, ADR-DOMAIN-002) :
// publié après le commit de TrancherNote, jamais exposé au client.
// noteId + décision forment la clé naturelle d'idempotence (I6).
export type Decision = 'approved' | 'rejected'

export interface NoteTranchee {
  noteId: string
  auteurId: string
  decision: Decision
  decidedBy: string
  decidedAt: Date
  motif: string | null
}
