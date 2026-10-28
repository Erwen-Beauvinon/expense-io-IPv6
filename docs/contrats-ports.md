# Contrats des ports — architecture cible Expense.io

> Statut : **document de travail de la migration** (revues des PR
> phase/1–8, TomVendee). Les signatures sont tenues à jour à l'état
> construit (« as-built ») à chaque phase ; tout écart entre ce texte
> et le code est un défaut à corriger d'un côté ou de l'autre.
> Base : `main` @ `265924b`, propositions de la branche `architecture`,
> `docs/registre-invariants.md`, `docs/contrat-client-fige.md`,
> ADR-ARCH-002, ADR-DOMAIN-002 et ADR-DATA-002 (`accepted`,
> `docs/adr/`, copiés de la branche `architecture`).

## 1. Règles communes à tous les ports

1. **Un port est une interface métier**, définie côté
   application/domaine. L'infrastructure l'implémente (PostgreSQL, S3,
   Tesseract…). Aucun port n'expose de type SQL, S3, Next.js ou HTTP :
   pas de `PoolClient`, pas de ligne SQL brute, pas de `Response`.
2. **L'acteur est toujours explicite.** Toute méthode qui lit ou écrit
   une donnée d'entreprise reçoit un `Acteur` construit côté serveur
   depuis la session — jamais depuis le corps d'une requête :

   ```ts
   interface Acteur {
     id: string
     role: 'employee' | 'manager' | 'hr_admin'
     companyId: string
   }
   ```

3. **Absence ≠ erreur.** Un objet introuvable ou hors périmètre de
   l'acteur se traduit par `null` (ou `false` pour une écriture
   conditionnelle), jamais par une exception. Les cas d'usage
   transforment ce `null` en erreur typée (§7).
4. **Les exceptions d'un port sont des pannes d'infrastructure**
   (base injoignable, S3 en erreur, moteur d'analyse en panne), jamais
   des règles métier. Le domaine ne lève que des erreurs typées (§7).
5. **Aucun port ne connaît le JSON client.** La sérialisation gelée
   (`docs/contrat-client-fige.md` §4) reste dans la couche interface.
   Les champs internes (`decided_by`, `decided_at`,
   `decision_reason` — ADR-DOMAIN-002) circulent dans le domaine et ne
   sont pas exposés.
6. **Idempotence et concurrence** : les écritures sensibles sont
   conditionnelles (I6) ; les effets externes non transactionnels
   (S3, notification) suivent les règles de compensation des §5 et §8.

## 2. Types partagés (domaine)

```ts
type Decision = 'approved' | 'rejected'

interface NoteAvecAuteur {
  note: ExpenseNote            // entité existante, src/domain/ExpenseNote.ts
  auteurId: string
  auteurCompanyId: string
  auteurManagerId: string | null
  auteurRole: 'employee' | 'manager' | 'hr_admin'
}

interface UtilisateurAnnuaire {
  id: string
  companyId: string
  role: 'employee' | 'manager' | 'hr_admin'
  managerId: string | null
  name: string
  email: string
}

type OrdreTri =
  | 'created_at_desc' | 'created_at_asc'
  | 'expense_date_desc' | 'expense_date_asc'
  | 'amount_desc' | 'amount_asc'
```

`OrdreTri` est la liste fermée qui remplace le paramètre `sort`
interpolé dans le SQL (injection P0). La correspondance vers les
colonnes SQL vit dans l'adaptateur, jamais dans le cas d'usage.
**À valider** : la liste exacte des tris utiles ; le client actuel
n'envoie aucun `sort` (défaut actuel : `created_at DESC`).

## 3. Port `ExpenseNoteRepository`

Rôle : persister et relire les notes, toujours dans le périmètre d'un
acteur ou d'une entreprise (I9, I10). Implémentation cible :
PostgreSQL via `withUserScope` (RLS en second rideau).

```ts
interface ExpenseNoteRepository {
  // null si la note n'existe pas OU si l'acteur ne peut pas la consulter (I9)
  trouverParId(acteur: Acteur, noteId: string): Promise<NoteAvecAuteur | null>

  listerParAuteur(acteur: Acteur, auteurId: string, tri: OrdreTri): Promise<NoteAvecAuteur[]>

  // Notes pending du périmètre de décision courant (ADR-ARCH-002) :
  // manager — notes de ses managés directs ET indirects (N+1) ;
  // RH — notes des auteurs sans manager (managers racines, employés
  // non rattachés, notes de RH), hors ses propres notes (I7).
  // Tri `created_at` croissant, comme les anciennes requêtes.
  listerEnAttentePour(acteur: Acteur): Promise<NoteAvecAuteur[]>

  creer(tx: Transaction, entree: NouvelleNote): Promise<NoteAvecAuteur>

  // Écriture conditionnelle I5/I6 + traçabilité ADR-DOMAIN-002
  // (accepted) : au rejet, le motif est obligatoire, non vide,
  // 500 caractères maximum — validé par le cas d'usage TrancherNote
  // avant cet appel ; à l'approbation, il est facultatif.
  // true = décision appliquée ; false = déjà tranchée (409) ou
  // valideur perdu entre-temps (409 aussi — cas limite documenté).
  trancherSiEnAttente(
    acteur: Acteur,
    noteId: string,
    decision: Decision,
    motif: Motif | null,          // objet valeur du domaine (src/domain/Motif.ts)
  ): Promise<boolean>             // decided_at = now() SQL, horloge unique
}

// Objets valeur du domaine (src/domain/) : constructeur privé, aucune
// instance invalide possible — un nombre ou une chaîne bruts ne
// compilent pas. L'adaptateur lit `.valeur`.
interface NouvelleNote {
  auteurId: string
  montant: Montant             // I1 (src/domain/Montant.ts)
  dateDepense: DateDepense     // I2, reste une chaîne YYYY-MM-DD
  description: Description     // I3, stockée rognée
  receiptKey: string           // clé d'un objet déjà stocké (I4, §6)
}
```

Garanties attendues de l'implémentation :

- aucune méthode ne lit `expense_notes` sans `companyId` ou sans
  contexte utilisateur RLS — c'est la forme testable de I10 ;
- `trancherSiEnAttente` est **une seule** instruction conditionnelle
  écrivant statut, `decided_by`, `decided_at` et `decision_reason`
  ensemble ; le périmètre (entreprise + valideur courant au sens de
  `PolitiqueAcces`, via `users`) fait partie du `WHERE`, sans
  `SELECT` préalable décisionnel. L'autorisation reste vérifiée avant
  par le cas d'usage (404 propre), l'écriture la réévalue
  atomiquement (ADR-ARCH-002 §3) ;
- le prédicat « l'acteur est valideur » n'existe qu'**une fois** en SQL
  (`predicatValideur`, exporté par `PgExpenseNoteRepository`), partagé
  par `trancherSiEnAttente` et la file manager ; sa concordance avec
  `calculerValideurs` et les policies RLS est prouvée par
  `tests/integration/concordance-valideurs.test.ts` ;
- `listerEnAttentePour` se déduit du rattachement **courant**
  (ADR-ARCH-002) : aucun valideur stocké n'est lu. La liste RH est
  une file de routage (auteurs sans manager), pas l'ensemble du
  pouvoir de décision : un RH valideur d'une équipe racine (tableau
  ADR-ARCH-002 ligne 2) tranche via l'API, même si la note n'est
  pas dans sa file — plein pouvoir, file restreinte (e2e RH) ;
- `reserverSequence` lit `pg_get_serial_sequence('expense_notes',
  'receipt_seq')` (nom auto-généré jamais codé en dur).

## 4. Port `AnnuaireOrganisation`

Rôle : lire l'organigramme et appliquer les rattachements, sans que le
domaine Notes joigne jamais la table `users` (frontière des deux
domaines). Porte I11–I13 et l'alimentation de `valideurDe` (I7, I8).

```ts
interface AnnuaireOrganisation {
  trouverUtilisateur(
    companyId: string,
    userId: string,
    tx?: Transaction,   // avec tx : participe à la transaction du cas d'usage (revue phase/6)
  ): Promise<UtilisateurAnnuaire | null>

  // Pour les écrans RH ; filtré par entreprise, jamais global
  listerCollaborateurs(companyId: string): Promise<UtilisateurAnnuaire[]>

  // Sérialise les rattachements d'une entreprise (revue phase/6 §1,
  // I12) : verrou consultatif transactionnel — lectures de la chaîne
  // et écriture partagent une seule transaction, la détection de cycle
  // ne peut plus être faussée par un entrelacement A→B / B→A.
  verrouillerRattachements(tx: Transaction, companyId: string): Promise<void>

  // I11–I13 déjà vérifiés par le cas d'usage avant cet appel
  rattacher(tx: Transaction, companyId: string, userId: string, managerId: string | null): Promise<void>

  // Inscription (I14, I15)
  creerEntreprise(tx: Transaction, nom: string, domaine: string): Promise<{ id: string; nouvelle: boolean }>
  // null si l'email est déjà pris : l'adaptateur traduit la violation
  // d'unicité, le cas d'usage ne voit aucun code d'erreur de la base.
  creerUtilisateur(tx: Transaction, entree: NouvelUtilisateur): Promise<UtilisateurAnnuaire | null>
}
```

Garanties : toute lecture est bornée à `companyId` ; `rattacher`
n'accepte qu'un couple (utilisateur, manager) déjà validé même
entreprise / rôle / acyclicité par le domaine Organisation — le port
persiste, il ne re-décide pas. `creerUtilisateur` ne reçoit jamais le
rôle `manager` depuis un parcours public (I15) : le rôle fait partie
de l'entrée construite par le cas d'usage `Inscrire`, pas d'une donnée
client.

## 5. Port `UnitOfWork`

Rôle : exécuter un cas d'usage dans **une** transaction base, avec le
contexte RLS de l'acteur posé pour sa durée (généralisation de
l'actuel `withUserScope`).

```ts
interface UnitOfWork {
  executer<T>(acteur: Acteur, travail: (tx: Transaction) => Promise<T>): Promise<T>
}

// Poignée opaque : aucun accès SQL n'en sort ; seuls les repositories
// savent l'utiliser. Ni commit ni rollback exposés.
// Déclarée dans src/ports/UnitOfWork.ts, avec le port qui la produit
// (notion technique : elle ne vit pas dans le domaine).
interface Transaction { readonly _marque: unique symbol }
```

Garanties :

- commit si le travail réussit, rollback sur toute exception, contexte
  `app.current_user_id` posé puis relâché avec la connexion ;
- pas d'imbrication : un second `executer` dans un travail en cours
  est une erreur de programmation, signalée comme telle
  (`TransactionImbriquee`, détectée par chaîne async — revue phase/5) ;
- COMMIT d'issue incertaine : si le COMMIT échoue après un travail
  réussi, `EcritureIncertaine` est levée (revue phase/5) — l'appelant
  ne compense jamais sur cette erreur (I4) ;
- **S3 et notifications sont hors transaction** : aucun port externe
  n'est appelé « dans » la transaction pour un effet irréversible.
  L'atomicité note + reçu (I4) s'obtient par l'ordre d'orchestration
  de `SoumettreNote` : allouer la clé, envoyer le reçu (§6), puis
  créer la note en transaction ; si la création échoue,
  `ReceiptStorage.supprimer` compense, et un échec de compensation est
  journalisé (objet orphelin), jamais masqué en succès.

## 6. Port `ReceiptStorage` (existe — à compléter)

Actuel : `src/ports/ReceiptStoragePort.ts`
(`upload(key, body, contentType)`, `getSignedUrl(key, expiresInSeconds?)`,
défaut 300 s repris par `S3ReceiptAdapter`). Il n'est branché sur
aucune route.

Évolution proposée, rétrocompatible pour l'adaptateur existant :

```ts
interface ReceiptStorage {
  upload(key: string, body: Buffer, contentType: string): Promise<void>
  getSignedUrl(key: string, expiresInSeconds?: number): Promise<string>
  supprimer(key: string): Promise<void>   // compensation I4, §5
}
```

Points de contrat :

- la clé reste au format actuel `receipts/{receipt_seq}.{ext}` :
  `receiptKey` figure dans le JSON gelé, son format ne change pas.
  La séquence est donc allouée **avant** l'upload (valeur de séquence
  réservée en base ; un trou de numérotation après échec est accepté
  et sans signification métier) — à confirmer à l'implémentation
  contre l'alternative « clé par identifiant de note », qui casserait
  le format visible ;
- `getSignedUrl` ne vérifie aucune autorisation : c'est
  `AccéderAuJustificatif` (I9) qui décide, puis demande l'URL ;
- une erreur d'`upload` est une panne d'infrastructure (§1.4) :
  `SoumettreNote` échoue sans créer de note (I4).

## 7. Erreurs typées (domaine) et traduction HTTP

Les ports renvoient `null`/`false` (§1.3) ; ce sont les **cas d'usage**
qui lèvent les erreurs métier. Un seul traducteur, dans la couche
interface, les convertit — le reste du code ne fabrique plus de
`Response` d'erreur à la main.

| Erreur typée | Sens | HTTP | Message client |
|---|---|---|---|
| `DonneesInvalides` | I1, I2, I3, tri hors liste | 400 | message actuel conservé |
| `NoteIntrouvable` | inexistante ou hors `peutConsulter` | 404 | `Not found` |
| `UtilisateurIntrouvable` | utilisateur absent ou hors entreprise (rattachement) | 404 | `Not found` |
| `AccesRefuse` | rôle insuffisant (jamais de détail métier) | 403 | `Unauthorized` |
| `DejaTranchee` | I6 | 409 | `Already decided` (gelé) |
| `ManagerIneligible` | I11, I13 | 409 | `Invalid manager` (gelé) |
| `CycleHierarchique` | I12 | 409 | `Cycle hiérarchique détecté` |
| Panne d'infrastructure | port en échec | 500 | `error` générique, **sans stack** |

Deux règles héritées des constats : `404` plutôt que `403` quand
révéler l'existence serait une fuite (notes d'autrui) ; les détails
techniques (stack, cause) vont dans les logs serveur uniquement.

## 8. Port `AnalyseurDeReçu` (nouveau)

Rôle : suggérer montant et date depuis un justificatif, derrière une
interface remplaçable (Tesseract aujourd'hui, moteur IA demain —
préparation de la feature IA sans toucher au métier).

```ts
interface AnalyseurDeRecu {
  analyser(entree: {
    data: Buffer
    mimeType: string
    signal?: AbortSignal   // annulation réelle (revue phase/5, F7)
  }): Promise<SuggestionRecu>
}

interface SuggestionRecu {
  amount?: number        // correspond au contrat gelé C03
  expenseDate?: string   // YYYY-MM-DD
}
```

Contrat :

- **jamais d'exception pour un reçu illisible ou un type non pris en
  charge** : renvoyer `{}` (comportement actuel de `lib/ocr`, contrat
  client C03 : une réponse vide est valide) ;
- exception réservée à la panne du moteur ; `SuggérerChamps` la
  traduit en `{}` journalisé, comme aujourd'hui — le client ne voit
  pas la différence ;
- le **gabarit** est une règle du domaine (`src/domain/Justificatif.ts`,
  `horsGabaritSuggestion`), pas de l'adaptateur : types image acceptés
  (png/jpeg/webp, pas le PDF), taille ≤ 10 Mio alignée sur I3,
  vérifiés sur les métadonnées avant lecture des octets (revue
  phase/5, F7). Le délai de 15 s avec annulation réelle reste dans le
  cas d'usage, le plafond de concurrence dans l'adaptateur
  (saturation → `{}`) : ce sont des bornes techniques ;
- extension future sans rupture : des champs optionnels (score de
  confiance, moteur utilisé) pourront enrichir `SuggestionRecu` côté
  serveur ; seuls `amount` et `expenseDate` traversent vers le client
  tant que le contrat gelé n'est pas amendé.

## 9. Port `NotificateurDeDecision` (existe sous une forme pauvre)

Actuel : `NotificationPort.notifyDecision(userId, noteId, decision)`,
adaptateur console, jamais appelé. Il ne porte ni l'auteur de la
décision, ni sa date, ni le motif — insuffisant pour ADR-DOMAIN-002.

Évolution proposée (interne uniquement, aucun impact client) :

```ts
interface NoteTranchee {
  noteId: string
  auteurId: string        // destinataire : l'auteur de la note
  decision: Decision
  decidedBy: string
  decidedAt: Date
  motif: string | null
}

interface NotificateurDeDecision {
  notifierDecision(evenement: NoteTranchee): Promise<void>
}
```

Contrat :

- appelé **après** le commit de `TrancherNote` ; un échec de
  notification ne fait jamais échouer la décision déjà persistée —
  il est journalisé (le passage à un envoi asynchrone fiable, file et
  reprises, est une évolution ultérieure hors de ce contrat) ;
- l'événement contient de quoi rendre l'envoi idempotent demain :
  `noteId` + décision finale (unique par I6) ;
- l'ancien `notifyDecision(userId, noteId, decision)` est remplacé,
  pas conservé en parallèle : un seul contrat de notification.

## 10. Assemblage (point de composition unique)

Les propositions exigent « un point unique où les dépendances sont
assemblées ». Contrat minimal attendu de ce point :

- il construit, par requête ou au démarrage selon l'adaptateur, le
  graphe : cas d'usage → ports → adaptateurs (repositories
  PostgreSQL, `S3ReceiptAdapter`, adaptateur Tesseract, notificateur
  console) ;
- les routes et Server Actions ne connaissent que les cas d'usage et
  le traducteur d'erreurs (§7) ; aucun `new`, aucun import
  d'adaptateur ailleurs — à la seule exception de la racine de
  composition `src/lib/container.ts`, seul module autorisé à
  importer `@/adapters/*` (dérogation documentée par l'amendement
  ADR-ARCH-001 du 2026-10-24, revues phase/1) ;
- les tests de cas d'usage substituent des adaptateurs en mémoire aux
  mêmes interfaces, sans base ni S3 (niveau **A** du registre des
  invariants).

## 11. Validations d'équipe — traitées le 2026-10-19

1. **`OrdreTri` figé** : les 6 tris du §2 (création, date de dépense,
   montant, ascendant/descendant), défaut inchangé `created_at_desc`.
2. **Clé de reçu** : la séquence est réservée avant l'upload (§6) ;
   le format gelé `receipts/{seq}.{ext}` est préservé et les trous de
   numérotation après échec sont acceptés sans signification métier.
3. **Bornes OCR figées** : images seules (png/jpeg/webp), 10 Mio
   maximum alignés sur I3, timeout de 15 s ; dépassement ou timeout
   produisent une suggestion vide, comme un reçu illisible.
4. **Motif de décision** : 500 caractères maximum, texte brut jamais
   interprété comme du HTML (reporté dans ADR-DOMAIN-002).
5. **Nommage des ports** : les nouveaux contrats remplacent les ports
   actuels au fil des phases — chaque phase qui branche un cas
   d'usage supprime l'ancien port dans le même diff ; aucune
   coexistence durable de deux contrats de stockage ou de
   notification.

Hors de ce document : le modèle de rôles SQL qui rend I10 réel en
base. Il est décidé et implémenté — rôle applicatif `expense_app`,
non-superutilisateur, migrations `0003` et `0005`, voir ADR-DATA-002
(`accepted`). Seul le secret de production reste à la charge du
pilote 2.
