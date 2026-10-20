---
id: ADR-DATA-002
status: draft
scope:
  - docker-compose.yml
  - migrations/**
  - src/lib/db.ts
---

# Rôle applicatif PostgreSQL dédié, soumis à la RLS

> Décision de traitement des risques du 2026-10-19. Statut **draft** :
> le modèle de rôles SQL relève du pilote 2 (données) ; cet ADR
> consigne la stratégie retenue côté architecture et doit être validé
> avec lui avant la phase 4 du plan de migration.

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
  par une nouvelle migration.

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

## Retirement

Revoir si l'hébergement impose un autre modèle (rôle par service,
pooler avec identité propagée) : le principe « l'application n'est
jamais superutilisateur » reste, seul le provisionnement change.
