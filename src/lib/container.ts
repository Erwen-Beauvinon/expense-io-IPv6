import { ConsoleNotificationAdapter } from '@/adapters/ConsoleNotificationAdapter'
import { PgAnnuaireOrganisation } from '@/adapters/PgAnnuaireOrganisation'
import { PgExpenseNoteRepository } from '@/adapters/PgExpenseNoteRepository'
import { PgUnitOfWork } from '@/adapters/PgUnitOfWork'
import { S3ReceiptAdapter } from '@/adapters/S3ReceiptAdapter'
import { TesseractAnalyseurDeRecu } from '@/adapters/TesseractAnalyseurDeRecu'
import type { AnalyseurDeRecu } from '@/ports/AnalyseurDeRecu'
import type { AnnuaireOrganisation } from '@/ports/AnnuaireOrganisation'
import type { ExpenseNoteRepository } from '@/ports/ExpenseNoteRepository'
import type { NotificationPort } from '@/ports/NotificationPort'
import type { ReceiptStoragePort } from '@/ports/ReceiptStoragePort'
import type { UnitOfWork } from '@/ports/UnitOfWork'

// Point d'assemblage unique des dépendances (docs/contrats-ports.md
// §10) : les routes et Server Actions ne connaîtront que les cas
// d'usage et ce point, jamais un adaptateur directement.
let stockageRecus: ReceiptStoragePort | undefined
let notificateur: NotificationPort | undefined
let notes: ExpenseNoteRepository | undefined
let annuaire: AnnuaireOrganisation | undefined
let unitOfWork: UnitOfWork | undefined
let analyseur: AnalyseurDeRecu | undefined

export function getStockageRecus(): ReceiptStoragePort {
  if (!stockageRecus) stockageRecus = new S3ReceiptAdapter()
  return stockageRecus
}

export function getNotificateur(): NotificationPort {
  if (!notificateur) notificateur = new ConsoleNotificationAdapter()
  return notificateur
}

export function getNotes(): ExpenseNoteRepository {
  if (!notes) notes = new PgExpenseNoteRepository()
  return notes
}

export function getAnnuaire(): AnnuaireOrganisation {
  if (!annuaire) annuaire = new PgAnnuaireOrganisation()
  return annuaire
}

export function getUnitOfWork(): UnitOfWork {
  if (!unitOfWork) unitOfWork = new PgUnitOfWork()
  return unitOfWork
}

export function getAnalyseur(): AnalyseurDeRecu {
  if (!analyseur) analyseur = new TesseractAnalyseurDeRecu()
  return analyseur
}
