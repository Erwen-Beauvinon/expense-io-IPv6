import type { NoteTranchee } from '@/domain/NoteTranchee'

// Port NotificateurDeDecision (docs/contrats-ports.md §9) : remplace
// l'ancien notifyDecision(userId, noteId, decision), trop pauvre pour
// ADR-DOMAIN-002. Appelé après le commit ; un échec ne fait jamais
// échouer la décision persistée (journalisé, reprise ultérieure).
export interface NotificationPort {
  notifierDecision(evenement: NoteTranchee): Promise<void>
}
