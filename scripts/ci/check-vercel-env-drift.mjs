#!/usr/bin/env node
/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  AN ENVIRONMENT VARIABLE CHANGED AND NOBODY SAW IT
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Realtime Connections Programme, phase 7 - guardrails.
 *
 * THE TWENTY-TWO HOURS BEGAN WITH ONE ENVIRONMENT VARIABLE. On 2026-09-03 at
 * 20:15 UTC `PROBE_LOGIN_EMAIL` in Vercel was pointed at Dan's own account.
 * From the next tick `/api/cron/login-probe` signed in as him and called a
 * global `signOut()` every fifteen minutes; every Club Arena table he opened
 * said "Reconnecting To The Table" until somebody worked it out by hand the
 * following day. Every code path involved was correct. The change that caused
 * it was made in a dashboard, left no commit, no log line and no notification,
 * and nothing on this platform could have told you it had happened.
 *
 * This is the thing that watches for it.
 *
 * WHAT IT READS, AND WHAT IT REFUSES TO READ
 * ------------------------------------------
 * `GET /v9/projects/{id}/env` WITHOUT `?decrypt=true`. It records only the
 * SHAPE of the environment - the key, which targets it applies to, its type,
 * and when it was last touched:
 *
 *     PROBE_LOGIN_EMAIL  production,preview  encrypted  2026-09-03T20:15:07Z
 *
 * It never asks for a value, never stores one, and never prints one. A drift
 * detector that had to hold the secrets to notice they moved would be a worse
 * problem than the one it solves. If Vercel ever returns a `value` field
 * anyway, it is dropped before anything is written or logged.
 *
 * HOW IT DECIDES
 * --------------
 * `scripts/ci/vercel-env-baseline.json` is the committed shape of the
 * environment. Live is compared against it. A difference is not assumed to be
 * wrong - it is assumed to be UNSEEN, which is the actual failure of
 * 2026-09-03. Somebody reads the issue, decides, and updates the baseline in a
 * pull request with `--update`. That review is the whole product.
 *
 * Usage:
 *   VERCEL_TOKEN=... node scripts/ci/check-vercel-env-drift.mjs
 *   VERCEL_TOKEN=... node scripts/ci/check-vercel-env-drift.mjs --update
 *
 * Exit: 0 no drift · 1 drift · 2 could not ask (NEVER silently green)
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const BASELINE = join(ROOT, 'scripts', 'ci', 'vercel-env-baseline.json');

/** hub-vanguard. CLAUDE.md 1.1: the one real project, aliased to smarter.poker. */
const PROJECT_ID = process.env.VERCEL_PROJECT_ID || 'prj_op66GkZyZcygXQKm76iyycfVFAQx';

/**
 * The only fields that ever leave the API response.
 *
 * `value` is deliberately absent and its absence is a load-bearing property of
 * this file, not an oversight - see the header. `__test_shapeOf` is exported
 * for the law so the guarantee is asserted, not merely stated.
 */
export function shapeOf(entry) {
  return {
    key: entry.key,
    target: Array.isArray(entry.target) ? [...entry.target].sort().join(',') : String(entry.target ?? ''),
    type: entry.type ?? '',
    updatedAt: entry.updatedAt ? new Date(entry.updatedAt).toISOString() : null,
  };
}

async function liveShape(token) {
  const team = process.env.VERCEL_TEAM_ID ? `?teamId=${process.env.VERCEL_TEAM_ID}` : '';
  const res = await fetch(`https://api.vercel.com/v9/projects/${PROJECT_ID}/env${team}`, {
    headers: { Authorization: `Bearer ${token}` },
    signal: AbortSignal.timeout(20_000),
  });
  if (!res.ok) throw new Error(`Vercel API ${res.status} ${res.statusText}`);
  const body = await res.json();
  const envs = body?.envs ?? body?.env ?? [];
  if (!Array.isArray(envs) || envs.length === 0) throw new Error('Vercel returned no env entries');
  return envs.map(shapeOf).sort((a, b) => (a.key + a.target).localeCompare(b.key + b.target));
}

function keyOf(e) {
  return `${e.key}|${e.target}`;
}

function diff(baseline, live) {
  const b = new Map(baseline.map((e) => [keyOf(e), e]));
  const l = new Map(live.map((e) => [keyOf(e), e]));
  const added = [...l.keys()].filter((k) => !b.has(k)).sort();
  const removed = [...b.keys()].filter((k) => !l.has(k)).sort();
  const touched = [...l.keys()]
    .filter((k) => b.has(k) && b.get(k).updatedAt !== l.get(k).updatedAt)
    .sort();
  return { added, removed, touched, b, l };
}

async function main() {
  const token = (process.env.VERCEL_TOKEN || '').trim();
  if (!token) {
    console.error('[vercel-env] VERCEL_TOKEN is not set. This is NOT a pass - it is a check that could not run.');
    process.exit(2);
  }

  let live;
  try {
    live = await liveShape(token);
  } catch (err) {
    console.error('[vercel-env] COULD NOT ASK VERCEL.');
    console.error(`   ${err?.message || err}`);
    console.error('   Exiting 2: a detector that goes green when it cannot see is the bug it exists to catch.');
    process.exit(2);
  }

  if (process.argv.includes('--update')) {
    writeFileSync(BASELINE, JSON.stringify({ project: PROJECT_ID, captured: new Date().toISOString(), env: live }, null, 2) + '\n');
    console.log(`[vercel-env] baseline updated: ${live.length} entries. Commit it with the reason in the message.`);
    process.exit(0);
  }

  if (!existsSync(BASELINE)) {
    console.error('[vercel-env] no baseline. Create one deliberately:');
    console.error('   VERCEL_TOKEN=... node scripts/ci/check-vercel-env-drift.mjs --update');
    process.exit(2);
  }

  const baseline = JSON.parse(readFileSync(BASELINE, 'utf8')).env ?? [];
  const { added, removed, touched, b, l } = diff(baseline, live);

  console.log(`[vercel-env] ${live.length} entries live, ${baseline.length} in the baseline.`);

  if (!added.length && !removed.length && !touched.length) {
    console.log('[vercel-env] OK - the shape of the environment is what the repo last agreed it was.');
    process.exit(0);
  }

  console.error('');
  console.error('THE VERCEL ENVIRONMENT HAS CHANGED SINCE THE BASELINE.');
  console.error('This is not automatically wrong. It is UNSEEN, which is what');
  console.error('2026-09-03 was: one variable edited in a dashboard, no commit, no');
  console.error('log line, twenty-two hours of every table saying "Reconnecting".');
  console.error('');
  for (const k of touched) {
    console.error(`  CHANGED  ${k}`);
    console.error(`             was touched ${b.get(k).updatedAt}, now ${l.get(k).updatedAt}`);
  }
  for (const k of added) console.error(`  ADDED    ${k}   (created ${l.get(k).updatedAt})`);
  for (const k of removed) console.error(`  REMOVED  ${k}   (last seen ${b.get(k).updatedAt})`);
  console.error('');
  console.error('No values are read, stored or shown - only names, targets and timestamps.');
  console.error('If the change was intended, record it:');
  console.error('   VERCEL_TOKEN=... node scripts/ci/check-vercel-env-drift.mjs --update');
  console.error('and commit the baseline saying who changed what and why.');
  process.exit(1);
}

if (import.meta.url === `file://${process.argv[1]}`) main();
