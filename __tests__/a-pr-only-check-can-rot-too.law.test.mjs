/**
 * A WORKFLOW THAT NEVER RUNS ON main CAN ROT TOO.
 *
 * check-main-is-green.mjs exists because `Global Footer E2E` was red on every
 * run for days and nothing said so. Its own header says as much. It sweeps
 * `?branch=main`.
 *
 * `Global Footer E2E` triggers on `pull_request` and `workflow_dispatch`. It
 * has never produced a single run on main. So the detector written BECAUSE of
 * that workflow could never see that workflow - and on 2026-09-09 it rotted
 * again: 152 failures in 200 runs, red on every run for sixteen hours, found
 * by accident a second time. The blind spot is structural. There was nothing
 * on main to look at.
 *
 * WHY THE RULE OFF main HAS TO BE DIFFERENT. On main, one red newest run is
 * enough: main is one line of history and a failure there is the repo's. Off
 * main every run belongs to somebody's branch, and one branch that does not
 * build is that branch's problem. So the signal is a streak that is both long
 * and spread across DIFFERENT branches.
 *
 * CALIBRATED AGAINST THE REAL RUNS, not taste. Replaying this repo's actual
 * Global Footer E2E history through classifyAcrossBranches:
 *
 *   as of 2026-09-08 17:00   FIRES    28 consecutive / 25 branches /  1.6h
 *   as of 2026-09-08 23:00   FIRES    55 consecutive / 48 branches /  7.6h
 *   as of 2026-09-09 08:00   FIRES    81 consecutive / 73 branches / 16.6h
 *   as of 2026-09-10 .. 13   quiet    (the four days after the fix)
 *
 * It catches the outage 1.6 hours in - against the sixteen it actually took -
 * and does not fire on the estate as it stands. Over those four days the worst
 * real streak was 3 consecutive across 3 branches, with the newest run green,
 * which is the noise floor the thresholds clear.
 *
 * AND THIS IS WHY THE CHECK IS NOT REQUIRED. Making it required would block a
 * merge on it: 10 failures in the last 40 runs, and of the ones I read, half
 * were the BRANCH'S OWN BUILD failing rather than anything in the footer, and
 * half were timing assertions (`toBeFocused`, a null nav box) that pass on the
 * other 24. A required check at that failure rate teaches everybody to
 * force-merge, which is the same "nobody acts on it" disease one level up. The
 * damage on 2026-09-09 was not that it blocked nothing; it was that nothing
 * SAID anything for sixteen hours. That is what this fixes.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
    PR_ONLY_MIN_BRANCHES, PR_ONLY_MIN_CONSECUTIVE, classifyAcrossBranches,
} from '../scripts/ci/lib/workflowVerdicts.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel) => readFileSync(join(ROOT, rel), 'utf8');

/** Newest first, one run per hour going back. */
const runs = (spec, { start = Date.parse('2026-09-09T08:00:00Z') } = {}) =>
    spec.map(([conclusion, branch], i) => ({
        conclusion,
        head_branch: branch,
        created_at: new Date(start - i * 3_600_000).toISOString(),
        html_url: `https://example.invalid/${i}`,
    }));

const NOW = Date.parse('2026-09-09T08:30:00Z');

test('the outage shape fires', () => {
    // Eight consecutive failures on eight different branches: what sixteen
    // hours of Global Footer E2E looked like, in miniature.
    const list = runs(Array.from({ length: 8 }, (_, i) => ['failure', `branch-${i}`]));
    const v = classifyAcrossBranches('Global Footer E2E', list, { now: NOW });
    assert.ok(v, 'red on every run across eight branches is rot');
    assert.equal(v.consecutive, 8);
    assert.equal(v.branchCount, 8);
});

test('one branch that cannot build is that branch, not rot', () => {
    // The commonest false positive, and the one that would make this useless:
    // an agent pushes a broken branch and re-pushes it nine times.
    const list = runs(Array.from({ length: 9 }, () => ['failure', 'fix/one-bad-branch']));
    assert.equal(classifyAcrossBranches('Global Footer E2E', list, { now: NOW }), null,
        'nine failures on ONE branch is somebody debugging, not a rotten check');
});

test("today's measured noise floor stays quiet", () => {
    // Measured over the four days after the fix: worst real streak was 3
    // consecutive across 3 branches, newest run green.
    const list = runs([
        ['success', 'main-ish'],
        ['failure', 'branch-a'], ['failure', 'branch-b'], ['failure', 'branch-c'],
        ['success', 'branch-d'],
    ]);
    assert.equal(classifyAcrossBranches('Global Footer E2E', list, { now: NOW }), null,
        'the newest verdict is green; there is nothing to report');

    // And the same three failures with no green above them still must not fire:
    // three is the noise floor, not the signal.
    const streak3 = runs([['failure', 'a'], ['failure', 'b'], ['failure', 'c'], ['success', 'd']]);
    assert.equal(classifyAcrossBranches('Global Footer E2E', streak3, { now: NOW }), null,
        `three is under the ${PR_ONLY_MIN_CONSECUTIVE} threshold`);
});

test('the thresholds are the ones the measurement justified', () => {
    // Changing these is a product decision, not a tuning knob: 6 clears a
    // measured floor of 3, and 3 branches is what separates rot from a branch.
    assert.equal(PR_ONLY_MIN_CONSECUTIVE, 6);
    assert.equal(PR_ONLY_MIN_BRANCHES, 3);
});

test('a long streak on too few branches does not fire', () => {
    const list = runs(Array.from({ length: 10 }, (_, i) => ['failure', i % 2 ? 'a' : 'b']));
    assert.equal(classifyAcrossBranches('Global Footer E2E', list, { now: NOW }), null,
        'ten failures ping-ponging between two branches is two bad branches');
});

test('cancelled and skipped runs do not break the streak, or make one', () => {
    // The bug the existing sweep already documents: `completed` includes
    // cancelled and skipped, and an event-driven workflow interleaves them by
    // construction. A cancelled run decides nothing either way.
    const list = runs([
        ['cancelled', 'x'],
        ['failure', 'a'], ['failure', 'b'], ['cancelled', 'c'], ['failure', 'd'],
        ['failure', 'e'], ['skipped', 'f'], ['failure', 'g'], ['failure', 'h'],
    ]);
    const v = classifyAcrossBranches('Global Footer E2E', list, { now: NOW });
    assert.ok(v, 'six real failures are six real failures');
    assert.equal(v.consecutive, 6);
    assert.equal(v.branchCount, 6);
});

test('the detector sweeps off main as well as on it', () => {
    const src = read('scripts/ci/check-main-is-green.mjs');
    assert.match(src, /async function scanOffMain/, 'the second sweep exists');
    assert.match(src, /classifyAcrossBranches/, 'and uses the stricter rule');
    // It must not double-report what the main sweep already owns.
    assert.match(src, /if \(onMain\.has\(name\)\) continue;/);
    assert.match(src, /if \(list\.some\(\(r\) => r\.head_branch === BRANCH\)\) continue;/);
    // And a repo with NO runs on main at all must still be swept, or a repo
    // whose CI is entirely pull_request-driven reads as green forever.
    assert.match(src, /runs\.length === 0[\s\S]{0,220}scanOffMain/);
});

test('what it finds reaches the same alarm as a red main', () => {
    const src = read('scripts/ci/check-main-is-green.mjs');
    assert.match(src, /const overdue = \[\.\.\.red, \.\.\.prOnly\]/,
        'a finding nobody is paged about is the bug this file is about');
    // And it says which kind it is, because "on 3 branches" is the whole
    // difference between rot and somebody's bad branch.
    assert.match(src, /never runs on/);
});

test('the footer gate really is pull-request-only, which is why any of this matters', () => {
    const wf = read('.github/workflows/global-footer-e2e.yml');
    const on = wf.slice(wf.indexOf('\non:'), wf.indexOf('\njobs:'));
    assert.match(on, /pull_request:/);
    assert.ok(!/\n {2}push:/.test(on), 'if it ever runs on main, the first sweep covers it and this test should be revisited');
});
