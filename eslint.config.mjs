import { defineConfig, globalIgnores } from 'eslint/config';
import nextCoreWebVitals from 'eslint-config-next/core-web-vitals';

export default defineConfig([
  ...nextCoreWebVitals,
  {
    rules: {
      'no-unused-vars': 'off',
      'react-hooks/exhaustive-deps': 'off',
      'react-hooks/set-state-in-effect': 'off',
      'react-hooks/purity': 'off',
      'react-hooks/preserve-manual-memoization': 'off',
      'react-hooks/immutability': 'off',
      'react-hooks/static-components': 'off',
      'react-hooks/refs': 'off',
      'react-hooks/globals': 'off',
      'react-hooks/error-boundaries': 'off',
      'react-hooks/use-memo': 'off',
      'react-hooks/incompatible-library': 'off',
      'react-hooks/set-state-in-render': 'off',
      'react-hooks/unsupported-syntax': 'off',
      'react-hooks/config': 'off',
      'react-hooks/gating': 'off',
      'react/jsx-key': 'off',
      'no-undef': 'off',
      'react/no-unescaped-entities': 'off',
      'react/display-name': 'off',
      '@next/next/no-img-element': 'off',
      '@next/next/no-html-link-for-pages': 'off',
      'import/no-anonymous-default-export': 'off',
      'no-restricted-syntax': [
        'warn',
        {
          selector: "AwaitExpression[argument.callee.name='getAuthUser']",
          message: 'getAuthUser() is synchronous. Use direct assignment: const user = getAuthUser();',
        },
        {
          selector: "CatchClause[body.body.length=1][body.body.0.type='ExpressionStatement'][body.body.0.expression.callee.object.name='console']",
          message: 'Single-statement catch blocks that only log may be hiding errors. Handle the failure explicitly.',
        },
      ],
    },
  },
  {
    files: ['**/*.test.*', '__tests__/**', 'e2e/**', 'tests/**'],
    rules: {
      '@next/next/no-assign-module-variable': 'off',
    },
  },
  {
    // A CATCH THAT ONLY LOGS IS AN ERROR IN THE MODULES THAT DECIDE THINGS.
    //
    // The rule is a warning repo-wide because 55 catch blocks in bankroll
    // code alone predate it, and turning those red would either block every
    // push or invite 55 unrelated edits in one pull request.
    //
    // It is an ERROR here because these files are already clean and because
    // this is exactly where a swallowed failure costs money: on 2026-09-08 a
    // silent catch was how a receipt could be uploaded, fail to be listed,
    // and be reported as kept. New code in the receipt pipeline, the
    // entitlement gates and the CI checks cannot add another one.
    files: [
      'src/lib/bankroll/receipt*',
      'src/lib/gates/**',
      'scripts/ci/**',
    ],
    rules: {
      'no-restricted-syntax': [
        'error',
        {
          selector: "AwaitExpression[argument.callee.name='getAuthUser']",
          message: 'getAuthUser() is synchronous. Use direct assignment: const user = getAuthUser();',
        },
        {
          selector: "CatchClause[body.body.length=1][body.body.0.type='ExpressionStatement'][body.body.0.expression.callee.object.name='console']",
          message: 'Single-statement catch blocks that only log may be hiding errors. Handle the failure explicitly.',
        },
      ],
    },
  },
  globalIgnores([
    '.next/**',
    'coverage/**',
    'node_modules/**',
    'out/**',
    'playwright-report/**',
    'public/**',
    'test-results/**',
  ]),
]);
