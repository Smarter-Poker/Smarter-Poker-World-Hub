/**
 * THE SCRAPER FLEET IS ASKED FROM OUTSIDE THE MACHINE IT RUNS ON.
 *
 * ── WHAT HAPPENED, 2026-09-01 to 2026-09-06 ──────────────────────────────────
 * `tournament-schedule-daemon.py` - the single canonical writer of
 * `venue_daily_tournaments` since the GitHub cron was deliberately demoted on
 * 2026-08-14 - sat in a connect-failure loop for FOUR DAYS AND NINETEEN HOURS.
 * 1,355 consecutive cycles, `venues_done: 0`, `records_total: 0`, retrying
 * every five minutes and writing a heartbeat every time.
 *
 * Its plist says `KeepAlive: true`. That never helped, because the loop never
 * exits: a restart policy cannot restart something that refuses to stop.
 *
 * `pnm-freshness-watchdog.py` DID detect it, on 2026-09-05, and reported four
 * failures including "tour_stops_scraped_4d: newest 2026-08-12". It exits
 * non-zero when it finds them. Nothing reads that exit code. It writes a log
 * file on the same Mac as the daemon, and nobody opened it for a day.
 *
 * ── WHY THIS ONE LIVES IN CI ─────────────────────────────────────────────────
 * CLAUDE.md 11.4 already states the principle, about `publish-watchdog`:
 * "a watchdog that shares a failure domain with the thing it watches is not a
 * watchdog". A Mac-side watchdog cannot be trusted to report that the Mac's
 * own daemon is wedged - if the machine sleeps, loses network, or the launchd
 * job dies, the watchdog goes quiet in exactly the same breath as the thing it
 * is watching, and silence reads as health.
 *
 * So this asks SUPABASE - which both the Mac and GitHub can see, and which is
 * the thing the daemon exists to write - how long it has been since each table
 * was last written. It needs no Mac, no launchd and no log file.
 *
 * SILENCE IS THE OBSERVABLE. The same reasoning as `check-cron-fleet-alive`:
 * a broken scraper does not fill a log with errors, it stops writing rows.
 *
 * Usage:  node scripts/ci/check-scraper-freshness.mjs
 * Needs:  SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY
 * Exits:  0 fresh · 1 something is stale · 2 cannot tell (never an alarm)
 */
import process from 'node:process';

const URL_ = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

/**
 * Each table, the column that dates a write, and how long is too long.
 *
 * The budgets are deliberately generous - roughly three times the cadence -
 * so a single missed run is not an alarm and a stopped fleet is. They are set
 * against what the tables were ACTUALLY doing before the wedge, not against
 * what anybody hoped.
 */
const TABLES = [
  { table: 'venue_daily_tournaments', column: 'updated_at', hours: 36, why: 'the daily venue daemon' },
  { table: 'poker_series', column: 'updated_at', hours: 24 * 5, why: 'the series scraper' },
  { table: 'tour_stop_events', column: 'updated_at', hours: 24 * 7, why: 'the tour scraper' },
];

if (!URL_ || !KEY) {
  console.log('No Supabase credentials; skipping (a watchdog that cannot ask is not a failure).');
  process.exit(0);
}

const ask = async (table, column) => {
  const res = await fetch(
    `${URL_}/rest/v1/${table}?select=${column}&order=${column}.desc.nullslast&limit=1`,
    { headers: { apikey: KEY, Authorization: `Bearer ${KEY}` } }
  );
  if (!res.ok) throw new Error(`${table} -> ${res.status} ${res.statusText}`);
  const rows = await res.json();
  return rows.length ? rows[0][column] : null;
};

const stale = [];
let unreachable = 0;

for (const t of TABLES) {
  let newest;
  try {
    newest = await ask(t.table, t.column);
  } catch (err) {
    unreachable++;
    console.log(`  ??   ${t.table} - could not read (${err.message})`);
    continue;
  }
  if (!newest) {
    console.log(`  ??   ${t.table} - no rows at all, cannot judge staleness`);
    continue;
  }
  const ageH = (Date.now() - new Date(newest).getTime()) / 3_600_000;
  const bad = ageH > t.hours;
  const age = ageH >= 48 ? `${(ageH / 24).toFixed(1)} days` : `${ageH.toFixed(1)}h`;
  console.log(
    `  ${bad ? 'STALE' : 'ok   '} ${t.table} - newest ${newest} (${age} old, budget ${t.hours}h)`
  );
  if (bad) stale.push({ ...t, newest, age });
}

console.log('');

if (unreachable === TABLES.length) {
  // Cannot tell. NEVER an alarm - "I could not reach Supabase" is not evidence
  // about the fleet in either direction, and an alarm that fires on its own
  // misconfiguration gets muted.
  console.log('Could not reach Supabase for any table; reporting nothing.');
  process.exit(2);
}

if (stale.length === 0) {
  console.log(`OK - all ${TABLES.length} scraper-written tables are inside their budget.`);
  process.exit(0);
}

console.error('');
for (const s of stale) {
  console.error(`  ${s.table}: newest write ${s.newest} (${s.age} old) - ${s.why} has stopped.`);
}
console.error('');
console.error(
  '::error title=THE SCRAPER FLEET HAS STOPPED WRITING::' +
    stale.map((s) => `${s.table} is ${s.age} old`).join('; ') +
    '. Check the Mac daemons first: `launchctl list | grep smarter-poker` and ' +
    'data/tournament-logs/heartbeat.json. A daemon in a connect-failure loop ' +
    'still heartbeats and still reports KeepAlive-healthy, so look at ' +
    'consecutive_failures, not at whether the process exists.'
);
process.exit(1);
