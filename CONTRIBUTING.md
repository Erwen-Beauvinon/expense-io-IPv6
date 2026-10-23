# Contribuer à Expense.io

Humains et agents suivent le même workflow. Partir du [backlog](docs/backlog.md)
ou décrire un écart concret et la manière de vérifier sa correction.

## Toujours sur le fork

Tout le travail se fait sur le fork `Erwen-Beauvinon/expense-io-IPv6` :
branches, pushs et PR (`gh pr create --repo Erwen-Beauvinon/expense-io-IPv6`).
Rien n'est poussé ni proposé sur l'amont `NathanPrats/expense-io`. Le hook
`pre-push` (activé par `make bootstrap`) refuse tout autre destination.

## Avant de modifier le code

1. Lire [AGENTS.md](AGENTS.md) : commandes, contraintes, preuves attendues.
2. Lire [l'architecture](docs/architecture.md) et l'ADR concerné avant de
   toucher à une contrainte.
3. Un changement = un problème. Ne pas mélanger refonte et fonctionnalité.

## Vérifier

```bash
make bootstrap     # une fois : npm ci, .env, hooks git
make verify-fast   # pendant l'édition
make verify-all    # avant de conclure
```

Noter les commandes et leurs codes de sortie, les fichiers modifiés et ce qui
n'a pas été vérifié (les routes API et la RLS nécessitent `make up migrate`).
Ne jamais affaiblir un check pour masquer un échec ; si la règle elle-même
change, mettre à jour l'ADR et son drill.

## Ajouter une règle vérifiable

1. Écrire un ADR dans `docs/adr/` (frontmatter `id`, `status`, `scope` ;
   sections `## Verification` et `## Retirement`) — `make validate-adrs`.
2. Faire appliquer la règle par un outil existant (ESLint, Vitest, SQL).
3. Ajouter un drill `drill-<nom>` dans le Makefile qui plante une violation
   dans une copie jetable et exige le rejet pour la bonne raison, puis un step
   identique dans `.github/workflows/ci.yml` (sinon `make drills` échoue).

## Pull requests

Le [template de PR](.github/PULL_REQUEST_TEMPLATE.md) impose une section
Vérification. Les chemins listés dans AGENTS.md (« Zones à valider ») demandent
une revue. Signaler les vulnérabilités selon [SECURITY.md](SECURITY.md).
