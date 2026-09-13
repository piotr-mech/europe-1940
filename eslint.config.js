/* eslint-disable @typescript-eslint/no-deprecated -- tseslint.config() is the only way to use extends; core defineConfig has incompatible API */
import { includeIgnoreFile } from "@eslint/config-helpers";
import eslint from "@eslint/js";
import eslintPluginPrettier from "eslint-plugin-prettier/recommended";
import eslintPluginAstro from "eslint-plugin-astro";
import pluginReact from "eslint-plugin-react";
import reactCompiler from "eslint-plugin-react-compiler";
import eslintPluginReactHooks from "eslint-plugin-react-hooks";
import path from "node:path";
import tseslint from "typescript-eslint";

const gitignorePath = path.resolve(import.meta.dirname, ".gitignore");

const baseConfig = tseslint.config({
  extends: [eslint.configs.recommended, tseslint.configs.strictTypeChecked, tseslint.configs.stylisticTypeChecked],
  languageOptions: {
    parserOptions: {
      projectService: true,
      tsconfigRootDir: import.meta.dirname,
    },
  },
  rules: {
    "no-console": "warn",
    "no-unused-vars": "off",
    "@typescript-eslint/no-unused-vars": [
      "error",
      {
        argsIgnorePattern: "^_",
        varsIgnorePattern: "^_",
        caughtErrorsIgnorePattern: "^_",
        destructuredArrayIgnorePattern: "^_",
        ignoreRestSiblings: true,
      },
    ],
    "@typescript-eslint/restrict-template-expressions": ["error", { allowNumber: true }],
    "@typescript-eslint/no-misused-promises": ["error", { checksVoidReturn: { attributes: false } }],
  },
});

const reactConfig = tseslint.config({
  files: ["**/*.{js,jsx,ts,tsx}"],
  extends: [pluginReact.configs.flat.recommended],
  languageOptions: {
    ...pluginReact.configs.flat.recommended.languageOptions,
    globals: {
      window: true,
      document: true,
    },
  },
  plugins: {
    "react-hooks": eslintPluginReactHooks,
    "react-compiler": reactCompiler,
  },
  settings: { react: { version: "detect" } },
  rules: {
    ...eslintPluginReactHooks.configs.recommended.rules,
    "react/react-in-jsx-scope": "off",
    "react-compiler/react-compiler": "error",
  },
});

const astroConfig = tseslint.config({
  files: ["**/*.astro"],
  rules: {
    "astro/no-set-html-directive": "error",
    "astro/no-unused-css-selector": "warn",
    "astro/prefer-class-list-directive": "warn",
  },
});

/**
 * The reducer-path (engine) modules — the closed set the determinism rule
 * guards (test-plan §5, risk #5). Adding a module to the reducer path means
 * adding it here, consciously. Exported so the self-verification test
 * (src/lib/determinism-rule.test.ts) lints exactly this scope — the rule and
 * its verification cannot diverge.
 */
export const DETERMINISM_ENGINE_FILES = [
  "src/lib/game-state.ts",
  "src/lib/battle.ts",
  "src/lib/ai.ts",
  "src/lib/movement.ts",
  "src/lib/production.ts",
  "src/lib/supply.ts",
  "src/lib/victory.ts",
  "src/data/map.ts",
  "src/data/terrain.ts",
  "src/data/units.ts",
  "src/data/countries.ts",
  "src/types.ts",
];

const DETERMINISM_MESSAGE =
  "Determinism contract (test-plan §5): no wall-clock or unseeded randomness in the reducer path — thread state.rngSeed instead.";

const determinismConfig = tseslint.config({
  files: DETERMINISM_ENGINE_FILES,
  rules: {
    "no-restricted-properties": [
      "error",
      { object: "Date", property: "now", message: DETERMINISM_MESSAGE },
      { object: "Math", property: "random", message: DETERMINISM_MESSAGE },
      { object: "performance", property: "now", message: DETERMINISM_MESSAGE },
      { object: "crypto", property: "randomUUID", message: DETERMINISM_MESSAGE },
      { object: "crypto", property: "getRandomValues", message: DETERMINISM_MESSAGE },
    ],
    "no-restricted-syntax": [
      "error",
      {
        selector: "NewExpression[callee.type='Identifier'][callee.name='Date']",
        message: DETERMINISM_MESSAGE,
      },
    ],
  },
});

export default tseslint.config(
  includeIgnoreFile(gitignorePath),
  baseConfig,
  reactConfig,
  eslintPluginAstro.configs["flat/recommended"],
  ...eslintPluginAstro.configs["flat/jsx-a11y-recommended"],
  astroConfig,
  determinismConfig,
  eslintPluginPrettier,
);
