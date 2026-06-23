import js from "@eslint/js";
import globals from "globals";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";
import reactX from "eslint-plugin-react-x";
import reactDom from "eslint-plugin-react-dom";
import tseslint from "typescript-eslint";
import eslintConfigPrettier from "eslint-config-prettier/flat";
import { defineConfig, globalIgnores } from "eslint/config";

export default defineConfig([
  globalIgnores(["dist"]),
  {
    files: ["**/*.{ts,tsx}"],
    extends: [
      js.configs.recommended,
      // Type-aware linting: strict for correctness, stylistic for consistency.
      // The *TypeChecked variants require type information (see parserOptions
      // below). They replace the plain `recommended` config.
      tseslint.configs.strictTypeChecked,
      tseslint.configs.stylisticTypeChecked,
      reactHooks.configs.flat.recommended,
      reactRefresh.configs.vite,
      // React-specific lint rules. Enabled now so styling is enforced from the
      // first component we write in Phase 3.
      reactX.configs["recommended-typescript"],
      reactDom.configs.recommended,
    ],
    languageOptions: {
      globals: globals.browser,
      parserOptions: {
        // Let typescript-eslint discover each file's tsconfig automatically
        // (preferred over hand-listing `project: [...]` in v8+).
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
  },
  // Must be last: turns off ESLint rules that conflict with Prettier so the
  // two tools never fight over formatting. Prettier formats; ESLint lints.
  eslintConfigPrettier,
]);
