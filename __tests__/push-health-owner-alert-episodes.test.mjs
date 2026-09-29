/**
 * push-health's operational alerts for the owner account are Production Alerts
 * store episodes, never personal notices (2026-09-28).
 *
 * Before: the daily "Push Health Alert" reached the owner account as a personal
 * notice that the database classifier captured as a separate FIRING event each
 * day (event key = notification id), and no recovery was ever recorded; "Push
 * Notifications Are Off" was not classified (Club Arena migration
 * 20260928171444, held when this was written, adds it) and would land in his
 * personal inbox. Now every condition is one episode under source
 * worldhub.push-health that coalesces while it persists. One push-health
 * observes directly is resolved on the same source when it clears; one that
 * clears only when devices change, and a key rotation, are closed by the
 * Production Alerts fleet, never here (review round 4). Nothing push-health
 * sends can address him.
 *
 * These run the REAL route and the REAL notify gateway through
 * push-health-alert-harness.mjs (an in-memory PostgREST that applies the
 * filters it is sent, and one clock for the route and the database).
 * push-health-alert-evidence.test.mjs holds the review round 2 regressions and
 * push-health-alert-positive-evidence.test.mjs those of rounds 3 and 4.
 *
 * Run: node --test __tests__/push-health-owner-alert-episodes.test.mjs
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { ALERT_TASK_ID } from '../src/lib/operationalAlerts.mjs';
import { ADMIN_A, ADMIN_B, DETECT, HOUR, MIN, OWNER, PLAYER, ROUTE_SOURCE, SOURCE, TODAY, addressed, alerts,
  confirm, database, device, episodes, failed, firing, gateway, importsOf, named, needHelper, pgUtc, recoveryOf,
  scenario, subscription, titles, world } from './push-health-alert-harness.mjs';

// ---- The route --------------------------------------------------------------
test('push-health imports exactly these bindings, and names only conditions and checks that exist', () => {
  const helper = '../../../src/lib/push/pushHealthOperationalAlerts.mjs';
  assert.deepEqual(importsOf(ROUTE_SOURCE), {
    createHash: 'crypto',
    createClient: '../../../src/lib/supabaseServerClient',
    selectRetirable: '../../../src/lib/pushDeviceGroups.js',
    selectDuplicateConfirmers: '../../../src/lib/pushDeviceGroups.js',
    validateCronAuth: '../../../src/utils/cron-auth',
    withCronHealth: '../../../src/lib/cronHealth',
    vapidConfig: '../../../src/lib/push/web-push',
    isPushConfigured: '../../../src/lib/push/web-push',
    notify: '../../../src/lib/notify',
    notifyAdmins: '../../../src/lib/notify',
    filterRecentlyAlerted: '../../../src/lib/push/alertCooldown.mjs',
    ...Object.fromEntries(['CHECK', 'CONDITION', 'includesOwnerAccount', 'isOwnerAccount', 'observeOwnerAddressedNotices',
      'personalRecipients', 'pushHealthNotices', 'pushHealthObservations', 'recordPushHealthAlerts',
      'settledVapidRotations', 'vapidRotation'].map((name) => [name, helper])),
  });
  needHelper();
  for (const [, group, name] of ROUTE_SOURCE.matchAll(/\b(CONDITION|CHECK)\.([A-Z_]+)\b/g)) {
    assert.ok(Object.hasOwn(alerts[group], name), `${group}.${name} does not exist`);
  }
  // Nothing reaches the admins except through the observations.
  assert.equal(/\bproblems\.push\(/.test(ROUTE_SOURCE), false);
  assert.equal(/\bawait notify(Admins)?\(/.test(ROUTE_SOURCE), false, 'a notice bypasses pushHealthNotices');
});

for (const storeOnly of [false, true]) {
  test(`the owner account is never addressed and every other recipient keeps today's notices (${storeOnly ? 'after' : 'before'} store-only delivery is installed)`, async () => {
    const s = scenario({ storeOnly });
    const res = await s.run();
    assert.equal(res.statusCode, 200);
    assert.deepEqual(res.body.problems, TODAY);
    assert.deepEqual(titles(s, OWNER), [], 'push-health addressed the owner account personally');
    assert.deepEqual(s.phone.filter((p) => p.userId === OWNER), [], 'push-health reached the owner account phone');
    assert.deepEqual(titles(s, ADMIN_A), ['Push Health Alert']);
    assert.deepEqual(titles(s, ADMIN_B), ['Push Health Alert', 'Push Notifications Are Off']);
    assert.deepEqual(titles(s, PLAYER), ['Notifications May Not Be Reaching This Device']);
    const summary = addressed(s, ADMIN_A)[0].row;
    assert.equal(summary.message, TODAY.join(' | '));
    assert.equal(summary.type, 'system');
    assert.equal(summary.action_url, '/admin/push-health');
    assert.deepEqual(s.phone.map((p) => p.userId).sort(), [ADMIN_A, ADMIN_B].sort(), 'the summary still pushes to other admins');
    // Recorded once, directly: nothing went through the classifier capture.
    assert.deepEqual(s.db.tables.operational_notification_destinations, []);
    assert.deepEqual(s.db.tables.operational_alert_events.filter((r) => r.source !== SOURCE), []);
    assert.deepEqual(episodes(s).map((r) => r.alertname).sort(), ['PushStaffUnreachable', 'PushZombieSubscriptions']);
  });
}

test('one condition is one episode, coalesced while it persists: a device condition stays open for the fleet, a directly observed one resolves on the same source', async () => {
  const s = scenario();
  s.db.tables.push_outbox.push(...Array.from({ length: 251 }, (_, i) => ({ id: `p${i}`, status: 'pending', created_at: s.ago(MIN) })));
  const first = await s.run();
  assert.equal(first.body.operationalAlerts?.ok, true);
  const [zombies] = named(s, 'PushZombieSubscriptions');
  const [staff] = named(s, 'PushStaffUnreachable');
  const [backlog] = named(s, 'PushOutboxBacklog');
  for (const row of [zombies, staff, backlog]) {
    assert.equal(row.status, 'firing');
    assert.equal(row.payload.target_task_id, ALERT_TASK_ID);
    assert.equal(row.payload.replaces_personal_notice, 'Push Health Alert');
  }
  assert.equal(zombies.payload.summary, TODAY[0]);
  assert.deepEqual(zombies.payload.evidence, { zombies: 1, users: 1 });
  // Who closes each (review round 4).
  assert.match(zombies.payload.resolved_by, /Production Alerts fleet/);
  assert.match(staff.payload.resolved_by, /Production Alerts fleet/);
  assert.equal(backlog.payload.resolved_by, undefined);

  await s.run();
  assert.equal(episodes(s).length, 3, 'a persisting fault must coalesce, not open a new event per run');
  assert.deepEqual([zombies.delivery_count, staff.delivery_count, backlog.delivery_count], [2, 2, 2]);

  // All three clear.
  confirm(s, 'player-phone');
  s.db.tables.push_subscriptions.push(subscription('admin-b-phone', ADMIN_B, s.db.now()));
  s.db.tables.push_outbox = s.db.tables.push_outbox.filter((row) => row.status !== 'pending');
  const cleared = await s.run();
  assert.deepEqual(cleared.body.problems, []);
  assert.equal(cleared.body.operationalAlerts.resolved, 1, 'only the directly observed condition resolves here');
  const recovery = recoveryOf(s, backlog);
  assert.ok(recovery, 'PushOutboxBacklog recovery on the same source');
  assert.equal(recovery.alertname, backlog.alertname);
  assert.equal(recovery.status, 'resolved');
  assert.equal(recovery.payload.resolves, backlog.event_key);
  assert.equal(recovery.payload.resolves_event_id, backlog.id);
  assert.equal(recovery.payload.target_task_id, ALERT_TASK_ID);
  assert.equal(recoveryOf(s, zombies), undefined, 'push-health resolved a device condition');
  assert.equal(recoveryOf(s, staff), undefined, 'push-health resolved a device condition');

  await s.run();
  assert.equal(episodes(s).length, 4, 'nothing more while nothing changes');
  assert.deepEqual([zombies.delivery_count, staff.delivery_count], [2, 2], 'an absent device condition touched its episode');

  // The silent device recurs: it coalesces into the open episode, not a new one.
  device(s, 'player-phone').last_receipt_at = null;
  await s.run();
  assert.deepEqual(firing(s, 'PushZombieSubscriptions').map((row) => row.event_key), [zombies.event_key]);
  assert.equal(zombies.delivery_count, 3);

  // Only after the fleet closes it does a recurrence open a new episode, and
  // it carries nothing: a device episode has no recovery.
  zombies.investigation_status = 'verified_fixed';
  await s.run();
  const reopened = firing(s, 'PushZombieSubscriptions');
  assert.equal(reopened.length, 2);
  assert.equal(reopened[1].payload.episode_after, zombies.event_key);
  assert.equal(reopened[1].payload.unresolved, undefined);
  assert.equal(zombies.delivery_count, 3, 'a row the fleet closed was bumped');
  assert.deepEqual(titles(s, OWNER), []);
});

test('"Push Notifications Are Off" for the owner account is an episode, never his inbox, and stays open for the fleet when he re-enrols', async () => {
  const seed = world();
  seed.push_subscriptions = seed.push_subscriptions.filter((row) => row.user_id !== OWNER);
  const s = scenario({ seed });
  const res = await s.run();
  assert.deepEqual(titles(s, OWNER), [], 'the unclassified staff notice reached the owner account inbox');
  assert.equal(res.body.problems[1], '2 staff account(s) cannot receive push', 'the admins still count him');
  assert.deepEqual(titles(s, ADMIN_B), ['Push Health Alert', 'Push Notifications Are Off']);
  const [off] = named(s, 'OwnerAccountPushNotificationsOff');
  assert.equal(off?.status, 'firing');
  assert.equal(off.payload.replaces_personal_notice, 'Push Notifications Are Off');
  assert.equal(off.payload.target_task_id, ALERT_TASK_ID);
  assert.match(off.payload.resolved_by, /Production Alerts fleet/);

  s.db.tables.push_subscriptions.push(subscription('owner-new-phone', OWNER, s.db.now()));
  await s.run();
  assert.equal(recoveryOf(s, off), undefined, 'push-health resolved a condition that clears only when devices change');
  assert.equal(off.delivery_count, 1);
  assert.deepEqual(titles(s, OWNER), []);
});

test('the owner account\'s silent device is an episode, not the device notice, and his next receipt does not close it', async () => {
  const seed = world();
  seed.push_subscriptions.find((row) => row.id === 'owner-phone').last_receipt_at = null;
  const s = scenario({ seed });
  const res = await s.run();
  assert.equal(res.body.problems[0], '2 zombie subscription(s) across 2 user(s)');
  assert.deepEqual(titles(s, OWNER), []);
  assert.deepEqual(titles(s, PLAYER), ['Notifications May Not Be Reaching This Device']);
  const [silent] = named(s, 'OwnerAccountDeviceNotConfirmingPush');
  assert.equal(silent?.status, 'firing');
  assert.deepEqual(silent.payload.evidence, { ownerZombieSubscriptions: 1 });
  assert.match(silent.payload.resolved_by, /Production Alerts fleet/);

  confirm(s, 'owner-phone');
  await s.run();
  assert.equal(recoveryOf(s, silent), undefined, 'push-health resolved it on a receipt');
});

test('a condition push-health could not observe is neither coalesced nor resolved, and each failure is its own episode', async () => {
  const s = scenario();
  s.db.tables.push_outbox.push(...Array.from({ length: 251 }, (_, i) => ({ id: `p${i}`, status: 'pending', created_at: s.ago(MIN) })));
  await s.run();
  const [zombies] = named(s, 'PushZombieSubscriptions');
  const [backlog] = named(s, 'PushOutboxBacklog');
  assert.equal(backlog?.status, 'firing');

  // The zombie read fails outright; the backlog count fails silently, which
  // push-health has always read as "no backlog". Neither is a recovery.
  s.db.tables.push_outbox = s.db.tables.push_outbox.filter((row) => row.status !== 'pending');
  s.db.fail = (req) => ((req.table === 'push_subscriptions' && req.filters.some(([op, column]) => op === 'gte' && column === 'last_used_at'))
    || (req.table === 'push_outbox' && req.head && req.filters.some(([, c, v]) => c === 'status' && v === 'pending'))
    ? 'canceling statement due to statement timeout' : null);
  const res = await s.run();
  assert.equal(res.body.problems[0], 'zombie check failed: canceling statement due to statement timeout', 'admins are told as before');
  assert.equal(zombies.delivery_count, 1, 'an unobserved condition was coalesced');
  assert.equal(backlog.delivery_count, 1, 'an unobserved condition was coalesced');
  assert.equal(episodes(s).filter((r) => r.status === 'resolved').length, 0, 'a failed read became a recovery');
  const [zombieCheck] = failed(s, 'zombie');
  const [backlogCheck] = failed(s, 'PushOutboxBacklog');
  assert.equal(zombieCheck?.status, 'firing');
  assert.equal(backlogCheck?.status, 'firing');
  assert.equal(zombieCheck.payload.summary, res.body.problems[0], 'the store carries the line the admins were told');
  assert.equal(zombieCheck.payload.target_task_id, ALERT_TASK_ID);

  s.db.fail = () => null;
  await s.run();
  assert.equal(recoveryOf(s, backlog)?.status, 'resolved');
  assert.equal(recoveryOf(s, zombieCheck)?.status, 'resolved');
  assert.equal(recoveryOf(s, backlogCheck)?.status, 'resolved');
  assert.equal(zombies.delivery_count, 2);
});

test('detection: a push-health notice that reached the owner account and is not in the store yet is an episode, recovered by a clean window', async () => {
  const s = scenario();
  // Written seconds before the previous run ended, as the last run before this
  // fix wrote his daily alert: history, never a recurrence. Before push-health
  // has written to the store, the previous run bounds the window.
  const previousEnd = Date.parse(s.db.tables.cron_health_log[0].last_run_at);
  s.db.tables.notifications.push({ id: 'before-fix', user_id: OWNER, type: 'system', title: 'Push Health Alert',
    created_at: new Date(previousEnd - 5000).toISOString() });
  await s.run();
  assert.deepEqual(named(s, DETECT), [], 'history before the previous run was read as a recurrence');

  const lastWrite = Math.max(...episodes(s).map((row) => Date.parse(row.last_received_at)));
  // Written once the store acknowledged that run; its slot is when the
  // detector looked, before that write.
  const [marker] = s.db.tables.push_dispatch_runs.filter((row) => row.job === 'push-health-detector');
  assert.ok(Date.parse(marker?.slot) <= lastWrite && Date.parse(marker.started_at) >= lastWrite);
  s.db.tables.notifications.push(
    { id: 'n-off', user_id: OWNER, type: 'system', title: 'Push Notifications Are Off', created_at: s.ago(HOUR) },
    { id: 'n-other-type', user_id: OWNER, type: 'accounting_invoice', title: 'Push Health Alert', created_at: s.ago(HOUR) },
    { id: 'n-other-admin', user_id: ADMIN_A, type: 'system', title: 'Push Health Alert', created_at: s.ago(HOUR) });
  s.db.tables.push_outbox.push({ id: 'o-owner', recipient_user_id: OWNER, event: 'system', title: 'Push Health Alert',
    status: 'sent', created_at: s.ago(HOUR) });
  s.db.tables.operational_notification_destinations.push({ notification_id: 'd-owner', recipient_user_id: OWNER,
    target_task_id: ALERT_TASK_ID, inbox_event_id: 9, captured_at: s.ago(HOUR),
    original_notification: { type: 'system', title: 'Notifications May Not Be Reaching This Device', created_at: pgUtc(s.ago(HOUR)) } });
  await s.run();
  const [found] = named(s, DETECT);
  assert.equal(found?.status, 'firing');
  assert.equal(found.payload.target_task_id, ALERT_TASK_ID);
  // The window opens ten minutes before the last judged, recorded window ended.
  assert.equal(found.payload.evidence.since, new Date(Date.parse(marker.slot) - 10 * MIN).toISOString());
  assert.equal(found.payload.evidence.window_from, 'last judged window');
  assert.deepEqual(found.payload.evidence.personal_inbox, { count: 1, ids: ['n-off'] });
  assert.deepEqual(found.payload.evidence.push_outbox, { count: 1, ids: ['o-owner'] });
  assert.deepEqual(found.payload.evidence.captured_originals, { count: 1, ids: ['d-owner'] });

  await s.run();
  assert.equal(recoveryOf(s, found)?.payload.resolves, found.event_key);

  // Written moments before a run's store write: that run finds it, and so does
  // the next (it is inside the write margin), so the detection stays open one
  // run longer. It is never missed.
  s.db.tables.notifications.push({ id: 'n-late', user_id: OWNER, type: 'system', title: 'Push Health Alert', created_at: s.ago(0) });
  await s.run();
  const [, again] = firing(s, DETECT);
  assert.deepEqual(again?.payload.evidence.personal_inbox.ids, ['n-late']);
  await s.run();
  assert.equal(again.delivery_count, 2);
  await s.run();
  assert.equal(recoveryOf(s, again)?.status, 'resolved');
});

test('detection before the first store write: a window that has not opened yet is not "none found"', async () => {
  needHelper();
  const db = database(world());
  db.tables.cron_health_log[0].last_run_at = new Date(db.now() - 30_000).toISOString();
  const h = alerts.pushHealthObservations();
  await alerts.observeOwnerAddressedNotices(db, h, { now: db.now() });
  const byName = Object.fromEntries(h.conditions().map((c) => [c.check ?? c.alertname, c]));
  assert.equal(byName[DETECT].state, 'unknown');
  assert.equal(byName[DETECT].check, undefined);
});

test('a store that does not acknowledge the episodes fails the run; nobody else loses a notice and the owner account gets none', async () => {
  const s = scenario();
  s.db.failRecord = 'Operational inbox refused delivery (503)';
  const res = await s.run();
  assert.equal(res.statusCode, 500);
  assert.equal(res.body.ok, false);
  assert.equal(res.body.operationalAlerts.ok, false);
  assert.match(res.body.operationalAlerts.error, /refused delivery/);
  assert.deepEqual(titles(s, OWNER), []);
  assert.deepEqual(titles(s, ADMIN_A), ['Push Health Alert']);
});

test('an unreadable episode history fails the run instead of guessing a new episode or a recovery', async () => {
  const s = scenario();
  s.db.fail = (req) => (req.table === 'operational_alert_events' ? 'permission denied' : null);
  const res = await s.run();
  assert.equal(res.statusCode, 500);
  assert.deepEqual(s.db.recorded, []);
  assert.deepEqual(titles(s, OWNER), []);
});

// ---- The helper -------------------------------------------------------------
test('invariant: a push-health notice to the owner account is refused in any spelling; everyone else passes unchanged', async () => {
  needHelper();
  const calls = [];
  const notices = alerts.pushHealthNotices({
    notify: async (_db, args) => { calls.push(['notify', args]); return { ok: true }; },
    notifyAdmins: async (_db, args) => { calls.push(['admins', args]); return { ok: true, sent: 1 }; },
  });
  for (const userId of [OWNER, OWNER.toUpperCase(), `{${OWNER}}`, OWNER.replace(/-/g, '')]) {
    const out = await notices.toRecipient({}, { userId, type: 'system', title: 'Push Notifications Are Off' });
    assert.equal(out.refused, alerts.OWNER_NOTICE_REFUSED);
  }
  assert.deepEqual(calls, []);
  const args = { userId: ADMIN_B, type: 'system', withPush: false, title: 'Push Notifications Are Off', url: '/x' };
  await notices.toRecipient({}, args);
  await notices.toAdmins({}, { type: 'system', title: 'Push Health Alert', body: 'b', url: '/u', skipUserIds: [ADMIN_A] });
  assert.deepEqual(calls, [['notify', args], ['admins', { type: 'system', title: 'Push Health Alert', body: 'b', url: '/u',
    skipUserIds: [ADMIN_A, OWNER] }]]);
  assert.deepEqual(alerts.personalRecipients([PLAYER, OWNER.toUpperCase(), ADMIN_B]), [PLAYER, ADMIN_B]);
  assert.throws(() => alerts.pushHealthNotices({}), TypeError);
});

test('invariant: through the real notifyAdmins fan-out the summary reaches every admin except the owner account', async () => {
  needHelper();
  const phone = [];
  const db = database(world());
  const notices = alerts.pushHealthNotices(gateway(phone));
  await notices.toAdmins(db, { type: 'system', title: 'Push Health Alert', body: 'x', url: '/admin/push-health' });
  assert.deepEqual(db.attempts.map((a) => a.row.user_id).sort(), [ADMIN_A, ADMIN_B].sort());
  assert.deepEqual(phone.map((p) => p.userId).sort(), [ADMIN_A, ADMIN_B].sort());
});

test('episode decision: coalesce an open episode, chain a new one after anything else; resolve only a directly observed condition, on an observation after its own opening', () => {
  needHelper();
  const at = '2026-09-28T13:00:00.000Z';
  const later = '2026-09-29T13:00:00.000Z';
  const present = { alertname: 'PushDispatchStale', state: 'present', summary: 's', evidence: { minutesSince: 90 } };
  const absent = { ...present, state: 'absent', summary: null };
  const open = { id: 7, event_key: 'k1', status: 'firing', investigation_status: 'investigating', received_at: at, observed_at: at };
  const events = (condition, latest, when = later) => alerts.episodeEvents(condition, latest, when);
  assert.equal(events(present, open)[0].event_key, 'k1');
  assert.equal(events(present, { ...open, investigation_status: 'blocked' })[0].event_key, 'k1');
  const [first] = events(present, null);
  assert.equal(first.event_key, events(present, null, at)[0].event_key, 'deterministic, so a retry lands on the same row');
  assert.equal(first.status, 'firing');
  assert.equal(first.severity, 'critical');
  assert.equal(first.payload.target_task_id, ALERT_TASK_ID);
  assert.equal(first.payload.resolved_by, undefined, 'a directly observed condition resolves here');
  for (const latest of [{ ...open, investigation_status: 'verified_fixed' }, { ...open, investigation_status: 'historical' },
    { ...open, investigation_status: 'test' }, { ...open, id: 8, event_key: 'k1:resolved', status: 'resolved', investigation_status: 'new' }]) {
    const [next] = events(present, latest);
    assert.notEqual(next.event_key, latest.event_key, `a new episode after ${latest.investigation_status}/${latest.status}`);
    assert.notEqual(next.event_key, first.event_key);
    assert.equal(next.payload.episode_after, latest.event_key);
  }
  // Resolved: nothing. A test row: nothing. Closed but unresolved: its recovery.
  assert.deepEqual(events(absent, { ...open, event_key: 'k1:resolved', status: 'resolved' }), []);
  assert.deepEqual(events(absent, { ...open, investigation_status: 'test' }), []);
  assert.deepEqual(events(absent, { ...open, investigation_status: 'verified_fixed' }).map((e) => e.payload.resolves), ['k1']);
  const [recovery] = events(absent, open);
  assert.deepEqual([recovery.event_key, recovery.status, recovery.severity, recovery.payload.resolves, recovery.payload.resolves_event_id],
    ['k1:resolved', 'resolved', 'info', 'k1', 7]);
  assert.deepEqual(events({ ...present, state: 'unknown' }, open), []);
  assert.deepEqual(events(absent, null), []);
  // A recurrence after a closed, unresolved row carries it, and resolves it too.
  const [carrier] = events(present, { ...open, investigation_status: 'historical', unresolved: ['k0'], unresolved_since: '2026-09-01T00:00:00.000Z' });
  assert.deepEqual(carrier.payload.unresolved, ['k0', 'k1']);
  assert.equal(carrier.payload.unresolved_since, '2026-09-01T00:00:00.000Z');
  const carrierRow = { ...open, event_key: carrier.event_key, unresolved: ['k0', 'k1'], unresolved_since: '2026-09-01T00:00:00.000Z',
    observed_at: later };
  assert.deepEqual(events(absent, carrierRow, '2026-09-30T13:00:00.000Z').map((e) => e.payload.resolves), [carrier.event_key, 'k0', 'k1']);
  // Only an observation made after the episode's OWN opening resolves it -
  // not one made before it, and not one measured against what it carries.
  assert.deepEqual(events(absent, carrierRow, '2026-09-29T12:00:00.000Z'), [], 'a recurrence was resolved by an older observation');
  assert.deepEqual(events(absent, open, at), [], 'resolved by an observation made when it opened');
  assert.deepEqual(events(absent, { ...open, observed_at: null }, at), [], 'received_at stands in for a row with no observed_at');
  // A condition that clears only when devices change is never resolved here:
  // its episode coalesces, says the fleet closes it, and carries nothing.
  assert.deepEqual([...alerts.FLEET_CLOSED].sort(), ['OwnerAccountDeviceNotConfirmingPush', 'OwnerAccountPushNotificationsOff',
    'PushDuplicateDeviceSubscriptions', 'PushNoActiveSubscriptions', 'PushStaffUnreachable', 'PushVapidKeyRotated',
    'PushZombieSubscriptions']);
  for (const alertname of alerts.FLEET_CLOSED.filter((name) => name !== 'PushVapidKeyRotated')) {
    const device = { alertname, state: 'present', summary: 'd', evidence: {} };
    const row = { ...open, event_key: 'd1' };
    assert.deepEqual(events({ ...device, state: 'absent' }, row), [], `${alertname} was resolved here`);
    assert.deepEqual(events({ ...device, state: 'absent' }, { ...row, investigation_status: 'verified_fixed' }), [], alertname);
    assert.equal(events(device, row)[0].event_key, 'd1', `${alertname} did not coalesce`);
    assert.match(events(device, null)[0].payload.resolved_by, /Production Alerts fleet/);
    const [after] = events(device, { ...row, investigation_status: 'verified_fixed' });
    assert.equal(after.payload.episode_after, 'd1');
    assert.equal(after.payload.unresolved, undefined, `${alertname} carried a row it can never resolve`);
  }
  // A one-shot event: keyed by its identity, recorded once, never resolved here.
  const shot = { alertname: 'PushVapidKeyRotated', state: 'present', summary: 'r', identity: { from: 'a', fromSlot: 's', to: 'b' } };
  const [recorded] = events(shot, null);
  assert.equal(recorded.event_key, events({ ...shot, state: 'reported' }, null)[0].event_key);
  assert.equal(events({ ...shot, state: 'reported' }, null)[0].payload.recorded_late, true);
  assert.match(recorded.payload.resolved_by, /Production Alerts fleet/);
  const held = { ...open, event_key: recorded.event_key };
  assert.equal(events(shot, held)[0].event_key, recorded.event_key, 'a re-detection coalesces');
  assert.deepEqual(events({ ...shot, state: 'reported' }, held), [], 'a rotation the store holds was delivered again');
  assert.deepEqual(events(shot, { ...held, investigation_status: 'verified_fixed' }), [], 'a rotation the fleet closed was reopened');
  // Its own row decides, wherever it sits in the chain.
  const elsewhere = { ...open, id: 9, event_key: 'another', status: 'firing' };
  assert.deepEqual(alerts.episodeEvents({ ...shot, state: 'reported' }, elsewhere, later, { firing: held }), []);
  assert.equal(alerts.episodeEvents({ ...shot, state: 'reported' }, elsewhere, later, { firing: null })[0].event_key,
    recorded.event_key);
});

test('episode decision for an observation replayed from a refused run: it adds to an open episode or opens the first, never one after a row the task closed or a later one (review r25)', () => {
  needHelper();
  const before = '2026-09-27T13:00:00.000Z';
  const kept = '2026-09-28T13:00:00.000Z'; // when the refused run observed it
  const after = '2026-09-29T13:00:00.000Z';
  const replay = (condition, latest) => alerts.episodeEvents(condition, latest, kept, null, { replayed: true });
  const open = { id: 7, event_key: 'k1', status: 'firing', investigation_status: 'new', received_at: before, observed_at: before };
  for (const alertname of ['PushZombieSubscriptions', 'PushDispatchStale']) {
    const present = { alertname, state: 'present', summary: 's', evidence: {} };
    assert.equal(replay(present, open)[0].event_key, 'k1', `${alertname}: a replay did not add to the open episode`);
    assert.equal(replay(present, null)[0].payload.episode_after, null, `${alertname}: a replay did not open the first episode`);
    for (const status of ['verified_fixed', 'historical', 'test']) {
      const closed = { ...open, investigation_status: status };
      assert.deepEqual(replay(present, closed), [], `${alertname}: a replay reopened a row marked ${status}`);
      // A live run that observes the condition opens the next episode.
      assert.equal(alerts.episodeEvents(present, closed, after)[0].payload.episode_after, 'k1');
    }
  }
  // After a recovery: a new episode only when the replayed observation is the later one.
  const stale = { alertname: 'PushDispatchStale', state: 'present', summary: 's', evidence: {} };
  const recovery = { ...open, id: 8, event_key: 'k1:resolved', status: 'resolved' };
  assert.equal(replay(stale, recovery)[0].payload.episode_after, 'k1:resolved', 'a recurrence the refused run saw was lost');
  assert.deepEqual(replay(stale, { ...recovery, received_at: after, observed_at: after }), [],
    'a replay opened an episode behind a later recovery');
  assert.deepEqual(replay(stale, { ...recovery, received_at: after, observed_at: null }), []);
  // A replayed absence resolves only an episode it postdates, as before.
  const absent = { ...stale, state: 'absent', summary: null };
  assert.equal(replay(absent, open)[0].payload.resolves, 'k1');
  assert.deepEqual(replay(absent, { ...open, received_at: after, observed_at: after }), []);
});

test('observations: admins get the same problems in order, and every failure is its own condition', () => {
  needHelper();
  const h = alerts.pushHealthObservations();
  h.fault(alerts.CONDITION.ZOMBIES, 'z', { zombies: 1 });
  h.clear(alerts.CONDITION.ZOMBIES);
  h.unverified(alerts.CONDITION.DISPATCH_STALE, 'd', new Error('read failed'));
  h.checkFailed('staff', 'staff check failed: x', new Error('x'));
  h.clear('NotACondition');
  h.passed('duplicate-device');
  h.unobserved(alerts.CONDITION.OUTBOX_BACKLOG);
  const all = h.conditions();
  const byName = Object.fromEntries(all.filter((c) => !c.check).map((c) => [c.alertname, c]));
  const checks = Object.fromEntries(all.filter((c) => c.check).map((c) => [c.check, c]));
  assert.deepEqual([...h.problems], ['z', 'd', 'staff check failed: x']);
  assert.throws(() => h.problems.push('x'), TypeError);
  assert.equal(byName.PushZombieSubscriptions.state, 'present', 'the first observation stands');
  assert.equal(byName.PushDispatchStale.state, 'unknown');
  assert.equal(byName.PushOutboxBacklog.state, 'unknown');
  // The lines the admins were told travel with each condition (a kept run
  // holds these, and nothing more, for the next run).
  assert.deepEqual([byName.PushZombieSubscriptions.told, checks.PushDispatchStale.told, checks.staff.told],
    ['z', 'd', 'staff check failed: x']);
  assert.deepEqual(Object.keys(checks).sort(), ['PushDispatchStale', 'PushZombieSubscriptions', 'duplicate-device', 'observation', 'staff']);
  assert.equal(checks.PushDispatchStale.state, 'present');
  assert.match(checks.PushDispatchStale.summary, /^d -- not verified: push-health could not read PushDispatchStale: read failed$/);
  assert.equal(checks.PushDispatchStale.severity, 'critical');
  assert.equal(checks.staff.summary, 'staff check failed: x');
  assert.equal(checks.observation.state, 'present');
  assert.equal(checks.PushZombieSubscriptions.state, 'absent', 'observed, so its read worked');
  assert.equal(checks['duplicate-device'].state, 'absent');
  assert.equal(alerts.pushHealthObservations().conditions().find((c) => c.check === 'observation')?.state, 'absent',
    'a run that names no unknown condition clears a failed observation');
});

test('a cut-off zombie read is a failed observation of its own, resolved when the read is whole again; the zombies stay with the fleet', async () => {
  const s = scenario();
  await s.run();
  const [zombies] = firing(s, 'PushZombieSubscriptions');
  // The zombie read's answer is cut off before the silent device.
  s.db.maxRows = (req) => (req.table === 'push_subscriptions'
    && req.filters.some(([op, column]) => op === 'gte' && column === 'last_used_at') ? 2 : null);
  await s.run();
  const [cut] = failed(s, 'PushZombieSubscriptions');
  assert.equal(cut?.status, 'firing', 'a cut-off read passed as a whole one');
  assert.match(cut.payload.summary, /read 2 of 3 recently pushed subscriptions/);
  assert.equal(zombies.delivery_count, 1, 'a zombie the read did not return was counted');
  s.db.maxRows = null;
  await s.run();
  assert.equal(recoveryOf(s, cut)?.status, 'resolved');
  assert.equal(zombies.delivery_count, 2);
  assert.equal(recoveryOf(s, zombies), undefined);
  assert.ok(s.db.requests.every((r) => r.table !== 'push_subscriptions' || r.op !== 'select' || r.head
    || r.filters.some(([op, column]) => (op === 'gte' && column === 'last_used_at') || column === 'user_id')
    || r.columns === 'user_id, device_label, device_id'), 'push-health reads subscriptions it no longer needs');
});

test('a receipt the store did not really give is a failed delivery; a large batch is split within the store\'s limit', async () => {
  needHelper();
  const db = database({});
  const conditions = [{ alertname: 'PushZombieSubscriptions', state: 'present', summary: 'z', evidence: {} }];
  for (const receipts of [[], [0], [-1], ['1'], [1, 2], null]) {
    const out = await alerts.recordPushHealthAlerts(db, conditions, { record: async () => receipts });
    assert.equal(out.ok, false, JSON.stringify(receipts));
  }
  // Each refused delivery kept its observations; the next good one claims
  // and replays them, oldest first, and marks them delivered.
  const kept = db.tables.push_dispatch_runs.filter((row) => row.job === 'push-health-owed');
  assert.equal(kept.length, 6);
  const good = await alerts.recordPushHealthAlerts(db, conditions, { record: async () => [5] });
  assert.equal(good.ok, true);
  assert.equal(good.replayed, 6);
  assert.ok(kept.every((row) => row.job === 'push-health-owed-delivered' && row.finished_at),
    'kept observations were not marked delivered');
  assert.ok(db.requests.filter((r) => r.table === 'operational_alert_events').every((r) => r.bounded), 'store reads are bounded');

  // Ten directly observed conditions each owing 21 recoveries: 210 events,
  // two calls. (A condition the fleet closes owes none.)
  const chains = Object.values(alerts.CONDITION).filter((name) => name !== 'PushHealthCheckFailed' && !alerts.closedByFleet(name))
    .map((alertname) => ({ alertname })).concat(['zombie', 'staff', 'duplicate-device', 'dispatch-liveness']
      .map((check) => ({ alertname: 'PushHealthCheckFailed', check })));
  assert.equal(chains.length, 10);
  const big = database({ operational_alert_events: chains.map(({ alertname, check }, i) => ({ id: i + 1, source: SOURCE, alertname,
    event_key: `k${i}`, status: 'firing', investigation_status: 'new', received_at: '2026-09-01T00:00:00.000Z',
    last_received_at: '2026-09-01T00:00:00.000Z', payload: { ...(check ? { check } : {}),
      unresolved: Array.from({ length: 20 }, (_, j) => `k${i}-${j}`) } })) });
  const sizes = [];
  const out = await alerts.recordPushHealthAlerts(big, chains.map((chain) => ({ ...chain, state: 'absent', evidence: {} })),
    { record: async (batch) => { sizes.push(batch.length); return batch.map((_, i) => i + 1); } });
  assert.equal(out.ok, true);
  assert.deepEqual(sizes, [200, 10]);
  assert.equal(out.resolved, 210);
});
