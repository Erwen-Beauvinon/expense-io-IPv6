---
id: ADR-DOMAIN-001
status: accepted
scope:
  - src/domain/ExpenseNote.ts
  - src/app/api/manager/expense-notes/**
  - src/app/api/hr/expense-notes/**
  - migrations/**
---

# Cycle de vie d'une note de frais : une seule décision

## Decision

Une note de frais naît `pending` et ne peut être tranchée qu'une fois :

```
pending ──approve──▶ approved
   └─────reject────▶ rejected
```

Aucune transition ne part de `approved` ou `rejected`. La règle est portée à
trois endroits, chacun avec un rôle distinct :

1. **La règle métier** : `ExpenseNote.approve()` / `reject()` lèvent
   `DejaTranchee('Already decided')` si la note n'est plus `pending`
   (`canBeDecided()`). Le cas d'usage unique `TrancherNote` les appelle sur
   la note lue, après l'autorisation et la validation du motif : une note
   déjà tranchée donne `409` sans aucune écriture.
2. **La garde de concurrence** : `trancherSiEnAttente` écrit par une seule
   instruction `UPDATE … WHERE status = 'pending'`. Entre la lecture et
   l'écriture, une autre décision peut gagner : zéro ligne affectée donne
   aussi `409 Already decided` (I6). Cette garde ne doit jamais être retirée
   au motif que l'entité vérifie déjà le statut — l'entité travaille sur une
   lecture qui peut être périmée.
3. **La borne des valeurs** : la contrainte
   `CHECK (status IN ('pending', 'approved', 'rejected'))` de la migration
   (pas les transitions).

Toute nouvelle décision passe par `TrancherNote` (amendement du
2026-10-26, lot 2 : la classe est désormais utilisée par les routes).

## Reasons

- Une note approuvée puis rejetée (ou l'inverse) fausse le remboursement et
  l'historique de validation.
- Le contrôle 409 évite qu'un double clic ou deux valideurs concurrents ne
  réécrivent une décision déjà prise.

## Verification

```
make test                                   # tests de ExpenseNote
rg "SET status" src/                        # seule trancherSiEnAttente écrit le statut, sous WHERE status = 'pending'
```

## Firing condition

```
make drill-transition-guard
```

Dans une copie jetable, le drill retire la garde de `approve()` puis de
`reject()` et exige que le test qui la protège échoue, après un contrôle sans
mutation qui doit passer. Le drill échoue aussi si la garde n'est plus
trouvée là où il l'attend (mutation non appliquée).

La garde de l'entité est aussi couverte au niveau du cas d'usage
(`tests/unit/application/trancher-note.test.ts` : note lue déjà tranchée →
409 sans écriture). La garde de concurrence reste sans drill rejouable
(`docs/backlog.md` #002).

## Retirement

Revoir si un workflow multi-étapes est introduit (ex. `approved` →
`reimbursed`, ou réouverture d'une note rejetée) : la table des transitions
devra alors être explicite et testée, et ce document remplacé.
