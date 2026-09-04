#!/usr/bin/env node
/**
 * check-cron-liveness.mjs — Phase U4.3
 * ─────────────────────────────────────────────────────────────────────────
 * Fails CI when a job that Open Claw SCHEDULES has never once SUCCEEDED.
 *
 * WHY
 * On 2026-08-17 an audit found eight scheduled jobs failing at 100%. Seven had
 * never produced a single successful run since being scheduled in early May —
 * roughly 2,000 invocations, zero completions, three and a half months. Six had
 * no handler anywhere: they were added to the dispatcher with WORKERS_PREFERRED
 * mappings pointing at workers routes that were never written. The seventh,
 * video-library-reels, lost its handler in a "ported to workers" batch that did
 * not include it.
 *
 * The cost was not log noise. trivia-embed-backfill ran 835 times and never
 * populated a single row: all 11,197 rows of trivia_questions still had a NULL
 * pgvector embedding, so semantic dedup over the trivia pool had never once
 * worked.
 *
 * None of it was hidden. Every failure sat in cron_execution_log the whole
 * time — nothing was watching. And a log that is 99% noise is exactly how a
 * real failure (deploy-error-poll, the deploy monitor itself) stays invisible
 * for months.
 *
 * WHAT THIS CATCHES THAT THE OTHER U4 CHECKS DO NOT
 *   check-phantom-tables   — the relation does not exist
 *   check-phantom-columns  — the column does not exist
 *   check-stranded-writers — it exists but nothing supplies it
 *   this                   — the SCHEDULER fires and nothing ever completes
 *
 * All four share one shape: the system believes work is happening and it is
 * not. This is the runtime member of that family — the only one needing
 * production history rather than static analysis.
 *
 * THE RULE, over a 7-day window, for each path in ALL_CRONS:
 *   runs >= MIN_RUNS and successes == 0   -> FAIL   (fires, never completes)
 *   runs == 0                             -> WARN   (scheduled, never fires)
 *   otherwise                             -> pass
 *
 * MIN_RUNS keeps a weekly or monthly job from failing merely for having no run
 * inside the window. It is deliberately low (3): every job in the 2026-08-17
 * incident had at least 69 runs, so a stricter bound buys nothing.
 *
 * A "success" is any row whose status is not 'error'. That mirrors how
 * fire_cron() records outcomes and avoids guessing at a success vocabulary
 * that may later grow.
 *
 * DELIBERATELY NOT FAILED ON
 *   - jobs with fewer than MIN_RUNS runs in the window
 *   - anything under "cron_liveness" in supabase-invariants.allowlist.json
 * Every allowlist entry needs a reason saying WHY the job legitimately never
 * succeeds. "It is broken and we know" is not one — that is the finding.
 *
 * USAGE
 *   node scripts/ci/check-cron-liveness.mjs [--warn-only] [--json] [--days=N]
 *
 * Needs SUPABASE_SERVICE_ROLE_KEY + NEXT_PUBLIC_SUPABASE_URL. Counts are read
 * with HEAD + `Prefer: count=exact`, so no row data crosses the wire however
 * large cron_execution_log grows.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const DISPATCHER = path.join(REPO_ROOT, 'scripts', 'openclaw-cron-dispatcher.py');
const ALLOWLIST_PATH = path.join(REPO_ROOT, 'scripts', 'ci', 'supabase-invariants.allowlist.json');

const WARN_ONLY = process.argv.includes('--warn-only');
const AS_JSON = process.argv.includes('--json');
const DAYS = Number((process.argv.find((a) => a.startsWith('--days=')) || '--days=7').split('=')[1]) || 7;
const MIN_RUNS = 3;

function fail(msg, code = 2) {
  console.error(`❌ ${msg}`);
  process.exit(code);
}

/**
 * Pull scheduled paths out of the dispatcher's ALL_CRONS list.
 * Entries look like:   ('/api/cron/hard-stop', dict(minute='*')),
 * Anything after a `#` is stripped first, so a job parked with a comment is
 * not checked — parking a job is a deliberate act and should not fail CI.
 */
function readScheduledPaths() {
  if (!fs.existsSync(DISPATCHER)) fail(`dispatcher not found at ${DISPATCHER}`);
  const src = fs.readFileSync(DISPATCHER, 'utf8');
  const paths = new Set();
  for (const line of src.split('\n')) {
    const code = line.split('#')[0];
    const m = code.match(/\(\s*['"](\/api\/cron\/[^'"]+)['"]\s*,/);
    if (m) paths.add(m[1]);
  }
  return [...paths].sort();
}

function readAllowlist() {
  if (!fs.existsSync(ALLOWLIST_PATH)) return {};
  try {
    return JSON.parse(fs.readFileSync(ALLOWLIST_PATH, 'utf8')).cron_liveness || {};
  } catch (e) {
    return fail(`allowlist is not valid JSON: ${e.message}`);
  }
}

/** '/api/cron/foo' is recorded in cron_execution_log as '/cron/foo'. */
const toJobName = (p) => p.replace(/^\/api/, '');

async function countRows(base, key, params) {
  const res = await fetch(`${base}/rest/v1/cron_execution_log?${params}`, {
    method: 'HEAD',
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      Prefer: 'count=exact',
      Range: '0-0',
    },
  });
  if (!res.ok && res.status !== 206) {
    fail(`cron_execution_log query failed (HTTP ${res.status}) — is the service key valid?`);
  }
  const total = (res.headers.get('content-range') || '').split('/')[1];
  return Number(total) || 0;
}

async function main() {
  const base = (process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || '').replace(/\/$/, '');
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!base) fail('NEXT_PUBLIC_SUPABASE_URL / SUPABASE_URL not set');
  if (!key) fail('SUPABASE_SERVICE_ROLE_KEY not set');

  const since = new Date(Date.now() - DAYS * 86400_000).toISOString();
  const scheduled = readScheduledPaths();
  if (scheduled.length === 0) {
    fail('parsed 0 scheduled paths from the dispatcher — the parser is broken, not the crons');
  }
  const allow = readAllowlist();

  const dead = [];
  const silent = [];
  const healthy = [];

  /* TWO ROUND TRIPS PER JOB, IN SERIES, WAS 106 SECONDS (measured 2026-09-04
     on a required check). 85 scheduled jobs x 2 exact-count HEAD requests,
     each awaited before the next began. The same 170 requests in flight
     sixteen at a time take a few seconds and return the same 170 numbers -
     nothing about what is counted changes, only how long the runner waits. */
  const CONCURRENCY = 16;
  const results = new Array(scheduled.length);
  let next = 0;
  const worker = async () => {
    for (;;) {
      const i = next++;
      if (i >= scheduled.length) return;
      const p = scheduled[i];
      const job = toJobName(p);
      const enc = encodeURIComponent(job);
      const [runs, errors] = await Promise.all([
        countRows(base, key, `job_name=eq.${enc}&started_at=gte.${since}&select=id`),
        countRows(base, key, `job_name=eq.${enc}&started_at=gte.${since}&status=eq.error&select=id`),
      ]);
      results[i] = { path: p, job, runs, successes: runs - errors };
    }
  };
  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, scheduled.length) }, worker));

  // Same order as the dispatcher lists them, so the report reads the same.
  for (const record of results) {
    const { runs, successes: ok } = record;
    if (runs === 0) silent.push(record);
    else if (ok === 0 && runs >= MIN_RUNS) dead.push(record);
    else healthy.push(record);
  }

  const blocking = dead.filter((d) => !allow[d.job]);
  const excused = dead.filter((d) => allow[d.job]);

  if (AS_JSON) {
    console.log(JSON.stringify({ window_days: DAYS, dead: blocking, silent, healthy, excused }, null, 2));
  } else {
    console.log(`Cron liveness — ${scheduled.length} scheduled jobs, ${DAYS}-day window\n`);
    if (blocking.length) {
      console.log('FAIL — scheduled, fires, never succeeds:');
      for (const d of blocking) console.log(`  ${d.job.padEnd(38)} ${d.successes}/${d.runs} succeeded`);
      console.log('');
    }
    if (silent.length) {
      console.log('WARN — scheduled but never fired in the window:');
      for (const s of silent) console.log(`  ${s.job}`);
      console.log('');
    }
    if (excused.length) {
      console.log('Allowlisted (still failing, reason on file):');
      for (const e of excused) console.log(`  ${e.job.padEnd(38)} ${allow[e.job]}`);
      console.log('');
    }
    console.log(
      `${healthy.length} healthy, ${blocking.length} failing, ${silent.length} silent, ${excused.length} excused`
    );
  }

  if (blocking.length && !WARN_ONLY) {
    console.error(
      `\n❌ ${blocking.length} scheduled job(s) have never succeeded in ${DAYS} days.\n` +
        `   A job that fires and never completes does nothing while looking scheduled.\n` +
        `   Fix the handler, unschedule it, or add an allowlist entry saying why it cannot succeed.`
    );
    process.exit(1);
  }
  process.exit(0);
}

main().catch((e) => fail(e.stack || e.message));
