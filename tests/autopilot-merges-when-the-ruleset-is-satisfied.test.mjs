/**
 * LAW: autopilot merges a pull request the ruleset would merge.
 *
 * Added 2026-09-04. `.github/scripts/queue-pr.sh` (byte-identical in seven
 * repos, enforced by estate-integrity) enables squash auto-merge, and GitHub's
 * auto-merge waits for the REQUIRED checks only. But when a PR was already
 * mergeable by the time the sweep reached it, `--auto` was refused with
 * "Pull request is in unstable status" and the script's fallback merged CLEAN
 * only - so a PR with every required check green and one OPTIONAL suite red
 * landed if autopilot got there before the checks finished, and sat open
 * forever if it got there after. World Hub #1364 sat that way: seven required
 * checks green, Global Footer E2E red, "the next sweep will look again" every
 * ten minutes with no report.
 *
 * The bar is the ruleset's, in both directions:
 *   - UNSTABLE in a repo whose base ruleset requires checks means everything
 *     required is green (a red or pending required check reports BLOCKED), so
 *     it merges - naming what was waived, never silently;
 *   - UNSTABLE in a repo with NO required checks means the only check there is
 *     has failed, so it does not merge (the original guard, kept);
 *   - a red required check is refused by GitHub on the merge call itself, and
 *     the script surfaces that instead of pretending.
 *
 * This runs the real script against a fake `gh`, so it tests what the script
 * DOES, not what its comments say.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, chmodSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const SCRIPT = join(process.cwd(), '.github', 'scripts', 'queue-pr.sh');
const scriptText = readFileSync(SCRIPT, 'utf8');

// The script asks `gh pr view --json statusCheckRollup --jq '<filter>'`. The
// fake gh evaluates THAT filter (lifted from the script, so the test follows
// the script rather than the other way round) against the scenario's rollup.
const rollupJq = (scriptText.match(/--json statusCheckRollup \\\n\s+--jq '([^']+)'/) || [])[1];

// A `gh` that answers from a scenario and records every merge it was asked to
// perform. Each scenario says: what --auto answers, what state the PR is in,
// how many checks the base ruleset requires, what the rollup holds, and
// whether GitHub accepts the direct merge.
function runScenario(s) {
  const dir = mkdtempSync(join(tmpdir(), 'queue-pr-'));
  const calls = join(dir, 'calls.log');
  writeFileSync(join(dir, 'rollup.json'), JSON.stringify({ statusCheckRollup: s.rollup }));
  writeFileSync(join(dir, 'filter.jq'), rollupJq || '.');
  const gh = `#!/usr/bin/env bash
echo "$*" >> "${calls}"
case "$*" in
  *"--squash --auto"*) echo "${s.autoAnswer}"; exit ${s.autoExit} ;;
  *"--json mergeStateStatus"*) echo "${s.state}"; exit 0 ;;
  *"--json baseRefName"*) echo "main"; exit 0 ;;
  *"rules/branches/main"*) echo "${s.requiredCount}"; exit 0 ;;
  *"--json statusCheckRollup"*) jq -r -f "${dir}/filter.jq" "${dir}/rollup.json"; exit 0 ;;
  *"--squash"*) echo "${s.mergeAnswer}"; exit ${s.mergeExit} ;;
esac
echo "unexpected gh call: $*" >&2; exit 99
`;
  writeFileSync(join(dir, 'gh'), gh);
  chmodSync(join(dir, 'gh'), 0o755);
  const res = spawnSync('bash', [SCRIPT, 'Smarter-Poker/example', '1364'], {
    env: { ...process.env, PATH: `${dir}:${process.env.PATH}` },
    encoding: 'utf8',
  });
  let log = '';
  try { log = readFileSync(calls, 'utf8'); } catch (_) { /* no gh call at all */ }
  rmSync(dir, { recursive: true, force: true });
  const merges = log.split('\n').filter((l) => /--squash$/.test(l.trim())).length;
  return { out: `${res.stdout}${res.stderr}`, status: res.status, merges };
}

const GREEN = { name: 'TypeScript Check', conclusion: 'SUCCESS' };
const OPTIONAL_RED = { name: 'Global Footer E2E', conclusion: 'FAILURE' };

test('the script reads the not-green checks with a filter this test can lift', () => {
  assert.ok(rollupJq, 'queue-pr.sh must ask statusCheckRollup with a --jq filter on the continuation line');
});

test('UNSTABLE with required checks green and an optional suite red MERGES, naming the waiver', () => {
  const r = runScenario({
    autoAnswer: 'X Pull request Pull request is in unstable status',
    autoExit: 1,
    state: 'UNSTABLE',
    requiredCount: 7,
    rollup: [GREEN, OPTIONAL_RED],
    mergeAnswer: 'Merged pull request #1364',
    mergeExit: 0,
  });
  assert.equal(r.merges, 1, `expected exactly one direct squash merge\n${r.out}`);
  assert.match(r.out, /merged #1364 directly/);
  assert.match(r.out, /not green and not required: .*Global Footer E2E/, 'the waived suite must be named in the log');
  assert.doesNotMatch(r.out, /::warning::/);
  assert.equal(r.status, 0);
});

test('UNSTABLE in a repo whose base requires NO checks does not merge', () => {
  const r = runScenario({
    autoAnswer: 'X Pull request Branch does not have required protected branch rules',
    autoExit: 1,
    state: 'UNSTABLE',
    requiredCount: 0,
    rollup: [OPTIONAL_RED],
    mergeAnswer: 'should never be called',
    mergeExit: 0,
  });
  assert.equal(r.merges, 0, `must not merge when the only check there is has failed\n${r.out}`);
  assert.match(r.out, /requires no checks/);
  assert.equal(r.status, 0);
});

test('a red REQUIRED check is refused by GitHub on the merge call and the script says so', () => {
  const r = runScenario({
    autoAnswer: 'X Pull request Pull request is in unstable status',
    autoExit: 1,
    state: 'UNSTABLE',
    requiredCount: 7,
    rollup: [{ name: 'TypeScript Check', conclusion: 'FAILURE' }],
    mergeAnswer: 'X Pull request is not mergeable: Required status check TypeScript Check is failing. (HTTP 405)',
    mergeExit: 1,
  });
  assert.equal(r.merges, 1, 'the merge is attempted once and GitHub is the authority');
  assert.doesNotMatch(r.out, /merged #1364 directly/);
  assert.match(r.out, /::warning::#1364 could not be queued yet/);
  assert.equal(r.status, 0, 'a refused merge never fails the sweep');
});

test('CLEAN still merges directly, and every merge is a squash with no --admin', () => {
  const r = runScenario({
    autoAnswer: 'X Pull request Pull request is in clean status',
    autoExit: 1,
    state: 'CLEAN',
    requiredCount: 7,
    rollup: [GREEN],
    mergeAnswer: 'Merged pull request #1364',
    mergeExit: 0,
  });
  assert.equal(r.merges, 1);
  assert.match(r.out, /merged #1364 directly/);
  // The header comments NAME the forbidden flags in order to forbid them, so
  // judge the code, not the commentary.
  const code = scriptText.split('\n').filter((l) => !/^\s*#/.test(l)).join('\n');
  assert.doesNotMatch(code, /gh pr merge[^\n]*--(merge|rebase)\b/, 'squash only - merge commits and rebase merges are disabled');
  assert.doesNotMatch(code, /--admin/, 'never --admin: it bypasses required checks');
});
