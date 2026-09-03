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
} from '../src/lib/horses/permissions.js';
import {
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
  isApprovalKind,
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
      return { data: null, error: null };
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
    assert.ok(isOperatorRole(role), `${role} must reach the console`);
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

test('resolveOperatorPermissions: a grant WIDENS a narrow profile role', async () => {
  _resetOperatorCachesForTests();
  const db = fakeDb(
    { ca_operator_policy: { rows: [{ id: true, enforce_named_roles: false }] } },
    permissionRpc({
      role: 'support',
      roles: ['support', 'finance'],
      permissions: permissionsForRole('finance'),
      source: 'both',
    })
  );
  const resolved = await resolveOperatorPermissions(db, OPERATOR_ID, 'support');
  assert.ok(hasPermission(resolved.permissions, PERMISSIONS.MONEY_WRITE), 'the finance grant must apply');
  assert.ok(hasPermission(resolved.permissions, PERMISSIONS.SUPPORT_WRITE), 'the profile role must survive');
  assert.equal(hasPermission(resolved.permissions, PERMISSIONS.ADMIN_MANAGE), false);
  assert.deepEqual(resolved.grantedRoles, ['finance']);
});

test('resolveOperatorPermissions: enforce_named_roles is the only thing that narrows', async () => {
  _resetOperatorCachesForTests();
  const granted = permissionsForRole('read_only');
  const db = fakeDb(
    { ca_operator_policy: { rows: [{ id: true, enforce_named_roles: true }] } },
    permissionRpc({ role: 'admin', roles: ['admin', 'read_only'], permissions: granted, source: 'granted' })
  );
  const resolved = await resolveOperatorPermissions(db, OPERATOR_ID, 'admin');
  assert.deepEqual(resolved.permissions, orderPermissions(granted));
  assert.equal(resolved.enforced, true);
  assert.equal(hasPermission(resolved.permissions, PERMISSIONS.MONEY_WRITE), false);
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

test('requireApproval: the local policy is a ceiling - the database cannot gate an ungated move', async () => {
  // A stale 30s cache may let a move through that a fresh read would hold. It
  // may never hold a move that today runs unimpeded. Section 0.
  const db = fakeDb({}, requestRpc({ required: true, approval_id: APPROVAL_ID, status: 'pending' }));
  const op = opFor(db, { policy: policyOf({ approvalsEnabled: false }) });
  const result = await requireApproval(op, fakeReq(), { kind: 'mint', amount: 500, opId: 'op-4' });
  assert.equal(result.required, false);
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
  assert.deepEqual(ok, { ok: true, skipped: false });
  assert.equal(calls, 1);

  // No approval id (the row was never recorded) is a skip, not a call.
  assert.deepEqual(await markApprovalExecuted(opFor(db), null, {}), { ok: false, skipped: true });
  assert.equal(calls, 1);

  // And a failure is swallowed: the chips already moved.
  const broken = fakeDb({}, {
    fn_ca_operator_mark_executed: async () => ({ data: null, error: { message: 'timeout' } }),
  });
  const { value: bad } = await quiet(() => markApprovalExecuted(opFor(broken), APPROVAL_ID, {}));
  assert.equal(bad.ok, false);
  const { value: threw } = await quiet(() => markApprovalExecuted({ db: null }, APPROVAL_ID, {}));
  assert.equal(threw.ok, false);
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

  // Default ON, because one operator cannot four-eyes anything.
  const alone = canDecideApproval(approval, OPERATOR_ID, policyOf({}));
  assert.deepEqual(alone, { allowed: true, reason: 'alone_rule' });
  assert.deepEqual(canDecideApproval(approval, OPERATOR_ID, undefined), {
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

test('mint: a refused move does not mark an approval executed', async () => {
  const db = mintDb({
    ...requestRpc({ required: false, approval_id: APPROVAL_ID, status: 'auto_approved' }),
    fn_ca_mint: async () => ({ data: { ok: false, reason: 'club_not_found' }, error: null }),
  });
  await assert.rejects(
    mintHandle({ req: fakeReq(), res: fakeRes(), op: opFor(db), db, body: mintBody(), query: {}, method: 'POST' }),
    (err) => err.status === 400
  );
  assert.ok(!db.rpcNames().includes('fn_ca_operator_mark_executed'));
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

  _resetOperatorCachesForTests();
  const db = adminDb();
  const owner = opFor(db, { role: 'owner' });
  await adminPost(db, owner, { action: 'set_policy', approvalsEnabled: true, mintThreshold: '1000' });
  const update = db.calls.find((c) => c.table === 'ca_operator_policy' && c.update);
  assert.equal(update.update.approvals_enabled, true);
  assert.equal(update.update.mint_threshold, 1000);
  assert.equal(update.update.updated_by, OPERATOR_ID);
  const audit = db.calls.find((c) => c.rpc === 'fn_log_admin_action');
  assert.equal(audit.args.p_action, 'operator.set_policy');
  assert.deepEqual(audit.args.p_details.fields.sort(), ['approvals_enabled', 'mint_threshold']);
  _resetOperatorCachesForTests();
});

test('operator-admin: decide_approval needs the permission the KIND needs', async () => {
  const rpcs = {
    fn_ca_operator_decide_approval: async () => ({ data: { ok: true, status: 'approved' }, error: null }),
  };

  // A finance operator holds money.write, so a mint approval is theirs to make.
  const financeDb = adminDb({}, rpcs);
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
  const audit = financeDb.calls.find((c) => c.rpc === 'fn_log_admin_action');
  assert.equal(audit.args.p_action, 'operator.decide_approval');
  assert.equal(audit.args.p_details.permission, PERMISSIONS.MONEY_WRITE);
  assert.equal(audit.args.p_details.kind, 'mint');
  assert.equal(audit.args.p_before_state.status, 'pending');
  assert.equal(audit.args.p_after_state.status, 'approved');

  // A support operator does not, and is refused after the row is read.
  const supportDb = adminDb({}, rpcs);
  await assert.rejects(
    adminPost(supportDb, opFor(supportDb, { role: 'support' }), {
      action: 'decide_approval',
      approvalId: APPROVAL_ID,
      decision: 'approve',
    }),
    (err) => err.status === 403 && /money\.write/.test(err.message)
  );
  assert.ok(!supportDb.rpcNames().includes('fn_ca_operator_decide_approval'));

  // And a cashout approval wants cashier.write, which finance also holds and
  // operations does not.
  const cashoutDb = adminDb(
    { ca_operator_approvals: { rows: [{ ...APPROVAL_ROW, kind: 'cashout' }], count: 1 } },
    rpcs
  );
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
  const db = adminDb({ ca_operator_approvals: { rows: [{ ...APPROVAL_ROW, requested_by: OPERATOR_ID }] } }, {
    fn_ca_operator_decide_approval: async () => ({ data: { ok: true }, error: null }),
  });
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

  // With the alone-rule on (the default, and the only way one operator ships
  // anything) the same call goes through and the audit row says the rule fired.
  const aloneDb = adminDb({ ca_operator_approvals: { rows: [{ ...APPROVAL_ROW, requested_by: OPERATOR_ID }] } }, {
    fn_ca_operator_decide_approval: async () => ({ data: { ok: true, status: 'approved' }, error: null }),
  });
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
  const audit = aloneDb.calls.find((c) => c.rpc === 'fn_log_admin_action');
  assert.equal(audit.args.p_details.alone_rule, true);
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
  // The fake applies the UPDATE to the row it hands back, so this is the
  // shape the panel reads after it saves.
  const db = adminDb({
    ca_operator_policy: {
      rows: (record) => [{ id: true, approvals_enabled: false, ...(record.update || {}) }],
    },
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
