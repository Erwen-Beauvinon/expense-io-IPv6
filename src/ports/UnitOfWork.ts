import type { Acteur } from '@/domain/Acteur'
import type { Transaction } from '@/domain/Transaction'

// Port UnitOfWork (docs/contrats-ports.md §5) : exécute un cas d'usage
// dans une seule transaction base, avec le contexte RLS de l'acteur
// posé pour sa durée. Commit si le travail réussit, rollback sur
// toute exception. S3 et notifications restent hors transaction.
export interface UnitOfWork {
  executer<T>(acteur: Acteur, travail: (tx: Transaction) => Promise<T>): Promise<T>

  // Transaction sans contexte RLS, réservée aux parcours publics
  // sans acteur (Inscrire, phase 7) : les tables users et companies
  // n'ont pas de RLS (ADR-DATA-001), donc aucun contexte n'est requis.
  executerPublic<T>(travail: (tx: Transaction) => Promise<T>): Promise<T>
}

// Erreur de programmation (contrats-ports §5, revue phase/5 §5) : un
// second `executer` dans un travail en cours. Composer en passant la
// poignée `tx` aux repositories, jamais en réouvrant une transaction.
// Jamais une ErreurMetier : c'est un bug → 500.
export class TransactionImbriquee extends Error {}

// Échec du COMMIT après un travail réussi (revue phase/5 §6) : la
// transaction a peut-être abouti malgré l'erreur. L'appelant ne doit
// JAMAIS compenser sur cette erreur (le reçu S3 peut correspondre à
// une note existante — I4) : journaliser et propager (→ 500).
export class EcritureIncertaine extends Error {
  readonly origine: unknown

  constructor(message: string, origine: unknown) {
    super(message)
    this.name = 'EcritureIncertaine'
    this.origine = origine
  }
}
