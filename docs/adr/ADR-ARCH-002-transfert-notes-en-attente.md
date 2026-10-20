---
id: ADR-ARCH-002
status: draft
scope:
  - src/app/api/manager/**
  - src/app/api/hr/users/**
  - src/domain/**
---

# Changement de manager : les notes en attente suivent le rattachement courant

> Arbitrage du 2026-10-19 (point 2, architecture). Statut **draft** :
> seule une acceptation explicite du présent texte le passera en
> `accepted`. Aucune implémentation n'est autorisée par ce seul document.

## Decision

Lorsqu'un collaborateur est rattaché à un nouveau manager
(`PUT /api/hr/users/{id}/manager`), ses notes encore `pending`
**basculent immédiatement** sous la responsabilité du nouveau manager :

- le nouveau manager les voit dans `ListerNotesÀTrancher`, peut les
  consulter (justificatif inclus) et les trancher ;
- l'ancien manager perd, dès le rattachement, la consultation et la
  décision sur ces notes ;
- les notes déjà décidées (`approved` / `rejected`) ne changent pas :
  leur valideur reste déterminé par les invariants I7/I8 au moment de
  la consultation, et leur décision passée n'est pas réattribuée.

Aucun valideur n'est figé ni stocké sur la note. Le valideur d'une note
en attente est toujours calculé depuis le rattachement **courant** de
son auteur (règle `valideurDe`, invariants I7 et I8), et l'accès suit la
même règle (I9, `peutConsulter`).

C'est le comportement actuel du code (listes filtrées par
`u.manager_id = acteur`) ; cet ADR le transforme en règle assumée et
testée, au lieu d'un effet de bord des requêtes SQL.

## Reasons

- Aucune donnée supplémentaire à porter : pas de colonne
  `valideur désigné`, pas d'état intermédiaire à migrer.
- La responsabilité suit l'organigramme réel : un manager parti ou
  réaffecté ne conserve pas de pouvoir de décision sur son ancienne
  équipe.
- Règle unique et prévisible pour I7–I10 : à tout instant, le valideur
  et les lecteurs légitimes d'une note `pending` se déduisent du seul
  annuaire courant.

## Conséquences et cas limites

- **Décision en vol** : si l'ancien manager tranche au moment du
  rattachement, I6 tranche — une seule décision gagne (mise à jour
  conditionnelle sur `status = 'pending'`), l'autre reçoit 409.
  L'autorisation du perdant est réévaluée par `peutTrancher` au moment
  de l'écriture ; après rattachement, il n'est plus valideur.
- **Justificatifs** : l'accès au reçu suit `peutConsulter` (I9/I10) ;
  l'ancien manager perd aussi l'accès aux reçus des notes `pending`
  transférées. Les URL pré-signées déjà émises restent valables
  jusqu'à leur expiration (300 s aujourd'hui) — limite acceptée,
  inhérente aux URL signées.
- **Contrat client** : aucun changement visible en usage légitime
  (contrat figé, `docs/contrat-client-fige.md`) ; seuls les accès de
  l'ancien manager, devenus illégitimes, sont refusés.

## Alternatives écartées

- **Valideur figé à la soumission** : l'ancien manager garderait la
  main jusqu'à décision. Écarté : stocke un état supplémentaire,
  conserve un pouvoir à un manager sorti de l'équipe, et contredit le
  comportement actuel sans bénéfice métier établi.
- **Figé limité aux notes « en cours de traitement »** : notion sans
  définition dans le code actuel (aucun état « en cours » distinct de
  `pending`) ; aurait exigé un nouvel état ou un verrou métier.

## Verification

- Test d'intégration : employé rattaché à M1 dépose une note ;
  rattachement à M2 ; M2 la voit, la consulte et la tranche ; M1
  reçoit un refus sur lecture, reçu et décision (deux entreprises
  présentes dans le jeu de test, politique I9/I10).
- Test d'intégration : note déjà décidée avant rattachement ; son
  statut et son accès restent conformes à I7/I8 après transfert.
- Contrôle de non-régression contrat client (tests golden C05–C07).

## Question restant ouverte

Aucune pour cette décision. Le devenir des notes `pending` lors de la
**suppression ou désactivation d'un compte manager** n'est pas couvert
ici (aucun parcours de suppression n'existe aujourd'hui) ; il fera
l'objet d'un arbitrage séparé si ce parcours est créé.

## Retirement

Revoir si un workflow de passation explicite est introduit (délégation
temporaire, suppléance pendant congés) : la règle « valideur =
rattachement courant » devrait alors céder la place à une délégation
datée et révocable, et cet ADR serait remplacé.
