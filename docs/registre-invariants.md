# Registre des invariants I1–I15 — Expense.io

> Statut : **document de travail de la migration** (revues des PR
> phase/1–8, TomVendee). Il évolue avec les phases : chaque écart
> constaté en revue est tranché ici avant d'être codé.
> Base : `main` @ `265924b`, propositions de la branche `architecture`,
> audits confrontés au code (verdict positif avec réserves), ADR de la
> branche `Ai-ready-ness`.
> Destination finale : annexe de `docs/propositions-architecture.md`
> (branche `architecture`).
> **Numérotation I1–I15 adoptée le 2026-10-26** par le pilote 4a
> (architecture), responsable du registre : les attributions « inférées »
> ci-dessous font désormais foi.

## Comment lire ce registre

Chaque invariant porte un **statut de source** :

- **Explicite** : cité tel quel, avec son numéro, dans les propositions
  d'architecture ou un ADR accepté.
- **Inféré** : numéro non explicité dans les sources ; attribution
  reconstruite par cohérence avec les citations voisines. **Figé tel
  quel le 2026-10-19 jusqu'à relecture du responsable du registre** :
  le registre fait foi pour les tests en attendant ; toute
  renumérotation ou scission (I3 notamment) mettra à jour les
  références dans la même phase, sans bloquer les travaux.
- **À arbitrer** : règle évoquée comme hypothèse dans les propositions ;
  ne devient un invariant qu'après décision consignée.

Un invariant n'est « couvert » que lorsqu'un test nommé le prouve.
Niveaux de test : **D** = domaine pur (sans base ni S3, rapide),
**A** = cas d'usage applicatif (ports simulés), **I** = intégration
(PostgreSQL/S3 réels, indispensable pour RLS, transactions et
concurrence), **C** = contrat client (tests golden, voir
`docs/contrat-client-fige.md`).

Règle transverse : chaque invariant est testé **avec deux entreprises**
dès qu'il touche à une donnée partagée. Aucun test actuel ne le fait.

---

## Domaine Notes de frais

### I1 — Montant valide

- **Énoncé** : le montant d'une note est un nombre fini, strictement
  positif, dans la capacité de la colonne `numeric(10,2)`. Toute saisie
  non strictement numérique (ex. `12abc`) est refusée, jamais tronquée.
  Tranché en revue phase/5 : **aucun arrondi silencieux** — `12.345`,
  `.5`, `1e2` sont refusés (décimales : 2 chiffres maximum, chiffres
  arabes uniquement), même si `parseFloat` les accepterait. La règle
  est portée par `SoumettreNote.validerMontant`, pas par la base.
- **Statut** : inféré (objet métier `Montant` cité ; numéro reconstruit).
- **Sources** : propositions (« objets métier `Montant`, `DateDépense`
  qui refusent les valeurs invalides ») ; audit A, observation
  validation (`Number.parseFloat` accepte `12abc`, aucune borne).
- **À `265924b`** : violé. `Number.parseFloat` + seuls tests
  `isFinite` et `> 0` (`src/app/api/expense-notes/route.ts:69-73`).
- **État implémenté (V2)** : tenu. Objet valeur `Montant`
  (`src/domain/Montant.ts`) : refuse toute saisie non strictement
  décimale, plus de 2 décimales, ≤ 0 ou au-delà de `MONTANT_MAX` (99 999
  999,99) → `400 Montant invalide`. Le port `NouvelleNote` exige un
  `Montant` : un nombre brut ne compile pas. Tests :
  `tests/unit/domain/saisie.test.ts` ; capacité `numeric(10,2)` prouvée
  par `tests/integration/montant-capacite.test.ts`.
- **Garantie cible** : objet métier `Montant` ; refus en `DonnéesInvalides`
  → HTTP 400 (contrat client §5).
- **Tests** : D — `Montant` refuse `0`, négatif, `NaN`, `12abc`,
  dépassement de capacité ; A — `SoumettreNote` rejette sans rien
  persister. C — le golden fige le `400 Montant invalide`
  (`C02_invalid`, textes actés au contrat client §5).
- **Question ouverte** : arrondi à 2 décimales accepté ou refusé ?
  Montant maximum métier (plafond de note) autre que la capacité SQL ?

### I2 — Date de dépense valide

- **Énoncé** : la date de dépense est une date calendaire réelle au
  format `YYYY-MM-DD`. Toute autre valeur est refusée en 400, jamais
  en erreur 500.
- **Statut** : **explicite** (« La date n'est pas validée et provoque
  une erreur 500 (viole I2) »).
- **Sources** : propositions, ligne `SoumettreNote` ; audit A, même
  observation.
- **À `265924b`** : violé. Simple contrôle `typeof string`
  (`route.ts:74`), l'erreur remonte en 500 via `respondError`.
- **État implémenté (V2)** : tenu. Objet valeur `DateDepense`
  (`src/domain/DateDepense.ts`), qui reste une chaîne `YYYY-MM-DD` :
  toute date non calendaire → `400 Date invalide`, jamais 500. Exigé par
  le port `NouvelleNote`.
- **Garantie cible** : objet métier `DateDépense`.
- **Tests** : D — refuse `2026-02-30`, `30/01/2026`, chaîne vide ;
  accepte `2024-02-29`. C — le format renvoyé reste `YYYY-MM-DD`.
- **Question ouverte** : une date future est-elle légitime (dépense
  engagée, billet acheté d'avance) ? Rien dans les sources ne
  l'interdit ; ne pas l'interdire sans arbitrage.

### I3 — Saisie complète : description et justificatif fournis conformes

- **Énoncé** : une note n'existe qu'avec une description non vide et un
  justificatif fourni, d'un type autorisé (`image/png`, `image/jpeg`,
  `image/webp`, `application/pdf`) et de taille ≤ 10 Mio. Tranché en
  revue phase/5 : la description est stockée rognée (`trim`) — la
  réponse peut donc différer de la saisie sur les espaces de bord.
- **Statut** : inféré (regroupe les contrôles 400 déjà présents dans le
  code ; le « justificatif obligatoire » du schéma proposé couvre
  I1–I4). À éventuellement scinder en deux invariants par le
  responsable du registre.
- **Sources** : code actuel (`route.ts:71-86` : description non vide,
  types autorisés, `MAX_RECEIPT_BYTES`) ; schéma « architecture
  proposée » (« justificatif obligatoire »).
- **À `265924b`** : tenu pour la création de note, **non tenu** pour la
  suggestion OCR (aucune limite, voir I-hors-registre en fin de
  document et ticket OCR).
- **État implémenté (V2)** : tenu. Domaine : objet valeur `Description`
  (rognée, non vide), `verifierContenantRecu`
  (`src/domain/Justificatif.ts` : 4 types, 10 Mio) appliqué par la route
  avant lecture des octets, puis `verifierOctetsRecu` (signature réelle
  PNG, JPEG, WebP, PDF — revue audit V2, point 8) appliqué par
  `SoumettreNote` avant tout envoi au stockage. Suggestion :
  `horsGabaritSuggestion` (images seules, même taille maximale) et la
  même signature ; hors gabarit ou octets incohérents → `{}`. Messages
  du contrat client §5.
- **Garantie cible** : validation portée par `SoumettreNote` et
  `SuggérerChamps` avec les mêmes bornes.
- **Tests** : A — description blanche refusée ; type MIME hors liste
  refusé ; fichier de 10 Mio + 1 octet refusé, sans persistance.
- **Question ouverte** : le type MIME déclaré suffit-il, ou faut-il un
  contrôle du contenu réel du fichier (audit A : « MIME déclaré
  seulement ») ? Hors périmètre actuel des propositions.

### I4 — Aucune note sans justificatif stocké (atomicité note + reçu)

- **Énoncé** : une note persistée et visible possède toujours un
  `receipt_key` non vide pointant sur un objet effectivement stocké.
  Si l'envoi du justificatif échoue, la note n'existe pas.
- **Statut** : **explicite** (« il reste une note sans justificatif
  (viole I4) »).
- **Sources** : propositions, ligne `SoumettreNote` ; audit A-F07.
- **À `265924b`** : violé. INSERT avec `receipt_key = ''`, commit,
  upload S3, puis UPDATE via `getPool()` hors contexte utilisateur
  (`route.ts:88-106`). Un échec d'upload laisse une note orpheline,
  décidable (`status = 'pending'` par défaut) avant même d'avoir un
  justificatif.
- **État implémenté (V2)** : tenu. `SoumettreNote` réserve la séquence,
  envoie le reçu, puis crée la note dans une transaction (`UnitOfWork`)
  ; un échec de création supprime le reçu en compensation ; sur
  `EcritureIncertaine`, aucune compensation (reçu conservé, journalisé).
- **Garantie cible** : envoi du reçu d'abord, puis création de la note
  avec sa clé en une seule transaction (port `UnitOfWork`), ou
  suppression compensatoire prouvée en cas d'échec. Sur COMMIT
  d'issue incertaine (`EcritureIncertaine`, revue phase/5), aucune
  compensation : la note existe peut-être, le reçu est conservé.
- **Tests** : I — panne S3 simulée entre upload et insertion : aucune
  ligne en base, aucun objet orphelin listé ; I — le chemin nominal
  produit note + objet dans le même état final. C — succès toujours
  `201` avec la forme gelée.

### I5 — Machine à états : `pending → approved | rejected`, jamais l'inverse

- **Énoncé** : une note naît `pending`. Les seules transitions sont
  `pending → approved` et `pending → rejected`. Aucune transition ne
  part d'un état décidé ; pas de réouverture, pas de second changement.
- **Statut** : **explicite** (« machine à états du domaine (I5) ») et
  confirmé par ADR-DOMAIN-001 (accepté, branche `Ai-ready-ness`).
- **Sources** : propositions, ligne `TrancherNote` ; ADR-DOMAIN-001 ;
  `ExpenseNote.approve()/reject()` dans `src/domain/ExpenseNote.ts`.
- **À `265924b`** : tenu par les contrôles SQL copiés dans les 4 routes
  de décision et le `CHECK` de statut en base, mais l'entité
  `ExpenseNote` n'est jamais utilisée par les routes.
- **État implémenté (V2)** : tenu à deux niveaux (ADR-DOMAIN-001,
  amendé). Règle : `ExpenseNote.approve()`/`reject()`, appelées par
  `TrancherNote` sur la note lue, lèvent `DejaTranchee` (409) sans
  écriture. Concurrence : l'écriture conditionnelle `status = 'pending'`
  de `trancherSiEnAttente`. Borne : `CHECK` de statut. Tests :
  `tests/unit/domain/ExpenseNote.test.ts`,
  `tests/unit/application/trancher-note.test.ts`,
  `drill-transition-guard`.
- **Garantie cible** : transition portée par l'entité du domaine,
  invoquée par le seul cas d'usage `TrancherNote`.
- **Tests** : D — `approve()` et `reject()` lèvent sur une note déjà
  décidée ; les deux transitions légitimes réussissent.
- **Question ouverte** : un futur état (`reimbursed`, réouverture)
  imposerait de remplacer cet invariant (clause de retrait déjà prévue
  par ADR-DOMAIN-001).

### I6 — Décision unique et atomique

- **Énoncé** : une note n'est tranchée qu'une fois, même sous décisions
  concurrentes. La seconde tentative reçoit `DéjàTranchée` → HTTP 409,
  elle n'écrase jamais la première décision.
- **Statut** : **explicite** (« deux décisions simultanées s'écrasent
  (P1, viole I6) »).
- **Sources** : propositions, ligne `TrancherNote` ; audit A-F08.
- **À `265924b`** : violé. SELECT, test `status !== 'pending'`, puis
  UPDATE sans prédicat de statut ni verrou, dans les 4 routes : deux
  décisions simultanées peuvent toutes deux « réussir ».
- **État implémenté (V2)** : tenu. Une seule instruction `UPDATE … WHERE
  status = 'pending'` écrit statut et traçabilité ; zéro ligne affectée
  → `409 Already decided`. Preuve de concurrence rejouable : backlog
  #002.
- **Garantie cible** : mise à jour conditionnelle
  `UPDATE … WHERE id = $1 AND status = 'pending'` ; zéro ligne
  affectée = `DéjàTranchée`.
- **Tests** : I — deux décisions concurrentes sur la même note :
  exactement une réussit, l'autre reçoit 409, l'état final est celui
  de la gagnante. C — le 409 conserve `{ "error": "Already decided" }`.

---

## Politique d'accès

### I7 — Valideurs hiérarchiques : manager direct et N+1, jamais soi-même

- **Énoncé** : les valideurs d'une note d'un auteur rattaché sont son
  manager direct **et le manager de ce manager (N+1)**, tous deux avec
  le même droit permanent de consulter et trancher. Personne ne
  tranche jamais sa propre note : l'auteur est toujours exclu de ses
  valideurs.
- **Statut** : **explicite, amendé** par ADR-ARCH-002 `accepted`
  (2026-10-21, accepté pour nous le 2026-10-22) qui élargit la règle
  initiale au N+1 et à l'exclusion de soi.
- **Sources** : propositions (règle `valideurDe`) ; ADR-ARCH-002
  (branche `architecture`) ; `calculerValideurs` dans
  `src/domain/PolitiqueAcces.ts`. L'ancienne entité `User`, qui ne
  connaissait que le manager direct, a été retirée.
- **À `265924b`** : non tenu au-delà du manager direct ; règle non
  centralisée, non testée ; les policies RLS ne connaissaient pas le
  N+1 (alignées depuis par la migration `0005`, ADR-DATA-002
  `accepted`).
- **État implémenté (V2)** : tenu. Référence : `calculerValideurs`
  (`src/domain/PolitiqueAcces.ts`) — manager direct + N+1, auteur
  toujours exclu ; `besoinDesRh` et `figureDansLaFile` y vivent aussi.
  Copies imposées : un seul prédicat SQL (`predicatValideur`, partagé
  par la décision et la file manager) et les policies RLS de la
  migration `0005`. Les trois versions sont confrontées à une table de
  vérité unique (`tests/support/table-valideurs.ts`) : domaine par
  `tests/unit/domain/table-valideurs.test.ts`, SQL et RLS par
  `tests/integration/concordance-valideurs.test.ts`.
- **Tests** : D — table de vérité de `valideursDe` (pluriel) ;
  I — le N+1 voit, consulte et tranche ; un manager d'une autre
  branche ou d'une autre entreprise est refusé ; auto-décision
  refusée.

### I8 — Routage RH : auteurs sans manager et notes des RH, même entreprise

- **Énoncé** : si l'auteur n'a pas de manager — manager racine ou
  employé non rattaché — ses valideurs sont les `hr_admin` **de la
  même entreprise**. Si l'auteur est lui-même `hr_admin`, ses
  valideurs sont les **autres** RH de son entreprise. Un RH unique,
  seul dans son entreprise et auteur d'une note, n'a aucun valideur :
  cas limite connu, non traité (ADR-ARCH-002).
- **Statut** : **explicite, amendé** par ADR-ARCH-002 `accepted`
  (routage des employés sans manager et des notes de RH, là où la
  proposition initiale ne visait que les managers racines).
- **Sources** : propositions ; schéma « architecture proposée » ;
  ADR-ARCH-002 ; ADR-DATA-001/002 ; audit A-F10.
- **À `265924b`** : **partiellement violé**. Les routes RH filtrent
  par entreprise, mais les policies RLS
  `expense_notes_hr_root_manager_select/update` ne vérifient pas
  `hr.company_id = u.company_id` et ne couvrent pas les employés sans
  manager : la base seule ne tient pas l'invariant.
- **État implémenté (V2)** : tenu. RH de la même entreprise pour les
  auteurs sans manager, les notes de RH (autres RH) et les équipes des
  managers racines ; égalité d'entreprise dans les policies (migrations
  `0003`, `0005`). Couvert par la même table de vérité que I7. La file
  RH (`figureDansLaFile`) reste restreinte aux auteurs sans manager et
  aux RH : le pouvoir sur les équipes des managers racines n'est
  accessible que par l'API (lecture A, lot 3).
- **Tests** : I — RH de l'entreprise B ne voit ni ne tranche la note
  d'un manager racine de l'entreprise A, **en contournant
  l'applicatif** (requête directe sous contexte RLS) ; employé sans
  manager visible chez ses seuls RH ; note d'un RH tranchable par un
  autre RH, jamais par son auteur.

### I9 — Consultation réservée à l'auteur ou au valideur légitime, même entreprise

- **Énoncé** : lire une note ou son justificatif exige d'être son
  auteur, son valideur au sens I7/I8, et dans tous les cas de la même
  entreprise. Il n'existe pas de lecture par le seul identifiant.
- **Statut** : **explicite** (cité avec I10 pour la faille IDOR) ;
  formulation détaillée inférée de la politique d'accès proposée
  (`peutConsulter`).
- **Sources** : propositions, lignes justificatif et cloisonnement ;
  schéma proposé (« même entreprise (I9, I10) »).
- **À `265924b`** : violé côté manager : la route receipt-url manager
  ne vérifie ni l'équipe ni l'entreprise (audit A-F04). Tenu ailleurs
  par des filtres recopiés, donc fragile.
- **État implémenté (V2)** : tenu. `peutConsulter` décide pour la note
  et son justificatif (`AccederAuJustificatif`, une seule implémentation
  pour les 3 routes) ; `trouverParId` est borné à l'entreprise. Hors
  périmètre → `404 Not found` (IDOR fermé).
- **Garantie cible** : fonction unique `peutConsulter(acteur, note)`,
  utilisée pour la note **et** son justificatif.
- **Tests** : A/I — matrice acteur × note (auteur, manager direct,
  autre manager, RH même entreprise, RH autre entreprise, employé
  tiers) sur lecture de note et d'URL de reçu ; seuls auteur et
  valideur obtiennent une réponse.

### I10 — Tout accès à une note passe par le contexte d'autorisation, jamais hors scope

- **Énoncé** : aucun accès à `expense_notes` ou à un justificatif ne
  s'effectue sans l'acteur courant : pas de lecture par `getPool()`
  sans contexte utilisateur là où `withUserScope` est requis, et la
  RLS n'est jamais court-circuitée par le compte applicatif.
- **Statut** : **explicite** (second volet de la faille IDOR : « requête
  faite hors du contexte utilisateur (viole I9 et I10) ») ; volet
  « compte SQL » rattaché depuis l'audit A-F03.
- **Sources** : propositions, lignes justificatif et cloisonnement
  (« La RLS reste un filet de sécurité (le rôle SQL relève du
  pilote 2) ») ; ADR-DATA-001 ; audit A-F03 (rôle PostgreSQL
  superutilisateur : `FORCE ROW LEVEL SECURITY` inopérant).
- **À `265924b`** : violé. Receipt-url manager et UPDATE post-upload
  de la création passent par `getPool()` ; le rôle applicatif livré
  est superutilisateur, donc la RLS ne protège rien en pratique.
- **État implémenté (V2)** : tenu. `expense_notes` n'est lue ou écrite
  que sous `withUserScope` / `UnitOfWork` ; le serveur se connecte avec
  `expense_app`, non-superutilisateur (ADR-DATA-002 `accepted`,
  `APP_DATABASE_URL`). `getPool()` hors contexte ne sert plus qu'aux
  tables sans RLS (`users`, auth, acteur) et à la réservation de
  séquence.
- **Garantie cible** : repositories exigeant l'acteur ou l'entreprise
  en signature ; rôle SQL applicatif non-superutilisateur (pilote 2) ;
  `getPool()` réservé aux usages sans donnée d'entreprise (auth).
- **Tests** : I — chaque policy vérifiée sous le rôle applicatif réel
  (non-superutilisateur) ; recherche automatisée : aucun `getPool()`
  sur `expense_notes` hors liste blanche documentée.

---

## Domaine Organisation

### I11 — Rattachement dans la même entreprise uniquement

- **Énoncé** : on ne peut rattacher un collaborateur qu'à un manager
  de la **même entreprise** que lui. Toute tentative inter-entreprises
  est refusée (`409`), y compris par appel direct à l'API.
- **Statut** : **explicite** (« On peut désigner un manager d'une
  autre entreprise (viole I11) »).
- **Sources** : propositions, ligne `RattacherAuManager` ;
  audit A-F05.
- **À `265924b`** : violé. La cible est filtrée par entreprise, mais le
  manager choisi est recherché par `id` + rôle seuls, sans
  `company_id` (`src/app/api/hr/users/[id]/manager/route.ts:39-42`) ;
  le commentaire voisin affirme le contraire de ce que fait le code.
- **État implémenté (V2)** : tenu. Règle explicite du domaine :
  `verifierManagerEligible` (`src/domain/Hierarchie.ts`) exige la même
  entreprise que le collaborateur, en plus de la lecture de l'annuaire
  bornée à l'entreprise → `409 Invalid manager`.
- **Tests** : A/I — RH de A tente de rattacher son employé à un
  manager de B : refus, rattachement inchangé.

### I12 — Hiérarchie acyclique

- **Énoncé** : la chaîne des `manager_id` ne contient aucun cycle,
  direct ou transitif (A managé par B managé par … managé par A).
- **Statut** : **explicite** (« Pas de détection de cycle
  (viole I12) »).
- **Sources** : propositions, ligne `RattacherAuManager` ; audit A,
  observation mutation RH.
- **À `265924b`** : violé. Seul l'auto-rattachement direct est bloqué
  (`managerId === id` → 409) ; aucun contrôle transitif.
- **État implémenté (V2)** : tenu. `RattacherAuManager` lit la chaîne
  sous verrou consultatif par entreprise (`verrouillerRattachements`),
  dans la transaction du rattachement ; la règle est la fonction pure
  `creeraitUnCycle` du domaine → `409 Cycle hiérarchique détecté`. Tests
  : `tests/unit/domain/hierarchie.test.ts`.
- **Garantie cible** : domaine Organisation, parcours de la chaîne
  avant écriture, dans la transaction du cas d'usage. Tranché en
  revue phase/6 : verrou consultatif transactionnel par entreprise
  (`verrouillerRattachements`) + lectures dans le `executer` — deux
  rattachements concurrents ne s'entrelacent jamais, sans CTE.
- **Tests** : D/A — cycles de longueur 2 et 3 refusés ; chaîne légitime
  profonde acceptée.
- **Question ouverte** : profondeur maximale de hiérarchie, s'il en
  faut une ? Rien dans les sources ne la borne.

### I13 — Manager désigné éligible

- **Énoncé** : le manager désigné a le rôle `manager` et est différent
  du collaborateur rattaché. Un corps de requête invalide ne modifie
  jamais le rattachement existant.
- **Statut** : inféré — les propositions regroupent « même entreprise,
  rôle `manager`, pas d'auto-rattachement, pas de cycle » sous
  I11–I13 sans détailler la répartition ; le volet « corps invalide »
  vient de l'audit A (observation mutation RH : un JSON invalide
  devient `managerId = null` et efface le rattachement).
- **Sources** : propositions, ligne `RattacherAuManager`
  (« garantit I11 à I13 ») ; code actuel (`route.ts:32-45`) ;
  audit A, observations.
- **À `265924b`** : partiellement tenu (rôle et auto-rattachement
  contrôlés), violé sur le corps invalide (voir statut).
- **État implémenté (V2)** : tenu. Domaine (`Hierarchie`) : cible
  rattachable (`ROLES_RATTACHABLES`, jamais un RH), pas
  d'auto-rattachement, rôle `manager` exigé (`409 Invalid manager`) ;
  corps JSON invalide → `400 Corps invalide`, rattachement inchangé. La
  console RH et l'annuaire utilisent les mêmes règles.
- **Tests** : A — désigner un `employee` ou soi-même : refus ;
  corps JSON mal formé : `400`, rattachement inchangé. C — le succès
  conserve la forme utilisateur gelée.

### I14 — Premier inscrit d'un domaine = RH, suivants = employés, de façon atomique

- **Énoncé** : la première inscription réussie sur un domaine email
  crée l'entreprise et attribue `hr_admin` à son auteur ; toute
  inscription suivante sur ce domaine rejoint l'entreprise comme
  `employee`. Deux inscriptions simultanées sur un domaine nouveau
  produisent exactement un RH.
- **Statut** : **explicite** dans le schéma proposé
  (« 1er inscrit = RH … (I14, I15) ») ; volet atomicité cité dans les
  propositions (« Deux inscriptions simultanées sur le même domaine
  peuvent produire des résultats incohérents »).
- **Sources** : propositions, ligne `Inscrire` ; README (comportement
  documenté) ; code actuel `src/app/actions/auth.ts:41-69` (4 requêtes
  séparées, hors transaction).
- **À `265924b`** : règle métier tenue en séquentiel, atomicité
  violée : pas de transaction, course possible entre le contrôle
  d'existence et les insertions.
- **État implémenté (V2)** : tenu. Règles du domaine
  (`src/domain/Inscription.ts` : champs, `domaineDe`, `estDomainePublic`
  — domaines e-mail publics refusés, revue audit V2, point 4 —,
  `nomEntrepriseDepuisDomaine`, `roleALInscription`) appliquées par
  `Inscrire` en une transaction ; la contrainte `UNIQUE(email_domain)`
  arbitre les inscriptions simultanées, et la course sur l'email est
  traduite par l'adaptateur (le cas d'usage ne connaît plus le code
  PostgreSQL). Tests : `tests/unit/domain/inscription.test.ts`,
  `tests/integration/inscrire-db.test.ts`.
- **Garantie cible** : cas d'usage `Inscrire` sous `UnitOfWork`,
  unicité portée aussi par la contrainte `UNIQUE(email_domain)`.
- **Tests** : I — inscriptions concurrentes sur un domaine nouveau :
  une entreprise, un seul `hr_admin` ; A — second inscrit = `employee`
  de la même entreprise. C — Server Action et redirections inchangées
  (contrat figé §3).
- **Hors invariant (rappel)** : la vérification d'email reste hors du
  périmètre architecture (pilote 2) ; ne pas l'ajouter ici sans
  arbitrage, elle changerait le parcours client gelé.

### I15 — Le rôle `manager` n'est jamais auto-attribué

- **Énoncé** : aucun parcours public (inscription, interface RH,
  auto-service) ne crée ni n'attribue le rôle `manager`. Il ne
  provient que d'un provisionnement contrôlé (seed, SQL direct,
  futur parcours d'administration explicitement décidé).
- **Statut** : **explicite** dans le schéma proposé
  (« manager non libre-service (I14, I15) ») et documenté dans le
  README (« le rôle `manager` n'est jamais assignable depuis
  l'interface — seulement via le script de seed ou directement en
  base »).
- **Sources** : schéma proposé ; README ; code (aucune route
  d'attribution de rôle).
- **À `265924b`** : tenu, par absence de fonctionnalité — donc sans
  test qui le protège d'une régression future.
- **État implémenté (V2)** : tenu, garanti par le type :
  `roleALInscription` renvoie un `RoleInscription` (`hr_admin` ou
  `employee`), exigé par le port `NouvelUtilisateur` — une inscription
  ne peut pas attribuer `manager`. Aucune route n'écrit `role =
  'manager'`.
- **Tests** : A/I — tenter d'obtenir `manager` via inscription et via
  chaque route RH : rôle résultant toujours `employee`/`hr_admin`
  selon I14 ; revue de code : aucune route n'écrit `role = 'manager'`.

---

## Sujets volontairement hors registre (à trancher avant ajout)

Ces points apparaissent dans les propositions comme **hypothèses**,
pas comme invariants. Les inscrire ici sans arbitrage reviendrait à
décider à la place du chef de projet :

1. **Traçabilité des décisions** — **acceptée** : ADR-DOMAIN-002
   `accepted` sur la branche `architecture` (2026-10-21), acceptée
   pour nous le 2026-10-22. Auteur et date toujours enregistrés,
   **motif obligatoire au rejet** (facultatif à l'approbation,
   500 caractères maximum). Candidate à devenir un invariant
   (proposition : I16) ; reste interne, jamais exposée dans le JSON
   gelé, mais la requête de rejet fait l'objet d'une dérogation au
   contrat client (voir ce contrat, §9).
2. **Sort des notes en attente lors d'un changement de manager** —
   **accepté** : ADR-ARCH-002 `accepted` sur la branche
   `architecture` (2026-10-21), accepté pour nous le 2026-10-22.
   Transfert immédiat au nouveau manager, l'ancien perd consultation
   et décision sur les notes `pending`. Ne crée pas d'invariant
   nouveau : découle de I7/I8 (valideurs calculés sur le rattachement
   courant) et de I9.
3. **Notification de l'auteur** après décision : `TrancherNote` publie
   l'événement `NoteTranchee` après le commit, vers un adaptateur
   console ; un échec d'envoi ne fait jamais échouer la décision.
   Délai, canal et obligation de livraison relèvent toujours d'une
   décision produit.
4. **Bornes OCR** : fixées le 2026-10-19 (contrats des ports §11) et
   implémentées dans `SuggererChamps` — images seules (png, jpeg,
   webp), 10 Mio maximum, délai de 15 s avec annulation réelle,
   plafond de concurrence dans l'adaptateur ; hors borne → `{}`.

## Matrice de couverture visée

| Invariant | Cas d'usage porteur | Niveau de test minimal |
|---|---|---|
| I1, I2, I3 | `SoumettreNote`, `SuggérerChamps` | D + A |
| I4 | `SoumettreNote` (`UnitOfWork`) | I |
| I5, I6 | `TrancherNote` | D + I (concurrence) |
| I7, I8 | `TrancherNote`, `ListerNotesÀTrancher` | D + I |
| I9, I10 | `AccéderAuJustificatif`, tous repositories | A + I (RLS réelle) |
| I11, I12, I13 | `RattacherAuManager` | D + A |
| I14 | `Inscrire` (`UnitOfWork`) | I (concurrence) |
| I15 | `Inscrire`, routes RH | A + revue |

Objectif déclaré par les propositions : passer de **0 à 15 invariants
couverts par un test**. Ce registre est la liste qui permet de cocher
cet indicateur un par un.
