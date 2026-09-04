/**
 * Static checks over the Phase 2 migration text. No database.
 *
 * These are the checks that a rolled-back SQL simulation cannot make,
 * because they are about the SHAPE of the file rather than the behaviour
 * of the schema: that every object the contract names is actually
 * created, that the permission vocabulary in the seed still matches
 * src/lib/horses/permissions.js, that the safety defaults from contract
 * section 0 are the ones written down, that every function is locked to
 * service_role in this same file, and that nothing in it touches a table
 * it did not create.
 *
 * Behaviour lives in docs/horses/PHASE2-SIM.sql. This file is the guard
 * against the migration drifting away from the contract and the
 * permission module while still applying cleanly.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { ALL_PERMISSIONS, ROLE_PERMISSIONS } from '../src/lib/horses/permissions.js';

const here = dirname(fileURLToPath(import.meta.url));
const repo = join(here, '..');

const MIGRATION_PATH = join(
  repo,
  'supabase/migrations/20260903120000_ca_operator_rbac_and_approvals.sql'
);
/** The follow-up that strips the dead audit write out of the two read
 *  functions. See the FOLLOW-UP section near the bottom of this file. */
const FOLLOWUP_PATH = join(
  repo,
  'supabase/migrations/20260903121500_ca_operator_read_fns_do_not_audit.sql'
);
/** The second follow-up: the one that made the approval gate exact after an
 *  adversarial review found B-2, B-3, H-2 and H-4 inside the APPLIED
 *  migration. See the GATE section near the bottom of this file. */
const GATE_PATH = join(
  repo,
  'supabase/migrations/20260903140000_ca_operator_approval_gate_is_exact.sql'
);
/** The third follow-up: the re-verification fixes (M-2, L-3, L-12, N-4 of
 *  docs/horses/reverify-2026-09-03/server-db.md). See the REVERIFY section
 *  at the bottom of this file. */
const REVERIFY_PATH = join(
  repo,
  'supabase/migrations/20260903202500_ca_operator_reverify_fixes.sql'
);
const SIM_PATH = join(repo, 'docs/horses/PHASE2-SIM.sql');
const SIM2_PATH = join(repo, 'docs/horses/PHASE2-SIM-2.sql');
const CONTRACT_PATH = join(repo, 'docs/horses/PHASE2-CONTRACTS.md');

const sql = readFileSync(MIGRATION_PATH, 'utf8');
const followup = readFileSync(FOLLOWUP_PATH, 'utf8');
const gate = readFileSync(GATE_PATH, 'utf8');
const reverify = readFileSync(REVERIFY_PATH, 'utf8');
const sim = readFileSync(SIM_PATH, 'utf8');
const sim2 = readFileSync(SIM2_PATH, 'utf8');
const contract = readFileSync(CONTRACT_PATH, 'utf8');

/** The migration with every `--` comment line removed, so a check for a
 *  statement never matches the ROLLBACK section, which is entirely
 *  commented out on purpose. */
const code = sql
  .split('\n')
  .filter((line) => !line.trim().startsWith('--'))
  .join('\n');

/** The commented ROLLBACK section on its own. */
const rollbackSection = sql.slice(sql.indexOf('-- ROLLBACK'));

/** The follow-up, comment lines stripped the same way. */
const followupCode = followup
  .split('\n')
  .filter((line) => !line.trim().startsWith('--'))
  .join('\n');

/** The gate migration, comment lines stripped the same way. */
const gateCode = gate
  .split('\n')
  .filter((line) => !line.trim().startsWith('--'))
  .join('\n');

/** The re-verification migration, comment lines stripped the same way. */
const reverifyCode = reverify
  .split('\n')
  .filter((line) => !line.trim().startsWith('--'))
  .join('\n');

/**
 * The body of one function as the DATABASE would end up with it: from the
 * newest migration that replaces it, from the original otherwise. Four
 * migrations, one live definition per function, and it is the LIVE
 * definition every audit assertion below is about. NEWEST FIRST, so a
 * later CREATE OR REPLACE that dropped a mutator's audit write has to fail
 * these tests rather than hide behind the original file.
 */
function liveBody(fn) {
  const marker = `create or replace function public.${fn}`;
  for (const text of [reverifyCode, gateCode, followupCode, code]) {
    const start = text.lastIndexOf(marker);
    if (start === -1) continue;
    return text.slice(start, text.indexOf('$fn$;', start) + 5);
  }
  throw new Error(`no definition of ${fn} in either migration`);
}

/** The same action-name grammar src/lib/horses/operatorAudit.js enforces. */
const ACTION_RE = /^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*){1,3}$/;

const TABLES = [
  'ca_operator_roles',
  'ca_operator_role_permissions',
  'ca_operator_grants',
  'ca_operator_policy',
  'ca_operator_approvals',
];

/** Everything the contract names, plus the two this file adds: the policy
 *  writer the console's set_policy action needs, and the single copy of
 *  the alone rule that request and decide both call. */
const FUNCTIONS = [
  'fn_ca_operator_permissions',
  'fn_ca_operator_grant',
  'fn_ca_operator_revoke',
  'fn_ca_operator_set_policy',
  'fn_ca_operator_request_approval',
  'fn_ca_operator_decide_approval',
  'fn_ca_operator_mark_executed',
  'fn_ca_operator_audit_trail',
  'fn_ca_operator_staff',
  'fn_ca_operator_has_second_approver',
];

/** admin.manage is new in Phase 2. It is asserted separately rather than
 *  read from ALL_PERMISSIONS, because the seed has to carry it whether or
 *  not the server side of contract section 2 has landed in permissions.js
 *  yet: the two halves of Phase 2 ship from different branches. */
const EXPECTED_PERMISSIONS = [...new Set([...ALL_PERMISSIONS, 'admin.manage'])];

/**
 * The roles seeded by the explicit `values (...)` block, and the roles
 * seeded by the cross join that hands out every permission.
 *
 * NOT written down twice: both lists come from ROLE_PERMISSIONS in
 * src/lib/horses/permissions.js, which is the single source of truth for
 * what a role carries. A role holding the full vocabulary is seeded by
 * the cross join; every other role is seeded pair by pair.
 */
const FULL_SET_ROLES = Object.keys(ROLE_PERMISSIONS).filter(
  (role) => ROLE_PERMISSIONS[role].length === ALL_PERMISSIONS.length
);

const NARROW_ROLES = Object.keys(ROLE_PERMISSIONS).filter(
  (role) => !FULL_SET_ROLES.includes(role)
);

/** role -> the permission set permissions.js says it carries. */
const ROLE_SETS = Object.fromEntries(
  NARROW_ROLES.map((role) => [role, [...ROLE_PERMISSIONS[role]]])
);

/** The `values (...)` block of the explicit per-role permission seed,
 *  isolated so a tuple anywhere else in the file (a check constraint, a
 *  jsonb_build_object call) cannot be mistaken for a seeded pair. */
function narrowRoleSeedBlock() {
  const marker = "insert into public.ca_operator_role_permissions (role_key, permission) values";
  const start = code.indexOf(marker);
  assert.ok(start > -1, 'the per-role permission seed block is missing');
  const end = code.indexOf('on conflict (role_key, permission) do nothing;', start);
  assert.ok(end > start, 'the per-role permission seed block is not closed');
  return code.slice(start + marker.length, end);
}

/** ('role', 'permission') pairs from the explicit per-role seed block. */
function seededPairs() {
  const block = narrowRoleSeedBlock();
  const pairs = new Set();
  for (const m of block.matchAll(/\(\s*'([a-z_]+)'\s*,\s*'([a-z._]+)'\s*\)/g)) {
    pairs.add(`${m[1]}|${m[2]}`);
  }
  return pairs;
}

/** The seed statements, without the inserts the RPC bodies make at run
 *  time. Only the seeds have to be idempotent. */
function seedSection() {
  return code.slice(code.indexOf('insert into public.ca_operator_roles'), code.indexOf('create or replace function'));
}

/** The role keys in the `from (values (...)) as r (role_key)` header of the
 *  cross-join seed - the roles that get the whole vocabulary. */
function crossJoinRoles() {
  const start = code.indexOf('from (values');
  assert.ok(start > -1, 'the full-permission cross join header is missing');
  const end = code.indexOf('as r (role_key)', start);
  assert.ok(end > start, 'the full-permission cross join header is not closed');
  return new Set([...code.slice(start, end).matchAll(/\('([a-z_]+)'\)/g)].map((m) => m[1]));
}

/**
 * THE WHOLE SEED, AS role -> permissions, from both halves of it: the
 * cross join that gives owner and the legacy three everything, and the
 * explicit pair list for the narrower roles.
 */
function seededPermissionsByRole() {
  const byRole = {};
  const all = [...crossJoinPermissions()];
  for (const role of crossJoinRoles()) byRole[role] = [...all];
  for (const pair of seededPairs()) {
    const [role, permission] = pair.split('|');
    (byRole[role] = byRole[role] || []).push(permission);
  }
  for (const role of Object.keys(byRole)) byRole[role] = [...new Set(byRole[role])].sort();
  return byRole;
}

/** The permission strings in the cross-join block that gives owner and the
 *  three legacy roles everything. */
function crossJoinPermissions() {
  const start = code.indexOf("cross join (values");
  assert.ok(start > -1, 'the full-permission cross join block is missing');
  const end = code.indexOf(') as p (permission)', start);
  assert.ok(end > start, 'the full-permission cross join block is not closed');
  const block = code.slice(start, end);
  return new Set([...block.matchAll(/\('([a-z._]+)'\)/g)].map((m) => m[1]));
}

// ------------------------------------------------------------------ shape

test('every contract table is created', () => {
  for (const table of TABLES) {
    assert.match(
      code,
      new RegExp(`create table if not exists public\\.${table}\\s*\\(`),
      `missing: create table ${table}`
    );
  }
});

test('every contract function is created', () => {
  for (const fn of FUNCTIONS) {
    assert.match(
      code,
      new RegExp(`create or replace function public\\.${fn}\\s*\\(`),
      `missing: create or replace function ${fn}`
    );
  }
});

test('the indexes the console queries need are created', () => {
  const required = [
    // pending approvals ordered by requested_at
    /create index if not exists ca_operator_approvals_pending_idx[\s\S]*?where status = 'pending'/,
    // grants by user where not revoked
    /create index if not exists ca_operator_grants_user_active_idx[\s\S]*?where revoked_at is null/,
    // one active grant per user and role
    /create unique index if not exists ca_operator_grants_active_uq[\s\S]*?where revoked_at is null/,
    // op_id unique where not null
    /create unique index if not exists ca_operator_approvals_op_id_uq[\s\S]*?where op_id is not null/,
    // audit-trail lookups by target
    /admin_audit_log \(target_type, target_id, created_at desc\)/,
    // approvals by target, for a record's own trail
    /create index if not exists ca_operator_approvals_target_idx/,
  ];
  for (const re of required) {
    assert.match(code, re, `missing index: ${re}`);
  }
});

// ------------------------------------------------------- permission seed

test('every permission in permissions.js, plus admin.manage, is seeded', () => {
  const all = crossJoinPermissions();
  for (const permission of EXPECTED_PERMISSIONS) {
    assert.ok(all.has(permission), `permission not seeded for the full-access roles: ${permission}`);
  }
  assert.equal(
    all.size,
    EXPECTED_PERMISSIONS.length,
    `the full-access seed has ${all.size} permissions, expected ${EXPECTED_PERMISSIONS.length}: ` +
      `extra=${[...all].filter((p) => !EXPECTED_PERMISSIONS.includes(p)).join(',')}`
  );
});

test('owner and the three legacy roles receive the full set', () => {
  const block = code.slice(code.indexOf('insert into public.ca_operator_role_permissions'));
  const header = block.slice(0, block.indexOf('cross join'));
  for (const role of ['owner', 'god', 'superadmin', 'admin']) {
    assert.match(header, new RegExp(`\\('${role}'\\)`), `role missing from the full-access seed: ${role}`);
  }
});

test('admin.manage goes to owner and the legacy roles only', () => {
  const pairs = seededPairs();
  for (const [role] of Object.entries(ROLE_SETS)) {
    assert.ok(
      !pairs.has(`${role}|admin.manage`),
      `${role} must not hold admin.manage: it gates grant_role, revoke_role and set_policy`
    );
  }
});

/**
 * THE ONE THAT STOPS THE TWO SIDES DRIFTING AGAIN.
 *
 * src/lib/horses/permissions.js is the single source of truth: the
 * resolver merges from it, every route asks it what a permission means,
 * and the Staff tab renders the permission matrix from it. This seed is
 * the same table in SQL, so it has to be the same table. It was not:
 * the first build seeded four roles narrower than the module (operations
 * short six permissions, finance four, compliance one, support three),
 * which meant the matrix on screen and the set an operator would actually
 * resolve under enforcement described two different jobs.
 *
 * So the assertion is EQUALITY, per role, in both directions, for every
 * role the module defines - not "the seed is a subset", which is what
 * let the drift through the first time.
 */
test('the seed is exactly ROLE_PERMISSIONS from permissions.js, role for role', () => {
  const seeded = seededPermissionsByRole();

  for (const [role, permissions] of Object.entries(ROLE_PERMISSIONS)) {
    const expected = [...new Set(permissions)].sort();
    assert.ok(seeded[role], `permissions.js defines role ${role} and the seed never mentions it`);
    assert.deepEqual(
      seeded[role],
      expected,
      `${role} is seeded as [${seeded[role].join(', ')}] but permissions.js says [${expected.join(', ')}]`
    );
  }

  for (const role of Object.keys(seeded)) {
    assert.ok(
      Object.prototype.hasOwnProperty.call(ROLE_PERMISSIONS, role),
      `the seed grants permissions to ${role}, a role permissions.js does not define`
    );
  }

  // And the roles table itself carries every one of them, or a seeded
  // pair would fail its foreign key on the way in.
  const rolesSeed = code.slice(
    code.indexOf('insert into public.ca_operator_roles'),
    code.indexOf('on conflict (key) do nothing;')
  );
  for (const role of Object.keys(ROLE_PERMISSIONS)) {
    assert.match(rolesSeed, new RegExp(`\\('${role}'`), `role ${role} is not seeded into ca_operator_roles`);
  }
});

test('each named role gets exactly its contract permission set', () => {
  const pairs = seededPairs();
  for (const [role, permissions] of Object.entries(ROLE_SETS)) {
    for (const permission of permissions) {
      assert.ok(pairs.has(`${role}|${permission}`), `${role} is missing ${permission}`);
    }
    const seeded = [...pairs].filter((p) => p.startsWith(`${role}|`)).map((p) => p.split('|')[1]);
    assert.deepEqual(
      [...new Set(seeded)].sort(),
      [...permissions].sort(),
      `${role} has a permission set the contract does not name`
    );
  }
});

test('every seeded permission is a known permission string', () => {
  const pairs = seededPairs();
  for (const pair of pairs) {
    const [, permission] = pair.split('|');
    assert.ok(
      EXPECTED_PERMISSIONS.includes(permission),
      `unknown permission in the seed: ${permission}`
    );
  }
});

// ------------------------------------------------------------ safe state

test('the policy row is seeded and approvals default to false', () => {
  assert.match(code, /approvals_enabled\s+boolean not null default false/);
  assert.match(code, /enforce_named_roles\s+boolean not null default false/);
  assert.match(code, /allow_self_approve_when_alone\s+boolean not null default true/);
  assert.match(code, /mint_threshold\s+numeric not null default 0/);
  assert.match(code, /fund_threshold\s+numeric not null default 0/);
  assert.match(code, /cashout_threshold\s+numeric not null default 0/);
  assert.match(code, /approval_ttl_minutes\s+int not null default 1440/);
  assert.match(code, /insert into public\.ca_operator_policy \(id\) values \(true\)/);
});

test('the migration asserts its own safe state before it finishes', () => {
  const assertBlock = code.slice(code.lastIndexOf('do $assert$'));
  assert.match(assertBlock, /approvals_enabled must be false/i);
  assert.match(assertBlock, /has no permissions/i);
  assert.match(assertBlock, /expected all/i);
  assert.match(assertBlock, /where role = 'god'/);
  assert.match(assertBlock, /empty permission set/i);
  const raises = assertBlock.match(/raise exception/g) || [];
  assert.ok(raises.length >= 5, `expected at least 5 assertions, found ${raises.length}`);
});

test('no uuid is hardcoded anywhere in the migration', () => {
  const uuids = sql.match(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi) || [];
  assert.deepEqual(uuids, [], `hardcoded uuid(s) in the migration: ${uuids.join(', ')}`);
});

// ------------------------------------------------------------------ ACLs

test('every function is SECURITY DEFINER with a pinned search_path', () => {
  for (const fn of FUNCTIONS) {
    const start = code.indexOf(`create or replace function public.${fn}`);
    assert.ok(start > -1, `function not found: ${fn}`);
    const body = code.slice(start, code.indexOf('$fn$;', start) + 5);
    assert.match(body, /security definer/, `${fn} is not SECURITY DEFINER`);
    assert.match(body, /set search_path = public, pg_temp/, `${fn} does not pin search_path`);
  }
});

test('every function is revoked from public, anon, authenticated', () => {
  for (const fn of FUNCTIONS) {
    assert.match(
      code,
      new RegExp(`revoke all on function public\\.${fn}\\s*\\([^)]*\\)[\\s\\S]{0,80}?from public, anon, authenticated`),
      `${fn} has no REVOKE from public, anon, authenticated`
    );
  }
});

test('every function grants execute to service_role and to nobody else', () => {
  for (const fn of FUNCTIONS) {
    assert.match(
      code,
      new RegExp(`grant execute on function public\\.${fn}\\s*\\([^)]*\\)[\\s\\S]{0,80}?to service_role`),
      `${fn} has no GRANT EXECUTE TO service_role`
    );
  }
  const grants = code.match(/grant execute on function[\s\S]*?to ([a-z_, ]+);/g) || [];
  assert.equal(grants.length, FUNCTIONS.length, 'unexpected number of GRANT EXECUTE statements');
  for (const grant of grants) {
    assert.match(grant, /to service_role;$/, `a function is granted to something other than service_role: ${grant}`);
  }
});

test('RLS is enabled on all five tables and no policy is created', () => {
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
  }
  assert.ok(
    !/create policy/i.test(code),
    'a policy was created: anon and authenticated must have no route into these tables'
  );
  assert.match(sql, /service_role bypasses RLS/i, 'the RLS decision is not explained in a comment');
});

// ---------------------------------------------------------------- audit

/**
 * THE THREE CONSOLE READ RPCs THAT FILE NO AUDIT ROW.
 *
 * They are the jsonb-returning functions pages/api/horses/operator-admin.js
 * calls to render a page, and none of them writes to admin_audit_log.
 *
 * fn_ca_operator_permissions was the first correction (20260903120000's
 * header): a READ on every console request behind a 30 second cache, so
 * auditing it would bury the trail it is supposed to enrich - thousands of
 * rows a day in a table that held nine in five months.
 *
 * fn_ca_operator_staff and fn_ca_operator_audit_trail are the second
 * correction (20260903121500). Their signatures carry no actor, so they
 * called fn_log_admin_action with a null actor, which production refuses
 * outright. The write could never succeed on any call, and the failure was
 * swallowed into a `raise notice`. Dead code shaped like an audit is worse
 * than no audit: it tells the next reader the trail covers the staff list
 * and the per-record trail views when it never has.
 */
const NON_AUDITING_READS = [
  'fn_ca_operator_permissions',
  'fn_ca_operator_staff',
  'fn_ca_operator_audit_trail',
];

/**
 * Not a console RPC and not in the three: fn_ca_operator_has_second_approver
 * is an internal boolean predicate, called only by request_approval and
 * decide_approval, both of which record the answer in their own audit row.
 * It is listed separately so the count of READ functions that do not audit
 * stays exactly three and cannot be padded by adding helpers.
 */
const INTERNAL_PREDICATES = ['fn_ca_operator_has_second_approver'];

/** Everything that files no audit row, for the mutator checks below. */
const NON_AUDITING = [...NON_AUDITING_READS, ...INTERNAL_PREDICATES];

test('permission resolution is a read and files no audit row', () => {
  const start = code.indexOf('create or replace function public.fn_ca_operator_permissions');
  const body = code.slice(start, code.indexOf('$fn$;', start) + 5);
  assert.ok(
    !/fn_log_admin_action/.test(body),
    'fn_ca_operator_permissions must not audit: it runs on every console request'
  );
  // Gone from the code. The header still NAMES it, because the header is
  // where the removal is explained.
  assert.ok(
    !/operator\.permissions\.resolve/.test(code),
    'the operator.permissions.resolve audit action must no longer be written by any statement'
  );
  // And the decision is written down where the next reader will find it.
  const header = sql.slice(0, sql.indexOf('set local lock_timeout'));
  assert.match(header, /WHY PERMISSION RESOLUTION DOES NOT AUDIT ITSELF/);
  assert.match(header, /POST-BUILD CORRECTION/);
});

test('the staff RPC returns grant ids, not only role names', () => {
  const start = code.indexOf('create or replace function public.fn_ca_operator_staff');
  const body = code.slice(start, code.indexOf('$fn$;', start) + 5);
  // granted_roles is kept: the additive half of the change.
  assert.match(body, /as granted_roles/, 'granted_roles must survive');
  assert.match(body, /as grants/, 'the staff list must return a grants array');
  for (const field of ['id', 'role_key', 'granted_at', 'granted_by', 'reason']) {
    assert.match(
      body,
      new RegExp(`'${field}',\\s*g\\.${field}`),
      `the grants array is missing ${field}, which the Staff tab renders or revokes by`
    );
  }
  // Only ACTIVE grants can be revoked, so only active grants are offered.
  const grantsBlock = body.slice(body.indexOf("'id', g.id"));
  assert.match(grantsBlock.slice(0, 600), /revoked_at is null/);
});

test('every audit action name matches the operatorAudit grammar', () => {
  // Every function audits except the two in NON_AUDITING.
  const auditing = FUNCTIONS.length - NON_AUDITING.length;
  const actions = [...code.matchAll(/p_action\s*:=\s*'([^']+)'/g)].map((m) => m[1]);
  assert.ok(actions.length >= auditing, `only ${actions.length} audit actions found, expected ${auditing}`);
  for (const action of actions) {
    assert.match(action, ACTION_RE, `audit action does not match ACTION_RE: ${action}`);
  }
  for (const expected of [
    'operator.grant_role',
    'operator.revoke_role',
    'operator.set_policy',
    'operator.request_approval',
    'operator.decide_approval',
    'operator.execute_approval',
  ]) {
    assert.ok(actions.includes(expected), `missing audit action: ${expected}`);
  }
});

test('every function that mutates writes an audit row through fn_log_admin_action', () => {
  const mutators = FUNCTIONS.filter((fn) => !NON_AUDITING.includes(fn));
  for (const fn of mutators) {
    // The LIVE body: from the follow-up where one replaced it, otherwise
    // from the original. A mutator that lost its audit write in a later
    // migration has to fail here.
    const body = liveBody(fn);
    assert.match(body, /perform public\.fn_log_admin_action\(/, `${fn} files no audit row`);
    assert.match(
      body,
      /exception when others then/,
      `${fn} does not guard its audit write: a failed audit must never fail the action`
    );
  }
});

test('fn_log_admin_action is called with the full ten-parameter signature', () => {
  const calls = [...code.matchAll(/perform public\.fn_log_admin_action\(([\s\S]*?)\n\s*\);/g)];
  const expected = FUNCTIONS.length - NON_AUDITING.length;
  assert.ok(
    calls.length >= expected,
    `expected at least ${expected} audit calls, found ${calls.length}`
  );
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
  }
});

// ------------------------------------------- follow-up: 20260903121500

/**
 * THE FOLLOW-UP THAT MADE THE FILE TELL THE TRUTH.
 *
 * 20260903120000 shipped fn_ca_operator_audit_trail and
 * fn_ca_operator_staff with a guarded fn_log_admin_action call that passed
 * `p_admin_user_id := null`, because neither read signature carries an
 * actor. Production's fn_log_admin_action refuses a null actor, so the
 * write failed on EVERY call and the failure went into a `raise notice`.
 * A rolled-back production simulation found it.
 *
 * These tests are about the SHAPE of the correction, the same way the rest
 * of this file is about the shape of the migration: that it replaces
 * exactly the two functions and nothing else, that the replacements really
 * are free of the dead write, that the ACL travels with them so the file
 * stands alone, and that the count of read RPCs which legitimately do not
 * audit is now three and not four.
 */

/** The two functions the follow-up replaces. Nothing else may be in it. */
const FOLLOWUP_FUNCTIONS = ['fn_ca_operator_audit_trail', 'fn_ca_operator_staff'];

/** One function's body out of a given migration text. */
function bodyIn(text, fn) {
  const start = text.indexOf(`create or replace function public.${fn}`);
  assert.ok(start > -1, `${fn} is not defined in that migration`);
  return text.slice(start, text.indexOf('$fn$;', start) + 5);
}

/** Body lines with the guarded fn_log_admin_action block cut out. */
function withoutAuditBlock(lines) {
  const perform = lines.findIndex((l) => l.includes('perform public.fn_log_admin_action'));
  if (perform === -1) return lines;
  let start = perform;
  while (start > 0 && lines[start].trim() !== 'begin') start -= 1;
  let end = perform;
  while (end < lines.length - 1 && lines[end].trim() !== 'end;') end += 1;
  return [...lines.slice(0, start), ...lines.slice(end + 1)];
}

/** Code lines only: comments and blanks carry no behaviour. */
function codeLines(body) {
  return body
    .split('\n')
    .map((l) => l.trimEnd())
    .filter((l) => l.trim() !== '' && !l.trim().startsWith('--'));
}

test('the follow-up migration exists and replaces exactly the two read functions', () => {
  assert.ok(followup.length > 0, 'the follow-up migration is empty');

  const replaced = [...followupCode.matchAll(/create or replace function public\.([a-z_]+)\s*\(/g)].map(
    (m) => m[1]
  );
  assert.deepEqual(
    [...replaced].sort(),
    [...FOLLOWUP_FUNCTIONS].sort(),
    `the follow-up replaces [${replaced.join(', ')}], expected exactly [${FOLLOWUP_FUNCTIONS.join(', ')}]`
  );

  // Two functions and nothing else. A follow-up that quietly carried a
  // table change, an index, a policy or a grant to somebody new would be a
  // different migration wearing this one's name.
  assert.ok(!/create\s+table/i.test(followupCode), 'the follow-up creates a table');
  assert.ok(!/alter\s+table/i.test(followupCode), 'the follow-up alters a table');
  assert.ok(!/drop\s+/i.test(followupCode), 'the follow-up drops an object');
  assert.ok(!/create\s+(unique\s+)?index/i.test(followupCode), 'the follow-up creates an index');
  assert.ok(!/create\s+policy/i.test(followupCode), 'the follow-up creates a policy');
  assert.ok(!/insert\s+into/i.test(followupCode), 'the follow-up writes rows');
  assert.ok(!/delete\s+from/i.test(followupCode), 'the follow-up deletes rows');
  assert.match(followupCode, /set local lock_timeout/, 'the follow-up runs without a lock timeout');
});

test('the two replacements are the originals with the dead audit block removed, and nothing else', () => {
  for (const fn of FOLLOWUP_FUNCTIONS) {
    const before = withoutAuditBlock(codeLines(bodyIn(code, fn)));
    const after = codeLines(bodyIn(followupCode, fn));
    assert.deepEqual(
      after,
      before,
      `${fn} differs from its 20260903120000 definition by more than the audit block`
    );
  }
});

test('neither replacement mentions fn_log_admin_action', () => {
  for (const fn of FOLLOWUP_FUNCTIONS) {
    const body = bodyIn(followupCode, fn);
    assert.ok(
      !/fn_log_admin_action/.test(body),
      `${fn} still calls fn_log_admin_action: the write can never succeed, so it must not be there`
    );
  }
  // And no statement anywhere in the file writes the two dead action names.
  for (const action of ['operator.staff.read', 'operator.audit_trail.read']) {
    assert.ok(
      !new RegExp(`p_action\\s*:=\\s*'${action.replace('.', '\\.')}'`).test(followupCode),
      `the follow-up still writes the ${action} audit action`
    );
  }
  // The header still NAMES fn_log_admin_action, because the header is
  // where the removal is explained. Comments are not statements.
  assert.match(followup, /fn_log_admin_action/, 'the follow-up never explains what it removed');
});

test('the follow-up carries the REVOKE and GRANT for both functions so it is ACL self-contained', () => {
  const signatures = {
    fn_ca_operator_audit_trail: '\\(text, text, int, int\\)',
    fn_ca_operator_staff: '\\(\\)',
  };
  for (const [fn, args] of Object.entries(signatures)) {
    assert.match(
      followupCode,
      new RegExp(`revoke all on function public\\.${fn}\\s*${args} from public, anon, authenticated;`),
      `${fn} has no REVOKE in the follow-up`
    );
    assert.match(
      followupCode,
      new RegExp(`grant execute on function public\\.${fn}\\s*${args} to service_role;`),
      `${fn} has no GRANT EXECUTE TO service_role in the follow-up`
    );
  }
  // Exactly two grants, both to service_role and to nothing else. A
  // CREATE OR REPLACE keeps the existing ACL, so a stray grant here would
  // be a real widening, which contract section 0 forbids.
  const grants = followupCode.match(/grant execute on function[\s\S]*?to ([a-z_, ]+);/g) || [];
  assert.equal(grants.length, FOLLOWUP_FUNCTIONS.length, 'unexpected number of GRANT EXECUTE statements');
  for (const grant of grants) {
    assert.match(grant, /to service_role;$/, `granted to something other than service_role: ${grant}`);
  }
});

test('exactly three ca_operator read RPCs do not audit, and every other one still does', () => {
  assert.equal(
    NON_AUDITING_READS.length,
    3,
    `expected three non-auditing read RPCs, the list has ${NON_AUDITING_READS.length}`
  );
  assert.deepEqual(
    [...NON_AUDITING_READS].sort(),
    ['fn_ca_operator_audit_trail', 'fn_ca_operator_permissions', 'fn_ca_operator_staff'],
    'the non-auditing read set is not permissions + staff + audit_trail'
  );

  // Each of the three really is free of the write, in its LIVE definition.
  for (const fn of NON_AUDITING_READS) {
    assert.ok(
      !/fn_log_admin_action/.test(liveBody(fn)),
      `${fn} is listed as non-auditing but its live definition still calls fn_log_admin_action`
    );
  }

  // And every OTHER ca_operator function in the family still audits, apart
  // from the internal predicate whose two callers record the answer.
  const rest = FUNCTIONS.filter(
    (fn) => !NON_AUDITING_READS.includes(fn) && !INTERNAL_PREDICATES.includes(fn)
  );
  assert.equal(rest.length, 6, `expected six auditing functions, found ${rest.length}`);
  for (const fn of rest) {
    assert.match(
      liveBody(fn),
      /perform public\.fn_log_admin_action\(/,
      `${fn} must still file an audit row`
    );
  }
  for (const fn of INTERNAL_PREDICATES) {
    assert.ok(
      !/fn_log_admin_action/.test(liveBody(fn)),
      `${fn} is a predicate its callers already record and must not audit`
    );
  }
});

test('the follow-up header explains the defect, how it was found, and why not to add an actor', () => {
  const header = followup.slice(0, followup.indexOf('set local lock_timeout'));
  assert.match(header, /WHAT WAS WRONG/);
  assert.match(header, /HOW IT WAS FOUND/);
  assert.match(header, /rolled-back production simulation/i, 'the header does not say a rolled-back sim found it');
  assert.match(header, /admin_user_id required/, 'the header does not quote what production refuses');
  assert.match(header, /p_admin_user_id := null/, 'the header does not show the call that fails');
  assert.match(header, /pages\/api\/horses\/operator-admin\.js/, 'the header does not name the calling route');
  assert.match(header, /operatorAudit\.js/, 'the header does not name where the real audit row is written');
  assert.match(header, /WHY NOT ADD AN ACTOR PARAMETER/);
  assert.match(header, /signature change/i);
  assert.match(header, /Tier 3/);
});

test('the follow-up asserts the two functions still exist, return jsonb, and no longer audit', () => {
  const assertBlock = followupCode.slice(followupCode.lastIndexOf('do $assert$'));
  assert.ok(assertBlock.length > 0, 'the follow-up has no assertion block');
  assert.match(assertBlock, /to_regprocedure/, 'existence is not asserted against the catalog');
  for (const sig of [
    "public.fn_ca_operator_audit_trail(text, text, int, int)",
    "public.fn_ca_operator_staff()",
  ]) {
    assert.ok(assertBlock.includes(`'${sig}'`), `the assertion block never checks ${sig}`);
  }
  assert.match(assertBlock, /expected jsonb/, 'the return type is not asserted');
  assert.match(assertBlock, /prosrc/, 'the source is not read from the catalog');
  assert.match(assertBlock, /still calls fn_log_admin_action/, 'the removal is not asserted');
  const raises = assertBlock.match(/raise exception/g) || [];
  assert.ok(raises.length >= 3, `expected at least 3 assertions, found ${raises.length}`);
});

test('the follow-up says why a pasted ROLLBACK is not appropriate and names the real one', () => {
  assert.match(followup, /^-- ROLLBACK$/m, 'no `-- ROLLBACK` section');
  const section = followup.slice(followup.indexOf('-- ROLLBACK'));
  // Comment markers and line wrapping stripped, so a sentence that runs
  // over two comment lines still reads as one sentence.
  const prose = section
    .split('\n')
    .map((l) => l.trim().replace(/^--\s?/, ''))
    .join(' ')
    .replace(/\s+/g, ' ');
  assert.match(
    prose,
    /restoring a write that always fails is not a rollback anyone wants/i,
    'the section does not say in one line why a restore script would be wrong'
  );
  assert.match(
    prose,
    /20260903120000_ca_operator_rbac_and_approvals\.sql/,
    'the section does not name the file whose definitions are the real rollback'
  );
  assert.match(prose, /VERBATIM/, 'the section does not say the definitions are re-applied verbatim');
  // Nothing in it is runnable, the same rule the first migration follows.
  for (const line of section.split('\n')) {
    if (line.trim() === '') continue;
    assert.ok(line.trim().startsWith('--'), `the ROLLBACK section has a live statement: ${line}`);
  }
});

test('the follow-up is ascii and free of em dashes, like the migration', () => {
  const bad = [...followup].filter((ch) => ch.codePointAt(0) > 126);
  assert.deepEqual(
    [...new Set(bad)],
    [],
    `the follow-up contains non-ascii characters: ${JSON.stringify([...new Set(bad)])}`
  );
  // Escaped, so this test file does not itself contain the character it
  // forbids.
  assert.ok(!followup.includes('\u2014'), 'the follow-up contains an em dash');
});

test('the contract records all three non-auditing read functions as a post-build correction', () => {
  const section = contract.slice(contract.indexOf('## 1. Database'), contract.indexOf('## 2. Server'));
  assert.ok(section.length > 0, 'contract section 1 not found');
  const auditSentence = section.slice(section.indexOf('Every RPC writes its own admin_audit_log row'));
  assert.ok(auditSentence.length > 0, 'contract section 1 no longer carries the audit sentence');
  for (const fn of NON_AUDITING_READS) {
    assert.ok(
      auditSentence.includes(fn),
      `the contract's audit sentence does not name ${fn} as a function that files no row`
    );
  }
  assert.match(auditSentence, /post-build correction/i, 'the exception is not marked as a post-build correction');
  assert.match(auditSentence, /2026-09-03/, 'the correction carries no date');
  assert.match(
    auditSentence,
    /admin_user_id/,
    'the contract does not say why staff and audit_trail cannot audit'
  );
});

// ------------------------------------------ gate fix: 20260903140000

/**
 * THE FOLLOW-UP THAT MADE THE APPROVAL GATE EXACT.
 *
 * An adversarial review of the APPLIED migration (review2/server-db.md,
 * 2026-09-03, verified with two production probes that ended in RAISE
 * EXCEPTION so every write rolled back) found eight defects living inside
 * 20260903120000's function bodies. Four of them are the reason this file
 * exists:
 *
 *   B-2  the idempotent branch answered `required := status = 'pending'`,
 *        so a REJECTED or EXPIRED row came back required:false and the
 *        route moved the money against a refused request;
 *   B-3  the same branch never compared the replay's kind, amount, asset
 *        or target against the stored row, so an approved 500 chip
 *        request could be replayed as 999999 to another club;
 *   H-2  the SQL gated on `>` while approvals.js, the console copy and
 *        the test all say `>=`, and requireApproval ANDs the two, so an
 *        amount exactly equal to the threshold went through unwatched;
 *   H-4  enforcement could strip admin.manage from the only account able
 *        to turn enforcement off.
 *
 * These tests are about the SHAPE of that correction, the same way the
 * rest of this file is about the shape of the migration: that it replaces
 * exactly the five functions it claims and changes no signature, that the
 * new comparison and the new branches are really in the bodies, that the
 * ACL travels with them so the file stands alone, and that the assertion
 * block proves the behaviour against the database inside something it
 * rolls back. The behaviour itself is proved by docs/horses/PHASE2-SIM-2.sql.
 */

/** The five functions the gate migration replaces. Nothing else. */
const GATE_FUNCTIONS = [
  'fn_ca_operator_permissions',
  'fn_ca_operator_grant',
  'fn_ca_operator_set_policy',
  'fn_ca_operator_request_approval',
  'fn_ca_operator_decide_approval',
];

/** The parameter list of one function definition, whitespace normalised. */
function signatureIn(text, fn) {
  const start = text.indexOf(`create or replace function public.${fn}`);
  assert.ok(start > -1, `${fn} is not defined in that migration`);
  const open = text.indexOf('(', start);
  const returns = text.indexOf('returns', start);
  assert.ok(open > -1 && returns > open, `${fn} has no parameter list`);
  return text
    .slice(open, text.lastIndexOf(')', returns) + 1)
    .replace(/\s+/g, ' ')
    .trim();
}

/** The gate migration's assertion block, which is where its probes live. */
function gateAssertBlock() {
  const start = gateCode.lastIndexOf('do $assert$');
  assert.ok(start > -1, 'the gate migration has no assertion block');
  return gateCode.slice(start);
}

test('the gate migration replaces exactly the five intended functions', () => {
  assert.ok(gate.length > 0, 'the gate migration is empty');

  const replaced = [...gateCode.matchAll(/create or replace function public\.([a-z_]+)\s*\(/g)].map(
    (m) => m[1]
  );
  assert.deepEqual(
    [...replaced].sort(),
    [...GATE_FUNCTIONS].sort(),
    `the gate migration replaces [${replaced.join(', ')}], expected exactly [${GATE_FUNCTIONS.join(', ')}]`
  );

  // The four it must NOT touch. mark_executed is already exactly-once,
  // has_second_approver is the single copy of the alone rule, and the two
  // read functions are owned by 20260903121500 - replacing one here would
  // silently put its dead audit write back.
  for (const fn of [
    'fn_ca_operator_mark_executed',
    'fn_ca_operator_has_second_approver',
    'fn_ca_operator_audit_trail',
    'fn_ca_operator_staff',
    'fn_ca_operator_revoke',
  ]) {
    assert.ok(
      !replaced.includes(fn),
      `the gate migration replaces ${fn}, which is not one of its five`
    );
  }
});

test('the gate migration changes no signature: Tier 2, not Tier 3', () => {
  for (const fn of GATE_FUNCTIONS) {
    assert.equal(
      signatureIn(gateCode, fn),
      signatureIn(code, fn),
      `${fn} has a different parameter list from its 20260903120000 definition, which would create an OVERLOAD rather than replace it`
    );
  }
  // And each one still returns jsonb, which every caller reads keys off.
  for (const fn of GATE_FUNCTIONS) {
    const start = gateCode.indexOf(`create or replace function public.${fn}`);
    const head = gateCode.slice(start, gateCode.indexOf('as $fn$', start));
    assert.match(head, /returns jsonb/, `${fn} no longer returns jsonb`);
    assert.match(head, /security definer/, `${fn} is not SECURITY DEFINER`);
    assert.match(head, /set search_path = public, pg_temp/, `${fn} does not pin search_path`);
  }
});

test('the gate migration creates nothing and alters nothing', () => {
  // Five CREATE OR REPLACE FUNCTIONs, their ACL lines and one assertion
  // block. A follow-up that quietly carried a table change, an index, a
  // policy or a grant to somebody new would be a different migration
  // wearing this one's name.
  assert.ok(!/create\s+table/i.test(gateCode), 'the gate migration creates a table');
  assert.ok(!/alter\s+table/i.test(gateCode), 'the gate migration alters a table');
  assert.ok(!/drop\s+/i.test(gateCode), 'the gate migration drops an object');
  assert.ok(!/create\s+(unique\s+)?index/i.test(gateCode), 'the gate migration creates an index');
  assert.ok(!/create\s+policy/i.test(gateCode), 'the gate migration creates a policy');
  assert.match(gateCode, /set local lock_timeout/, 'the gate migration runs without a lock timeout');
});

test('H-2: the threshold comparison is >= and the loose one is gone', () => {
  const body = bodyIn(gateCode, 'fn_ca_operator_request_approval');
  assert.match(
    body,
    /v_required\s*:=\s*p_amount\s*>=\s*v_threshold/,
    'the threshold is not compared with >=, so an amount equal to it is not gated'
  );
  assert.ok(
    !/v_required\s*:=\s*p_amount\s*>\s*v_threshold/.test(body),
    'the old `p_amount > v_threshold` comparison is still in the body'
  );
  // The old one really was the other way round, so this test is about a
  // change and not about a coincidence.
  assert.match(
    bodyIn(code, 'fn_ca_operator_request_approval'),
    /v_required\s*:=\s*p_amount\s*>\s*v_threshold/,
    'the applied migration did not gate on >, so this test is asserting the wrong history'
  );
  // And the module it has to agree with still gates at >=.
  const approvals = readFileSync(join(repo, 'src/lib/horses/approvals.js'), 'utf8');
  assert.match(
    approvals,
    /if \(amt < threshold\)/,
    'src/lib/horses/approvals.js no longer gates at >=, so the two layers disagree again'
  );
});

test('B-3: the idempotent branch compares the material fields and refuses a mismatch', () => {
  const body = bodyIn(gateCode, 'fn_ca_operator_request_approval');
  for (const [field, param] of [
    ['kind', 'p_kind'],
    ['amount', 'p_amount'],
    ['asset', 'p_asset'],
    ['target_type', 'p_target_type'],
    ['target_id', 'p_target_id'],
  ]) {
    assert.match(
      body,
      new RegExp(`v_existing\\.${field} is distinct from ${param}`),
      `the replay does not compare ${field}: a different operation could reuse the key`
    );
  }
  assert.match(body, /'error', 'payload_mismatch'/, 'there is no payload_mismatch refusal');
  assert.match(body, /'mismatch', to_jsonb\(v_mismatch\)/, 'the refusal does not name the fields that differ');

  // The mismatch check must come BEFORE the status branch, or a laundered
  // replay of an approved row reaches the required:false answer first.
  const mismatchAt = body.indexOf("'error', 'payload_mismatch'");
  const statusAt = body.indexOf("v_existing.status in ('approved', 'auto_approved')");
  assert.ok(mismatchAt > -1 && statusAt > mismatchAt, 'the status branch runs before the mismatch check');
});

test('B-2: every stored status has its own branch, and only two answer required:false', () => {
  const body = bodyIn(gateCode, 'fn_ca_operator_request_approval');

  // The defect itself, gone.
  assert.ok(
    !/'required',\s*v_existing\.status = 'pending'/.test(body),
    "the idempotent branch still answers required := (status = 'pending'), which is B-2"
  );
  // And it really was there before, so this is a change and not a hope.
  assert.match(
    bodyIn(code, 'fn_ca_operator_request_approval'),
    /'required',\s*v_existing\.status = 'pending'/,
    'the applied migration did not carry the B-2 expression, so this test asserts the wrong history'
  );

  // Cleared to proceed: the only two statuses that may say required:false.
  assert.match(body, /v_existing\.status in \('approved', 'auto_approved'\)/);
  // Executed: required:false WITH already_executed, so the caller's own
  // op_id claim is what replays.
  assert.match(body, /v_existing\.status = 'executed'/);
  assert.match(body, /'already_executed', true/);
  // Pending: still waiting.
  assert.match(body, /v_existing\.status = 'pending'/);
  // Refused outright, with their own codes.
  assert.match(body, /v_existing\.status in \('rejected', 'expired'\)/);
  assert.match(body, /'approval_rejected'/);
  assert.match(body, /'approval_expired'/);
  assert.match(body, /'refused', true/);
  // Failed: a fresh request under the same key, re-opened in place
  // because op_id is unique.
  assert.match(body, /v_retry_failed\s*:=\s*true/);
  assert.match(body, /'retried_after_failure'/);

  // A refusal never says required:false. Every jsonb_build_object that
  // carries a refusal code carries required true beside it.
  for (const code_ of ['payload_mismatch', 'approval_rejected']) {
    const at = body.indexOf(`'${code_}'`);
    const around = body.slice(Math.max(0, at - 400), at + 400);
    assert.match(
      around,
      /'required', true/,
      `the ${code_} refusal does not also answer required:true, so a caller reading only \`required\` would proceed`
    );
  }
});

test('M-5: a pending row past its TTL is closed on sight rather than answered forever', () => {
  const body = bodyIn(gateCode, 'fn_ca_operator_request_approval');
  assert.match(
    body,
    /v_existing\.status = 'pending'[\s\S]{0,200}v_existing\.expires_at <= now\(\)[\s\S]{0,200}set status = 'expired'/,
    'a timed-out pending row is not marked expired when it is replayed'
  );
});

test('M-3 and M-4: both lost-update races are closed with ON CONFLICT', () => {
  const request = bodyIn(gateCode, 'fn_ca_operator_request_approval');
  assert.match(
    request,
    /on conflict \(op_id\) where op_id is not null do nothing/,
    'the approval insert can still raise 23505 on a concurrent same-op_id request'
  );
  assert.match(request, /'raced', true/, 'the loser of the op_id race does not re-read the winner row');

  const grant = bodyIn(gateCode, 'fn_ca_operator_grant');
  assert.match(
    grant,
    /on conflict \(user_id, role_key\) where revoked_at is null do nothing/,
    'the grant insert can still raise 23505 on a concurrent identical grant'
  );
});

test('L-4: an auto_approved row with no decider gets no decision time', () => {
  const body = bodyIn(gateCode, 'fn_ca_operator_request_approval');
  // decided_by and decided_at are now guarded by the SAME condition.
  const guards = [...body.matchAll(/case when v_status = 'auto_approved'([^\n]*)then/g)].map((m) =>
    m[1].trim()
  );
  assert.ok(guards.length >= 2, 'the decided_by and decided_at guards are not both there');
  for (const guard of guards) {
    assert.match(
      guard,
      /and v_alone/,
      'decided_at is stamped on rows that had no decider, which reads as a decision that happened'
    );
  }
});

test('H-4: fn_ca_operator_permissions carries the admin.manage recovery floor', () => {
  const body = bodyIn(gateCode, 'fn_ca_operator_permissions');
  assert.match(body, /v_is_legacy/, 'the floor is not gated on the profile role being legacy');
  assert.match(
    body,
    /if v_is_legacy and not \(coalesce\(v_permissions[\s\S]{0,120}admin\.manage/,
    'there is no admin.manage floor for legacy accounts'
  );
  assert.match(
    body,
    /'admin_manage_floor', v_floor/,
    'the result does not report whether the floor was applied'
  );
  // The floor may only ever ADD. A narrowing here would breach contract
  // section 0 on the three accounts production actually has.
  assert.ok(
    !/v_permissions\s*:=\s*array_remove/.test(body),
    'the permission resolver removes a permission, which can only narrow somebody'
  );
  // And the reason is written down where the next reader will find it.
  assert.match(gate, /RECOVERY HATCH/, 'the recovery hatch is never named as such');
});

test('H-4: fn_ca_operator_set_policy refuses the lockout instead of committing it', () => {
  const body = bodyIn(gateCode, 'fn_ca_operator_set_policy');
  assert.match(
    body,
    /if coalesce\(\(p_patch ->> 'enforce_named_roles'\)::boolean, false\) then/,
    'the guard does not fire on a patch that turns enforcement on'
  );
  assert.match(body, /'admin\.manage'/, 'the guard never counts admin.manage holders');
  assert.match(
    body,
    /'error', 'enforce_named_roles_would_lock_out'/,
    'there is no refusal code for the lockout'
  );
  assert.match(body, /'admin_manage_holders', v_holders/, 'the refusal does not say how many holders were counted');
  // The guard has to run BEFORE the update, or it refuses a flag it has
  // already written.
  const guardAt = body.indexOf("enforce_named_roles_would_lock_out");
  const updateAt = body.indexOf('update public.ca_operator_policy');
  assert.ok(guardAt > -1 && updateAt > guardAt, 'the lockout guard runs after the policy row is written');
});

test('M-2: fn_ca_operator_decide_approval checks the decider holds the permission', () => {
  const body = bodyIn(gateCode, 'fn_ca_operator_decide_approval');
  assert.match(
    body,
    /fn_ca_operator_permissions\(p_decided_by\)[\s\S]{0,120}\? v_permission/,
    'the decision RPC never resolves the decider permissions'
  );
  assert.match(body, /'error', 'permission_denied'/, 'there is no permission_denied refusal');
  assert.match(body, /'required_permission', v_permission/, 'the refusal does not name the permission needed');
  // It must sit after the dead-row branches, so a decision on an expired
  // or already-decided row still says so.
  const expiredAt = body.indexOf("'error', 'expired'");
  const permAt = body.indexOf("'error', 'permission_denied'");
  assert.ok(expiredAt > -1 && permAt > expiredAt, 'the permission check hides the expired and already-decided branches');
  // And the applied migration genuinely had no such check.
  assert.ok(
    !/fn_ca_operator_permissions/.test(bodyIn(code, 'fn_ca_operator_decide_approval')),
    'the applied decide_approval already checked permissions, so this test asserts the wrong history'
  );
});

test('the gate migration restates the ACL for all five functions', () => {
  const signatures = {
    fn_ca_operator_permissions: '\\(uuid\\)',
    fn_ca_operator_grant: '\\(uuid, text, uuid, text\\)',
    fn_ca_operator_set_policy: '\\(jsonb, uuid\\)',
    fn_ca_operator_request_approval:
      '\\(text, jsonb, uuid, numeric, text, text, text, text, text, text\\)',
    fn_ca_operator_decide_approval: '\\(uuid, text, uuid, text\\)',
  };
  for (const [fn, args] of Object.entries(signatures)) {
    assert.match(
      gateCode,
      new RegExp(`revoke all on function public\\.${fn}\\s*${args}[\\s\\S]{0,40}?from public, anon, authenticated;`),
      `${fn} has no REVOKE in the gate migration`
    );
    assert.match(
      gateCode,
      new RegExp(`grant execute on function public\\.${fn}\\s*${args}[\\s\\S]{0,40}?to service_role;`),
      `${fn} has no GRANT EXECUTE TO service_role in the gate migration`
    );
  }
  // Exactly five grants, all to service_role and to nothing else. A
  // CREATE OR REPLACE keeps the existing ACL, so a stray grant here would
  // be a real widening, which contract section 0 forbids.
  const grants = gateCode.match(/grant execute on function[\s\S]*?to ([a-z_, ]+);/g) || [];
  assert.equal(grants.length, GATE_FUNCTIONS.length, 'unexpected number of GRANT EXECUTE statements');
  for (const g of grants) {
    assert.match(g, /to service_role;$/, `granted to something other than service_role: ${g}`);
  }
});

test('the four mutators the gate replaced still file their audit row', () => {
  // liveBody reads the NEWEST definition, so this is about what the
  // database ends up holding, not about what any one file says.
  for (const fn of GATE_FUNCTIONS.filter((f) => f !== 'fn_ca_operator_permissions')) {
    const body = liveBody(fn);
    assert.match(body, /perform public\.fn_log_admin_action\(/, `${fn} lost its audit row in the gate migration`);
    assert.match(
      body,
      /exception when others then/,
      `${fn} does not guard its audit write: a failed audit must never fail the action`
    );
  }
  // And the read still does not audit.
  assert.ok(
    !/fn_log_admin_action/.test(liveBody('fn_ca_operator_permissions')),
    'the gate migration gave permission resolution an audit write, which would bury the trail'
  );
});

test('the gate header explains each defect, how it was found, and what it does not fix', () => {
  const header = gate.slice(0, gate.indexOf('set local lock_timeout'));
  assert.match(header, /WHAT THIS IS/);
  assert.match(header, /HOW THESE WERE FOUND/);
  assert.match(header, /adversarial review/i, 'the header does not say an adversarial review found these');
  assert.match(header, /already applied/i, 'the header does not say the migration was already applied');
  assert.match(header, /probe/i, 'the header does not mention the production probes');
  assert.match(header, /RAISE EXCEPTION/, 'the header does not say the probes were rolled back by an abort');
  for (const finding of ['B-2', 'B-3', 'H-2', 'H-4', 'M-2', 'M-3', 'M-4', 'M-5', 'L-4']) {
    assert.ok(header.includes(finding), `the header never explains finding ${finding}`);
  }
  // The ones it deliberately leaves alone are named too, so the next
  // reader knows they were considered.
  assert.match(header, /WHAT THIS FILE DELIBERATELY DOES NOT FIX/);
  for (const finding of ['B-1', 'H-1', 'H-3', 'M-1', 'M-6', 'M-7', 'M-8']) {
    assert.ok(header.includes(finding), `the header never says why ${finding} is not fixed here`);
  }
  // And contract section 0 is argued, not assumed.
  assert.match(header, /CONTRACT SECTION 0/);
  assert.match(header, /Tier 2/);
});

test('the gate migration proves the new behaviour in a savepoint it rolls back', () => {
  const block = gateAssertBlock();
  // A subtransaction with a sentinel, so every row the probe writes is
  // undone inside the migration itself.
  assert.match(block, /ROLLBACK_PROBE/, 'the assertion block has no rollback sentinel');
  assert.match(
    block,
    /if sqlerrm <> 'ROLLBACK_PROBE' then\s*\n\s*raise;/,
    'the sentinel handler swallows real failures instead of re-raising them'
  );
  // The behaviours the review said were unprovable from the file text.
  for (const [finding, needle] of [
    ['H-2', 'ASSERT FAILED (H-2)'],
    ['B-2', 'ASSERT FAILED (B-2)'],
    ['B-3', 'ASSERT FAILED (B-3)'],
    ['M-2', 'ASSERT FAILED (M-2)'],
    ['M-4', 'ASSERT FAILED (M-4)'],
    ['H-4', 'ASSERT FAILED (H-4)'],
    ['L-4', 'ASSERT FAILED (L-4)'],
  ]) {
    assert.ok(block.includes(needle), `the assertion block never checks ${finding}`);
  }
  // Rolled back means rolled back: it re-reads the policy row and the
  // probe rows afterwards and refuses to finish if anything survived.
  assert.match(block, /the probe changed the policy row and it was not rolled back/);
  assert.match(block, /probe approval row\(s\) survived the rollback/);
  assert.match(block, /probe grant row\(s\) survived the rollback/);
  const raises = block.match(/raise exception/g) || [];
  assert.ok(raises.length >= 15, `only ${raises.length} assertions in the gate migration`);
  // Synthetic actors only, in the same reserved block the sims use, and
  // never a write to profiles.
  const uuids = block.match(/'[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}'/gi) || [];
  assert.ok(uuids.length > 0, 'the assertion block uses no synthetic uuids');
  for (const u of uuids) {
    assert.match(u, /^'00000000-0000-4000-8000-0000000000[0-9a-f]{2}'$/, `uuid outside the reserved block: ${u}`);
  }
  assert.ok(!/update\s+public\.profiles/i.test(gateCode), 'the gate migration writes to profiles');
  assert.ok(!/insert\s+into\s+public\.profiles/i.test(gateCode), 'the gate migration writes to profiles');
});

test('the gate migration carries a commented ROLLBACK naming the previous definitions', () => {
  assert.match(gate, /^-- ROLLBACK$/m, 'no `-- ROLLBACK` section');
  const section = gate.slice(gate.indexOf('-- ROLLBACK'));
  const prose = section
    .split('\n')
    .map((l) => l.trim().replace(/^--\s?/, ''))
    .join(' ')
    .replace(/\s+/g, ' ');

  assert.match(
    prose,
    /20260903120000_ca_operator_rbac_and_approvals\.sql/,
    'the section does not name the file the previous definitions live in'
  );
  assert.match(prose, /VERBATIM/, 'the section does not say the definitions are re-applied verbatim');
  for (const [fn, section_] of [
    ['fn_ca_operator_permissions', '5.1'],
    ['fn_ca_operator_grant', '5.2'],
    ['fn_ca_operator_set_policy', '5.4'],
    ['fn_ca_operator_request_approval', '5.5'],
    ['fn_ca_operator_decide_approval', '5.6'],
  ]) {
    assert.ok(prose.includes(fn), `the ROLLBACK section does not name ${fn}`);
    assert.ok(prose.includes(`section ${section_}`), `the ROLLBACK section does not point at section ${section_}`);
  }
  // It says what rolling back would restore, so nobody runs it casually.
  assert.match(prose, /required:false for a REJECTED request/i);
  assert.match(prose, /approvals_enabled/, 'the section does not offer the faster remedy');
  // Nothing in it is runnable, the same rule both earlier migrations follow.
  for (const line of section.split('\n')) {
    if (line.trim() === '') continue;
    assert.ok(line.trim().startsWith('--'), `the ROLLBACK section has a live statement: ${line}`);
  }
});

test('the gate migration and the second simulation are ascii and free of em dashes', () => {
  for (const [name, text] of [['gate migration', gate], ['second simulation', sim2]]) {
    const bad = [...text].filter((ch) => ch.codePointAt(0) > 126);
    assert.deepEqual(
      [...new Set(bad)],
      [],
      `${name} contains non-ascii characters: ${JSON.stringify([...new Set(bad)])}`
    );
    // Escaped, so this test file does not itself contain the character
    // it forbids.
    assert.ok(!text.includes('\u2014'), `${name} contains an em dash`);
  }
});

test('the second simulation is wrapped in a transaction it rolls back', () => {
  assert.match(sim2, /^begin;$/m, 'the second simulation does not open a transaction');
  assert.match(sim2, /^rollback;$/m, 'the second simulation does not roll back');
  assert.ok(!/^commit;$/m.test(sim2), 'the second simulation commits, which would leave the policy changed');
  assert.match(sim2, /ROLLED BACK/i, 'the second simulation does not say at the top that it must be rolled back');
  // It stages a zero-holder world by clearing is_legacy, which is only
  // safe because it is rolled back, so it has to say so at the top.
  assert.match(sim2, /is_legacy/, 'the second simulation never mentions the flag it clears');
  const uuids = sim2.match(/'[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}'/gi) || [];
  assert.ok(uuids.length > 0, 'the second simulation uses no synthetic uuids');
  for (const u of uuids) {
    assert.match(u, /^'00000000-0000-4000-8000-0000000000[0-9a-f]{2}'$/, `uuid outside the reserved block: ${u}`);
  }
  assert.ok(!/update\s+public\.profiles/i.test(sim2), 'the second simulation writes to profiles');
  assert.ok(!/insert\s+into\s+public\.profiles/i.test(sim2), 'the second simulation writes to profiles');
  assert.ok(!/delete\s+from/i.test(sim2), 'the second simulation deletes rows');
  assert.ok(!/drop\s+/i.test(sim2), 'the second simulation drops an object');
});

test('the second simulation proves every fix, with a notice per step', () => {
  for (const step of [
    'STEP 1', 'STEP 2', 'STEP 3', 'STEP 4', 'STEP 5', 'STEP 6',
    'STEP 7', 'STEP 8', 'STEP 9', 'STEP 10', 'STEP 12',
  ]) {
    assert.ok(sim2.includes(`${step} OK`), `the second simulation never reports ${step} OK`);
  }
  // STEP 11 stages a world with nobody holding admin.manage, which it can
  // only do when no active grant carries it, so it reports OK or SKIPPED.
  assert.ok(
    sim2.includes('STEP 11 OK') && sim2.includes('STEP 11 SKIPPED'),
    'STEP 11 does not handle both the provable and the unstageable case'
  );
  for (const finding of ['H-2', 'B-2', 'B-3', 'M-2', 'M-3', 'M-4', 'M-5', 'H-4', 'L-4']) {
    assert.ok(sim2.includes(finding), `the second simulation never mentions ${finding}`);
  }
  for (const claim of [
    'payload_mismatch',
    'approval_rejected',
    'approval_expired',
    'already_executed',
    'permission_denied',
    'enforce_named_roles_would_lock_out',
    'admin_manage_floor',
    'retried_after_failure',
  ]) {
    assert.ok(sim2.includes(claim), `the second simulation does not cover: ${claim}`);
  }
  // Each claim is checked, not just narrated.
  const failures = sim2.match(/raise exception/g) || [];
  assert.ok(failures.length >= 20, `only ${failures.length} assertions in the second simulation`);
  for (const fn of GATE_FUNCTIONS) {
    assert.ok(sim2.includes(`public.${fn}(`), `the second simulation never exercises ${fn}`);
  }
});

// ------------------------------------------------------------- additive

test('the migration is additive: no DROP TABLE or ALTER TABLE outside its own tables', () => {
  const drops = [...code.matchAll(/drop\s+table\s+(?:if exists\s+)?([a-z_.]+)/gi)].map((m) => m[1]);
  assert.deepEqual(drops, [], `the migration drops table(s): ${drops.join(', ')}`);

  const alters = [...code.matchAll(/alter\s+table\s+(?:if exists\s+)?public\.([a-z_]+)/gi)].map((m) => m[1]);
  for (const table of alters) {
    assert.ok(TABLES.includes(table), `ALTER TABLE on a table this file does not create: ${table}`);
  }

  assert.ok(!/drop\s+column/i.test(code), 'the migration drops a column');
  assert.ok(!/alter\s+column/i.test(code), 'the migration alters a column type');
  assert.ok(!/truncate/i.test(code), 'the migration truncates a table');
  assert.ok(!/delete\s+from/i.test(code), 'the migration deletes rows');
});

test('seeds are idempotent', () => {
  const seeds = seedSection();
  const inserts = seeds.match(/insert into public\.[a-z_]+/g) || [];
  assert.ok(inserts.length >= 4, 'expected at least four seed inserts');
  const conflicts = seeds.match(/on conflict[^;]*do nothing/g) || [];
  assert.ok(
    conflicts.length >= inserts.length,
    `${inserts.length} inserts but only ${conflicts.length} ON CONFLICT DO NOTHING clauses`
  );
  for (const table of TABLES) {
    assert.match(code, new RegExp(`create table if not exists public\\.${table}`), `${table} is not IF NOT EXISTS`);
  }
});

test('DDL runs under a lock timeout', () => {
  assert.match(code, /set local lock_timeout/, 'no SET LOCAL lock_timeout: DDL on a busy database can deadlock');
});

// ------------------------------------------------------------- rollback

test('the file carries a pasted ROLLBACK section', () => {
  assert.match(sql, /^-- ROLLBACK$/m, 'no `-- ROLLBACK` section');
  for (const fn of FUNCTIONS) {
    assert.ok(
      rollbackSection.includes(`drop function if exists public.${fn}`),
      `ROLLBACK does not drop ${fn}`
    );
  }
  for (const table of TABLES) {
    assert.ok(
      rollbackSection.includes(`drop table if exists public.${table}`),
      `ROLLBACK does not drop ${table}`
    );
  }
  // Children before parents: everything that references ca_operator_roles
  // is dropped before it.
  const rolesAt = rollbackSection.indexOf('drop table if exists public.ca_operator_roles');
  for (const child of ['ca_operator_role_permissions', 'ca_operator_grants']) {
    assert.ok(
      rollbackSection.indexOf(`drop table if exists public.${child}`) < rolesAt,
      `${child} must be dropped before ca_operator_roles`
    );
  }
  // Every line of the section is a comment, so applying the migration
  // cannot run it.
  for (const line of rollbackSection.split('\n')) {
    if (line.trim() === '') continue;
    assert.ok(line.trim().startsWith('--'), `the ROLLBACK section has a live statement: ${line}`);
  }
});

// -------------------------------------------------------------- hygiene

test('the header explains what this is, why approvals are off, and the alone rule', () => {
  const header = sql.slice(0, sql.indexOf('set local lock_timeout'));
  assert.match(header, /WHAT THIS IS/);
  assert.match(header, /WHY APPROVALS DEFAULT TO OFF/);
  assert.match(header, /THE ALONE RULE, EXACTLY/);
  assert.match(header, /no_second_approver/);
  assert.match(header, /allow_self_approve_when_alone/);
});

test('no em dash and no emoji in the migration or the simulation', () => {
  for (const [name, text] of [['migration', sql], ['simulation', sim]]) {
    const bad = [...text].filter((ch) => ch.codePointAt(0) > 126);
    assert.deepEqual(
      [...new Set(bad)],
      [],
      `${name} contains non-ascii characters: ${JSON.stringify([...new Set(bad)])}`
    );
    // Escaped, so this test file does not itself contain the character
    // it forbids.
    assert.ok(!text.includes('\u2014'), `${name} contains an em dash`);
  }
});

test('the simulation is wrapped in a transaction it rolls back', () => {
  assert.match(sim, /^begin;$/m, 'the simulation does not open a transaction');
  assert.match(sim, /^rollback;$/m, 'the simulation does not roll back');
  assert.ok(!/^commit;$/m.test(sim), 'the simulation commits, which would leave the policy changed');
  assert.match(sim, /ROLLED BACK/i, 'the simulation does not say at the top that it must be rolled back');
  // Synthetic actors only: no uuid outside the reserved block.
  const uuids = sim.match(/'[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}'/gi) || [];
  assert.ok(uuids.length > 0, 'the simulation uses no synthetic uuids');
  for (const u of uuids) {
    assert.match(u, /^'00000000-0000-4000-8000-0000000000[0-9a-f]{2}'$/, `uuid outside the reserved block: ${u}`);
  }
});

test('the simulation proves every claim it makes, with a notice per step', () => {
  for (const step of ['STEP 1', 'STEP 2', 'STEP 3', 'STEP 4', 'STEP 5', 'STEP 6', 'STEP 6b', 'STEP 7', 'STEP 8', 'STEP 9']) {
    assert.ok(sim.includes(`${step} OK`), `the simulation never reports ${step} OK`);
  }
  // Each claim has to be checked, not just narrated.
  const failures = sim.match(/raise exception/g) || [];
  assert.ok(failures.length >= 20, `only ${failures.length} assertions in the simulation`);
  for (const fn of FUNCTIONS) {
    assert.ok(sim.includes(`public.${fn}(`), `the simulation never exercises ${fn}`);
  }
  for (const claim of [
    'auto_approved',
    'self_approval_refused',
    'no_second_approver',
    "'expired'",
    'already=true',
    'idempotent',
  ]) {
    assert.ok(sim.includes(claim), `the simulation does not cover: ${claim}`);
  }
});

test('the simulation never touches a real account or commits a policy change', () => {
  // It may READ profiles to find a legacy operator, but it must never
  // write to one: a sim that edits profiles.role is one forgotten
  // ROLLBACK away from locking the platform out of its own console.
  assert.ok(!/update\s+public\.profiles/i.test(sim), 'the simulation writes to profiles');
  assert.ok(!/insert\s+into\s+public\.profiles/i.test(sim), 'the simulation writes to profiles');
  assert.ok(!/delete\s+from/i.test(sim), 'the simulation deletes rows');
  assert.ok(!/drop\s+/i.test(sim), 'the simulation drops an object');
});

// ----------------------------------------------------------------- REVERIFY
//
// The third follow-up, 20260903202500_ca_operator_reverify_fixes.sql. Four
// functions replaced with unchanged signatures: the alone-rule predicate
// (M-2), grant (L-3), decide (L-12) and the staff read (N-4).

const REVERIFY_FUNCTIONS = [
  'fn_ca_operator_has_second_approver',
  'fn_ca_operator_grant',
  'fn_ca_operator_decide_approval',
  'fn_ca_operator_staff',
];

function reverifyAssertBlock() {
  const start = reverifyCode.lastIndexOf('do $assert$');
  assert.ok(start > -1, 'the reverify migration has no assertion block');
  return reverifyCode.slice(start);
}

test('the reverify migration replaces exactly the four intended functions', () => {
  assert.ok(reverify.length > 0, 'the reverify migration is empty');
  const replaced = [...reverifyCode.matchAll(/create or replace function public\.([a-z_]+)\s*\(/g)].map(
    (m) => m[1]
  );
  assert.deepEqual([...replaced].sort(), [...REVERIFY_FUNCTIONS].sort());
  for (const fn of FUNCTIONS.filter((f) => !REVERIFY_FUNCTIONS.includes(f))) {
    assert.ok(!replaced.includes(fn), `the reverify migration replaces ${fn}, which is not one of its four`);
  }
});

test('the reverify migration changes no signature: Tier 2, not Tier 3', () => {
  for (const fn of REVERIFY_FUNCTIONS) {
    assert.equal(
      signatureIn(reverifyCode, fn),
      signatureIn(code, fn),
      `${fn} has a different parameter list from its 20260903120000 definition, which would create an OVERLOAD rather than replace it`
    );
    const start = reverifyCode.indexOf(`create or replace function public.${fn}`);
    const head = reverifyCode.slice(start, reverifyCode.indexOf('as $fn$', start));
    assert.match(head, /security definer/, `${fn} is not SECURITY DEFINER`);
    assert.match(head, /set search_path = public, pg_temp/, `${fn} does not pin search_path`);
    assert.match(
      head,
      fn === 'fn_ca_operator_has_second_approver' ? /returns boolean/ : /returns jsonb/,
      `${fn} changed its return type`
    );
  }
  // The predicate stays stable, as it was.
  const predicate = reverifyCode.slice(
    reverifyCode.indexOf('create or replace function public.fn_ca_operator_has_second_approver'),
    reverifyCode.indexOf('as $fn$', reverifyCode.indexOf('fn_ca_operator_has_second_approver'))
  );
  assert.match(predicate, /\nstable\n/);
});

test('the reverify migration creates nothing, alters nothing, and runs in one transaction', () => {
  assert.ok(!/create\s+table/i.test(reverifyCode), 'the reverify migration creates a table');
  assert.ok(!/alter\s+table/i.test(reverifyCode), 'the reverify migration alters a table');
  assert.ok(!/drop\s+/i.test(reverifyCode), 'the reverify migration drops an object');
  assert.ok(!/create\s+(unique\s+)?index/i.test(reverifyCode), 'the reverify migration creates an index');
  assert.ok(!/create\s+policy/i.test(reverifyCode), 'the reverify migration creates a policy');
  assert.ok(!/update\s+public\.profiles/i.test(reverifyCode), 'the reverify migration writes to profiles');
  assert.ok(!/insert\s+into\s+public\.profiles/i.test(reverifyCode), 'the reverify migration writes to profiles');
  assert.match(reverifyCode, /set local lock_timeout/, 'the reverify migration runs without a lock timeout');
  // N-5 of the review: `set local` outside a transaction is a no-op under
  // psql -f. This file opens and closes its own.
  assert.match(reverifyCode, /^begin;$/m, 'the reverify migration does not open a transaction');
  assert.match(reverifyCode, /^commit;$/m, 'the reverify migration does not commit');
  assert.ok(reverifyCode.indexOf('begin;') < reverifyCode.indexOf('set local lock_timeout'));
  assert.ok(reverifyCode.lastIndexOf('commit;') > reverifyCode.lastIndexOf('$assert$;'));
});

test('M-2: has_second_approver counts a grantless legacy account under enforcement, and the floor', () => {
  const body = bodyIn(reverifyCode, 'fn_ca_operator_has_second_approver');
  // The old exclusion is gone.
  assert.ok(!/where not v_enforce\s*\n/.test(body), 'the legacy branch still excludes every legacy account under enforcement');
  // The new rule: enforcement off, or admin.manage, or no active grant.
  assert.match(body, /not v_enforce\s*\n\s*or p_permission = 'admin\.manage'\s*\n\s*or not exists \(/);
  const exclusion = body.slice(body.indexOf('or not exists ('));
  assert.match(exclusion, /from public\.ca_operator_grants g\s*\n\s*where g\.user_id = p\.id\s*\n\s*and g\.revoked_at is null/);
  // And the original really did exclude them, so this is a change.
  assert.match(bodyIn(code, 'fn_ca_operator_has_second_approver'), /where not v_enforce/);
  // The rule it mirrors is still the rule in the live resolver.
  assert.match(
    liveBody('fn_ca_operator_permissions'),
    /if v_enforce and array_length\(v_granted_roles, 1\) is not null then/
  );
});

test('L-3: fn_ca_operator_grant refuses a uuid with no profile and refuses the legacy keys', () => {
  const body = bodyIn(reverifyCode, 'fn_ca_operator_grant');
  assert.match(body, /select true into v_has_profile from public\.profiles where id = p_user_id limit 1;/);
  assert.match(body, /raise exception 'fn_ca_operator_grant: operator_not_found[^']*'[^;]*using errcode = '23503'/);
  assert.match(body, /select true, r\.is_legacy into v_exists, v_is_legacy/);
  assert.match(body, /raise exception 'fn_ca_operator_grant: legacy_role_not_grantable[^']*'[^;]*using errcode = '23514'/);
  // Both refusals sit before the insert, so nothing is stored.
  const insertAt = body.indexOf('insert into public.ca_operator_grants');
  assert.ok(body.indexOf('operator_not_found') < insertAt);
  assert.ok(body.indexOf('legacy_role_not_grantable') < insertAt);
  // The idempotent ON CONFLICT insert from the gate migration survives.
  assert.match(body, /on conflict \(user_id, role_key\) where revoked_at is null do nothing/);
  // And both SQLSTATEs are ones dbErrors.js reads as the operator's input.
  const dbErrors = readFileSync(join(repo, 'src/lib/horses/dbErrors.js'), 'utf8');
  assert.match(dbErrors, /FOREIGN_KEY_VIOLATION: '23503'/);
  assert.match(dbErrors, /CHECK_VIOLATION: '23514'/);
  // The route refuses the same keys before the RPC, with the same words.
  const route = readFileSync(join(repo, 'pages/api/horses/operator-admin.js'), 'utf8');
  assert.match(route, /enumOf\(body\.roleKey, NAMED_OPERATOR_ROLES\)/);
  assert.match(route, /'Legacy Roles Live On The Profile, Not In A Grant', 'legacy_role_not_grantable'/);
});

test('L-12: fn_ca_operator_decide_approval lets the requester withdraw and files it by its own name', () => {
  const body = bodyIn(reverifyCode, 'fn_ca_operator_decide_approval');
  assert.match(body, /v_withdraw := v_self and v_decision = 'rejected';/);
  assert.match(body, /if v_self and not v_withdraw then/);
  // The self-approval refusal is still there for the approve case.
  assert.match(body, /'error', 'self_approval_refused'/);
  // The permission check still runs before the withdrawal (the requester
  // held it to raise the row).
  assert.ok(body.indexOf("'permission_denied'") < body.indexOf('v_withdraw :='));
  assert.match(
    body,
    /p_action\s*:=\s*case when v_withdraw then 'operator\.withdraw_approval' else 'operator\.decide_approval' end/
  );
  assert.match(body, /'withdrawn', v_withdraw/);
  assert.match(ACTION_RE.source, /./);
  assert.match('operator.withdraw_approval', ACTION_RE);
  // The row still ends in the same status vocabulary: there is no new
  // status, a withdrawal is a rejection.
  assert.ok(!/'withdrawn'\s*,?\s*\)?\s*where/.test(body));
  assert.match(body, /set status = v_decision,/);
  // The route audits the same name.
  const route = readFileSync(join(repo, 'pages/api/horses/operator-admin.js'), 'utf8');
  assert.match(route, /withdrawal \? 'operator\.withdraw_approval' : 'operator\.decide_approval'/);
});

test('N-4: fn_ca_operator_staff answers false when nobody has a verified factor, null only when unreadable', () => {
  const body = bodyIn(reverifyCode, 'fn_ca_operator_staff');
  assert.match(body, /v_mfa_known\s+boolean\s*:=\s*false;/);
  assert.match(body, /v_mfa_known := true;/);
  assert.match(body, /when not v_mfa_known then null/);
  assert.ok(!/when v_mfa = '\{\}'::jsonb then null/.test(body), 'an empty aggregate still answers null');
  assert.match(body, /where status = 'verified'/, 'true must come from a VERIFIED factor only');
  // The read-failure branch resets the flag, so a failed read is null.
  const handler = body.slice(body.indexOf('exception when others then'), body.indexOf('exception when others then') + 200);
  assert.match(handler, /v_mfa_known := false;/);
  // Still no audit row, and the grants array is intact.
  assert.ok(!/fn_log_admin_action/.test(body));
  assert.match(body, /as grants/);
  assert.match(body, /as granted_roles/);
});

test('the reverify migration restates the ACL for all four functions, to service_role only', () => {
  const signatures = {
    fn_ca_operator_has_second_approver: '\\(uuid, text\\)',
    fn_ca_operator_grant: '\\(uuid, text, uuid, text\\)',
    fn_ca_operator_decide_approval: '\\(uuid, text, uuid, text\\)',
    fn_ca_operator_staff: '\\(\\)',
  };
  for (const [fn, args] of Object.entries(signatures)) {
    assert.match(
      reverifyCode,
      new RegExp(`revoke all on function public\\.${fn}\\s*${args}[\\s\\S]{0,40}?from public, anon, authenticated;`),
      `${fn} has no REVOKE in the reverify migration`
    );
    assert.match(
      reverifyCode,
      new RegExp(`grant execute on function public\\.${fn}\\s*${args}[\\s\\S]{0,40}?to service_role;`),
      `${fn} has no GRANT EXECUTE TO service_role in the reverify migration`
    );
  }
  const grants = reverifyCode.match(/grant execute on function[\s\S]*?to ([a-z_, ]+);/g) || [];
  assert.equal(grants.length, REVERIFY_FUNCTIONS.length);
  for (const g of grants) assert.match(g, /to service_role;$/);
});

test('the reverify migration proves each fix in a subtransaction it rolls back', () => {
  const block = reverifyAssertBlock();
  assert.match(block, /ROLLBACK_PROBE/);
  assert.match(block, /if sqlerrm <> 'ROLLBACK_PROBE' then\s*\n\s*raise;/);
  for (const [finding, needle] of [
    ['L-3', 'ASSERT FAILED (L-3)'],
    ['M-2', 'ASSERT FAILED (M-2)'],
    ['L-12', 'ASSERT FAILED (L-12)'],
    ['N-4', 'ASSERT FAILED (N-4)'],
  ]) {
    assert.ok(block.includes(needle), `the assertion block never checks ${finding}`);
  }
  // The exact things each probe has to see.
  assert.match(block, /operator_not_found/);
  assert.match(block, /legacy_role_not_grantable/);
  assert.match(block, /fn_ca_operator_has_second_approver\(c_checker, 'money\.write'\)/);
  assert.match(block, /fn_ca_operator_has_second_approver\(c_checker, 'admin\.manage'\)/);
  assert.match(block, /fn_ca_operator_decide_approval\(v_id, 'reject', c_checker/);
  assert.match(block, /fn_ca_operator_decide_approval\(v_id, 'approve', c_checker/);
  assert.match(block, /'self_approval_refused'/);
  assert.match(block, /jsonb_typeof\(v_row -> 'mfa_enabled'\) <> 'boolean'/);
  // Rolled back means rolled back: policy, grants, approvals re-read.
  assert.match(block, /the probe changed the policy row and it was not rolled back/);
  assert.match(block, /the probe changed the active grant count and it was not rolled back/);
  assert.match(block, /probe approval row\(s\) survived the rollback/);
  assert.match(block, /probe grant row\(s\) survived the rollback/);
  const raises = block.match(/raise exception/g) || [];
  assert.ok(raises.length >= 18, `only ${raises.length} assertions in the reverify migration`);
  // Synthetic actors only, in the reserved block, and never a write to
  // profiles. The synthetic checker gets its grant by a direct insert
  // because fn_ca_operator_grant now refuses a uuid with no profile.
  const uuids = block.match(/'[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}'/gi) || [];
  assert.ok(uuids.length > 0);
  for (const u of uuids) {
    assert.match(u, /^'00000000-0000-4000-8000-0000000000[0-9a-f]{2}'$/, `uuid outside the reserved block: ${u}`);
  }
  assert.match(block, /insert into public\.ca_operator_grants \(user_id, role_key, granted_by, reason\)\s*\n\s*values \(c_checker, 'finance'/);
});

test('the reverify header explains each finding, section 0, and carries a ROLLBACK', () => {
  const header = reverify.slice(0, reverify.indexOf('set local lock_timeout'));
  assert.match(header, /WHAT THIS IS/);
  assert.match(header, /HOW THESE WERE FOUND/);
  assert.match(header, /reverify-2026-09-03\/server-db\.md/);
  for (const finding of ['M-2', 'L-3', 'L-12', 'N-4']) {
    assert.ok(header.includes(finding), `the header never explains finding ${finding}`);
  }
  assert.match(header, /WHAT THIS FILE DELIBERATELY DOES NOT FIX/);
  assert.match(header, /CONTRACT SECTION 0/);
  assert.match(header, /Tier 2/);
  assert.match(header, /PHASE2-SIM\.sql/, 'the header must warn that the sims grant to a uuid with no profile');
  assert.match(reverify, /^-- ROLLBACK$/m);
  const section = reverify.slice(reverify.indexOf('-- ROLLBACK'));
  for (const fn of REVERIFY_FUNCTIONS) assert.ok(section.includes(fn), `the ROLLBACK section never names ${fn}`);
  assert.match(section, /20260903120000/);
  assert.match(section, /20260903121500/);
  assert.match(section, /20260903140000/);
});

test('the reverify migration is ascii and free of em dashes', () => {
  const bad = [...reverify].filter((ch) => ch.codePointAt(0) > 126);
  assert.deepEqual([...new Set(bad)], []);
  assert.ok(!reverify.includes('\u2014'));
});

test('the contract records the re-verification correction', () => {
  assert.match(contract, /Post-build correction, re-verification 2026-09-03/);
  assert.match(contract, /20260903202500_ca_operator_reverify_fixes\.sql/);
  for (const needle of [
    'operator.withdraw_approval',
    'operator_not_found',
    'legacy_role_not_grantable',
    'fn_ca_operator_has_second_approver',
    'p_idempotency_key',
    'mfa_enabled',
  ]) {
    assert.ok(contract.includes(needle), `the contract correction never mentions ${needle}`);
  }
});
