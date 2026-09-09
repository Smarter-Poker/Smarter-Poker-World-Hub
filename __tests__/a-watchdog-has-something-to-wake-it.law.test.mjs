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

import { claimedMinutes, onBlock, readWorkflows } from '../scripts/ci/check-watchdog-latency.mjs';

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
    const blind = readWorkflows(join(ROOT, '.github/workflows'))
        .filter((w) => w.claimed < 60 && w.events.length === 0);
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
    assert.equal(claimedMinutes('0 9 1 * *'), 43200);
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
    const found = readWorkflows(join(ROOT, '.github/workflows'));
    const gate = found.find((w) => /Build Safety Gate/i.test(w.name));
    assert.ok(gate, 'the safety gate must be among the scheduled workflows');
    assert.ok(gate.events.includes('push') && gate.events.includes('pull_request'),
        `the gate wakes on push and pull_request, got: ${gate.events.join(',') || 'none'}`);
});
