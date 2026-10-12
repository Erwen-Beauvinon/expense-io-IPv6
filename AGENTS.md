# Guide pour agents

Expense.io : gestion de notes de frais (Next.js 16 App Router, PostgreSQL avec
RLS, stockage S3 via LocalStack, OCR Tesseract). Architecture détaillée dans
[docs/architecture.md](docs/architecture.md), workflow dans [CONTRIBUTING.md](CONTRIBUTING.md).
Ce fichier ne contient que ce que les outils ne vérifient pas eux-mêmes.

## Commandes

| Tâche | Commande |
|---|---|
| Installer (lockfile, hooks) | `make bootstrap` |
| Lancer l'app (Docker + migrations + seed + dev) | `make dev` |
| Vérification rapide : lint, frontières, types | `make verify-fast` |
| Vérification complète (sans Docker) | `make verify` |
| Définition de « terminé » | `make verify-all` (verify + tous les drills) |
| Tests unitaires / un seul test | `make test` / `npx vitest run tests/unit/domain -t "nom"` |
| Format des ADR | `make validate-adrs` |

`make verify` ne démarre ni PostgreSQL ni LocalStack : les routes API et la
RLS ne sont couvertes par aucun test automatisé (voir [backlog](docs/backlog.md)).

## Ordre de travail

1. Lire l'ADR concerné avant de toucher à une frontière de couche, au statut
   d'une note ou à l'accès base. Les raisons ne se déduisent pas du lint.
2. `make verify-fast` pendant l'édition ; `make verify-all` avant de conclure.
   Ajouter un test (ou un drill) pour tout comportement modifié.
3. Rapporter les preuves de fin de tâche ci-dessous.

## Contraintes non évidentes

- **Couches** : `domain` et `utils` sont purs ; `components` (client) n'importe
  jamais `@/lib` ni `@/adapters`. Appliqué par ESLint
  ([ADR-ARCH-001](docs/adr/ADR-ARCH-001-layer-boundaries.md)) : ne pas affaiblir
  `eslint.config.mjs` pour faire passer une violation.
- **Statut d'une note** : `pending` → `approved` | `rejected`, une seule fois.
  Toute route de décision renvoie 409 si la note n'est plus `pending`
  ([ADR-DOMAIN-001](docs/adr/ADR-DOMAIN-001-expense-note-lifecycle.md)).
- **Accès à `expense_notes`** : passer par `withUserScope(userId, fn)` et le
  `client` qu'il fournit, pour que la RLS s'applique. `getPool()` n'a pas de
  contexte utilisateur ([ADR-DATA-001](docs/adr/ADR-DATA-001-row-level-security.md)).
  `users` et `companies` n'ont pas de RLS : filtrer par `company_id` à la main.
- **Les routes `/api` ne sont pas protégées par `src/proxy.ts`** (le matcher
  les exclut). Chaque handler vérifie lui-même `auth()` et `session.user.role`.
- Le rôle est copié dans le JWT à la connexion : un changement de rôle en base
  n'est visible qu'après reconnexion.
- Le rôle `manager` n'est jamais attribuable depuis l'interface (seed ou SQL).
  Le premier inscrit d'un domaine email devient `hr_admin` de son entreprise.
- Les colonnes `date` restent des chaînes `YYYY-MM-DD` (parser OID 1082 dans
  `src/lib/db.ts`) : ne pas les convertir en `Date` côté serveur.
- Migrations : fichiers SQL `migrations/<timestamp>_<nom>.sql` avec sections
  `-- Up Migration` / `-- Down Migration`. Ne jamais modifier une migration
  déjà appliquée ; en ajouter une nouvelle.
- Ports locaux : PostgreSQL `5433`, LocalStack `4567` (pas les ports par défaut).

## Zones à valider avant modification

- `migrations/`, `src/lib/db.ts` : schéma et isolation des données.
- `src/lib/auth.ts`, `src/proxy.ts` : authentification et sessions.
- `.github/workflows/`, `eslint.config.mjs`, `docs/adr/` : règles de vérification.

L'autorisation de la tâche en cours s'applique toujours. CODEOWNERS contient
des équipes fictives : sa présence ne prouve aucune revue obligatoire.

## Preuves de fin de tâche

1. `make verify-all` passe (verify seul ne lance aucun drill).
2. Lister chaque commande lancée et son code de sortie.
3. Lister les fichiers modifiés.
4. Dire ce qui n'a pas pu être vérifié en local (routes, RLS, S3, OCR).
