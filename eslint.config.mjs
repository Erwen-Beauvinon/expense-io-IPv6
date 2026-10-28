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

// Modules Node intégrés, formes `node:` et bare confondues : une couche pure
// ne doit pas plus importer `node:fs` ou `fs` que `pg`.
const NODE_BUILTINS = [
  "node:*",
  "fs",
  "fs/*",
  "path",
  "path/*",
  "os",
  "crypto",
  "crypto/*",
  "util",
  "stream",
  "stream/*",
  "events",
  "buffer",
  "url",
  "http",
  "https",
  "net",
  "child_process",
  "worker_threads",
];

// Imports relatifs qui remontent vers une couche donnée, à 1, 2 ou 3 niveaux :
// `../lib/db` contournait les groupes `@/...` ci-dessus.
const relativeTo = (name) =>
  [1, 2, 3].flatMap((depth) => {
    const up = "../".repeat(depth);
    return [`${up}${name}`, `${up}${name}/*`];
  });

function layer(files, forbidden, why, dynamicForbidden) {
  const rules = {
    "no-restricted-imports": [
      "error",
      { patterns: [{ group: forbidden, message: `ADR-ARCH-001: ${why}` }] },
    ],
  };
  // `import()` dynamique échappe à no-restricted-imports : même interdiction,
  // appliquée à la valeur de la source.
  if (dynamicForbidden) {
    rules["no-restricted-syntax"] = [
      "error",
      {
        selector: `ImportExpression[source.value=/${dynamicForbidden}/]`,
        message: `ADR-ARCH-001: ${why}`,
      },
    ];
  }
  return { files, rules };
}

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  layer(
    ["src/domain/**"],
    [...ALL_LAYERS, "@/utils", "@/utils/*", "../*", ...INFRA_PACKAGES, ...NODE_BUILTINS],
    "le domaine est pur — aucune dépendance applicative ni d'infrastructure.",
    "^(\\.\\.\\/|@\\/|[^.])"
  ),
  layer(
    ["src/ports/**"],
    [
      "@/lib",
      "@/lib/*",
      "@/adapters",
      "@/adapters/*",
      "@/app",
      "@/app/*",
      "@/components",
      "@/components/*",
      "../*",
      ...INFRA_PACKAGES,
      ...NODE_BUILTINS,
    ],
    "un port ne dépend que du domaine.",
    "^(\\.\\.\\/|@\\/(lib|adapters|app|components)(\\/|$)|@[^\\/]|[^.@])"
  ),
  layer(
    ["src/utils/**"],
    [...ALL_LAYERS, "@/domain", "@/domain/*", "../*", ...INFRA_PACKAGES, ...NODE_BUILTINS],
    "les utilitaires sont purs et partagés client/serveur.",
    "^(\\.\\.\\/|@\\/|[^.])"
  ),
  layer(
    ["src/adapters/**", "src/lib/**"],
    ["@/app", "@/app/*", "@/components", "@/components/*", ...relativeTo("app"), ...relativeTo("components")],
    "l'infrastructure ne dépend pas de la couche Next.js.",
    "^(@\\/(app|components)(\\/|$)|(\\.\\.\\/)+(app|components)(\\/|$))"
  ),
  layer(
    ["src/components/**"],
    [
      "@/lib",
      "@/lib/*",
      "@/adapters",
      "@/adapters/*",
      ...relativeTo("lib"),
      ...relativeTo("adapters"),
      "pg",
      "@aws-sdk/*",
      "bcryptjs",
      ...NODE_BUILTINS,
    ],
    "un composant client n'importe pas de code serveur (DB, S3, secrets).",
    "^(@\\/(lib|adapters)(\\/|$)|(\\.\\.\\/)+(lib|adapters)(\\/|$)|^(pg|bcryptjs)$|^@aws-sdk\\/|^(node:)?(fs|path|os|crypto|child_process)(\\/|$))"
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
