---
id: ADR-DOMAIN-002
status: draft
scope:
  - src/domain/ExpenseNote.ts
  - migrations/**
  - src/app/api/manager/**
  - src/app/api/hr/**
---

# Traçabilité des décisions : auteur et date toujours, motif facultatif

> Arbitrage du 2026-10-19 (point 2, architecture). Statut **draft** :
> seule une acceptation explicite du présent texte le passera en
> `accepted`. Aucune implémentation n'est autorisée par ce seul document.

## Decision

Toute décision sur une note (`approved` ou `rejected`) enregistre, au
moment où elle est prise et dans la même écriture atomique que le
changement de statut (I5/I6) :

- `decided_by` : l'acteur authentifié qui a tranché (jamais une valeur
  fournie par le client) ;
- `decided_at` : l'horodatage serveur de la décision ;
- `decision_reason` : le motif, **toujours facultatif** — pour un
  rejet comme pour une approbation. Un rejet sans motif reste valide.

Ces trois données vivent sur la note (colonnes), pas dans une table
d'historique : seule la décision finale est conservée, puisqu'une note
n'est tranchée qu'une fois (I6). Une note `pending` les porte à `NULL`.

Elles sont **internes** : ni exposées dans le JSON renvoyé au client
(contrat figé, `docs/contrat-client-fige.md` §6), ni affichées dans les
pages actuelles. Leur lecture suit `peutConsulter` (I9) : auteur de la
note et valideur légitime de la même entreprise.

## Reasons

- Répond au constat des propositions et des audits : aujourd'hui, ni
  auteur, ni date, ni motif de décision ne sont conservés ; aucune
  reconstitution a posteriori n'est possible.
- Motif facultatif : ne pas créer de friction qui pousserait les
  valideurs à saisir un texte vide de sens ; l'audit garde l'essentiel
  (qui, quand) dans tous les cas.
- Colonnes plutôt qu'historique : I6 garantit une seule décision par
  note ; une table d'événements ne contiendrait qu'une ligne utile par
  note.

## Conséquences et cas limites

- **Migration** : nouvelle migration uniquement (jamais de modification
  d'une migration appliquée) ; notes déjà décidées avant la migration :
  `decided_by` / `decided_at` restent `NULL` et signifient « décision
  antérieure à la traçabilité », sans valeur inventée a posteriori.
- **Atomicité** : `decided_by`, `decided_at` et le statut sont écrits
  par la même mise à jour conditionnelle que I6 ; une décision perdante
  (409) n'écrit rien, pas même un motif.
- **Motif fourni** : texte libre, tronqué aux espaces de bord ;
  longueur maximale et échappement à fixer au ticket d'implémentation
  (point ouvert ci-dessous). Un motif fourni avec une approbation est
  conservé tel quel.
- **Contrat client** : aucun champ ajouté aux réponses C01–C11 ; le
  corps des requêtes de décision reste vide côté client actuel. Le
  motif, s'il est un jour saisi, exigera une dérogation au contrat
  figé (nouveau champ de requête) et une décision séparée.

## Alternatives écartées

- **Motif obligatoire au rejet** : écarté par l'arbitrage du
  2026-10-19 au profit du motif facultatif (friction moindre).
- **Table d'historique complète des décisions** : écartée ; surdimensionnée
  tant qu'I6 limite chaque note à une seule décision. À reconsidérer
  si des tentatives de décision doivent être journalisées pour
  l'audit de sécurité (elles relèveraient alors des logs applicatifs,
  pas du domaine).

## Verification

- Test d'intégration : décision nominale → `decided_by` = acteur,
  `decided_at` renseigné, statut cohérent, en une seule écriture.
- Test d'intégration : rejet sans motif accepté ; rejet avec motif
  conservé ; décision concurrente perdante (I6) : aucune trace écrite.
- Test de contrat : les réponses JSON C01–C11 ne contiennent aucun des
  trois nouveaux champs (tests golden du contrat figé).
- Contrôle base : notes décidées avant migration lisibles avec champs
  `NULL`, aucune erreur de sérialisation.

## Questions restant ouvertes

1. ~~Longueur maximale du motif~~ — **tranché le 2026-10-19** :
   500 caractères maximum, texte brut jamais interprété comme du
   HTML ; au-delà, rejet en `DonneesInvalides` par le cas d'usage.
2. Qui peut **afficher** la traçabilité demain (RH seule, auteur de la
   note, valideur) : hors périmètre tant qu'aucun écran ne la montre ;
   la règle de lecture I9 ci-dessus s'applique en attendant.
3. Durée de conservation : suit celle de la note ; aucune purge
   spécifique n'est décidée ici.

## Retirement

Revoir si le motif devient obligatoire pour certains motifs de rejet
réglementés, si une piste d'audit complète (tentatives incluses) est
exigée, ou si la traçabilité doit être exposée au client — ce dernier
cas exige en outre une dérogation au contrat client figé.
