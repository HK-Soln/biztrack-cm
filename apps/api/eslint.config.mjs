import { config } from "@biztrack/eslint-config/base"

/** @type {import("eslint").Linter.Config} */
export default [
  ...config,
  {
    // nestjs-i18n emits src/generated/i18n.generated.ts with a `DO NOT EDIT` header
    // and its own blanket `/* eslint-disable */`. Linting it only produces an
    // "unused eslint-disable directive" warning, so ignore generated output entirely.
    ignores: ["src/generated/**"],
  },
]
