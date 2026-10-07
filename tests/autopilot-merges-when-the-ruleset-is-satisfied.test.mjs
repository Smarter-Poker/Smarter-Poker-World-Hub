/**
 * LAW: autopilot merges only what the ruleset would merge, and never around it.
 *
 * Added 2026-09-04 for the 98-line queue-pr.sh of that day, which merged an
 * UNSTABLE pull request itself after naming the optional suite it waived.
 * Rewritten 2026-10-05 when this repo converged on Club Arena's copy of
 * `.github/scripts/queue-pr.sh` (byte-identical across the estate, enforced by
 * Club Arena's estate-integrity audit; it had been red on this file since
 * 2026-09-16). The converged script keeps the two rules that have never
 * changed - SQUASH ONLY, NEVER --admin - and drops the waiver path: a pull
 * request is queued with `--auto`, and is merged directly ONLY when GitHub
 * already reports it CLEAN and the base branch still requires status checks,
 * so the server enforces the checks on the merge call. UNSTABLE is refused
 * out loud, as an error, rather than merged on a named waiver; the script no
 * longer decides for itself that a red check did not matter.
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

const RULES_WITH_CHECKS = JSON.stringify([
  { type: 'non_fast_forward' },
  { type: 'pull_request' },
  {
    type: 'required_status_checks',
    parameters: { required_status_checks: [{ context: 'TypeScript Check' }, { context: 'Build' }] },
  },
]);
const RULES_WITHOUT_CHECKS = JSON.stringify([{ type: 'non_fast_forward' }, { type: 'pull_request' }]);

// A `gh` that answers from a scenario and records every call. Each scenario
// says what the PR looks like, what `--auto` answers, what the base ruleset
// requires, and whether GitHub accepts a direct merge.
function runScenario(s) {
  const dir = mkdtempSync(join(tmpdir(), 'queue-pr-'));
  const calls = join(dir, 'calls.log');
  const view = JSON.stringify({
    state: s.state ?? 'OPEN',
    isDraft: s.draft ?? false,
    mergeStateStatus: s.mergeState ?? 'CLEAN',
    autoMergeRequest: s.armed ? { enabledAt: '2026-10-05T00:00:00Z' } : null,
    baseRefName: 'main',
  });
  writeFileSync(join(dir, 'view.json'), view);
  writeFileSync(join(dir, 'rules.json'), s.rules ?? RULES_WITH_CHECKS);
  const gh = `#!/usr/bin/env bash
echo "$*" >> "${calls}"
case "$*" in
  *"--squash --auto"*) echo "${s.autoAnswer ?? 'auto-merge armed'}"; exit ${s.autoExit ?? 0} ;;
  *"--json state,isDraft,mergeStateStatus,autoMergeRequest,baseRefName"*) cat "${dir}/view.json"; exit 0 ;;
  *"rules/branches/main"*) cat "${dir}/rules.json"; exit 0 ;;
  *"--squash"*) echo "${s.mergeAnswer ?? 'Merged pull request #1364'}"; exit ${s.mergeExit ?? 0} ;;
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
  const lines = log.split('\n').map((l) => l.trim()).filter(Boolean);
  const directMerges = lines.filter((l) => /^pr merge .* --squash$/.test(l)).length;
  const autoArms = lines.filter((l) => /--squash --auto$/.test(l)).length;
  return { out: `${res.stdout}${res.stderr}`, status: res.status, directMerges, autoArms, lines };
}

const REFUSED_CLEAN = { autoAnswer: 'X Pull request Pull request is in clean status', autoExit: 1 };
const REFUSED_UNSTABLE = { autoAnswer: 'X Pull request Pull request is in unstable status', autoExit: 1 };

test('every merge the script can make is a squash, and none of them is --admin', () => {
  // Comments may name the flag to forbid it; code may not use it.
  const code = scriptText.replace(/^\s*#.*$/gm, '');
  assert.doesNotMatch(code, /--admin/, 'the one flag that has ever put red code on main');
  const merges = scriptText.match(/gh pr merge[^\n]*/g) ?? [];
  assert.ok(merges.length > 0);
  for (const m of merges) assert.match(m, /--squash/, m);
});

test('a pull request that can be armed is queued and left to GitHub', () => {
  const r = runScenario({ mergeState: 'BLOCKED' });
  assert.equal(r.autoArms, 1, r.out);
  assert.equal(r.directMerges, 0, 'nothing is merged by hand while auto-merge will do it');
  assert.equal(r.status, 0);
});

test('CLEAN with required checks on the base merges directly, exactly once, through the server', () => {
  const r = runScenario({ ...REFUSED_CLEAN, mergeState: 'CLEAN' });
  assert.equal(r.directMerges, 1, `expected exactly one direct squash merge\n${r.out}`);
  assert.match(r.out, /Merged #1364 only after GitHub reported the protected PR clean/);
  assert.equal(r.status, 0);
});

test('CLEAN on a base that requires NO checks is refused: a direct merge there bypasses nothing because there is nothing to bypass', () => {
  const r = runScenario({ ...REFUSED_CLEAN, mergeState: 'CLEAN', rules: RULES_WITHOUT_CHECKS });
  assert.equal(r.directMerges, 0, `must not merge where no check was ever required\n${r.out}`);
  assert.match(r.out, /::error::main has no required checks; refusing a direct merge/);
  assert.equal(r.status, 1);
});

test('UNSTABLE is never merged on a waiver; it is reported as an error and the merge is not attempted', () => {
  const r = runScenario({ ...REFUSED_UNSTABLE, mergeState: 'UNSTABLE' });
  assert.equal(r.directMerges, 0, `the script may not decide a red check did not matter\n${r.out}`);
  assert.match(r.out, /::error::Could not arm protected auto-merge for #1364 \(state=UNSTABLE\)/);
  assert.equal(r.status, 1, 'a pull request that cannot be queued is a loud failure, not a warning');
});

test('a red REQUIRED check is GitHub\'s refusal, surfaced, never worked around', () => {
  const r = runScenario({
    ...REFUSED_CLEAN,
    mergeState: 'CLEAN',
    mergeAnswer: 'X Pull request is not mergeable: Required status check TypeScript Check is failing. (HTTP 405)',
    mergeExit: 1,
  });
  assert.equal(r.directMerges, 1, 'the merge is attempted once and GitHub is the authority');
  assert.doesNotMatch(r.out, /Merged #1364/);
  assert.notEqual(r.status, 0, 'a refused merge fails the step so somebody reads it');
});

test('a draft, a closed PR, or one already armed is left alone without a single merge call', () => {
  for (const s of [{ draft: true }, { state: 'MERGED' }, { armed: true }]) {
    const r = runScenario(s);
    assert.equal(r.autoArms + r.directMerges, 0, `${JSON.stringify(s)}\n${r.out}`);
    assert.equal(r.status, 0);
  }
});
