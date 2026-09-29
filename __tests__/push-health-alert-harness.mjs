/**
 * The shared harness for push-health's Production Alerts tests (not a test
 * file itself: push-health-owner-alert-episodes.test.mjs,
 * push-health-alert-evidence.test.mjs and
 * push-health-alert-positive-evidence.test.mjs import it).
 *
 * It runs the REAL route (pages/api/cron/push-health.js) and the REAL notify
 * gateway (src/lib/notify.js), loaded from source the way
 * operational-notification-destination.test.mjs loads the gateway, against an
 * in-memory PostgREST that applies the filters, orders, limits and counts it
 * is sent. The store recorder copies fn_record_operational_alerts: one
 * all-or-nothing batch, ON CONFLICT (source, event_key) bumps delivery_count
 * and last_received_at and keeps status and payload, and the table's CHECK
 * constraints hold. Table defaults are modelled where push-health depends on
 * them (push_dispatch_runs.started_at orders the VAPID fingerprint log and
 * dates the detector's window marker).
 *
 * ONE CLOCK. The route is handed a Date whose "now" is the database's clock,
 * so a run a day later really is a day later for the zombie window, the
 * detector's window and the fingerprint log alike. After every run a day
 * passes with ordinary traffic: every active device is pushed (a device that
 * confirmed its last push confirms this one too; a silent one stays silent),
 * the dispatcher runs, and a push is delivered. A test changes any of that
 * explicitly (s.idle, s.quiet, s.dispatcherDown).
 *
 * It cannot qualify triggers, RLS or the installed functions.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash, randomUUID } from 'node:crypto';
import { ALERT_TASK_ID, withDestination } from '../src/lib/operationalAlerts.mjs';
import { filterRecentlyAlerted } from '../src/lib/push/alertCooldown.mjs';
import { selectRetirable, selectDuplicateConfirmers } from '../src/lib/pushDeviceGroups.js';
import { ALERT_OWNER_ID, ROUTED_REASON, isOwnerOperationalNotification, retryOwnerNotificationDestination }
  from '../src/lib/push/operational-push-routing.mjs';

// Loaded dynamically so these tests also run against a route that predates
// the helper, and fail there on behaviour rather than on a missing module.
export const HELPER = '../src/lib/push/pushHealthOperationalAlerts.mjs';
export const alerts = await import(HELPER).catch((error) => ({ missing: error }));
export const needHelper = () => assert.equal(alerts.missing, undefined, `${HELPER} is missing`);

export const ROUTE_SOURCE = readFileSync(new URL('../pages/api/cron/push-health.js', import.meta.url), 'utf8');
const NOTIFY_SOURCE = readFileSync(new URL('../src/lib/notify.js', import.meta.url), 'utf8');
export const SOURCE = 'worldhub.push-health';
export const OWNER = ALERT_OWNER_ID;
export const ADMIN_A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
export const ADMIN_B = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
export const PLAYER = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
export const PUBLIC_KEY = 'test-vapid-public-key';
export const fingerprintOf = (key) => createHash('sha256').update(key).digest('hex').slice(0, 16);
export const FINGERPRINT = fingerprintOf(PUBLIC_KEY);
export const SECOND = 1000, MIN = 60_000, HOUR = 3600_000, DAY = 86400_000;
export const DETECT = 'PushHealthNoticeAddressedToOwnerAccount';
export const CHECK_FAILED = 'PushHealthCheckFailed';
export const TODAY = ['1 zombie subscription(s) across 1 user(s)', '1 staff account(s) cannot receive push'];
export const clone = (value) => (value === undefined ? undefined : JSON.parse(JSON.stringify(value)));
const iso = (ms) => new Date(ms).toISOString();
// A timestamptz as the database renders it into jsonb in UTC, the way every
// captured original holds created_at: '+00:00', trailing zeros trimmed.
export const pgUtc = (at) => {
  const [head, fraction] = new Date(at).toISOString().slice(0, -1).split('.');
  const digits = fraction.replace(/0+$/, '');
  return `${head}${digits ? `.${digits}` : ''}+00:00`;
};

const NOTIFY_IMPORTS = ['randomUUID', 'enqueuePush', 'isOwnerOperationalNotification',
  'retryOwnerNotificationDestination', 'ROUTED_REASON', 'ALERT_TASK_ID'];

export const importsOf = (source) => {
  const imported = {};
  for (const [, names, from] of source.matchAll(/^import \{([^}]+)\} from '([^']+)';$/gm)) {
    for (const name of names.split(',').map((part) => part.trim()).filter(Boolean)) imported[name] = from;
  }
  return imported;
};

// ---- An in-memory PostgREST ------------------------------------------------
const rank = (v) => (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}T/.test(v) ? Date.parse(v) : v);
// A column compares as its type; `col->>key` is text, so PostgREST compares it
// as text (lexicographically), never as a timestamp.
const order = (v, column) => (column.includes('->>') ? (v == null ? v : String(v)) : rank(v));
// `col`, `col->key` (json) and `col->>key` (text), as PostgREST reads them.
const cell = (row, column) => {
  const [, base, arrow, key] = column.match(/^([^-]+)(?:(->>?)(.+))?$/);
  if (!arrow) return row[base];
  const v = row[base]?.[key];
  if (v === undefined || v === null) return null;
  return arrow === '->>' ? (typeof v === 'object' ? JSON.stringify(v) : String(v)) : clone(v);
};
const project = (row, spec) => {
  const [alias, column] = spec.includes(':') ? spec.split(':') : [null, spec];
  return [alias || column.split(/->>?/).pop(), cell(row, column)];
};
const TEST = {
  eq: (v, x) => v === x,
  in: (v, xs) => xs.includes(v),
  gt: (v, x, column) => v != null && order(v, column) > order(x, column),
  gte: (v, x, column) => v != null && order(v, column) >= order(x, column),
  lt: (v, x, column) => v != null && order(v, column) < order(x, column),
  is: (v, x) => (x === null ? v == null : v === x),
};
// Column defaults the route relies on, per table.
const DEFAULTS = {
  notifications: (db) => ({ id: randomUUID(), created_at: db.clock() }),
  push_dispatch_runs: (db) => ({ id: randomUUID(), started_at: db.clock() }),
  push_outbox: (db) => ({ id: randomUUID(), created_at: db.clock() }),
};

export function database(seed, { storeOnly = false } = {}) {
  const tables = { notifications: [], push_outbox: [], push_subscriptions: [], profiles: [], push_dispatch_runs: [],
    operational_alert_events: [], operational_notification_destinations: [], cron_health_log: [], ...clone(seed) };
  let offset = 0;
  const now = () => Date.now() + offset;
  let last = now();
  const clock = () => { last = Math.max(now(), last + 1); return iso(last); };
  let serial = 1;
  const attempts = [];
  const recorded = [];
  const db = { tables, attempts, recorded, clock, now, later: (ms = DAY) => { offset += ms; },
    fail: () => null, failRecord: null, vapidKey: PUBLIC_KEY, pushConfigured: true, maxRows: null,
    env: { NEXT_PUBLIC_VAPID_PUBLIC_KEY: PUBLIC_KEY } };

  // fn_record_operational_alert, with the table's CHECK constraints.
  const check = (e) => {
    assert.ok(e && typeof e === 'object', 'event is an object');
    assert.ok(e.source?.length >= 1 && e.source.length <= 120, 'source length');
    assert.ok(e.event_key?.length >= 1 && e.event_key.length <= 512, 'event_key length');
    assert.ok(e.alertname?.length >= 1 && e.alertname.length <= 240, 'alertname length');
    assert.ok(['firing', 'resolved', 'info'].includes(e.status), 'status');
    assert.ok(e.severity?.length >= 1 && e.severity.length <= 40, 'severity length');
    assert.ok(e.payload && typeof e.payload === 'object' && !Array.isArray(e.payload), 'payload object');
    assert.ok(JSON.stringify(e.payload).length <= 262144, 'payload size');
  };
  const recordEvent = (e) => {
    const at = clock();
    const existing = tables.operational_alert_events.find((r) => r.source === e.source && r.event_key === e.event_key);
    if (existing) { existing.last_received_at = at; existing.delivery_count += 1; return existing.id; }
    const row = { id: serial++, source: e.source, event_key: e.event_key, alertname: e.alertname, status: e.status,
      severity: e.severity, payload: clone(e.payload), received_at: at, last_received_at: at, delivery_count: 1,
      investigation_status: 'new', investigation: {} };
    tables.operational_alert_events.push(row);
    return row.id;
  };
  db.recordEvent = (e) => { check(e); return recordEvent(e); };
  // recordOperationalAlerts, then fn_record_operational_alerts. The writer
  // addresses every payload with the real withDestination (which refuses a
  // foreign target since #2013); the function is one statement, so all or
  // nothing.
  db.record = async (raw) => {
    const events = raw.map((event) => (event && typeof event === 'object'
      ? { ...event, payload: withDestination(event.payload) } : event));
    recorded.push(clone(events));
    if (db.failRecord) throw new Error(db.failRecord);
    assert.ok(Array.isArray(events) && events.length >= 1 && events.length <= 200, 'expected 1 to 200 alert events');
    events.forEach(check);
    return events.map(recordEvent);
  };

  function execute(req) {
    const failure = db.fail(req);
    if (failure === 'throw') return Promise.reject(new Error('socket hang up'));
    if (failure) return Promise.resolve({ data: null, count: null, error: { message: failure } });
    const rows = tables[req.table] || (tables[req.table] = []);
    const match = (row) => req.filters.every(([op, column, value, negate]) =>
      TEST[op](cell(row, column), value, column) !== Boolean(negate));
    if (req.op === 'insert') {
      const value = { ...(DEFAULTS[req.table]?.(db) || {}), ...req.payload };
      attempts.push({ table: req.table, row: clone(value) });
      if (req.table === 'notifications') {
        let keep = true;
        // zz_capture_owner_notification_destination: the classifier captures an
        // owner-operational original; store-only delivery keeps no personal row.
        if (isOwnerOperationalNotification(value.user_id, value)) {
          const original = { ...clone(value), created_at: pgUtc(value.created_at) };
          const eventId = recordEvent({ source: 'owner-operational-notifications', event_key: value.id,
            alertname: `${value.type}:${value.title}`, status: 'firing', severity: 'warning',
            payload: { original_notification: original, target_task_id: ALERT_TASK_ID } });
          tables.operational_notification_destinations.push({ notification_id: value.id, recipient_user_id: value.user_id,
            target_task_id: ALERT_TASK_ID, original_notification: clone(original), inbox_event_id: eventId,
            captured_at: value.created_at });
          keep = !storeOnly;
        }
        if (keep) rows.push(value);
        return Promise.resolve({ data: req.returning ? (keep ? [{ id: value.id }] : []) : null, error: null });
      }
      rows.push(value);
      return Promise.resolve({ data: null, error: null });
    }
    if (req.op === 'update') {
      // One statement: the rows that match are changed, and only those come
      // back (a conditional update another request already won returns none).
      const hit = rows.filter(match);
      hit.forEach((row) => Object.assign(row, req.payload));
      const back = req.returning ? req.returning.split(',').map((c) => c.trim()) : null;
      return Promise.resolve({ data: back ? hit.map((row) => clone(Object.fromEntries(back.map((spec) => project(row, spec)))))
        : null, error: null });
    }
    let found = rows.filter(match);
    for (const [column, ascending] of [...req.orders].reverse()) {
      found = [...found].sort((a, b) => {
        const x = order(cell(a, column), column), y = order(cell(b, column), column);
        return (x < y ? -1 : x > y ? 1 : 0) * (ascending ? 1 : -1);
      });
    }
    const total = found.length;
    if (req.limit !== null) found = found.slice(0, req.limit);
    // PostgREST's db-max-rows: a longer answer is cut off, silently; only an
    // exact count shows it. A function caps one request at a time.
    const cap = typeof db.maxRows === 'function' ? db.maxRows(req) : db.maxRows;
    if (cap !== null && cap !== undefined) found = found.slice(0, cap);
    const specs = req.columns === '*' ? null : req.columns.split(',').map((c) => c.trim());
    const data = found.map((row) => clone(specs ? Object.fromEntries(specs.map((spec) => project(row, spec))) : row));
    if (req.head) return Promise.resolve({ data: null, count: total, error: null });
    if (req.single) {
      if (data.length > 1) return Promise.resolve({ data: null, error: { message: 'multiple rows' } });
      return Promise.resolve({ data: data[0] ?? null, error: null });
    }
    return Promise.resolve({ data, count: req.count ? total : null, error: null });
  }

  db.requests = [];
  db.from = (table) => {
    const req = { table, op: 'select', filters: [], orders: [], limit: null, columns: '*', count: null, head: false,
      payload: null, returning: null, single: false, bounded: false };
    db.requests.push(req);
    const builder = {
      select(columns = '*', options = {}) {
        if (req.op === 'select') { req.columns = columns; req.count = options.count || null; req.head = Boolean(options.head); }
        else req.returning = columns;
        return builder;
      },
      insert(payload) { req.op = 'insert'; req.payload = payload; return builder; },
      update(payload) { req.op = 'update'; req.payload = payload; return builder; },
      eq(column, value) { req.filters.push(['eq', column, value]); return builder; },
      in(column, values) { req.filters.push(['in', column, values]); return builder; },
      gt(column, value) { req.filters.push(['gt', column, value]); return builder; },
      gte(column, value) { req.filters.push(['gte', column, value]); return builder; },
      lt(column, value) { req.filters.push(['lt', column, value]); return builder; },
      is(column, value) { req.filters.push(['is', column, value]); return builder; },
      not(column, op, value) { req.filters.push([op, column, value, true]); return builder; },
      order(column, { ascending = true } = {}) { req.orders.push([column, ascending]); return builder; },
      limit(count) { req.limit = count; return builder; },
      abortSignal(signal) { req.bounded = signal instanceof AbortSignal && !signal.aborted; return builder; },
      maybeSingle() { req.single = true; return execute(req); },
      then(resolve, reject) { return execute(req).then(resolve, reject); },
    };
    return builder;
  };
  db.rpc = () => ({ abortSignal: () => Promise.resolve({ data: null, error: { message: 'no rpc in this harness' } }) });
  return db;
}

// ---- The real gateway and the real route, loaded from source ----------------
export function gateway(phone) {
  const imported = Object.keys(importsOf(NOTIFY_SOURCE)).sort();
  assert.deepEqual(imported, [...NOTIFY_IMPORTS].sort(), 'notify.js imports changed: update this harness');
  const deps = {
    randomUUID,
    enqueuePush: async (_client, args) => { phone.push({ userId: args.userId, event: args.event, title: args.title }); return { sent: true }; },
    isOwnerOperationalNotification, retryOwnerNotificationDestination, ROUTED_REASON, ALERT_TASK_ID,
    console: { warn() {} },
  };
  const source = NOTIFY_SOURCE.replace(/^import[^\n]+;\s*$/gm, '')
    .replace(/^export default[^\n]+;\s*$/gm, '').replace(/^export /gm, '');
  return new Function(...Object.keys(deps), `${source}\nreturn { notify, notifyAdmins };`)(...Object.values(deps));
}

// The database's clock as the route's Date: Date.now() and new Date() read it.
function clockDate(db) {
  return class ClockDate extends Date {
    constructor(...args) { if (args.length) super(...args); else super(db.now()); }
    static now() { return db.now(); }
  };
}

// `source` lets a test run another version of the route (a differential).
export function route(db, { notify, notifyAdmins }, { source = ROUTE_SOURCE, helper: loaded = alerts } = {}) {
  const helper = loaded.missing ? {} : {
    ...loaded,
    // The real helper; only the store transport is the in-memory recorder and
    // "now" is the database clock.
    recordPushHealthAlerts: (client, conditions) => loaded.recordPushHealthAlerts(client, conditions,
      { record: db.record, now: db.now() }),
    observeOwnerAddressedNotices: (client, health) => loaded.observeOwnerAddressedNotices(client, health, { now: db.now() }),
  };
  const available = {
    createHash, createClient: () => db, selectRetirable, selectDuplicateConfirmers,
    validateCronAuth: () => true, withCronHealth: (_name, handler) => handler,
    vapidConfig: () => ({ publicKey: db.vapidKey }), isPushConfigured: () => db.pushConfigured,
    notify, notifyAdmins, filterRecentlyAlerted, ...helper,
  };
  const imported = Object.keys(importsOf(source));
  assert.deepEqual(imported.filter((name) => !(name in available)), [], 'the route imports what this harness cannot provide');
  const deps = { Date: clockDate(db), process: { env: db.env },
    ...Object.fromEntries(imported.map((name) => [name, available[name]])) };
  const body = source.replace(/^import[^\n]+;\s*$/gm, '').replace(/^export default[^\n]+;\s*$/gm, '');
  return new Function(...Object.keys(deps), `${body}\nreturn handler;`)(...Object.values(deps));
}

export const subscription = (id, userId, at, { receipt = true, created = at - 10 * DAY, used = at - HOUR } = {}) => ({
  id, user_id: userId, device_label: `device ${id}`, device_id: id, endpoint: `https://push.example/${id}`,
  user_agent: `agent ${id}`, last_used_at: used === null ? null : iso(used),
  last_receipt_at: receipt === true ? iso(used + SECOND) : receipt === false ? null : receipt,
  created_at: iso(created), is_active: true,
});

// Production's daily shape since 2026-09-17: one silent player device and one
// staff account with no device; the owner account's phone is fine.
export function world(at = Date.now()) {
  return {
    profiles: [{ id: OWNER, username: 'owner', role: 'god' }, { id: ADMIN_A, username: 'a', role: 'admin' },
      { id: ADMIN_B, username: 'b', role: 'admin' }, { id: PLAYER, username: 'p', role: 'user' }],
    push_subscriptions: [subscription('owner-phone', OWNER, at), subscription('admin-a-phone', ADMIN_A, at),
      subscription('player-phone', PLAYER, at, { receipt: false })],
    push_dispatch_runs: [{ job: 'push-dispatch', slot: iso(at - 5 * MIN), started_at: iso(at - 5 * MIN) },
      { job: 'vapid-fingerprint', slot: iso(at - DAY), note: FINGERPRINT, started_at: iso(at - DAY) }],
    push_outbox: [{ id: 'sent-1', recipient_user_id: ADMIN_A, event: 'new_message', title: 'Message', status: 'sent',
      sent_at: iso(at - HOUR), created_at: iso(at - HOUR) }],
    cron_health_log: [{ cron_name: 'push-health', last_run_at: iso(at - DAY), last_status: 'success', last_duration_ms: 1500 }],
  };
}

export function scenario({ seed = world(), storeOnly = false, source, helper } = {}) {
  const db = database(seed, { storeOnly });
  const phone = [];
  const handler = route(db, gateway(phone), { source, helper });
  const s = {
    db, phone,
    idle: new Set(),       // devices nobody pushes to from now on
    quiet: false,          // no push is delivered to anyone
    dispatcherDown: false, // push-dispatch stops running
    ago: (ms) => iso(db.now() - ms),
    // A day of ordinary traffic before the next run (see the header).
    day(ms = DAY) {
      db.later(ms);
      const at = db.now() - HOUR;
      for (const row of db.tables.push_subscriptions) {
        if (!row.is_active || s.idle.has(row.id) || s.quiet) continue;
        const confirms = row.last_receipt_at && rank(row.last_receipt_at) >= rank(row.last_used_at);
        row.last_used_at = iso(at);
        if (confirms) row.last_receipt_at = iso(at + SECOND);
      }
      if (!s.dispatcherDown) {
        db.tables.push_dispatch_runs.push({ id: randomUUID(), job: 'push-dispatch', slot: iso(db.now() - 5 * MIN),
          started_at: iso(db.now() - 5 * MIN) });
      }
      if (!s.quiet) {
        db.tables.push_outbox.push({ id: randomUUID(), recipient_user_id: ADMIN_A, event: 'new_message', title: 'Message',
          status: 'sent', sent_at: iso(at), created_at: iso(at) });
      }
    },
    async run({ then = 'day' } = {}) {
      const res = { statusCode: 200, status(code) { this.statusCode = code; return this; }, json(body) { this.body = body; return this; } };
      const started = db.now();
      await handler({ headers: {}, query: {} }, res);
      // What withCronHealth records as the response is flushed.
      const log = db.tables.cron_health_log.find((r) => r.cron_name === 'push-health');
      const record = { last_run_at: db.clock(), last_status: res.statusCode >= 400 ? 'error' : 'success',
        last_duration_ms: Math.max(1, db.now() - started) };
      if (log) Object.assign(log, record); else db.tables.cron_health_log.push({ cron_name: 'push-health', ...record });
      if (then === 'day') s.day();
      return res;
    },
  };
  return s;
}

// ---- Reading the outcome ----------------------------------------------------
export const addressed = (s, userId) => s.db.attempts.filter((a) => a.table === 'notifications' && a.row.user_id === userId);
export const titles = (s, userId) => addressed(s, userId).map((a) => a.row.title).sort();
export const episodes = (s) => s.db.tables.operational_alert_events.filter((row) => row.source === SOURCE);
export const named = (s, alertname) => episodes(s).filter((row) => row.alertname === alertname);
export const failed = (s, check) => named(s, CHECK_FAILED).filter((row) => row.payload.check === check);
export const firing = (s, alertname) => named(s, alertname).filter((row) => row.status === 'firing');
export const recoveryOf = (s, row) => episodes(s).find((r) => r.event_key === `${row.event_key}:resolved`);
export const device = (s, id) => s.db.tables.push_subscriptions.find((row) => row.id === id);
// The device confirms its latest push (and, being alive, every later one).
export const confirm = (s, id) => { device(s, id).last_receipt_at = s.ago(0); };
