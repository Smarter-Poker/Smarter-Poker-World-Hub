/**
 * LAW-SHAPED GUARD: a skipped run is not a green run.
 * ═══════════════════════════════════════════════════════════════════════════
 * `scripts/ci/check-main-is-green.mjs` is the estate's answer to "a check that
 * is red on main and blocks nobody stops being a check". It scans every repo's
 * `main`, keeps the newest run per workflow, and alarms when that run failed.
 *
 * It read `status=completed`, and completed INCLUDES `skipped` and `cancelled`.
 * Its own green line said the quiet part:
 *
 *     "every workflow's latest run on main is green or neutral."
 *
 * Neutral was counted as health. Measured 2026-09-09:
 *
 *   - Club Arena's `Post-Deploy E2E (production)` - the only suite that looks
 *     at the LIVE site after a publish - had failed 24 times in 21 hours with
 *     no success, and had never been named. 46 runs in a 300-run window, 7
 *     verdicts, all 7 failures, newest run `cancelled`.
 *   - This repo's `Push Delivery Watchdog` was hidden the same way.
 *   - `E2E Tests (Playwright)` was reported as a FRESH transient while being
 *     12 consecutive failed verdicts over 16 hours, because the consecutive
 *     walk `break`s on any non-failure and one `cancelled` reset its clock.
 *
 * An event-driven workflow interleaves no-ops with verdicts by construction, so
 * this is structural, not a tuning problem.
 *
 * The rule: only `success`, `failure`, `timed_out` and `startup_failure` are
 * evidence. Everything else is stepped over. No verdict at all is a question,
 * not an alarm.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const CHECKER = join(ROOT, 'scripts/ci/check-main-is-green.mjs');

const { BAD_CONCLUSIONS, classifyWorkflow, redWorkflows, verdictRuns } = await import(
  '../scripts/ci/lib/workflowVerdicts.mjs'
);

const NOW = Date.parse('2026-09-09T12:00:00Z');
const run = (conclusion, hoursAgo, name = 'W') => ({
  name,
  conclusion,
  created_at: new Date(NOW - hoursAgo * 3_600_000).toISOString(),
  html_url: `https://example.invalid/${conclusion}/${hoursAgo}`,
});

test('a wall of skips and cancels does not hide the failures behind it', () => {
  const list = [
    run('cancelled', 1),
    run('skipped', 2),
    run('skipped', 3),
    run('failure', 5),
    run('failure', 6),
  ];

  const verdict = classifyWorkflow('Post-Deploy E2E (production)', list, NOW);

  assert.ok(verdict, 'the newest run was a no-op, so the real failures went unreported');
  assert.equal(verdict.consecutive, 2);
  assert.equal(Math.round(verdict.hours), 6);
});

test('one cancelled run between failures does not reset the clock to fresh', () => {
  // This is the E2E Tests (Playwright) case: 16 hours of failure reported as a
  // transient because a single `cancelled` broke the walk.
  const list = [run('failure', 1), run('cancelled', 2), run('failure', 16)];

  const verdict = classifyWorkflow('E2E Tests (Playwright)', list, NOW);

  assert.equal(verdict.consecutive, 2);
  assert.equal(Math.round(verdict.hours), 16);
});

test('a newer success clears the workflow however many failures precede it', () => {
  const list = [run('skipped', 1), run('success', 2), run('failure', 3)];

  assert.equal(classifyWorkflow('W', list, NOW), null);
});

test('timed_out and startup_failure are failures too', () => {
  assert.ok(BAD_CONCLUSIONS.has('timed_out'));
  assert.ok(BAD_CONCLUSIONS.has('startup_failure'));
  assert.ok(classifyWorkflow('W', [run('timed_out', 1)], NOW));
});

test('a window with no verdict is a question, not an alarm', () => {
  const list = [run('skipped', 1), run('cancelled', 2)];

  assert.equal(verdictRuns(list).length, 0);
  assert.equal(classifyWorkflow('W', list, NOW), null);
});

test('the duration is marked as a lower bound when the window bounds it', () => {
  assert.equal(classifyWorkflow('W', [run('failure', 1), run('failure', 9)], NOW).windowLimited, true);
  assert.equal(classifyWorkflow('W', [run('failure', 1), run('success', 9)], NOW).windowLimited, false);
});

test('workflows are classified independently of each other', () => {
  const runs = [
    run('cancelled', 1, 'Noisy'),
    run('failure', 2, 'Noisy'),
    run('success', 3, 'Quiet'),
    run('failure', 4, 'Quiet'),
  ];

  assert.deepEqual(
    redWorkflows(runs, NOW).map((r) => r.name),
    ['Noisy']
  );
});

test('the detector no longer teaches the next reader that neutral is green', () => {
  const src = readFileSync(CHECKER, 'utf8');

  assert.ok(!src.includes('is green or neutral'), 'the misleading green line is back');
  assert.ok(
    src.includes("from './lib/workflowVerdicts.mjs'"),
    'the detector must classify through the shared module, not its own equality test'
  );
  assert.ok(
    !src.includes("latest.conclusion !== 'failure'"),
    'the inline newest-run-only classification is back'
  );
});
