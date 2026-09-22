/**
 * LAW: A CLUB'S TABLE COUNT HAS ONE WRITER, AND IT IS THE DATABASE.
 *
 * clubs.table_count is recomputed, never incremented, by three triggers on
 * public.tables and one on public.union_clubs (read from pg_trigger on
 * 2026-09-22):
 *
 *   trg_tables_sync_club_counts_ins    AFTER INSERT
 *   trg_tables_sync_club_counts_del    AFTER DELETE
 *   trg_tables_sync_club_counts_upd    AFTER UPDATE OF status, is_deleted,
 *                                      club_id, union_id, tournament_id
 *   trg_union_clubs_sync_table_counts  AFTER INSERT OR DELETE OR UPDATE
 *
 * Each one runs UPDATE clubs SET table_count = fn_live_table_count(id), and
 * fn_live_table_count counts a club's non-tournament tables that are neither
 * is_deleted nor in status closed or deleted.
 *
 * pages/api/club-arena/manage-table.js decremented the count again after its
 * own table UPDATE: first through decrement_club_table_count, and when that
 * call returned any error, by reading the count and writing count - 1 itself.
 * The trigger had already recomputed the count inside that UPDATE, so the
 * route took the deleted table off the club a second time. The Club Arena
 * migration three_watchers_whose_defects_were_fixed_stop_running dropped
 * decrement_club_table_count on 2026-09-20. From then on the call could only
 * answer PGRST202, so the write-back was the only branch left.
 *
 * The first half runs the real handler (node --experimental-vm-modules, as
 * build-safety-gate CHECK 8 runs this file through _test-guards-exist) against
 * an in-memory database that keeps the count the way those triggers do and
 * answers any function call the way PostgREST answers one that does not
 * exist. The second half reads the server side of this repository, so a blind
 * count writer cannot come back somewhere else.
 *
 * Recorded separately, not decided here: tables_status_check does not allow
 * status 'deleted', so production refuses the delete action's table write
 * today. Nothing below depends on that. The count law holds whether the
 * database accepts the table write or refuses it.
 */
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import vm from 'node:vm';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const ROUTE = 'pages/api/club-arena/manage-table.js';
const ACTOR = '11111111-1111-4111-8111-111111111111';
const CLUB = '22222222-2222-4222-8222-222222222222';
const TABLE = '33333333-3333-4333-8333-333333333333';
const OTHER_TABLES = ['44444444-4444-4444-8444-444444444444', '55555555-5555-4555-8555-555555555555'];

const plain = (value) => (value === undefined ? undefined : JSON.parse(JSON.stringify(value)));

// The route's CommonJS validators are pure, so they run for real, resolved from
// the route's own directory: the guards exercised are the ones production runs.
const routeRequire = createRequire(join(ROOT, ROUTE));
const REAL_HELPERS = new Set([
  '../../../src/lib/club-arena/redteam-validation',
  '../../../src/lib/club-arena/validate',
  '../../../src/lib/club-arena/sanitize',
  '../../../src/lib/club-arena/idempotency',
]);

/** fn_live_table_count, as the database defines it. */
function liveTableCount(tables, clubId) {
  return tables.filter(
    (t) =>
      t.club_id === clubId &&
      t.tournament_id == null &&
      t.is_deleted !== true &&
      !['closed', 'deleted'].includes(t.status),
  ).length;
}

/**
 * An in-memory database with the one behaviour this law is about: a write to a
 * table's status recomputes its club's table_count inside the same write, as
 * trg_tables_sync_club_counts_upd does. Any function call answers PGRST202.
 */
function database({ status, refuseTableWrites, fail }) {
  const rows = {
    club_members: [{ club_id: CLUB, user_id: ACTOR, role: 'owner' }],
    tables: [
      { id: TABLE, club_id: CLUB, status, name: 'Law Table', tournament_id: null, is_deleted: false },
      ...OTHER_TABLES.map((id) => ({
        id, club_id: CLUB, status: 'running', name: 'Other Table', tournament_id: null, is_deleted: false,
      })),
    ],
    clubs: [{ id: CLUB, union_id: null, table_count: 0 }],
  };
  rows.clubs[0].table_count = liveTableCount(rows.tables, CLUB);
  const log = { rpc: [], reads: [], writes: [] };

  const matches = (row, filters) =>
    filters.every(([kind, column, value]) => (kind === 'eq' ? row[column] === value : value.includes(row[column])));

  function execute(state, single) {
    const target = rows[state.table];
    if (!target) return fail(`Unexpected table: ${state.table}`);
    const entry = { table: state.table, op: state.op, payload: plain(state.payload) };
    if (state.op === 'select') {
      log.reads.push(entry);
      const found = target.filter((row) => matches(row, state.filters)).map((row) => ({ ...row }));
      return { data: single ? found[0] ?? null : found, error: null };
    }
    log.writes.push(entry);
    if (state.op !== 'update') return fail(`Unexpected ${state.op} on ${state.table}`);
    if (state.table === 'tables' && refuseTableWrites) {
      return {
        data: null,
        error: { code: '23514', message: 'new row for relation "tables" violates check constraint "tables_status_check"' },
      };
    }
    const hit = target.filter((row) => matches(row, state.filters));
    for (const row of hit) Object.assign(row, state.payload);
    if (state.table === 'tables' && hit.length > 0) {
      // trg_tables_sync_club_counts_upd -> fn_sync_club_table_counts()
      for (const club of rows.clubs) club.table_count = liveTableCount(rows.tables, club.id);
    }
    const returned = hit.map((row) => ({ id: row.id }));
    return { data: single ? returned[0] ?? null : returned, error: null };
  }

  function from(table) {
    const state = { table, op: 'select', payload: null, filters: [] };
    const query = {
      select() { return query; },
      update(payload) { state.op = 'update'; state.payload = payload; return query; },
      insert(payload) { state.op = 'insert'; state.payload = payload; return query; },
      upsert(payload) { state.op = 'upsert'; state.payload = payload; return query; },
      delete() { state.op = 'delete'; return query; },
      eq(column, value) { state.filters.push(['eq', column, value]); return query; },
      in(column, values) { state.filters.push(['in', column, [...values]]); return query; },
      maybeSingle: async () => execute(state, true),
      then(resolve, reject) {
        return Promise.resolve().then(() => execute(state, false)).then(resolve, reject);
      },
    };
    return query;
  }

  const client = {
    from,
    // PostgREST answers a function that does not exist with PGRST202, which is
    // what decrement_club_table_count has answered since 2026-09-20.
    async rpc(fn, args) {
      log.rpc.push({ fn, args: plain(args) });
      return { data: null, error: { code: 'PGRST202', message: `Could not find the function public.${fn} in the schema cache` } };
    },
  };
  return { rows, log, client };
}

async function invoke({ action, status, refuseTableWrites = false }) {
  assert.ok(vm.SourceTextModule, 'run with node --experimental-vm-modules, as build-safety-gate CHECK 8 does');
  const unexpected = [];
  const fail = (message) => {
    unexpected.push(message);
    throw new Error(message);
  };
  const db = database({ status, refuseTableWrites, fail });
  const engine = { closed: [], events: [] };
  const stubs = {
    // The legacy World Hub engine and bus; the Hetzner engine deals every table.
    '../../../src/lib/poker-engine/GameController': {
      getController: async () => ({
        closeTable: async (id) => { engine.closed.push(id); },
        lobby: { tables: new Map() },
      }),
    },
    '../../../src/engine/EventBus': { getBus: () => ({ emit: (name) => engine.events.push(name) }) },
  };
  const imports = {
    serverAuth: { getServerUserWithFallback: async () => ({ user: { id: ACTOR }, error: null }) },
    supabaseServerClient: { createClient: () => db.client },
    apiRateLimit: { applyRateLimit: () => true, LIMITS: { write: {} } },
    apiErrorHandler: { reportApiError: (error) => fail(`reportApiError: ${error?.message}`) },
  };
  const warnings = [];
  const context = vm.createContext({
    process: { env: Object.freeze({ SUPABASE_SERVICE_ROLE_KEY: 'local-law-test', NEXT_PUBLIC_SUPABASE_URL: 'http://127.0.0.1:9' }) },
    console: {
      warn: (...args) => warnings.push(args.map(String).join(' ')),
      error: (...args) => warnings.push(args.map(String).join(' ')),
      log: () => {},
    },
    require(specifier) {
      if (REAL_HELPERS.has(specifier)) return routeRequire(specifier);
      if (specifier in stubs) return stubs[specifier];
      return fail(`Unexpected require: ${specifier}`);
    },
  });
  // SourceTextModule executes the complete handler as written; only its
  // imports resolve to the stubs above, and an unknown one cannot resolve.
  const module = new vm.SourceTextModule(readFileSync(join(ROOT, ROUTE), 'utf8'), {
    context,
    identifier: ROUTE,
    importModuleDynamically: (specifier) => fail(`Unexpected dynamic import: ${specifier}`),
  });
  await module.link((specifier) => {
    const name = specifier.split('/').at(-1);
    if (!specifier.startsWith('../') || !imports[name]) return fail(`Unexpected import: ${specifier}`);
    const exported = imports[name];
    return new vm.SyntheticModule(Object.keys(exported), function () {
      for (const [key, value] of Object.entries(exported)) this.setExport(key, value);
    }, { context });
  });
  await module.evaluate();
  const req = {
    method: 'POST',
    headers: { authorization: 'Bearer local-law-test', 'x-idempotency-key': `law-${randomUUID()}` },
    body: { tableId: TABLE, clubId: CLUB, action },
  };
  const res = {
    statusCode: 200,
    headersSent: false,
    headers: {},
    setHeader(name, value) { this.headers[name] = value; },
    status(code) { this.statusCode = code; return this; },
    json(value) { this.body = plain(value); this.headersSent = true; return this; },
  };
  await module.namespace.default(req, res);
  assert.deepEqual(unexpected, [], 'no unstubbed dependency and no unexpected handler failure');
  return { db, res, engine, warnings };
}

const touchesClubs = (log) => log.reads.some((r) => r.table === 'clubs') || log.writes.some((w) => w.table === 'clubs');

const ACTIONS = [
  { action: 'close', from: 'running', to: 'closed' },
  { action: 'pause', from: 'running', to: 'paused' },
  { action: 'resume', from: 'paused', to: 'running' },
  { action: 'delete', from: 'waiting', to: 'deleted' },
];

for (const { action, from, to } of ACTIONS) {
  test(`${action} writes the table once and leaves the club's count to the database`, async () => {
    const { db, res } = await invoke({ action, status: from });
    assert.equal(res.statusCode, 200, JSON.stringify(res.body));
    assert.equal(res.body.success, true);
    assert.deepEqual(db.log.rpc, [], 'the route calls no function: the count is not its to keep');
    assert.deepEqual(db.log.writes.map((w) => `${w.op} ${w.table}`), ['update tables'], 'one write, to the table');
    assert.equal(db.log.writes[0].payload.status, to);
    assert.equal(touchesClubs(db.log), false, 'the route neither reads nor writes clubs');
    assert.equal(db.rows.clubs[0].table_count, liveTableCount(db.rows.tables, CLUB), 'the count is the live table count');
  });
}

test('deleting a waiting table takes exactly one table off the club, not two', async () => {
  // Three live tables before: this waiting one and two running. Two after.
  // The removed write-back read the recomputed 2 and wrote 1.
  const { db, res } = await invoke({ action: 'delete', status: 'waiting' });
  assert.equal(res.statusCode, 200, JSON.stringify(res.body));
  assert.equal(db.rows.clubs[0].table_count, 2);
});

test('a table write the database refuses is an error, and the count is still left alone', async () => {
  // The shape production answers today for status 'deleted' (tables_status_check).
  const { db, res } = await invoke({ action: 'delete', status: 'closed', refuseTableWrites: true });
  assert.equal(res.statusCode, 500, JSON.stringify(res.body));
  assert.equal(res.body.success, false);
  assert.deepEqual(db.log.rpc, []);
  assert.equal(touchesClubs(db.log), false);
  assert.equal(db.rows.clubs[0].table_count, 2, 'a closed table was never counted, so nothing moves');
});

// ---------------------------------------------------------------------------
// No blind count writer anywhere on the server side.
// ---------------------------------------------------------------------------

const SERVER_ROOTS = ['pages', 'src', 'lib'];
const SOURCE_FILE = /\.(?:js|jsx|mjs|cjs|ts|tsx)$/;

function sourceFiles() {
  const out = [];
  const walk = (dir) => {
    for (const name of readdirSync(dir)) {
      if (name === 'node_modules' || name.startsWith('.')) continue;
      const full = join(dir, name);
      if (statSync(full).isDirectory()) walk(full);
      else if (SOURCE_FILE.test(name)) out.push(full);
    }
  };
  for (const root of SERVER_ROOTS) walk(join(ROOT, root));
  return out;
}

const lineOf = (source, index) => source.slice(0, index).split('\n').length;

/** Every place a source text writes a club's table count itself. */
function blindCountWriters(source) {
  const found = [];
  for (const m of source.matchAll(/\.rpc\(\s*['"`]((?:increment|decrement)_club_table_count)['"`]/g)) {
    found.push({ line: lineOf(source, m.index), what: `rpc ${m[1]}` });
  }
  for (const m of source.matchAll(/\.from\(\s*['"`]clubs['"`]\s*\)/g)) {
    const end = source.indexOf(';', m.index);
    const statement = source.slice(m.index, end === -1 ? source.length : end);
    if (/\.(?:update|insert|upsert)\(/.test(statement) && /\btable_count\b/.test(statement)) {
      found.push({ line: lineOf(source, m.index), what: 'clubs.table_count write' });
    }
  }
  return found;
}

test('the detector sees the writer it exists to keep out', () => {
  const removed = [
    "const { error: rpcErr } = await getSupabase().rpc('decrement_club_table_count', { p_club_id: clubId });",
    'if (rpcErr) {',
    "  const { data: club } = await getSupabase().from('clubs').select('table_count').eq('id', clubId).maybeSingle();",
    "  const { error: e } = await getSupabase().from('clubs').update({ table_count: Math.max(0, (club.table_count || 1) - 1) }).eq('id', clubId);",
    '}',
  ].join('\n');
  assert.deepEqual(
    blindCountWriters(removed).map((f) => f.what),
    ['rpc decrement_club_table_count', 'clubs.table_count write'],
  );
  assert.deepEqual(blindCountWriters("await sb.from('clubs').select('id, table_count').eq('id', x);"), [], 'a read is not a write');
});

test('nothing on the server side writes a club table count itself', () => {
  const files = sourceFiles();
  assert.ok(files.length > 500, `walked ${files.length} files: the walk did not reach the tree`);
  const offenders = [];
  for (const file of files) {
    for (const f of blindCountWriters(readFileSync(file, 'utf8'))) {
      offenders.push(`${relative(ROOT, file)}:${f.line} ${f.what}`);
    }
  }
  assert.deepEqual(
    offenders,
    [],
    'clubs.table_count belongs to trg_tables_sync_club_counts_* and trg_union_clubs_sync_table_counts',
  );
});
