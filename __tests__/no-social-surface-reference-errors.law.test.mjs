/**
 * THE SOCIAL SURFACE HAS NO UNDEFINED IDENTIFIERS (2026-09-08, BINDING)
 *
 * See eslint.no-undef.mjs for why this class of bug is invisible to everything
 * else in the pipeline, and for the six live ReferenceErrors one pass found.
 *
 * This law runs that config over the social surface and requires zero. It is
 * deliberately scoped: pinning the whole repo at zero would fail on day one and
 * a gate that is always red is a gate nobody reads.
 */

import assert from 'node:assert/strict';
import test from 'node:test';
import { ESLint } from 'eslint';

const PATTERNS = [
  'src/components/social/**/*.jsx',
  'src/components/social/**/*.js',
  'pages/hub/social-media/**/*.js',
  'pages/hub/social-pages/**/*.js',
];

async function run(patterns) {
  const eslint = new ESLint({
    overrideConfigFile: 'eslint.no-undef.mjs',
    ignore: false,
  });
  const results = await eslint.lintFiles(patterns);
  return results.flatMap((r) =>
    r.messages
      .filter((m) => m.ruleId === 'no-undef')
      .map((m) => `${r.filePath.replace(process.cwd() + '/', '')}:${m.line} ${m.message}`)
  );
}

test('the no-undef gate actually runs and can fail', async () => {
  // Control. If this does not report, the gate is not working and a clean
  // result below would mean nothing.
  const { writeFileSync, unlinkSync } = await import('node:fs');
  const probe = 'src/components/social/__no_undef_probe.jsx';
  writeFileSync(probe, 'export default function P(){ return <b>{deliberatelyUndefinedSymbol}</b>; }\n');
  try {
    const found = await run([probe]);
    assert.ok(
      found.some((f) => f.includes('deliberatelyUndefinedSymbol')),
      'the no-undef gate did not flag a deliberately undefined identifier - it is not running'
    );
  } finally {
    unlinkSync(probe);
  }
});

test('no file on the social surface references an undefined identifier', async () => {
  const found = await run(PATTERNS);
  assert.deepEqual(
    found,
    [],
    'these identifiers are never declared, so they throw ReferenceError at runtime:\n  ' +
      found.join('\n  ')
  );
});
