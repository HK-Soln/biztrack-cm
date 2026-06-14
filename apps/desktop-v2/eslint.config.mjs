// Skeleton lint config. Correctness for the skeleton is gated by `tsc` + `next build`;
// a fuller flat config (eslint-config-next) lands with the first feature module.
/** @type {import("eslint").Linter.Config[]} */
export default [
  {
    ignores: ['.next/**', 'dist/**', 'node_modules/**', 'next-env.d.ts'],
  },
]
