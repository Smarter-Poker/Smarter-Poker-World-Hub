/**
 * Who closes a push-health episode, and nothing the admins were told is lost
 * (review rounds 3 and 4, 2026-09-28).
 *
 * ROUND 4. Round 3 still resolved the device conditions on receipts, and its
 * review broke that again: a row fn_change_push_subscription_ownership inserts
 * on a re-enrolment has no last_used_at until its first delivered push (19 of
 * 66 production rows were never pushed, one of them a live owner-account row
 * about 62 hours old when the review read it), so it was invisible, and the
 * retired row it replaced was released by a receipt from ANY device of the
 * same person. For an owner-account iPhone that never confirms, beside a Mac
 * that does, re-enrolling every four days, the review counted 4 episodes and 3
 * recoveries in 12 days with no iPhone receipt (this harness, on round 3's
 * code: 3 and 3). The decision: a condition that clears only when devices
 * change, and a key rotation (FLEET_CLOSED), is never resolved by push-health.
 * Its episode stays open, later runs coalesce into it, its payload says the
 * Production Alerts fleet closes it, and a new one opens only after the fleet
 * closed it. The round 3 device cases below now assert that. Also round 4: a
 * kept run is claimed by one run before it is replayed, and a kept row holds
 * no evidence about the owner account; a directly observed recovery needs an
 * observation made after the episode's own opening
 * (push-health-owner-alert-episodes.test.mjs).
 *
 * ROUND 3, still true: a fault told to the admins in a run whose store write
 * was refused reaches the store; a run whose detector could not look does not
 * move its window; every rotation is recorded once.
 *
 * REVIEW r25: a kept observation, replayed, never reopens an episode the fleet
 * closed (the review's case: closed after the refused run made it).
 *
 * Run: node --test __tests__/push-health-alert-positive-evidence.test.mjs
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { ADMIN_A, CHECK_FAILED, DAY, DETECT, HOUR, MIN, OWNER, PLAYER, SECOND, SOURCE, alerts, confirm, database,
  device, failed, fingerprintOf, firing, named, needHelper, recoveryOf, scenario, subscription,
  world } from './push-health-alert-harness.mjs';

const OWNER_SILENT = 'OwnerAccountDeviceNotConfirmingPush';
const OWNER_OFF = 'OwnerAccountPushNotificationsOff';
const ZOMBIES = 'PushZombieSubscriptions';
const ROTATED = 'PushVapidKeyRotated';
const STALE = 'PushDispatchStale';
const FLEET = /Production Alerts fleet/;
const iso = (ms) => new Date(ms).toISOString();
const resolved = (s, alertname) => named(s, alertname).filter((row) => row.status === 'resolved');
const silent = (seed, id) => {
  seed.push_subscriptions.find((row) => row.id === id).last_receipt_at = null;
  return seed;
};

// fn_change_push_subscription_ownership on a re-enrolment with a new endpoint:
// the device's live row is retired as superseded_same_device and a new row is
// inserted with no last_used_at. It is first pushed with the person's next
// notification (here, the next day's traffic). `pushed` is round 3's helper,
// which wrongly had the dispatcher push it at once. The new row never confirms.
function reenrol(s, userId, oldId, newId, { pushed = false } = {}) {
  const at = s.db.now();
  Object.assign(device(s, oldId), { is_active: false, last_failure_reason: 'superseded_same_device', updated_at: iso(at) });
  s.db.tables.push_subscriptions.push(subscription(newId, userId, at, { receipt: false, created: at - MIN,
    used: pushed ? at - 30 * SECOND : null }));
  return newId;
}
// push-dispatch on a 404 or 410: the push service says the endpoint is gone.
const expire = (s, id) => Object.assign(device(s, id), { is_active: false, last_failure_reason: 'expired_410' });
// push-health's zombie read (the only push_subscriptions read with gte).
const zombieRead = (req) => req.table === 'push_subscriptions'
  && req.filters.some(([op, column]) => op === 'gte' && column === 'last_used_at');
const owed = (s) => s.db.tables.push_dispatch_runs.filter((row) => row.job.startsWith('push-health-owed'));

// ---- Round 4: a device condition is closed by the fleet, never here -------------
for (const [who, userId, alertname] of [['owner-account', OWNER, OWNER_SILENT], ['player', PLAYER, ZOMBIES]]) {
  test(`a ${who} iPhone that never confirms, beside a device that does, re-enrolling every four days is one episode push-health never resolves`, async () => {
    const seed = world();
    const at = Date.now();
    // Its sibling confirms every push (the owner account's is owner-phone).
    if (userId === PLAYER) {
      seed.push_subscriptions = seed.push_subscriptions.filter((row) => row.id !== 'player-phone');
      seed.push_subscriptions.push(subscription('player-phone', PLAYER, at));
    }
    seed.push_subscriptions.push(subscription(`${who}-iphone`, userId, at, { receipt: false }));
    const s = scenario({ seed });
    await s.run();
    const [episode] = firing(s, alertname);
    assert.ok(episode, 'the silent iPhone opened an episode');
    // The review's reproduction: twelve days, a new row every four, each first
    // pushed with the next day's traffic.
    let current = `${who}-iphone`;
    for (let day = 1; day <= 12; day += 1) {
      if (day % 4 === 0) current = reenrol(s, userId, current, `${who}-iphone-${day}`);
      await s.run();
    }
    assert.deepEqual(firing(s, alertname).map((row) => row.event_key), [episode.event_key], 'a replacement opened a new episode');
    assert.deepEqual(resolved(s, alertname), [], 'resolved with no receipt from the iPhone');
    assert.match(episode.payload.resolved_by, FLEET);
    // Not even the iPhone's own receipt resolves it here: the fleet closes it.
    confirm(s, current);
    await s.run();
    assert.deepEqual(resolved(s, alertname), []);
  });
}

// ---- Round 3's device cases, under round 4's rule ---------------------------------
for (const [who, userId, first, alertname] of [['owner-account', OWNER, 'owner-phone', OWNER_SILENT],
  ['player', PLAYER, 'player-phone', ZOMBIES]]) {
  test(`a ${who} device re-enrolling and never confirming, each replacement pushed at once, is one episode that not even its receipt resolves here`, async () => {
    const s = scenario({ seed: silent(world(), first) });
    await s.run();
    const [episode] = firing(s, alertname);
    assert.ok(episode, 'the silent device opened an episode');
    let current = first;
    for (let day = 1; day <= 14; day += 1) {
      if (day % 4 === 0) current = reenrol(s, userId, current, `${first}-${day}`, { pushed: true });
      await s.run();
    }
    assert.deepEqual(firing(s, alertname).map((row) => row.event_key), [episode.event_key],
      'a silent replacement opened a new episode');
    assert.deepEqual(resolved(s, alertname), [], 'resolved while the device had confirmed nothing');
    // Days 0-3 (the first row), 7 and 11 (each replacement past its grace
    // period): every run that saw a silent device past its grace period.
    if (userId === OWNER) assert.equal(episode.delivery_count, 6);
    confirm(s, current);
    await s.run();
    assert.equal(recoveryOf(s, episode), undefined, 'push-health resolved a device condition on a receipt');
  });
}

for (const loss of ['expired', 'deleted']) {
  test(`an owner-account silent device ${loss} with nothing to replace it: both of his episodes stay open for the fleet, even once a new device confirms`, async () => {
    const s = scenario({ seed: silent(world(), 'owner-phone') });
    await s.run();
    const [episode] = firing(s, OWNER_SILENT);
    assert.ok(episode, 'the silent phone opened an episode');
    if (loss === 'expired') expire(s, 'owner-phone');
    else s.db.tables.push_subscriptions = s.db.tables.push_subscriptions.filter((row) => row.id !== 'owner-phone');
    for (let day = 1; day <= 20; day += 1) await s.run();
    assert.deepEqual(resolved(s, OWNER_SILENT), [], 'resolved with no owner-account device confirming anything');
    const [off] = firing(s, OWNER_OFF);
    assert.equal(off?.status, 'firing', 'with no device left he is a staff account without push');

    const at = s.db.now();
    s.db.tables.push_subscriptions.push(subscription('owner-new-phone', OWNER, at, { created: at - MIN, used: at - 30 * SECOND }));
    await s.run();
    assert.equal(recoveryOf(s, episode), undefined, 'push-health resolved a device condition');
    assert.equal(recoveryOf(s, off), undefined, 'push-health resolved a device condition');
    assert.match(episode.payload.resolved_by, FLEET);
    assert.match(off.payload.resolved_by, FLEET);
  });
}

test('a retired silent device beside one that confirmed long ago: the episode stays open, whatever confirms later', async () => {
  const seed = world();
  const at = Date.now();
  // The person's old tablet confirmed its last push ten days ago.
  seed.push_subscriptions.push(subscription('player-tablet', PLAYER, at, { used: at - 10 * DAY, created: at - 40 * DAY }));
  const s = scenario({ seed });
  s.idle.add('player-tablet');
  await s.run();
  const [episode] = firing(s, ZOMBIES);
  assert.ok(episode, 'the silent phone opened an episode');
  expire(s, 'player-phone');
  for (let day = 1; day <= 3; day += 1) await s.run();
  // The tablet is pushed again and confirms.
  s.idle.delete('player-tablet');
  s.day(0);
  await s.run();
  assert.equal(recoveryOf(s, episode), undefined, 'push-health resolved a device condition on a receipt');
});

test('no receipt from any owner-account device resolves his episode, not even one from a device he still has', async () => {
  const seed = world();
  seed.push_subscriptions.push(subscription('owner-laptop', OWNER, Date.now(), { receipt: false }));
  const s = scenario({ seed });
  await s.run();
  const [episode] = firing(s, OWNER_SILENT);
  assert.ok(episode, 'the silent laptop opened an episode');
  // His phone confirmed the day's push after the episode opened, then he
  // turned it off; the silent laptop is never pushed again.
  Object.assign(device(s, 'owner-phone'), { is_active: false, last_failure_reason: 'disabled_by_owner' });
  s.idle.add('owner-laptop');
  for (let day = 1; day <= 17; day += 1) await s.run();
  assert.equal(recoveryOf(s, episode), undefined, 'a receipt from a device he no longer has closed it');
  // A new phone that confirms every push.
  const at = s.db.now();
  s.db.tables.push_subscriptions.push(subscription('owner-new-phone', OWNER, at, { created: at - MIN, used: at - 30 * SECOND }));
  await s.run();
  assert.equal(recoveryOf(s, episode), undefined, 'push-health resolved a device condition');
});

test('a zombie read the server cut off is a failed observation of its own, never a recovery', async () => {
  const seed = world();
  // Enrolled weeks ago and first pushed just before push-health's read.
  seed.push_subscriptions.push(subscription('player-tablet', PLAYER, Date.now(), { receipt: false, used: null,
    created: Date.now() - 40 * DAY }));
  const s = scenario({ seed });
  s.idle.add('player-tablet');
  await s.run();
  const [episode] = firing(s, ZOMBIES);
  assert.ok(episode, 'the silent phone opened an episode');
  confirm(s, 'player-phone');
  s.db.fail = (req) => {
    if (zombieRead(req)) device(s, 'player-tablet').last_used_at = s.ago(MIN);
    return null;
  };
  // ...and the zombie read's answer is cut off before it.
  s.db.maxRows = (req) => (zombieRead(req) ? 3 : null);
  await s.run();
  assert.equal(recoveryOf(s, episode), undefined, 'a zombie the cut-off read did not return was read as gone');
  const [cut] = failed(s, ZOMBIES);
  assert.equal(cut?.status, 'firing', 'a cut-off read passed as a whole one');
  assert.match(cut.payload.summary, /read 3 of 4 recently pushed subscriptions/);
});

for (const loss of ['idle', 'expired']) {
  test(`a silent device that is ${loss === 'idle' ? 'never pushed again' : 'retired and never replaced'} keeps PushZombieSubscriptions open until the fleet closes it`, async () => {
    const s = scenario();
    await s.run();
    const [episode] = firing(s, ZOMBIES);
    assert.ok(episode, 'the silent phone opened an episode');
    if (loss === 'idle') s.idle.add('player-phone');
    else expire(s, 'player-phone');
    const lastPush = Date.parse(device(s, 'player-phone').last_used_at);
    while (s.db.now() - lastPush < 20 * DAY) await s.run();
    assert.deepEqual(resolved(s, ZOMBIES), [], 'push-health closed it on silence');
    assert.match(episode.payload.resolved_by, FLEET);
    // The fleet closes it; the next zombie opens a new episode.
    episode.investigation_status = 'verified_fixed';
    await s.run();
    assert.equal(firing(s, ZOMBIES).length, 1, 'nothing observed, yet a new episode opened');
  });
}

// ---- Kept observations: claimed once, bounded, nothing about the owner ------------
test('faults told to the admins in a run whose store write was refused reach the store, with their recoveries', async () => {
  const s = scenario();
  s.dispatcherDown = true;
  await s.run();
  s.dispatcherDown = false;
  s.db.failRecord = 'Operational inbox refused delivery (503)';
  s.db.fail = (req) => (zombieRead(req) ? 'canceling statement due to statement timeout' : null);
  const refusedAt = s.db.now();
  const refused = await s.run();
  assert.equal(refused.statusCode, 500);
  const staleLine = refused.body.problems.find((line) => /push-dispatch has not run in \d+ minutes/.test(line));
  assert.ok(staleLine && refused.body.problems.some((line) => /^zombie check failed/.test(line)));

  s.db.failRecord = null;
  s.db.fail = () => null;
  await s.run();
  await s.run();
  const [stale] = firing(s, STALE);
  const [zombieCheck] = failed(s, 'zombie').filter((row) => row.status === 'firing');
  assert.ok(stale, 'the stale dispatcher the admins were told about never reached the store');
  assert.ok(zombieCheck, 'the failed zombie check the admins were told about never reached the store');
  assert.equal(stale.payload.summary, staleLine);
  assert.ok(Math.abs(Date.parse(stale.payload.observed_at) - refusedAt) < MIN, 'recorded as the refused run observed it');
  assert.equal(stale.payload.recorded_late, true);
  assert.equal(recoveryOf(s, stale)?.status, 'resolved');
  assert.equal(recoveryOf(s, zombieCheck)?.status, 'resolved');
  assert.deepEqual([stale.delivery_count, zombieCheck.delivery_count], [1, 1], 'a kept observation was delivered twice');
});

test('observations kept from consecutive refused runs are replayed in order: the fault, then its recovery', async () => {
  const s = scenario();
  s.dispatcherDown = true;
  await s.run();
  s.dispatcherDown = false;
  s.db.failRecord = 'Operational inbox refused delivery (503)';
  await s.run(); // the dispatcher is stale
  await s.run(); // it is back
  s.db.failRecord = null;
  await s.run();
  await s.run();
  const [stale] = firing(s, STALE);
  assert.ok(stale, 'the stale dispatcher never reached the store');
  const recovery = recoveryOf(s, stale);
  assert.equal(recovery?.status, 'resolved', 'its recovery, observed by the second refused run, was lost');
  assert.ok(Date.parse(recovery.payload.observed_at) > Date.parse(stale.payload.observed_at));
  assert.deepEqual(named(s, STALE).map((row) => row.delivery_count), [1, 1]);
});

test('a refused run whose observations cannot be kept either says so', async () => {
  const s = scenario();
  s.db.failRecord = 'Operational inbox refused delivery (503)';
  s.db.fail = (req) => (req.table === 'push_dispatch_runs' && req.op === 'insert' && req.payload?.job !== 'vapid-fingerprint'
    ? 'permission denied for table push_dispatch_runs' : null);
  const res = await s.run();
  assert.equal(res.statusCode, 500);
  assert.match(res.body.operationalAlerts.error, /refused delivery/);
  assert.match(res.body.operationalAlerts.error, /could not be kept/);
});

test('two overlapping runs replay a kept run once: only the run that claims it', async () => {
  const s = scenario();
  s.dispatcherDown = true;
  await s.run();
  s.dispatcherDown = false;
  s.db.failRecord = 'Operational inbox refused delivery (503)';
  await s.run(); // keeps the stale dispatcher
  s.db.failRecord = null;
  const both = await Promise.all([s.run({ then: null }), s.run({ then: null })]);
  const [stale] = firing(s, STALE);
  assert.ok(stale, 'the kept run was never replayed');
  assert.equal(stale.delivery_count, 1, 'both overlapping runs replayed the kept run');
  // A run that lost the claim keeps its own behind it, and says why.
  const lost = both.filter((res) => res.statusCode === 500);
  assert.ok(lost.length <= 1);
  assert.deepEqual(owed(s).map((row) => row.job).sort(),
    lost.length ? ['push-health-owed', 'push-health-owed-delivered'] : ['push-health-owed-delivered']);
  for (const res of lost) assert.match(res.body.operationalAlerts.error, /another push-health run/);
});

test('kept runs are bounded, and a claim whose run died is taken over after its lease', async () => {
  needHelper();
  const at = Date.parse('2026-09-28T13:00:00.000Z');
  const note = JSON.stringify({ observed_at: '2026-09-27T13:00:00.000Z',
    conditions: [{ alertname: STALE, state: 'present', told: 'push-dispatch has not run in 90 minutes', counts: { minutesSince: 90 } }] });
  const claimed = (minutesAgo) => ({ id: 'k1', job: 'push-health-owed-claimed', slot: '2026-09-27T13:00:00.000Z', note,
    started_at: '2026-09-27T13:00:01.000Z', finished_at: iso(at - minutesAgo * MIN) });
  const recorded = [];
  const record = async (batch) => { recorded.push(...batch); return batch.map((_, i) => i + 1); };
  // A live claim: this run keeps its own behind it.
  const live = database({ push_dispatch_runs: [claimed(5)] });
  const blocked = await alerts.recordPushHealthAlerts(live, [], { record, now: at });
  assert.equal(blocked.ok, false);
  assert.match(blocked.error, /another push-health run is replaying/);
  assert.deepEqual(recorded, []);
  // A lapsed one: taken over, replayed once, delivered.
  const lapsed = database({ push_dispatch_runs: [claimed(20)] });
  const taken = await alerts.recordPushHealthAlerts(lapsed, [], { record, now: at });
  assert.equal(taken.ok, true, taken.error);
  assert.equal(taken.replayed, 1);
  assert.deepEqual(recorded.map((event) => [event.alertname, event.payload.summary, event.payload.recorded_late]),
    [[STALE, 'push-dispatch has not run in 90 minutes', true]]);
  assert.equal(lapsed.tables.push_dispatch_runs[0].job, 'push-health-owed-delivered');
  // At most 60 refused runs are kept; the 61st says so.
  const full = database({ push_dispatch_runs: Array.from({ length: 60 }, (_, i) => ({ id: `o${i}`, job: 'push-health-owed',
    slot: iso(at - (i + 1) * DAY), note, started_at: iso(at - (i + 1) * DAY) })) });
  const refused = await alerts.recordPushHealthAlerts(full, [{ alertname: STALE, state: 'present', summary: 's', evidence: {} }],
    { record: async () => { throw new Error('refused'); }, now: at });
  assert.match(refused.error, /could not be kept for the next run: 60 refused runs are already kept/);
  assert.equal(full.tables.push_dispatch_runs.length, 60);
});

test('a kept run holds no owner-account evidence, only the keys of his conditions, and the detector marker no note; the next run still records the detection', async () => {
  const s = scenario({ seed: silent(world(), 'owner-phone') });
  await s.run();
  const [marker] = s.db.tables.push_dispatch_runs.filter((row) => row.job === 'push-health-detector');
  assert.ok(marker, 'the judged window was not marked');
  assert.equal(marker.note ?? null, null, 'the detector marker says something about the owner account');
  s.db.tables.notifications.push({ id: 'owner-notice-1', user_id: OWNER, type: 'system', title: 'Push Health Alert',
    created_at: s.ago(HOUR) });
  s.db.failRecord = 'Operational inbox refused delivery (503)';
  await s.run();
  const [row] = owed(s);
  assert.ok(row, 'the refused run kept nothing');
  assert.ok(!row.note.includes('owner-notice-1'), 'a notification id was kept');
  assert.equal(/"(since|until|ids|lastReceipt|last_receipt_at|personal_inbox|push_outbox|captured_originals|ownerZombieSubscriptions|staffAccountsWithoutPush)"/
    .test(row.note), false, 'owner-account evidence was kept');
  const kept = JSON.parse(row.note);
  assert.equal(kept.conditions.some((c) => c.alertname === DETECT), false, 'the detection was kept');
  const allowed = ['alertname', 'check', 'state', 'severity', 'identity', 'told', 'rotatedAt', 'counts'];
  for (const c of kept.conditions) {
    assert.deepEqual(Object.keys(c).filter((name) => !allowed.includes(name)), [], JSON.stringify(c));
    assert.ok(Object.values(c.counts).every((v) => Number.isSafeInteger(v) || v === null), JSON.stringify(c));
    if ([OWNER_SILENT, OWNER_OFF].includes(c.alertname) || c.check === DETECT) {
      assert.deepEqual([c.counts, c.told], [{}, undefined], 'owner-account evidence was kept');
    }
  }
  assert.ok(kept.conditions.some((c) => c.alertname === OWNER_SILENT && c.state === 'present'), 'the owner condition was lost');
  s.db.failRecord = null;
  await s.run();
  const [found] = named(s, DETECT);
  assert.deepEqual(found?.payload.evidence.personal_inbox.ids, ['owner-notice-1'], 'the next window did not find it again');
  // Runs 1 and 3, and the kept observation of the refused run 2, replayed.
  assert.equal(named(s, OWNER_SILENT)[0].delivery_count, 3, 'the kept owner condition was not replayed');
});

// ---- Review r25: a replayed observation never reopens what the fleet closed -------
test('a kept zombie observation does not reopen the episode the fleet closed after the refused run (the review\'s case)', async () => {
  const s = scenario();
  await s.run(); // day 0: the player's silent phone opens the episode
  const [episode] = firing(s, ZOMBIES);
  assert.ok(episode, 'the silent phone opened an episode');
  s.db.failRecord = 'Operational inbox refused delivery (503)';
  await s.run(); // day 1: still silent; the store refuses and the observation is kept
  s.db.failRecord = null;
  assert.equal(owed(s).length, 1, 'the refused run kept nothing');
  // The phone is retired, and the fleet closes the episode on that evidence.
  expire(s, 'player-phone');
  episode.investigation_status = 'verified_fixed';
  const replayed = await s.run(); // day 2: the kept observation is replayed
  assert.equal(replayed.statusCode, 200);
  assert.deepEqual(firing(s, ZOMBIES).map((row) => row.event_key), [episode.event_key],
    'a replayed observation reopened an episode the fleet closed after it was made');
  assert.equal(episode.delivery_count, 1);
  assert.deepEqual(owed(s).map((row) => row.job), ['push-health-owed-delivered'], 'the kept run was not settled');
  // A zombie a live run observes again opens the next episode, as before.
  const at = s.db.now();
  s.db.tables.push_subscriptions.push(subscription('player-tablet', PLAYER, at, { receipt: false, created: at - 10 * DAY,
    used: at - HOUR }));
  await s.run();
  const [, next] = firing(s, ZOMBIES);
  assert.equal(next?.payload.episode_after, episode.event_key, 'a zombie observed again opened nothing');
  assert.equal(next.payload.recorded_late, undefined);
});

test('a kept stale-dispatcher observation opens no second episode after the fleet closed the first, which still gets its recovery', async () => {
  const s = scenario();
  s.dispatcherDown = true;
  await s.run(); // day 0: fine; the dispatcher stops after it
  await s.run(); // day 1: stale
  const [episode] = firing(s, STALE);
  assert.ok(episode, 'the stale dispatcher opened an episode');
  s.db.failRecord = 'Operational inbox refused delivery (503)';
  s.dispatcherDown = false;
  await s.run(); // day 2: still stale; kept. The dispatcher runs again after it.
  s.db.failRecord = null;
  episode.investigation_status = 'verified_fixed';
  await s.run(); // day 3: the kept observation is replayed, then the run sees it cleared
  assert.deepEqual(firing(s, STALE).map((row) => row.event_key), [episode.event_key],
    'a replayed observation opened an episode after the fleet closed the one it belonged to');
  assert.equal(recoveryOf(s, episode)?.status, 'resolved', 'the closed episode lost its recovery');
});

// ---- The detector's window moves only when the detector looked --------------------
test('a run whose detector could not look does not move the detector window', async () => {
  const s = scenario();
  await s.run();
  // A rolled-back deployment writes the owner account a notice, hours before
  // the next run.
  s.db.tables.notifications.push({ id: 'rollback-inbox', user_id: OWNER, type: 'system', title: 'Push Health Alert',
    created_at: s.ago(2 * HOUR) });
  const detector = (req) => req.op === 'select'
    && ['notifications', 'push_outbox', 'operational_notification_destinations'].includes(req.table)
    && req.filters.some(([op, column]) => op === 'in' && /title/.test(column));
  s.db.fail = (req) => (detector(req) ? 'canceling statement due to statement timeout' : null);
  const blind = await s.run();
  assert.equal(blind.statusCode, 200, 'the blind run recorded its own failure');
  assert.equal(named(s, CHECK_FAILED).find((row) => row.payload.check === DETECT)?.status, 'firing');
  s.db.fail = () => null;
  await s.run();
  const [found] = named(s, DETECT);
  assert.equal(found?.status, 'firing', 'the notice written before the blind run was never detected');
  assert.deepEqual(found.payload.evidence.personal_inbox.ids, ['rollback-inbox']);
});

// ---- Every rotation is recorded once, and closed by the fleet ---------------------
function rotatedWorld() {
  const seed = world();
  const at = Date.now();
  seed.push_dispatch_runs = seed.push_dispatch_runs.filter((row) => row.job !== 'vapid-fingerprint');
  seed.push_dispatch_runs.push({ job: 'vapid-fingerprint', slot: iso(at - 10 * DAY), note: fingerprintOf('old-key'),
    started_at: iso(at - 10 * DAY) });
  return seed;
}
const rotate = (s, key) => { s.db.vapidKey = key; s.db.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY = key; };
const rotationLines = (s) => s.db.attempts.filter((a) => a.table === 'notifications' && a.row.user_id === ADMIN_A
  && /VAPID key rotated/i.test(a.row.message || '')).length;

test('two rotations on consecutive runs are each recorded once, never re-delivered or resolved here', async () => {
  const s = scenario({ seed: rotatedWorld() });
  await s.run();
  rotate(s, 'third-key');
  for (let run = 0; run < 6; run += 1) await s.run();
  const fired = firing(s, ROTATED);
  assert.equal(fired.length, 2);
  assert.deepEqual(fired.map((row) => row.delivery_count), [1, 1], 'a rotation was re-delivered');
  assert.deepEqual(resolved(s, ROTATED), [], 'push-health resolved a rotation');
  assert.ok(fired.every((row) => FLEET.test(row.payload.resolved_by)));
  assert.equal(rotationLines(s), 2);
});

test('two rotations during a store outage are both re-derived from the fingerprint log, each recorded once', async () => {
  const s = scenario({ seed: rotatedWorld() });
  s.db.failRecord = 'Operational inbox refused delivery (503)';
  // Nothing of the refused runs is kept, so only the log can give them back.
  s.db.fail = (req) => (req.table === 'push_dispatch_runs' && req.op === 'insert' && req.payload?.job !== 'vapid-fingerprint'
    ? 'permission denied for table push_dispatch_runs' : null);
  await s.run();
  rotate(s, 'third-key');
  await s.run();
  assert.equal(rotationLines(s), 2);
  s.db.failRecord = null;
  s.db.fail = () => null;
  await s.run();
  const fired = firing(s, ROTATED);
  assert.equal(fired.length, 2, 'the admins were told of two rotations and the store holds one');
  assert.ok(fired.every((row) => row.payload.recorded_late === true));
  await s.run();
  await s.run();
  assert.deepEqual(fired.map((row) => row.delivery_count), [1, 1]);
  assert.deepEqual(resolved(s, ROTATED), []);
  assert.equal(s.db.tables.operational_alert_events.filter((row) => row.source === SOURCE && row.alertname === ROTATED).length, 2);
});
