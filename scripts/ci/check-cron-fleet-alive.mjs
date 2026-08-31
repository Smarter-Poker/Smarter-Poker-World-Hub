#!/usr/bin/env node
/**
 * check-cron-fleet-alive.mjs — is the Open Claw fleet actually running?
 * ─────────────────────────────────────────────────────────────────────────
 * WHY THIS EXISTS
 *
 * On 2026-08-31 the production CRON_SECRET was rotated and the Hetzner VM was
 * never updated. Every Open Claw job began returning 401: 85 jobs, including
 * push notifications, every anti-cheat and collusion scan, and chip-supply
 * snapshots. Nothing noticed. It was found by hand, reading the VM's journal,
 * roughly 45 minutes in — and only because somebody happened to be looking.
 *
 * WHY THE EXISTING GUARD COULD NOT SEE IT
 *
 * check-cron-liveness.mjs asks "runs >= 3 AND successes == 0" over 7 days, in
 * CI. It cannot catch this, for two independent reasons:
 *
 *   1. A 401 NEVER REACHES THE LOGGING LAYER. validateCronAuth rejects before
 *      withCronHealth records anything, so there is no failed row to count.
 *      The log does not fill with errors — it STOPS. On the day, the newest
 *      cron_execution_log row was 08:59:00, the exact minute the 401s began.
 *   2. It runs on pull requests. An outage between PRs is invisible for as
 *      long as nobody opens one, and a 7-day window full of last week's
 *      successes cannot fail on today.
 *
 * So the detectable fact is not failure. It is SILENCE.
 *
 * WHY IT RUNS FROM GITHUB, NOT FROM A CRON
 *
 * A monitor that shares a failure domain with the thing it monitors is not a
 * monitor. If the fleet is dead, an Open Claw job that checks the fleet is
 * dead too. This runs GitHub-side and talks to Supabase directly, so it
 * depends on neither Vercel nor the VM — the same reasoning CLAUDE.md 11.4
 * already records for publish-watchdog.yml.
 *
 * THE THRESHOLD IS MEASURED
 *
 * Over the 7 days before this was written: 21,095 runs, p99 gap 1 minute,
 * p99.9 gap 4 minutes, worst gap 11.0 minutes. 25 minutes is more than twice
 * the worst gap in a normal week. The live outage was 45 minutes when this
 * was built, so it fires comfortably while staying clear of normal quiet.
 *
 * Exit: 0 alive · 1 the fleet is silent · 2 cannot tell (misconfigured)
 *
 * Exit 2 is deliberately NOT exit 1: "I could not reach Supabase" and "the
 * fleet is dead" are different facts, and collapsing them is how a monitor
 * ends up crying wolf until it is ignored.
 */

import process from 'node:process';

const THRESHOLD_MINUTES = Number(process.env.CRON_SILENCE_THRESHOLD_MINUTES || 25);

const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const key = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

function bail(code, msg) {
  console.error(msg);
  process.exit(code);
}

if (!url || !key) {
  bail(
    2,
    '[cron-fleet-alive] SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY are not set — cannot tell whether the fleet is alive.\n' +
      'This is a configuration problem with the CHECK, not evidence about the fleet.'
  );
}

const endpoint = `${url.replace(/\/+$/, '')}/rest/v1/rpc/fn_cron_fleet_silence`;

let payload;
try {
  const res = await fetch(endpoint, {
    method: 'POST',
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ p_threshold_minutes: THRESHOLD_MINUTES }),
  });
  if (!res.ok) {
    bail(
      2,
      `[cron-fleet-alive] Supabase answered ${res.status}: ${(await res.text()).slice(0, 300)}`
    );
  }
  payload = await res.json();
} catch (e) {
  bail(2, `[cron-fleet-alive] could not reach Supabase: ${e?.message || e}`);
}

const silence = payload?.silence_minutes;
const late = Array.isArray(payload?.late_jobs) ? payload.late_jobs : [];

if (payload?.ok === true) {
  console.log(
    `[cron-fleet-alive] OK — last Open Claw run ${silence} minute(s) ago ` +
      `(threshold ${THRESHOLD_MINUTES}m, ${payload.runs_last_hour} runs in the last hour).`
  );
  if (late.length) {
    // The fleet is alive but individual jobs are late by their OWN cadence.
    // Not a failure: one stuck job is a different, smaller problem than a dead
    // fleet, and failing here would make the big signal unreliable.
    console.log(
      `[cron-fleet-alive] note — ${late.length} job(s) late against their own normal gap:\n` +
        late
          .map(
            (j) =>
              `    ${j.job}: quiet ${j.quiet_minutes}m, normally every ${j.normal_gap_minutes}m`
          )
          .join('\n')
    );
  }
  process.exit(0);
}

const lines = [
  '[cron-fleet-alive] THE OPEN CLAW FLEET HAS GONE SILENT.',
  '',
  `  Last recorded run:  ${payload?.newest_run_at ?? 'never'}`,
  `  Silence:            ${silence ?? 'unknown'} minutes (threshold ${THRESHOLD_MINUTES})`,
  `  Runs in last hour:  ${payload?.runs_last_hour ?? 0}`,
  '',
  'Silence, not failures, is what this detects: an auth rejection (or DNS, or a',
  'bad deploy) never reaches the logging layer, so a dead fleet shows up as an',
  'EMPTY log rather than as errors. Nothing is being retried in the background.',
  '',
  'FIRST THING TO CHECK — this exact failure happened on 2026-08-31, when the',
  'production CRON_SECRET was rotated and the Hetzner VM was not updated:',
  '',
  "  ssh root@<openclaw-vm> 'set -a; . /etc/openclaw.env; set +a;",
  '    curl -s -o /dev/null -w "%{http_code}\\n" \\',
  '      -H "Authorization: Bearer $CRON_SECRET" \\',
  "      https://smarter.poker/api/cron/waitlist-sweep'",
  '',
  '  401 -> the VM and production disagree about CRON_SECRET.',
  '  200 -> auth is fine; look at the dispatcher service and the VM itself.',
];

if (late.length) {
  lines.push('', 'Jobs late against their own normal cadence:');
  for (const j of late) {
    lines.push(`  ${j.job}: quiet ${j.quiet_minutes}m, normally every ${j.normal_gap_minutes}m`);
  }
}

bail(1, lines.join('\n'));
