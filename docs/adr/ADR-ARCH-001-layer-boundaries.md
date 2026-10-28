---
id: ADR-ARCH-001
status: accepted
scope:
  - src/**
  - eslint.config.mjs
---

# Frontières de couches appliquées par ESLint

## Decision

Le code applicatif est découpé en couches dont les dépendances vont dans un
seul sens :

```
app (routes, pages, server actions)  →  adapters / lib  →  ports  →  domain
components (client)                  →  utils
```

| Couche | Peut importer | Ne doit pas importer |
|---|---|---|
| `src/domain/` | `./` (autres fichiers du domaine) | toute autre couche, `pg`, `next`, `@aws-sdk/*`, React… |
| `src/ports/` | `@/domain/*` | `lib`, `adapters`, `app`, `components`, paquets d'infrastructure |
| `src/utils/` | rien du projet | toute couche du projet, paquets d'infrastructure |
| `src/lib/`, `src/adapters/` | `domain`, `ports`, `lib` | `app`, `components` |
| `src/components/` | `utils`, `domain` | `lib`, `adapters`, `pg`, `@aws-sdk/*`, `bcryptjs` |
| `src/app/` | tout | — |

Les règles sont des `no-restricted-imports` dans `eslint.config.mjs` ; chaque
message commence par `ADR-ARCH-001`.

## Reasons

- Le domaine reste testable en millisecondes, sans base ni S3 (`make test`).
- Les composants sont `'use client'` : importer `@/lib/db` ou `@/lib/auth`
  depuis l'un d'eux embarquerait du code serveur, voire des secrets, dans le
  bundle navigateur.
- Une frontière vérifiée par l'outil donne le même retour immédiat à un agent
  et à un humain, au lieu d'une remarque en revue.

## Verification

```
make lint
```

Toute violation sort en erreur `no-restricted-imports` avec le préfixe
`ADR-ARCH-001`.

## Firing condition

```
make drill-boundaries-deny     # 22 arêtes interdites plantées → toutes rejetées (alias, relatifs, dynamiques, builtins)
make drill-boundaries-permit   # 7 arêtes légales → aucune rejetée
make drill-boundaries-reason   # une erreur de syntaxe n'est pas prise pour une violation
```

Les drills tournent dans une copie jetable (`scripts/drills/workspace.mjs`) ;
le checkout n'est jamais modifié. Revoir cet ADR si un drill passe alors que
la règle correspondante a été retirée.

## Amendement du 2026-10-24 — racine de composition (revues phase/1)

La table ci-dessus autorise à `src/lib/` : `domain`, `ports`, `lib` —
pas `adapters`. Or l'assemblage exige un point unique qui câble les
ports vers leurs adaptateurs (`docs/contrats-ports.md` §10). Trancher :
`src/lib/container.ts` est la **racine de composition**, seul module
autorisé à importer `@/adapters/*`. Tout autre import d'adaptateur
hors de ce fichier reste interdit et doit être déplacé dans le
conteneur. La configuration ESLint ne distingue pas ce fichier
(l'arête `lib → adapters` reste techniquement permise hors
conteneur) : c'est un point de revue humaine, pas une règle
automatisée — les drills `deny`/`permit` sont inchangés.

## Retirement

Retirer ou revoir si le projet passe à un découpage par fonctionnalité
(vertical slices) où les imports transverses deviennent la norme, ou si
`domain/` et `ports/` disparaissent au profit de requêtes SQL dans les routes.
