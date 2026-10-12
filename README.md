# Expense.io

Application de gestion de notes de frais.

## Prérequis

- Node.js 24+
- Docker (Postgres + LocalStack en local)

## Démarrage

```bash
make dev
```

Ceci installe les dépendances, démarre Postgres et LocalStack, applique les
migrations, crée le bucket de stockage, peuple des comptes de démonstration
(voir "Comptes" plus bas), puis lance le serveur de développement sur
http://localhost:3000.

Sans `make`, l'équivalent manuel :

```bash
npm install
cp .env.example .env
docker compose up -d
npm run migrate:up
npm run ensure-bucket
npm run seed
npm run dev
```

## Comptes

`make dev` (ou `npm run seed`) crée trois comptes de la même entreprise,
avec chacun une note de frais en attente pour les deux derniers —
relançable sans dupliquer quoi que ce soit :

| Rôle | Email | Mot de passe |
|---|---|---|
| RH | `hr@expense.io` | `hr1234` |
| Manager (racine, sans manager assigné) | `manager@expense.io` | `manager1234` |
| Employé (rattaché au manager ci-dessus) | `demo@expense.io` | `demo1234` |

Tu peux aussi créer d'autres comptes via `/signup` : le premier compte créé
sur un domaine email donné fonde une nouvelle entreprise et en devient RH ;
les comptes suivants sur le même domaine la rejoignent comme employés. Le
rôle `manager` n'est en revanche jamais assignable depuis l'interface —
seulement via le script de seed ou directement en base.

## Variables d'environnement

Voir `.env.example`.

## Autres commandes

```bash
make build   # build de production
make start   # build puis démarre en production
make lint
make typecheck
make down    # arrête Postgres/LocalStack
make clean   # arrête et supprime les données locales
```

## Vérification et contribution (humains et agents IA)

> On travaille toujours sur le fork `Erwen-Beauvinon/expense-io-IPv6`, jamais sur
> l'amont `NathanPrats/expense-io` : le hook `pre-push` refuse toute autre destination.

```bash
make bootstrap     # npm ci (lockfile), .env, hooks git versionnés
make verify-fast   # lint + frontières de couches + types
make verify        # + tests unitaires (Vitest) + format des ADR — sans Docker
make verify-all    # + drills : chaque garde doit rejeter une violation plantée
```

- [AGENTS.md](AGENTS.md) : commandes, contraintes non évidentes, preuves de fin de tâche
  (`CLAUDE.md` et `.cursor/rules/` y renvoient).
- [docs/architecture.md](docs/architecture.md) : carte du code et couverture de la vérification.
- [docs/adr/](docs/adr/) : décisions vérifiables ; [docs/backlog.md](docs/backlog.md) : écarts connus.
- [CONTRIBUTING.md](CONTRIBUTING.md), [SECURITY.md](SECURITY.md).
