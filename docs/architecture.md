# Architecture

Description de l'état actuel du code, pas d'une cible. Les règles appliquées
par des outils sont dans [docs/adr/](adr/).

## Carte du code

```text
src/app/                 Next.js App Router : pages, routes API, server actions
  api/expense-notes/       Notes de l'utilisateur courant (liste, création, URL du reçu, suggestion OCR)
  api/manager/…            Décisions d'un manager sur les notes de ses rattachés
  api/hr/…                 Annuaire RH, rattachement manager, décisions sur les managers racines
  actions/auth.ts          Server actions signup / login / logout
src/components/          Composants client ('use client') : console RH, panneau de validation
src/domain/              Entités pures ExpenseNote, User (non utilisées par les routes aujourd'hui)
src/ports/               Interfaces ReceiptStoragePort, NotificationPort
src/adapters/            S3ReceiptAdapter, ConsoleNotificationAdapter (non branchés aux routes)
src/lib/                 Infrastructure : auth (Auth.js), db (pg + RLS), storage (S3), ocr (Tesseract)
src/utils/               Formatage et validateurs purs
src/proxy.ts             Redirige vers /login les pages protégées (exclut /api)
migrations/              Schéma SQL (node-pg-migrate) et policies RLS
scripts/                 seed.mjs, ensure-bucket.mjs (app) ; validate-adrs.mjs, drills/ (vérification)
tests/unit/              Tests Vitest du domaine et des utilitaires
tessdata/                Modèle OCR français embarqué
```

## Dépendances entre couches

```text
app ──▶ lib / adapters ──▶ ports ──▶ domain
components ──▶ utils, domain
```

Appliqué par ESLint, démontré par des drills :
[ADR-ARCH-001](adr/ADR-ARCH-001-layer-boundaries.md).

## Parcours d'une requête

1. Les pages `/expenses`, `/manager`, `/hr` sont protégées par `src/proxy.ts`.
   Les routes `/api/*` ne le sont pas : chaque handler appelle `auth()` et
   contrôle `session.user.role`.
2. Les lectures/écritures de `expense_notes` passent en principe par
   `withUserScope`, qui pose `app.current_user_id` pour les policies RLS
   ([ADR-DATA-001](adr/ADR-DATA-001-row-level-security.md)).
3. Les décisions approve/reject vérifient `status = 'pending'` puis écrivent
   le nouveau statut en SQL ([ADR-DOMAIN-001](adr/ADR-DOMAIN-001-expense-note-lifecycle.md)).
4. Les reçus sont stockés dans S3 (LocalStack en local) ; les URL de lecture
   sont pré-signées.

## Ce que la vérification couvre

| Surface | Preuve disponible |
|---|---|
| Frontières de couches | `make lint` (exécuté) + `drill-boundaries-*` (démontré) |
| Garde de statut du domaine | `make test` (exécuté) + `drill-transition-guard` (démontré) |
| Types | `make typecheck` (exécuté) |
| Format des ADR | `make validate-adrs` (exécuté) |
| Routes API, RLS, S3, OCR | aucune — nécessite PostgreSQL/LocalStack ([backlog](backlog.md)) |

Les drills tournent dans une copie jetable du dépôt
(`scripts/drills/workspace.mjs`) : elle protège le checkout des mutations,
ce n'est pas un bac à sable de sécurité.

## Origine de la structure

Cette organisation (AGENTS.md, ADR avec sections Verification/Retirement,
drills, `verify` / `verify-all`, CI) est adaptée du gabarit
[ai-ready-repo](https://github.com/vidanov/ai-ready-repo), transposé de
Python vers Node/TypeScript. Le toolkit Python, l'exemple « Order », les
écosystèmes CDK/Terraform et les drills de recherche du gabarit n'ont pas été
copiés : ils ne s'appliquent pas à ce projet.
