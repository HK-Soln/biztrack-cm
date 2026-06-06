import { config } from "@biztrack/eslint-config/react-internal"

/** @type {import("eslint").Linter.Config[]} */
export default [
  ...config,
  {
    ignores: [
      "**/dist/**",
      "**/.expo/**",
      "**/node_modules/**",
      "babel.config.js",
      "metro.config.js",
      "tailwind.config.js",
      "theme.js",
      "expo-router.plugin.js",
    ],
  },
]
