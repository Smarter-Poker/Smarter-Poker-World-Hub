#!/usr/bin/env node
/**
 * check-undefined-identifiers — fail the build on NEW `no-undef` violations
 * ═══════════════════════════════════════════════════════════════════════════
 * WHY THIS EXISTS
 *
 * .eslintrc.json has `"no-undef": "off"`. On 2026-08-19 that let two separate
 * undefined identifiers reach production in one day:
 *
 *   pages/hub/messenger.js:3516  'enablePushNotifications' is not defined
 *       Passed as a prop to PushPromptModal. Reading an undefined identifier
 *       throws during render, HubErrorBoundary caught it, and the messenger
 *       rendered "Messenger Temporarily Unavailable" for two days -- including
 *       inside the Club Arena iframe. Nobody could find it because the only
 *       reporting path was a Sentry SDK with no DSN.
 *
 *   src/contexts/ActiveIdentityContext.jsx  'useRouter' is not defined
 *       A missing import. esbuild parsed the file happily -- a parser has no
 *       opinion about whether an identifier RESOLVES -- so it reached CI, broke
 *       the Vercel build, and blocked a security fix from deploying.
 *
 * Both are caught by one rule in about twenty seconds.
 *
 * WHY A BASELINE RATHER THAN JUST TURNING THE RULE ON
 *
 * Turning `no-undef` on repo-wide today reports 175 violations across 47 files
 * -- real ones, after browser/node/test globals are supplied. Every one is a
 * latent ReferenceError, but fixing 175 in one commit is not reviewable, and a
 * red gate that nobody can turn green gets bypassed and then ignored.
 *
 * So: the existing 175 are recorded in undefined-identifiers-baseline.json and
 * tolerated. Anything NOT in that file fails the build. The baseline may only
 * shrink -- if a count drops the script tells you to update it, and if a file
 * disappears entirely its entries are dropped.
 *
 * The baseline is keyed on file + identifier, NOT line number, so moving code
 * around does not churn it.
 *
 * USAGE
 *   node scripts/ci/check-undefined-identifiers.mjs            # check
 *   node scripts/ci/check-undefined-identifiers.mjs --update   # rewrite baseline
 * ═══════════════════════════════════════════════════════════════════════════
 */

import { ESLint } from 'eslint';
import tsParser from '@typescript-eslint/parser';
import globals from 'globals';
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, relative } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(HERE, '..', '..');
const BASELINE_PATH = join(HERE, 'undefined-identifiers-baseline.json');
const TARGETS = ['pages', 'src'];

const overrideConfig = [
  {
    files: ['**/*.js', '**/*.jsx'],
    languageOptions: {
      parser: tsParser,
      ecmaVersion: 2023,
      sourceType: 'module',
      parserOptions: { ecmaFeatures: { jsx: true } },
      globals: {
        ...globals.browser,
        ...globals.node,
        ...globals.es2021,
        ...globals.serviceworker,
        React: 'readonly',
        JSX: 'readonly',
        // Test runners: specs live alongside source in this repo.
        describe: 'readonly', it: 'readonly', test: 'readonly', expect: 'readonly',
        beforeEach: 'readonly', afterEach: 'readonly', beforeAll: 'readonly',
        afterAll: 'readonly', vi: 'readonly', jest: 'readonly',
        // OpenCV, loaded from a <script> tag by the card-scanner.
        cv: 'readonly',
      },
    },
    linterOptions: { reportUnusedDisableDirectives: false },
    rules: { 'no-undef': 'error' },
  },
];

const eslint = new ESLint({
  cwd: REPO_ROOT,
  overrideConfigFile: true, // ignore .eslintrc.json, which switches no-undef off
  overrideConfig,
  errorOnUnmatchedPattern: false,
});

const results = await eslint.lintFiles(TARGETS);

/** file::identifier -> count */
const current = {};
for (const file of results) {
  const rel = relative(REPO_ROOT, file.filePath);
  for (const msg of file.messages) {
    if (msg.ruleId !== 'no-undef') continue;
    const name = (msg.message.match(/'([^']+)'/) || [])[1] || '?';
    const key = `${rel}::${name}`;
    current[key] = (current[key] || 0) + 1;
  }
}

const total = Object.values(current).reduce((a, b) => a + b, 0);

if (process.argv.includes('--update')) {
  const sorted = Object.fromEntries(Object.entries(current).sort(([a], [b]) => a.localeCompare(b)));
  writeFileSync(
    BASELINE_PATH,
    `${JSON.stringify(
      {
        generated_against: process.env.GITHUB_SHA || 'local',
        note: 'Pre-existing no-undef violations. This file may only SHRINK. See scripts/ci/check-undefined-identifiers.mjs.',
        violations: sorted,
      },
      null,
      2
    )}\n`
  );
  console.log(`baseline updated: ${Object.keys(sorted).length} pairs, ${total} violations`);
  process.exit(0);
}

const baseline = JSON.parse(readFileSync(BASELINE_PATH, 'utf8')).violations || {};

const added = [];
const grown = [];
for (const [key, count] of Object.entries(current)) {
  const allowed = baseline[key] || 0;
  if (allowed === 0) added.push({ key, count });
  else if (count > allowed) grown.push({ key, count, allowed });
}

const fixed = Object.entries(baseline).filter(([k, v]) => (current[k] || 0) < v);

if (added.length === 0 && grown.length === 0) {
  console.log(
    `check-undefined-identifiers: no new undefined identifiers. ` +
      `${total} pre-existing (baseline allows ${Object.values(baseline).reduce((a, b) => a + b, 0)}).`
  );
  if (fixed.length > 0) {
    console.log('');
    console.log(`${fixed.length} baseline entr${fixed.length === 1 ? 'y is' : 'ies are'} now cleaner than recorded.`);
    console.log('Run `node scripts/ci/check-undefined-identifiers.mjs --update` and commit, so the');
    console.log('baseline cannot drift back up silently:');
    for (const [k, was] of fixed.slice(0, 20)) console.log(`  ${k}  ${was} -> ${current[k] || 0}`);
  }
  process.exit(0);
}

console.error('');
console.error('NEW UNDEFINED IDENTIFIER');
console.error('========================');
console.error('');
console.error('An identifier below is read but never declared, imported or supplied as a');
console.error('global. At runtime that is a ReferenceError. If it is reached during render,');
console.error('the whole section dies behind an error boundary -- which is exactly how the');
console.error('messenger was down for two days on 2026-08-19.');
console.error('');

for (const { key, count } of added) {
  const [file, name] = key.split('::');
  console.error(`  ${name}  (${count}x)`);
  console.error(`    ${file}`);
  console.error('');
}
for (const { key, count, allowed } of grown) {
  const [file, name] = key.split('::');
  console.error(`  ${name}  (${count}x, was ${allowed})`);
  console.error(`    ${file}`);
  console.error('');
}

console.error('Fix it: import it, declare it, or -- if it is a genuine runtime global this');
console.error('check does not know about -- add it to the globals map in');
console.error('scripts/ci/check-undefined-identifiers.mjs.');
console.error('');
console.error('Do NOT add it to the baseline. The baseline is a record of debt that predates');
console.error('this check, and it may only shrink.');
console.error('');
process.exit(1);
