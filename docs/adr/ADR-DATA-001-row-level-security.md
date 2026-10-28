---
id: ADR-DATA-001
status: accepted
scope:
  - migrations/**
  - src/lib/db.ts
  - src/app/api/**
---

# Isolation des notes de frais par Row Level Security PostgreSQL

## Decision

L'accès à `expense_notes` est filtré par PostgreSQL (RLS, `FORCE ROW LEVEL
SECURITY`) selon `app.current_user_id`. Ce paramètre est posé pour la durée
d'une transaction par `withUserScope(userId, fn)` (`src/lib/db.ts`). Les
policies de la migration initiale autorisent :

- le propriétaire à lire et créer ses notes ;
- le manager direct à lire et mettre à jour les notes de ses rattachés ;
- un `hr_admin` à lire et mettre à jour les notes des managers racines
  (`role = 'manager' AND manager_id IS NULL`).

Les tables `users` et `companies` n'ont **pas** de RLS : leur isolation par
entreprise repose sur les clauses `WHERE` écrites dans chaque route.

## Reasons

- Une isolation appliquée par la base protège aussi les requêtes que le code
  applicatif oublierait de filtrer.
- Le contexte limité à la transaction (`set_config(…, true)`) évite qu'une
  connexion réutilisée du pool garde l'identité d'un autre utilisateur.

## Verification

Lister les accès qui ne passent pas par le contexte RLS et vérifier, pour
chacun, que l'isolation est assurée autrement :

```
rg -n "getPool\(\)" src/app src/lib
```

Inspecter les policies sur une base démarrée (`make up migrate`) :

```
docker compose exec postgres psql -U expense -d expense_io -c '\d+ expense_notes'
```

Aucun test automatisé ne prouve encore ces policies : il faut un PostgreSQL
de test (voir `docs/backlog.md`). Cette contrainte est donc documentée, pas
démontrée.

## Retirement

Revoir si l'autorisation est déplacée dans la couche applicative (ex.
politiques ABAC centralisées) ou si la base cesse d'être PostgreSQL.
