---
id: ADR-DATA-002
status: accepted
scope:
  - docker-compose.yml
  - migrations/**
  - src/lib/db.ts
---

# Rôle applicatif PostgreSQL dédié, soumis à la RLS

> Décision de traitement des risques du 2026-10-19. **Validée côté
> architecture le 2026-10-21** par le pilote 4a (rôle dédié et égalité
> d'entreprise dans les policies RH), puis **acceptée le 2026-10-22**
> par Erwen Beauvinon-Petitjean. Le provisionnement concret du rôle
> (création, secrets, rotation) reste coordonné avec le pilote 2
> (données) avant la phase 4 du plan de migration.

## Decision

Avant la phase 4 du plan de migration (décisions), l'application ne se
connecte plus à PostgreSQL avec le compte superutilisateur :

- un **rôle applicatif dédié, non-superutilisateur**, soumis à
  `FORCE ROW LEVEL SECURITY`, est utilisé par l'application
  (`DATABASE_URL` applicative) ;
- le compte superutilisateur existant est réservé aux migrations et à
  l'administration (création des rôles et des policies) ;
- les policies RH sont complétées par l'égalité d'entreprise
  (`hr.company_id = u.company_id`, invariant I8) dans la même étape,
  par une nouvelle migration ;
- la même migration aligne les policies sur les valideurs définis par
  ADR-ARCH-002 : N+1 du valideur, RH pour les employés sans manager,
  autres RH pour les notes d'un RH, toujours dans la même entreprise.
  Sans cet alignement, la RLS rendue effective bloquerait des valideurs
  légitimes.

Les policies actuelles laissent un RH lire et modifier les notes des
managers racines **de toutes les entreprises** ; seules les requêtes
applicatives filtrent aujourd'hui sur l'entreprise. Une route qui
oublierait ce filtre exposerait les notes de la direction d'un client
(montants, justificatifs nominatifs) à un autre client, et lui
permettrait de les trancher.

Sans cette étape, l'invariant I10 n'est prouvé qu'au niveau applicatif
(`peutConsulter`), et les tests d'intégration RLS ne démontrent rien :
un superutilisateur contourne toutes les policies.

## Reasons

- Audit A-F03 : le rôle livré (`POSTGRES_USER: expense`, utilisé aussi
  par l'application) est superutilisateur ; la RLS documentée est
  inopérante en pratique.
- Les phases 4 à 7 du plan reposent sur la RLS comme second rideau
  derrière la politique d'accès applicative ; ce rideau doit exister
  avant d'écrire les tests qui prétendent le prouver.

## Verification (à la charge de l'étape, avec le pilote 2)

- Connexion avec le rôle applicatif : `\du` montre un rôle sans
  superuser ni `BYPASSRLS` ; une lecture croisée entre deux
  entreprises sous contexte RLS ne renvoie aucune ligne d'autrui.
- Les migrations continuent de s'appliquer avec le compte
  d'administration ; l'application démarre et passe le seed avec le
  seul rôle applicatif.
- Tests d'intégration I8/I10 exécutés sous le rôle applicatif réel.
- Sous le rôle applicatif, un RH de l'entreprise B ne lit ni ne modifie
  aucune note d'un manager racine de l'entreprise A ; le N+1 et les RH
  désignés par ADR-ARCH-002 lisent et tranchent les notes qui leur
  reviennent.

## Retirement

Revoir si l'hébergement impose un autre modèle (rôle par service,
pooler avec identité propagée) : le principe « l'application n'est
jamais superutilisateur » reste, seul le provisionnement change.
