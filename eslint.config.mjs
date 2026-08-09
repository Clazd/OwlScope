import coreWebVitals from "eslint-config-next/core-web-vitals";
import typescriptConfig from "eslint-config-next/typescript";

const eslintConfig = [
  ...coreWebVitals,
  ...typescriptConfig,
  {
    ignores: [".next/**", "node_modules/**", "data/**", "fixtures/**", "public/**", "scripts/**"],
  },
  {
    /*
     * Only the storage service may touch `fs` (section N: "Do not use fs
     * directly outside services/storage"). Enforced here so it stays true
     * rather than being a note in a README.
     */
    files: ["src/**/*.{ts,tsx}"],
    ignores: ["src/services/storage/**", "src/**/*.test.ts"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          paths: [
            { name: "fs", message: "Go through services/storage instead of fs." },
            { name: "node:fs", message: "Go through services/storage instead of fs." },
            { name: "fs/promises", message: "Go through services/storage instead of fs." },
            { name: "node:fs/promises", message: "Go through services/storage instead of fs." },
          ],
        },
      ],
    },
  },
];

export default eslintConfig;
