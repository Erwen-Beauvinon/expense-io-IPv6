# Architecture

Description de l'état actuel du code, pas d'une cible. Les règles appliquées
par des outils sont dans [docs/adr/](adr/) ; les contrats des ports dans
[contrats-ports.md](contrats-ports.md), les invariants dans
[registre-invariants.md](registre-invariants.md), le contrat client figé dans
[contrat-client-fige.md](contrat-client-fige.md).

## Carte du code

```text
src/app/                 Next.js App Router : pages, routes API, server actions
  api/expense-notes/       Notes de l'utilisateur courant (liste, création, URL du reçu, suggestion OCR)
  api/manager/…            Liste et décisions d'un manager (valideur direct ou N+1)
  api/hr/…                 Annuaire RH, rattachement manager, liste et décisions RH
  api/_partage/            Morceaux communs aux routes : contrôle d'espace (codes 401/403 figés),
                           accès au justificatif
  actions/auth.ts          Server actions signup / login / logout (limitées en débit)
src/components/          Composants client ('use client') : console RH, panneau de validation
src/application/         Cas d'usage : SoumettreNote, ConsulterMesNotes, SuggererChamps,
                         AccederAuJustificatif, ListerNotesATrancher, TrancherNote,
                         ConsulterAnnuaire, RattacherAuManager, Inscrire
src/domain/              Cœur métier pur, où vivent les règles :
                           ExpenseNote (machine à états), Montant, DateDepense, Description,
                           Justificatif (reçu et gabarit OCR), Motif (décision),
                           PolitiqueAcces (valideurs, file, consultation, rôles décideurs),
                           Hierarchie (rattachement, cycles), Inscription (champs, rôle),
                           OrdreTri, erreurs métier, types (Acteur, Role, NoteAvecAuteur,
                           UtilisateurAnnuaire, NoteTranchee)
src/ports/               Interfaces : ExpenseNoteRepository, AnnuaireOrganisation, UnitOfWork
                         (et sa poignée Transaction), ReceiptStoragePort, AnalyseurDeRecu,
                         NotificationPort
src/adapters/            PostgreSQL (notes, annuaire, unité de travail), S3, Tesseract, console
src/lib/                 Infrastructure et interface : container (racine de composition),
                         db (pg, transactions, RLS), auth (Auth.js), actor (acteur serveur),
                         errors (traducteur d'erreurs), serialisation (JSON figé),
                         storage (S3), ocr (Tesseract) et lectureTicket (texte OCR → montant,
                         date), rate-limit
src/utils/               Formatage pur (partagé client/serveur)
src/proxy.ts             Redirige vers /login les pages protégées ; limite l'endpoint Auth.js direct
migrations/              Schéma SQL, traçabilité des décisions, rôle applicatif, index, policies RLS
scripts/                 seed.mjs, ensure-bucket.mjs (app) ; capture/check-golden, validate-adrs,
                         drills/ (vérification)
tests/unit/              Vitest : domaine, cas d'usage (ports simulés), adaptateurs, lib, utils
tests/support/           Table de vérité des valideurs, partagée par le domaine et l'intégration
tests/integration/       Vitest sous PostgreSQL réel et rôle applicatif (RUN_INTEGRATION=1)
tests/contract/          Golden du contrat client (C01–C11)
tests/e2e/               Playwright : parcours de référence
tessdata/                Modèle OCR français embarqué
```

## Dépendances entre couches

```text
app (routes, actions) ──▶ application ──▶ ports ──▶ domain
          │                    └────────────────────▶ domain
          └──▶ lib (container, errors, serialisation, actor, db…)
                 └── container ──▶ adapters ──▶ ports, domain, lib (db, storage, ocr)
components ──▶ utils, domain
```

- `src/lib/container.ts` est le seul module qui importe `@/adapters/*`
  (racine de composition, amendement ADR-ARCH-001 du 2026-10-24).
- Frontières appliquées par ESLint et démontrées par des drills pour
  `domain`, `ports`, `utils`, `lib`, `adapters` et `components`
  ([ADR-ARCH-001](adr/ADR-ARCH-001-layer-boundaries.md)).
- `src/application/` n'a **pas** de règle ESLint propre : aujourd'hui il
  n'importe que le domaine, les ports et lui-même, mais rien ne
  l'empêche d'importer `lib` ou `adapters`.

## Parcours d'une requête

1. Les pages `/expenses`, `/manager`, `/hr` sont protégées par `src/proxy.ts`.
   Les routes `/api/*` ne le sont pas : chaque handler appelle `auth()` et
   contrôle `session.user.role` (codes de refus figés : 401 ou 403).
2. `resolveActeur` relit en base le rôle et l'entreprise de l'utilisateur :
   un rôle retiré ne survit pas au jeton.
3. La route appelle le cas d'usage, qui reçoit ses ports depuis
   `container.ts`. Les erreurs métier sont traduites en un seul endroit
   (`lib/errors.ts`) ; une panne renvoie `500 { "error": "Erreur interne" }`,
   sans stack.
4. Les accès à `expense_notes` passent par `withUserScope` ou `UnitOfWork`,
   qui posent `app.current_user_id` pour les policies RLS. Le serveur se
   connecte avec le rôle `expense_app`, non-superutilisateur
   ([ADR-DATA-002](adr/ADR-DATA-002-role-applicatif-rls.md)).
5. Les valideurs sont calculés depuis l'organigramme courant
   ([ADR-ARCH-002](adr/ADR-ARCH-002-transfert-notes-en-attente.md)). Une
   décision passe par l'entité `ExpenseNote` (règle), puis par une écriture
   conditionnelle unique sur `status = 'pending'` (concurrence) qui
   enregistre auteur, date et motif
   ([ADR-DOMAIN-001](adr/ADR-DOMAIN-001-expense-note-lifecycle.md),
   [ADR-DOMAIN-002](adr/ADR-DOMAIN-002-tracabilite-decisions.md)), puis
   l'auteur est notifié. La règle des valideurs existe en TypeScript, en un
   prédicat SQL et dans la RLS : les trois sont confrontés à la même table
   de vérité.
6. Le reçu est envoyé sur S3 avant la création de la note ; sa lecture passe
   par une URL pré-signée de 300 s, émise après `peutConsulter`.

## Ce que la vérification couvre

| Surface | Preuve disponible |
|---|---|
| Frontières de couches | `make lint` + `drill-boundaries-*` |
| Garde de statut du domaine | `make test` + `drill-transition-guard` |
| Domaine et cas d'usage | `make test` (ports simulés, sans Docker) |
| Concordance des valideurs TS / SQL / RLS | `tests/unit/domain/table-valideurs.test.ts` + `tests/integration/concordance-valideurs.test.ts` |
| Types | `make typecheck` |
| Format des ADR | `make validate-adrs` |
| RLS sous rôle applicatif, inscription | `tests/integration/` (Docker, étape CI `Integration`) |
| Parcours d'interface | `make test-e2e` (Docker, job CI `e2e`) |
| Contrat client C01–C11 | `make golden` (serveur et seed requis) |
| Accès directs croisés à l'API, concurrence rejouable | non couverts ([backlog](backlog.md) #001, #002) |

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
