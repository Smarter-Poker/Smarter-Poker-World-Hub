#!/usr/bin/env node
/**
 * Compare the room-count SNAPSHOT (src/lib/venueCount.mjs) with the live
 * listed-room set. Replaces "re-run the query and update the constants by
 * hand": nothing has to remember to look.
 *
 *   FAIL (exit 1)  any snapshot figure is ABOVE live: the label, the verified
 *                  count, the state count, a state's count, or a per-game
 *                  floor. A client component or static file would then claim
 *                  more rooms than the database holds.
 *   WARN (exit 0)  live has moved past the snapshot (the directory grew, a
 *                  verification date was added). Pages that read live data
 *                  already show it; raise the snapshot with --print.
 *   SKIP (exit 0)  no credentials or the database did not answer. Reported,
 *                  never treated as green.
 *
 * Runs in CI from scripts/ci/check-live-contracts.mjs (CHECK 25, which has
 * the service key) and at every Vercel build from scripts/refresh-venue-claims.mjs
 * (warn-only there: the build rewrites the static files from live data).
 *
 * USAGE
 *   node scripts/check-venue-count-snapshot.mjs            # check
 *   node scripts/check-venue-count-snapshot.mjs --print    # print live constants to paste
 */
import { pathToFileURL } from 'node:url';
import {
  SNAPSHOT_VENUE_STATS,
  snapshotBehind,
  snapshotOverClaims,
} from '../src/lib/venueCount.mjs';
import { readLiveVenueStats } from './lib/live-venue-stats.mjs';

/** { status: 'ok'|'warn'|'fail'|'skip', overClaims, behind, live, error } */
export async function checkVenueCountSnapshot({ client, env, snapshot = SNAPSHOT_VENUE_STATS } = {}) {
  const { stats: live, error } = await readLiveVenueStats({ client, env });
  if (!live) return { status: 'skip', overClaims: [], behind: [], live: null, error };
  const overClaims = snapshotOverClaims(live, snapshot);
  const behind = snapshotBehind(live, snapshot);
  const status = overClaims.length ? 'fail' : behind.length ? 'warn' : 'ok';
  return { status, overClaims, behind, live, error: null };
}

/** The constants block for src/lib/venueCount.mjs, from live stats. */
export function renderSnapshotConstants(live, today = new Date().toISOString().slice(0, 10)) {
  const entries = Object.entries(live.byState).map(([k, v]) => `${k}: ${v}`);
  const rows = [];
  for (let i = 0; i < entries.length; i += 10) rows.push(`  ${entries.slice(i, i + 10).join(', ')},`);
  return [
    `export const VERIFIED_LISTED_VENUES = ${live.listed};`,
    `export const VENUE_COUNT_VERIFIED_AT = '${today}';`,
    `export const VERIFIED_VENUE_COUNT = ${live.verified};`,
    'export const LISTED_VENUES_BY_STATE = Object.freeze({',
    ...rows,
    '});',
    `export const LISTED_VENUES_WITHOUT_STATE = ${live.withoutState};`,
    `export const VENUES_SPREADING_NLH = ${live.games.nlh};`,
    `export const VENUES_SPREADING_PLO = ${live.games.plo};`,
    `export const VENUES_SPREADING_LIMIT_OR_MIXED = ${live.games.limitOrMixed};`,
    `export const VENUES_SPREADING_MIXED = ${live.games.mixed};`,
  ].join('\n');
}

async function main() {
  const print = process.argv.includes('--print');
  const r = await checkVenueCountSnapshot();
  const tag = '[venue-count-snapshot]';
  if (r.status === 'skip') {
    console.log(`${tag} SKIPPED (not green, not red): ${r.error?.message || 'no live data'}`);
    if (print) process.exit(2);
    return;
  }
  console.log(`${tag} live: ${r.live.listed} listed rooms (${r.live.label}), ${r.live.verified} with a verification date, ${r.live.stateCount} states`);
  console.log(`${tag} snapshot: ${SNAPSHOT_VENUE_STATS.listed} (${SNAPSHOT_VENUE_STATS.label}), read ${SNAPSHOT_VENUE_STATS.readAt}`);
  if (print) console.log(`\n${renderSnapshotConstants(r.live)}\n`);
  for (const b of r.behind) console.log(`::warning::${tag} snapshot behind live: ${b}`);
  if (r.status === 'fail') {
    for (const o of r.overClaims) console.error(`::error::${tag} snapshot claims more than the database: ${o}`);
    console.error(`${tag} lower the snapshot: node scripts/check-venue-count-snapshot.mjs --print`);
    process.exit(1);
  }
  console.log(`${tag} ${r.status === 'ok' ? 'OK' : 'OK (snapshot is below live; raise it when convenient)'}`);
}

if (import.meta.url === pathToFileURL(process.argv[1] || '').href) {
  main().catch((e) => { console.error('[venue-count-snapshot] script error:', e); process.exit(2); });
}
