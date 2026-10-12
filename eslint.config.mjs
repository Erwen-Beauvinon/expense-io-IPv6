import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

// Frontières d'architecture (ADR-ARCH-001). Chaque couche interdit les
// couches qui ne doivent pas être visibles depuis elle. Le message porte
// l'identifiant de l'ADR : `make drill-boundaries` vérifie que c'est bien
// cette règle qui rejette une violation plantée, et pas une autre erreur.
const INFRA_PACKAGES = [
  "pg",
  "next",
  "next/*",
  "next-auth",
  "next-auth/*",
  "react",
  "react-dom",
  "@aws-sdk/*",
  "tesseract.js",
  "bcryptjs",
];

const ALL_LAYERS = ["lib", "adapters", "ports", "app", "components"].flatMap((name) => [
  `@/${name}`,
  `@/${name}/*`,
]);

function layer(files, forbidden, why) {
  return {
    files,
    rules: {
      "no-restricted-imports": [
        "error",
        { patterns: [{ group: forbidden, message: `ADR-ARCH-001: ${why}` }] },
      ],
    },
  };
}

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  layer(
    ["src/domain/**"],
    [...ALL_LAYERS, "@/utils/*", "../*", ...INFRA_PACKAGES],
    "le domaine est pur — aucune dépendance applicative ni d'infrastructure."
  ),
  layer(
    ["src/ports/**"],
    ["@/lib", "@/lib/*", "@/adapters/*", "@/app/*", "@/components/*", ...INFRA_PACKAGES],
    "un port ne dépend que du domaine."
  ),
  layer(
    ["src/utils/**"],
    [...ALL_LAYERS, "@/domain/*", "../*", ...INFRA_PACKAGES],
    "les utilitaires sont purs et partagés client/serveur."
  ),
  layer(
    ["src/adapters/**", "src/lib/**"],
    ["@/app/*", "@/components/*"],
    "l'infrastructure ne dépend pas de la couche Next.js."
  ),
  layer(
    ["src/components/**"],
    ["@/lib", "@/lib/*", "@/adapters/*", "pg", "@aws-sdk/*", "bcryptjs"],
    "un composant client n'importe pas de code serveur (DB, S3, secrets)."
  ),
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    "coverage/**",
  ]),
]);

export default eslintConfig;
