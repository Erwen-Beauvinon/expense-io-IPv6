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
trois endroits :

1. `ExpenseNote.approve()` / `reject()` lèvent une erreur si la note n'est
   plus `pending` (`canBeDecided()`).
2. Les routes `POST …/[id]/approve|reject` (manager et RH) renvoient `409
   Already decided` si `status !== 'pending'` avant l'`UPDATE`.
3. La contrainte `CHECK (status IN ('pending', 'approved', 'rejected'))` de
   la migration borne les valeurs possibles (pas les transitions).

Les routes n'utilisent pas encore la classe `ExpenseNote` : elles relisent
le statut et écrivent en SQL. Toute nouvelle route de décision doit
reproduire le contrôle `pending` → 409, ou passer par la classe.

## Reasons

- Une note approuvée puis rejetée (ou l'inverse) fausse le remboursement et
  l'historique de validation.
- Le contrôle 409 évite qu'un double clic ou deux valideurs concurrents ne
  réécrivent une décision déjà prise.

## Verification

```
make test                                   # tests de ExpenseNote
rg "status = '(approved|rejected)'" src/    # chaque UPDATE doit suivre un contrôle 'pending'
```

## Firing condition

```
make drill-transition-guard
```

Dans une copie jetable, le drill retire la garde de `approve()` puis de
`reject()` et exige que le test qui la protège échoue, après un contrôle sans
mutation qui doit passer. Le drill échoue aussi si la garde n'est plus
trouvée là où il l'attend (mutation non appliquée).

Les gardes des routes (409) ne sont pas encore couvertes par un test : il
faudrait des tests d'intégration avec PostgreSQL (voir `docs/backlog.md`).

## Retirement

Revoir si un workflow multi-étapes est introduit (ex. `approved` →
`reimbursed`, ou réouverture d'une note rejetée) : la table des transitions
devra alors être explicite et testée, et ce document remplacé.
