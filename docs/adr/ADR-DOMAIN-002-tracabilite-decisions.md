---
id: ADR-DOMAIN-002
status: accepted
scope:
  - src/domain/ExpenseNote.ts
  - migrations/**
  - src/app/api/manager/**
  - src/app/api/hr/**
  - src/components/**
---

# Traçabilité des décisions : auteur et date toujours, motif obligatoire au rejet

> Arbitrage du 2026-10-19 (point 2, architecture). **Accepté le
> 2026-10-21** par le pilote 4a (architecture), avec une modification :
> le motif est **obligatoire en cas de rejet**, facultatif pour une
> approbation.

## Decision

### 1. Données enregistrées

Toute décision sur une note (`approved` ou `rejected`) enregistre, au
moment où elle est prise et dans la même écriture atomique que le
changement de statut (I5/I6) :

- `decided_by` : l'acteur authentifié qui a tranché (jamais une valeur
  fournie par le client) ;
- `decided_at` : l'horodatage serveur de la décision ;
- `decision_reason` : le motif.
  - **Rejet : obligatoire.** Texte non vide une fois les espaces de bord
    retirés, 500 caractères maximum. Sinon, le cas d'usage refuse la
    décision (`DonnéesInvalides`, 400) et rien n'est écrit.
  - **Approbation : facultatif**, mêmes contraintes de longueur s'il est
    fourni.
  - Texte brut, jamais interprété comme du HTML.

Ces trois données vivent sur la note (colonnes), pas dans une table
d'historique. Une note `pending` les porte à `NULL`.

### 2. Décision perdante : ignorée

Quand deux décisions concurrentes portent sur la même note, seule la
première est enregistrée (I6). La seconde, dite **perdante**, reçoit
`409 { "error": "Already decided" }` (ADR-ARCH-002) et **n'écrit rien** :
ni statut, ni auteur, ni motif. Elle n'est pas non plus journalisée.

### 3. Données internes

Les trois données ne sont **pas exposées** dans le JSON renvoyé au client
(contrat figé, `docs/contrat-client-fige.md` §6), ni affichées dans les
pages actuelles. Leur lecture suit `peutConsulter` (I9) : auteur de la
note et valideurs légitimes de la même entreprise (ADR-ARCH-002).

### 4. Colonnes plutôt que table d'historique

I5 (états `approved` et `rejected` définitifs) et I6 (une seule décision
par note) garantissent qu'une note reçoit au plus une décision dans sa
vie. **Un rejet est définitif** : pour obtenir une nouvelle validation,
l'employé crée une nouvelle note. Une table d'historique ne contiendrait
donc qu'une ligne utile par note ; des colonnes suffisent.

## Reasons

- Répond au constat des propositions et des audits : aujourd'hui, ni
  auteur, ni date, ni motif de décision ne sont conservés ; aucune
  reconstitution a posteriori n'est possible.
- Motif obligatoire au rejet : l'employé comprend pourquoi sa note est
  refusée et peut en soumettre une nouvelle, corrigée ; le rejet est
  justifié et défendable en cas de contestation. Une approbation n'a pas
  besoin d'explication.
- Décision perdante ignorée : elle n'a produit aucun effet métier ; la
  conserver n'apporterait rien à l'audit des décisions.
- Colonnes plutôt qu'historique : I5 et I6 limitent chaque note à une
  seule décision.

## Conséquences et cas limites

- **Dérogation au contrat client figé** : aujourd'hui, le front envoie
  les requêtes de rejet **sans corps**. Avec cette décision, elles
  seraient refusées (400). La requête de rejet (`POST …/reject`, manager
  et RH) reçoit donc un champ de motif dans son corps ; son nom est à
  fixer dans `docs/contrat-client-fige.md`. Le corps des réponses ne
  change pas.
- **Front** : `PendingApprovalsPanel` et `AdminConsole` doivent faire
  saisir le motif avant tout rejet. La règle du domaine et le front
  doivent être livrés ensemble, sinon plus aucun rejet n'est possible.
- **E2E** : les parcours de rejet du pilote 3 sont à mettre à jour.
- **Migration** : nouvelle migration uniquement (jamais de modification
  d'une migration appliquée). Notes déjà décidées avant la migration :
  `decided_by`, `decided_at` et `decision_reason` restent `NULL` et
  signifient « décision antérieure à la traçabilité ». Le motif
  obligatoire ne s'applique qu'aux rejets postérieurs ; aucune valeur
  n'est inventée a posteriori.
- **Atomicité** : `decided_by`, `decided_at`, `decision_reason` et le
  statut sont écrits par la même mise à jour conditionnelle que I6.

## Alternatives écartées

- **Motif facultatif au rejet** (proposition initiale) : écarté le
  2026-10-21 ; un rejet sans explication laisse l'employé sans moyen de
  corriger sa demande.
- **Motif obligatoire pour toute décision** : écarté, friction inutile
  sur les approbations.
- **Journaliser les décisions perdantes** : écarté, aucun effet métier.
- **Table d'historique complète des décisions** : écartée tant qu'I5 et
  I6 limitent chaque note à une seule décision.

## Verification

- Test d'intégration : décision nominale → `decided_by` = acteur,
  `decided_at` renseigné, statut cohérent, en une seule écriture.
- Test d'intégration : rejet sans motif, ou avec un motif vide après
  suppression des espaces → 400, statut toujours `pending`, rien n'est
  écrit.
- Test d'intégration : rejet avec motif → motif conservé ; approbation
  avec ou sans motif acceptée ; motif de plus de 500 caractères → 400.
- Test d'intégration : décision concurrente perdante → 409, aucune trace
  écrite, aucune ligne de log métier.
- Test de contrat : les réponses JSON C01–C11 ne contiennent aucun des
  trois nouveaux champs (tests golden du contrat figé).
- Contrôle base : notes décidées avant migration lisibles avec champs
  `NULL`, aucune erreur de sérialisation.

## Questions restant ouvertes

1. Nom du champ de motif dans le corps de la requête de rejet : à fixer
   dans la dérogation au contrat client.
2. Qui peut **afficher** la traçabilité demain (RH seule, auteur de la
   note, valideur) : hors périmètre tant qu'aucun écran ne la montre ;
   la règle de lecture I9 ci-dessus s'applique en attendant.
3. Durée de conservation : suit celle de la note ; aucune purge
   spécifique n'est décidée ici.

## Retirement

Revoir si une nouvelle soumission d'une note rejetée ou une validation en
plusieurs niveaux (par exemple clôture par la finance) est introduite :
I5/I6 ne garantiraient plus une seule décision par note, et une table
d'historique des décisions deviendrait nécessaire. Revoir aussi si une
piste d'audit complète (tentatives incluses) est exigée, ou si la
traçabilité doit être exposée au client, ce qui exige une nouvelle
dérogation au contrat client figé.
