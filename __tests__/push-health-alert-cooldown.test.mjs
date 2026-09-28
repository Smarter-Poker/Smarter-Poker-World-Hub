import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { filterRecentlyAlerted } from '../src/lib/push/alertCooldown.mjs';
import { ALERT_OWNER_ID } from '../src/lib/push/operational-push-routing.mjs';

// Store-only delivery (Club Arena migration 20260927235053) writes no personal
// row for the owner account's operational notices, so push-health's
// once-per-window cooldown must also find the routed original, or the owner's
// copy is re-sent to the Production Alerts task on every run.
const OTHER = '22222222-2222-4222-8222-222222222222';
const THIRD = '55555555-5555-4555-8555-555555555555';
const TITLE = 'Notifications May Not Be Reaching This Device';
const SINCE = '2026-09-20T13:00:00.000Z';
const INSIDE = '2026-09-21T13:00:00.000Z';
const BEFORE = '2026-09-19T13:00:00.000Z';
const DESTINATIONS = 'operational_notification_destinations';

const personal = (userId, { title = TITLE, at = INSIDE } = {}) => ({ user_id: userId, title, created_at: at });
const routed = ({ title = TITLE, at = INSIDE, receipt = 100 } = {}) => ({
  recipient_user_id: ALERT_OWNER_ID, original_notification: { type: 'system', title },
  captured_at: at, inbox_event_id: receipt,
});

// A small PostgREST stand-in. It keeps rows per table and applies the filters
// the caller actually sends, so a dropped or changed filter changes the answer
// instead of passing unnoticed. `fail[table]` makes that table's read fail:
// 'error' (PostgREST refused), 'throw' (the request rejected) or 'malformed'.
function client({ notifications = [], destinations = [], fail = {} } = {}) {
  const reads = [];
  const tables = { notifications, [DESTINATIONS]: destinations };
  return {
    reads,
    from(table) {
      const read = { table, filters: [] };
      reads.push(read);
      const value = (row, column) => {
        const [base, key] = column.split('->>');
        return key === undefined ? row[base] : row[base]?.[key];
      };
      let rows = [...(tables[table] || [])];
      const chain = {
        select(columns) { read.columns = columns; return chain; },
        in(column, values) {
          read.filters.push(['in', column, values]);
          rows = rows.filter((row) => values.includes(value(row, column)));
          return chain;
        },
        eq(column, wanted) {
          read.filters.push(['eq', column, wanted]);
          rows = rows.filter((row) => value(row, column) === wanted);
          return chain;
        },
        gte(column, since) {
          read.filters.push(['gte', column, since]);
          rows = rows.filter((row) => Date.parse(value(row, column)) >= Date.parse(since));
          return chain;
        },
        not(column, operator, operand) {
          read.filters.push(['not', column, operator, operand]);
          assert.equal(operator, 'is');
          assert.equal(operand, null);
          rows = rows.filter((row) => value(row, column) != null);
          return chain;
        },
        limit(count) { read.filters.push(['limit', count]); rows = rows.slice(0, count); return chain; },
        then(resolve, reject) {
          if (fail[table] === 'throw') return Promise.reject(new Error('network')).then(resolve, reject);
          if (fail[table] === 'error') return Promise.resolve({ data: null, error: { message: 'refused' } }).then(resolve, reject);
          if (fail[table] === 'malformed') return Promise.resolve({ data: { rows }, error: null }).then(resolve, reject);
          const columns = String(read.columns).split(',');
          const data = rows.map((row) => Object.fromEntries(columns.map((c) => [c, row[c]])));
          return Promise.resolve({ data, error: null }).then(resolve, reject);
        },
      };
      return chain;
    },
  };
}

const tablesRead = (db) => db.reads.map((read) => read.table);

test('a receipted routed owner copy inside the window counts as already told', async () => {
  const db = client({ destinations: [routed()] });
  assert.deepEqual(await filterRecentlyAlerted(db, [ALERT_OWNER_ID, OTHER], TITLE, SINCE), [OTHER]);
  const routedRead = db.reads.find((read) => read.table === DESTINATIONS);
  assert.deepEqual(routedRead.filters, [
    ['eq', 'recipient_user_id', ALERT_OWNER_ID],
    ['eq', 'original_notification->>title', TITLE],
    ['gte', 'captured_at', SINCE],
    ['not', 'inbox_event_id', 'is', null],
    ['limit', 1],
  ]);
});

test('a pending routed copy (no receipt recorded yet) is not already told: the owner is alerted', async () => {
  const db = client({ destinations: [routed({ receipt: null })] });
  assert.deepEqual(await filterRecentlyAlerted(db, [ALERT_OWNER_ID, OTHER], TITLE, SINCE), [ALERT_OWNER_ID, OTHER]);
  assert.deepEqual(tablesRead(db), ['notifications', DESTINATIONS]);
});

test('a routed copy from before the window, or with another title, does not count', async () => {
  const db = client({ destinations: [routed({ at: BEFORE }), routed({ title: 'Push Health Alert' })] });
  assert.deepEqual(await filterRecentlyAlerted(db, [ALERT_OWNER_ID], TITLE, SINCE), [ALERT_OWNER_ID]);
});

test('a personal copy inside the window counts as already told, for anyone', async () => {
  const db = client({ notifications: [personal(OTHER), personal(THIRD, { at: BEFORE })] });
  assert.deepEqual(await filterRecentlyAlerted(db, [ALERT_OWNER_ID, OTHER, THIRD], TITLE, SINCE),
    [ALERT_OWNER_ID, THIRD]);
  const inboxRead = db.reads.find((read) => read.table === 'notifications');
  assert.deepEqual(inboxRead.filters, [
    ['in', 'user_id', [ALERT_OWNER_ID, OTHER, THIRD]], ['eq', 'title', TITLE], ['gte', 'created_at', SINCE],
  ]);
});

test('without the owner in the list the destinations table is never read', async () => {
  const db = client({ notifications: [personal(OTHER)], destinations: [routed()], fail: { [DESTINATIONS]: 'throw' } });
  assert.deepEqual(await filterRecentlyAlerted(db, [OTHER, THIRD], TITLE, SINCE), [THIRD]);
  assert.deepEqual(tablesRead(db), ['notifications']);
});

test('when the inbox already shows the owner told, the destinations table is not read', async () => {
  const db = client({ notifications: [personal(ALERT_OWNER_ID)], fail: { [DESTINATIONS]: 'throw' } });
  assert.deepEqual(await filterRecentlyAlerted(db, [ALERT_OWNER_ID, OTHER], TITLE, SINCE), [OTHER]);
  assert.deepEqual(tablesRead(db), ['notifications']);
});

test('nobody told inside the window: everyone is alerted', async () => {
  const db = client();
  assert.deepEqual(await filterRecentlyAlerted(db, [ALERT_OWNER_ID, OTHER], TITLE, SINCE), [ALERT_OWNER_ID, OTHER]);
});

for (const mode of ['error', 'throw', 'malformed']) {
  test(`destinations read ${mode}: only the owner fails open, everyone else keeps the inbox verdict`, async () => {
    // The routed copy would have said "told"; the failed read must not
    // silence the owner, and must not re-send what the inbox proved sent.
    const db = client({ notifications: [personal(OTHER)], destinations: [routed()], fail: { [DESTINATIONS]: mode } });
    assert.deepEqual(await filterRecentlyAlerted(db, [ALERT_OWNER_ID, OTHER, THIRD], TITLE, SINCE),
      [ALERT_OWNER_ID, THIRD]);
    assert.deepEqual(tablesRead(db), ['notifications', DESTINATIONS]);
  });

  test(`inbox read ${mode}: everyone fails open, a lookup failure never silences an alert`, async () => {
    const db = client({ notifications: [personal(OTHER)], destinations: [routed()], fail: { notifications: mode } });
    assert.deepEqual(await filterRecentlyAlerted(db, [ALERT_OWNER_ID, OTHER, THIRD], TITLE, SINCE),
      [ALERT_OWNER_ID, OTHER, THIRD]);
    assert.deepEqual(tablesRead(db), ['notifications']);
  });
}

test('no recipients: no lookup at all', async () => {
  const db = client();
  assert.deepEqual(await filterRecentlyAlerted(db, [], TITLE, SINCE), []);
  assert.equal(db.reads.length, 0);
});

test('push-health uses the shared cooldown for both per-user alerts', () => {
  const src = readFileSync(new URL('../pages/api/cron/push-health.js', import.meta.url), 'utf8');
  assert.match(src, /import \{ filterRecentlyAlerted \} from '..\/..\/..\/src\/lib\/push\/alertCooldown\.mjs';/);
  assert.equal(/async function filterRecentlyAlerted/.test(src), false, 'no private copy that reads only the inbox');
  assert.equal((src.match(/filterRecentlyAlerted\(/g) || []).length, 2);
});
