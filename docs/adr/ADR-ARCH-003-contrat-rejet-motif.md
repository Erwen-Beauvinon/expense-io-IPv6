---
id: ADR-ARCH-003
status: accepted
scope:
  - docs/contrat-client-fige.md
  - src/app/api/manager/**
  - src/app/api/hr/**
  - src/components/**
  - tests/contract/**
---

# Dérogation contrat client : motif obligatoire au rejet

Source : ADR-DOMAIN-002 `accepted` (branche `architecture`,
2026-10-21), accepté pour nous le 2026-10-22. Sans cette dérogation,
le §6 du contrat client figé (« corps des requêtes de décision
inchangé ») interdirait d'exiger le motif rendu obligatoire au rejet.

## Decision

Les requêtes `POST …/expense-notes/{id}/reject` (manager et RH)
reçoivent un corps JSON `{ "reason": "…" }` :

- `reason` est **obligatoire et non vide** au rejet (après suppression
  des espaces de bord), 500 caractères maximum, texte brut ;
- un rejet sans motif ou avec un motif hors borne est refusé en
  `DonneesInvalides` → 400, et rien n'est écrit ;
- l'approbation accepte le même champ à titre facultatif ;
- les **réponses** ne changent pas : mêmes statuts, même forme de
  note, `decided_by` / `decided_at` / `decision_reason` jamais exposés ;
- la règle du domaine et le front (`PendingApprovalsPanel`,
  `AdminConsole`) sont livrés dans la même phase, et les tests golden
  C07/C11 sont mis à jour ensemble (cas nominal avec motif + nouveau
  cas « rejet sans motif → 400 »).

## Reasons

- Un rejet sans explication laisse l'employé sans moyen de corriger
  sa demande (arbitrage ADR-DOMAIN-002).
- Le nom `reason` suit les clés JSON existantes de l'API (`managerId`,
  `expenseDate`) plutôt qu'un calque du français.
- Livrer domaine, front et golden ensemble évite toute période où un
  rejet légitime serait impossible (front sans champ) ou non testé.

## Verification

```bash
BASE=http://localhost:3100 node scripts/capture-golden.mjs
```

- Les golden C07/C11 nominaux portent `{ "reason": "…" }` et restent
  verts après normalisation ;
- un cas golden supplémentaire « rejet sans motif → 400 » est vert ;
- aucun golden C01–C11 ne contient `decided_by`, `decided_at` ou
  `decision_reason` ;
- `rg "decided_by|decision_reason" src/app/api src/components`
  ne renvoie que les écritures serveur autorisées (aucune lecture
  exposée dans une réponse).

## Retirement

Revoir si le motif devient obligatoire pour les approbations, s'il est
affiché au client (nouvelle dérogation au contrat figé requise), ou si
la traçabilité migre vers une table d'historique (voir ADR-DOMAIN-002).
