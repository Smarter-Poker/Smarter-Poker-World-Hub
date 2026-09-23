/**
 * LAW: CLUB STATS MAINTENANCE DOES THE PERIODIC WORK, NOT A WRITER'S REPAIRS.
 *
 * pages/api/cron/club-stats-maintenance.js runs every 15 minutes from Open
 * Claw. Until 2026-09-22 it also ran three repairs for work a writer owns,
 * measured on production that day:
 *
 *   fn_reconcile_club_member_daily_profit   a second scheduler of what pg_cron
 *     job reconcile-club-member-daily-profit runs at 00:35 with a 300s
 *     timeout. Since 2026-09-19 only the first successful call of a day
 *     corrected a row; 147 calls in 7 days were cancelled by the 8s timeout.
 *     From 2026-09-23 the function only measures.
 *   ca_clubs_with_rebuild_backlog + ca_drain_club_rebuild   a history backfill
 *     with no history left (0 pending tables created before 2026-08-20). It
 *     re-derived 36,195 live-maintained tables in 7 days, and a table rebuilt
 *     while it was being dealt came out with more hands_played than
 *     hand_history holds (219 member-table-days on 93 tables in six hours;
 *     0 on tables rebuilt while idle or never rebuilt).
 *   ca_clubs_missing_hand_daily + ca_backfill_club_hand_daily   a roll-forward
 *     the shard trigger made redundant: nothing rolled in 3,097 runs.
 *
 * The first test runs the real handler (node --experimental-vm-modules) and
 * records every RPC it makes; the second keeps the repairs from being
 * scheduled from any other server route. Both assert the other direction too:
 * the periodic steps (snapshot, hand index, stat rollup, distribution) and the
 * heartbeat must still run, because deleting them would pass a naive "the
 * repair is gone" check while breaking the stats page.
 */
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import vm from 'node:vm';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const ROUTE = 'pages/api/cron/club-stats-maintenance.js';

/** Repairs whose owners are the live writers and pg_cron, never this schedule. */
const REPAIRS = [
  'fn_reconcile_club_member_daily_profit',
  'ca_clubs_with_rebuild_backlog',
  'ca_drain_club_rebuild',
  'ca_rebuild_table_chunk',
  'ca_rebuild_club_member_stats',
  'ca_rebuild_club_member_stats_table',
  'ca_clubs_missing_hand_daily',
  'ca_backfill_club_hand_daily',
];

/** The periodic steps this route exists for, in the order it runs them. */
const PERIODIC = [
  'fn_snapshot_player_stats_if_missing',
  'fn_snapshot_health',
  'ca_refresh_hand_player_index',
  'ca_roll_hand_stats_forward',
  'ca_refresh_stat_distribution',
];

const ANSWERS = {
  fn_snapshot_player_stats_if_missing: { healed: false, reason: 'snapshot_already_present' },
  fn_snapshot_health: { today_captured: true, missing_days: [], missing_count: 0 },
  ca_refresh_hand_player_index: [{ hands_indexed: 0 }],
  ca_roll_hand_stats_forward: 0,
  ca_refresh_stat_distribution: { refreshed: true },
};

async function runHandler() {
  assert.ok(vm.SourceTextModule, 'run with node --experimental-vm-modules, as build-safety-gate CHECK 8 does');
  const calls = { rpc: [], heartbeats: [], unexpected: [] };
  const fail = (message) => {
    calls.unexpected.push(message);
    throw new Error(message);
  };
  const admin = {
    rpc(name, args) {
      calls.rpc.push({ name, args: args ?? null });
      const answer = Object.hasOwn(ANSWERS, name)
        ? { data: ANSWERS[name], error: null }
        : { data: null, error: { message: `this law's database does not answer ${name}` } };
      return { abortSignal: () => Promise.resolve(answer) };
    },
    from(table) {
      if (table !== 'probe_heartbeats') return fail(`Unexpected table: ${table}`);
      return {
        insert(row) {
          calls.heartbeats.push(row);
          return { abortSignal: () => Promise.resolve({ error: null }) };
        },
      };
    },
  };
  const imports = {
    '@supabase/supabase-js': { createClient: () => admin },
    '../../../src/utils/cron-auth': { validateCronAuth: () => true },
    '../../../src/lib/cronHealth': { withCronHealth: (_name, handler) => handler },
  };
  const context = vm.createContext({
    process: { env: Object.freeze({ NEXT_PUBLIC_SUPABASE_URL: 'http://127.0.0.1:9', SUPABASE_SERVICE_ROLE_KEY: 'local-law-test' }) },
    console: { warn: (...args) => fail(`warned: ${args.map(String).join(' ')}`), log: () => {}, error: () => {} },
    setTimeout,
    clearTimeout,
    AbortController,
    AbortSignal,
  });
  const module = new vm.SourceTextModule(readFileSync(join(ROOT, ROUTE), 'utf8'), {
    context,
    identifier: ROUTE,
    importModuleDynamically: (specifier) => fail(`Unexpected dynamic import: ${specifier}`),
  });
  await module.link((specifier) => {
    const exported = imports[specifier];
    if (!exported) return fail(`Unexpected import: ${specifier}`);
    return new vm.SyntheticModule(Object.keys(exported), function () {
      for (const [key, value] of Object.entries(exported)) this.setExport(key, value);
    }, { context });
  });
  await module.evaluate();
  const res = {
    statusCode: 200,
    headers: {},
    setHeader(name, value) { this.headers[name] = value; },
    status(code) { this.statusCode = code; return this; },
    json(value) { this.body = value; return this; },
  };
  await module.namespace.default({ method: 'GET', headers: {} }, res);
  assert.deepEqual(calls.unexpected, [], 'no unstubbed dependency and no unexpected handler failure');
  return { calls, res };
}

test('a run makes exactly the periodic calls, and none of the repairs', async () => {
  const { calls, res } = await runHandler();
  const names = calls.rpc.map((c) => c.name);
  assert.deepEqual(names.filter((n) => REPAIRS.includes(n)), [], 'a repair was scheduled from this route');
  assert.deepEqual(names, PERIODIC, 'the periodic steps run, in order, and nothing else does');
  assert.equal(res.statusCode, 200, JSON.stringify(res.body));
  assert.equal(res.body.status, 'ok', JSON.stringify(res.body.errors));
  assert.equal(calls.heartbeats.length, 1, 'every run still records its heartbeat');
  assert.equal(calls.heartbeats[0].probe_name, 'club-stats-maintenance');
  assert.equal(calls.heartbeats[0].status, 'ok');
});

// ---------------------------------------------------------------------------
// The repairs cannot move to another scheduled or server route either.
// ---------------------------------------------------------------------------

/** The source with comments blanked, so a header naming a repair is not a call. */
function code(source) {
  let out = '';
  let i = 0;
  let quote = null;
  while (i < source.length) {
    const ch = source[i];
    if (quote) {
      out += ch;
      if (ch === '\\') { out += source[i + 1] ?? ''; i += 2; continue; }
      if (ch === quote) quote = null;
      i += 1;
      continue;
    }
    if (ch === '"' || ch === "'" || ch === '`') { quote = ch; out += ch; i += 1; continue; }
    if (ch === '/' && source[i + 1] === '/') {
      const end = source.indexOf('\n', i);
      i = end === -1 ? source.length : end;
      continue;
    }
    if (ch === '/' && source[i + 1] === '*') {
      const end = source.indexOf('*/', i + 2);
      const block = source.slice(i, end === -1 ? source.length : end + 2);
      out += block.replace(/[^\n]/g, ' ');
      i += block.length;
      continue;
    }
    out += ch;
    i += 1;
  }
  return out;
}

function sourceFiles(roots) {
  const out = [];
  const walk = (dir) => {
    for (const name of readdirSync(dir)) {
      if (name === 'node_modules' || name.startsWith('.')) continue;
      const full = join(dir, name);
      if (statSync(full).isDirectory()) walk(full);
      else if (/\.(?:js|jsx|mjs|cjs|ts|tsx)$/.test(name)) out.push(full);
    }
  };
  for (const root of roots) walk(join(ROOT, root));
  return out;
}

test('the comment stripper keeps calls and drops prose', () => {
  const sample = [
    '/* fn_reconcile_club_member_daily_profit was here */',
    "// rpc('ca_drain_club_rebuild')",
    "const url = 'https://example.invalid/a//b';",
    "await rpc('ca_refresh_hand_player_index');",
  ].join('\n');
  const stripped = code(sample);
  assert.doesNotMatch(stripped, /fn_reconcile_club_member_daily_profit|ca_drain_club_rebuild/);
  assert.match(stripped, /https:\/\/example\.invalid\/a\/\/b/);
  assert.match(stripped, /rpc\('ca_refresh_hand_player_index'\)/);
});

test('no server route calls one of the repairs', () => {
  const files = sourceFiles(['pages', 'src', 'lib']);
  assert.ok(files.length > 500, `walked ${files.length} files: the walk did not reach the tree`);
  const pattern = new RegExp(`['"\`](${REPAIRS.join('|')})['"\`]`, 'g');
  const offenders = [];
  for (const file of files) {
    const text = code(readFileSync(file, 'utf8'));
    for (const m of text.matchAll(pattern)) {
      offenders.push(`${relative(ROOT, file)}:${text.slice(0, m.index).split('\n').length} ${m[1]}`);
    }
  }
  assert.deepEqual(offenders, [], 'the live writers and pg_cron own this work, not a World Hub schedule');
});
