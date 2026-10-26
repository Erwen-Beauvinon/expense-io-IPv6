import { DejaTranchee } from '@/domain/errors'

export type ExpenseNoteStatus = 'pending' | 'approved' | 'rejected'

export interface ExpenseNoteProps {
  id: string
  userId: string
  amount: number
  expenseDate: string
  description: string
  receiptKey: string
  status: ExpenseNoteStatus
  // Renseigné par l'adaptateur depuis `created_at`. Obligatoire :
  // toute lecture persistée en a un ; les tests du domaine pur
  // fournissent une valeur factice (revues phase/2).
  createdAt: string
}

export class ExpenseNote {
  constructor(private readonly props: ExpenseNoteProps) {}

  get id(): string {
    return this.props.id
  }

  get status(): ExpenseNoteStatus {
    return this.props.status
  }

  canBeDecided(): boolean {
    return this.props.status === 'pending'
  }

  approve(): ExpenseNote {
    if (!this.canBeDecided()) {
      // Erreur métier typée, message du contrat client figé (§4) :
      // traduite en 409 par la couche interface, jamais en 500.
      throw new DejaTranchee('Already decided')
    }
    return new ExpenseNote({ ...this.props, status: 'approved' })
  }

  reject(): ExpenseNote {
    if (!this.canBeDecided()) {
      // Erreur métier typée, message du contrat client figé (§4) :
      // traduite en 409 par la couche interface, jamais en 500.
      throw new DejaTranchee('Already decided')
    }
    return new ExpenseNote({ ...this.props, status: 'rejected' })
  }

  toJSON(): ExpenseNoteProps {
    return { ...this.props }
  }
}
