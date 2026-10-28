# Politique de sécurité

## Signaler une vulnérabilité

Signalement privé via GitHub : [ouvrir un avis de sécurité privé](https://github.com/Erwen-Beauvinon/expense-io-IPv6/security/advisories/new)
(dépôt → Security → Advisories). Ne pas ouvrir d'issue publique contenant
une vulnérabilité, un identifiant ou un exploit.

## Périmètre

Application de notes de frais manipulant des données personnelles (noms,
emails, montants, justificatifs). Composants sensibles : authentification
(`src/lib/auth.ts`), isolation des données (`migrations/`, `src/lib/db.ts`),
stockage des reçus (`src/lib/storage.ts`).

## Checks configurés et leurs limites

| Check | Configuration | Portée |
|---|---|---|
| Revue des dépendances | `.github/workflows/security.yml` | PR uniquement, échec à partir de `moderate` |
| Détection de secrets | `.github/workflows/security.yml` (gitleaks) | Tout l'historique, push et PR sur `main` |
| Frontières client/serveur | `eslint.config.mjs`, `make lint` | Empêche un composant client d'importer `@/lib` |

Ce sont des déclarations : leur exécution sur GitHub, les checks obligatoires
et la revue CODEOWNERS doivent être vérifiés à part. Aucun check ne prouve
l'absence de secret ou de vulnérabilité.

## Identifiants

`.env` est ignoré ; `.env.example` ne contient que des valeurs locales
d'exemple. Un identifiant exposé doit être révoqué ou changé ; supprimer le
fichier ne le révoque pas. Les comptes de démonstration du seed ne sont
destinés qu'au développement local.

**Ancien secret JWT (historique de `main`) : considéré comme révoqué.**
Une valeur par défaut a existé dans le code avant la phase 0 ; elle reste
lisible dans l'historique Git. Elle n'est plus utilisée nulle part : le
démarrage refuse toute valeur d'exemple ou de moins de 32 caractères, et
les sessions signées avec elle ne sont pas acceptées. Tout déploiement
doit générer son propre `AUTH_SECRET` (`make env`).
