import { config } from "@biztrack/eslint-config/react-internal"

/** @type {import("eslint").Linter.Config} */
export default [
  ...config,
  {
    // Underscore-prefixed identifiers are intentionally unused (signature-required
    // params, ignored destructured values).
    rules: {
      "@typescript-eslint/no-unused-vars": [
        "warn",
        {
          argsIgnorePattern: "^_",
          varsIgnorePattern: "^_",
          caughtErrorsIgnorePattern: "^_",
        },
      ],
    },
  },
  {
    // Build artifacts + native rebuild output + CommonJS smoke-test scripts
    // (dev tooling, not app source) — never lint these.
    ignores: ["out/**", "release/**", "dist/**", ".smoke/**"],
  },
]
