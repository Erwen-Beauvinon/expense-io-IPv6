import type { Acteur } from '@/domain/Acteur'
import type { DateDepense } from '@/domain/DateDepense'
import type { Description } from '@/domain/Description'
import type { Montant } from '@/domain/Montant'
import type { Motif } from '@/domain/Motif'
import type { NoteAvecAuteur } from '@/domain/NoteAvecAuteur'
import type { Decision } from '@/domain/NoteTranchee'
import type { OrdreTri } from '@/domain/OrdreTri'
import type { Transaction } from '@/ports/UnitOfWork'

// Entrée de création (phase 5). Les objets valeur du domaine garantissent
// par le type que montant (I1), date (I2) et description (I3) sont
// valides : un `number` ou une `string` bruts ne compilent pas. Le reçu
// est envoyé avant (I4).
export interface NouvelleNote {
  auteurId: string
  montant: Montant
  dateDepense: DateDepense
  description: Description
  receiptKey: string
}

// Port ExpenseNoteRepository (docs/contrats-ports.md §3) : persister et
// relire les notes, toujours dans le périmètre d'un acteur ou d'une
// entreprise (I9, I10). La lecture manager/RH (peutConsulter) et les
// écritures suivent avec les phases 3 à 5.
export interface ExpenseNoteRepository {
  // Phase 3 : borné à l'entreprise de l'acteur. null si absente ou
  // hors entreprise (pas de 403 : la note d'une autre entreprise
  // n'existe pas pour l'appelant). Jamais d'exception métier.
  // L'autorisation fine (manager direct, RH, I8) est tranchée par la
  // politique (PolitiqueAcces) dans les cas d'usage, pas ici.
  trouverParId(acteur: Acteur, noteId: string): Promise<NoteAvecAuteur | null>

  // Historique personnel : hors de son propre périmètre (appelée avec
  // un auteurId différent), le résultat est vide, sans erreur
  // (revues phase/2 — pas de fuite d'existence inter-employés).
  listerParAuteur(
    acteur: Acteur,
    auteurId: string,
    tri: OrdreTri
  ): Promise<NoteAvecAuteur[]>

  // Phase 4 : bascule atomique pending → décision (I5, I6). UPDATE
  // conditionnel unique : périmètre entreprise + valideur courant
  // (PolitiqueAcces, via users) dans le WHERE, écriture de statut,
  // decided_by, decided_at (= now() SQL, horloge unique) et
  // decision_reason ensemble. true si appliquée ; false si déjà
  // tranchée ou valideur perdu entre-temps (409 dans les deux cas,
  // tableau ligne 4 + ADR-ARCH-002 §3).
  trancherSiEnAttente(
    acteur: Acteur,
    noteId: string,
    decision: Decision,
    // Objet valeur du domaine (ADR-DOMAIN-002) : obligatoire au rejet,
    // garanti par Motif.pour avant l'appel.
    motif: Motif | null
  ): Promise<boolean>

  // Phase 4 : notes en attente visibles par l'acteur (I8) — manager :
  // managés directs ; RH : toute l'entreprise. N+1 exclu (repli propre
  // jusqu'à l'alignement RLS, phase 8).
  listerEnAttentePour(acteur: Acteur): Promise<NoteAvecAuteur[]>

  // Phase 5 : réserve un numéro de séquence pour la clé du reçu
  // (format gelé receipts/{seq}, contrat client §4). Un trou après
  // échec est sans signification.
  reserverSequence(): Promise<number>

  // Phase 5 : crée la note dans la transaction remise (I4). Le reçu
  // a déjà été envoyé ; toute erreur après l'envoi déclenche sa
  // compensation (suppression) côté cas d'usage.
  creer(tx: Transaction, entree: NouvelleNote): Promise<NoteAvecAuteur>
}
