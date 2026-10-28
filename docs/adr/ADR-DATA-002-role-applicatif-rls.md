---
id: ADR-DATA-002
status: accepted
scope:
  - docker-compose.yml
  - migrations/**
  - src/lib/db.ts
  - scripts/seed.mjs
  - tests/integration/**
---

# Rôle applicatif PostgreSQL dédié, soumis à la RLS

> Décision de traitement des risques du 2026-10-19. **Validée côté
> architecture le 2026-10-21** par le pilote 4a (rôle dédié et égalité
> d'entreprise dans les policies RH), **acceptée le 2026-10-22** par
> Erwen Beauvinon-Petitjean, statut `accepted` confirmé le 2026-10-26
> par le pilote 4a. **Implémentée en phase 8** (voir « Mise en œuvre »).
> Le provisionnement du secret de production (création, rotation) reste
> sous la responsabilité du pilote 2 (données).

## Decision

L'application ne se connecte plus à PostgreSQL avec le compte
superutilisateur :

- un **rôle applicatif dédié, non-superutilisateur**, soumis à
  `FORCE ROW LEVEL SECURITY`, est utilisé par l'application
  (`APP_DATABASE_URL`) ;
- le compte superutilisateur existant est réservé aux migrations et à
  l'administration (création des rôles et des policies) ;
- les policies RH sont complétées par l'égalité d'entreprise
  (`hr.company_id = u.company_id`, invariant I8), par une nouvelle
  migration ;
- les policies sont alignées sur les valideurs définis par
  ADR-ARCH-002 : N+1 du valideur, RH pour les employés sans manager,
  autres RH pour les notes d'un RH, toujours dans la même entreprise.
  Sans cet alignement, la RLS rendue effective bloquerait des valideurs
  légitimes.

Avant la migration `0003`, les policies laissaient un RH lire et
modifier les notes des managers racines **de toutes les entreprises** ;
seules les requêtes applicatives filtraient sur l'entreprise. Une route
qui aurait oublié ce filtre exposait les notes de la direction d'un
client (montants, justificatifs nominatifs) à un autre client, et lui
permettait de les trancher.

Sans rôle dédié, l'invariant I10 n'était prouvé qu'au niveau applicatif
(`peutConsulter`), et les tests d'intégration RLS ne démontraient rien :
un superutilisateur contourne toutes les policies.

## Mise en œuvre (phase 8)

- `migrations/1700000000003_role-applicatif-rls.sql` : rôle
  `expense_app` créé `NOLOGIN` et sans secret, privilèges minimaux
  (aucun `DELETE`, `UPDATE` restreint aux colonnes écrites par
  l'application), policies RH complétées par l'égalité d'entreprise ;
- `migrations/1700000000005_policies-valideurs.sql` : policies
  `expense_notes_valideurs_select` / `_update` alignées sur
  ADR-ARCH-002 ;
- `src/lib/db.ts` : le serveur se connecte via `APP_DATABASE_URL` ; le
  repli sur `DATABASE_URL` (compte d'administration) est signalé dans
  les logs et réservé aux scripts outillés ;
- `scripts/seed.mjs` : mot de passe de **développement uniquement**
  posé sur `expense_app` (`ALTER ROLE … LOGIN PASSWORD`) ;
- CI : étape `Integration` du job E2E, exécutée sous le rôle
  applicatif réel.

## Reasons

- Audit A-F03 : le rôle livré (`POSTGRES_USER: expense`, utilisé aussi
  par l'application) est superutilisateur ; la RLS documentée était
  inopérante en pratique.
- Les phases 4 à 7 reposent sur la RLS comme second rideau derrière la
  politique d'accès applicative ; ce rideau devait exister avant
  d'écrire les tests qui prétendent le prouver.

## Verification

```bash
RUN_INTEGRATION=1 npx vitest run tests/integration
```

Base migrée et seedée requise (`make up migrate seed`), avec
`APP_DATABASE_URL` pointant sur `expense_app`. Exécuté en CI (job E2E,
étape `Integration`).

- `\du` montre `expense_app` sans superuser ni `BYPASSRLS` ; une
  lecture croisée entre deux entreprises sous contexte RLS ne renvoie
  aucune ligne d'autrui.
- Les migrations s'appliquent avec le compte d'administration ;
  l'application démarre et passe le seed avec le seul rôle applicatif.
- Sous le rôle applicatif, un RH de l'entreprise B ne lit ni ne modifie
  aucune note d'un manager racine de l'entreprise A ; le N+1 et les RH
  désignés par ADR-ARCH-002 lisent et tranchent les notes qui leur
  reviennent (`tests/integration/rls-policies.test.ts`).

## Retirement

Revoir si l'hébergement impose un autre modèle (rôle par service,
pooler avec identité propagée) : le principe « l'application n'est
jamais superutilisateur » reste, seul le provisionnement change.
