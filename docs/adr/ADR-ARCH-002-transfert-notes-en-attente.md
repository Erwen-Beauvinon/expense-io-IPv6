---
id: ADR-ARCH-002
status: accepted
scope:
  - src/app/api/manager/**
  - src/app/api/hr/**
  - src/domain/**
  - migrations/**
---

# Valideurs d'une note : calculés depuis l'organigramme courant

> Arbitrage du 2026-10-19 (point 2, architecture).
> **Accepté le 2026-10-21** par le pilote 4a (architecture), avec des
> compléments : collaborateur sans manager, droit permanent du N+1,
> message de conflit et durée des URL de justificatif.

## Decision

### 1. Transfert immédiat des notes en attente

Lorsqu'un collaborateur est rattaché à un nouveau manager
(`PUT /api/hr/users/{id}/manager`), ses notes encore `pending`
**basculent immédiatement** sous la responsabilité du nouveau manager :

- le nouveau manager les voit dans `ListerNotesÀTrancher`, peut les
  consulter (justificatif inclus) et les trancher ;
- l'ancien manager perd, dès le rattachement, la consultation et la
  décision sur ces notes ;
- les notes déjà décidées (`approved` / `rejected`) ne changent pas de
  statut et leur décision passée n'est pas réattribuée.

### 2. Valideurs calculés, jamais stockés

Aucun valideur n'est figé ni stocké sur la note. Les valideurs d'une
note `pending` sont toujours calculés depuis le rattachement **courant**
de son auteur (règle `valideursDe`), et l'accès suit la même règle
(`peutConsulter`, `peutTrancher`). Tous les valideurs ont le même droit :
**consulter (justificatif inclus) et trancher**, en permanence, sans
notion d'indisponibilité à déclarer.

| Situation de l'auteur de la note | Valideur direct | N+1 du valideur (même droit) |
|---|---|---|
| Rattaché à un manager M, lui-même rattaché à un manager M' | M | M' |
| Rattaché à un manager racine M (sans manager) | M | les RH de l'entreprise |
| Sans manager : manager racine, ou employé non rattaché | les RH de l'entreprise | les autres RH de l'entreprise |

Règles communes à toutes les lignes :

- tous les valideurs appartiennent à **la même entreprise** que l'auteur
  (I8, I10, I11) ;
- personne ne tranche sa propre note (I7) : un RH auteur d'une note est
  exclu de ses valideurs ;
- le rôle « N+1 » des RH entre eux est fonctionnel : ils n'ont pas de
  lien hiérarchique, mais tout RH de l'entreprise peut trancher une note
  routée vers les RH.

Les notes d'un collaborateur qui **perd son manager** passent donc aux RH
de l'entreprise, sans action supplémentaire : aucune note `pending` ne
reste sans valideur, sauf le cas limite décrit plus bas.

### 3. Décision concurrente : une seule gagne, réponse inchangée

Plusieurs valideurs pouvant désormais trancher la même note, I6 s'applique :
une seule décision est enregistrée (mise à jour conditionnelle sur
`status = 'pending'`), les autres reçoivent :

```http
409 Conflict
{ "error": "Already decided" }
```

Le corps est **identique à celui d'aujourd'hui** (contrat client figé,
`docs/contrat-client-fige.md`). L'autorisation est vérifiée **avant**
l'état de la note : un acteur qui n'est pas valideur reçoit un refus
(403 ou 404), jamais un 409, pour ne pas révéler l'existence ni l'état
de la note.

### 4. Justificatifs : URL pré-signées de 5 minutes conservées

L'accès au justificatif reste une URL S3 pré-signée, valable **300 s**,
émise seulement si `peutConsulter` l'autorise. La passerelle applicative
(fichier servi par l'application à chaque téléchargement) a été étudiée
et écartée. La limite qui en découle est acceptée : une URL émise avant
une perte de droits (transfert, changement de rôle) reste utilisable
jusqu'à son expiration, par toute personne qui détient le lien.

## Reasons

- Aucune donnée supplémentaire à porter : pas de colonne
  `valideur désigné`, pas d'état intermédiaire à migrer ni à
  synchroniser lors d'un rattachement.
- La responsabilité suit l'organigramme réel : un manager parti ou
  réaffecté ne conserve pas de pouvoir de décision sur son ancienne
  équipe.
- Le droit permanent du N+1 et le renvoi aux RH suppriment les blocages :
  un valideur absent ou un collaborateur sans manager ne gèle plus de
  notes.
- Règle unique et prévisible pour I7–I11 : à tout instant, les valideurs
  et les lecteurs légitimes d'une note `pending` se déduisent du seul
  annuaire courant.
- Réponse 409 inchangée : aucune modification du front ni des E2E.
- URL pré-signées conservées : pas de charge supplémentaire sur le
  serveur applicatif, pas de contrainte de taille de réponse chez
  l'hébergeur.

## Conséquences et cas limites

- **Changement de comportement visible** : les notes des employés sans
  manager, aujourd'hui vues par personne, apparaissent dans la liste RH
  (`GET /api/hr/expense-notes`), et les N+1 voient les notes de leurs
  équipes indirectes dans leur liste manager. Depuis l'amendement du
  2026-10-26 (lecture A, ci-dessous), la liste RH contient aussi les
  équipes des managers racines. La forme des réponses ne
  change pas, leur contenu si. Les E2E qui comptent les notes listées
  sont à revoir avec le pilote 3.
- **Décision en vol** : si l'ancien manager tranche au moment du
  rattachement, son autorisation est réévaluée par `peutTrancher` au
  moment de l'écriture ; après rattachement, il n'est plus valideur. Si
  deux valideurs légitimes tranchent en même temps, I6 garde la première
  décision.
- **Policies RLS** : les policies actuelles n'autorisent que le manager
  direct et les RH pour les managers racines. Une nouvelle migration
  doit les aligner sur le tableau ci-dessus (N+1, RH pour les employés
  non rattachés, même entreprise), sinon la RLS rendue effective par
  ADR-DATA-002 bloquera ces valideurs légitimes.
- **Cas limite, RH seul** : un RH unique dans son entreprise, auteur
  d'une note, n'a aucun valideur (I7). Non traité ici ; arbitrage séparé
  si ce cas se présente.
- **Notes déjà décidées** : leur consultation suit la même règle
  (organigramme courant). Un ancien manager ne voit donc plus les notes
  qu'il a lui-même tranchées ; l'auteur de la décision reste tracé par
  ADR-DOMAIN-002.

## Alternatives écartées

- **Valideur figé à la soumission** : l'ancien manager garderait la
  main jusqu'à décision. Écarté : stocke un état supplémentaire,
  conserve un pouvoir à un manager sorti de l'équipe.
- **Valideur stocké et resynchronisé à chaque rattachement** : écarté,
  donnée en double à maintenir cohérente sans bénéfice métier.
- **N+1 limité à la consultation, ou activé seulement en cas
  d'indisponibilité déclarée** : écarté, la consultation seule ne
  débloque rien et l'indisponibilité n'existe pas dans le produit.
- **Message 409 orienté utilisateur ou code d'erreur stable** : écarté
  pour ne pas modifier le contrat client figé.
- **Justificatif servi par l'application** : révocation immédiate et
  traçabilité des téléchargements, mais charge serveur, coût réseau
  doublé et limites de l'hébergement ; écarté.

## Verification

- Test d'intégration : employé rattaché à M1 dépose une note ;
  rattachement à M2 ; M2 la voit, la consulte et la tranche ; M1
  reçoit un refus sur lecture, reçu et décision (deux entreprises
  présentes dans le jeu de test, politique I9/I10).
- Test d'intégration : le N+1 de M voit, consulte et tranche une note
  d'un rattaché de M ; un manager d'une autre branche ou d'une autre
  entreprise est refusé.
- Test d'intégration : employé sans manager → sa note apparaît chez les
  RH de son entreprise, pas chez ceux d'une autre entreprise.
- Test d'intégration : note d'un RH → tranchable par un autre RH, jamais
  par son auteur (I7).
- Test d'intégration : deux décisions simultanées → une 200, une
  `409 { "error": "Already decided" }` ; un non-valideur reçoit un refus,
  jamais un 409.
- Test d'intégration : note déjà décidée avant rattachement ; son
  statut reste inchangé après transfert.
- Contrôle de non-régression contrat client (tests golden C05–C07).

## Amendement du 2026-10-26 — lecture A : la file RH liste tout ce que le RH peut trancher

Décision du pilote 4a (architecture). Jusqu'ici, la file RH
(`GET /api/hr/expense-notes`, C09) ne listait que les auteurs sans manager
et les notes de RH : un RH valideur des équipes des managers racines
(ligne 2 du tableau) ne pouvait les trancher que par l'API. Si un manager
racine devenait indisponible, les notes de son équipe restaient bloquées
en pratique.

Désormais, **la file de chaque décideur — manager ou RH — est exactement
l'ensemble des notes en attente dont il est valideur** (`figureDansLaFile`,
même prédicat SQL que la décision). Le pouvoir de décision ne change pas :
seul l'affichage le rejoint.

- **Visible** : le contenu de C09 change (forme inchangée). Dérogation
  consignée au contrat client, §10.
- **Non visible** : les lignes 1 et 3 du tableau sont inchangées. Une
  équipe dont le manager a un N+1 manager n'apparaît pas chez les RH.
- **Course** : le manager racine et les RH voient la même note ; le
  premier qui tranche l'emporte (I6), l'autre reçoit `409 Already
  decided`. Aucun signal n'informe le manager qu'un RH a tranché à sa
  place (la notification ne vise que l'auteur).
- **Titre de la section** de la page `/hr` : « Notes des managers racine
  en attente » est conservé (§6 du contrat : aucun texte modifié sans
  dérogation). Il devient imprécis ; son changement est une décision
  ouverte.
- **Vérification** : `tests/support/table-valideurs.ts` (files
  attendues), `tests/integration/concordance-valideurs.test.ts`,
  `tests/e2e/hr.spec.ts` (« tranche les notes des managers racine et de
  leurs équipes »).

## Retirement

Revoir si un workflow de passation explicite est introduit (délégation
temporaire, suppléance pendant congés), si le rôle des RH entre eux doit
devenir hiérarchique, ou si la fenêtre de 5 minutes des URL de
justificatif devient inacceptable (incident, exigence d'audit des
téléchargements) : la passerelle applicative serait alors à reconsidérer.
