import js from "@eslint/js"
import eslintConfigPrettier from "eslint-config-prettier"
import onlyWarn from "eslint-plugin-only-warn"
import turboPlugin from "eslint-plugin-turbo"
import globals from "globals"
import tseslint from "typescript-eslint"

/**
 * A shared ESLint configuration for the repository.
 *
 * @type {import("eslint").Linter.Config}
 * */
export const config = [
  js.configs.recommended,
  eslintConfigPrettier,
  ...tseslint.configs.recommended,
  {
    // Base packages run on Node (API, utils, scripts, config files). Without this,
    // `process`, `console`, `Buffer`, `__dirname`, etc. trip `no-undef`. Browser
    // configs (react-internal) layer browser globals on top of this.
    languageOptions: {
      globals: {
        ...globals.node,
      },
    },
  },
  {
    plugins: {
      turbo: turboPlugin,
    },
    rules: {
      "turbo/no-undeclared-env-vars": "warn",
    },
  },
  {
    plugins: {
      onlyWarn,
    },
  },
  {
    ignores: [
      "dist/**",
      "**/__tests__/**",
      "**/*.spec.*",
      "**/*.test.*",
      "**/*.specs.*",
      "**/*.mock.*",
      "**/test/**",
      "**/tests/**",
    ],
  },
]
