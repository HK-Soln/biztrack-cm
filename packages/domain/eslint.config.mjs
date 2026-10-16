import { config } from '@biztrack/eslint-config/base'

// @biztrack/domain is the pure business core shared by the API, the sync applier,
// desktop and mobile. It must stay free of I/O and of ambient state so the same rule
// gives the same answer in every runtime. These rules are the guard rail.
const PURITY_MESSAGE =
  '@biztrack/domain is pure: no I/O, framework or runtime imports. Only relative imports and @biztrack/types are allowed — load the state in the adapter and pass it in.'

/** @type {import("eslint").Linter.Config[]} */
export default [
  ...config,
  {
    files: ['src/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'warn',
        {
          // libphonenumber-js is the one outside import: pure and deterministic, it is how a
          // phone number is validated and normalised the same way everywhere (ruling R16).
          patterns: [
            {
              regex: '^(?![.]{1,2}/|@biztrack/types$|libphonenumber-js$)',
              message: PURITY_MESSAGE,
            },
          ],
        },
      ],
      'no-restricted-globals': [
        'warn',
        ...[
          'process',
          'Buffer',
          'require',
          '__dirname',
          '__filename',
          'fetch',
          'window',
          'document',
          'localStorage',
          'setTimeout',
          'setInterval',
          'console',
        ].map((name) => ({ name, message: PURITY_MESSAGE })),
      ],
      'no-restricted-syntax': [
        'warn',
        {
          selector: "NewExpression[callee.name='Date'][arguments.length=0]",
          message: 'No ambient clock in @biztrack/domain: take `now` as a parameter.',
        },
        {
          selector: "CallExpression[callee.object.name='Date'][callee.property.name='now']",
          message: 'No ambient clock in @biztrack/domain: take `now` as a parameter.',
        },
        {
          selector: "MemberExpression[object.name='Math'][property.name='random']",
          message: 'No randomness in @biztrack/domain: ids and random values are passed in.',
        },
      ],
    },
  },
]
