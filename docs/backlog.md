# Backlog de vérification

Écarts connus entre ce que le dépôt affirme et ce qu'il prouve. Ce backlog
porte sur la vérification et le guidage des agents, pas sur les
fonctionnalités. Statuts : `open`, `partial`, `resolved`.

| # | Statut | Écart | Piste |
|---|---|---|---|
| 001 | partial | Les parcours de l'interface sont couverts par les E2E Playwright (`tests/e2e/`, job CI `e2e`). Restent non testés : les accès directs à l'API (IDOR, tri SQL, rattachement à une autre entreprise), la RLS sous un rôle non superutilisateur et les décisions concurrentes. | Tests d'intégration des routes avec deux entreprises, contre le PostgreSQL de la CI. |
| 002 | open | Les gardes 409 « Already decided » des routes ne sont couvertes par aucun drill (ADR-DOMAIN-001). | Dépend de #001. |
| 003 | open | Aucun formateur : appliquer Prettier reformaterait 13 fichiers existants. | Choisir une config, reformater en un commit dédié, ajouter `format-check` à `verify`. |
| 004 | open | `src/domain/` et `src/adapters/` ne sont pas utilisés par les routes : leurs tests ne couvrent pas le chemin réellement exécuté. | Décision d'architecture à prendre avant de brancher. |
| 005 | open | Les fonctions d'analyse OCR (`parseAmount`, `parseExpenseDate`) ne sont pas exportées, donc non testées. | Les exporter ou tester via `suggestFields` avec des images de référence. |
| 006 | partial | `next build` ne fait pas partie de `make verify`, mais le job CI `e2e` construit l'app et la teste en `next start`. | L'ajouter à `make verify` si le temps local le permet. |
| 007 | open | CODEOWNERS contient des équipes fictives ; protection de branche non configurée. | Renseigner de vrais handles et activer les revues obligatoires. |
| 008 | resolved | Le workflow `security.yml` a tourné sur la PR d'intégration (2026-10-22) : dependency-review et gitleaks verts sur l'historique. | — |
| 009 | open | L'audit `ai-ready audit` ne détecte que import-linter (Python) : les frontières ESLint y restent `unknown` alors qu'elles sont démontrées par drill. | Limite du toolkit amont. |
| 010 | open | Aucune mesure comparative de performance des agents. | Protocole `benchmarks/` d'ai-ready-repo. |
| 011 | open | Seul le type MIME déclaré par le client est contrôlé (audit A : « MIME déclaré seulement ») : un contenu réel différent du type annoncé n'est pas détecté, ni à la soumission ni à la suggestion. | Contrôle du contenu (signature magique) avant traitement ; hors propositions, à arbitrer. |
| 012 | open | E-mails non normalisés : `A@x.fr` et `a@x.fr` créent deux comptes (revue phase/7). Le domaine est déjà en minuscules, le reste de l'adresse ne l'est pas. | Normaliser (minuscules + trim) avant contrôle et écriture ; vérifier le contrat client avant. |
