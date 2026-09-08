// ----------------------------------------------------------------------------
// main IS ACTUALLY GATED (law, 2026-09-08)
//
// scripts/check-branch-protection.mjs:31 names exactly one required status
// check on main:
//
//     const REQUIRED_CHECK = 'Audit-marker registry vs. tree';
//
// On 2026-09-08 that check was measured and found to be structurally incapable
// of failing. .github/audit-markers.txt was 1,426 lines: 129 blank, 1,297
// comments, and ZERO tokens. audit-marker-guard.yml read it, printed
// "Registry has no tokens - guard is a no-op", ran no greps, and exited 0.
//
// So main was gated by a green light nobody had looked behind, and had been
// long enough that no one remembered the registry was meant to hold anything.
// That is worse than an ungated main, because an ungated main is at least
// honest about it.
//
// These assertions make the vacuous state impossible to return to quietly.
// ----------------------------------------------------------------------------

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(join(ROOT, p), 'utf8');

// The workflow's own reader, reimplemented exactly: strip CR, drop blank and
// comment lines, trim. If this ever disagrees with the YAML, the test is wrong.
const liveTokens = () =>
  read('.github/audit-markers.txt')
    .replace(/\r/g, '')
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith('#'));

test('the required check on main has something to check', () => {
  const tokens = liveTokens();
  assert.ok(
    tokens.length > 0,
    'audit-markers.txt has no live tokens, so "Audit-marker registry vs. tree" ' +
      'cannot fail - and it is the ONLY required check on main. Either add ' +
      'tokens, or retire the workflow AND remove it from ' +
      'scripts/check-branch-protection.mjs. Do not leave main gated by nothing.'
  );
  assert.ok(
    tokens.length >= 50,
    `only ${tokens.length} live tokens. 127 were seeded on 2026-09-08 after ` +
      `verifying each one against the tracked tree; a large drop means markers ` +
      `were commented out rather than fixed.`
  );
});

test('every live token is a legal token', () => {
  for (const t of liveTokens()) {
    assert.match(
      t,
      /^[A-Za-z0-9._-]+$/,
      `"${t}" would fail the workflow's own format check and abort the job`
    );
  }
});

test('the guard fails an empty registry instead of passing it', () => {
  const yml = read('.github/workflows/audit-marker-guard.yml');
  const emptyBranch = yml.slice(
    yml.indexOf('if [ "${#TOKENS[@]}" -eq 0 ]'),
    yml.indexOf('Checking ${#TOKENS[@]} registered')
  );
  assert.ok(emptyBranch.length > 0, 'could not find the empty-registry branch');
  assert.match(
    emptyBranch,
    /exit 1/,
    'an empty registry must FAIL. It exited 0 with a ::warning:: until ' +
      '2026-09-08, which is exactly how main ended up ungated without anyone noticing.'
  );
  assert.doesNotMatch(
    emptyBranch,
    /exit 0/,
    'the empty-registry branch still has an exit 0 path'
  );
});

test('the scan is one pass, not one git grep per token', () => {
  const yml = read('.github/workflows/audit-marker-guard.yml');
  assert.match(
    yml,
    /git grep -h -o -F -f/,
    'the scan must be a single `git grep -o -F -f` pass. Measured 2026-09-08 ' +
      'over 127 tokens and 9,900 tracked files: 41.0s for one grep per token, ' +
      '1.6s for one pass, byte-identical result. This job is on the merge ' +
      'critical path of every pull request, which is the only reason a ' +
      'registry this size is affordable.'
  );
  assert.doesNotMatch(
    yml,
    /for TOKEN in "\$\{TOKENS\[@\]\}"; do\n\s+#[^\n]*\n\s+if git grep -lF/,
    'the per-token git grep loop is back'
  );
});

test('check-branch-protection still names the check this file is about', () => {
  const mjs = read('scripts/check-branch-protection.mjs');
  assert.match(
    mjs,
    /REQUIRED_CHECK\s*=\s*'Audit-marker registry vs\. tree'/,
    'if the required check is renamed or replaced, this law needs to follow it ' +
      'to whatever now gates main'
  );
});
