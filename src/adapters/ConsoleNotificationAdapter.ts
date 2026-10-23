import type { NoteTranchee } from '@/domain/NoteTranchee'
import type { NotificationPort } from '@/ports/NotificationPort'

export class ConsoleNotificationAdapter implements NotificationPort {
  async notifierDecision(evenement: NoteTranchee): Promise<void> {
    console.log(
      `[notification] user=${evenement.auteurId} note=${evenement.noteId} decision=${evenement.decision} by=${evenement.decidedBy}`
    )
  }
}
