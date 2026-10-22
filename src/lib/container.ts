import { ConsoleNotificationAdapter } from '@/adapters/ConsoleNotificationAdapter'
import { S3ReceiptAdapter } from '@/adapters/S3ReceiptAdapter'
import type { NotificationPort } from '@/ports/NotificationPort'
import type { ReceiptStoragePort } from '@/ports/ReceiptStoragePort'

// Point d'assemblage unique des dépendances (docs/contrats-ports.md
// §10) : les routes et Server Actions ne connaîtront que les cas
// d'usage et ce point, jamais un adaptateur directement.
let stockageRecus: ReceiptStoragePort | undefined
let notificateur: NotificationPort | undefined

export function getStockageRecus(): ReceiptStoragePort {
  if (!stockageRecus) stockageRecus = new S3ReceiptAdapter()
  return stockageRecus
}

export function getNotificateur(): NotificationPort {
  if (!notificateur) notificateur = new ConsoleNotificationAdapter()
  return notificateur
}
