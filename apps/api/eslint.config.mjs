import { config } from '@biztrack/eslint-config/base'

/** @type {import("eslint").Linter.Config} */
export default [
  ...config,
  {
    // nestjs-i18n emits src/generated/i18n.generated.ts with a `DO NOT EDIT` header
    // and its own blanket `/* eslint-disable */`. Linting it only produces an
    // "unused eslint-disable directive" warning, so ignore generated output entirely.
    ignores: ['src/generated/**'],
  },
  {
    // App code must use the injectable Logger, never console — a stray console.log can leak
    // secrets to stdout, bypassing the logger's redaction (Spec 07).
    rules: { 'no-console': 'error' },
  },
  {
    // Seed scripts and standalone CLI scripts are terminal tools that print progress to stdout —
    // console is expected there, not the injectable Logger.
    files: ['src/database/seeds/**', 'scripts/**'],
    rules: { 'no-console': 'off' },
  },
]
