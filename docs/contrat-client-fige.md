# Contrat client figé — aucun changement visible pour un usage légitime

> Statut : **figé** le 2026-10-19 · Base de référence : `main` @ `265924b`
> Portée : contraignant pour tous les tickets issus des audits, pour la
> refactorisation vers l'architecture proposée (branche `architecture`) et
> pour les évolutions automatisation / IA / CI-CD.
> Toute dérogation exige une décision explicite et consignée (voir §7).

## 1. Contrainte figée

> **Aucun changement pour un usage légitime et conforme : mêmes parcours,
> mêmes pages, mêmes URLs, mêmes méthodes, mêmes requêtes, mêmes réponses
> de succès. Seuls peuvent changer les refus d'accès illégitimes, le rejet
> des entrées invalides et la suppression des fuites d'information.**

« Zéro changement » au sens littéral est impossible : corriger l'IDOR sur
les justificatifs ou l'injection SQL change nécessairement ce qu'observe
un client illégitime ou mal formé. Ces changements sont des correctifs,
listés en §5 ; ils ne sont pas des dérogations.

## 2. Surface gelée — pages et parcours

Pages inchangées, dans leur contenu comme dans leur comportement :

- `/login`, `/signup` (formulaires → Server Actions `src/app/actions/auth.ts`)
- `/expenses` (employé : soumettre, historique, reçu, suggestion OCR)
- `/manager` (notes de l'équipe en attente, décisions)
- `/hr` (annuaire, rattachements, notes des managers racines)

Aucun écran, aucun libellé, aucun champ de formulaire ne change. Les noms
de champs actuels sont gelés : `amount`, `expenseDate`, `description`,
`receipt` (notes) ; `name`, `email`, `password` (inscription/connexion).

## 3. Surface gelée — les 11 appels API consommés par le client

Inventaire exhaustif des `fetch` du client web à `265924b`
(`src/app/expenses/page.tsx`, `src/components/PendingApprovalsPanel.tsx`,
`src/components/AdminConsole.tsx`). Aucun autre appel n'existe.

| # | Appel | Succès gelé |
|---|---|---|
| C01 | `GET /api/expense-notes` | `200`, tableau de notes (§4) |
| C02 | `POST /api/expense-notes` (multipart) | `201`, note créée (§4) |
| C03 | `POST /api/expense-notes/receipt-suggestion` (multipart `receipt`) | `200`, `{ amount?, expenseDate? }` ; `{}` est une réponse valide |
| C04 | `GET /api/expense-notes/{id}/receipt-url` | `200`, `{ url }` |
| C05 | `GET /api/manager/expense-notes` | `200`, tableau de notes |
| C06 | `GET /api/manager/expense-notes/{id}/receipt-url` | `200`, `{ url }` |
| C07 | `POST /api/manager/expense-notes/{id}/approve` · `/reject` | `200`, note mise à jour |
| C08 | `GET /api/hr/users` | `200`, tableau d'utilisateurs (§4) |
| C09 | `GET /api/hr/expense-notes` | `200`, tableau de notes |
| C10 | `GET /api/hr/expense-notes/{id}/receipt-url` | `200`, `{ url }` |
| C11 | `POST /api/hr/expense-notes/{id}/approve` · `/reject` ; `PUT /api/hr/users/{id}/manager` (`{ managerId }`) | `200`, note ou utilisateur mis à jour |

Server Actions gelées : `signup`, `login`, `logout` — mêmes entrées,
même retour `{ error?: string }`, mêmes redirections (`/expenses`,
`/login`).

Le client ne consomme que `response.ok` et, en erreur, le champ texte
`body.error`. Ces deux points font partie du contrat.

## 4. Formes de données gelées

Note de frais (sérialisation actuelle `toExpenseNote`, à conserver à
l'identique dans tout refactoring) :

```json
{
  "id": "uuid", "userId": "uuid", "amount": 12.5,
  "expenseDate": "YYYY-MM-DD", "description": "texte",
  "receiptKey": "receipts/1.png", "status": "pending | approved | rejected",
  "createdAt": "ISO 8601"
}
```

- `amount` reste un nombre JSON ; `expenseDate` reste une chaîne
  `YYYY-MM-DD` (jamais un objet date) ; `createdAt` reste ISO 8601.
- Utilisateur RH : `{ id, name, email, role, managerId }`.
- Justificatif : `{ url }` (URL pré-signée, durée actuelle 300 s).
- Suggestion OCR : `{ amount?, expenseDate? }`, champs optionnels,
  jamais d'erreur métier en cas de reçu illisible (réponse vide).
- Erreur : `{ "error": "message texte" }`. Les messages actuels des cas
  légitimes sont conservés, dont `409 { "error": "Already decided" }`
  pour une note déjà tranchée.

## 5. Changements autorisés (correctifs, pas des dérogations)

| Cas | Avant | Après autorisé |
|---|---|---|
| Justificatif hors équipe / hors entreprise (IDOR) | `200` + URL | `404` |
| Manager d'une autre entreprise via API directe | `200` | `409` |
| `sort` hors liste fermée | interpolé dans le SQL | `400` |
| Corps JSON invalide sur `PUT …/manager` | efface le rattachement | `400` |
| Erreur interne | `500` avec message technique et `stack` dans le JSON | `500` avec `{ "error": "Erreur interne" }`, détail en logs serveur uniquement |
| Entrées invalides (montant, date) | acceptées ou `500` | `400` avec message précis (`Montant invalide`, `Date invalide`, `Description invalide`, `Justificatif manquant`, `Type de fichier non autorisé pour le reçu`, `Fichier trop volumineux`) — le statut est gelé, les textes sont actés ici, affichés tels quels par le client |
| Fichier OCR hors gabarit (type ou > 10 Mio) | accepté, processus bloqué | `200` avec `{}` (suggestion vide, comme un reçu illisible) |
| Abus répétés (brute-force, débit) | aucun frein | `429` sur les routes HTTP (middleware `POST /api/auth/*`, phase 8) ; les Server Actions `login`/`signup` renvoient le même message dans leur état `{ error }` (HTTP 200, pas de statut 429 possible) — seuls les échecs sont comptés, par IP et par compte |

L'interface web ne déclenche aucun de ces cas en usage normal (elle
n'envoie notamment jamais de paramètre `sort`). Aucun ne requiert donc de
modification du client.

## 6. Interdits sans dérogation explicite

- Ajouter, retirer ou renommer un champ des formes du §4 — en particulier
  exposer `decidedBy`, `decidedAt` ou `motif` dans le JSON des notes.
- Changer un code de succès, une URL, une méthode, un nom de champ de
  formulaire ou de requête.
- Remplacer le tableau des listes par une enveloppe paginée
  (`{ data, total, … }`) ; toute pagination conserve le tableau par défaut.
- Rendre la suggestion OCR asynchrone côté client (file d'attente,
  polling, statut intermédiaire) : l'endpoint C03 reste synchrone en
  façade, quel que soit le traitement interne.
- Ajouter une étape visible au parcours (vérification d'email bloquante,
  écran de confirmation nouveau, champ obligatoire nouveau).
- Changer les textes affichés des pages ou les messages d'erreur des cas
  légitimes.

## 7. Preuve — tests golden obligatoires

Référence initiale capturée dans
`tests/contract/golden.reference.json` par
`scripts/capture-golden.mjs` (base re-seedée, serveur local :
`BASE=http://localhost:3100 node scripts/capture-golden.mjs`). Le cas
C04 du RH est volontairement en `skip` : le RH ne dépose aucune note.
`scripts/check-golden.mjs` compare une capture fraîche à la référence
(`make golden`, base re-seedée exigée) : tout écart hors normalisation
est un blocage.

1. **Capture de référence** sur `265924b` avec les comptes du seed
   (`hr@expense.io`, `manager@expense.io`, `demo@expense.io`) :
   pour chaque appel C01–C11 en succès, enregistrer statut et corps,
   en normalisant les valeurs volatiles (`id`, `receiptKey`, `url`,
   `createdAt` remplacés par des marqueurs de type). L'`expenseDate`
   des notes du seed (datées `CURRENT_DATE`) devient `<seedDate>`,
   seulement si elle reste une chaîne `YYYY-MM-DD` ; la date de la
   note soumise par la capture (C02) est comparée telle quelle.
2. **Rejeu après chaque migration** de cas d'usage ou correctif :
   le diff golden doit être vide hors normalisation. Tout écart est un
   blocage, sauf s'il correspond à un cas du §5, cité dans le ticket.
3. **Cas d'erreur légitimes** rejoués de même : `401` non authentifié,
   `409 Already decided`, `400` sur entrée invalide (montant, reçu
   manquant, rejet sans motif), retours `{ error }` des Server
   Actions. Les textes des `400` sont ceux du §5, actés depuis la
   revue phase/5 (plus de `Champs invalides` générique).
4. Chaque ticket déclare dans sa description : « Impact contrat client :
   aucun » ou la ligne du §5 qu'il active. Sans cette déclaration, le
   ticket n'est pas prêt à être implémenté.

## 8. Modifier ce contrat

Une dérogation se fait par une décision écrite (ADR ou amendement de ce
fichier dans le même changement), jamais par un écart constaté après
coup dans un diff golden. Le diff golden est l'alarme ; ce fichier est
la référence.

## 9. Dérogation acceptée — motif obligatoire au rejet (2026-10-22)

Source : ADR-DOMAIN-002 `accepted` (branche `architecture`,
2026-10-21), acceptée pour nous le 2026-10-22. Cette dérogation prime
sur le §6 (« corps des requêtes de décision inchangé ») pour le seul
cas du rejet :

- Les requêtes `POST /api/manager/expense-notes/{id}/reject` et
  `POST /api/hr/expense-notes/{id}/reject` (C07, C11) reçoivent un
  corps JSON `{ "reason": "texte" }`. Le champ s'appelle **`reason`**,
  par cohérence avec les clés JSON existantes de l'API (`managerId`,
  `expenseDate`).
- `reason` est **obligatoire et non vide** au rejet (après suppression
  des espaces de bord), 500 caractères maximum, texte brut. Un rejet
  sans motif est refusé en `400 DonnéesInvalides` et rien n'est écrit
  — nouveau comportement, assumé par la dérogation.
- L'approbation accepte le même champ à titre facultatif.
- Les **réponses** ne changent pas : mêmes statuts de succès, même
  forme de note, `decided_by`/`decided_at`/`decision_reason` jamais
  exposés (le §6 reste en vigueur pour les réponses).
- Le front (`PendingApprovalsPanel`, `AdminConsole`) fait saisir le
  motif avant tout rejet ; règle du domaine et front sont livrés dans
  la même phase, faute de quoi aucun rejet ne serait possible.
- Les tests golden de C07/C11 sont mis à jour dans la même phase :
  rejet nominal **avec** motif, plus un cas d'erreur nouveau
  « rejet sans motif → 400 ».

## 10. Dérogation acceptée — file RH complète (lecture A, 2026-10-26)

Source : amendement d'ADR-ARCH-002 du 2026-10-26 (pilote 4a). Cette
dérogation prime sur le §1 (« mêmes réponses de succès ») pour le seul
contenu de C09 :

- `GET /api/hr/expense-notes` (C09) liste toutes les notes en attente
  dont le RH est valideur : en plus des auteurs sans manager et des notes
  des autres RH, **les notes des équipes des managers racines**. La forme
  de la réponse (tableau de notes, §4) et le tri (création croissante)
  ne changent pas.
- Le pouvoir de décision ne change pas : ces notes étaient déjà
  tranchables par le RH via C11 ; l'interface les affiche désormais.
- Aucun texte de page ne change : le titre « Notes des managers racine
  en attente » est conservé (§6). Le modifier exigerait un nouvel
  amendement.
- Golden : `tests/contract/golden.reference.json` est **inchangé**. Dans
  le scénario de capture, le manager rejette la note de l'employé de
  démonstration (C07) avant que le RH ne liste ses notes (C09) : la file
  RH n'y contient que la note du manager racine, avant comme après.
- E2E : `tests/e2e/hr.spec.ts` est mis à jour dans la même PR (le RH voit
  et tranche la note d'un employé du manager racine).
