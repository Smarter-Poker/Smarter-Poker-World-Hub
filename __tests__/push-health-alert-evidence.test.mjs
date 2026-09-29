/**
 * push-health's store episodes move only on evidence (review round 2,
 * 2026-09-28).
 *
 * Round 1 recorded the owner account's push-health conditions as Production
 * Alerts store episodes. Its review found that they could move without
 * evidence, and these cases reproduce each finding through the REAL route and
 * gateway (see push-health-alert-harness.mjs):
 *
 *   1. A silent device that simply was not pushed for three days dropped out
 *      of the zombie read and its episode was RESOLVED, then re-opened under a
 *      new key on the next push. Production's longest gap between pushes to
 *      the owner account in 30 days is 72.0h, exactly the window. Out of the
 *      window is unobserved, not healthy.
 *   2. A VAPID rotation, and a notice that reached the owner account, were
 *      lost when the run that saw them had its store write refused.
 *   3. Different faults shared one PushHealthCheckFailed episode, whose
 *      payload never changes, and a rotation whose count read failed reached
 *      the store only as a check failure: the store knew less than the admins.
 *   4. The detector never looked at anything a previous run wrote, so a
 *      notice from an older deployment or a store-failed run went unseen.
 *   5. A late bump after a recovery re-opened the episode, a row marked `test`
 *      was treated as open, and a row the task closed early never got its
 *      recovery.
 *
 * Since review round 4, a condition that clears only when devices change
 * (zombies, a staff or owner account without a device, duplicates, no device
 * at all, a key rotation) is closed by the Production Alerts fleet, never by
 * push-health; the cases here that involve one assert that, and the recovery
 * cases use a condition push-health observes directly. Since review r25 a
 * cut-off read is a failed observation whatever it found, and resolves
 * nothing; since review r27 a check passes only when every read it made came
 * back, the staff conditions say when they are not judged, and a detector
 * answer without its count is not "none found".
 *
 * Run: node --test __tests__/push-health-alert-evidence.test.mjs
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { ALERT_TASK_ID } from '../src/lib/operationalAlerts.mjs';
// A namespace, so these cases also run (and fail one by one) on a tree that
// predates the writer's destination rule (#2013).
import * as writer from '../src/lib/operationalAlerts.mjs';
import { ADMIN_A, ADMIN_B, CHECK_FAILED, DAY, DETECT, HOUR, MIN, OWNER, PLAYER, SOURCE, TODAY, alerts, confirm,
  database, device, episodes, failed, fingerprintOf, firing, named, needHelper, pgUtc, recoveryOf, scenario,
  subscription, titles, world } from './push-health-alert-harness.mjs';

const OWNER_SILENT = 'OwnerAccountDeviceNotConfirmingPush';
const ZOMBIES = 'PushZombieSubscriptions';
const ROTATED = 'PushVapidKeyRotated';
const iso = (ms) => new Date(ms).toISOString();

// ---- 1. Out of the zombie window is unobserved, not healthy -----------------
test('a silent owner-account device that nobody pushes for three days keeps its episode open, its next push coalesces onto it, and a receipt does not close it', async () => {
  const seed = world();
  seed.push_subscriptions.find((row) => row.id === 'owner-phone').last_receipt_at = null;
  const s = scenario({ seed });
  await s.run();
  const [silent] = firing(s, OWNER_SILENT);
  assert.ok(silent, 'the silent device opened an episode');

  // Its last push was on day 1. Days 1-3 still see it; days 4 and 5 do not.
  s.idle.add('owner-phone');
  for (let day = 1; day <= 5; day += 1) await s.run();
  assert.equal(recoveryOf(s, silent), undefined, 'resolved because the device left the zombie window');
  assert.equal(silent.delivery_count, 4, 'coalesced while in the window, untouched once unobserved');

  s.idle.delete('owner-phone');
  s.day(0);
  await s.run();
  assert.deepEqual(firing(s, OWNER_SILENT).map((row) => row.event_key), [silent.event_key],
    'the next push opened a new episode instead of continuing the open one');
  assert.equal(silent.delivery_count, 5);

  // Round 4: a receipt does not close it either; the fleet does.
  confirm(s, 'owner-phone');
  await s.run();
  assert.equal(recoveryOf(s, silent), undefined, 'push-health resolved a device condition on a receipt');
  assert.equal(silent.delivery_count, 5);
  assert.deepEqual(titles(s, OWNER), []);
});

test('zombie subscriptions stay one open episode whatever happens to their devices: idle, a late receipt, a retirement', async () => {
  const seed = world();
  seed.push_subscriptions.push(subscription('player-tablet', PLAYER, Date.now(), { receipt: false }));
  const s = scenario({ seed });
  const first = await s.run();
  assert.equal(first.body.problems[0], '2 zombie subscription(s) across 1 user(s)');
  const [zombies] = firing(s, ZOMBIES);

  s.idle.add('player-phone').add('player-tablet');
  for (let day = 1; day <= 4; day += 1) await s.run();
  assert.equal(recoveryOf(s, zombies), undefined, 'resolved because the zombies were not pushed for three days');
  confirm(s, 'player-phone');
  await s.run();
  device(s, 'player-tablet').is_active = false;
  await s.run();
  assert.equal(recoveryOf(s, zombies), undefined, 'push-health resolved a device condition');
  assert.equal(firing(s, ZOMBIES).length, 1);
});

test('a silent device pushed again after days unpushed coalesces onto its open episode, not a new one', async () => {
  const s = scenario();
  await s.run();
  const [zombies] = firing(s, ZOMBIES);
  s.idle.add('player-phone');
  for (let day = 1; day <= 4; day += 1) await s.run();
  assert.equal(recoveryOf(s, zombies), undefined);
  // The dispatcher pushes the silent device just before push-health reads.
  s.db.fail = (req) => {
    if (req.table === 'push_subscriptions' && req.filters.some(([op, column]) => op === 'gte' && column === 'last_used_at')) {
      device(s, 'player-phone').last_used_at = s.ago(MIN);
    }
    return null;
  };
  await s.run();
  assert.deepEqual(firing(s, ZOMBIES).map((row) => row.event_key), [zombies.event_key], 'the push opened a new episode');
  assert.equal(zombies.delivery_count, 5, 'the zombie read saw it silent in the window');
});

test('after the fleet closes a zombie episode, a device silent long before opens nothing; a zombie observed again opens a new one', async () => {
  const seed = world();
  const at = Date.now();
  seed.push_subscriptions.push(subscription('old-phone', ADMIN_A, at, { receipt: false, used: at - 10 * DAY, created: at - 40 * DAY }));
  const s = scenario({ seed });
  s.idle.add('old-phone');
  await s.run();
  const [zombies] = firing(s, ZOMBIES);
  confirm(s, 'player-phone');
  await s.run();
  assert.equal(recoveryOf(s, zombies), undefined, 'push-health resolved a device condition');
  zombies.investigation_status = 'verified_fixed';
  await s.run();
  assert.equal(firing(s, ZOMBIES).length, 1, 'a device silent long before, never pushed since, opened an episode');
  device(s, 'player-phone').last_receipt_at = null;
  await s.run();
  const [, again] = firing(s, ZOMBIES);
  assert.equal(again?.payload.episode_after, zombies.event_key, 'a zombie observed again after the fleet closed it');
});

test('a read the server cut off is not a recovery', async () => {
  const s = scenario();
  await s.run();
  const [zombies] = firing(s, ZOMBIES);
  const [staff] = firing(s, 'PushStaffUnreachable');
  s.db.maxRows = 2;
  await s.run();
  assert.equal(recoveryOf(s, zombies), undefined, 'the zombie that did not fit in the answer was read as gone');
  assert.equal(recoveryOf(s, staff), undefined, 'the staff account that did not fit in the answer was read as reachable');
  assert.equal(failed(s, ZOMBIES)[0]?.status, 'firing', 'a cut-off zombie read passed as a whole one');
  assert.equal(failed(s, 'PushStaffUnreachable')[0]?.status, 'firing');
  assert.equal(failed(s, 'PushDuplicateDeviceSubscriptions')[0]?.status, 'firing', 'a cut-off duplicate read passed as clean');
  s.db.maxRows = null;
  await s.run();
  assert.equal(recoveryOf(s, failed(s, ZOMBIES)[0])?.status, 'resolved');
  assert.deepEqual([zombies.delivery_count, staff.delivery_count], [2, 2], 'coalesced again once the whole answer came back');
});

// Review r25: a cut-off read is a failed observation whatever it found, and
// only a whole read resolves that failure.
const ADMIN_C = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
const CUT_OFF_READS = [
  // the check, the condition it judges, its read, what the world adds, rows that find nothing, rows that find the fault
  ['zombie', ZOMBIES, (req) => req.table === 'push_subscriptions' && req.filters.some(([op, c]) => op === 'gte' && c === 'last_used_at'),
    (seed, at) => seed.push_subscriptions.push(subscription('player-laptop', PLAYER, at)), 2, 3],
  ['staff', 'PushStaffUnreachable', (req) => req.table === 'profiles' && req.columns === 'id, username, role',
    (seed, at) => {
      seed.profiles.push({ id: ADMIN_C, username: 'c', role: 'admin' });
      seed.push_subscriptions.push(subscription('admin-c-phone', ADMIN_C, at));
    }, 2, 3],
  ['duplicate-device', 'PushDuplicateDeviceSubscriptions',
    (req) => req.table === 'push_subscriptions' && req.columns === 'user_id, device_label, device_id',
    (seed, at) => seed.push_subscriptions.push({ ...subscription('admin-a-again', ADMIN_A, at), device_id: 'admin-a-phone' },
      subscription('player-laptop', PLAYER, at)), 2, 4],
];
for (const [check, alertname, isRead, extend, nothing, found] of CUT_OFF_READS) {
  test(`a cut-off ${check} read that still finds the fault stays a failed observation and resolves no failure; only a whole read does`, async () => {
    const seed = world();
    extend(seed, Date.now());
    const s = scenario({ seed });
    await s.run(); // whole: the fault is observed
    const [fault] = firing(s, alertname);
    assert.ok(fault, 'a whole read did not observe the fault');
    s.db.fail = (req) => (isRead(req) ? 'canceling statement due to statement timeout' : null);
    await s.run(); // the read fails, so the whole check fails
    s.db.fail = () => null;
    const [threw] = failed(s, check);
    assert.equal(threw?.status, 'firing', 'the failed check was not recorded');
    s.db.maxRows = (req) => (isRead(req) ? nothing : null);
    await s.run(); // cut off before the fault
    const [cut] = failed(s, alertname);
    assert.equal(cut?.status, 'firing', 'a cut-off read passed as a whole one');
    s.db.maxRows = (req) => (isRead(req) ? found : null);
    await s.run(); // still cut off, with the fault among what came back
    assert.equal(recoveryOf(s, cut), undefined, 'a cut-off read resolved its own failed observation');
    assert.equal(recoveryOf(s, threw), undefined, 'a cut-off read resolved the failed check');
    assert.equal(cut.delivery_count, 2, 'the cut-off read was not recorded as a failed observation');
    assert.equal(fault.delivery_count, 2, 'the fault it found was not recorded');
    s.db.maxRows = null;
    await s.run(); // whole again
    assert.equal(recoveryOf(s, cut)?.status, 'resolved');
    assert.equal(recoveryOf(s, threw)?.status, 'resolved');
  });
}

test('a cut-off read of staff devices makes nobody unreachable in the store copy; the admins keep their line', async () => {
  const seed = world();
  seed.push_subscriptions.push(subscription('admin-b-phone', ADMIN_B, Date.now()));
  // The owner account's phone comes last in the answer.
  seed.push_subscriptions.push(...seed.push_subscriptions.splice(0, 1));
  const s = scenario({ seed });
  await s.run(); // every staff account can receive push
  assert.deepEqual(named(s, 'PushStaffUnreachable'), []);
  // Only two of the three staff devices fit in the answer: not the owner account's.
  s.db.maxRows = (req) => (req.table === 'push_subscriptions' && req.columns === 'user_id' ? 2 : null);
  const res = await s.run();
  assert.ok(res.body.problems.includes('1 staff account(s) cannot receive push'), 'the admins lost their line');
  assert.deepEqual(named(s, 'PushStaffUnreachable'), [], 'a staff account whose device did not fit was recorded as unreachable');
  assert.deepEqual(named(s, 'OwnerAccountPushNotificationsOff'), [], 'the owner account was recorded as having no device');
  const [cut] = failed(s, 'PushStaffUnreachable');
  assert.match(cut?.payload.summary ?? '', /^1 staff account\(s\) cannot receive push -- not verified: .*read 2 of 3 staff subscriptions/);
  s.db.maxRows = null;
  await s.run();
  assert.equal(recoveryOf(s, cut)?.status, 'resolved');
  assert.deepEqual(named(s, 'PushStaffUnreachable'), []);
});

// Review r27: a check passes only when every read it made came back, and a
// condition left unjudged says so in the store.
const staffList = (req) => req.table === 'profiles' && req.columns === 'id, username, role';
const platformCount = (req) => req.table === 'push_subscriptions' && req.head && req.filters.length === 1;
const dispatchRead = (req) => req.table === 'push_dispatch_runs' && req.filters.some(([, c, v]) => c === 'job' && v === 'push-dispatch');
for (const [check, threw, failing] of [['staff', staffList, platformCount], ['dispatch-liveness', dispatchRead, dispatchRead]]) {
  test(`a ${check} check whose read fails does not pass, so the failed check stays open until every read comes back`, async () => {
    const s = scenario();
    s.db.fail = (req) => (threw(req) ? 'throw' : null);
    await s.run(); // the whole check throws
    const [broken] = failed(s, check);
    assert.equal(broken?.status, 'firing', 'the failed check was not recorded');
    s.db.fail = (req) => (failing(req) ? 'canceling statement due to statement timeout' : null);
    await s.run(); // it runs again, but one of its reads fails
    assert.equal(recoveryOf(s, broken), undefined, 'a check passed on a failed read');
    s.db.fail = () => null;
    await s.run();
    assert.equal(recoveryOf(s, broken)?.status, 'resolved');
  });
}

test('while nobody is enrolled the staff conditions are not judged, and the store says so', async () => {
  const s = scenario();
  await s.run(); // one staff account has no device
  const [staff] = firing(s, 'PushStaffUnreachable');
  assert.ok(staff, 'the staff account without a device was not recorded');
  // Every device is retired: nobody can receive a push.
  for (const row of s.db.tables.push_subscriptions) Object.assign(row, { is_active: false, last_failure_reason: 'expired_410' });
  await s.run();
  assert.equal(firing(s, 'PushNoActiveSubscriptions').length, 1, 'nobody enrolled was not recorded');
  const [notJudged] = failed(s, 'PushStaffUnreachable');
  assert.equal(notJudged?.status, 'firing', 'the staff conditions fell silent without saying they were not judged');
  assert.match(notJudged.payload.summary, /nobody is enrolled/);
  assert.equal(staff.delivery_count, 1, 'a staff account was judged while nobody is enrolled');
  // Somebody enrols: the staff conditions are judged again.
  s.db.tables.push_subscriptions.push(subscription('admin-a-new', ADMIN_A, s.db.now()));
  await s.run();
  assert.equal(recoveryOf(s, notJudged)?.status, 'resolved');
  assert.equal(staff.delivery_count, 2);
});

test('a day with no deliveries is not evidence that delivery recovered', async () => {
  const seed = world();
  seed.push_outbox = [{ id: 'skipped-1', recipient_user_id: PLAYER, event: 'system', title: 'x', status: 'skipped',
    failure_reason: 'no_subscription', created_at: iso(Date.now() - HOUR) }];
  const s = scenario({ seed });
  s.quiet = true;
  await s.run();
  const [failing] = firing(s, 'PushDeliveryFailing');
  assert.ok(failing, 'subscribers and nothing delivered is a delivery failure');
  await s.run();
  assert.equal(recoveryOf(s, failing), undefined, 'nothing was sent or discarded, and that was read as a recovery');
  s.quiet = false;
  s.day(0);
  await s.run();
  assert.equal(recoveryOf(s, failing)?.status, 'resolved', 'a delivery is the evidence');
});

// ---- 2. A refused store write loses nothing -----------------------------------
function rotatedWorld() {
  const seed = world();
  const at = Date.now();
  seed.push_dispatch_runs = seed.push_dispatch_runs.filter((row) => row.job !== 'vapid-fingerprint');
  seed.push_dispatch_runs.push({ job: 'vapid-fingerprint', slot: iso(at - 10 * DAY), note: fingerprintOf('old-key'),
    started_at: iso(at - 10 * DAY) });
  return seed;
}
const rotationLines = (s) => s.db.attempts.filter((a) => a.table === 'notifications' && a.row.user_id === ADMIN_A
  && /VAPID key rotated/i.test(a.row.message || '')).length;

test('a VAPID rotation whose run had its store write refused is recorded by the next run as that run saw it, once, and left for the fleet', async () => {
  const s = scenario({ seed: rotatedWorld() });
  s.db.failRecord = 'Operational inbox refused delivery (500)';
  const refused = await s.run();
  assert.equal(refused.statusCode, 500);
  assert.match(refused.body.problems.join(' | '), /VAPID KEY ROTATED with 3 active subscription\(s\)/);

  s.db.failRecord = null;
  await s.run();
  const [rotation] = firing(s, ROTATED);
  assert.ok(rotation, 'the rotation was lost with the refused write');
  assert.equal(rotation.payload.target_task_id, ALERT_TASK_ID);
  // The refused run kept what it observed (review round 3), so the store has
  // the rotation as that run saw it, recorded late.
  assert.equal(rotation.payload.evidence.activeSubscriptions, 3);
  assert.equal(rotation.payload.recorded_late, true);
  // A rotation is an event nothing shows is over: the fleet closes it.
  assert.match(rotation.payload.resolved_by, /Production Alerts fleet/);
  await s.run();
  await s.run();
  assert.deepEqual(named(s, ROTATED).map((row) => [row.status, row.delivery_count]), [['firing', 1]],
    'recorded once, never re-delivered or resolved here');
  assert.equal(rotationLines(s), 1, 'the admins are told once, exactly as before');
});

test('the rotation lifecycle, with the fingerprint log ordered by its started_at default: fired once, never re-delivered or resolved here', async () => {
  const s = scenario({ seed: rotatedWorld() });
  await s.run();
  const [rotation] = firing(s, ROTATED);
  assert.equal(rotation?.severity, 'critical');
  assert.equal(rotation.payload.evidence.activeSubscriptions, 3);
  const log = s.db.tables.push_dispatch_runs.filter((row) => row.job === 'vapid-fingerprint');
  assert.equal(log.length, 2);
  assert.ok(Date.parse(log[1].started_at) > Date.parse(log[0].started_at), 'the new fingerprint row takes its started_at default');
  await s.run();
  await s.run();
  assert.deepEqual(named(s, ROTATED).map((row) => [row.status, row.delivery_count]), [['firing', 1]]);
  // A second rotation is a second episode.
  s.db.vapidKey = 'third-key';
  s.db.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY = 'third-key';
  await s.run();
  assert.equal(firing(s, ROTATED).length, 2);
  assert.equal(rotationLines(s), 2);
});

test('a notice that reached the owner account during a run whose store write was refused is still detected', async () => {
  const s = scenario();
  await s.run();
  s.db.tables.notifications.push({ id: 'during-failed-run', user_id: OWNER, type: 'system', title: 'Push Health Alert',
    created_at: s.db.clock() });
  s.db.failRecord = 'Operational inbox refused delivery (500)';
  assert.equal((await s.run()).statusCode, 500);
  s.db.failRecord = null;
  await s.run();
  const [found] = named(s, DETECT);
  assert.equal(found?.status, 'firing', 'the notice seen by the refused run was never recorded');
  assert.deepEqual(found.payload.evidence.personal_inbox.ids, ['during-failed-run']);
});

// ---- 3. Every fault the admins are told has its own episode -------------------
test('each failed check is its own episode with its own evidence, and resolves on its own', async () => {
  const s = scenario();
  s.db.fail = (req) => (req.table === 'push_outbox' && req.head && req.filters.some(([, c, v]) => c === 'status' && v === 'pending')
    ? 'canceling statement due to statement timeout' : null);
  await s.run();
  s.db.fail = (req) => (req.table === 'push_subscriptions' && req.filters.some(([op, c]) => op === 'gte' && c === 'last_used_at')
    ? 'permission denied for table push_subscriptions' : null);
  const second = await s.run();
  assert.equal(second.body.problems[0], 'zombie check failed: permission denied for table push_subscriptions');
  const [backlog] = failed(s, 'PushOutboxBacklog');
  const [zombie] = failed(s, 'zombie');
  assert.ok(backlog && zombie, 'the second failure only bumped the first failure\'s row');
  assert.notEqual(zombie.event_key, backlog.event_key);
  assert.match(zombie.payload.summary, /zombie check failed: permission denied/);
  assert.equal(zombie.payload.target_task_id, backlog.payload.target_task_id);
  assert.equal(recoveryOf(s, backlog)?.status, 'resolved', 'the backlog read worked again on day two');
  s.db.fail = () => null;
  await s.run();
  assert.equal(recoveryOf(s, zombie)?.status, 'resolved');
});

test('a rotation whose affected-subscription count could not be read reaches the store as a rotation', async () => {
  const s = scenario({ seed: rotatedWorld() });
  s.db.fail = (req) => {
    const before = s.db.requests[s.db.requests.indexOf(req) - 1];
    return req.table === 'push_subscriptions' && req.head && before?.table === 'push_dispatch_runs' ? 'statement timeout' : null;
  };
  const res = await s.run();
  assert.ok(res.body.problems.includes('VAPID key rotated (no active subscriptions were affected)'), 'the admins are told what they always were');
  const [rotation] = firing(s, ROTATED);
  assert.ok(rotation, 'the store got only a check failure for a rotation the admins were told about');
  assert.equal(rotation.severity, 'critical', 'an unknown reach is not "no active subscriptions were affected"');
  assert.equal(rotation.payload.evidence.activeSubscriptions, null);
});

test('every line the admins are told reaches the store in that run, in an addressed event of its own', async () => {
  const failures = {
    'dispatch read': (req) => (req.table === 'push_dispatch_runs' && req.filters.some(([, c, v]) => c === 'job' && v === 'push-dispatch')
      ? 'statement timeout' : null),
    'platform count': (req) => (req.table === 'push_subscriptions' && req.head && req.filters.length === 1 ? 'statement timeout' : null),
    'staff check': (req) => (req.table === 'profiles' && req.filters.some(([, c]) => c === 'role') && !req.limit ? 'statement timeout' : null),
    'backlog and zombies': (req) => ((req.table === 'push_outbox' && req.filters.some(([, , v]) => v === 'pending'))
      || (req.table === 'push_subscriptions' && req.filters.some(([op]) => op === 'gte')) ? 'statement timeout' : null),
  };
  for (const [name, fail] of Object.entries(failures)) {
    const s = scenario();
    s.db.fail = fail;
    const res = await s.run();
    const batch = s.db.recorded.at(-1) || [];
    for (const line of res.body.problems) {
      const carriers = batch.filter((event) => String(event.payload?.summary || '').includes(line));
      assert.ok(carriers.length >= 1, `${name}: the admins were told "${line}" and the store was not`);
      assert.ok(carriers.every((event) => event.payload.target_task_id === '01a09b86-5ba8-7290-8657-1041f13dd3ca'), name);
    }
    const keys = batch.filter((event) => event.alertname === CHECK_FAILED && event.status === 'firing').map((event) => event.event_key);
    assert.equal(new Set(keys).size, keys.length, `${name}: two faults shared one episode`);
  }
});

test('the admins\' problem list can only be written through the observations, so no line can miss the store', () => {
  needHelper();
  const h = alerts.pushHealthObservations();
  assert.throws(() => h.problems.push('pushed straight onto the array'), TypeError);
  assert.throws(() => { h.problems[0] = 'x'; }, TypeError);
  h.fault('PushZombieSubscriptions', 'z');
  assert.deepEqual([...h.problems], ['z']);
  assert.equal(JSON.stringify({ problems: h.problems }), '{"problems":["z"]}');
});

// ---- 4. The detector reads everything since the last acknowledged write -------
test('a notice an older deployment wrote after the last judged window is detected (rollback)', async () => {
  const s = scenario();
  await s.run();
  // Day 1: a rolled-back deployment runs push-health the old way. It writes
  // the owner account's notices itself and records a successful run.
  const written = s.db.clock();
  s.db.tables.notifications.push({ id: 'rollback-inbox', user_id: OWNER, type: 'system', title: 'Push Health Alert',
    created_at: written });
  s.db.tables.operational_notification_destinations.push({ notification_id: 'rollback-routed', recipient_user_id: OWNER,
    inbox_event_id: 5, captured_at: written,
    original_notification: { type: 'system', title: 'Push Notifications Are Off', created_at: pgUtc(written) } });
  Object.assign(s.db.tables.cron_health_log[0], { last_run_at: s.db.clock(), last_status: 'success' });
  // Day 2: rolled forward.
  s.day();
  await s.run();
  const [found] = named(s, DETECT);
  assert.equal(found?.status, 'firing', 'the older deployment\'s notices went unseen');
  assert.deepEqual(found.payload.evidence.personal_inbox.ids, ['rollback-inbox']);
  assert.deepEqual(found.payload.evidence.captured_originals.ids, ['rollback-routed']);
  await s.run();
  assert.equal(recoveryOf(s, found)?.status, 'resolved');
});

test('before its first acknowledged write, a failed previous run is searched from its start', async () => {
  const s = scenario();
  const end = s.db.now() - HOUR;
  Object.assign(s.db.tables.cron_health_log[0], { last_run_at: iso(end), last_status: 'error', last_duration_ms: 2 * MIN });
  s.db.tables.notifications.push({ id: 'in-failed-run', user_id: OWNER, type: 'system', title: 'Push Health Alert',
    created_at: iso(end - MIN) });
  await s.run();
  assert.deepEqual(named(s, DETECT)[0]?.payload.evidence.personal_inbox.ids, ['in-failed-run']);
});

// A classifier install's history intake (held Club Arena migration
// 20260928171444) preserves the owner account's 2026-08-19 "Push
// Notifications Are Off" into the store at install time: captured now,
// written weeks ago. It is history, not a recurrence. The personal row stays
// until the held cleanup removes it, so before store-only delivery (#5512) it
// is still in the inbox too.
for (const storeOnly of [false, true]) {
  test(`a notice written long ago and captured later is history; a new one still fires (${storeOnly ? 'after' : 'before'} #5512)`, async () => {
    const s = scenario({ storeOnly });
    await s.run();
    const notice = (id, writtenAt, capturedAt) => {
      const row = { id, user_id: OWNER, type: 'system', title: 'Push Notifications Are Off', created_at: writtenAt };
      s.db.tables.operational_notification_destinations.push({ notification_id: id, recipient_user_id: OWNER,
        target_task_id: ALERT_TASK_ID, inbox_event_id: 70, captured_at: capturedAt,
        original_notification: { ...row, created_at: pgUtc(writtenAt) } });
      if (!storeOnly) s.db.tables.notifications.push(row);
    };
    // Written 40 days ago and 20 hours before the window opened (inside the
    // text filter's day of slack), both captured by today's install.
    notice('historical-off', s.ago(40 * DAY), s.ago(MIN));
    notice('yesterday-off', s.ago(DAY + 20 * HOUR), s.ago(MIN));
    await s.run();
    assert.deepEqual(named(s, DETECT), [], 'a notice written before the window fired because it was captured inside it');

    // A rolled-back deployment writes a new one today.
    notice('new-off', s.ago(HOUR), s.ago(HOUR));
    await s.run();
    const [found] = named(s, DETECT);
    assert.equal(found?.status, 'firing', 'a genuinely new notice went unseen');
    assert.deepEqual(found.payload.evidence.captured_originals, { count: 1, ids: ['new-off'] });
    assert.deepEqual(found.payload.evidence.personal_inbox.ids, storeOnly ? [] : ['new-off']);
  });
}

test('a large history intake neither blinds the detector nor, cut off, reads as "none found"', async () => {
  needHelper();
  const judge = async (writtenFrom) => {
    const db = database({ cron_health_log: [], operational_alert_events: [{ id: 1, source: SOURCE, alertname: 'PushOutboxBacklog',
      event_key: 'k', status: 'firing', investigation_status: 'new', received_at: '2026-09-27T13:00:00.000Z',
      last_received_at: '2026-09-27T13:00:00.000Z', payload: {} }] });
    // 60 old notices, all captured inside the window by one intake.
    for (let i = 0; i < 60; i += 1) {
      db.tables.operational_notification_destinations.push({ notification_id: `old-${i}`, recipient_user_id: OWNER,
        captured_at: '2026-09-28T12:00:00.000Z', original_notification: { type: 'system', title: 'Push Health Alert',
          created_at: pgUtc(Date.parse(writtenFrom) + i * 1000) } });
    }
    const h = alerts.pushHealthObservations();
    await alerts.observeOwnerAddressedNotices(db, h, { now: Date.parse('2026-09-28T13:00:00.000Z') });
    return { state: h.conditions().find((c) => c.alertname === DETECT && !c.check).state,
      failure: h.conditions().find((c) => c.check === DETECT) };
  };
  // Written weeks ago: the read never returns them, so the window is judged.
  const weeks = await judge('2026-08-19T00:00:00.000Z');
  assert.equal(weeks.state, 'absent', 'weeks-old notices captured today were read as new, or filled the read and blinded it');
  // Written the day before the window: they come back (text slack), 50 of 60,
  // none new - the 10 not returned are not "none found".
  const slack = await judge('2026-09-27T05:00:00.000Z');
  assert.equal(slack.state, 'unknown');
  assert.match(slack.failure.evidence.error, /cut off/);
});

test('a captured-originals answer that comes back without its count is not "none found" (review r27)', async () => {
  needHelper();
  const db = database({ cron_health_log: [], operational_alert_events: [{ id: 1, source: SOURCE, alertname: 'PushOutboxBacklog',
    event_key: 'k', status: 'firing', investigation_status: 'new', received_at: '2026-09-27T13:00:00.000Z',
    last_received_at: '2026-09-27T13:00:00.000Z', payload: {} }] });
  // Written the day before the window and captured inside it: it comes back, and it is not new.
  db.tables.operational_notification_destinations.push({ notification_id: 'old-1', recipient_user_id: OWNER,
    captured_at: '2026-09-28T12:00:00.000Z', original_notification: { type: 'system', title: 'Push Health Alert',
      created_at: pgUtc(Date.parse('2026-09-27T05:00:00.000Z')) } });
  // ...and the answer carries no count.
  const from = db.from;
  db.from = (table) => {
    const builder = from(table);
    if (table === 'operational_notification_destinations') {
      const then = builder.then;
      builder.then = (resolve, reject) => then((res) => resolve({ ...res, count: null }), reject);
    }
    return builder;
  };
  const h = alerts.pushHealthObservations();
  await alerts.observeOwnerAddressedNotices(db, h, { now: Date.parse('2026-09-28T13:00:00.000Z') });
  assert.equal(h.conditions().find((c) => c.alertname === DETECT && !c.check).state, 'unknown',
    'an answer without its count was read as "none found"');
  assert.match(h.conditions().find((c) => c.check === DETECT).evidence.error, /not counted/);
});

// ---- 5. The chain is read in creation order; closed rows get recoveries -------
const BACKLOG = 'PushOutboxBacklog';
const STALE = 'PushDispatchStale';
const pending = (s) => Array.from({ length: 251 }, (_, i) => ({ id: `p${i}`, status: 'pending', created_at: s.ago(MIN) }));
const drain = (s) => { s.db.tables.push_outbox = s.db.tables.push_outbox.filter((row) => row.status !== 'pending'); };

test('a late bump of a firing row after its recovery (overlapping runs) never reads as open', async () => {
  const s = scenario();
  s.db.tables.push_outbox.push(...pending(s));
  await s.run();
  const [first] = firing(s, BACKLOG);
  drain(s);
  await s.run();
  assert.ok(recoveryOf(s, first));
  s.db.recordEvent({ source: SOURCE, event_key: first.event_key, alertname: BACKLOG, status: 'firing', severity: 'warning',
    payload: { target_task_id: first.payload.target_task_id } });
  s.db.tables.push_outbox.push(...pending(s));
  await s.run();
  const open = firing(s, BACKLOG);
  assert.equal(open.length, 2, 'the recurrence bumped the resolved episode');
  assert.equal(first.delivery_count, 2, 'only the overlapping run touched the resolved episode');
  assert.equal(open[1].payload.episode_after, `${first.event_key}:resolved`);
});

test('a firing row the task marked test is not an episode: neither reused nor resolved', async () => {
  const s = scenario();
  s.db.tables.push_outbox.push(...pending(s));
  await s.run();
  const [marked] = firing(s, BACKLOG);
  const [markedZombies] = firing(s, ZOMBIES);
  marked.investigation_status = 'test';
  markedZombies.investigation_status = 'test';
  await s.run();
  assert.equal(marked.delivery_count, 1, 'a test row was reused as the open episode');
  assert.equal(markedZombies.delivery_count, 1, 'a test row was reused as the open episode');
  const [, real] = firing(s, BACKLOG);
  const [, realZombies] = firing(s, ZOMBIES);
  assert.ok(real && realZombies);
  drain(s);
  confirm(s, 'player-phone');
  await s.run();
  assert.equal(recoveryOf(s, marked), undefined, 'a test row was resolved');
  assert.equal(recoveryOf(s, real)?.status, 'resolved');
  // A condition the fleet closes: neither is resolved here.
  assert.equal(recoveryOf(s, markedZombies), undefined);
  assert.equal(recoveryOf(s, realZombies), undefined);
});

test('a firing row the task closed before a directly observed condition cleared still gets its recovery; a device condition carries nothing', async () => {
  // Closed, and the condition then clears.
  const s = scenario();
  s.db.tables.push_outbox.push(...pending(s));
  await s.run();
  const [backlog] = firing(s, BACKLOG);
  backlog.investigation_status = 'verified_fixed';
  drain(s);
  await s.run();
  assert.equal(recoveryOf(s, backlog)?.payload.resolves, backlog.event_key);

  // Closed while the condition persists: the recurrence carries it.
  const t = scenario();
  t.dispatcherDown = true;
  await t.run();
  await t.run();
  const [stale] = firing(t, STALE);
  const [staff] = firing(t, 'PushStaffUnreachable');
  assert.ok(stale && staff);
  stale.investigation_status = 'historical';
  staff.investigation_status = 'historical';
  await t.run();
  const [, again] = firing(t, STALE);
  const [, staffAgain] = firing(t, 'PushStaffUnreachable');
  assert.equal(stale.delivery_count, 1, 'a closed row was bumped');
  assert.ok(again, 'the persisting fault reaches the task as a new episode');
  assert.deepEqual(again.payload.unresolved, [stale.event_key]);
  assert.equal(staffAgain?.payload.unresolved, undefined, 'a device episode carried a row it can never resolve');
  t.dispatcherDown = false;
  t.day(0);
  t.db.tables.push_subscriptions.push(subscription('admin-b-phone', ADMIN_B, t.db.now()));
  await t.run();
  assert.equal(recoveryOf(t, again)?.status, 'resolved');
  assert.equal(recoveryOf(t, stale)?.payload.resolves, stale.event_key, 'the closed episode never got its recovery');
  assert.equal(recoveryOf(t, staffAgain), undefined, 'push-health resolved a device condition');
});

test('the default scenario still tells everyone else exactly today\'s notices across a week of runs', async () => {
  const s = scenario();
  for (let day = 0; day < 7; day += 1) {
    const res = await s.run();
    assert.equal(res.statusCode, 200);
    assert.deepEqual(res.body.problems, TODAY);
  }
  assert.deepEqual(titles(s, OWNER), []);
  assert.equal(titles(s, ADMIN_A).length, 7);
  assert.deepEqual(episodes(s).map((row) => [row.alertname, row.delivery_count]).sort(),
    [['PushStaffUnreachable', 7], [ZOMBIES, 7]]);
});

// ---- The writer's destination rule (#2013) --------------------------------------
test('every store write goes through the real writer addressed to the fleet, which refuses any other target', async () => {
  needHelper();
  const saved = { url: process.env.NEXT_PUBLIC_SUPABASE_URL, key: process.env.SUPABASE_SERVICE_ROLE_KEY, fetch: globalThis.fetch };
  const calls = [];
  process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://store.example';
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-role-for-this-test';
  globalThis.fetch = async (url, init) => {
    const events = JSON.parse(init.body).p_events;
    calls.push({ url: String(url), events });
    return { ok: true, json: async () => events.map((_, i) => i + 1) };
  };
  try {
    const db = database({ operational_alert_events: [{ id: 1, source: SOURCE, alertname: 'PushOutboxBacklog', event_key: 'k',
      status: 'firing', investigation_status: 'new', received_at: '2026-09-01T00:00:00.000Z', payload: {} }] });
    const h = alerts.pushHealthObservations();
    h.fault(alerts.CONDITION.ZOMBIES, 'z', { zombies: 1 });
    h.clear(alerts.CONDITION.OUTBOX_BACKLOG, { pending: 0 });
    h.checkFailed('staff', 'staff check failed: x', new Error('x'));
    // The default writer: World Hub's recordOperationalAlerts, which applies withDestination.
    const out = await alerts.recordPushHealthAlerts(db, h.conditions());
    assert.equal(out.ok, true, out.error);
    assert.equal(calls.length, 1);
    assert.match(calls[0].url, /\/rest\/v1\/rpc\/fn_record_operational_alerts$/);
    assert.deepEqual(calls[0].events.map((e) => [e.alertname, e.status]).sort(),
      [['PushHealthCheckFailed', 'firing'], ['PushOutboxBacklog', 'resolved'], ['PushZombieSubscriptions', 'firing']]);
    assert.ok(calls[0].events.every((e) => e.payload.target_task_id === ALERT_TASK_ID), 'an event left without the fleet target');
  } finally {
    for (const [name, value] of [['NEXT_PUBLIC_SUPABASE_URL', saved.url], ['SUPABASE_SERVICE_ROLE_KEY', saved.key]]) {
      if (value === undefined) delete process.env[name]; else process.env[name] = value;
    }
    globalThis.fetch = saved.fetch;
  }
  // The rule those writes pass: any other destination is refused, never re-addressed.
  assert.equal(typeof writer.AlertDestinationError, 'function', 'the writer has no destination rule');
  assert.throws(() => writer.withDestination({ target_task_id: '00000000-0000-4000-8000-000000000000' }),
    writer.AlertDestinationError);
});
