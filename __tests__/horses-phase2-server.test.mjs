/**
 * Phase 2 server layer: access control, maker-checker and audit.
 *
 * Behaviour tests with fake I/O, in the shape the Phase 1 suites established:
 * the real modules run, every database call goes to a fake query builder that
 * RECORDS and APPLIES the filters and ranges it is handed, and nothing here
 * touches Supabase, Sentry or the network.
 *
 * What is asserted, and why each one matters:
 *
 *   - PHASE2-CONTRACTS.md SECTION 0 is the headline. A missing Phase 2
 *     migration must not lock the three production operators out, so the
 *     permission RPC failing falls back to the legacy set, and a missing policy
 *     table reads as approvals-off. Both are tested from the failure side.
 *   - Approval maths (off, under, at/over, unknown amount) is pure and tested
 *     as such, because "under the threshold" is the sentence that decides
 *     whether money moves without a second operator.
 *   - The 202 path is tested for what it does NOT do: no money RPC is called.
 *   - operator-admin is tested per action against real role permission sets, so
 *     "support cannot grant a role" is a behaviour and not a comment.
 *
 * Plus contract tests read the route files as text, because the ORDER of
 * requireApproval / RPC / markApprovalExecuted is a property of the source that
 * no unit test can see once the functions are stubbed.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(HERE, '..');
const ROUTE_DIR = path.join(ROOT, 'pages', 'api', 'horses');

import {
  PERMISSIONS,
  ALL_PERMISSIONS,
  LEGACY_ADMIN_ROLES,
  NAMED_OPERATOR_ROLES,
  OPERATOR_ROLE_KEYS,
  ROLE_PERMISSIONS,
  ROLE_META,
  permissionsForRole,
  permissionsForRoles,
  mergePermissions,
  orderPermissions,
  permissionMatrix,
  hasPermission,
  isOperatorRole,
  isKnownRole,
  isLegacyRole,
  legacyPermissionsForProfileRole,
} from '../src/lib/horses/permissions.js';
import {
  requireOperator,
  resolveOperatorPermissions,
  loadOperatorPolicy,
  normalizeOperatorPolicy,
  invalidateOperatorPolicyCache,
  DEFAULT_OPERATOR_POLICY,
  _resetOperatorCachesForTests,
} from '../src/lib/horses/operatorAuth.js';
import {
  APPROVAL_KINDS,
  KIND_PERMISSION,
  requiresApproval,
  thresholdFor,
  requireApproval,
  markApprovalExecuted,
  approvalPendingBody,
  approvalPendingResponse,
  canDecideApproval,
  canWithdrawApproval,
  cashoutAuthPath,
  isApprovalKind,
  isExecutableKind,
  payloadFor,
} from '../src/lib/horses/approvals.js';

const source = (file) => fs.readFileSync(file, 'utf8');

// ---------------------------------------------------------------- fake I/O

/** Silence one expected console line so a passing run stays readable. */
async function quiet(fn) {
  const warn = console.warn;
  const error = console.error;
  const seen = [];
  console.warn = (...a) => seen.push(a.join(' '));
  console.error = (...a) => seen.push(a.join(' '));
  try {
    return { value: await fn(), logged: seen };
  } finally {
    console.warn = warn;
    console.error = error;
  }
}

function matchesFilter(row, [op, col, val]) {
  switch (op) {
    case 'eq':
      return row[col] === val;
    case 'neq':
      return row[col] !== val;
    case 'gte':
      return row[col] >= val;
    case 'lte':
      return row[col] <= val;
    case 'in':
      return Array.isArray(val) && val.includes(row[col]);
    case 'like': {
      const pattern = String(val)
        .replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
        .replace(/%/g, '.*')
        .replace(/_/g, '.');
      return new RegExp(`^${pattern}$`).test(String(row[col] ?? ''));
    }
    default:
      return true;
  }
}

function projectRow(row, select) {
  if (!select || typeof select !== 'string' || select.includes('*') || select.includes('(')) return row;
  const cols = select
    .split(',')
    .map((c) => c.trim())
    .filter(Boolean);
  if (!cols.length) return row;
  const out = {};
  for (const col of cols) if (Object.prototype.hasOwnProperty.call(row, col)) out[col] = row[col];
  return out;
}

/**
 * A query builder that records every filter and range and then APPLIES them, so
 * a test can assert both "the route asked for target_id = x" and "the route got
 * back only the rows where that is true".
 */
function fakeDb(tables = {}, rpcs = {}) {
  const calls = [];
  function chainFor(table) {
    const script = tables[table] || { rows: [] };
    const record = { table, filters: [], range: null, select: null, countMode: null };
    calls.push(record);

    const result = () => {
      if (script.error) return { data: null, count: null, error: script.error };
      const seeded = typeof script.rows === 'function' ? script.rows(record) : script.rows || [];
      let out = seeded.filter((r) => record.filters.every((f) => matchesFilter(r, f)));
      const filteredTotal = out.length;
      if (record.range) out = out.slice(record.range[0], record.range[1] + 1);
      const count = record.countMode
        ? typeof script.count === 'number'
          ? script.count
          : filteredTotal
        : null;
      return { data: out.map((r) => projectRow(r, record.select)), count, error: null };
    };

    const push = (...f) => {
      record.filters.push(f);
      return chain;
    };

    const chain = {
      select(cols, opts) {
        record.select = cols;
        record.countMode = opts?.count || null;
        return chain;
      },
      eq: (c, v) => push('eq', c, v),
      neq: (c, v) => push('neq', c, v),
      gte: (c, v) => push('gte', c, v),
      lte: (c, v) => push('lte', c, v),
      in: (c, v) => push('in', c, v),
      is: (c, v) => push('is', c, v),
      not: (c, o, v) => push('not', c, o, v),
      or: (expr) => push('or', expr),
      like: (c, expr) => push('like', c, expr),
      order: (c, opts) => push('order', c, opts),
      limit: (n) => push('limit', n),
      update(row) {
        record.update = row;
        return chain;
      },
      insert(rows) {
        record.insert = rows;
        return chain;
      },
      range(from, to) {
        record.range = [from, to];
        return chain;
      },
      async maybeSingle() {
        const r = result();
        return { data: (r.data || [])[0] ?? null, error: r.error };
      },
      then(resolve, reject) {
        return Promise.resolve(result()).then(resolve, reject);
      },
    };
    return chain;
  }
  return {
    calls,
    from: chainFor,
    rpcCalls: () => calls.filter((c) => c.rpc),
    rpcNames: () => calls.filter((c) => c.rpc).map((c) => c.rpc),
    async rpc(name, args) {
      calls.push({ rpc: name, args });
      const scripted = rpcs[name];
      if (typeof scripted === 'function') return scripted(args);
      if (scripted) return scripted;
      // AN UNSCRIPTED RPC IS A HOLE IN THE TEST, NOT A QUIET SUCCESS.
      // This used to answer { data: null, error: null }, which satisfied every
      // `if (data && data.ok === false) throw ...` branch in every route
      // vacuously: grant, revoke and decide all have one and none of them was
      // ever exercised against a refusal.
      throw new Error(`unscripted RPC: ${name}`);
    },
  };
}

function fakeRes() {
  return {
    statusCode: null,
    body: null,
    headers: {},
    headersSent: false,
    writableEnded: false,
    setHeader(k, v) {
      this.headers[k.toLowerCase()] = v;
    },
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.body = payload;
      this.headersSent = true;
      this.writableEnded = true;
      return this;
    },
  };
}

const fakeReq = (extra = {}) => ({
  method: 'POST',
  headers: { 'user-agent': 'node-test', 'x-real-ip': '10.0.0.1' },
  socket: { remoteAddress: '127.0.0.1' },
  ...extra,
});

const OPERATOR_ID = '11111111-1111-1111-1111-111111111111';
const OTHER_ID = '22222222-2222-2222-2222-222222222222';
const APPROVAL_ID = '33333333-3333-3333-3333-333333333333';
const CLUB_ID = '44444444-4444-4444-4444-444444444444';

const policyOf = (over = {}) => ({ ...DEFAULT_OPERATOR_POLICY, loaded: true, source: 'row', ...over });

function opFor(db, { role = 'admin', permissions, policy, id = OPERATOR_ID } = {}) {
  return {
    db,
    user: { id, email: 'op@example.com' },
    role,
    roles: [role],
    grantedRoles: [],
    permissions: permissions || permissionsForRole(role),
    policy: policy || { ...DEFAULT_OPERATOR_POLICY },
    requestId: 'req-phase2',
  };
}

const logRpc = { fn_log_admin_action: async () => ({ data: true, error: null }) };

/**
 * A ca_operator_approvals row and the three RPCs that write it, each APPLYING
 * what it is handed rather than nodding at it: `decide` flips the row and
 * refuses a second decision, `mark_executed` refuses a row that was never
 * approved and merges the result, and every read in the same test sees what
 * those writes did. Without that, "an approved mint executes" is a test of the
 * script rather than of the route.
 */
function approvalWorld(seed = {}) {
  const row = { ...APPROVAL_ROW, ...seed };
  const rpcs = {
    ...logRpc,
    fn_ca_operator_has_second_approver: async () => ({ data: false, error: null }),
    fn_ca_operator_decide_approval: async (args) => {
      if (args.p_approval_id !== row.id) {
        return { data: { ok: false, error: 'approval_not_found' }, error: null };
      }
      if (row.status !== 'pending') {
        return { data: { ok: false, error: 'already_decided', status: row.status }, error: null };
      }
      row.status = args.p_decision === 'approve' ? 'approved' : 'rejected';
      row.decided_by = args.p_decided_by;
      row.decided_at = '2026-09-03T00:00:00Z';
      return { data: { ok: true, status: row.status, approval_id: row.id }, error: null };
    },
    fn_ca_operator_mark_executed: async (args) => {
      if (args.p_approval_id !== row.id) {
        return { data: { ok: false, error: 'approval_not_found' }, error: null };
      }
      if (!['approved', 'auto_approved', 'failed'].includes(row.status)) {
        return { data: { ok: false, error: 'not_approved', status: row.status }, error: null };
      }
      row.status = args.p_status;
      row.result = { ...(row.result || {}), ...(args.p_result || {}) };
      if (args.p_status === 'executed') row.executed_at = '2026-09-03T00:01:00Z';
      return { data: { ok: true, status: args.p_status }, error: null };
    },
  };
  const db = (extra = {}) =>
    fakeDb(
      {
        ca_operator_approvals: { rows: () => [row] },
        ca_operator_policy: { rows: [{ id: true }] },
        profiles: { rows: [] },
      },
      { ...rpcs, ...extra }
    );
  return { row, rpcs, db };
}

/** The payload /api/horses/mint stores on a chips issuance to a club. */
const MINT_PAYLOAD = Object.freeze({
  action: 'mint',
  asset: 'chips',
  target: 'club',
  targetId: CLUB_ID,
  amount: 5000,
  reason: 'Seeding the new club treasury for launch',
  opId: 'op-mint-1',
});

// ---------------------------------------------------------------- permissions

test('phase 2 adds the named roles and admin.manage without narrowing the legacy three', () => {
  assert.ok(ALL_PERMISSIONS.includes(PERMISSIONS.ADMIN_MANAGE));
  for (const role of LEGACY_ADMIN_ROLES) {
    assert.deepEqual(permissionsForRole(role), ALL_PERMISSIONS, `${role} must keep the full superset`);
    assert.ok(isOperatorRole(role));
    assert.ok(isLegacyRole(role));
  }
  for (const role of NAMED_OPERATOR_ROLES) {
    assert.ok(isKnownRole(role), `${role} must be a known role`);
    // ...and must NOT reach the console just by appearing in profiles.role.
    // profiles.role is free text this feature does not own: `owner` is a value
    // any future club or venue work is likely to write, and on the day it
    // appeared that account would have held the whole owner set, admin.manage
    // included. A named role reaches the console through a GRANT.
    assert.equal(isOperatorRole(role), false, `${role} must not be a console entry role`);
    assert.ok(ROLE_PERMISSIONS[role].length > 0, `${role} must hold something`);
    assert.ok(ROLE_META[role], `${role} must have a label for the matrix`);
    assert.ok(
      permissionsForRole(role).includes(PERMISSIONS.CONSOLE_READ),
      `${role} must reach the console floor`
    );
  }
  assert.deepEqual(OPERATOR_ROLE_KEYS, [...NAMED_OPERATOR_ROLES, ...LEGACY_ADMIN_ROLES]);
});

test('admin.manage is held by owner and the legacy roles and by nobody else', () => {
  const holders = OPERATOR_ROLE_KEYS.filter((r) =>
    permissionsForRole(r).includes(PERMISSIONS.ADMIN_MANAGE)
  );
  assert.deepEqual(holders.sort(), ['admin', 'god', 'owner', 'superadmin']);
  for (const role of ['operations', 'finance', 'compliance', 'support', 'read_only']) {
    assert.equal(hasPermission(permissionsForRole(role), PERMISSIONS.ADMIN_MANAGE), false);
  }
});

/**
 * WHO GETS THROUGH THE DOOR (review M-6).
 *
 * A legacy profile role opens it. A Phase 2 role NAME sitting in profiles.role
 * does not, because that column is free text this feature does not own. An
 * active grant does, because somebody filed it with a reason.
 */
test('console entry: legacy role or a grant, never a Phase 2 name in profiles.role', async () => {
  const verifier = async () => ({ user: { id: OPERATOR_ID, email: 'op@example.com' }, error: null });
  const authed = () =>
    fakeReq({ method: 'GET', headers: { authorization: `Bearer ${'x'.repeat(40)}`, 'user-agent': 'node-test' } });
  const world = (role, rpcPayload) =>
    fakeDb(
      {
        profiles: { rows: [{ id: OPERATOR_ID, role, username: 'op', display_name: 'Op' }] },
        ca_operator_policy: { rows: [{ id: true }] },
      },
      { fn_ca_operator_permissions: async () => ({ data: rpcPayload, error: null }) }
    );

  _resetOperatorCachesForTests();
  const legacyDb = world('admin', { role: 'admin', roles: ['admin'], permissions: [], source: 'legacy' });
  const legacy = await requireOperator(authed(), fakeRes(), {
    permission: PERMISSIONS.MONEY_WRITE,
    deps: { getServerUserWithFallback: verifier, getDb: async () => legacyDb },
  });
  assert.ok(legacy, 'a legacy admin must still reach the console');
  assert.ok(hasPermission(legacy.permissions, PERMISSIONS.ADMIN_MANAGE));

  // profiles.role = 'owner' is a string in a column, not an operator grant.
  _resetOperatorCachesForTests();
  const namedRes = fakeRes();
  const namedDb = world('owner', { role: 'owner', roles: [], permissions: [], source: 'legacy' });
  assert.equal(
    await requireOperator(authed(), namedRes, {
      permission: PERMISSIONS.CONSOLE_READ,
      deps: { getServerUserWithFallback: verifier, getDb: async () => namedDb },
    }),
    null
  );
  assert.equal(namedRes.statusCode, 403);
  assert.equal(namedRes.body.code, 'forbidden');

  // The same account WITH a finance grant gets in, holding the finance set.
  _resetOperatorCachesForTests();
  const grantedDb = world('user', {
    role: 'user',
    roles: ['finance'],
    permissions: permissionsForRole('finance'),
    source: 'granted',
  });
  const granted = await requireOperator(authed(), fakeRes(), {
    permission: PERMISSIONS.MONEY_WRITE,
    deps: { getServerUserWithFallback: verifier, getDb: async () => grantedDb },
  });
  assert.ok(granted, 'an active grant is what reaches the console');
  assert.deepEqual(granted.grantedRoles, ['finance']);
  assert.equal(hasPermission(granted.permissions, PERMISSIONS.ADMIN_MANAGE), false);
  _resetOperatorCachesForTests();
});

test('the narrow roles hold exactly the writes their job needs', () => {
  const finance = permissionsForRole('finance');
  assert.ok(hasPermission(finance, PERMISSIONS.MONEY_WRITE));
  assert.ok(hasPermission(finance, PERMISSIONS.CASHIER_WRITE));
  assert.equal(hasPermission(finance, PERMISSIONS.MODERATION_WRITE), false);
  assert.equal(hasPermission(finance, PERMISSIONS.SQL_EXECUTE), false);

  const support = permissionsForRole('support');
  assert.ok(hasPermission(support, PERMISSIONS.SUPPORT_WRITE));
  assert.equal(hasPermission(support, PERMISSIONS.MONEY_WRITE), false);
  assert.equal(hasPermission(support, PERMISSIONS.CASHIER_WRITE), false);

  const readOnly = permissionsForRole('read_only');
  for (const p of readOnly) assert.ok(p.endsWith('.read'), `read_only must not hold ${p}`);

  const compliance = permissionsForRole('compliance');
  assert.ok(hasPermission(compliance, PERMISSIONS.GDPR_ERASE));
  assert.equal(hasPermission(compliance, PERMISSIONS.MONEY_WRITE), false);
});

test('role permissions union in canonical order and never drop an unknown grant', () => {
  const union = permissionsForRoles(['support', 'finance']);
  for (const p of [...permissionsForRole('support'), ...permissionsForRole('finance')]) {
    assert.ok(union.includes(p));
  }
  assert.equal(new Set(union).size, union.length, 'the union must be de-duplicated');
  // Canonical order, so two operators with the same set compare equal.
  assert.deepEqual(union, orderPermissions([...union].reverse()));
  // A permission the database knows and this file does not is KEPT: dropping it
  // would be a silent narrowing.
  const merged = mergePermissions(['console.read'], ['brand.new_permission']);
  assert.ok(merged.includes('brand.new_permission'));
  assert.equal(merged[0], 'console.read', 'known permissions come first, in canonical order');
  assert.deepEqual(Object.keys(permissionMatrix()), OPERATOR_ROLE_KEYS);
});

// ------------------------------------------------- permission resolution

const permissionRpc = (payload) => ({
  fn_ca_operator_permissions: async () => ({ data: payload, error: null }),
});

test('resolveOperatorPermissions: legacy stays a superset while enforcement is off', async () => {
  _resetOperatorCachesForTests();
  const db = fakeDb(
    { ca_operator_policy: { rows: [{ id: true, enforce_named_roles: false }] } },
    permissionRpc({ role: 'admin', roles: ['admin', 'read_only'], permissions: ['console.read'], source: 'both' })
  );
  const resolved = await resolveOperatorPermissions(db, OPERATOR_ID, 'admin');
  assert.deepEqual(resolved.permissions, ALL_PERMISSIONS, 'a narrow grant must not shrink a legacy admin');
  assert.equal(resolved.enforced, false);
  assert.equal(resolved.degraded, false);
  assert.deepEqual(resolved.grantedRoles, ['read_only']);
  assert.deepEqual(resolved.roles, ['admin', 'read_only']);
});

test('resolveOperatorPermissions: a grant applies, and a named key in profiles.role contributes nothing', async () => {
  _resetOperatorCachesForTests();
  const db = fakeDb(
    { ca_operator_policy: { rows: [{ id: true, enforce_named_roles: false }] } },
    permissionRpc({
      role: 'support',
      roles: ['finance'],
      permissions: permissionsForRole('finance'),
      source: 'granted',
    })
  );
  const resolved = await resolveOperatorPermissions(db, OPERATOR_ID, 'support');
  assert.ok(hasPermission(resolved.permissions, PERMISSIONS.MONEY_WRITE), 'the finance grant must apply');
  // The string 'support' in profiles.role is not a grant (re-verification
  // H-1): the JS seeds nothing from it, exactly as fn_ca_operator_permissions
  // seeds nothing from a role that is not is_legacy.
  assert.equal(hasPermission(resolved.permissions, PERMISSIONS.SUPPORT_WRITE), false);
  assert.deepEqual(resolved.permissions, orderPermissions(permissionsForRole('finance')));
  assert.equal(hasPermission(resolved.permissions, PERMISSIONS.ADMIN_MANAGE), false);
  assert.deepEqual(resolved.grantedRoles, ['finance']);
});

/**
 * H-1 (re-verification). `profiles.role` is free text this feature does not
 * own; `owner` is a value any future club or venue work is likely to write.
 * The JS resolver used to seed its legacy set from the full matrix, so
 * 'owner' + a read_only grant resolved to every permission in JS while SQL
 * resolved read_only's six - and every route check reads the JS set. The
 * legacy seed is now the legacy three and nothing else.
 */
test('resolveOperatorPermissions: profiles.role owner plus a read_only grant is exactly read_only', async () => {
  _resetOperatorCachesForTests();
  const narrow = permissionsForRole('read_only');
  const db = fakeDb(
    { ca_operator_policy: { rows: [{ id: true, enforce_named_roles: false }] } },
    permissionRpc({ role: 'owner', roles: ['read_only'], permissions: narrow, source: 'granted' })
  );
  const resolved = await resolveOperatorPermissions(db, OPERATOR_ID, 'owner');
  assert.deepEqual(resolved.permissions, orderPermissions(narrow));
  assert.equal(hasPermission(resolved.permissions, PERMISSIONS.ADMIN_MANAGE), false);
  assert.equal(hasPermission(resolved.permissions, PERMISSIONS.SQL_EXECUTE), false);
  assert.equal(hasPermission(resolved.permissions, PERMISSIONS.MONEY_WRITE), false);
  assert.equal(resolved.enforced, false, 'this is not enforcement narrowing anything: it is a seed that was never there');

  // profiles.role 'finance' + a support grant: no money.write, no cashier.write.
  _resetOperatorCachesForTests();
  const support = permissionsForRole('support');
  const db2 = fakeDb(
    { ca_operator_policy: { rows: [{ id: true, enforce_named_roles: false }] } },
    permissionRpc({ role: 'finance', roles: ['support'], permissions: support, source: 'granted' })
  );
  const resolved2 = await resolveOperatorPermissions(db2, OPERATOR_ID, 'finance');
  assert.equal(hasPermission(resolved2.permissions, PERMISSIONS.MONEY_WRITE), false);
  assert.equal(hasPermission(resolved2.permissions, PERMISSIONS.CASHIER_WRITE), false);
  assert.deepEqual(resolved2.permissions, orderPermissions(support));

  // And the pure helper says the same for every named key, and the legacy
  // set for the legacy three.
  for (const role of NAMED_OPERATOR_ROLES) assert.deepEqual(legacyPermissionsForProfileRole(role), []);
  for (const role of LEGACY_ADMIN_ROLES) assert.deepEqual(legacyPermissionsForProfileRole(role), ALL_PERMISSIONS);
  assert.deepEqual(legacyPermissionsForProfileRole('player'), []);
  assert.deepEqual(legacyPermissionsForProfileRole(null), []);
  _resetOperatorCachesForTests();
});

/**
 * L-10 (re-verification). One failed RPC used to buy a full 30 seconds of the
 * un-narrowed legacy set per lambda, even after the RPC was back. A degraded
 * answer is cached for at most five seconds.
 */
test('resolveOperatorPermissions: a degraded answer is cached for five seconds, not thirty', async () => {
  _resetOperatorCachesForTests();
  let hits = 0;
  let broken = true;
  const db = fakeDb(
    { ca_operator_policy: { rows: [{ id: true, enforce_named_roles: true }] } },
    {
      fn_ca_operator_permissions: async () => {
        hits += 1;
        if (broken) return { data: null, error: { message: 'connection reset' } };
        return { data: { role: 'admin', roles: ['read_only'], permissions: permissionsForRole('read_only') }, error: null };
      },
    }
  );
  const t0 = 5_000_000;
  const { value: first } = await quiet(() => resolveOperatorPermissions(db, OPERATOR_ID, 'admin', { now: t0 }));
  assert.equal(first.degraded, true);
  assert.deepEqual(first.permissions, ALL_PERMISSIONS, 'the fail-open set while the RPC is down');
  assert.equal(hits, 1);

  // Inside five seconds the degraded answer is still served.
  const { value: soon } = await quiet(() => resolveOperatorPermissions(db, OPERATOR_ID, 'admin', { now: t0 + 4_000 }));
  assert.equal(soon.degraded, true);
  assert.equal(hits, 1, 'a degraded answer is still a cache entry, for five seconds');

  // The RPC is back. At six seconds the degraded answer must NOT be served.
  broken = false;
  const { value: after } = await quiet(() => resolveOperatorPermissions(db, OPERATOR_ID, 'admin', { now: t0 + 6_000 }));
  assert.equal(hits, 2, 'a degraded answer must not be served past five seconds');
  assert.equal(after.degraded, false);
  assert.equal(after.enforced, true);
  assert.equal(hasPermission(after.permissions, PERMISSIONS.MONEY_WRITE), false, 'the narrowing is felt as soon as the RPC answers');

  // A healthy answer keeps the full 30 seconds.
  await resolveOperatorPermissions(db, OPERATOR_ID, 'admin', { now: t0 + 6_000 + 29_000 });
  assert.equal(hits, 2);
  _resetOperatorCachesForTests();
});

test('resolveOperatorPermissions: enforce_named_roles is the only thing that narrows', async () => {
  _resetOperatorCachesForTests();
  const granted = permissionsForRole('read_only');
  const db = fakeDb(
    { ca_operator_policy: { rows: [{ id: true, enforce_named_roles: true }] } },
    permissionRpc({ role: 'support', roles: ['support', 'read_only'], permissions: granted, source: 'granted' })
  );
  const { value: resolved } = await quiet(() =>
    resolveOperatorPermissions(db, OPERATOR_ID, 'support')
  );
  assert.deepEqual(resolved.permissions, orderPermissions(granted));
  assert.equal(resolved.enforced, true);
  assert.equal(hasPermission(resolved.permissions, PERMISSIONS.MONEY_WRITE), false);
});

/**
 * THE FLOOR UNDER THE NARROWING (review H-4).
 *
 * Grant a god `read_only`, turn `enforce_named_roles` on, and the database
 * describes that account by the grant alone: 21 permissions down to 6, and the
 * one that goes is `admin.manage` - the only permission that can turn the flag
 * back off. Recovery from that is direct SQL. Whatever the database says, a
 * legacy profile role keeps admin.manage.
 */
test('resolveOperatorPermissions: a legacy account never loses admin.manage, whatever the database says', async () => {
  for (const role of LEGACY_ADMIN_ROLES) {
    _resetOperatorCachesForTests();
    const narrow = permissionsForRole('read_only');
    const db = fakeDb(
      { ca_operator_policy: { rows: [{ id: true, enforce_named_roles: true }] } },
      permissionRpc({ role, roles: [role, 'read_only'], permissions: narrow, source: 'granted' })
    );
    const { value: resolved, logged } = await quiet(() =>
      resolveOperatorPermissions(db, OPERATOR_ID, role)
    );
    assert.equal(resolved.enforced, true, 'enforcement still applies to everything else');
    assert.ok(
      hasPermission(resolved.permissions, PERMISSIONS.ADMIN_MANAGE),
      `a ${role} account must keep the permission that undoes this`
    );
    // The narrowing is real everywhere else: this is a floor, not an escape.
    assert.equal(hasPermission(resolved.permissions, PERMISSIONS.MONEY_WRITE), false);
    assert.ok(
      logged.some((line) => /restoring it so the policy panel cannot lock/.test(line)),
      'the floor must say out loud that it fired'
    );
  }
  // A named role holder is NOT given the floor: they never had it to lose.
  _resetOperatorCachesForTests();
  const db = fakeDb(
    { ca_operator_policy: { rows: [{ id: true, enforce_named_roles: true }] } },
    permissionRpc({
      role: 'support',
      roles: ['finance'],
      permissions: permissionsForRole('finance'),
      source: 'granted',
    })
  );
  const resolved = await resolveOperatorPermissions(db, OPERATOR_ID, 'support');
  assert.equal(hasPermission(resolved.permissions, PERMISSIONS.ADMIN_MANAGE), false);
  _resetOperatorCachesForTests();
});

test('resolveOperatorPermissions: enforcement needs a policy row that actually loaded', async () => {
  _resetOperatorCachesForTests();
  // The table is missing, so `loaded` is false. Even a stray true in a cached
  // default must not be able to narrow anybody.
  const db = fakeDb(
    { ca_operator_policy: { error: { message: 'relation "ca_operator_policy" does not exist' } } },
    permissionRpc({ role: 'admin', roles: ['admin'], permissions: ['console.read'], source: 'legacy' })
  );
  const { value: resolved } = await quiet(() => resolveOperatorPermissions(db, OPERATOR_ID, 'admin'));
  assert.deepEqual(resolved.permissions, ALL_PERMISSIONS);
  assert.equal(resolved.enforced, false);
});

test('resolveOperatorPermissions: an unavailable RPC falls back to the legacy set and logs', async () => {
  for (const rpcs of [
    { fn_ca_operator_permissions: async () => ({ data: null, error: { message: 'function does not exist' } }) },
    { fn_ca_operator_permissions: async () => ({ data: null, error: null }) },
    {
      fn_ca_operator_permissions: async () => {
        throw new Error('connection reset');
      },
    },
  ]) {
    _resetOperatorCachesForTests();
    const db = fakeDb({ ca_operator_policy: { rows: [{ id: true }] } }, rpcs);
    const { value: resolved, logged } = await quiet(() =>
      resolveOperatorPermissions(db, OPERATOR_ID, 'admin')
    );
    assert.deepEqual(resolved.permissions, ALL_PERMISSIONS, 'a missing migration must not lock anyone out');
    assert.equal(resolved.degraded, true);
    assert.equal(resolved.source, 'legacy');
    assert.ok(
      logged.some((line) => /fn_ca_operator_permissions unavailable/.test(line)),
      'the fallback must be loud in the server log'
    );
  }
});

test('resolveOperatorPermissions caches for 30 seconds, per user and per profile role', async () => {
  _resetOperatorCachesForTests();
  let hits = 0;
  const db = fakeDb(
    { ca_operator_policy: { rows: [{ id: true }] } },
    {
      fn_ca_operator_permissions: async () => {
        hits += 1;
        return { data: { role: 'admin', roles: ['admin'], permissions: ['console.read'] }, error: null };
      },
    }
  );
  const t0 = 1_000_000;
  await resolveOperatorPermissions(db, OPERATOR_ID, 'admin', { now: t0 });
  await resolveOperatorPermissions(db, OPERATOR_ID, 'admin', { now: t0 + 29_000 });
  assert.equal(hits, 1, 'a second call inside the window must not re-ask');
  await resolveOperatorPermissions(db, OPERATOR_ID, 'admin', { now: t0 + 31_000 });
  assert.equal(hits, 2, 'the cache must expire at 30 seconds');
  // A different user is a different cache entry.
  await resolveOperatorPermissions(db, OTHER_ID, 'admin', { now: t0 + 31_000 });
  assert.equal(hits, 3);
  // And so is the same user with a changed profile role, which is how a
  // demotion is felt without waiting out the window.
  await resolveOperatorPermissions(db, OPERATOR_ID, 'support', { now: t0 + 31_000 });
  assert.equal(hits, 4);
  _resetOperatorCachesForTests();
});

// ---------------------------------------------------------------- policy

test('loadOperatorPolicy: default-safe when the table is absent, and never throws', async () => {
  _resetOperatorCachesForTests();
  const missing = fakeDb({ ca_operator_policy: { error: { message: 'relation does not exist' } } });
  const { value: policy } = await quiet(() => loadOperatorPolicy(missing));
  assert.equal(policy.approvalsEnabled, false, 'approvals must default OFF');
  assert.equal(policy.enforceNamedRoles, false, 'enforcement must default OFF');
  assert.equal(policy.allowSelfApproveWhenAlone, true, 'the alone-rule must default ON');
  assert.equal(policy.loaded, false);
  assert.equal(policy.approvalTtlMinutes, 1440);

  _resetOperatorCachesForTests();
  const threw = {
    from() {
      throw new Error('client is not configured');
    },
  };
  const { value: fallback } = await quiet(() => loadOperatorPolicy(threw));
  assert.equal(fallback.approvalsEnabled, false);
  assert.equal(fallback.loaded, false);
  _resetOperatorCachesForTests();
});

test('loadOperatorPolicy: reads the row, caches it 30s, and invalidates on demand', async () => {
  _resetOperatorCachesForTests();
  const db = fakeDb({
    ca_operator_policy: {
      rows: [
        {
          id: true,
          approvals_enabled: true,
          allow_self_approve_when_alone: false,
          enforce_named_roles: true,
          mint_threshold: '250.50',
          fund_threshold: 1000,
          cashout_threshold: 500,
          approval_ttl_minutes: 60,
        },
      ],
    },
  });
  const t0 = 5_000_000;
  const first = await loadOperatorPolicy(db, { now: t0 });
  assert.equal(first.approvalsEnabled, true);
  assert.equal(first.allowSelfApproveWhenAlone, false);
  assert.equal(first.enforceNamedRoles, true);
  assert.equal(first.mintThreshold, 250.5);
  assert.equal(first.approvalTtlMinutes, 60);
  assert.equal(first.loaded, true);

  const reads = () => db.calls.filter((c) => c.table === 'ca_operator_policy').length;
  const before = reads();
  await loadOperatorPolicy(db, { now: t0 + 29_000 });
  assert.equal(reads(), before, 'inside the window the row is not re-read');
  await loadOperatorPolicy(db, { now: t0 + 31_000 });
  assert.equal(reads(), before + 1, 'the cache expires at 30 seconds');
  await loadOperatorPolicy(db, { now: t0 + 31_000, force: true });
  assert.equal(reads(), before + 2, 'force must bypass the cache');

  invalidateOperatorPolicyCache();
  await loadOperatorPolicy(db, { now: t0 + 31_000 });
  assert.equal(reads(), before + 3, 'invalidate must make the next read cold');
  _resetOperatorCachesForTests();
});

test('normalizeOperatorPolicy defaults every missing column the safe way', () => {
  const empty = normalizeOperatorPolicy({});
  assert.equal(empty.approvalsEnabled, false);
  assert.equal(empty.enforceNamedRoles, false);
  assert.equal(empty.allowSelfApproveWhenAlone, true);
  assert.equal(empty.mintThreshold, 0);
  assert.deepEqual(normalizeOperatorPolicy(null).approvalsEnabled, false);
  assert.equal(normalizeOperatorPolicy({ mint_threshold: 'not a number' }).mintThreshold, 0);
});

// ---------------------------------------------------------- approval maths

test('requiresApproval: off is off, whatever the amount', () => {
  const off = policyOf({ approvalsEnabled: false, mintThreshold: 0 });
  for (const amount of [0, 1, 1_000_000, null, undefined, 'nonsense']) {
    const d = requiresApproval(off, 'mint', amount);
    assert.equal(d.required, false, `amount ${amount} must not be gated while approvals are off`);
    assert.equal(d.reason, 'approvals_disabled');
  }
  // And a policy object that was never loaded at all behaves the same way.
  assert.equal(requiresApproval(undefined, 'mint', 999_999).required, false);
  assert.equal(requiresApproval({}, 'cashout', 999_999).required, false);
});

test('requiresApproval: under the threshold passes, at or over it is gated', () => {
  const on = policyOf({ approvalsEnabled: true, mintThreshold: 1000, cashoutThreshold: 250 });
  assert.equal(requiresApproval(on, 'mint', 999.99).required, false);
  assert.equal(requiresApproval(on, 'mint', 999.99).reason, 'under_threshold');
  assert.equal(requiresApproval(on, 'mint', 1000).required, true);
  assert.equal(requiresApproval(on, 'mint', 1000).reason, 'at_or_over_threshold');
  assert.equal(requiresApproval(on, 'mint', 1000.01).required, true);
  assert.equal(requiresApproval(on, 'burn', 1000).required, true, 'burn shares the mint threshold');
  assert.equal(requiresApproval(on, 'cashout', 249).required, false);
  assert.equal(requiresApproval(on, 'cashout', 250).required, true);
  assert.equal(thresholdFor(on, 'cashout'), 250);
  assert.equal(thresholdFor(on, 'fleet_policy'), null);
});

test('requiresApproval: a threshold of zero gates everything once approvals are on', () => {
  const on = policyOf({ approvalsEnabled: true, mintThreshold: 0 });
  assert.equal(requiresApproval(on, 'mint', 0.01).required, true);
  assert.equal(requiresApproval(on, 'mint', 0).required, true);
});

test('requiresApproval: a missing or unreadable amount is gated, not exempted', () => {
  const on = policyOf({ approvalsEnabled: true, mintThreshold: 1_000_000 });
  for (const amount of [null, undefined, '', 'abc', NaN]) {
    const d = requiresApproval(on, 'mint', amount);
    assert.equal(d.required, true, `amount ${String(amount)} must not slip under a threshold`);
    assert.equal(d.reason, 'amount_unknown');
  }
  // A kind with no money amount at all is always gated once approvals are on.
  assert.equal(requiresApproval(on, 'fleet_policy', null).reason, 'kind_always_requires_approval');
  assert.equal(requiresApproval(on, 'sanction', null).required, true);
});

test('the approval kind vocabulary matches the contract and maps to permissions', () => {
  assert.deepEqual([...APPROVAL_KINDS], ['mint', 'burn', 'fund_club', 'cashout', 'fleet_policy', 'sanction']);
  assert.equal(KIND_PERMISSION.mint, PERMISSIONS.MONEY_WRITE);
  assert.equal(KIND_PERMISSION.burn, PERMISSIONS.MONEY_WRITE);
  assert.equal(KIND_PERMISSION.fund_club, PERMISSIONS.MONEY_WRITE);
  assert.equal(KIND_PERMISSION.cashout, PERMISSIONS.CASHIER_WRITE);
  assert.equal(isApprovalKind('mint'), true);
  assert.equal(isApprovalKind('teleport'), false);
});

test('payloadFor: the executable kinds shape a real RPC call and the rest refuse to', () => {
  assert.equal(isExecutableKind('mint'), true);
  assert.equal(isExecutableKind('burn'), true);
  assert.equal(isExecutableKind('fund_club'), true);
  // cashout is decided here and carried out by the club-arena route; the other
  // two are not wired to anything yet. None of them may be assembled into a
  // money call from this console.
  for (const kind of ['cashout', 'fleet_policy', 'sanction', 'teleport']) {
    assert.equal(isExecutableKind(kind), false);
    assert.equal(payloadFor(kind), null, `${kind} must have no executor`);
  }

  const mint = payloadFor('mint')(
    { action: 'mint', asset: 'chips', target: 'club', targetId: CLUB_ID, amount: '250.50', reason: 'Launch float for the club' },
    'op-key-1'
  );
  assert.equal(mint.ok, true);
  assert.equal(mint.rpc, 'fn_ca_mint');
  assert.equal(mint.args.p_amount, 250.5, 'the amount is parsed from the string, so 250.50 survives');
  assert.equal(mint.args.p_destination, 'club');
  assert.equal(mint.args.p_op_id, 'op-key-1');

  // Dan's law, at the executor: chips never reach a person, diamonds never
  // reach a club, and diamonds are whole numbers.
  const toPerson = payloadFor('mint')(
    { asset: 'chips', target: 'player', targetId: CLUB_ID, amount: 10, reason: 'A reason long enough' },
    'op-key-2'
  );
  assert.equal(toPerson.ok, false);
  assert.equal(toPerson.reason, 'payload_target_invalid');
  const fractionalDiamonds = payloadFor('mint')(
    { asset: 'diamonds', target: 'player', targetId: CLUB_ID, amount: '1.50', reason: 'A reason long enough' },
    'op-key-3'
  );
  assert.equal(fractionalDiamonds.ok, false);
  assert.equal(fractionalDiamonds.reason, 'payload_amount_invalid');

  const fund = payloadFor('fund_club')(
    { clubId: CLUB_ID, amount: 100, reason: 'Topping up the club treasury', opId: 'op-key-4' },
    'op-key-4'
  );
  assert.equal(fund.ok, true);
  assert.equal(fund.rpc, 'fn_ca_fund_club');
  // Production's fn_ca_fund_club takes p_idempotency_key, not p_op_id
  // (re-verification, live-routes). The key is the row's op_id under the
  // parameter name that RPC actually has, and summary.opId is where a caller
  // reads it from without knowing which RPC it is.
  assert.deepEqual(fund.args, {
    p_club_id: CLUB_ID,
    p_amount: 100,
    p_reason: 'Topping up the club treasury',
    p_idempotency_key: 'op-key-4',
  });
  assert.equal(fund.summary.opId, 'op-key-4');
  assert.equal('p_op_id' in fund.args, false);
  assert.equal(mint.summary.opId, mint.args.p_op_id, 'summary.opId names the same key for every executable kind');

  // Every refusal carries an operator-facing sentence, not just a code.
  const missing = payloadFor('burn')(null, 'op-key-5');
  assert.equal(missing.ok, false);
  assert.match(missing.message, /^[A-Z]/);
});

// ------------------------------------------------------- requireApproval

const requestRpc = (payload) => ({
  fn_ca_operator_request_approval: async (args) => ({ data: { ...payload, _args: args }, error: null }),
});

test('requireApproval: with approvals off it still records the auto_approved row and proceeds', async () => {
  const db = fakeDb({}, requestRpc({ required: false, approval_id: APPROVAL_ID, status: 'auto_approved' }));
  const op = opFor(db, { policy: policyOf({ approvalsEnabled: false }) });
  const result = await requireApproval(op, fakeReq(), {
    kind: 'mint',
    amount: 5000,
    asset: 'chips',
    targetType: 'club',
    targetId: CLUB_ID,
    reason: 'Seeding the new club treasury',
    opId: 'op-1',
  });
  assert.equal(result.required, false);
  assert.equal(result.status, 'auto_approved');
  assert.equal(result.approvalId, APPROVAL_ID);
  assert.equal(result.recorded, true);
  assert.equal(result.policyReason, 'approvals_disabled');

  const call = db.calls.find((c) => c.rpc === 'fn_ca_operator_request_approval');
  assert.ok(call, 'the advisory row must still be written');
  assert.equal(call.args.p_op_id, 'op-1', 'the approval must carry the same idempotency key');
  assert.equal(call.args.p_kind, 'mint');
  assert.equal(call.args.p_amount, 5000);
  assert.equal(call.args.p_target_id, CLUB_ID);
  assert.equal(call.args.p_requested_by, OPERATOR_ID);
  assert.equal(call.args.p_request_id, 'req-phase2');
});

test('requireApproval: approvals on and over the threshold returns required with a pending id', async () => {
  const db = fakeDb({}, requestRpc({ required: true, approval_id: APPROVAL_ID, status: 'pending' }));
  const op = opFor(db, { policy: policyOf({ approvalsEnabled: true, mintThreshold: 100 }) });
  const result = await requireApproval(op, fakeReq(), { kind: 'mint', amount: 500, opId: 'op-2' });
  assert.equal(result.required, true);
  assert.equal(result.status, 'pending');
  assert.equal(result.approvalId, APPROVAL_ID);
  assert.equal(result.threshold, 100);
});

test('requireApproval: the alone-rule clears a gated move and says why', async () => {
  const db = fakeDb(
    {},
    requestRpc({
      required: false,
      approval_id: APPROVAL_ID,
      status: 'auto_approved',
      blocked_reason: 'no_second_approver',
    })
  );
  const op = opFor(db, { policy: policyOf({ approvalsEnabled: true, mintThreshold: 0 }) });
  const result = await requireApproval(op, fakeReq(), { kind: 'mint', amount: 500, opId: 'op-3' });
  assert.equal(result.required, false, 'a lone operator must still be able to move money');
  assert.equal(result.blockedReason, 'no_second_approver');
});

/**
 * H-2 (re-verification). This test used to assert the opposite: that a stale
 * local policy saying "off" could talk past a PENDING row the database had
 * just written. Dan turns approvals on from lambda A; lambda B holds "off"
 * for up to 30 seconds; an operator on B mints; the RPC writes `pending`, the
 * JS ANDed that away, fn_ca_mint ran, and the row sat in the queue for a
 * second operator to reject with the chips already gone. A pending row the
 * database wrote HOLDS. Section 0 is not breached: the RPC only ever answers
 * required:true when approvals_enabled is true IN THE DATABASE, which is
 * Dan's switch and not a failure mode.
 */
test('requireApproval: a pending row the database wrote holds, whatever the local policy cache says', async () => {
  const db = fakeDb({}, requestRpc({ required: true, approval_id: APPROVAL_ID, status: 'pending' }));
  const op = opFor(db, { policy: policyOf({ approvalsEnabled: false }) });
  const result = await requireApproval(op, fakeReq(), { kind: 'mint', amount: 500, opId: 'op-4' });
  assert.equal(result.required, true, 'a stale "off" must not mint past a pending row');
  assert.equal(result.status, 'pending');
  assert.equal(result.approvalId, APPROVAL_ID);
  assert.equal(result.policyReason, 'approvals_disabled', 'the local decision is still reported honestly');

  // The degraded policy (table read failed, RPC works) is the same window.
  const degraded = fakeDb({}, requestRpc({ required: true, approval_id: APPROVAL_ID, status: 'pending' }));
  const held = await requireApproval(
    opFor(degraded, { policy: { ...DEFAULT_OPERATOR_POLICY, degraded: true } }),
    fakeReq(),
    { kind: 'mint', amount: 500, opId: 'op-4b' }
  );
  assert.equal(held.required, true);
});

test('requireApproval: an RPC answer of required:true with status pending never yields required:false', async () => {
  const policies = [
    policyOf({ approvalsEnabled: false }),
    policyOf({ approvalsEnabled: true, mintThreshold: 1_000_000 }),
    policyOf({ approvalsEnabled: true, mintThreshold: 0 }),
    { ...DEFAULT_OPERATOR_POLICY },
    { ...DEFAULT_OPERATOR_POLICY, degraded: true },
    null,
  ];
  for (const policy of policies) {
    for (const kind of ['mint', 'burn', 'fund_club', 'cashout']) {
      const db = fakeDb({}, requestRpc({ required: true, approval_id: APPROVAL_ID, status: 'pending' }));
      const result = await requireApproval(opFor(db, { policy }), fakeReq(), {
        kind,
        amount: 5,
        opId: `op-hold-${kind}`,
      });
      assert.equal(result.required, true, `${kind} under ${JSON.stringify(policy)} must hold`);
      assert.equal(result.status, 'pending');
    }
  }

  // And the other half of the rule is unchanged: with the RPC UNAVAILABLE the
  // local policy is still the ceiling, because no row was written at all.
  const down = fakeDb({}, {
    fn_ca_operator_request_approval: async () => ({ data: null, error: { message: 'does not exist' } }),
  });
  const { value } = await quiet(() =>
    requireApproval(opFor(down, { policy: policyOf({ approvalsEnabled: false }) }), fakeReq(), {
      kind: 'mint',
      amount: 5,
      opId: 'op-down',
    })
  );
  assert.equal(value.required, false);
  assert.equal(value.recorded, false);
});

test('requireApproval: a failed ADVISORY row is logged and the money still moves', async () => {
  for (const rpcs of [
    { fn_ca_operator_request_approval: async () => ({ data: null, error: { message: 'does not exist' } }) },
    { fn_ca_operator_request_approval: async () => ({ data: null, error: null }) },
    {},
  ]) {
    const db = fakeDb({}, rpcs);
    const op = opFor(db, { policy: policyOf({ approvalsEnabled: false }) });
    const { value: result, logged } = await quiet(() =>
      requireApproval(op, fakeReq(), { kind: 'mint', amount: 10, opId: 'op-5' })
    );
    assert.equal(result.required, false, 'a missing approvals table must not block a mint');
    assert.equal(result.recorded, false);
    assert.equal(result.status, 'unrecorded');
    assert.ok(logged.some((l) => /advisory mint row not recorded/.test(l)));
  }
});

test('requireApproval: a failed REQUIRED approval refuses with 503 and moves nothing', async () => {
  const db = fakeDb({}, {
    fn_ca_operator_request_approval: async () => ({ data: null, error: { message: 'deadlock detected' } }),
  });
  const op = opFor(db, { policy: policyOf({ approvalsEnabled: true, mintThreshold: 0 }) });
  await quiet(() =>
    assert.rejects(requireApproval(op, fakeReq(), { kind: 'mint', amount: 10, opId: 'op-6' }), (err) => {
      assert.equal(err.status, 503);
      assert.equal(err.code, 'approval_unavailable');
      assert.doesNotMatch(err.message, /deadlock/, 'no database text may reach the browser');
      return true;
    })
  );
});

/**
 * A REJECTED OR EXPIRED REPLAY IS A REFUSAL, NOT A PERMISSION (review B-2).
 *
 * `op_id` is unique, so a retry is answered with the row the key already names.
 * Only auto_approved, approved and executed mean "the money may move now".
 * Reading `required: false` off a rejected row is how a rejected mint executes
 * on retry with the trail still reading `rejected`.
 */
test('requireApproval: a rejected, expired or failed replay is a 409, and no money follows', async () => {
  const cases = [
    { status: 'rejected', code: 'approval_rejected', text: /Rejected/ },
    { status: 'expired', code: 'approval_expired', text: /Expired/ },
    { status: 'failed', code: 'failed', text: /Failed/ },
  ];
  for (const { status, code, text: expected } of cases) {
    for (const payload of [
      // The shape the follow-up migration returns (ok:false with a code, and
      // `required` left TRUE so a caller reading only that field still holds),
      // and a bare status with no `ok` at all. Both must refuse.
      { ok: false, refused: true, required: true, error: code, approval_id: APPROVAL_ID, status },
      { required: false, approval_id: APPROVAL_ID, status, idempotent: true },
    ]) {
      const db = fakeDb({}, requestRpc(payload));
      const op = opFor(db, { policy: policyOf({ approvalsEnabled: true, mintThreshold: 0 }) });
      await quiet(() =>
        assert.rejects(
          requireApproval(op, fakeReq(), { kind: 'mint', amount: 500, opId: 'op-replay' }),
          (err) => {
            assert.equal(err.status, 409);
            assert.ok(err.code === code || err.code === status, `unexpected code ${err.code}`);
            assert.match(err.message, expected);
            assert.match(err.message, /^[A-Z]/, 'operator-facing text is Title Case');
            return true;
          }
        )
      );
    }
  }
});

test('requireApproval: a payload that does not match the key it is reusing is a 409', async () => {
  const db = fakeDb({}, requestRpc({ ok: false, error: 'payload_mismatch', approval_id: APPROVAL_ID }));
  const op = opFor(db, { policy: policyOf({ approvalsEnabled: true, mintThreshold: 0 }) });
  await quiet(() =>
    assert.rejects(
      requireApproval(op, fakeReq(), { kind: 'mint', amount: 999_999, opId: 'op-laundered' }),
      (err) => {
        assert.equal(err.status, 409);
        assert.equal(err.code, 'payload_mismatch');
        assert.match(err.message, /Different Request/);
        return true;
      }
    )
  );
  // And an unknown refusal code is still a refusal, never a pass.
  const odd = fakeDb({}, requestRpc({ ok: false, error: 'something_new', approval_id: APPROVAL_ID }));
  await quiet(() =>
    assert.rejects(
      requireApproval(opFor(odd, { policy: policyOf({ approvalsEnabled: true }) }), fakeReq(), {
        kind: 'mint',
        amount: 1,
        opId: 'op-odd',
      }),
      (err) => err.status === 409 && err.code === 'something_new'
    )
  );
});

test('requireApproval: only auto_approved, approved and executed release the money', async () => {
  const on = policyOf({ approvalsEnabled: true, mintThreshold: 0 });
  for (const status of ['auto_approved', 'approved', 'executed']) {
    const db = fakeDb({}, requestRpc({ required: false, approval_id: APPROVAL_ID, status }));
    const result = await requireApproval(opFor(db, { policy: on }), fakeReq(), {
      kind: 'mint',
      amount: 10,
      opId: `op-${status}`,
    });
    assert.equal(result.required, false, `${status} must let the operation proceed`);
    assert.equal(result.status, status);
  }
  // A status this module does not recognise HOLDS rather than passes, even
  // when the database says required:false.
  const db = fakeDb({}, requestRpc({ required: false, approval_id: APPROVAL_ID, status: 'pending' }));
  const held = await requireApproval(opFor(db, { policy: on }), fakeReq(), {
    kind: 'mint',
    amount: 10,
    opId: 'op-pending',
  });
  assert.equal(held.required, true, 'a pending row must not read as a release');
});

/**
 * THE BOUNDARY, ON BOTH SIDES (review H-2).
 *
 * The module comment, the console copy and the JS all gate at `>=`; the
 * shipped SQL gated at `>`, and requireApproval ANDs the two, so an amount
 * exactly equal to the threshold went through unwatched. The follow-up
 * migration moves the SQL to `>=`; this asserts that an amount AT the
 * threshold is gated end to end, and that a database still answering the old
 * way cannot release it.
 */
test('requireApproval: an amount exactly at the threshold is gated end to end', async () => {
  const on = policyOf({ approvalsEnabled: true, mintThreshold: 1000 });
  assert.equal(requiresApproval(on, 'mint', 1000).required, true, 'the JS gates at >=');
  assert.equal(requiresApproval(on, 'mint', 999.99).required, false);

  const fixed = fakeDb({}, requestRpc({ required: true, approval_id: APPROVAL_ID, status: 'pending' }));
  const gated = await requireApproval(opFor(fixed, { policy: on }), fakeReq(), {
    kind: 'mint',
    amount: 1000,
    opId: 'op-boundary',
  });
  assert.equal(gated.required, true);

  // The old SQL answered required:false at the boundary with a pending row.
  // The status is what decides, so the ceiling cannot be talked past.
  const legacy = fakeDb({}, requestRpc({ required: false, approval_id: APPROVAL_ID, status: 'pending' }));
  const still = await requireApproval(opFor(legacy, { policy: on }), fakeReq(), {
    kind: 'mint',
    amount: 1000,
    opId: 'op-boundary-2',
  });
  assert.equal(still.required, true, 'an amount at the threshold must not slip through');
});

test('requireApproval: an unknown kind is a route misconfiguration, not a silent pass', async () => {
  const db = fakeDb({}, requestRpc({ required: false }));
  await assert.rejects(
    requireApproval(opFor(db), fakeReq(), { kind: 'teleport', amount: 1 }),
    (err) => err.status === 500 && err.code === 'route_misconfigured'
  );
  assert.equal(db.calls.length, 0, 'nothing may be written for a kind that does not exist');
});

test('markApprovalExecuted runs once, closes the row, and never throws', async () => {
  let calls = 0;
  const db = fakeDb({}, {
    fn_ca_operator_mark_executed: async (args) => {
      calls += 1;
      assert.equal(args.p_approval_id, APPROVAL_ID);
      assert.equal(args.p_status, 'executed');
      return { data: { ok: true }, error: null };
    },
  });
  const ok = await markApprovalExecuted(opFor(db), APPROVAL_ID, { ledger_id: 'l1' });
  assert.equal(ok.ok, true);
  assert.equal(ok.skipped, false);
  assert.equal(ok.refused, false);
  assert.equal(calls, 1);

  // No approval id (the row was never recorded) is a skip, not a call.
  assert.equal((await markApprovalExecuted(opFor(db), null, {})).skipped, true);
  assert.equal(calls, 1);

  // And a failure is swallowed: the chips already moved.
  const broken = fakeDb({}, {
    fn_ca_operator_mark_executed: async () => ({ data: null, error: { message: 'timeout' } }),
  });
  const { value: bad } = await quiet(() => markApprovalExecuted(opFor(broken), APPROVAL_ID, {}));
  assert.equal(bad.ok, false);
  assert.equal(bad.refused, false, 'a transport failure is not a refusal');
  const { value: threw } = await quiet(() => markApprovalExecuted({ db: null }, APPROVAL_ID, {}));
  assert.equal(threw.ok, false);
});

/**
 * THE ONE SIGNAL THAT MUST NOT BE SWALLOWED (review M-8).
 *
 * `{ ok: false, error: 'not_approved' }` means chips moved against a row nobody
 * approved. It used to be discarded - only `error` was read, never `data.ok` -
 * and the route reported a clean success over the top of it.
 */
test('markApprovalExecuted reports a refusal instead of reporting success over it', async () => {
  const db = fakeDb({}, {
    fn_ca_operator_mark_executed: async () => ({
      data: { ok: false, error: 'not_approved', status: 'rejected' },
      error: null,
    }),
  });
  const { value: result, logged } = await quiet(() =>
    markApprovalExecuted(opFor(db), APPROVAL_ID, { ok: true })
  );
  assert.equal(result.ok, false, 'a refusal is not a success');
  assert.equal(result.refused, true);
  assert.equal(result.reason, 'not_approved');
  assert.ok(
    logged.some((line) => /REFUSED approval/.test(line)),
    'the disagreement between the row and the money must be loud'
  );
});

test('the pending envelope is the contract shape and a 202', () => {
  const body = approvalPendingBody({ approvalId: APPROVAL_ID, status: 'pending' });
  assert.deepEqual(Object.keys(body).sort(), ['approvalId', 'message', 'pending', 'status', 'success']);
  assert.equal(body.success, true);
  assert.equal(body.pending, true);
  assert.equal(body.status, 'pending');
  assert.match(body.message, /^[A-Z]/, 'operator-facing text is Title Case');

  const res = fakeRes();
  approvalPendingResponse(res, { approvalId: APPROVAL_ID, status: 'pending', blockedReason: null }, {
    requestId: 'req-1',
    message: 'Sent For Approval',
  });
  assert.equal(res.statusCode, 202);
  assert.equal(res.body.pending, true);
  assert.equal(res.body.requestId, 'req-1');
  assert.equal(res.body.message, 'Sent For Approval');
});

// ------------------------------------------- self approval and alone rule

test('canDecideApproval: a second operator decides freely', () => {
  const approval = { status: 'pending', requested_by: OTHER_ID };
  const gate = canDecideApproval(approval, OPERATOR_ID, policyOf({ allowSelfApproveWhenAlone: false }));
  assert.deepEqual(gate, { allowed: true, reason: 'second_operator' });
});

test('canDecideApproval: self approval is refused once Dan turns the alone-rule off', () => {
  const approval = { status: 'pending', requested_by: OPERATOR_ID };
  const strict = canDecideApproval(approval, OPERATOR_ID, policyOf({ allowSelfApproveWhenAlone: false }));
  assert.deepEqual(strict, { allowed: false, reason: 'self_approval' });

  // Default ON, and the operator IS alone: one operator cannot four-eyes
  // anything, so the rule clears their own request.
  const alone = canDecideApproval(approval, OPERATOR_ID, policyOf({}), { eligibleApprovers: 0 });
  assert.deepEqual(alone, { allowed: true, reason: 'alone_rule' });
});

/**
 * THE ALONE-RULE HAS TO COUNT (review H-3).
 *
 * fn_ca_operator_decide_approval clears a self-decision only when
 * fn_ca_operator_has_second_approver says there is nobody else. Production has
 * three legacy operators, so with the old copy of the rule the console rendered
 * an enabled Approve button on the operator's own request, the RPC answered
 * self_approval_refused, and the audit row's `alone_rule: true` was false.
 */
test('canDecideApproval: the alone-rule refuses while another approver exists', () => {
  const mine = { status: 'pending', requested_by: OPERATOR_ID };
  for (const eligibleApprovers of [1, 2, 12]) {
    assert.deepEqual(
      canDecideApproval(mine, OPERATOR_ID, policyOf({}), { eligibleApprovers }),
      { allowed: false, reason: 'self_approval' },
      `${eligibleApprovers} other approvers means the requester is not alone`
    );
  }
  // Somebody else's request is unaffected by the count.
  assert.deepEqual(
    canDecideApproval({ status: 'pending', requested_by: OTHER_ID }, OPERATOR_ID, policyOf({}), {
      eligibleApprovers: 2,
    }),
    { allowed: true, reason: 'second_operator' }
  );
  // An UNKNOWN count fails open: section 0 says an unreadable roster must not
  // freeze a platform that would otherwise move, and the RPC still refuses at
  // write time if it disagrees.
  assert.deepEqual(canDecideApproval(mine, OPERATOR_ID, policyOf({}), { eligibleApprovers: null }), {
    allowed: true,
    reason: 'alone_rule',
  });
  assert.deepEqual(canDecideApproval(mine, OPERATOR_ID, policyOf({})), {
    allowed: true,
    reason: 'alone_rule',
  });
});

test('canDecideApproval: a decided, expired or missing row cannot be decided again', () => {
  assert.equal(canDecideApproval(null, OPERATOR_ID, policyOf({})).reason, 'not_found');
  assert.equal(
    canDecideApproval({ status: 'executed', requested_by: OTHER_ID }, OPERATOR_ID, policyOf({})).reason,
    'already_decided'
  );
  const expired = {
    status: 'pending',
    requested_by: OTHER_ID,
    expires_at: new Date(Date.now() - 60_000).toISOString(),
  };
  assert.equal(canDecideApproval(expired, OPERATOR_ID, policyOf({})).reason, 'expired');
  const live = {
    status: 'pending',
    requested_by: OTHER_ID,
    expires_at: new Date(Date.now() + 60_000).toISOString(),
  };
  assert.equal(canDecideApproval(live, OPERATOR_ID, policyOf({})).allowed, true);
});

// ---------------------------------------------------------------- mint

const { handle: mintHandle } = await import(path.join(ROUTE_DIR, 'mint.js'));

function mintBody(over = {}) {
  return {
    action: 'mint',
    asset: 'chips',
    target: 'club',
    targetId: CLUB_ID,
    amount: '5000.00',
    reason: 'Seeding the new club treasury for launch',
    opId: 'op-mint-1',
    ...over,
  };
}

function mintDb(rpcs = {}) {
  return fakeDb({}, {
    fn_ca_mint: async () => ({
      data: { ok: true, balance_before: 0, balance_after: 5000, supply_after: 5000, ledger_id: 'l1' },
      error: null,
    }),
    fn_ca_burn: async () => ({ data: { ok: true, ledger_id: 'l2' }, error: null }),
    ...logRpc,
    ...rpcs,
  });
}

test('mint: an approval that is required returns 202 and calls NO money RPC', async () => {
  const db = mintDb(requestRpc({ required: true, approval_id: APPROVAL_ID, status: 'pending' }));
  const res = fakeRes();
  const op = opFor(db, { policy: policyOf({ approvalsEnabled: true, mintThreshold: 100 }) });
  const payload = await mintHandle({
    req: fakeReq(),
    res,
    op,
    db,
    body: mintBody(),
    query: {},
    method: 'POST',
  });

  assert.equal(res.statusCode, 202);
  assert.equal(res.body.success, true);
  assert.equal(res.body.pending, true);
  assert.equal(res.body.approvalId, APPROVAL_ID);
  assert.equal(res.body.status, 'pending');
  assert.match(res.body.message, /Approval/);
  assert.equal(payload, res, 'the handler must hand the written response back to the wrapper');

  const names = db.rpcNames();
  assert.ok(!names.includes('fn_ca_mint'), 'a pending approval must not mint');
  assert.ok(!names.includes('fn_ca_burn'), 'a pending approval must not burn');
  assert.ok(!names.includes('fn_ca_operator_mark_executed'), 'nothing was executed');
  // The request is still on the record: the operator did do something.
  const audit = db.calls.find((c) => c.rpc === 'fn_log_admin_action');
  assert.ok(audit, 'the request itself must be audited');
  assert.equal(audit.args.p_action, 'mint.request_approval');
  assert.equal(audit.args.p_after_state.approval_id, APPROVAL_ID);
});

test('mint: the approval carries the same opId the money RPC claims', async () => {
  const db = mintDb(requestRpc({ required: false, approval_id: APPROVAL_ID, status: 'auto_approved' }));
  await mintHandle({
    req: fakeReq(),
    res: fakeRes(),
    op: opFor(db),
    db,
    body: mintBody({ opId: 'op-shared-key' }),
    query: {},
    method: 'POST',
  });
  const approvalCall = db.calls.find((c) => c.rpc === 'fn_ca_operator_request_approval');
  const mintCall = db.calls.find((c) => c.rpc === 'fn_ca_mint');
  assert.equal(approvalCall.args.p_op_id, 'op-shared-key');
  assert.equal(mintCall.args.p_op_id, 'op-shared-key');
  assert.equal(
    approvalCall.args.p_op_id,
    mintCall.args.p_op_id,
    'an approved request must execute exactly once, under one key'
  );
});

test('mint: requireApproval runs BEFORE the money RPC and markApprovalExecuted exactly once after', async () => {
  const order = [];
  const db = mintDb({
    fn_ca_operator_request_approval: async () => {
      order.push('request');
      return { data: { required: false, approval_id: APPROVAL_ID, status: 'auto_approved' }, error: null };
    },
    fn_ca_mint: async () => {
      order.push('mint');
      return { data: { ok: true, ledger_id: 'l1', balance_after: 5000 }, error: null };
    },
    fn_ca_operator_mark_executed: async (args) => {
      order.push('executed');
      assert.equal(args.p_approval_id, APPROVAL_ID);
      assert.equal(args.p_status, 'executed');
      return { data: { ok: true }, error: null };
    },
  });
  const payload = await mintHandle({
    req: fakeReq(),
    res: fakeRes(),
    op: opFor(db),
    db,
    body: mintBody(),
    query: {},
    method: 'POST',
  });
  assert.deepEqual(order, ['request', 'mint', 'executed']);
  assert.equal(order.filter((s) => s === 'executed').length, 1, 'exactly once');
  assert.equal(payload.result.ok, true);
  assert.equal(payload.approvalId, APPROVAL_ID);
  assert.equal(payload.approvalStatus, 'auto_approved');
});

test('mint: a refused move marks the approval FAILED, never executed (re-verification L-11)', async () => {
  const db = mintDb({
    ...requestRpc({ required: false, approval_id: APPROVAL_ID, status: 'auto_approved' }),
    fn_ca_mint: async () => ({ data: { ok: false, reason: 'club_not_found' }, error: null }),
    fn_ca_operator_mark_executed: async () => ({ data: { ok: true, status: 'failed' }, error: null }),
  });
  await assert.rejects(
    mintHandle({ req: fakeReq(), res: fakeRes(), op: opFor(db), db, body: mintBody(), query: {}, method: 'POST' }),
    (err) => err.status === 400
  );
  const marks = db.rpcCalls().filter((c) => c.rpc === 'fn_ca_operator_mark_executed');
  assert.equal(marks.length, 1, 'the trail reads the same through either door');
  assert.equal(marks[0].args.p_status, 'failed');
});

test('mint: with the approvals RPC missing entirely, the mint still goes through', async () => {
  // The state of production between this deploy and the Phase 2 migration.
  const db = mintDb();
  const { value: payload } = await quiet(() =>
    mintHandle({ req: fakeReq(), res: fakeRes(), op: opFor(db), db, body: mintBody(), query: {}, method: 'POST' })
  );
  assert.equal(payload.result.ok, true, 'a missing migration must not stop the Mint');
  assert.ok(db.rpcNames().includes('fn_ca_mint'));
});

// -------------------------------------------------------- operator-admin

const { handle: adminHandle, spec: adminSpec, validatePolicyPatch } = await import(
  path.join(ROUTE_DIR, 'operator-admin.js')
);

const APPROVAL_ROW = {
  id: APPROVAL_ID,
  kind: 'mint',
  status: 'pending',
  requested_by: OTHER_ID,
  requested_at: '2026-09-01T00:00:00Z',
  decided_by: null,
  decided_at: null,
  executed_at: null,
  expires_at: null,
  amount: 5000,
  asset: 'chips',
  target_type: 'club',
  target_id: CLUB_ID,
  reason: 'Seeding',
  op_id: 'op-mint-1',
  blocked_reason: null,
  request_id: 'req-1',
};

const adminDb = (tables = {}, rpcs = {}) =>
  fakeDb(
    {
      ca_operator_policy: { rows: [{ id: true, approvals_enabled: false }] },
      ca_operator_approvals: { rows: [APPROVAL_ROW], count: 1 },
      ca_operator_roles: { rows: [] },
      ca_operator_role_permissions: { rows: [] },
      ...tables,
    },
    { ...logRpc, ...rpcs }
  );

const adminPost = (db, op, body) =>
  adminHandle({ req: fakeReq(), res: fakeRes(), op, db, body, query: {}, method: 'POST' });
const adminGet = (db, op, query) =>
  adminHandle({ req: fakeReq({ method: 'GET' }), res: fakeRes(), op, db, body: {}, query, method: 'GET' });

test('operator-admin is built on the wrapper and gates on the console floor', () => {
  assert.equal(adminSpec.name, 'horses.operator-admin');
  assert.deepEqual(adminSpec.methods, ['GET', 'POST']);
  assert.equal(adminSpec.permission, PERMISSIONS.CONSOLE_READ);
});

test('operator-admin: a support role can read staff but cannot grant a role', async () => {
  const db = adminDb({}, { fn_ca_operator_staff: async () => ({ data: [{ id: OPERATOR_ID }], error: null }) });
  const support = opFor(db, { role: 'support' });
  const staff = await adminGet(db, support, { section: 'staff' });
  assert.equal(staff.rows.length, 1);

  await assert.rejects(
    adminPost(db, support, { action: 'grant_role', userId: OTHER_ID, roleKey: 'finance', reason: 'Promotion' }),
    (err) => {
      assert.equal(err.status, 403);
      assert.equal(err.code, 'permission_denied');
      assert.match(err.message, /admin\.manage/);
      return true;
    }
  );
  assert.ok(!db.rpcNames().includes('fn_ca_operator_grant'), 'nothing may be granted');
});

test('operator-admin: admin.manage gates set_policy, revoke_role and grant_role', async () => {
  for (const body of [
    { action: 'grant_role', userId: OTHER_ID, roleKey: 'finance', reason: 'Promotion' },
    { action: 'revoke_role', grantId: APPROVAL_ID, reason: 'Left the team' },
    { action: 'set_policy', approvalsEnabled: true },
  ]) {
    const db = adminDb();
    for (const role of ['operations', 'finance', 'compliance', 'support', 'read_only']) {
      await assert.rejects(adminPost(db, opFor(db, { role }), body), (err) => err.status === 403);
    }
    // owner holds admin.manage, so the same call gets through to the database.
    const owner = opFor(db, { role: 'owner' });
    await adminPost(
      db,
      owner,
      body.action === 'set_policy' ? { ...body } : body
    ).catch((err) => {
      // A scripted RPC returning nothing is fine; a 403 is not.
      assert.notEqual(err.status, 403, `owner must not be refused ${body.action}`);
    });
  }
});

test('operator-admin: grant_role validates, calls the RPC and audits before/after', async () => {
  const db = adminDb({}, {
    fn_ca_operator_grant: async () => ({ data: { ok: true, grant_id: APPROVAL_ID }, error: null }),
  });
  const owner = opFor(db, { role: 'owner' });

  await assert.rejects(
    adminPost(db, owner, { action: 'grant_role', userId: 'nope', roleKey: 'finance', reason: 'Promotion' }),
    (err) => err.status === 400 && /Valid Operator/.test(err.message)
  );
  await assert.rejects(
    adminPost(db, owner, { action: 'grant_role', userId: OTHER_ID, roleKey: 'wizard', reason: 'Promotion' }),
    (err) => err.status === 400 && /Role This Console Knows/.test(err.message)
  );
  await assert.rejects(
    adminPost(db, owner, { action: 'grant_role', userId: OTHER_ID, roleKey: 'finance', reason: 'x' }),
    (err) => err.status === 400 && /Reason/.test(err.message)
  );

  const payload = await adminPost(db, owner, {
    action: 'grant_role',
    userId: OTHER_ID,
    roleKey: 'finance',
    reason: 'Promoted to the finance desk',
  });
  assert.equal(payload.roleKey, 'finance');
  const rpc = db.calls.find((c) => c.rpc === 'fn_ca_operator_grant');
  assert.equal(rpc.args.p_user_id, OTHER_ID);
  assert.equal(rpc.args.p_role_key, 'finance');
  assert.equal(rpc.args.p_granted_by, OPERATOR_ID);

  const audit = db.calls.find((c) => c.rpc === 'fn_log_admin_action');
  assert.equal(audit.args.p_action, 'operator.grant_role');
  assert.equal(audit.args.p_target_id, OTHER_ID);
  assert.deepEqual(audit.args.p_before_state, { role_key: 'finance', granted: false });
  assert.equal(audit.args.p_after_state.granted, true);
});

test('operator-admin: revoke_role audits before/after and needs a reason', async () => {
  const db = adminDb({}, {
    fn_ca_operator_revoke: async () => ({
      data: { ok: true, user_id: OTHER_ID, role_key: 'finance' },
      error: null,
    }),
  });
  const owner = opFor(db, { role: 'owner' });
  await assert.rejects(
    adminPost(db, owner, { action: 'revoke_role', grantId: APPROVAL_ID }),
    (err) => err.status === 400
  );
  await adminPost(db, owner, {
    action: 'revoke_role',
    grantId: APPROVAL_ID,
    reason: 'Moved off the finance desk',
  });
  const audit = db.calls.find((c) => c.rpc === 'fn_log_admin_action');
  assert.equal(audit.args.p_action, 'operator.revoke_role');
  assert.equal(audit.args.p_target_id, OTHER_ID);
  assert.equal(audit.args.p_before_state.revoked, false);
  assert.equal(audit.args.p_after_state.revoked, true);
});

test('operator-admin: set_policy validates every switch and threshold, then audits', async () => {
  assert.deepEqual(validatePolicyPatch({ approvalsEnabled: true }), { approvals_enabled: true });
  assert.deepEqual(validatePolicyPatch({ mint_threshold: '250.50' }), { mint_threshold: 250.5 });
  assert.deepEqual(validatePolicyPatch({ mintThreshold: 0 }), { mint_threshold: 0 });
  assert.throws(() => validatePolicyPatch({}), (err) => err.status === 400);
  assert.throws(() => validatePolicyPatch({ approvalsEnabled: 'maybe' }), (err) => err.status === 400);
  assert.throws(() => validatePolicyPatch({ mintThreshold: -5 }), (err) => err.status === 400);
  assert.throws(() => validatePolicyPatch({ approvalTtlMinutes: 1 }), (err) => err.status === 400);

  // The RPC carries the whole patch and the actor, and the audit row names
  // the fields that changed.
  _resetOperatorCachesForTests();
  let sent = null;
  const db = adminDb({}, {
    fn_ca_operator_set_policy: async (args) => {
      sent = args;
      return { data: { ok: true, policy: { id: true, ...args.p_patch } }, error: null };
    },
  });
  const owner = opFor(db, { role: 'owner' });
  const saved = await adminPost(db, owner, { action: 'set_policy', approvalsEnabled: true, mintThreshold: '1000' });
  assert.equal(saved.policy.approvals_enabled, true);
  assert.deepEqual(sent.p_patch, { approvals_enabled: true, mint_threshold: 1000 });
  assert.equal(sent.p_updated_by, OPERATOR_ID);
  const audit = db.calls.find((c) => c.rpc === 'fn_log_admin_action');
  assert.equal(audit.args.p_action, 'operator.set_policy');
  assert.deepEqual(audit.args.p_details.fields.sort(), ['approvals_enabled', 'mint_threshold']);
  _resetOperatorCachesForTests();
});

const okMint = (over = {}) => ({
  fn_ca_mint: async () => ({
    data: { ok: true, ledger_id: 'l1', balance_before: 0, balance_after: 5000, supply_after: 5000 },
    error: null,
  }),
  ...over,
});

/**
 * THE SILENT-WRITE GUARD (review M-1).
 *
 * An UPDATE that matches no row answers { data: null, error: null }. The route
 * used to echo the patch back as if it had been stored, so the panel said
 * "approvals on" over a table that still said off. The old test asserted the
 * update object that was COMPOSED, which passes either way.
 */
/**
 * set_policy goes through fn_ca_operator_set_policy, which is where the H-4
 * lockout guard lives: turning `enforce_named_roles` on when nobody would still
 * hold admin.manage is a one-way door, and the panel that could turn it back
 * off is the one that disappears.
 */
test('operator-admin: set_policy uses the guarded RPC and surfaces its refusal', async () => {
  _resetOperatorCachesForTests();
  let sent = null;
  const db = adminDb({}, {
    fn_ca_operator_set_policy: async (args) => {
      sent = args;
      return {
        data: {
          ok: true,
          policy: { id: true, approvals_enabled: true, mint_threshold: 1000, enforce_named_roles: false },
        },
        error: null,
      };
    },
  });
  const payload = await adminPost(db, opFor(db, { role: 'owner' }), {
    action: 'set_policy',
    approvalsEnabled: true,
    mintThreshold: '1000',
  });
  assert.deepEqual(sent.p_patch, { approvals_enabled: true, mint_threshold: 1000 });
  assert.equal(sent.p_updated_by, OPERATOR_ID);
  assert.equal(payload.policy.approvals_enabled, true);
  assert.equal(payload.policy.mint_threshold, 1000);
  assert.ok(
    !db.calls.some((c) => c.table === 'ca_operator_policy' && c.update),
    'the RPC upserts the singleton, so the route must not also write the row'
  );

  _resetOperatorCachesForTests();
  const lockedOut = adminDb({}, {
    fn_ca_operator_set_policy: async () => ({
      data: { ok: false, reason: 'enforce_named_roles_would_lock_out', admin_manage_holders: 0 },
      error: null,
    }),
  });
  await assert.rejects(
    adminPost(lockedOut, opFor(lockedOut, { role: 'owner' }), {
      action: 'set_policy',
      enforceNamedRoles: true,
    }),
    (err) => {
      assert.equal(err.status, 409);
      assert.equal(err.code, 'enforce_named_roles_would_lock_out');
      assert.match(err.message, /admin\.manage/);
      return true;
    }
  );
  _resetOperatorCachesForTests();
});

/**
 * M-1 (re-verification). The direct-UPDATE fallback is gone. It existed for
 * the window between the deploy and migration 20260903140000; that migration
 * is applied, so all the fallback could do was turn ANY RPC error - a
 * statement timeout, a pooler hiccup, a RAISE - into a row write with no
 * lockout guard in front of it, and then report `enforce_named_roles: true`.
 */
test('operator-admin: set_policy never writes the table on an RPC error, and never reports enforcement on', async () => {
  for (const failing of [
    async () => ({ data: null, error: { code: '57014', message: 'canceling statement due to statement timeout' } }),
    async () => ({ data: null, error: { code: 'PGRST202', message: 'function fn_ca_operator_set_policy does not exist' } }),
    async () => {
      throw new Error('connection reset');
    },
  ]) {
    _resetOperatorCachesForTests();
    const db = adminDb(
      { ca_operator_policy: { rows: [{ id: true, enforce_named_roles: false }] } },
      { fn_ca_operator_set_policy: failing }
    );
    const { value } = await quiet(() =>
      adminPost(db, opFor(db, { role: 'owner' }), { action: 'set_policy', enforceNamedRoles: true }).then(
        (payload) => ({ payload }),
        (err) => ({ err })
      )
    );
    assert.ok(value.err, 'an RPC error must be an error');
    assert.equal(value.payload, undefined);
    assert.equal(value.err.status, 503);
    assert.equal(value.err.code, 'database_unavailable');
    assert.match(value.err.message, /The Operator Policy/);
    assert.ok(
      !db.calls.some((c) => c.table === 'ca_operator_policy' && c.update),
      'no direct write to ca_operator_policy on an RPC error'
    );
    assert.ok(
      !db.calls.some((c) => c.rpc === 'fn_log_admin_action'),
      'a write that did not happen must not be audited as if it had'
    );
  }
  _resetOperatorCachesForTests();
});

test('operator-admin: set_policy refuses when the RPC hands back no policy row', async () => {
  _resetOperatorCachesForTests();
  const db = adminDb(
    { ca_operator_policy: { rows: [] } },
    { fn_ca_operator_set_policy: async () => ({ data: { ok: true }, error: null }) }
  );
  const { value } = await quiet(() =>
    assert.rejects(
      adminPost(db, opFor(db, { role: 'owner' }), { action: 'set_policy', approvalsEnabled: true }),
      (err) => {
        assert.equal(err.status, 409);
        assert.equal(err.code, 'policy_row_missing');
        assert.match(err.message, /Nothing Was Saved/);
        return true;
      }
    )
  );
  assert.equal(value, undefined);
  assert.ok(!db.calls.some((c) => c.table === 'ca_operator_policy' && c.update));
  assert.ok(
    !db.calls.some((c) => c.rpc === 'fn_log_admin_action'),
    'a write that did not happen must not be audited as if it had'
  );
  _resetOperatorCachesForTests();
});

/**
 * EVERY WRITE ACTION HAS AN `ok: false` BRANCH AND NONE OF THEM WAS TESTED
 * (review T-5), because the fake answered { data: null, error: null } to any
 * RPC it had not been given, which satisfies `if (data && data.ok === false)`
 * vacuously. The fake now throws on an unscripted RPC, so these are the real
 * refusals.
 */
test('operator-admin: a refusal from the database is a 409, not a success envelope', async () => {
  const grantDb = adminDb({}, {
    fn_ca_operator_grant: async () => ({ data: { ok: false, reason: 'role_not_found' }, error: null }),
  });
  await assert.rejects(
    adminPost(grantDb, opFor(grantDb, { role: 'owner' }), {
      action: 'grant_role',
      userId: OTHER_ID,
      roleKey: 'finance',
      reason: 'Runs the treasury desk',
    }),
    (err) => err.status === 409 && err.code === 'role_not_found'
  );

  const revokeDb = adminDb({}, {
    fn_ca_operator_revoke: async () => ({ data: { ok: false, reason: 'already_revoked' }, error: null }),
  });
  await assert.rejects(
    adminPost(revokeDb, opFor(revokeDb, { role: 'owner' }), {
      action: 'revoke_role',
      grantId: APPROVAL_ID,
      reason: 'Moved off the finance desk',
    }),
    (err) => err.status === 409 && err.code === 'already_revoked'
  );

  const world = approvalWorld({ payload: MINT_PAYLOAD });
  const decideDb = world.db({
    ...okMint(),
    fn_ca_operator_decide_approval: async () => ({
      data: { ok: false, reason: 'self_approval_refused' },
      error: null,
    }),
  });
  await assert.rejects(
    adminPost(decideDb, opFor(decideDb, { role: 'finance' }), {
      action: 'decide_approval',
      approvalId: APPROVAL_ID,
      decision: 'approve',
    }),
    (err) => err.status === 409 && err.code === 'self_approval_refused'
  );
  assert.ok(
    !decideDb.rpcNames().includes('fn_ca_mint'),
    'a refused decision must never reach the money RPC'
  );
});

test('operator-admin: decide_approval needs the permission the KIND needs', async () => {
  // A finance operator holds money.write, so a mint approval is theirs to make.
  const finance = approvalWorld({ payload: MINT_PAYLOAD });
  const financeDb = finance.db(okMint());
  const payload = await adminPost(financeDb, opFor(financeDb, { role: 'finance' }), {
    action: 'decide_approval',
    approvalId: APPROVAL_ID,
    decision: 'approve',
    note: 'Checked against the treasury plan',
  });
  assert.equal(payload.decision, 'approve');
  const decide = financeDb.calls.find((c) => c.rpc === 'fn_ca_operator_decide_approval');
  assert.equal(decide.args.p_decision, 'approve');
  assert.equal(decide.args.p_decided_by, OPERATOR_ID);
  const audit = financeDb.calls.find(
    (c) => c.rpc === 'fn_log_admin_action' && c.args.p_action === 'operator.decide_approval'
  );
  assert.equal(audit.args.p_details.permission, PERMISSIONS.MONEY_WRITE);
  assert.equal(audit.args.p_details.kind, 'mint');
  assert.equal(audit.args.p_before_state.status, 'pending');
  assert.equal(audit.args.p_after_state.status, 'approved');

  // A support operator does not, and is refused after the row is read.
  const support = approvalWorld({ payload: MINT_PAYLOAD });
  const supportDb = support.db(okMint());
  await assert.rejects(
    adminPost(supportDb, opFor(supportDb, { role: 'support' }), {
      action: 'decide_approval',
      approvalId: APPROVAL_ID,
      decision: 'approve',
    }),
    (err) => err.status === 403 && /money\.write/.test(err.message)
  );
  assert.ok(!supportDb.rpcNames().includes('fn_ca_operator_decide_approval'));
  assert.equal(support.row.status, 'pending', 'nothing may be decided without the permission');

  // And a cashout approval wants cashier.write, which finance also holds and
  // operations does not.
  const cashout = approvalWorld({ kind: 'cashout' });
  const cashoutDb = cashout.db();
  await assert.rejects(
    adminPost(cashoutDb, opFor(cashoutDb, { role: 'operations' }), {
      action: 'decide_approval',
      approvalId: APPROVAL_ID,
      decision: 'approve',
    }),
    (err) => err.status === 403 && /cashier\.write/.test(err.message)
  );
});

test('operator-admin: an operator cannot decide their own request once the alone-rule is off', async () => {
  const strictWorld = approvalWorld({ requested_by: OPERATOR_ID, payload: MINT_PAYLOAD });
  const db = strictWorld.db(okMint());
  const strict = opFor(db, {
    role: 'finance',
    policy: policyOf({ approvalsEnabled: true, allowSelfApproveWhenAlone: false }),
  });
  await assert.rejects(
    adminPost(db, strict, { action: 'decide_approval', approvalId: APPROVAL_ID, decision: 'approve' }),
    (err) => {
      assert.equal(err.status, 409);
      assert.equal(err.code, 'self_approval');
      assert.match(err.message, /You Raised It/);
      return true;
    }
  );
  assert.ok(!db.rpcNames().includes('fn_ca_operator_decide_approval'));
  assert.ok(!db.rpcNames().includes('fn_ca_mint'), 'and nothing may be minted');

  // With the alone-rule on AND nobody else able to approve - the only way one
  // operator ships anything - the same call goes through and the audit row says
  // the rule fired.
  const aloneWorld = approvalWorld({ requested_by: OPERATOR_ID, payload: MINT_PAYLOAD });
  const aloneDb = aloneWorld.db(okMint());
  const alone = opFor(aloneDb, {
    role: 'finance',
    policy: policyOf({ approvalsEnabled: true, allowSelfApproveWhenAlone: true }),
  });
  const payload = await adminPost(aloneDb, alone, {
    action: 'decide_approval',
    approvalId: APPROVAL_ID,
    decision: 'approve',
  });
  assert.equal(payload.aloneRule, true);
  const audit = aloneDb.calls.find(
    (c) => c.rpc === 'fn_log_admin_action' && c.args.p_action === 'operator.decide_approval'
  );
  assert.equal(audit.args.p_details.alone_rule, true);
  const asked = aloneDb.calls.find((c) => c.rpc === 'fn_ca_operator_has_second_approver');
  assert.equal(asked.args.p_permission, PERMISSIONS.MONEY_WRITE, 'the rule must be asked, not assumed');
});

/**
 * H-3 AT THE ROUTE. Production runs three legacy operators, so the requester is
 * never alone: their own request must be refused here exactly as the RPC would
 * refuse it, rather than offered and then bounced.
 */
test('operator-admin: the alone-rule does not fire while somebody else can approve', async () => {
  const world = approvalWorld({ requested_by: OPERATOR_ID, payload: MINT_PAYLOAD });
  const db = world.db({
    ...okMint(),
    fn_ca_operator_has_second_approver: async () => ({ data: true, error: null }),
  });
  const op = opFor(db, {
    role: 'finance',
    policy: policyOf({ approvalsEnabled: true, allowSelfApproveWhenAlone: true }),
  });
  await assert.rejects(
    adminPost(db, op, { action: 'decide_approval', approvalId: APPROVAL_ID, decision: 'approve' }),
    (err) => {
      assert.equal(err.status, 409);
      assert.equal(err.code, 'self_approval');
      return true;
    }
  );
  assert.equal(world.row.status, 'pending');
  assert.ok(!db.rpcNames().includes('fn_ca_mint'));

  // And the queue says the same thing about the same row, so the console never
  // renders a button the decision endpoint will refuse.
  const queueDb = world.db({
    fn_ca_operator_has_second_approver: async () => ({ data: true, error: null }),
  });
  const page = await adminGet(queueDb, opFor(queueDb, {
    role: 'finance',
    policy: policyOf({ approvalsEnabled: true, allowSelfApproveWhenAlone: true }),
  }), { section: 'approvals' });
  assert.equal(page.rows[0].can_decide, false);
  assert.equal(page.rows[0].decide_blocked_reason, 'self_approval');
  assert.equal(page.rows[0].alone_rule, false);
});

// ------------------------------------------------- executing what was approved

/**
 * B-1, THE BLOCKER THIS PHASE SHIPPED WITH.
 *
 * Approving a mint used to mark a row and stop: nothing read `payload`,
 * nothing re-drove fn_ca_mint, and the console rotates the browser's
 * idempotency key on every payload change so the operator could not resubmit
 * under the approved row's key either. These assert the money actually moves,
 * under the row's own key, from the row's own stored payload.
 */
test('operator-admin: approving a mint RUNS it, with the stored payload and the row op_id', async () => {
  const world = approvalWorld({ payload: MINT_PAYLOAD, op_id: 'op-mint-1' });
  let minted = null;
  const db = world.db({
    fn_ca_mint: async (args) => {
      minted = args;
      return { data: { ok: true, ledger_id: 'l-9', balance_after: 5000, supply_after: 5000 }, error: null };
    },
  });
  const payload = await adminPost(db, opFor(db, { role: 'finance' }), {
    action: 'decide_approval',
    approvalId: APPROVAL_ID,
    decision: 'approve',
    note: 'Treasury plan signed off',
  });

  assert.ok(minted, 'an approved mint must reach fn_ca_mint');
  assert.deepEqual(minted, {
    p_asset: 'chips',
    p_destination: 'club',
    p_target_id: CLUB_ID,
    p_amount: 5000,
    p_reason: MINT_PAYLOAD.reason,
    p_op_id: 'op-mint-1',
  });
  assert.equal(payload.execution.ok, true);
  assert.equal(payload.execution.attempted, true);
  assert.equal(payload.execution.opId, 'op-mint-1', 'exactly once, under the key it was approved with');
  assert.equal(payload.execution.result.ledger_id, 'l-9');
  assert.match(payload.message, /The Money Has Moved/);

  // The row is closed out, and the execution is its own audit row.
  assert.equal(world.row.status, 'executed');
  assert.equal(world.row.result.ledger_id, 'l-9');
  const actions = db.calls
    .filter((c) => c.rpc === 'fn_log_admin_action')
    .map((c) => c.args.p_action);
  assert.deepEqual(actions, ['operator.decide_approval', 'operator.execute_approval']);
  const exec = db.calls.find(
    (c) => c.rpc === 'fn_log_admin_action' && c.args.p_action === 'operator.execute_approval'
  );
  assert.equal(exec.args.p_details.op_id, 'op-mint-1');
  assert.equal(exec.args.p_details.rpc, 'fn_ca_mint');
  assert.equal(exec.args.p_details.trail_closed, true);
  assert.equal(exec.args.p_after_state.status, 'executed');
});

test('operator-admin: approving a burn runs fn_ca_burn, from a source rather than a destination', async () => {
  const world = approvalWorld({
    kind: 'burn',
    op_id: 'op-burn-1',
    payload: { ...MINT_PAYLOAD, action: 'burn', target: 'union', opId: 'op-burn-1' },
  });
  let burned = null;
  const db = world.db({
    fn_ca_burn: async (args) => {
      burned = args;
      return { data: { ok: true, ledger_id: 'l-b' }, error: null };
    },
  });
  await adminPost(db, opFor(db, { role: 'finance' }), {
    action: 'decide_approval',
    approvalId: APPROVAL_ID,
    decision: 'approve',
  });
  assert.equal(burned.p_source, 'union');
  assert.equal(burned.p_op_id, 'op-burn-1');
  assert.equal(burned.p_target_id, CLUB_ID);
  assert.equal(world.row.status, 'executed');
});

test('operator-admin: rejecting runs nothing and says so', async () => {
  const world = approvalWorld({ payload: MINT_PAYLOAD });
  const db = world.db(okMint());
  const payload = await adminPost(db, opFor(db, { role: 'finance' }), {
    action: 'decide_approval',
    approvalId: APPROVAL_ID,
    decision: 'reject',
    note: 'Not this month',
  });
  assert.equal(payload.execution.attempted, false);
  assert.match(payload.execution.message, /Nothing Moved/);
  assert.equal(world.row.status, 'rejected');
  assert.ok(!db.rpcNames().includes('fn_ca_mint'));
});

/**
 * A stored payload is INPUT: jsonb written by a deploy that may be weeks old.
 * `payloadFor` is what stands between it and fn_ca_mint.
 */
test('operator-admin: a stored payload that does not match the RPC refuses instead of calling it', async () => {
  const cases = [
    [{ ...MINT_PAYLOAD, asset: 'gold' }, 'payload_asset_invalid'],
    [{ ...MINT_PAYLOAD, target: 'player' }, 'payload_target_invalid'],
    [{ ...MINT_PAYLOAD, targetId: 'not-a-uuid' }, 'payload_target_invalid'],
    [{ ...MINT_PAYLOAD, amount: -5 }, 'payload_amount_invalid'],
    [{ ...MINT_PAYLOAD, amount: '1.005' }, 'payload_amount_invalid'],
    [{ ...MINT_PAYLOAD, reason: 'short' }, 'payload_reason_invalid'],
    [{ ...MINT_PAYLOAD, action: 'burn' }, 'payload_kind_mismatch'],
    [{ ...MINT_PAYLOAD, opId: 'a-different-key' }, 'payload_op_id_mismatch'],
    [null, 'payload_missing'],
  ];
  for (const [payload, code] of cases) {
    const world = approvalWorld({ payload, op_id: 'op-mint-1' });
    const db = world.db(okMint());
    await quiet(() =>
      assert.rejects(
        adminPost(db, opFor(db, { role: 'finance' }), {
          action: 'decide_approval',
          approvalId: APPROVAL_ID,
          decision: 'approve',
        }),
        (err) => {
          assert.equal(err.status, 409, `${code} must be a 409`);
          assert.equal(err.code, code);
          assert.match(err.message, /Nothing Moved/);
          return true;
        }
      )
    );
    assert.ok(!db.rpcNames().includes('fn_ca_mint'), `${code} must never reach the money RPC`);
    // The decision stands, the attempt is recorded as failed, and the row can
    // be run again once somebody fixes what is wrong with it.
    assert.equal(world.row.status, 'failed');
    assert.equal(world.row.result.error, code);
  }
});

test('operator-admin: a refused or unreachable money RPC records failed and never reports success', async () => {
  // The RPC answers a refusal.
  const refusedWorld = approvalWorld({ payload: MINT_PAYLOAD, op_id: 'op-mint-1' });
  const refusedDb = refusedWorld.db({
    fn_ca_mint: async () => ({ data: { ok: false, reason: 'club_not_found' }, error: null }),
  });
  await assert.rejects(
    adminPost(refusedDb, opFor(refusedDb, { role: 'finance' }), {
      action: 'decide_approval',
      approvalId: APPROVAL_ID,
      decision: 'approve',
    }),
    (err) => {
      assert.equal(err.status, 409);
      assert.equal(err.code, 'club_not_found');
      assert.match(err.message, /Nothing Moved/);
      return true;
    }
  );
  assert.equal(refusedWorld.row.status, 'failed');
  assert.equal(refusedWorld.row.result.error, 'club_not_found');
  assert.equal(refusedWorld.row.result.ok, false);

  // The RPC cannot be reached at all. No database text may reach the browser.
  const downWorld = approvalWorld({ payload: MINT_PAYLOAD, op_id: 'op-mint-1' });
  const downDb = downWorld.db({
    fn_ca_mint: async () => ({ data: null, error: { message: 'relation "ca_mint_ledger" does not exist' } }),
  });
  await quiet(() =>
    assert.rejects(
      adminPost(downDb, opFor(downDb, { role: 'finance' }), {
        action: 'decide_approval',
        approvalId: APPROVAL_ID,
        decision: 'approve',
      }),
      (err) => {
        assert.equal(err.status, 503);
        assert.equal(err.code, 'execution_unavailable');
        assert.doesNotMatch(err.message, /relation/);
        assert.match(err.message, /Try Running It Again/);
        return true;
      }
    )
  );
  assert.equal(downWorld.row.status, 'failed');
});

test('operator-admin: execute_approval re-drives a failed row, and refuses one that is not approved', async () => {
  const world = approvalWorld({ payload: MINT_PAYLOAD, op_id: 'op-mint-1', status: 'failed' });
  let calls = 0;
  const db = world.db({
    fn_ca_mint: async () => {
      calls += 1;
      return { data: { ok: true, ledger_id: 'l-retry' }, error: null };
    },
  });
  const payload = await adminPost(db, opFor(db, { role: 'finance' }), {
    action: 'execute_approval',
    approvalId: APPROVAL_ID,
  });
  assert.equal(calls, 1);
  assert.equal(payload.execution.ok, true);
  assert.equal(world.row.status, 'executed');

  // A second run is refused: the row is executed and the money has moved.
  await assert.rejects(
    adminPost(db, opFor(db, { role: 'finance' }), { action: 'execute_approval', approvalId: APPROVAL_ID }),
    (err) => err.status === 409 && err.code === 'already_executed'
  );
  assert.equal(calls, 1, 'exactly once');

  // A pending row is not an approved one.
  const pending = approvalWorld({ payload: MINT_PAYLOAD });
  const pendingDb = pending.db(okMint());
  await assert.rejects(
    adminPost(pendingDb, opFor(pendingDb, { role: 'finance' }), {
      action: 'execute_approval',
      approvalId: APPROVAL_ID,
    }),
    (err) => err.status === 409 && err.code === 'not_approved'
  );
  assert.ok(!pendingDb.rpcNames().includes('fn_ca_mint'));

  // And it needs the permission the kind needs, same as the decision does.
  const supportWorld = approvalWorld({ payload: MINT_PAYLOAD, status: 'approved' });
  const supportDb = supportWorld.db(okMint());
  await assert.rejects(
    adminPost(supportDb, opFor(supportDb, { role: 'support' }), {
      action: 'execute_approval',
      approvalId: APPROVAL_ID,
    }),
    (err) => err.status === 403 && /money\.write/.test(err.message)
  );
});

/**
 * A CASHOUT DECISION IS A DECISION, AND SAYS SO.
 *
 * Its execution lives behind /api/club-arena/approve-cashout, with the
 * settlement lock, the step-up MFA gate and the player notifications that route
 * owns. An operator must not read "Approved" here as "the player has been paid".
 */
test('operator-admin: approving a cashout does not claim the money moved', async () => {
  const world = approvalWorld({ kind: 'cashout', op_id: `cashout:${CLUB_ID}` });
  const db = world.db();
  const payload = await adminPost(db, opFor(db, { role: 'finance' }), {
    action: 'decide_approval',
    approvalId: APPROVAL_ID,
    decision: 'approve',
  });
  assert.equal(payload.execution.attempted, false);
  assert.equal(payload.execution.ok, false);
  assert.match(payload.execution.message, /No Chips Have Moved Yet/);
  assert.equal(world.row.status, 'approved', 'the decision stands, the execution is elsewhere');
  assert.ok(!db.rpcNames().includes('fn_ca_operator_mark_executed'));
  assert.equal(
    db.calls.filter((c) => c.rpc === 'fn_log_admin_action').length,
    1,
    'nothing was executed, so there is no execution row'
  );
});

test('operator-admin: a decided approval and a missing one are refused, not re-decided', async () => {
  const decided = adminDb({ ca_operator_approvals: { rows: [{ ...APPROVAL_ROW, status: 'executed' }] } });
  await assert.rejects(
    adminPost(decided, opFor(decided, { role: 'finance' }), {
      action: 'decide_approval',
      approvalId: APPROVAL_ID,
      decision: 'approve',
    }),
    (err) => err.status === 409 && err.code === 'already_decided'
  );

  const missing = adminDb({ ca_operator_approvals: { rows: [] } });
  await assert.rejects(
    adminPost(missing, opFor(missing, { role: 'finance' }), {
      action: 'decide_approval',
      approvalId: APPROVAL_ID,
      decision: 'approve',
    }),
    (err) => err.status === 404
  );
});

test('operator-admin: the approvals queue filters, pages and reports truncation', async () => {
  const rows = Array.from({ length: 12 }, (_, i) => ({
    ...APPROVAL_ROW,
    id: `id-${i}`,
    kind: i % 2 ? 'cashout' : 'mint',
    status: i < 4 ? 'pending' : 'executed',
    requested_at: `2026-09-${String(i + 1).padStart(2, '0')}T00:00:00Z`,
  }));
  const db = adminDb({ ca_operator_approvals: { rows } });
  const op = opFor(db, { role: 'read_only' });

  const page = await adminGet(db, op, { section: 'approvals', status: 'pending', limit: '2', offset: '1' });
  assert.equal(page.limit, 2);
  assert.equal(page.offset, 1);
  assert.equal(page.total, 4, 'the count must be of the FILTERED set');
  assert.equal(page.rows.length, 2);
  assert.equal(page.hasMore, true);
  assert.equal(page.truncated, true);
  assert.deepEqual(page.approvals, page.rows);

  const call = db.calls.find((c) => c.table === 'ca_operator_approvals' && c.countMode);
  assert.ok(call.filters.some(([o, c, v]) => o === 'eq' && c === 'status' && v === 'pending'));
  assert.deepEqual(call.range, [1, 2]);
  assert.equal(call.countMode, 'exact');

  const byKind = await adminGet(db, op, { section: 'approvals', kind: 'cashout' });
  assert.ok(byKind.rows.every((r) => r.kind === 'cashout'));
  // A status that is not in the vocabulary is ignored rather than passed to
  // Postgres, so a typo cannot become a 500.
  const bogus = await adminGet(db, op, { section: 'approvals', status: 'banana' });
  assert.equal(bogus.total, 12);
});

test('operator-admin: the roles matrix falls back to the code vocabulary before the migration', async () => {
  const missing = adminDb({
    ca_operator_roles: { error: { message: 'relation does not exist' } },
    ca_operator_role_permissions: { error: { message: 'relation does not exist' } },
  });
  const { value: fromCode } = await quiet(() =>
    adminGet(missing, opFor(missing, { role: 'read_only' }), { section: 'roles' })
  );
  assert.equal(fromCode.source, 'code');
  assert.equal(fromCode.rows.length, OPERATOR_ROLE_KEYS.length);
  assert.deepEqual(fromCode.matrix.finance, permissionsForRole('finance'));
  assert.ok(fromCode.permissions.includes(PERMISSIONS.ADMIN_MANAGE));

  const seeded = adminDb({
    ca_operator_roles: { rows: [{ key: 'finance', label: 'Finance', description: 'Money', rank: 50, is_legacy: false }] },
    ca_operator_role_permissions: {
      rows: [
        { role_key: 'finance', permission: 'money.write' },
        { role_key: 'finance', permission: 'console.read' },
      ],
    },
  });
  const fromDb = await adminGet(seeded, opFor(seeded, { role: 'read_only' }), { section: 'roles' });
  assert.equal(fromDb.source, 'database');
  assert.deepEqual(fromDb.matrix.finance, ['money.write', 'console.read']);
});

test('operator-admin: audit_trail needs audit.read and both target parts', async () => {
  const db = adminDb({}, {
    fn_ca_operator_audit_trail: async (args) => ({
      data: { rows: [{ id: 1, action: 'mint.issue' }], total: 7, _args: args },
      error: null,
    }),
  });
  await assert.rejects(
    adminGet(db, opFor(db, { role: 'support', permissions: [PERMISSIONS.CONSOLE_READ] }), {
      section: 'audit_trail',
      targetType: 'club',
      targetId: CLUB_ID,
    }),
    (err) => err.status === 403 && /audit\.read/.test(err.message)
  );

  const reader = opFor(db, { role: 'compliance' });
  await assert.rejects(
    adminGet(db, reader, { section: 'audit_trail', targetType: 'club' }),
    (err) => err.status === 400 && /Target Type And Target Id/.test(err.message)
  );

  const trail = await adminGet(db, reader, {
    section: 'audit_trail',
    targetType: 'club',
    targetId: CLUB_ID,
    limit: '25',
    offset: '50',
  });
  assert.equal(trail.total, 7);
  assert.equal(trail.rows.length, 1);
  assert.deepEqual(trail.entries, trail.rows);
  const call = db.calls.find((c) => c.rpc === 'fn_ca_operator_audit_trail');
  assert.equal(call.args.p_target_type, 'club');
  assert.equal(call.args.p_target_id, CLUB_ID);
  assert.equal(call.args.p_limit, 25);
  assert.equal(call.args.p_offset, 50);
});

/**
 * THE BOOTSTRAP READ.
 *
 * section=policy is the one request /horses makes on every load, and the
 * console filters its tab strip, its buttons and its Approvals queue on what
 * comes back. Until this shipped it carried the policy and nothing else: the
 * client asked for `permissions`, got undefined, and fell back to showing
 * everything - which is the right fallback and the wrong answer.
 */
test('operator-admin: the policy read says who is asking and what they hold', async () => {
  _resetOperatorCachesForTests();
  const db = adminDb(
    {
      ca_operator_policy: {
        rows: [{
          id: true,
          approvals_enabled: true,
          allow_self_approve_when_alone: false,
          enforce_named_roles: false,
          mint_threshold: 1000,
          fund_threshold: 250,
          cashout_threshold: 500,
          approval_ttl_minutes: 60,
          updated_by: OPERATOR_ID,
          updated_at: '2026-09-03T00:00:00Z',
        }],
      },
    },
    { fn_ca_operator_staff: async () => ({ data: { staff: [], total: 0 }, error: null }) }
  );
  const op = {
    ...opFor(db, { role: 'admin' }),
    roles: ['admin', 'finance'],
    grantedRoles: ['finance'],
    permissionSource: 'both',
    permissionsDegraded: false,
  };

  const payload = await adminGet(db, op, { section: 'policy' });

  // The keys that were already there keep their meaning.
  assert.deepEqual(payload.defaults, { approvalsEnabled: false, enforceNamedRoles: false });

  // BOTH SPELLINGS. The table and every RPC parameter are snake_case; the
  // server's policy object is camelCase. A reader of either one gets an
  // answer, and neither gets `undefined`, which every one of these fields
  // would read as "off" or "zero" - the wrong way round to be wrong.
  assert.equal(payload.policy.approvals_enabled, true);
  assert.equal(payload.policy.approvalsEnabled, true);
  assert.equal(payload.policy.allow_self_approve_when_alone, false);
  assert.equal(payload.policy.allowSelfApproveWhenAlone, false);
  assert.equal(payload.policy.enforce_named_roles, false);
  assert.equal(payload.policy.enforceNamedRoles, false);
  assert.equal(payload.policy.mint_threshold, 1000);
  assert.equal(payload.policy.mintThreshold, 1000);
  assert.equal(payload.policy.fund_threshold, 250);
  assert.equal(payload.policy.cashout_threshold, 500);
  assert.equal(payload.policy.approval_ttl_minutes, 60);
  assert.equal(payload.policy.approvalTtlMinutes, 60);
  assert.equal(payload.policy.updated_by, OPERATOR_ID);
  assert.equal(payload.policy.updated_at, '2026-09-03T00:00:00Z');

  // The operator envelope the client filters its tabs with.
  assert.equal(payload.operator.id, OPERATOR_ID);
  assert.equal(payload.operator.role, 'admin');
  assert.deepEqual(payload.operator.roles, ['admin', 'finance']);
  assert.deepEqual(payload.operator.grantedRoles, ['finance']);
  assert.ok(payload.operator.permissions.includes(PERMISSIONS.ADMIN_MANAGE));
  assert.equal(payload.operator.permissionSource, 'both');
  assert.equal(payload.operator.degraded, false);
  _resetOperatorCachesForTests();
});

test('operator-admin: the policy read counts who else could approve a money move', async () => {
  _resetOperatorCachesForTests();
  const roster = (staff) => adminDb(
    {
      ca_operator_policy: {
        rows: [{ id: true, approvals_enabled: true, allow_self_approve_when_alone: true }],
      },
    },
    { fn_ca_operator_staff: async () => ({ data: { staff, total: staff.length }, error: null }) }
  );

  // Two other operators hold money.write, so nobody is alone.
  const crowded = roster([
    { user_id: OPERATOR_ID, profile_role: 'admin', granted_roles: [], grants: [] },
    { user_id: OTHER_ID, profile_role: 'admin', granted_roles: [], grants: [] },
    { user_id: CLUB_ID, profile_role: null, granted_roles: ['finance'], grants: [] },
  ]);
  const many = await adminGet(crowded, opFor(crowded, { role: 'admin' }), { section: 'policy' });
  assert.equal(many.aloneRule.permission, PERMISSIONS.MONEY_WRITE);
  assert.equal(many.aloneRule.eligibleApprovers, 2, 'the caller must not count as their own second pair of eyes');
  assert.equal(many.aloneRule.applies, false);

  // The platform as it actually is on the day approvals get turned on: one
  // operator, and a support account who cannot approve money.
  const lonely = roster([
    { user_id: OPERATOR_ID, profile_role: 'admin', granted_roles: [], grants: [] },
    { user_id: OTHER_ID, profile_role: null, granted_roles: ['support'], grants: [] },
  ]);
  const alone = await adminGet(lonely, opFor(lonely, { role: 'admin' }), { section: 'policy' });
  assert.equal(alone.aloneRule.eligibleApprovers, 0);
  assert.equal(alone.aloneRule.applies, true, 'one operator with the alone-rule on is the shipping state');

  // An unreadable roster is reported as unknown, never as "you are alone":
  // the per-row can_decide is what the buttons follow.
  const broken = adminDb({}, { fn_ca_operator_staff: async () => ({ data: null, error: { message: 'nope' } }) });
  const { value: degraded } = await quiet(() =>
    adminGet(broken, opFor(broken, { role: 'admin' }), { section: 'policy' })
  );
  assert.equal(degraded.aloneRule.eligibleApprovers, null);
  assert.equal(degraded.aloneRule.applies, false);
  _resetOperatorCachesForTests();
});

test('operator-admin: set_policy answers in both spellings as well', async () => {
  _resetOperatorCachesForTests();
  // The RPC hands back the row it stored, so this is the shape the panel
  // reads after it saves.
  const db = adminDb({}, {
    fn_ca_operator_set_policy: async (args) => ({
      data: { ok: true, policy: { id: true, approvals_enabled: false, ...args.p_patch } },
      error: null,
    }),
  });
  const payload = await adminPost(db, opFor(db, { role: 'owner' }), {
    action: 'set_policy',
    approvalsEnabled: true,
    mintThreshold: '25',
  });
  assert.equal(payload.policy.approvals_enabled, true);
  assert.equal(payload.policy.approvalsEnabled, true);
  assert.equal(payload.policy.mint_threshold, 25);
  assert.equal(payload.policy.mintThreshold, 25);
  _resetOperatorCachesForTests();
});

/**
 * PER-ROW DECISIONS COME FROM THE SERVER.
 *
 * Whether an operator may decide a row depends on the caller's permissions,
 * the policy and who raised it - and the client can only guess at the first
 * of those. So the queue computes it, with the same two functions the POST
 * path uses, which is what makes "this row offers a button" and "the decision
 * endpoint will accept it" the same sentence.
 */
test('operator-admin: every approval row carries its own decision and a requester name', async () => {
  const rows = [
    { ...APPROVAL_ROW, id: 'a-other', requested_by: OTHER_ID },
    { ...APPROVAL_ROW, id: 'a-self', requested_by: OPERATOR_ID },
    { ...APPROVAL_ROW, id: 'a-done', requested_by: OTHER_ID, status: 'executed' },
    {
      ...APPROVAL_ROW,
      id: 'a-late',
      requested_by: OTHER_ID,
      expires_at: '2026-01-01T00:00:00Z',
    },
  ];
  const db = adminDb(
    {
      ca_operator_approvals: { rows },
      profiles: { rows: [{ id: OTHER_ID, username: 'checker', display_name: 'The Checker' }] },
    }
  );

  // A finance operator, with the alone-rule OFF so self-approval is refused.
  const finance = opFor(db, {
    role: 'finance',
    policy: policyOf({ approvalsEnabled: true, allowSelfApproveWhenAlone: false }),
  });
  const page = await adminGet(db, finance, { section: 'approvals' });
  const by = Object.fromEntries(page.rows.map((r) => [r.id, r]));

  assert.equal(by['a-other'].can_decide, true);
  assert.equal(by['a-other'].decide_blocked_reason, null);
  assert.equal(by['a-self'].can_decide, false);
  assert.equal(by['a-self'].decide_blocked_reason, 'self_approval');
  assert.equal(by['a-done'].can_decide, false);
  assert.equal(by['a-done'].decide_blocked_reason, 'already_decided');
  assert.equal(by['a-late'].can_decide, false);
  assert.equal(by['a-late'].decide_blocked_reason, 'expired');

  // The requester is named where profiles knows the name, and IS the uuid
  // where it does not - never "Unknown" over a row that names them perfectly
  // well.
  assert.equal(by['a-other'].requester_label, 'The Checker');
  assert.equal(by['a-self'].requester_label, OPERATOR_ID);
  assert.deepEqual(page.approvals, page.rows);

  // The same page, read by an operator who cannot decide a mint at all.
  const support = adminDb({ ca_operator_approvals: { rows }, profiles: { rows: [] } });
  const read = await adminGet(support, opFor(support, { role: 'support' }), { section: 'approvals' });
  for (const row of read.rows) {
    assert.equal(row.can_decide, false, `${row.id} must not be decidable without money.write`);
  }
  const pendingRows = read.rows.filter((r) => r.id === 'a-other');
  assert.equal(pendingRows[0].decide_blocked_reason, 'no_permission');

  // And with the alone-rule ON, the operator's own request is theirs to
  // decide and the row says so - that is section 0, not a loophole.
  const aloneDb = adminDb({ ca_operator_approvals: { rows }, profiles: { rows: [] } });
  const alone = await adminGet(
    aloneDb,
    opFor(aloneDb, {
      role: 'finance',
      policy: policyOf({ approvalsEnabled: true, allowSelfApproveWhenAlone: true }),
    }),
    { section: 'approvals' }
  );
  const mine = alone.rows.find((r) => r.id === 'a-self');
  assert.equal(mine.can_decide, true);
  assert.equal(mine.decide_blocked_reason, null);
  assert.equal(mine.alone_rule, true);
});

test('operator-admin: the approvals queue filters by date on the SERVER', async () => {
  const rows = Array.from({ length: 6 }, (_, i) => ({
    ...APPROVAL_ROW,
    id: `d-${i}`,
    requested_at: `2026-09-0${i + 1}T12:00:00Z`,
  }));
  const db = adminDb({ ca_operator_approvals: { rows }, profiles: { rows: [] } });
  const op = opFor(db, { role: 'read_only' });

  const window = await adminGet(db, op, { section: 'approvals', from: '2026-09-02', to: '2026-09-04' });
  // The fake records `order` rather than applying it, so this asserts the
  // SET the filters produced, which is the part the route decides.
  assert.deepEqual(window.rows.map((r) => r.id).sort(), ['d-1', 'd-2', 'd-3']);
  // The TOTAL is of the filtered set, so the pager and the CSV describe the
  // same result the table shows. A date filter that narrowed only the page
  // in hand would be the Phase 1 audit-tab bug.
  assert.equal(window.total, 3);

  const call = db.calls.find((c) => c.table === 'ca_operator_approvals' && c.countMode);
  assert.ok(call.filters.some(([o, c]) => o === 'gte' && c === 'requested_at'), 'from must reach the query');
  const upper = call.filters.find(([o, c]) => o === 'lte' && c === 'requested_at');
  // A bare date covers the whole day it names: an operator asking for
  // requests up to the 4th means the end of the 4th.
  assert.match(upper[2], /^2026-09-04T23:59:59/);

  // An unusable date is a 400, never a silently dropped filter.
  await assert.rejects(
    adminGet(db, op, { section: 'approvals', from: 'last tuesday' }),
    (err) => err.status === 400 && /From Must Be A Date/.test(err.message)
  );
  await assert.rejects(
    adminGet(db, op, { section: 'approvals', to: '03-09-2026' }),
    (err) => err.status === 400 && /To Must Be A Date/.test(err.message)
  );
});

test('operator-admin: the staff roster is read whichever way the RPC wraps it', async () => {
  // fn_ca_operator_staff answers { staff, total }. Reading only `rows` made a
  // populated roster render as "No Operator Accounts Were Returned", and with
  // it went the grant ids the Revoke button needs.
  const grants = [{ id: APPROVAL_ID, role_key: 'finance', granted_at: '2026-09-01T00:00:00Z', granted_by: OPERATOR_ID, reason: 'Runs the treasury' }];
  const db = adminDb({}, {
    fn_ca_operator_staff: async () => ({
      data: { staff: [{ user_id: OTHER_ID, profile_role: 'admin', granted_roles: ['finance'], grants }], total: 1 },
      error: null,
    }),
  });
  const payload = await adminGet(db, opFor(db, { role: 'read_only' }), { section: 'staff' });
  assert.equal(payload.total, 1);
  assert.equal(payload.rows.length, 1);
  assert.deepEqual(payload.staff, payload.rows);
  // Passed through untouched: the grant id is the record a revoke names.
  assert.deepEqual(payload.rows[0].grants, grants);
  assert.deepEqual(payload.rows[0].granted_roles, ['finance']);
});

test('operator-admin: a grant or a revoke needs ten characters of reason, same as the console', async () => {
  const db = adminDb({}, {
    fn_ca_operator_grant: async () => ({ data: { ok: true, grant_id: APPROVAL_ID }, error: null }),
    fn_ca_operator_revoke: async () => ({ data: { ok: true, user_id: OTHER_ID }, error: null }),
  });
  const owner = opFor(db, { role: 'owner' });

  // Nine characters passed the server and failed the console, which teaches
  // an operator that the minimum is a client-side nag. It is not: the reason
  // is the only part of the record a database cannot reconstruct later.
  for (const reason of ['', 'why', 'Promotion']) {
    await assert.rejects(
      adminPost(db, owner, { action: 'grant_role', userId: OTHER_ID, roleKey: 'finance', reason }),
      (err) => err.status === 400 && /At Least Ten Characters/.test(err.message)
    );
    await assert.rejects(
      adminPost(db, owner, { action: 'revoke_role', grantId: APPROVAL_ID, reason }),
      (err) => err.status === 400 && /At Least Ten Characters/.test(err.message)
    );
  }
  assert.ok(!db.rpcNames().includes('fn_ca_operator_grant'), 'nothing may be written on a refused reason');
  assert.ok(!db.rpcNames().includes('fn_ca_operator_revoke'));

  await adminPost(db, owner, {
    action: 'grant_role', userId: OTHER_ID, roleKey: 'finance', reason: 'Runs the treasury',
  });
  assert.ok(db.rpcNames().includes('fn_ca_operator_grant'));
});

test('contract: no Phase 2 route accepts a shorter reason than the console composes', async () => {
  // MIN_REASON_LENGTH in src/components/horses/operatorAdmin.js is ten, the
  // contract says ten, and mint has always required ten. A route that took
  // five would be the only place the rule was not a rule.
  const client = source(path.join(ROOT, 'src', 'components', 'horses', 'operatorAdmin.js'));
  assert.match(client, /MIN_REASON_LENGTH = 10/);
  for (const file of [path.join(ROUTE_DIR, 'operator-admin.js'), path.join(ROUTE_DIR, 'mint.js')]) {
    const text = source(file);
    for (const [, min] of text.matchAll(/text\(\s*body\.reason[^)]*\{\s*min:\s*([A-Za-z0-9_]+)/g)) {
      const value = /^\d+$/.test(min) ? Number(min) : 10;
      assert.ok(value >= 10, `${file} accepts a reason of ${min} characters`);
    }
    assert.doesNotMatch(text, /At Least Five Characters/, `${file} still promises a five character minimum`);
  }
});

test('operator-admin: unknown sections and actions are refused before anything runs', async () => {
  const db = adminDb();
  const owner = opFor(db, { role: 'owner' });
  await assert.rejects(adminGet(db, owner, { section: 'everything' }), (err) => err.status === 400);
  await assert.rejects(adminPost(db, owner, { action: 'delete_everything' }), (err) => err.status === 400);
  assert.equal(db.calls.length, 0);
});

// -------------------------------------------------------- approve-cashout

/**
 * H-1. Maker-checker was bolted onto a route whose callers are mostly not
 * operators. A club agent cannot see the Approvals queue (console.read),
 * cannot clear it (cashier.write), and is not counted by
 * fn_ca_operator_has_second_approver, so the alone rule never releases their
 * request either. With cashout_threshold at 0 that was every cashout on the
 * platform, frozen behind a queue the people filing them cannot see.
 */
// ----------------------------------------- re-verification 2026-09-03, route

/**
 * H-1 AT THE ROSTER. aloneRuleFor counts eligible approvers from
 * fn_ca_operator_staff through rolesOfStaffRow, which used to feed a profile
 * role of 'owner' into the permission matrix and count that account as a
 * money.write holder with no grant at all.
 */
test('operator-admin: the roster count seeds nothing from a named key in profiles.role', async () => {
  _resetOperatorCachesForTests();
  const roster = (staff) => adminDb(
    {
      ca_operator_policy: {
        rows: [{ id: true, approvals_enabled: true, allow_self_approve_when_alone: true }],
      },
    },
    { fn_ca_operator_staff: async () => ({ data: { staff, total: staff.length }, error: null }) }
  );
  // 'owner' with no grant and 'finance' with a read_only grant: neither holds
  // money.write, so the admin is alone.
  const named = roster([
    { user_id: OPERATOR_ID, profile_role: 'admin', granted_roles: [], grants: [] },
    { user_id: OTHER_ID, profile_role: 'owner', granted_roles: [], grants: [] },
    { user_id: CLUB_ID, profile_role: 'finance', granted_roles: ['read_only'], grants: [{ id: 'g1', role_key: 'read_only' }] },
  ]);
  const page = await adminGet(named, opFor(named, { role: 'admin' }), { section: 'policy' });
  assert.equal(page.aloneRule.eligibleApprovers, 0, 'a named string in profiles.role is not a grant');
  assert.equal(page.aloneRule.applies, true);

  // A real legacy account with no grant still counts, enforcement or not:
  // that is the rule fn_ca_operator_permissions applies and the follow-up
  // migration makes fn_ca_operator_has_second_approver apply too (M-2).
  const legacy = roster([
    { user_id: OPERATOR_ID, profile_role: 'admin', granted_roles: [], grants: [] },
    { user_id: OTHER_ID, profile_role: 'god', granted_roles: [], grants: [] },
  ]);
  const counted = await adminGet(legacy, opFor(legacy, { role: 'admin' }), { section: 'policy' });
  assert.equal(counted.aloneRule.eligibleApprovers, 1);
  _resetOperatorCachesForTests();
});

/**
 * L-3 AT THE ROUTE. The legacy three are what profiles.role says. A grant of
 * `god` would be an owner by another name that the Staff tab cannot explain.
 */
test('operator-admin: grant_role accepts the named roles only, never god, superadmin or admin', async () => {
  for (const roleKey of LEGACY_ADMIN_ROLES) {
    const db = adminDb({}, {
      fn_ca_operator_grant: async () => {
        throw new Error('the RPC must not be reached for a legacy key');
      },
    });
    await assert.rejects(
      adminPost(db, opFor(db, { role: 'owner' }), {
        action: 'grant_role',
        userId: OTHER_ID,
        roleKey,
        reason: 'Trying to grant a legacy key',
      }),
      (err) => {
        assert.equal(err.status, 400);
        assert.equal(err.code, 'legacy_role_not_grantable');
        assert.equal(err.message, 'Legacy Roles Live On The Profile, Not In A Grant');
        return true;
      }
    );
    assert.ok(!db.rpcNames().includes('fn_ca_operator_grant'));
    assert.ok(!db.rpcNames().includes('fn_log_admin_action'), 'a refused grant files no audit row');
  }
  // Every named role still goes through.
  for (const roleKey of NAMED_OPERATOR_ROLES) {
    const db = adminDb({}, {
      fn_ca_operator_grant: async (args) => ({ data: { ok: true, grant_id: 'g-' + args.p_role_key }, error: null }),
    });
    const payload = await adminPost(db, opFor(db, { role: 'owner' }), {
      action: 'grant_role',
      userId: OTHER_ID,
      roleKey,
      reason: 'Granting a named role for the test',
    });
    assert.equal(payload.roleKey, roleKey);
  }
});

/**
 * L-4. The pending queue and its total exclude rows already past their TTL:
 * the row is still `pending` in the table until somebody touches it, and the
 * badge used to count it.
 */
test('operator-admin: the pending queue filters out rows past their TTL, on the server', async () => {
  const db = adminDb({ ca_operator_approvals: { rows: [APPROVAL_ROW] } });
  const before = Date.now();
  await adminGet(db, opFor(db, { role: 'read_only' }), { section: 'approvals', status: 'pending' });
  const call = db.calls.find((c) => c.table === 'ca_operator_approvals' && c.countMode);
  const or = call.filters.find(([o]) => o === 'or');
  assert.ok(or, 'the pending queue must carry the TTL filter');
  const m = /^expires_at\.is\.null,expires_at\.gt\.(.+)$/.exec(or[1]);
  assert.ok(m, `unexpected filter: ${or[1]}`);
  const at = Date.parse(m[1]);
  assert.ok(Number.isFinite(at) && at >= before && at <= Date.now(), 'the cutoff is now, as an ISO timestamp');

  // History reads carry no such filter: an expired row is history.
  for (const query of [{ section: 'approvals' }, { section: 'approvals', status: 'expired' }, { section: 'approvals', status: 'executed' }]) {
    const other = adminDb({ ca_operator_approvals: { rows: [APPROVAL_ROW] } });
    await adminGet(other, opFor(other, { role: 'read_only' }), query);
    const c = other.calls.find((x) => x.table === 'ca_operator_approvals' && x.countMode);
    assert.ok(!c.filters.some(([o]) => o === 'or'), `${JSON.stringify(query)} must not filter on expires_at`);
  }
});

/**
 * L-7. A 500-row page carries up to 1,000 ids (requester and decider); the
 * Phase 1 rule is that an `.in()` list never exceeds 200.
 */
test('operator-admin: requester and decider labels are read in chunks of 200 ids', async () => {
  const ids = Array.from({ length: 450 }, (_, i) => `${String(i).padStart(8, '0')}-0000-4000-8000-000000000000`);
  const rows = ids.map((id, i) => ({
    ...APPROVAL_ROW,
    id: `row-${i}`,
    requested_by: id,
    decided_by: i % 2 ? OTHER_ID : null,
    status: i % 2 ? 'executed' : 'pending',
  }));
  const profiles = ids.slice(0, 3).map((id, i) => ({ id, username: `u${i}`, display_name: `User ${i}` }));
  profiles.push({ id: OTHER_ID, username: 'checker', display_name: 'The Checker' });
  const db = adminDb({ ca_operator_approvals: { rows }, profiles: { rows: profiles } });
  const page = await adminGet(db, opFor(db, { role: 'read_only' }), { section: 'approvals', limit: '500' });
  assert.equal(page.rows.length, 450);

  const reads = db.calls.filter((c) => c.table === 'profiles');
  assert.equal(reads.length, 3, '451 unique ids is three chunks of at most 200');
  for (const read of reads) {
    const inFilter = read.filters.find(([o, c]) => o === 'in' && c === 'id');
    assert.ok(inFilter);
    assert.ok(inFilter[2].length <= 200, `an .in() list of ${inFilter[2].length} ids`);
  }
  const seen = new Set(reads.flatMap((r) => r.filters.find(([o]) => o === 'in')[2]));
  assert.equal(seen.size, 451, 'every id is asked for exactly once');
  const by = Object.fromEntries(page.rows.map((r) => [r.id, r]));
  assert.equal(by['row-0'].requester_label, 'User 0');
  assert.equal(by['row-1'].decided_by_label, 'The Checker');
  assert.equal(by['row-7'].requester_label, ids[7], 'an unnamed profile keeps its uuid');
});

/**
 * L-1. The TTL bounds the execution too. An approved-but-failed mint could be
 * re-driven months later against a club whose state had changed.
 */
test('operator-admin: execute_approval refuses an approved row past its TTL, marks it expired and audits it', async () => {
  for (const status of ['approved', 'failed']) {
    const world = approvalWorld({ payload: MINT_PAYLOAD, status, expires_at: '2020-01-01T00:00:00Z' });
    let minted = 0;
    const db = world.db({
      fn_ca_mint: async () => {
        minted += 1;
        return { data: { ok: true, ledger_id: 'never' }, error: null };
      },
    });
    const { value } = await quiet(() =>
      adminPost(db, opFor(db, { role: 'finance' }), { action: 'execute_approval', approvalId: APPROVAL_ID }).then(
        (payload) => ({ payload }),
        (err) => ({ err })
      )
    );
    assert.ok(value.err, `an expired ${status} row must be refused`);
    assert.equal(value.err.status, 409);
    assert.equal(value.err.code, 'approval_expired');
    assert.match(value.err.message, /Nothing Moved/);
    assert.equal(minted, 0, 'no money RPC');

    // The status moved by a direct update whose result was read: the fake's
    // rows are static, so the update is what is asserted, plus its guards.
    const update = db.calls.find((c) => c.table === 'ca_operator_approvals' && c.update);
    assert.ok(update, 'the row must be marked expired');
    assert.deepEqual(update.update, { status: 'expired' });
    assert.ok(update.filters.some(([o, c, v]) => o === 'eq' && c === 'id' && v === APPROVAL_ID));
    assert.ok(
      update.filters.some(([o, c, v]) => o === 'eq' && c === 'status' && v === status),
      'guarded on the status the row was read with'
    );
    assert.ok(!db.rpcNames().includes('fn_ca_operator_mark_executed'), 'mark_executed does not accept expired');

    const audit = db.calls.find(
      (c) => c.rpc === 'fn_log_admin_action' && c.args.p_action === 'operator.execute_approval'
    );
    assert.ok(audit, 'the refusal is on the record');
    assert.equal(audit.args.p_details.error, 'approval_expired');
    assert.equal(audit.args.p_details.via, 'execute_approval');
    assert.equal(audit.args.p_before_state.status, status);
  }

  // A row with a TTL still ahead of it runs.
  const live = approvalWorld({ payload: MINT_PAYLOAD, status: 'approved', expires_at: '2999-01-01T00:00:00Z' });
  const liveDb = live.db(okMint());
  const payload = await adminPost(liveDb, opFor(liveDb, { role: 'finance' }), {
    action: 'execute_approval',
    approvalId: APPROVAL_ID,
  });
  assert.equal(payload.execution.ok, true);
});

/**
 * Item 9. An approval id that names no row is a 404, the same answer
 * decide_approval gives. execution_row_missing is kept for a row that
 * vanished between the decision and the execution.
 */
test('operator-admin: execute_approval on an id that names no row is a 404, and a vanished row keeps its own code', async () => {
  const missing = adminDb({ ca_operator_approvals: { rows: [] } });
  await assert.rejects(
    adminPost(missing, opFor(missing, { role: 'finance' }), { action: 'execute_approval', approvalId: APPROVAL_ID }),
    (err) => {
      assert.equal(err.status, 404);
      assert.equal(err.code, 'not_found');
      return true;
    }
  );

  // The row exists for the decision read and is gone for the execution read.
  let reads = 0;
  const vanishing = fakeDb(
    {
      ca_operator_approvals: {
        rows: () => {
          reads += 1;
          return reads === 1 ? [{ ...APPROVAL_ROW, payload: MINT_PAYLOAD }] : [];
        },
      },
      ca_operator_policy: { rows: [{ id: true }] },
      profiles: { rows: [] },
    },
    {
      ...logRpc,
      ...okMint(),
      fn_ca_operator_has_second_approver: async () => ({ data: false, error: null }),
      fn_ca_operator_decide_approval: async () => ({ data: { ok: true, status: 'approved' }, error: null }),
    }
  );
  await assert.rejects(
    adminPost(vanishing, opFor(vanishing, { role: 'finance' }), {
      action: 'decide_approval',
      approvalId: APPROVAL_ID,
      decision: 'approve',
    }),
    (err) => {
      assert.equal(err.status, 409);
      assert.equal(err.code, 'execution_row_missing');
      return true;
    }
  );
  assert.ok(!vanishing.rpcNames().includes('fn_ca_mint'));
});

/**
 * fund_club. Production's fn_ca_fund_club takes p_idempotency_key, not
 * p_op_id, and the executor used to read shaped.args.p_op_id for its audit
 * row and its answer - undefined for this kind.
 */
test('operator-admin: an approved fund_club runs fn_ca_fund_club under p_idempotency_key and reports the key', async () => {
  const world = approvalWorld({
    kind: 'fund_club',
    status: 'approved',
    op_id: 'op-fund-1',
    target_type: 'club',
    target_id: CLUB_ID,
    payload: { clubId: CLUB_ID, amount: 5000, reason: 'Topping up the club treasury', opId: 'op-fund-1' },
  });
  let args = null;
  const db = world.db({
    fn_ca_fund_club: async (a) => {
      args = a;
      return { data: { ok: true, ledger_id: 'l-fund' }, error: null };
    },
  });
  const payload = await adminPost(db, opFor(db, { role: 'finance' }), {
    action: 'execute_approval',
    approvalId: APPROVAL_ID,
  });
  assert.deepEqual(args, {
    p_club_id: CLUB_ID,
    p_amount: 5000,
    p_reason: 'Topping up the club treasury',
    p_idempotency_key: 'op-fund-1',
  });
  assert.equal(payload.execution.ok, true);
  assert.equal(payload.execution.rpc, 'fn_ca_fund_club');
  assert.equal(payload.execution.opId, 'op-fund-1', 'the key is reported whatever the RPC calls it');
  assert.equal(world.row.status, 'executed');
  assert.equal(world.row.result.op_id, 'op-fund-1');
  const audit = db.calls.find(
    (c) => c.rpc === 'fn_log_admin_action' && c.args.p_action === 'operator.execute_approval'
  );
  assert.equal(audit.args.p_details.op_id, 'op-fund-1');
  assert.equal(audit.args.p_details.rpc, 'fn_ca_fund_club');
});

/**
 * L-12. A requester may WITHDRAW their own pending request. The four-eyes
 * rule guards approvals, not cancellations; a mistaken request used to sit in
 * the queue until its TTL.
 */
test('operator-admin: a requester may withdraw their own pending request, audited as a withdrawal', async () => {
  const strict = policyOf({ approvalsEnabled: true, allowSelfApproveWhenAlone: false });
  const world = approvalWorld({ requested_by: OPERATOR_ID, payload: MINT_PAYLOAD });
  const db = world.db({
    ...okMint(),
    fn_ca_operator_has_second_approver: async () => ({ data: true, error: null }),
  });
  const me = opFor(db, { role: 'finance', policy: strict });

  // Approving your own row is still refused.
  await assert.rejects(
    adminPost(db, me, { action: 'decide_approval', approvalId: APPROVAL_ID, decision: 'approve', note: 'Approving my own request' }),
    (err) => err.status === 409 && err.code === 'self_approval'
  );

  // Withdrawing needs a reason of at least ten characters.
  await assert.rejects(
    adminPost(db, me, { action: 'decide_approval', approvalId: APPROVAL_ID, decision: 'reject', note: 'oops' }),
    (err) => {
      assert.equal(err.status, 400);
      assert.match(err.message, /At Least Ten Characters/);
      return true;
    }
  );
  await assert.rejects(
    adminPost(db, me, { action: 'decide_approval', approvalId: APPROVAL_ID, decision: 'reject' }),
    (err) => err.status === 400
  );
  assert.equal(world.row.status, 'pending');
  assert.ok(!db.rpcNames().includes('fn_ca_operator_decide_approval'));

  // With a reason, the row is rejected and the trail says it was withdrawn.
  const payload = await adminPost(db, me, {
    action: 'decide_approval',
    approvalId: APPROVAL_ID,
    decision: 'reject',
    note: 'Raised against the wrong club',
  });
  assert.equal(payload.withdrawn, true);
  assert.equal(payload.decision, 'reject');
  assert.equal(payload.execution.attempted, false);
  assert.match(payload.execution.message, /^Withdrawn\./);
  assert.equal(world.row.status, 'rejected', 'a withdrawal is a rejection in the table');
  const decide = db.calls.find((c) => c.rpc === 'fn_ca_operator_decide_approval');
  assert.equal(decide.args.p_decision, 'reject');
  assert.equal(decide.args.p_decided_by, OPERATOR_ID);
  assert.equal(decide.args.p_note, 'Raised against the wrong club');
  const audit = db.calls.find((c) => c.rpc === 'fn_log_admin_action');
  assert.equal(audit.args.p_action, 'operator.withdraw_approval');
  assert.equal(audit.args.p_details.withdrawn, true);
  assert.equal(audit.args.p_details.decision, 'reject');
  assert.equal(audit.args.p_after_state.status, 'rejected');
  assert.ok(!db.rpcNames().includes('fn_ca_mint'));

  // Somebody else's reject is a decision, not a withdrawal, and a decided row
  // cannot be withdrawn.
  const theirs = approvalWorld({ requested_by: OTHER_ID, payload: MINT_PAYLOAD });
  const theirsDb = theirs.db();
  const rejected = await adminPost(theirsDb, opFor(theirsDb, { role: 'finance', policy: strict }), {
    action: 'decide_approval',
    approvalId: APPROVAL_ID,
    decision: 'reject',
    note: 'No',
  });
  assert.equal(rejected.withdrawn, false);
  assert.equal(
    theirsDb.calls.find((c) => c.rpc === 'fn_log_admin_action').args.p_action,
    'operator.decide_approval'
  );
  const done = approvalWorld({ requested_by: OPERATOR_ID, status: 'approved' });
  const doneDb = done.db();
  await assert.rejects(
    adminPost(doneDb, opFor(doneDb, { role: 'finance', policy: strict }), {
      action: 'decide_approval',
      approvalId: APPROVAL_ID,
      decision: 'reject',
      note: 'Taking it back after the fact',
    }),
    (err) => err.status === 409 && err.code === 'already_decided'
  );

  // And the pure helper the queue and the route share.
  assert.equal(canWithdrawApproval({ status: 'pending', requested_by: OPERATOR_ID }, OPERATOR_ID).allowed, true);
  assert.equal(canWithdrawApproval({ status: 'pending', requested_by: OTHER_ID }, OPERATOR_ID).reason, 'not_requester');
  assert.equal(canWithdrawApproval({ status: 'rejected', requested_by: OPERATOR_ID }, OPERATOR_ID).reason, 'already_decided');
  assert.equal(
    canWithdrawApproval({ status: 'pending', requested_by: OPERATOR_ID, expires_at: '2020-01-01T00:00:00Z' }, OPERATOR_ID).reason,
    'expired'
  );
  assert.equal(canWithdrawApproval(null, OPERATOR_ID).reason, 'not_found');
});

test('operator-admin: the queue says which rows the caller may withdraw', async () => {
  const rows = [
    { ...APPROVAL_ROW, id: 'a-mine', requested_by: OPERATOR_ID },
    { ...APPROVAL_ROW, id: 'a-theirs', requested_by: OTHER_ID },
    { ...APPROVAL_ROW, id: 'a-mine-done', requested_by: OPERATOR_ID, status: 'rejected' },
  ];
  const db = adminDb({ ca_operator_approvals: { rows }, profiles: { rows: [] } });
  const page = await adminGet(
    db,
    opFor(db, { role: 'finance', policy: policyOf({ approvalsEnabled: true, allowSelfApproveWhenAlone: false }) }),
    { section: 'approvals' }
  );
  const by = Object.fromEntries(page.rows.map((r) => [r.id, r]));
  assert.equal(by['a-mine'].can_decide, false, 'approving your own row is still refused');
  assert.equal(by['a-mine'].decide_blocked_reason, 'self_approval');
  assert.equal(by['a-mine'].can_withdraw, true);
  assert.equal(by['a-theirs'].can_withdraw, false);
  assert.equal(by['a-mine-done'].can_withdraw, false);

  // Without the kind's permission there is nothing to withdraw either.
  const support = adminDb({ ca_operator_approvals: { rows }, profiles: { rows: [] } });
  const read = await adminGet(support, opFor(support, { role: 'support' }), { section: 'approvals' });
  assert.ok(read.rows.every((r) => r.can_withdraw === false));
});

test('approve-cashout: only the platform-override path is gated, and the row says which path it took', () => {
  const agent = cashoutAuthPath({ isPlatformAdmin: false, isAgent: true });
  assert.equal(agent.gated, false, 'a club agent keeps exactly the behaviour they have today');
  assert.equal(agent.path, 'club_agent');
  assert.equal(agent.viaPlatformOverride, false);

  const clubAdmin = cashoutAuthPath({ isClubAdmin: true });
  assert.equal(clubAdmin.gated, false);
  assert.equal(clubAdmin.path, 'club_admin');

  const union = cashoutAuthPath({ isUnionAdmin: true });
  assert.equal(union.gated, false);
  assert.equal(union.path, 'union_admin');

  const platform = cashoutAuthPath({ isPlatformAdmin: true });
  assert.equal(platform.gated, true, 'the operator overriding from /horses is the one this gate is for');
  assert.equal(platform.path, 'platform_operator');
  assert.equal(platform.viaPlatformOverride, true);

  // A platform admin who is ALSO this club's agent is acting as the agent, and
  // the agent path is the one that works today.
  const both = cashoutAuthPath({ isPlatformAdmin: true, isAgent: true });
  assert.equal(both.gated, false);
  assert.equal(both.path, 'club_agent');
  const alsoUnion = cashoutAuthPath({ isPlatformAdmin: true, isUnionAdmin: true });
  assert.equal(alsoUnion.gated, false);
  assert.equal(alsoUnion.path, 'union_admin');

  assert.equal(cashoutAuthPath({}).path, 'unauthorized');
  assert.equal(cashoutAuthPath().gated, false);
});

test('contract: approve-cashout raises an approval only inside the platform-override branch', () => {
  const text = source(path.join(ROOT, 'pages', 'api', 'club-arena', 'approve-cashout.js'));
  const guard = text.indexOf('if (viaPlatformOverride) {');
  const request = text.indexOf('await requireApproval(');
  assert.ok(guard > -1, 'the gate must be explicit in the source');
  assert.ok(request > guard, 'requireApproval must sit inside that branch, not in front of every caller');
  // The audit rows carry the path, so the trail can say in what capacity a
  // cashout was actioned rather than only by whom.
  assert.match(text, /auth_path: authPath/);
  assert.match(text, /approval_gated: viaPlatformOverride/);
});

// ---------------------------------------------------------- stable-admin

const { handle: stableHandle, _resetActorCacheForTests } = await import(
  path.join(ROUTE_DIR, 'stable-admin.js')
);

test('stable-admin audit_log: exact targetType + targetId filters and the full evidence columns', async () => {
  _resetActorCacheForTests();
  const rows = [
    {
      id: 1,
      admin_user_id: OPERATOR_ID,
      action: 'mint.issue',
      target_type: 'club',
      target_id: CLUB_ID,
      details: {},
      before_state: null,
      after_state: {},
      ip_address: '10.0.0.1',
      user_agent: 'Mozilla/5.0',
      actor_role: 'admin',
      request_id: 'req-1',
      created_at: '2026-09-01',
    },
    {
      id: 2,
      admin_user_id: OPERATOR_ID,
      action: 'mint.issue',
      target_type: 'union',
      target_id: 'other',
      details: {},
      before_state: null,
      after_state: {},
      ip_address: '10.0.0.2',
      user_agent: 'curl/8',
      actor_role: 'admin',
      request_id: 'req-2',
      created_at: '2026-09-02',
    },
  ];
  const db = fakeDb({ admin_audit_log: { rows }, profiles: { rows: [] } });
  const op = opFor(db, { permissions: [PERMISSIONS.AUDIT_READ, PERMISSIONS.CONSOLE_READ] });

  const payload = await stableHandle({
    req: fakeReq(),
    op,
    db,
    body: { action: 'audit_log', targetType: 'club', targetId: CLUB_ID },
  });

  assert.equal(payload.entries.length, 1, 'the target filters must actually narrow the rows');
  assert.equal(payload.entries[0].target_id, CLUB_ID);
  // Contract section 2: all three evidence columns come back on every row.
  assert.equal(payload.entries[0].ip_address, '10.0.0.1');
  assert.equal(payload.entries[0].user_agent, 'Mozilla/5.0');
  assert.equal(payload.entries[0].request_id, 'req-1');

  const call = db.calls.find((c) => c.table === 'admin_audit_log' && c.countMode);
  assert.ok(call.filters.some(([o, c, v]) => o === 'eq' && c === 'target_type' && v === 'club'));
  assert.ok(call.filters.some(([o, c, v]) => o === 'eq' && c === 'target_id' && v === CLUB_ID));
  assert.match(call.select, /user_agent/, 'the select must ask for user_agent');
  _resetActorCacheForTests();
});

/**
 * L-1. `to` is a date input's YYYY-MM-DD, which parses to midnight, so "up to
 * the 2nd" silently excluded everything that happened on the 2nd - the day an
 * operator reading a log is most likely to be asking about. operator-admin's
 * approvals filter was fixed for this; the audit log was not.
 */
test('stable-admin audit_log: a bare To date covers the whole day it names', async () => {
  _resetActorCacheForTests();
  const rows = [
    { id: 1, admin_user_id: OPERATOR_ID, action: 'mint.issue', details: {}, created_at: '2026-09-01T09:00:00Z' },
    { id: 2, admin_user_id: OPERATOR_ID, action: 'mint.issue', details: {}, created_at: '2026-09-02T18:30:00Z' },
    { id: 3, admin_user_id: OPERATOR_ID, action: 'mint.issue', details: {}, created_at: '2026-09-03T01:00:00Z' },
  ];
  const db = fakeDb({ admin_audit_log: { rows }, profiles: { rows: [] } });
  const op = opFor(db, { permissions: [PERMISSIONS.AUDIT_READ] });

  const payload = await stableHandle({
    req: fakeReq(),
    op,
    db,
    body: { action: 'audit_log', from: '2026-09-01', to: '2026-09-02' },
  });
  assert.deepEqual(
    payload.entries.map((e) => e.id),
    [1, 2],
    'the evening of the day the operator named must be inside the window'
  );
  const call = db.calls.find((c) => c.table === 'admin_audit_log' && c.countMode);
  const upper = call.filters.find(([o, c]) => o === 'lte' && c === 'created_at');
  assert.match(upper[2], /^2026-09-02T23:59:59/);

  // A full timestamp is still taken exactly as given.
  const exact = fakeDb({ admin_audit_log: { rows }, profiles: { rows: [] } });
  await stableHandle({
    req: fakeReq(),
    op,
    db: exact,
    body: { action: 'audit_log', to: '2026-09-02T12:00:00Z' },
  });
  const exactCall = exact.calls.find((c) => c.table === 'admin_audit_log' && c.countMode);
  assert.match(exactCall.filters.find(([o, c]) => o === 'lte' && c === 'created_at')[2], /^2026-09-02T12:00:00/);
  _resetActorCacheForTests();
});

test('stable-admin audit_log: an unusable target filter is a 400, never a silent no-op', async () => {
  _resetActorCacheForTests();
  const db = fakeDb({ admin_audit_log: { rows: [] }, profiles: { rows: [] } });
  const op = opFor(db, { permissions: [PERMISSIONS.AUDIT_READ] });
  await assert.rejects(
    stableHandle({ req: fakeReq(), op, db, body: { action: 'audit_log', targetType: 'x'.repeat(200) } }),
    (err) => err.status === 400 && /Target Type/.test(err.message)
  );
  await assert.rejects(
    stableHandle({ req: fakeReq(), op, db, body: { action: 'audit_log', targetId: 'y'.repeat(400) } }),
    (err) => err.status === 400 && /Target Id/.test(err.message)
  );
  _resetActorCacheForTests();
});

// ---------------------------------------------------------------- contracts

const EMOJI_RE = new RegExp(
  '[' +
    '\\u{1F000}-\\u{1FAFF}' +
    '\\u{1F1E6}-\\u{1F1FF}' +
    '\\u2190-\\u21FF' +
    '\\u2300-\\u27BF' +
    '\\u2B00-\\u2BFF' +
    '\\uFE0F' +
    ']',
  'u'
);
// Written as an escape so this file is itself pure ASCII and cannot trip the
// same scanner it implements.
const EM_DASH = '\u2014';

const PHASE2_FILES = [
  path.join(ROOT, 'src', 'lib', 'horses', 'permissions.js'),
  path.join(ROOT, 'src', 'lib', 'horses', 'operatorAuth.js'),
  path.join(ROOT, 'src', 'lib', 'horses', 'approvals.js'),
  path.join(ROUTE_DIR, 'operator-admin.js'),
  path.join(ROUTE_DIR, 'mint.js'),
  path.join(ROUTE_DIR, 'stable-admin.js'),
];

test('contract: mint calls requireApproval BEFORE the money RPC and marks it executed after', () => {
  const text = source(path.join(ROUTE_DIR, 'mint.js'));
  const iRequest = text.indexOf('await requireApproval(');
  const iMint = text.indexOf("db.rpc('fn_ca_mint'");
  const iBurn = text.indexOf("db.rpc('fn_ca_burn'");
  const iMark = text.indexOf('await markApprovalExecuted(');
  assert.ok(iRequest > -1, 'mint must call requireApproval');
  assert.ok(iMint > -1 && iBurn > -1);
  assert.ok(iRequest < iMint, 'requireApproval must run before fn_ca_mint');
  assert.ok(iRequest < iBurn, 'requireApproval must run before fn_ca_burn');
  assert.ok(iMark > iMint && iMark > iBurn, 'markApprovalExecuted must run after the money moved');
  assert.match(text, /approvalPendingResponse\(/, 'the 202 must come from the shared helper');
  // The approval and the RPC must be given the same idempotency key.
  assert.match(text, /opId,\n\s*payload:/, 'the approval carries the opId');
});

test('contract: the cashout route is wired the same way and keeps its own auth', () => {
  const file = path.join(ROOT, 'pages', 'api', 'club-arena', 'approve-cashout.js');
  const text = source(file);
  const iRequest = text.indexOf('await requireApproval(');
  const iRpc = text.indexOf("rpc('fn_approve_cashout_atomic'");
  const iMark = text.indexOf('await markApprovalExecuted(');
  assert.ok(iRequest > -1 && iRpc > -1 && iMark > -1);
  assert.ok(iRequest < iRpc, 'requireApproval must run before the cashout RPC');
  assert.ok(iMark > iRpc, 'markApprovalExecuted must run after it');
  assert.match(text, /kind: 'cashout'/);
  // Minimal diff: this route still verifies its own caller, by design.
  assert.match(text, /getServerUserWithFallback/, 'the club-arena route keeps its own auth');
  assert.match(text, /loadOperatorPolicy\(/, 'it must read the policy the same way the console does');
  // The cancel branch stays ungated: blocking a refund would be a narrowing.
  const cancelIndex = text.indexOf("if (action === 'cancel')");
  assert.ok(cancelIndex > -1);
  assert.equal(
    text.indexOf('await requireApproval(', cancelIndex),
    -1,
    'returning a player their own chips must never need a second operator'
  );
});

/**
 * generate-avatars is the one documented exception: it has TWO doors, an
 * operator JWT and the cron secret, so its default export dispatches between
 * them before either reaches the wrapper. Its JWT path still goes through
 * withOperatorRoute's guarantees.
 */
const WRAPPER_EXEMPT = new Set(['generate-avatars.js']);

test('contract: every /horses route including operator-admin goes through the wrapper', () => {
  const files = fs.readdirSync(ROUTE_DIR).filter((f) => f.endsWith('.js') && !WRAPPER_EXEMPT.has(f));
  assert.ok(files.includes('operator-admin.js'), 'the new route must be in the sweep');
  for (const file of files) {
    const text = source(path.join(ROUTE_DIR, file));
    // withHgOperatorRoute IS withOperatorRoute plus a caller-scoped client; it
    // is the same auth, the same envelope and the same permission check.
    assert.match(text, /with(Hg)?OperatorRoute\(/, `${file} must use the operator wrapper`);
    assert.match(text, /export const spec\s*=/, `${file} must export spec`);
    assert.match(text, /export async function handle\(/, `${file} must export handle`);
    assert.match(
      text,
      /export default with(Hg)?OperatorRoute\(spec, handle\);/,
      `${file} default export`
    );
    assert.doesNotMatch(text, /NEXT_PUBLIC_SUPABASE_ANON_KEY/, `${file} must not fall back to the anon key`);
    assert.doesNotMatch(text, /ADMIN_ROLES/, `${file} must not carry its own role list`);
  }
  assert.match(
    source(path.join(ROOT, 'src', 'lib', 'horses', 'hgOperator.js')),
    /withOperatorRoute\(/,
    'the hg wrapper must itself be the operator wrapper'
  );
});

test('contract: no money route reaches its RPC without the approvals wrapper', () => {
  const mint = source(path.join(ROUTE_DIR, 'mint.js'));
  // Exactly one call site each, so a second unguarded path cannot be added
  // without this test noticing.
  assert.equal((mint.match(/db\.rpc\('fn_ca_mint'/g) || []).length, 1);
  assert.equal((mint.match(/db\.rpc\('fn_ca_burn'/g) || []).length, 1);
  assert.equal((mint.match(/await requireApproval\(/g) || []).length, 1);
  const cashout = source(path.join(ROOT, 'pages', 'api', 'club-arena', 'approve-cashout.js'));
  assert.equal((cashout.match(/rpc\('fn_approve_cashout_atomic'/g) || []).length, 1);
  assert.equal((cashout.match(/await requireApproval\(/g) || []).length, 1);
});

test('contract: the Phase 2 files obey the house rules', () => {
  for (const file of PHASE2_FILES) {
    const text = source(file);
    assert.doesNotMatch(text, /\.single\(/, `${file} must use .maybeSingle()`);
    assert.equal(text.includes(EM_DASH), false, `${file} must not contain an em dash`);
    assert.equal(EMOJI_RE.test(text), false, `${file} must not contain an emoji`);
  }
  // Section 0, stated in the code and not only in the contract.
  const auth = source(path.join(ROOT, 'src', 'lib', 'horses', 'operatorAuth.js'));
  assert.match(auth, /fails OPEN|fail-open|fail open/i, 'the fail-open rule must be written down');
  const approvals = source(path.join(ROOT, 'src', 'lib', 'horses', 'approvals.js'));
  assert.match(approvals, /NEVER THROWS/);
});

/**
 * B-1 AS A PROPERTY OF THE SOURCE. An approval that is approved and then never
 * executed is the shape of the blocker this phase shipped with, and it is
 * invisible to any test that stubs the executor out.
 */
test('contract: operator-admin reads the stored payload and re-drives the money RPC', () => {
  const text = source(path.join(ROUTE_DIR, 'operator-admin.js'));
  assert.match(text, /payload/, 'the executor must read ca_operator_approvals.payload');
  assert.match(text, /APPROVAL_EXECUTION_FIELDS/, 'the execution read asks for the payload explicitly');
  assert.match(text, /payloadFor\(kind\)\(row\.payload, row\.op_id\)/, 'the payload is validated, and against the ROW op_id');
  assert.match(text, /db\.rpc\(shaped\.rpc, shaped\.args\)/, 'the stored payload is what reaches the RPC');
  assert.match(text, /await markApprovalExecuted\(/, 'the row is closed out after the money moves');
  assert.match(text, /'operator\.execute_approval'/, 'the execution is audited separately from the decision');
  // The payload never leaves for the browser on the queue read.
  assert.doesNotMatch(
    text,
    /const APPROVAL_FIELDS =\s*\n?[^;]*payload/,
    'the queue must not ship the stored payload to the console'
  );
  const iValidate = text.indexOf('payloadFor(kind)(row.payload');
  const iRpc = text.indexOf('db.rpc(shaped.rpc, shaped.args)');
  assert.ok(iValidate > -1 && iRpc > iValidate, 'validation must come before the call');
});

test('contract: operator-admin permissions are exactly what the contract says', () => {
  const text = source(path.join(ROUTE_DIR, 'operator-admin.js'));
  assert.match(text, /grant_role:\s*PERMISSIONS\.ADMIN_MANAGE/);
  assert.match(text, /revoke_role:\s*PERMISSIONS\.ADMIN_MANAGE/);
  assert.match(text, /set_policy:\s*PERMISSIONS\.ADMIN_MANAGE/);
  assert.match(text, /staff:\s*PERMISSIONS\.CONSOLE_READ/);
  assert.match(text, /roles:\s*PERMISSIONS\.CONSOLE_READ/);
  assert.match(text, /policy:\s*PERMISSIONS\.CONSOLE_READ/);
  assert.match(text, /decide_approval:\s*null/, 'decide_approval is resolved per kind');
  assert.match(text, /KIND_PERMISSION\[approval\.kind\]/);
});
