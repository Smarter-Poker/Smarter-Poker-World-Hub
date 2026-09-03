/**
 * Static checks over the Phase 3 migration text. No database.
 *
 * These are the checks a rolled-back SQL simulation cannot make, because
 * they are about the SHAPE of the file rather than the behaviour of the
 * schema: that every table, function, index and seed the contract names
 * is actually created, that the seeded global policy row really is
 * permissive, that every function is locked to service_role in this same
 * file, that the read RPCs do not attempt an audit row and the write RPCs
 * do, and that nothing in the file touches a table it did not create.
 *
 * Behaviour lives in docs/horses/PHASE3-SIM.sql. This file is the guard
 * against the migration drifting away from docs/horses/PHASE3-CONTRACTS.md
 * while still applying cleanly.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const repo = join(here, '..');

/**
 * THE VERSION SORTS ABOVE EVERY APPLIED ONE (review L-5).
 *
 * 20260903120000, 20260903121500, 20260903140000 and 20260903202500 are
 * applied and registered in production, and other branches have claimed
 * slots through 2026090316xx to 2026090320xx (the previous commit records
 * 20260903170000 being taken out from under this file). `supabase db push`
 * refuses to insert a migration that sorts BEFORE the last remote one
 * without --include-all, so this file takes the first free slot above the
 * newest applied version rather than a contested one below it.
 */
const MIGRATION_PATH = join(
  repo,
  'supabase/migrations/20260903222000_ca_horse_fleet_command.sql'
);
const SIM_PATH = join(repo, 'docs/horses/PHASE3-SIM.sql');
const CONTRACT_PATH = join(repo, 'docs/horses/PHASE3-CONTRACTS.md');

const sql = readFileSync(MIGRATION_PATH, 'utf8');
const sim = readFileSync(SIM_PATH, 'utf8');
const contract = readFileSync(CONTRACT_PATH, 'utf8');

/** The migration with every `--` comment line removed, so a check for a
 *  statement never matches prose or the ROLLBACK section, which is
 *  entirely commented out on purpose. */
const code = sql
  .split('\n')
  .filter((line) => !line.trim().startsWith('--'))
  .join('\n');

/** The commented ROLLBACK section on its own. */
const rollbackSection = sql.slice(sql.indexOf('-- ROLLBACK'));

/** The header, which is where every decision in this file is explained. */
const header = sql.slice(0, sql.indexOf('set local lock_timeout'));

/** Every migration in the tree, so a version collision cannot ship. */
const MIGRATION_DIR = join(repo, 'supabase/migrations');

/** Versions already applied and registered in production. */
const APPLIED_VERSIONS = ['20260903120000', '20260903121500', '20260903140000', '20260903202500'];

/** One function's body, from CREATE to the closing $fn$;. */
function body(fn) {
  const start = code.indexOf(`create or replace function public.${fn}`);
  assert.ok(start > -1, `function not found: ${fn}`);
  return code.slice(start, code.indexOf('$fn$;', start) + 5);
}

/** The four tables contract section 1 names. */
const TABLES = [
  'ca_horse_fleet_policy',
  'ca_horse_fleet_state',
  'ca_horse_fleet_heartbeat',
  'ca_horse_fleet_register',
];

/** The seven RPCs contract section 1 names, with the argument type list
 *  each is declared and revoked and granted with. */
const FUNCTIONS = {
  fn_ca_fleet_policy_effective: 'uuid',
  fn_ca_fleet_set_policy: 'text, uuid, jsonb, uuid, text',
  fn_ca_fleet_state_upsert: 'jsonb, jsonb',
  fn_ca_fleet_overview: 'int',
  fn_ca_fleet_isolation_report: 'int, int',
  fn_ca_fleet_pnl: 'date, date, uuid',
  fn_ca_fleet_register_sync: 'uuid',
};

const FUNCTION_NAMES = Object.keys(FUNCTIONS);

/**
 * The four PURE READS. None of them carries an actor, and production's
 * fn_log_admin_action REFUSES a null actor, so a read that tried to audit
 * could only ever write a failure into a raise notice and claim a trail
 * it never had. Phase 2 shipped exactly that defect and had to correct it
 * in 20260903121500. These four must not mention fn_log_admin_action at
 * all.
 */
const READ_ONLY = [
  'fn_ca_fleet_policy_effective',
  'fn_ca_fleet_overview',
  'fn_ca_fleet_isolation_report',
  'fn_ca_fleet_pnl',
];

/** The two operator WRITES. Both audit. */
const AUDITING_WRITES = ['fn_ca_fleet_set_policy', 'fn_ca_fleet_register_sync'];

/**
 * Machine telemetry, written once per engine cycle. Contract section 1
 * says it files no audit row, and it is listed apart from the reads so
 * the count of non-auditing functions cannot be padded.
 */
const TELEMETRY = ['fn_ca_fleet_state_upsert'];

/** Every table this file is allowed to write to: the four it creates. */
const OWN_TABLES = new Set(TABLES);

// ------------------------------------------------------------------ shape

test('every contract table is created', () => {
  for (const table of TABLES) {
    assert.match(
      code,
      new RegExp(`create table if not exists public\\.${table}\\s*\\(`),
      `missing: create table ${table}`
    );
  }
  // And the contract names no fifth table this file forgot.
  const named = [...contract.matchAll(/`(ca_horse_fleet_[a-z_]+)\(/g)].map((m) => m[1]);
  for (const table of new Set(named)) {
    assert.ok(TABLES.includes(table), `the contract names table ${table} and the migration does not create it`);
  }
});

test('every contract function is created', () => {
  for (const fn of FUNCTION_NAMES) {
    assert.match(
      code,
      new RegExp(`create or replace function public\\.${fn}\\s*\\(`),
      `missing: create or replace function ${fn}`
    );
  }
  // And the contract names no eighth function this file forgot.
  const named = [...contract.matchAll(/`(fn_ca_fleet_[a-z_]+)\(/g)].map((m) => m[1]);
  for (const fn of new Set(named)) {
    assert.ok(FUNCTION_NAMES.includes(fn), `the contract names ${fn} and the migration does not create it`);
  }
  // Exactly seven, so a helper cannot creep in unnoticed.
  const created = [...code.matchAll(/create or replace function public\.([a-z_]+)\s*\(/g)].map((m) => m[1]);
  assert.deepEqual(
    [...new Set(created)].sort(),
    [...FUNCTION_NAMES].sort(),
    `the migration creates [${created.join(', ')}]`
  );
});

test('the four indexes the contract asks for are created', () => {
  const required = {
    'state by state': /create index if not exists ca_horse_fleet_state_state_idx\s+on public\.ca_horse_fleet_state \(state\)/,
    'state by club': /create index if not exists ca_horse_fleet_state_club_idx\s+on public\.ca_horse_fleet_state \(club_id, state\)/,
    'heartbeat newest first': /create index if not exists ca_horse_fleet_heartbeat_beat_at_idx\s+on public\.ca_horse_fleet_heartbeat \(beat_at desc\)/,
    'policy by scope and scope_id': /create index if not exists ca_horse_fleet_policy_scope_idx\s+on public\.ca_horse_fleet_policy \(scope, scope_id\)/,
  };
  for (const [what, re] of Object.entries(required)) {
    assert.match(code, re, `missing index for ${what}`);
  }
  // Every index this file creates is on a table this file creates.
  const indexes = [...code.matchAll(/create (?:unique )?index if not exists [a-z_]+\s+on public\.([a-z_]+)/g)].map(
    (m) => m[1]
  );
  assert.ok(indexes.length >= 4, `expected at least four indexes, found ${indexes.length}`);
  for (const table of indexes) {
    assert.ok(OWN_TABLES.has(table), `index on a table this file does not create: ${table}`);
  }
});

test('the policy primary key collapses a null scope_id to the sentinel, as the contract writes it', () => {
  // The contract asks for primary key (scope, coalesce(scope_id, zero)).
  // Postgres has no expression primary key, so the coalesce is a stored
  // generated column and the key is (scope, scope_key).
  assert.match(
    code,
    /scope_key\s+uuid generated always as\s*\n?\s*\(coalesce\(scope_id, '00000000-0000-0000-0000-000000000000'::uuid\)\) stored/,
    'scope_key is not the stored coalesce the contract key needs'
  );
  assert.match(code, /primary key \(scope, scope_key\)/, 'the policy primary key is not (scope, scope_key)');
  assert.match(code, /check \(scope in \('global', 'club', 'union'\)\)/, 'scope is not constrained to the three the contract names');
  // The deviation is explained rather than left for a reader to find.
  // The comment wraps across lines, so match the distinctive phrase only.
  assert.match(sql, /Postgres has no expression/i, 'the generated-column deviation is not explained');
});

test('the state table constrains state to the eight the contract names', () => {
  const states = ['idle', 'seated', 'playing', 'sitting_out', 'busted', 'suspended', 'retired', 'unknown'];
  const check = code.slice(code.indexOf('ca_horse_fleet_state_state_known'));
  for (const state of states) {
    assert.ok(check.slice(0, 400).includes(`'${state}'`), `state ${state} is not allowed by the check constraint`);
  }
});

// ------------------------------------------------------------ safe state

test('the seeded global row is permissive: reading it changes nothing', () => {
  const seed = code.slice(
    code.indexOf('insert into public.ca_horse_fleet_policy ('),
    code.indexOf('on conflict (scope, scope_key) do nothing;')
  );
  assert.ok(seed.length > 0, 'the global policy seed is missing');
  // enabled true, pause false, no caps, bias 1.0, min_humans 0, no
  // bands, no variants, no schedule. Written as one values tuple.
  assert.match(
    seed,
    /'global', null, true, false, null, null,\s*\n?\s*1\.0, 0, null, null, null,/,
    'the global seed is not the permissive tuple contract section 0 requires'
  );
  assert.match(seed, /on conflict \(scope, scope_key\)|values \(/);
  // Exactly one insert into the policy table, so there cannot be a
  // second global row hiding further down.
  const inserts = code.match(/insert into public\.ca_horse_fleet_policy/g) || [];
  assert.equal(
    inserts.length,
    3,
    'expected exactly three policy inserts: the seed, the upsert inside set_policy, and the probe in the assertion savepoint'
  );
});

test('the column defaults are today behaviour', () => {
  assert.match(code, /enabled\s+boolean default true/);
  assert.match(code, /pause_new_seatings\s+boolean default false/);
  assert.match(code, /occupancy_bias\s+numeric default 1\.0/);
  assert.match(code, /min_humans_to_seat\s+int default 0/);
  // The steering columns are NULLABLE, or a club row could not leave a
  // field to the global row.
  for (const column of [
    'enabled',
    'pause_new_seatings',
    'max_horses',
    'max_per_table',
    'occupancy_bias',
    'min_humans_to_seat',
  ]) {
    const line = code.split('\n').find((l) => l.trim().startsWith(`${column} `));
    assert.ok(line, `column not found: ${column}`);
    assert.ok(
      !/not null/.test(line),
      `${column} is NOT NULL, so a club row could never leave it to the global row: ${line.trim()}`
    );
  }
});

test('the effective policy fails open to the hardcoded defaults', () => {
  const fn = body('fn_ca_fleet_policy_effective');
  // The last coalesce argument of each merge is the hardcoded default,
  // which is today's behaviour, which is what makes an empty table safe.
  assert.match(fn, /v_enabled\s*:=\s*coalesce\([^)]*true\)/, 'enabled does not default to true');
  assert.match(fn, /v_pause\s*:=\s*coalesce\([^)]*false\)/, 'pause_new_seatings does not default to false');
  assert.match(fn, /v_bias\s*:=\s*coalesce\([^)]*1\.0\)/, 'occupancy_bias does not default to 1.0');
  assert.match(fn, /v_min_hum\s*:=\s*coalesce\([^)]*0\)/, 'min_humans_to_seat does not default to 0');
  // And it names which row supplied each field, which is what the
  // contract asks `source` for.
  assert.match(fn, /'source', jsonb_build_object\(/);
  for (const field of [
    'enabled',
    'pause_new_seatings',
    'max_horses',
    'max_per_table',
    'occupancy_bias',
    'min_humans_to_seat',
    'stake_bands',
    'variants',
    'schedule',
  ]) {
    assert.ok(fn.includes(`'${field}',`), `the effective policy does not report ${field}`);
  }
  assert.match(sql, /FAILS OPEN/i, 'the fail-open guarantee is not stated in the header');
});

test('nothing in the file can remove a seated horse', () => {
  // No DELETE anywhere, and no UPDATE of a table this file does not
  // create. The kill switch stops NEW seatings and nothing else.
  assert.ok(!/delete\s+from/i.test(code), 'the migration deletes rows');
  assert.ok(!/truncate/i.test(code), 'the migration truncates a table');
  const updates = [...code.matchAll(/update\s+public\.([a-z_]+)/gi)].map((m) => m[1]);
  for (const table of updates) {
    assert.ok(OWN_TABLES.has(table), `UPDATE on a table this file does not create: ${table}`);
  }
  assert.match(sql, /stops NEW seatings|seat nobody NEW/i, 'the kill switch is not explained as new-seatings-only');
});

test('the migration asserts its own safe state before it finishes', () => {
  const block = code.slice(code.lastIndexOf('do $assert$'));
  assert.ok(block.length > 0, 'there is no assertion block');
  assert.match(block, /exactly one global policy row/i);
  assert.match(block, /must be enabled/i);
  assert.match(block, /must not pause seatings/i);
  assert.match(block, /must carry no caps/i);
  assert.match(block, /occupancy_bias must be 1\.0/i);
  assert.match(block, /min_humans_to_seat must be 0/i);
  assert.match(block, /fn_ca_fleet_policy_effective\(null\)/);
  assert.match(block, /did not override occupancy_bias/i);
  assert.match(block, /did not fall through to the global row/i);
  assert.match(block, /isolation report/i);
  assert.match(block, /not idempotent/i);
  const raises = block.match(/raise exception/g) || [];
  assert.ok(raises.length >= 12, `expected at least 12 assertions, found ${raises.length}`);
});

test('the probe rows are written inside a savepoint that is rolled back', () => {
  const block = code.slice(code.lastIndexOf('do $assert$'));
  // The plpgsql savepoint idiom: a BEGIN ... EXCEPTION block, undone by
  // raising a private sqlstate at the end of it.
  assert.match(block, /raise exception using errcode = 'XXPRB'/, 'no private sqlstate to roll the probe back with');
  assert.match(block, /when sqlstate 'XXPRB' then/, 'the probe rollback is never caught');
  // And it proves the rows really are gone.
  assert.match(block, /probe policy row survived/i);
  assert.match(block, /probe state row survived/i);
  assert.match(block, /probe heartbeat survived/i);
  assert.match(sql, /BEGIN \.\.\. EXCEPTION block IS a savepoint/i, 'the savepoint idiom is not explained');
});

// ------------------------------------------------ the review's fixes, pinned

test('the version sorts above every applied migration and collides with none', () => {
  const files = readdirSync(MIGRATION_DIR).filter((f) => f.endsWith('.sql'));
  const mine = files.find((f) => f.includes('ca_horse_fleet_command'));
  assert.ok(mine, 'the fleet command migration is not in supabase/migrations');
  const version = mine.slice(0, 14);
  assert.match(version, /^\d{14}$/, `the version is not a 14 digit stamp: ${mine}`);

  // Nothing else in the tree claims it.
  const versions = files.map((f) => f.slice(0, 14));
  assert.equal(
    versions.filter((v) => v === version).length,
    1,
    `two migrations claim version ${version}`
  );
  // And it sorts above every version production has already registered, so
  // `supabase db push` does not need --include-all to insert it.
  for (const applied of APPLIED_VERSIONS) {
    assert.ok(files.some((f) => f.startsWith(applied)), `an applied migration is missing: ${applied}`);
    assert.ok(
      version > applied,
      `${version} sorts before the applied ${applied}, so a push would refuse it`
    );
  }
  // The file names its own version in the seed comment, which is where an
  // operator reading the policy row finds out what put it there.
  assert.ok(
    sql.includes(`Seeded by ${version}`),
    'the seeded global row does not name the migration that wrote it'
  );
});

test('the set local lines sit inside the file\'s own transaction (L-6)', () => {
  const begin = sql.indexOf('\nbegin;\n');
  const commit = sql.lastIndexOf('\ncommit;\n');
  assert.ok(begin > -1, 'the migration opens no explicit transaction');
  assert.ok(commit > begin, 'the migration never commits its explicit transaction');
  for (const line of ['set local lock_timeout', 'set local statement_timeout']) {
    const at = sql.indexOf(line);
    assert.ok(at > begin && at < commit, `${line} sits outside the begin/commit, so it is a no-op`);
  }
  // The assertion block runs before the commit, so a failed assertion undoes
  // the whole migration rather than leaving half of it applied.
  assert.ok(sql.indexOf('do $assert$') < commit, 'the assertion block runs after the commit');
  assert.match(header, /EXPLICIT TRANSACTION/, 'the transaction decision is not explained in the header');
});

test('materiality covers every field that can stop the fleet seating (H-1, M-7)', () => {
  const fn = body('fn_ca_fleet_set_policy');
  // The four the contract shipped with.
  for (const reason of ['enabled_changed', 'pause_changed']) {
    assert.ok(fn.includes(`'${reason}'`), `the RPC does not raise ${reason}`);
  }
  for (const suffix of ['_set_or_cleared', '_changed_from_zero', '_moved_more_than_25_percent']) {
    assert.ok(fn.includes(suffix), `the RPC does not raise ${suffix}`);
  }
  // The absolute floor under the percentage (M-7): a run of small cuts is a
  // run of non-material changes, so a cap this low is material on its own.
  assert.ok(fn.includes('_cut_to_a_floor'), 'the RPC has no absolute cap floor');
  assert.match(fn, /v_new_cap <= 5 and v_new_cap < v_old_cap/, 'the cap floor is not 5 seats');
  // The five fields that could stop the whole fleet and were below the line.
  for (const reason of [
    'occupancy_bias_cut_below_half',
    'occupancy_bias_moved_more_than_25_percent',
    'min_humans_to_seat_raised',
  ]) {
    assert.ok(fn.includes(`'${reason}'`), `the RPC does not raise ${reason}`);
  }
  // The three list restrictions share one loop, so the reason is built as
  // `<field>_narrowed` from the key the loop is on.
  assert.ok(fn.includes("(v_key || '_narrowed')"), 'the RPC does not raise <field>_narrowed');
  assert.match(
    fn,
    /foreach v_key in array array\['stake_bands','variants','schedule'\] loop/,
    'the narrowing rule does not cover stake_bands, variants and schedule'
  );
  // A restriction is measured against NO restriction, so adding one where
  // there was none is material however long the list is.
  assert.match(fn, /v_new_len is not null and \(v_old_len is null or v_new_len < v_old_len\)/);
  assert.match(fn, /v_new_bias <= 0\.5 and v_new_bias < v_old_bias/);
});

test('the policy audit row is filed under the id the route uses (M-2)', () => {
  const fn = body('fn_ca_fleet_set_policy');
  // policyTargetId(scope, scopeId) in pages/api/horses/fleet-admin.js is
  // 'global' for the global row and '<scope>:<uuid>' otherwise. The RPC used
  // to write 'global:global', and fn_ca_operator_audit_trail filters on an
  // exact target_id, so a trail lookup found one of the two rows and silently
  // omitted the other.
  assert.match(
    fn,
    /p_target_id\s*:=\s*case when p_scope = 'global' then 'global'\s*\n?\s*else p_scope \|\| ':' \|\| p_scope_id::text end,/,
    'the policy audit target id is not the route\'s two cases'
  );
  assert.ok(
    !fn.includes("coalesce(p_scope_id::text, 'global')"),
    'the old global:global target id is still there'
  );
  const route = readFileSync(join(repo, 'pages/api/horses/fleet-admin.js'), 'utf8');
  assert.match(
    route,
    /return scope === 'global' \? 'global' : `\$\{scope\}:\$\{scopeId\}`;/,
    'the route no longer builds the target id the RPC now mirrors'
  );
});

test('stuck is measured from the best timestamp available (M-9)', () => {
  const fn = body('fn_ca_fleet_overview');
  const measure = /coalesce\(last_action_at, session_started_at, last_seen_at\)/g;
  const uses = fn.match(measure) || [];
  assert.ok(
    uses.length >= 3,
    `the stuck count, its sample and the sample's ordering must all measure the same way, found ${uses.length}`
  );
  // The old rule counted a null last_action_at as stuck unconditionally, so
  // every freshly seated horse inflated the Health tab's loudest number.
  assert.ok(
    !/last_action_at is null or last_action_at </.test(fn),
    'a null last_action_at is still stuck on its own, however recent the seating'
  );
  const block = code.slice(code.lastIndexOf('do $assert$'));
  assert.match(block, /seated 10 seconds ago with no action is counted stuck/i,
    'the migration never probes the fresh-seating case');
  assert.match(block, /90 minutes is not counted as stuck/i,
    'the migration never probes the genuinely stuck case');
});

test('the probe residue checks are scoped to the probes (M-6)', () => {
  const block = code.slice(code.lastIndexOf('do $assert$'));
  // The heartbeat check used to assert the whole table was empty, which is
  // true only on a database where the engine has never run - so re-applying
  // the file, which the header promises is safe, aborted with a false
  // ASSERT FAILED once the engine had written a single beat.
  assert.match(
    block,
    /from public\.ca_horse_fleet_heartbeat\s*\n?\s*where id in \(v_p_beat_a, v_p_beat_b\)/,
    'the heartbeat residue check is not scoped to the probe beats'
  );
  assert.ok(
    !/select count\(\*\) into v_count from public\.ca_horse_fleet_heartbeat;/.test(block),
    'the unscoped heartbeat count is still there'
  );
  // Its two siblings were already scoped, and both probe horses are checked.
  assert.match(block, /from public\.ca_horse_fleet_policy where scope = 'club' and scope_id = c_probe_club/);
  assert.match(block, /where horse_id in \(c_probe_horse, c_probe_fresh\)/);
});

test('the register is backfilled from profiles where is_horse', () => {
  const fn = body('fn_ca_fleet_register_sync');
  assert.match(fn, /insert into public\.ca_horse_fleet_register/, 'the sync inserts nothing');
  assert.match(fn, /coalesce\(p\.is_horse, false\)/, 'the sync does not read profiles.is_horse');
  assert.match(fn, /on conflict \(horse_id\) do nothing/, 'the sync is not idempotent by construction');
  // Never deletes: the GLI-19 record has to answer questions about the past.
  assert.ok(!/delete\s+from\s+public\.ca_horse_fleet_register/i.test(fn), 'the sync deletes register rows');
  assert.match(fn, /set retired_at = now\(\)/, 'the sync never retires a vanished horse');
  // And the migration actually runs it.
  assert.match(code, /do \$backfill\$/, 'the migration never calls the sync');
  assert.match(code, /public\.fn_ca_fleet_register_sync\(\)/, 'the backfill does not call the sync');
});

test('no uuid is hardcoded except the documented sentinels', () => {
  const allowed = new Set([
    // The scope_key sentinel the contract's primary key names.
    '00000000-0000-0000-0000-000000000000',
    // The three assertion probes, in the reserved synthetic block: a club, a
    // horse seated 90 minutes ago, and one seated 10 seconds ago.
    '00000000-0000-4000-8000-0000000000f1',
    '00000000-0000-4000-8000-0000000000f2',
    '00000000-0000-4000-8000-0000000000f3',
  ]);
  const uuids = sql.match(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi) || [];
  for (const u of uuids) {
    assert.ok(allowed.has(u.toLowerCase()), `undocumented hardcoded uuid: ${u}`);
  }
});

// ------------------------------------------------------------------ ACLs

test('every function is SECURITY DEFINER with a pinned search_path', () => {
  for (const fn of FUNCTION_NAMES) {
    const text = body(fn);
    assert.match(text, /security definer/, `${fn} is not SECURITY DEFINER`);
    assert.match(text, /set search_path = public, pg_temp/, `${fn} does not pin search_path`);
  }
});

test('every function is revoked from public, anon, authenticated in this same file', () => {
  for (const [fn, args] of Object.entries(FUNCTIONS)) {
    assert.ok(
      code.includes(`revoke all on function public.${fn}(${args}) from public, anon, authenticated;`),
      `${fn}(${args}) has no REVOKE from public, anon, authenticated`
    );
  }
});

test('every function grants execute to service_role and to nobody else', () => {
  for (const [fn, args] of Object.entries(FUNCTIONS)) {
    assert.ok(
      code.includes(`grant execute on function public.${fn}(${args}) to service_role;`),
      `${fn}(${args}) has no GRANT EXECUTE TO service_role`
    );
  }
  const grants = code.match(/grant execute on function[\s\S]*?to ([a-z_, ]+);/g) || [];
  assert.equal(grants.length, FUNCTION_NAMES.length, 'unexpected number of GRANT EXECUTE statements');
  for (const grant of grants) {
    assert.match(grant, /to service_role;$/, `a function is granted to something other than service_role: ${grant}`);
  }
});

test('RLS is enabled on all four tables and no policy is created', () => {
  for (const table of TABLES) {
    assert.match(
      code,
      new RegExp(`alter table public\\.${table}\\s+enable row level security`),
      `RLS not enabled on ${table}`
    );
    assert.match(
      code,
      new RegExp(`revoke all on public\\.${table}\\s+from public, anon, authenticated`),
      `${table} is not revoked from anon and authenticated`
    );
    assert.match(
      code,
      new RegExp(`grant select, insert, update, delete on public\\.${table}\\s+to service_role`),
      `${table} is not granted to service_role`
    );
  }
  assert.ok(
    !/create policy/i.test(code),
    'a policy was created: anon and authenticated must have no route into these tables'
  );
  assert.match(sql, /service_role bypasses RLS/i, 'the RLS decision is not explained in a comment');
  assert.match(sql, /NO policy is created for anon/i, 'the no-policy decision is not stated');
});

// ---------------------------------------------------------------- audit

test('the four read RPCs never mention fn_log_admin_action', () => {
  for (const fn of READ_ONLY) {
    assert.ok(
      !/fn_log_admin_action/.test(body(fn)),
      `${fn} is a read with no actor and must not attempt an audit row: fn_log_admin_action refuses a null actor`
    );
  }
  // The reason is written down where the next reader will find it.
  assert.match(header, /WHY THE READ RPCs FILE NO AUDIT ROW/);
  assert.match(header, /REFUSES a null actor/);
});

test('the state upsert is telemetry and files no audit row', () => {
  for (const fn of TELEMETRY) {
    assert.ok(
      !/fn_log_admin_action/.test(body(fn)),
      `${fn} is machine telemetry and must not audit: contract section 1 says so`
    );
  }
  // And it says so in its own return value, so a caller cannot believe
  // otherwise.
  assert.match(body('fn_ca_fleet_state_upsert'), /'audited', false/);
});

test('the two write RPCs each file one audit row, guarded', () => {
  for (const fn of AUDITING_WRITES) {
    const text = body(fn);
    assert.match(text, /perform public\.fn_log_admin_action\(/, `${fn} files no audit row`);
    assert.match(
      text,
      /exception when others then/,
      `${fn} does not guard its audit write: a failed audit must never fail the action`
    );
  }
  // Every function is accounted for: four reads, one telemetry, two writes.
  assert.equal(
    READ_ONLY.length + TELEMETRY.length + AUDITING_WRITES.length,
    FUNCTION_NAMES.length,
    'the audit classification does not cover every function'
  );
});

test('fn_log_admin_action is called with the full ten-parameter signature and a non-null actor', () => {
  const calls = [...code.matchAll(/perform public\.fn_log_admin_action\(([\s\S]*?)\n\s*\);/g)];
  assert.equal(calls.length, AUDITING_WRITES.length, `expected ${AUDITING_WRITES.length} audit calls, found ${calls.length}`);
  const params = [
    'p_admin_user_id',
    'p_action',
    'p_target_type',
    'p_target_id',
    'p_details',
    'p_before_state',
    'p_after_state',
    'p_ip_address',
    'p_user_agent',
    'p_request_id',
  ];
  for (const [, args] of calls) {
    for (const param of params) {
      assert.match(args, new RegExp(`${param}\\s*:=`), `audit call is missing ${param}`);
    }
    assert.ok(
      !/p_admin_user_id\s*:=\s*null/.test(args),
      'an audit call passes a null actor, which production refuses outright'
    );
  }
  // The action names follow the operatorAudit grammar.
  const actions = [...code.matchAll(/p_action\s*:=\s*'([^']+)'/g)].map((m) => m[1]);
  assert.deepEqual([...actions].sort(), ['fleet.register_sync', 'fleet.set_policy']);
  for (const action of actions) {
    assert.match(action, /^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*){1,3}$/, `bad audit action name: ${action}`);
  }
});

test('set_policy refuses a null actor rather than writing an unattributable change', () => {
  const fn = body('fn_ca_fleet_set_policy');
  assert.match(fn, /'error', 'actor_required'/, 'set_policy accepts a change nobody can be held to');
});

test('register_sync takes an optional actor and skips the audit when it has none', () => {
  assert.match(
    code,
    /create or replace function public\.fn_ca_fleet_register_sync\(p_actor uuid default null\)/,
    'register_sync does not take an optional actor, so fn_ca_fleet_register_sync() cannot resolve'
  );
  const fn = body('fn_ca_fleet_register_sync');
  assert.match(fn, /if p_actor is not null then/, 'register_sync does not guard the audit call on having an actor');
  assert.match(fn, /no actor was supplied, so no audit row was written/i, 'the skip is not reported to the caller');
  // The deviation from the contract signature is declared, not hidden.
  assert.match(header, /THE ONE DELIBERATE DEVIATION FROM THE CONTRACT'S SIGNATURES/);
});

// ------------------------------------------------------------- defensive

test('every table this file does not create is read behind a guard', () => {
  const foreign = [
    'profiles',
    'tables',
    'table_seats',
    'union_clubs',
    'clubs',
    'horse_daily_nets',
    'club_rake_daily_user',
    'ca_club_player_daily',
  ];
  for (const table of foreign) {
    assert.ok(
      code.includes(`to_regclass('public.${table}')`) ||
        code.includes(`table_name = '${table}'`),
      `${table} is read without a to_regclass or information_schema guard`
    );
  }
  // And the behaviour is documented as returning empty rather than failing.
  assert.match(header, /EMPTY RATHER THAN FAILING/i);
  assert.match(header, /to_regclass/);
});

test('the read RPCs report which sources they could and could not read', () => {
  for (const fn of ['fn_ca_fleet_overview', 'fn_ca_fleet_isolation_report', 'fn_ca_fleet_pnl']) {
    const text = body(fn);
    assert.match(text, /'sources'/, `${fn} does not report which sources it read`);
    assert.match(text, /'notes'/, `${fn} has no notes array to explain a zero`);
  }
  // A zero never travels alone.
  assert.match(
    body('fn_ca_fleet_pnl'),
    /no chip source could be read, so every chip figure is a reported zero and not a measurement/,
    'the P and L can report a zero without saying it is not a measurement'
  );
});

test('the P and L reads money and never recomputes it', () => {
  const fn = body('fn_ca_fleet_pnl');
  assert.match(fn, /stable/, 'the P and L is not declared stable');
  assert.match(fn, /'read_only', true/, 'the P and L does not declare itself read only');
  // Rake is its own column, never folded into chips.
  assert.match(fn, /'rake', v_rake/, 'rake is not reported separately');
  // No write of any kind.
  for (const verb of ['insert into', 'update ', 'delete from']) {
    assert.ok(!new RegExp(verb, 'i').test(fn), `the P and L contains a ${verb.trim()}`);
  }
  // The three source tables the contract names are all consulted.
  for (const table of ['horse_daily_nets', 'club_rake_daily_user', 'ca_club_player_daily']) {
    assert.ok(fn.includes(table), `the P and L never looks at ${table}`);
  }
});

test('the isolation report scopes a horse to its union, not merely its club', () => {
  const fn = body('fn_ca_fleet_isolation_report');
  assert.match(fn, /coalesce\(union_id, club_id\)/, 'the scope key is not union first, club second');
  assert.match(fn, /having count\(\*\) > 1/, 'the report does not filter to more than one scope');
  assert.match(sql, /Empty is the correct answer|empty report is the correct answer/i);
});

// ------------------------------------------------------------- additive

test('the migration is additive: it drops nothing and alters only its own tables', () => {
  const drops = [...code.matchAll(/drop\s+(table|function|index|column|constraint)/gi)].map((m) => m[0]);
  assert.deepEqual(drops, [], `the migration drops something: ${drops.join(', ')}`);

  const alters = [...code.matchAll(/alter\s+table\s+(?:if exists\s+)?public\.([a-z_]+)/gi)].map((m) => m[1]);
  assert.ok(alters.length > 0, 'no ALTER TABLE at all, so RLS cannot have been enabled');
  for (const table of alters) {
    assert.ok(OWN_TABLES.has(table), `ALTER TABLE on a table this file does not create: ${table}`);
  }

  assert.ok(!/alter\s+column/i.test(code), 'the migration alters a column');
  assert.ok(!/create\s+or\s+replace\s+function\s+public\.fn_log_admin_action/i.test(code),
    'the migration replaces an existing platform function');

  // Every INSERT and UPDATE target is one of this file's own tables.
  const writes = [...code.matchAll(/(?:insert into|update)\s+public\.([a-z_]+)/gi)].map((m) => m[1]);
  for (const table of writes) {
    assert.ok(OWN_TABLES.has(table), `write to a table this file does not create: ${table}`);
  }
});

test('seeds and DDL are idempotent, and DDL runs under a lock timeout', () => {
  for (const table of TABLES) {
    assert.match(code, new RegExp(`create table if not exists public\\.${table}`), `${table} is not IF NOT EXISTS`);
  }
  const indexes = code.match(/create (?:unique )?index if not exists/g) || [];
  const allIndexes = code.match(/create (?:unique )?index/g) || [];
  assert.equal(indexes.length, allIndexes.length, 'an index is created without IF NOT EXISTS');
  assert.match(code, /on conflict \(scope, scope_key\) do nothing/, 'the seed is not ON CONFLICT DO NOTHING');
  assert.match(code, /set local lock_timeout/, 'no SET LOCAL lock_timeout: DDL on a busy database can deadlock');
});

// ------------------------------------------------------------- rollback

test('the file carries a pasted ROLLBACK section in dependency order', () => {
  assert.match(sql, /^-- ROLLBACK$/m, 'no `-- ROLLBACK` section');
  for (const [fn, args] of Object.entries(FUNCTIONS)) {
    assert.ok(
      rollbackSection.includes(`drop function if exists public.${fn}(${args});`),
      `ROLLBACK does not drop ${fn}(${args})`
    );
  }
  for (const table of TABLES) {
    assert.ok(
      rollbackSection.includes(`drop table if exists public.${table};`),
      `ROLLBACK does not drop ${table}`
    );
  }
  // Functions before tables: a function reads the tables.
  const firstTable = Math.min(
    ...TABLES.map((t) => rollbackSection.indexOf(`drop table if exists public.${t};`))
  );
  const lastFunction = Math.max(
    ...FUNCTION_NAMES.map((f) => rollbackSection.indexOf(`drop function if exists public.${f}(`))
  );
  assert.ok(lastFunction < firstTable, 'the ROLLBACK drops a table before a function that reads it');
  // fn_ca_fleet_policy_effective is called by set_policy and overview,
  // so it is dropped after both.
  assert.ok(
    rollbackSection.indexOf('drop function if exists public.fn_ca_fleet_policy_effective(') >
      rollbackSection.indexOf('drop function if exists public.fn_ca_fleet_set_policy('),
    'fn_ca_fleet_policy_effective is dropped before a function that calls it'
  );
  // Every line of the section is a comment, so applying the migration
  // cannot run it.
  for (const line of rollbackSection.split('\n')) {
    if (line.trim() === '') continue;
    assert.ok(line.trim().startsWith('--'), `the ROLLBACK section has a live statement: ${line}`);
  }
});

// -------------------------------------------------------------- hygiene

test('the header explains what this is, the safety rule and every deviation', () => {
  assert.match(header, /WHAT THIS IS/);
  assert.match(header, /SECTION 0 IS THE POINT OF THE WHOLE FILE/);
  assert.match(header, /HORSES ARE PLAYERS/);
  assert.match(header, /WHY THE READ RPCs FILE NO AUDIT ROW/);
  assert.match(header, /THE ONE DELIBERATE DEVIATION/);
  assert.match(header, /DEFENSIVE READS/);
  assert.match(header, /ROW LEVEL SECURITY/);
  assert.match(header, /VERIFIED BEFORE APPLYING/);
  assert.match(header, /docs\/horses\/PHASE3-CONTRACTS\.md/);
});

test('the migration and the simulation are ascii, with no em dash and no emoji', () => {
  for (const [name, text] of [
    ['migration', sql],
    ['simulation', sim],
  ]) {
    const bad = [...text].filter((ch) => ch.codePointAt(0) > 126);
    assert.deepEqual(
      [...new Set(bad)],
      [],
      `${name} contains non-ascii characters: ${JSON.stringify([...new Set(bad)])}`
    );
    // Escaped, so this test file does not itself contain the character
    // it forbids.
    assert.ok(!text.includes('\u2014'), `${name} contains an em dash`);
    assert.ok(!text.includes('\u2013'), `${name} contains an en dash`);
  }
});

// ----------------------------------------------------------- simulation

test('the simulation is wrapped in a transaction it rolls back', () => {
  assert.match(sim, /^begin;$/m, 'the simulation does not open a transaction');
  assert.match(sim, /^rollback;$/m, 'the simulation does not roll back');
  assert.ok(!/^commit;$/m.test(sim), 'the simulation commits, which would leave a club steered');
  assert.match(sim, /ROLLED BACK/i, 'the simulation does not say at the top that it must be rolled back');
  // Synthetic actors only: every literal uuid is in the reserved block.
  const uuids = sim.match(/'[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}'/gi) || [];
  assert.ok(uuids.length > 0, 'the simulation uses no synthetic uuids');
  for (const u of uuids) {
    assert.match(u, /^'00000000-0000-4000-8000-0000000000[0-9a-f]{2}'$/, `uuid outside the reserved block: ${u}`);
  }
});

test('the simulation proves every claim the contract makes, with a notice per step', () => {
  for (let step = 1; step <= 13; step += 1) {
    assert.ok(
      sim.includes(`STEP ${step} OK`) || sim.includes(`STEP ${step} SKIPPED`),
      `the simulation never reports STEP ${step}`
    );
  }
  // Each claim is checked, not just narrated.
  const failures = sim.match(/raise exception/g) || [];
  assert.ok(failures.length >= 25, `only ${failures.length} assertions in the simulation`);
  for (const fn of FUNCTION_NAMES) {
    assert.ok(sim.includes(`public.${fn}(`), `the simulation never exercises ${fn}`);
  }
  for (const claim of [
    'unknown_scope',
    'negative_cap',
    'bias_out_of_range',
    'min_humans_out_of_range',
    'range_inverted',
    'scope_id_required',
    'no chip source could be read',
  ]) {
    assert.ok(sim.includes(claim), `the simulation does not cover: ${claim}`);
  }
});

test('the simulation never writes to a table it has no business writing to', () => {
  // It may READ profiles, tables, clubs and unions. It may only WRITE
  // the four Phase 3 tables and, for two probe seats, table_seats.
  const writable = new Set([...TABLES, 'table_seats']);
  const writes = [...sim.matchAll(/(?:insert into|update)\s+public\.([a-z_]+)/gi)].map((m) => m[1]);
  for (const table of writes) {
    assert.ok(writable.has(table), `the simulation writes to ${table}`);
  }
  assert.ok(!/delete\s+from/i.test(sim), 'the simulation deletes rows');
  assert.ok(!/drop\s+/i.test(sim), 'the simulation drops an object');
  // B-1 (review of 2026-09-03): the simulation NEVER renames or alters a
  // production table. The step that did held ACCESS EXCLUSIVE on two live
  // aggregate tables until the TOP-LEVEL transaction ended, not until the
  // rename finished, so every reader of those tables blocked for the rest of
  // the run. A savepoint does not release it. The step was deleted rather
  // than made careful, and this is the guard that keeps it out.
  assert.ok(!/alter\s+table/i.test(sim), 'the simulation alters a table');
  assert.ok(!/rename\s+to/i.test(sim), 'the simulation renames a table');
  assert.match(sim, /NO STEP IN THIS FILE MAY RENAME OR ALTER A PRODUCTION TABLE/);
});

test('the contract still names exactly the objects this migration builds', () => {
  const section = contract.slice(contract.indexOf('## 1. Database'), contract.indexOf('## 2. Engine'));
  for (const table of TABLES) {
    assert.ok(section.includes(table), `contract section 1 no longer names ${table}`);
  }
  for (const fn of FUNCTION_NAMES) {
    assert.ok(section.includes(fn), `contract section 1 no longer names ${fn}`);
  }
  // The safety rule that outranks everything is still section 0.
  assert.match(contract, /THE FLEET KEEPS RUNNING EXACTLY AS IT DOES TODAY/);
});
