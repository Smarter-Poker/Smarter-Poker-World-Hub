/**
 * A WATCHDOG HAS SOMETHING REAL TO WAKE IT.
 *
 * The Publish Watchdog exists to notice when main moves and production does
 * not. Its comment claimed it "notices roughly half an hour after a deploy
 * silently stops happening - against the hours it currently takes for
 * somebody to notice by hand."
 *
 * Measured on 2026-09-09, over the last 40 scheduled runs:
 *
 *   claimed:  every 30 minutes
 *   actual:   202 minutes median, 368 minutes worst
 *   39 of 39 consecutive gaps were longer than an hour.
 *
 * Three and a half hours, median. It was not meaningfully faster than the
 * human it replaced, and on the same day it slept through THREE production
 * deploys that errored on a vercel.json schema rule. The outage was found by
 * curling production by hand.
 *
 * GitHub drops and defers scheduled runs on a busy account, and asking more
 * often makes it worse, not better. The cure is not a tighter cron. It is to
 * wake on the thing you are actually watching for: for "production is serving
 * main", that is the push that moved main.
 *
 * CLAUDE.md 1.3 records what a promised-but-absent safety net costs: somebody
 * reads it, assumes they are covered, and stops checking. This is that, in a
 * file whose entire job was to be the one who keeps checking.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import { blindWorkflows, claimedMinutes, expandField, onBlock, readWorkflows } from '../scripts/ci/check-watchdog-latency.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel) => readFileSync(join(ROOT, rel), 'utf8');

test('the publish watchdog wakes on the push that moved main', () => {
    const wf = read('.github/workflows/publish-watchdog.yml');
    const on = onBlock(wf);
    assert.match(on, /\n {2}push:\n {4}branches: \[main\]/, 'the push IS the event this watchdog is for');
    // The schedule stays, because a deploy that never STARTED produces no
    // push to trigger on. It is a backstop, not the mechanism.
    assert.match(on, /cron: '\*\/30 \* \* \* \*'/);
});

test('no sub-hourly watchdog is left with nothing but a schedule', () => {
    // GitHub delivers roughly three hours for a sub-hourly cron in this repo,
    // measured. A workflow that needs to be fast needs a real trigger.
    // Through blindWorkflows, not a second copy of its filter. The copy that
    // used to live here said `w.claimed < 60`, and when an unreadable claim
    // became null, `null < 60` is TRUE in JavaScript - so the charity scraper,
    // which runs every four days, was reported as a blind sub-hourly watchdog.
    // One rule, one implementation.
    const blind = blindWorkflows(readWorkflows(join(ROOT, '.github/workflows')));
    assert.deepEqual(blind.map((w) => w.file), [],
        `these ask for a sub-hourly schedule and have nothing to wake them: ${blind.map((w) => w.name).join(', ')}`);
});

test('the workflow files say what they deliver, not what they wish', () => {
    // The numbers are the whole point. A comment that claims half an hour is
    // how somebody concludes they are covered and stops looking.
    const publish = read('.github/workflows/publish-watchdog.yml');
    assert.match(publish, /202 minutes median/, 'the measured cadence must be written down');
    assert.match(publish, /A BACKSTOP, NOT THE MECHANISM/);
    assert.doesNotMatch(publish, /notices roughly half an hour after a deploy/,
        'the claim that was false must not survive');

    const velocity = read('.github/workflows/push-velocity-watchdog.yml');
    assert.match(velocity, /219 minutes median/);
    // And it explains why a push trigger is wrong for THAT one, which is the
    // non-obvious half: it detects the absence of pushes.
    assert.match(velocity, /ABSENCE of pushes/);
});

test('the watchdog measures itself, on every push', () => {
    const wf = read('.github/workflows/publish-watchdog.yml');
    assert.match(wf, /node scripts\/ci\/check-watchdog-latency\.mjs/);
    // gh run list is refused without it, and a check that cannot read the API
    // reports every workflow as unmeasured and passes.
    assert.match(wf, /^ {2}actions: read$/m, 'the measurement needs actions: read');
});

// ---------------------------------------------------------------------------
// THE MEASUREMENT ITSELF HAS TO BE RIGHT
// ---------------------------------------------------------------------------

test('a cron is read as the cadence it actually asks for', () => {
    assert.equal(claimedMinutes('*/30 * * * *'), 30);
    assert.equal(claimedMinutes('0 */1 * * *'), 60);
    assert.equal(claimedMinutes('0 */4 * * *'), 240);
    assert.equal(claimedMinutes('0 9 * * *'), 1440);
    // Day-of-week first. Reading `0 9 * * 1` as daily made a weekly scraper
    // look seven times late in the first run of this script, which is the
    // confident wrong number it exists to prevent.
    assert.equal(claimedMinutes('0 9 * * 1'), 10080);
    // This line used to assert 43200 for a day-of-month cron. That was this
    // file pinning its own bug: 43200 was an invented number, and it reported
    // the charity scraper (`0 5 */4 * *`) as claiming 43200m while delivering
    // 5749m - seven times MORE often than promised. A day of the month is now
    // answered with null, and 'a schedule that cannot be read honestly says
    // so' below is the assertion that replaces this one.
    assert.equal(claimedMinutes('0 9 1 * *'), null);
});

test('permissions are not mistaken for triggers', () => {
    // `issues: write` under permissions reads exactly like an `issues:`
    // trigger. Slicing to `jobs:` swept it in and reported three
    // schedule-only workflows as having a real event. A check that passes a
    // blind watchdog is worse than no check at all.
    const on = onBlock([
        'name: Example',
        'on:',
        '  schedule:',
        "    - cron: '*/30 * * * *'",
        'permissions:',
        '  issues: write',
        '  contents: read',
        'jobs:',
        '  build:',
    ].join('\n'));
    assert.match(on, /schedule:/);
    assert.doesNotMatch(on, /issues: write/, 'the on block must stop at the next top-level key');
});

test('the on block is not truncated to nothing', () => {
    // Searching the sliced string for the next top-level key matched the
    // remainder of the word `on:` itself and returned two characters, which
    // reported EVERY workflow in the repo as having no trigger.
    const on = onBlock('name: X\non:\n  push:\n    branches: [main]\n  schedule:\n    - cron: \'0 * * * *\'\npermissions:\n  contents: read\n');
    assert.match(on, /\n {2}push:/);
    assert.match(on, /schedule:/);
    assert.doesNotMatch(on, /contents: read/);
});

test('a workflow with a real trigger is recognised as having one', () => {
    // The negative control: without it, an event scan that silently matched
    // nothing would report every workflow as blind and this law would still
    // pass by failing everything. That happened once already, when the `on:`
    // block scan returned two characters.
    //
    // The subject used to be Build Safety Gate, chosen because it wakes on
    // push and pull_request. It has no `schedule:` at all, and only appeared
    // in this list because a `cron:` inside one of its shell steps was read
    // as one - so this test was quietly asserting a bug too. The Publish
    // Watchdog is the honest subject: a real schedule AND a real event, which
    // is the shape this whole file argues for.
    const found = readWorkflows(join(ROOT, '.github/workflows'));
    const watchdog = found.find((w) => /^Publish Watchdog$/i.test(w.name));
    assert.ok(watchdog, 'the publish watchdog has a schedule and must be listed');
    assert.ok(watchdog.events.includes('push'),
        `it wakes on the push that moved main, got: ${watchdog.events.join(',') || 'none'}`);
    // And the gate, which has no schedule, must not be in a list of schedules.
    assert.equal(found.find((w) => /Build Safety Gate/i.test(w.name)), undefined);
});

// ── THE TABLE'S OWN NUMBERS, ADDED 2026-09-09 ──────────────────────────────
//
// This file's whole argument is that a number nobody checks drifts into a
// lie. Run against Club Arena that day, its own table had three:
//
//   1. `40 1,7,13,19 * * *` - four times a day, six hours apart - was read as
//      DAILY, because only the first token of the hour field was looked at.
//      Two of Club Arena's twelve scheduled workflows were wrong by 4x and 2x.
//
//   2. A `cron:` written inside a `run:` shell script was read as a schedule.
//      build-safety-gate.yml has push and pull_request and NO schedule, and
//      was listed as claiming 1440m. An invented row in a table of measured
//      facts.
//
//   3. The median counted only `event=="schedule"` runs, under a heading that
//      said what the workflow ACTUALLY DELIVERS. Club Arena's
//      auto-deploy-hetzner measured 252m that way and 13m across all
//      triggers: its last 54 runs were dispatched by that repo's
//      schedule-liveness check the moment a tick was dropped. A nineteen-fold
//      overstatement, on a workflow behaving perfectly.

test('a cron is read as its widest real gap, lists and all', () => {
    const cases = [
        ['*/30 * * * *', 30],
        ['45 * * * *', 60],
        ['0 */4 * * *', 240],
        ['17 */6 * * *', 360],
        ['40 1,7,13,19 * * *', 360],   // four a day, six hours apart. Was 1440.
        ['25 7,19 * * *', 720],        // twice a day. Was 1440.
        ['0 0,12 * * *', 720],
        ['0 1,2 * * *', 1380],         // two firings an hour apart, then 23h.
        ['20 5 * * *', 1440],
        ['*/15 9-17 * * *', 915],      // 17:45 to 09:00 is 915 minutes.
        ['0 9 * * 1', 10080],
        ['0 9 * * 1,4', 5760],         // Mon and Thu. Thu to Mon is FOUR days,
        //                               and the widest gap is the one that counts.
    ];
    for (const [cron, minutes] of cases) {
        assert.equal(claimedMinutes(cron), minutes, cron);
    }
});

test('a schedule that cannot be read honestly says so', () => {
    // `0 5 */4 * *` fires every fourth day, except cron restarts the count
    // each month, so the gap across a month boundary is longer and varies.
    // This used to return a flat 43200, which reported the charity scraper as
    // claiming 43200m while delivering 5749m - seven times MORE often than
    // promised, which is not a thing.
    assert.equal(claimedMinutes('0 5 */4 * *'), null);
    assert.equal(claimedMinutes('0 5 1 * *'), null);
    assert.equal(claimedMinutes('nonsense'), 1440);
});

test('a cron written inside a run block is not a schedule', () => {
    // build-safety-gate.yml greps for the string `cron:` in a shell step.
    const gate = readWorkflows().find((w) => w.file === 'build-safety-gate.yml');
    assert.equal(gate, undefined, 'it has push and pull_request and no schedule; it must not be listed');
    const src = read('.github/workflows/build-safety-gate.yml');
    assert.match(src, /cron:/, 'the string really is in the file');
    assert.ok(!onBlock(src).includes('cron:'), 'but not in its on: block');
});

test('a workflow with no readable claim is never failed on', () => {
    // A dash in the claims column must not be treated as zero minutes.
    const madeUp = [
        { name: 'x', file: 'x.yml', claimed: null, events: [] },
        { name: 'y', file: 'y.yml', claimed: 30, events: [] },
        { name: 'z', file: 'z.yml', claimed: 30, events: ['push'] },
    ];
    assert.deepEqual(blindWorkflows(madeUp).map((r) => r.name), ['y']);
});

test('cron fields expand the shapes GitHub actually accepts', () => {
    assert.deepEqual(expandField('*', 5), [0, 1, 2, 3, 4]);
    assert.deepEqual(expandField('1,7,13,19', 24), [1, 7, 13, 19]);
    assert.deepEqual(expandField('*/6', 24), [0, 6, 12, 18]);
    assert.deepEqual(expandField('9-12', 24), [9, 10, 11, 12]);
    assert.deepEqual(expandField('0-10/5', 24), [0, 5, 10]);
    assert.equal(expandField('MON', 7), null, 'a name is a shape this does not read');
    assert.equal(expandField('*/0', 24), null, 'a zero step must not spin');
});

test('importing the guard does not run it', () => {
    // Before 2026-09-09 everything below readWorkflows ran at module scope, so
    // importing claimedMinutes printed the whole table and made one gh call
    // per workflow. This law imports it; that must cost nothing.
    const src = read('scripts/ci/check-watchdog-latency.mjs');
    assert.match(src, /if \(process\.argv\[1\] && resolve\(process\.argv\[1\]\) === resolve\(fileURLToPath\(import\.meta\.url\)\)\)/,
        'the report must be behind a main guard');
});
