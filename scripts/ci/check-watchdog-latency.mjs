#!/usr/bin/env node
/**
 * A WATCHDOG'S CRON IS A WISH. MEASURE WHAT IT ACTUALLY DELIVERS.
 *
 * Every scheduled workflow in this repo states a cadence, and the comments
 * around them state a response time. On 2026-09-09 those numbers were checked
 * against the API for the first time:
 *
 *   Publish Watchdog        claimed 30 min   actual 202 median, 368 worst
 *   push-velocity-watchdog  claimed 60 min   actual 219 median, 380 worst
 *
 * Not one of 39 gaps on the publish watchdog was under an hour. GitHub drops
 * and defers scheduled runs on a busy account, and asking more often makes it
 * worse rather than better. Daily and weekly schedules in this repo are fine;
 * everything sub-daily is a fiction.
 *
 * That mattered the same day: three production deploys errored on a
 * vercel.json schema rule, and the workflow whose entire job is "production
 * is serving main" slept through all three. The outage was found by curling
 * by hand, which is the exact thing that workflow exists to replace.
 *
 * CLAUDE.md 1.3 records what a promised-but-absent safety net costs: somebody
 * reads it, assumes they are covered, and stops checking. A watchdog that
 * claims 30 minutes and delivers three hours is that, precisely.
 *
 * SO THIS SCRIPT ASKS THE API rather than reading the cron, and reports the
 * gap between what each workflow claims and what it does. It does not fail
 * the build on drift, because the drift is GitHub's and not ours to fix; it
 * fails when a LATENCY-CRITICAL watchdog has nothing but a schedule to wake
 * it, because that IS ours to fix and the fix is one trigger.
 *
 * Usage:  node scripts/ci/check-watchdog-latency.mjs [--json]
 * Needs:  gh CLI authenticated, or GH_TOKEN.
 */

import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import process from 'node:process';

const DIR = '.github/workflows';

/**
 * Minutes a cron expression claims, for the shapes this repo uses.
 *
 * Day-of-week and day-of-month are checked FIRST. Reading `0 9 * * 1` as
 * daily made a weekly scraper look 7x late in the first run of this script,
 * which is exactly the kind of confident wrong number it exists to stop.
 */
export function claimedMinutes(cron) {
    const [minute, hour, dom, , dow] = String(cron).trim().split(/\s+/);
    if (dow && dow !== '*') return 10080;          // a named day: weekly
    if (dom && dom !== '*') return 43200;          // a day of the month
    if (minute && minute.startsWith('*/')) return Number(minute.slice(2));
    if (hour === '*') return 60;
    if (hour && hour.startsWith('*/')) return Number(hour.slice(2)) * 60;
    return 1440;
}

/** Event triggers that wake a workflow when something actually happens. */
const REAL_EVENTS = ['push:', 'pull_request:', 'workflow_run:', 'repository_dispatch:', 'deployment_status:', 'issues:'];

/**
 * The `on:` block and nothing else: from `on:` to the next top-level key.
 * Everything below it, permissions included, is somebody else's business.
 */
export function onBlock(src) {
    const lines = src.split('\n');
    const start = lines.findIndex((l) => /^on:/.test(l));
    if (start < 0) return '';
    // Walk to the next line that starts at column 0 with a key. Doing this by
    // regex on the sliced string matched the remainder of the word `on:`
    // itself and returned two characters, which reported every workflow in
    // the repo as having no trigger at all.
    let end = lines.length;
    for (let i = start + 1; i < lines.length; i++) {
        if (/^[a-zA-Z_-]+:/.test(lines[i])) { end = i; break; }
    }
    return '\n' + lines.slice(start, end).join('\n') + '\n';
}

export function readWorkflows(dir = DIR) {
    if (!existsSync(dir)) return [];
    const out = [];
    for (const file of readdirSync(dir).filter((f) => /\.ya?ml$/.test(f))) {
        const src = readFileSync(join(dir, file), 'utf8');
        const name = (src.match(/^name:\s*(.+)$/m) || [])[1];
        if (!name) continue;
        const crons = [...src.matchAll(/cron:\s*'([^']+)'/g)].map((m) => m[1]);
        if (!crons.length) continue;
        // ONLY the `on:` block counts. Slicing to `jobs:` was not enough: it
        // swept in `permissions:`, where `issues: write` reads exactly like an
        // `issues:` trigger, and three workflows with nothing but a schedule
        // were reported as having a real event to wake them. A check that
        // passes a blind watchdog is worse than no check.
        const events = REAL_EVENTS.filter((e) => onBlock(src).includes(`\n  ${e}`)).map((e) => e.replace(':', ''));
        out.push({
            file,
            name: name.replace(/^["']|["']$/g, '').trim(),
            claimed: Math.min(...crons.map(claimedMinutes)),
            events,
        });
    }
    return out;
}

function scheduledRunTimes(name) {
    try {
        const raw = execFileSync('gh', [
            'run', 'list', '--workflow', name, '--limit', '40',
            '--json', 'createdAt,event', '--jq', '.[] | select(.event=="schedule") | .createdAt',
        ], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
        return raw.trim().split('\n').filter(Boolean).map((s) => new Date(s).getTime());
    } catch (_err) {
        return null;
    }
}

function gaps(times) {
    const g = [];
    for (let i = 0; i < times.length - 1; i++) g.push((times[i] - times[i + 1]) / 60000);
    return g.sort((a, b) => a - b);
}

const workflows = readWorkflows();
const report = [];

for (const wf of workflows) {
    const times = scheduledRunTimes(wf.name);
    const row = { ...wf, median: null, worst: null, samples: times ? times.length : 0 };
    if (times && times.length >= 4) {
        const g = gaps(times);
        row.median = Math.round(g[Math.floor(g.length / 2)]);
        row.worst = Math.round(g[g.length - 1]);
    }
    report.push(row);
}

if (process.argv.includes('--json')) {
    console.log(JSON.stringify(report, null, 2));
} else {
    console.log('\n  WHAT THE SCHEDULED WORKFLOWS ACTUALLY DELIVER\n');
    console.log(`  ${'workflow'.padEnd(38)} ${'claims'.padStart(8)} ${'median'.padStart(8)} ${'worst'.padStart(8)}  wakes on`);
    for (const r of report.sort((a, b) => a.claimed - b.claimed)) {
        const claims = `${r.claimed}m`;
        const median = r.median === null ? '-' : `${r.median}m`;
        const worst = r.worst === null ? '-' : `${r.worst}m`;
        const wakes = r.events.length ? r.events.join(',') : 'schedule only';
        console.log(`  ${r.name.slice(0, 38).padEnd(38)} ${claims.padStart(8)} ${median.padStart(8)} ${worst.padStart(8)}  ${wakes}`);
    }
    console.log('');
}

/**
 * The failure. A schedule under an hour is not delivered by GitHub, so a
 * workflow that needs to react quickly must have something real to react to.
 * Drift itself is not failed on: it is not ours to fix.
 */
const blind = report.filter((r) => r.claimed < 60 && r.events.length === 0);
if (blind.length) {
    console.error('::error title=A WATCHDOG HAS NOTHING TO WAKE IT::These ask for a sub-hourly schedule and have no event trigger. Measured, GitHub delivers roughly three hours. Give each one the event it is really watching for.');
    for (const r of blind) {
        console.error(`  ${r.name} (${r.file}) claims ${r.claimed}m, delivered ${r.median === null ? 'unmeasured' : `${r.median}m median`}`);
    }
    process.exit(1);
}

console.log('  OK - every sub-hourly workflow has a real event to wake it.\n');
