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
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import process from 'node:process';

const DIR = '.github/workflows';

/**
 * Expand one cron field into the values it fires on, or null when the shape
 * is one this does not read. Lists, steps and ranges; nothing exotic.
 */
export function expandField(field, max) {
    if (field === '*') return Array.from({ length: max }, (_, i) => i);
    const out = new Set();
    for (const piece of String(field).split(',')) {
        const step = /^\*\/(\d+)$/.exec(piece);
        if (step) {
            const by = Number(step[1]);
            if (!by) return null;
            for (let i = 0; i < max; i += by) out.add(i);
            continue;
        }
        const range = /^(\d+)-(\d+)(?:\/(\d+))?$/.exec(piece);
        if (range) {
            const by = Number(range[3] || 1);
            if (!by) return null;
            for (let i = Number(range[1]); i <= Number(range[2]) && i < max; i += by) out.add(i);
            continue;
        }
        if (/^\d+$/.test(piece)) { out.add(Number(piece)); continue; }
        return null;
    }
    return [...out].sort((a, b) => a - b);
}

/**
 * Minutes a cron expression claims: the WIDEST hole between two firings.
 *
 * The first version of this read only the first token of each field, so
 * `40 1,7,13,19 * * *` - four times a day, every six hours - was reported as
 * DAILY, and `25 7,19 * * *` as daily too. Measured against Club Arena on
 * 2026-09-09: two of its twelve scheduled workflows had a claim off by 4x and
 * 2x. A table whose entire purpose is honest numbers had dishonest ones in it.
 *
 * This expands the comma lists and steps, enumerates every firing instant in
 * a day, and takes the widest gap INCLUDING the wrap past midnight - which is
 * the one a naive pass forgets, and the one that matters: `0 1,2 * * *` fires
 * twice, an hour apart, and then not for twenty-three.
 *
 * The approach is Club Arena's, from .github/scripts/schedule-liveness.mjs.
 * It had this right since 2026-09-01 while this file did not. Carrying it
 * across is cheaper than being wrong in a second repo.
 */
export function claimedMinutes(cron) {
    const parts = String(cron).trim().split(/\s+/);
    if (parts.length !== 5) return 1440;
    const [minute, hour, dom, mon, dow] = parts;

    // Day-of-week and day-of-month are checked FIRST. Reading `0 9 * * 1` as
    // daily made a weekly scraper look 7x late in the first run of this
    // script, which is exactly the kind of confident wrong number it exists
    // to stop. A narrowed day is also a schedule the instant walk below
    // cannot reason about, because a day may simply be skipped.
    // A narrowed day of the MONTH is not something this can answer honestly.
    // `0 5 */4 * *` fires every fourth day, except that cron restarts the
    // count each month, so the gap across a month boundary is longer and
    // varies by month length. The old code returned a flat 43200 - monthly -
    // for it, which reported the charity scraper as claiming 43200m while
    // delivering 5749m: a workflow apparently running seven times MORE often
    // than promised. A dash is the honest answer.
    if (dom && dom !== '*') return null;
    if (mon && mon !== '*') return null;
    // A named day of the week repeats every 7 days, and a LIST of them does
    // not: `0 9 * * 1,4` is Monday and Thursday, so 3 days at its widest.
    if (dow && dow !== '*') {
        const days = expandField(dow, 7);
        if (!days?.length) return 10080;
        if (days.length === 1) return 10080;
        let widest = 0;
        for (let i = 1; i < days.length; i++) widest = Math.max(widest, days[i] - days[i - 1]);
        widest = Math.max(widest, 7 - days[days.length - 1] + days[0]);
        return widest * 1440;
    }

    const mins = expandField(minute, 60);
    const hours = expandField(hour, 24);
    if (!mins?.length || !hours?.length) return 1440;

    const instants = [];
    for (const h of hours) for (const m of mins) instants.push(h * 60 + m);
    instants.sort((a, b) => a - b);
    let worst = 0;
    for (let i = 1; i < instants.length; i++) worst = Math.max(worst, instants[i] - instants[i - 1]);
    // The wrap from the last firing of one day to the first of the next.
    return Math.max(worst, 1440 - instants[instants.length - 1] + instants[0]);
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
        // ONLY the `on:` block, for the crons too. Scanning the whole file
        // read a `cron:` written inside a `run:` shell script as a schedule:
        // build-safety-gate.yml has push and pull_request and no schedule at
        // all, and was listed here as claiming 1440m. A table of invented
        // claims is worse than no table.
        const crons = [...onBlock(src).matchAll(/cron:\s*['"]([^'"]+)['"]/g)].map((m) => m[1]);
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
            // null when no cron here can be read honestly (a day-of-month
            // step, say). Shown as a dash, and never failed on.
            claimed: (() => {
                const known = crons.map(claimedMinutes).filter((v) => v !== null);
                return known.length ? Math.min(...known) : null;
            })(),
            events,
        });
    }
    return out;
}

/**
 * When this workflow ran, newest first.
 *
 * `only` picks the trigger: 'schedule' answers "is the cron honoured", and
 * everything else answers "how often does this actually run", which are
 * different questions with very different answers.
 *
 * THEY WERE CONFLATED HERE UNTIL 2026-09-09, under a heading that said
 * "WHAT THE SCHEDULED WORKFLOWS ACTUALLY DELIVER". Measured against Club
 * Arena's auto-deploy-hetzner that day:
 *
 *   schedule runs only : 252m median
 *   every trigger      :  13m median
 *
 * A nineteen-fold overstatement, on a workflow that is behaving perfectly:
 * its 54 most recent runs were workflow_dispatch, fired by that repo's
 * schedule-liveness check the moment a cron tick is dropped. Reporting it as
 * three-and-a-half hours late would have sent somebody to fix what was
 * already fixed - and this file exists to stop exactly that kind of confident
 * wrong number.
 *
 * So both are measured and both are shown. A wide "cron" column next to a
 * narrow "real" column is not a fault; it is a dispatcher doing its job.
 */
function runTimes(name, only) {
    const jq = only
        ? `.[] | select(.event=="${only}") | .createdAt`
        : '.[] | .createdAt';
    try {
        const raw = execFileSync('gh', [
            'run', 'list', '--workflow', name, '--limit', '60',
            '--json', 'createdAt,event', '--jq', jq,
        ], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
        return raw.trim().split('\n').filter(Boolean).map((t) => new Date(t).getTime());
    } catch (_err) {
        return null;
    }
}

function gaps(times) {
    const g = [];
    for (let i = 0; i < times.length - 1; i++) g.push((times[i] - times[i + 1]) / 60000);
    return g.sort((a, b) => a - b);
}

/** median and worst gap, or nulls when there is not enough to say. */
function cadence(times) {
    if (!times || times.length < 4) return { median: null, worst: null, samples: times ? times.length : 0 };
    const g = gaps(times);
    return {
        median: Math.round(g[Math.floor(g.length / 2)]),
        worst: Math.round(g[g.length - 1]),
        samples: times.length,
    };
}

export function measure(workflows = readWorkflows()) {
    return workflows.map((wf) => {
        const cron = cadence(runTimes(wf.name, 'schedule'));
        const real = cadence(runTimes(wf.name, null));
        return { ...wf, cron, real };
    });
}

/**
 * The failure. A schedule under an hour is not delivered by GitHub, so a
 * workflow that needs to react quickly must have something real to react to.
 * Drift itself is not failed on: it is not ours to fix.
 *
 * This reads the `on:` block only, so it is the same answer on every machine
 * and needs no network. A workflow woken by ANOTHER workflow dispatching it -
 * Club Arena's schedule-liveness does this - has no event in its own `on:`
 * block and would be named here. World Hub has no such dispatcher today; if
 * one is added, this is the rule to teach about it, and the `real` column
 * above is the evidence that would show it.
 */
export function blindWorkflows(report) {
    return report.filter((r) => r.claimed !== null && r.claimed < 60 && r.events.length === 0);
}

function main() {
    const report = measure();
    if (process.argv.includes('--json')) {
        console.log(JSON.stringify(report, null, 2));
    } else {
        console.log('\n  WHAT THE SCHEDULED WORKFLOWS ACTUALLY DELIVER');
        console.log('  "cron" counts only scheduled runs; "real" counts every trigger.\n');
        console.log(`  ${'workflow'.padEnd(38)} ${'claims'.padStart(7)} ${'cron'.padStart(7)} ${'real'.padStart(7)}  wakes on`);
        for (const r of report.sort((a, b) => (a.claimed ?? Infinity) - (b.claimed ?? Infinity))) {
            const show = (v) => (v === null ? '-' : `${v}m`);
            const wakes = r.events.length ? r.events.join(',') : 'schedule only';
            console.log(
                `  ${r.name.slice(0, 38).padEnd(38)} ${show(r.claimed).padStart(7)}`
                + ` ${show(r.cron.median).padStart(7)} ${show(r.real.median).padStart(7)}  ${wakes}`,
            );
        }
        console.log('');
    }

    const blind = blindWorkflows(report);
    if (blind.length) {
        console.error('::error title=A WATCHDOG HAS NOTHING TO WAKE IT::These ask for a sub-hourly schedule and have no event trigger. Measured, GitHub delivers roughly three hours. Give each one the event it is really watching for.');
        for (const r of blind) {
            console.error(`  ${r.name} (${r.file}) claims ${r.claimed}m, scheduled runs arrive ${r.cron.median === null ? 'unmeasured' : `${r.cron.median}m apart`}`);
        }
        return 1;
    }
    console.log('  OK - every sub-hourly workflow has a real event to wake it.\n');
    return 0;
}

// Importing this module must not run it. The law test imports claimedMinutes
// and onBlock; before this guard it also printed the whole table and made a
// gh call per workflow, every time.
if (process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url))) {
    process.exit(main());
}
