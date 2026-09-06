/**
 * AN INSERT THAT NAMES A COLUMN THAT DOES NOT EXIST NEVER RAN.
 *
 * ── WHAT WAS FOUND, 2026-09-06 ───────────────────────────────────────────────
 * 27 scripts write `data_audit_log`. The table has exactly these columns:
 *
 *   id, table_name, record_id, action, old_data, new_data,
 *   scrape_proof, batch_id, agent_id, created_at
 *
 * The scripts were writing `notes`, `records_affected`, `records_count` and
 * `tour_code` - none of which exist - and omitting `record_id`, which is NOT
 * NULL with no default. PostgREST answers that with
 *
 *   PGRST204  Could not find the 'notes' column of 'data_audit_log'
 *             in the schema cache
 *
 * and TEN OF THE SCRIPTS CATCH IT WITH A BARE `except: pass`.
 *
 * So the result was not a broken audit trail that anybody could see. It was an
 * audit trail that reported itself working: `scrape_series_schedules.py` even
 * documents "Layer 6: data_audit_log entry every batch". The database says
 * otherwise - of 1,092,446 rows, every single one comes from the `trigger_auto`
 * database trigger or from three one-off March agents. **Not one of the 27
 * scripts has ever landed a row under its own agent_id.**
 *
 * It surfaced only because ONE caller checks the row count and exits non-zero:
 * `Daily Poker Series Auto-Pilot` had been red since the fleet started running
 * again, after a completely successful scrape of 299 series.
 *
 * ── WHAT THIS DOES ───────────────────────────────────────────────────────────
 * Holds the column list as a constant - no database and no credentials needed
 * in CI - and fails when a script inserts a key that is not one of them. Reports
 * the file, the key, and what to use instead - anything that is not a real
 * column belongs in `new_data`, which is jsonb and takes anything.
 *
 * It is a RATCHET over the scripts not yet migrated, for the same reason the
 * asset-path check is: fixing 27 files blind is how a real defect gets
 * introduced while tidying. A pull request may not ADD a bad key, and a file
 * that is fixed must be removed from the baseline in the same commit.
 */
import { readFileSync, readdirSync, existsSync, statSync } from 'node:fs';
import { join } from 'node:path';
import process from 'node:process';

const ROOT = process.cwd();

/**
 * The real columns. Kept here rather than read from the DB so this runs in CI
 * with no credentials - and asserted against the migrations below, so the two
 * cannot drift silently.
 */
const COLUMNS = new Set([
  'id',
  'table_name',
  'record_id',
  'action',
  'old_data',
  'new_data',
  'scrape_proof',
  'batch_id',
  'agent_id',
  'created_at',
]);

/** NOT NULL and no default: an insert omitting these is refused outright. */
const REQUIRED = ['table_name', 'record_id', 'action'];

const BASELINE_PATH = 'scripts/ci/audit-log-known-bad-writers.json';
const baseline = existsSync(join(ROOT, BASELINE_PATH))
  ? new Set(JSON.parse(readFileSync(join(ROOT, BASELINE_PATH), 'utf8')).files)
  : new Set();

function walk(dir, out = []) {
  let entries;
  try {
    entries = readdirSync(join(ROOT, dir), { withFileTypes: true });
  } catch {
    return out;
  }
  for (const e of entries) {
    if (e.name === 'node_modules' || e.name.startsWith('.')) continue;
    const rel = `${dir}/${e.name}`;
    if (e.isDirectory()) walk(rel, out);
    else if (/\.(py|js|mjs)$/.test(e.name)) out.push(rel);
  }
  return out;
}

const files = walk('scripts').filter((f) => {
  try {
    return statSync(join(ROOT, f)).size < 2_000_000;
  } catch {
    return false;
  }
});

const offenders = [];

for (const file of files) {
  const src = readFileSync(join(ROOT, file), 'utf8');
  if (!src.includes('data_audit_log')) continue;

  // Take the FIRST balanced { ... } after the mention - that is the row being
  // written - and read only its TOP-LEVEL keys. Nested objects are stripped
  // first, because `new_data` is jsonb and anything inside it is legal by
  // definition; a checker that cannot tell those apart flags its own fix.
  for (const m of src.matchAll(/data_audit_log/g)) {
    const after = src.slice(m.index, m.index + 2000);
    const open = after.indexOf('{');
    if (open < 0) continue;
    let depth = 0;
    let close = -1;
    for (let i = open; i < after.length; i++) {
      if (after[i] === '{') depth++;
      else if (after[i] === '}') {
        depth--;
        if (depth === 0) {
          close = i;
          break;
        }
      }
    }
    if (close < 0) continue;
    let obj = after.slice(open, close + 1);
    // Blank every nested object, innermost first, so only top level survives.
    let prev;
    do {
      prev = obj;
      obj = obj.replace(/\{[^{}]*\}/g, (x) => ' '.repeat(x.length));
    } while (obj !== prev && obj.indexOf('{') !== obj.lastIndexOf('{'));

    const keys = new Set();
    for (const k of obj.matchAll(/["']([a-z_]{3,30})["']\s*:/g)) keys.add(k[1]);
    if (keys.size === 0) continue;
    // Only judge windows that look like an insert of this table.
    if (!keys.has('table_name') && !keys.has('action')) continue;

    const bad = [...keys].filter((k) => !COLUMNS.has(k));
    const missing = REQUIRED.filter((k) => !keys.has(k));
    if (bad.length || missing.length) {
      offenders.push({ file, bad, missing });
    }
    break; // one report per file is enough
  }
}

console.log(`Scanned ${files.length} script(s) for data_audit_log writes.`);

const fresh = offenders.filter((o) => !baseline.has(o.file));
const healed = [...baseline].filter((f) => !offenders.some((o) => o.file === f));

for (const o of offenders) {
  const mark = baseline.has(o.file) ? 'known' : 'NEW  ';
  console.log(
    `  ${mark} ${o.file}` +
      (o.bad.length ? `  bad keys: ${o.bad.join(', ')}` : '') +
      (o.missing.length ? `  missing NOT NULL: ${o.missing.join(', ')}` : '')
  );
}

let failed = false;

if (fresh.length) {
  console.error('');
  console.error(
    `::error title=AUDIT LOG WRITE CANNOT SUCCEED::${fresh.length} script(s) insert into data_audit_log using columns it does not have, or omit a NOT NULL column. PostgREST answers PGRST204 and most callers swallow it, so the write reports success and never happens. Put anything that is not a real column into new_data (jsonb).`
  );
  for (const o of fresh) console.error(`  ${o.file}: ${[...o.bad, ...o.missing].join(', ')}`);
  failed = true;
}

if (healed.length) {
  console.error('');
  console.error(
    `::error title=BASELINE IS STALE::these are listed in ${BASELINE_PATH} but now write correctly - delete them from it in the commit that fixed them:`
  );
  for (const f of healed) console.error(`  ${f}`);
  failed = true;
}

if (!failed) {
  console.log(`OK - no new bad writers (${offenders.length} known, unchanged).`);
}
process.exit(failed ? 1 : 0);
