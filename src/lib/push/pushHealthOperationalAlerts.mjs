/**
 * push-health's operational alerts for the owner account: Production Alerts
 * store episodes, never a personal notice (2026-09-28).
 *
 * WHAT WAS WRONG. push-health told the owner account about push faults the way
 * it tells every admin, with a personal notice. Its daily "Push Health Alert"
 * reached the store only because the database classifier captured the notice
 * (source owner-operational-notifications, event key = the notification id),
 * so every day opened a separate FIRING event and nothing, on any route, ever
 * recorded that push health had come back. "Push Notifications Are Off" was not
 * in the classifier (Club Arena migration 20260928171444, held when this was
 * written, adds it): sent to the owner account it would have landed,
 * uncaptured, in his personal inbox. The owner's rule is that operational
 * alerts belong in public.operational_alert_events for the Production Alerts
 * task, and that a recovery follows the same route as its fault.
 *
 * WHAT THIS MODULE MAKES TRUE.
 *   1. INVARIANT. pushHealthNotices() is the only way push-health addresses a
 *      person, and it can never address the owner account: a notice to him is
 *      refused, and the admin fan-out always skips him. Every other recipient
 *      keeps exactly the notice it had. The exclusion is the owner account only
 *      (the classifier's own isOwnerId); it is never broadened.
 *   2. EPISODES. Each condition push-health observes is recorded here, through
 *      World Hub's writer, with payload.target_task_id set explicitly. One
 *      condition is one alertname under source worldhub.push-health, and its
 *      rows form a chain read newest-CREATED first, so a late bump from an
 *      overlapping run can never make a resolved episode look open again.
 *      While the newest link is an open firing row, every run that observes
 *      the condition delivers that same event key again (the recorder bumps
 *      delivery_count and last_received_at): a fault that persists for a month
 *      is one row. A row the task marked `test` is not an episode at all.
 *   3. WHO CLOSES AN EPISODE (review round 4). A condition whose clearing
 *      depends on devices - their receipts, their enrolment or their
 *      retirement - and a key rotation, a one-shot event that nothing
 *      push-health reads shows is over (together FLEET_CLOSED), are never
 *      resolved here. A device that is replaced, retired, deleted or simply
 *      not pushed yet looks exactly like one that recovered, and each rule
 *      push-health had to tell them apart was broken by the next re-enrolment.
 *      So such an episode stays open, later runs coalesce into it, its payload
 *      says the Production Alerts fleet closes it on evidence, and a new one
 *      opens only after the fleet has closed it (investigation_status
 *      verified_fixed or historical) and the condition is observed again (each
 *      rotation is an episode of its own, recorded once). A condition whose
 *      clearing push-health observes directly with a complete read -
 *      dispatcher liveness, the outbox backlog, delivery, the VAPID keys, the
 *      detector's clean window, a check that completes again - is resolved
 *      here: `<firing key>:resolved` on the same source with payload.resolves
 *      (the convention of Club Arena
 *      scripts/ci/check-operational-alert-addressing.mjs), and only on an
 *      observation made after that episode's own opening. A firing row the
 *      task closed is never reused; for a directly observed condition a
 *      recurrence carries it, so it still gets its recovery.
 *   4. EVERY FAULT HAS ITS OWN EPISODE. A check that fails, and a condition
 *      whose read fails, is its own PushHealthCheckFailed episode, keyed by
 *      payload.check and carrying the line the admins were told, and it
 *      resolves when that check works again. The admins' problem list can only
 *      be written through pushHealthObservations(), so no line reaches them
 *      without its own addressed store copy.
 *   5. NOTHING THE ADMINS WERE TOLD IS LOST. A run whose store write is
 *      refused keeps its observations in push_dispatch_runs (job
 *      push-health-owed), where push-health already keeps state: condition
 *      keys, counts, the lines the admins were told and when - never an id, a
 *      time, a line or evidence about the owner account, whose conditions keep
 *      only their keys. The next run claims each kept row (only one
 *      run can) and replays it, oldest first, before recording its own. A
 *      VAPID key rotation, told once, is also re-derived from the fingerprint
 *      log for a week - every rotation in it, each recorded once.
 *   6. DETECTION. Each run also looks for any push-health notice that reached
 *      the owner account (personal inbox, push_outbox, or an original the
 *      classifier captured) written since the last run whose detector looked
 *      and whose store write was acknowledged (job push-health-detector), so a
 *      notice from a run whose store write failed, from a run that could not
 *      look, or from an older deployment is still found, and an old notice
 *      captured late (a classifier install's history intake) is not. It is
 *      recorded as PushHealthNoticeAddressedToOwnerAccount and recovers on a
 *      clean window.
 *
 * Pure apart from the Supabase client and recorder it is handed: no Next.js,
 * no env, so node --test runs it directly (__tests__/push-health-*.test.mjs).
 */
import { ALERT_TASK_ID, alertEventKey, recordOperationalAlerts } from '../operationalAlerts.mjs';
import { OWNER_OPERATIONAL_ID, isOwnerId } from '../notifications/ownerOperationalClassifier.mjs';

export const PUSH_HEALTH_SOURCE = 'worldhub.push-health';
// cron_health_log.cron_name that withCronHealth records for this job.
export const PUSH_HEALTH_CRON = 'push-health';
export const OWNER_NOTICE_REFUSED = 'owner_account_push_health_notice_refused';
// push_dispatch_runs jobs this module keeps state under (UNIQUE (job, slot);
// every reader of the table filters by job). A kept run moves from OWED to
// CLAIMED while one run replays it, then to DELIVERED.
export const PUSH_HEALTH_JOBS = Object.freeze({ OWED: 'push-health-owed', CLAIMED: 'push-health-owed-claimed',
  DELIVERED: 'push-health-owed-delivered', DETECTOR: 'push-health-detector' });

// Every personal notice push-health sends. The detector looks for all three on
// the owner account, whichever of them the database classifier covers: it has
// always covered the first two, and Club Arena migration 20260928171444 (held
// when this was written) adds "Push Notifications Are Off".
export const PUSH_HEALTH_NOTICE_TITLES = Object.freeze([
  'Push Health Alert',
  'Notifications May Not Be Reaching This Device',
  'Push Notifications Are Off',
]);

// Condition name -> the alertname recorded for it.
export const CONDITION = Object.freeze({
  ZOMBIES: 'PushZombieSubscriptions',
  STAFF_UNREACHABLE: 'PushStaffUnreachable',
  DUPLICATE_DEVICES: 'PushDuplicateDeviceSubscriptions',
  VAPID_MISSING: 'PushVapidKeysMissing',
  VAPID_MISMATCH: 'PushVapidKeysMismatched',
  VAPID_ROTATED: 'PushVapidKeyRotated',
  DISPATCH_STALE: 'PushDispatchStale',
  OUTBOX_BACKLOG: 'PushOutboxBacklog',
  NO_ACTIVE_SUBSCRIPTIONS: 'PushNoActiveSubscriptions',
  DELIVERY_FAILING: 'PushDeliveryFailing',
  OWNER_PUSH_OFF: 'OwnerAccountPushNotificationsOff',
  OWNER_DEVICE_NOT_CONFIRMING: 'OwnerAccountDeviceNotConfirmingPush',
  OWNER_ADDRESSED: 'PushHealthNoticeAddressedToOwnerAccount',
  CHECK_FAILED: 'PushHealthCheckFailed',
});

// The whole checks whose failure is a fault of its own (payload.check). A
// condition whose own read fails is recorded under its alertname instead.
export const CHECK = Object.freeze({
  ZOMBIE: 'zombie',
  STAFF: 'staff',
  DUPLICATE_DEVICE: 'duplicate-device',
  DISPATCH_LIVENESS: 'dispatch-liveness',
  // A condition name outside the catalogue: a code defect, recorded anyway.
  OBSERVATION: 'observation',
});

/**
 * CLOSED BY THE FLEET (review round 4). Each of these clears only when devices
 * change - a receipt, an enrolment, a retirement - or, for a rotation, never
 * observably at all; each re-enrolment rule push-health tried was broken by
 * the next. push-health records them and coalesces into the open episode, and
 * never resolves one. Every other condition is observed directly by a complete
 * read, and push-health records its recovery.
 */
export const FLEET_CLOSED = Object.freeze([
  CONDITION.ZOMBIES, // devices that were pushed and never confirmed
  CONDITION.OWNER_DEVICE_NOT_CONFIRMING, // the same, on the owner account
  CONDITION.STAFF_UNREACHABLE, // staff with no live device
  CONDITION.OWNER_PUSH_OFF, // the same, the owner account
  CONDITION.DUPLICATE_DEVICES, // two live rows on one device
  CONDITION.NO_ACTIVE_SUBSCRIPTIONS, // no live device on the platform
  CONDITION.VAPID_ROTATED, // a one-shot event: nothing shows it is over
]);
export const closedByFleet = (alertname) => FLEET_CLOSED.includes(alertname);
const FLEET_RESOLUTION = 'closed by the Production Alerts fleet on evidence (investigation_status verified_fixed '
  + 'or historical); push-health records no recovery for this condition';

// alertname -> the severity of its firing row and the personal notice the
// owner account would have received for it (null: no notice existed).
const CATALOGUE = Object.freeze({
  [CONDITION.ZOMBIES]: ['warning', 'Push Health Alert'],
  [CONDITION.STAFF_UNREACHABLE]: ['warning', 'Push Health Alert'],
  [CONDITION.DUPLICATE_DEVICES]: ['warning', 'Push Health Alert'],
  [CONDITION.VAPID_MISSING]: ['critical', 'Push Health Alert'],
  [CONDITION.VAPID_MISMATCH]: ['critical', 'Push Health Alert'],
  [CONDITION.VAPID_ROTATED]: ['critical', 'Push Health Alert'],
  [CONDITION.DISPATCH_STALE]: ['critical', 'Push Health Alert'],
  [CONDITION.OUTBOX_BACKLOG]: ['warning', 'Push Health Alert'],
  [CONDITION.NO_ACTIVE_SUBSCRIPTIONS]: ['critical', 'Push Health Alert'],
  [CONDITION.DELIVERY_FAILING]: ['critical', 'Push Health Alert'],
  [CONDITION.OWNER_PUSH_OFF]: ['warning', 'Push Notifications Are Off'],
  [CONDITION.OWNER_DEVICE_NOT_CONFIRMING]: ['warning', 'Notifications May Not Be Reaching This Device'],
  [CONDITION.OWNER_ADDRESSED]: ['warning', null],
  [CONDITION.CHECK_FAILED]: ['warning', 'Push Health Alert'],
});

const OWNER_SUMMARY = Object.freeze({
  [CONDITION.OWNER_PUSH_OFF]: 'The owner account is a staff account with no active push subscription',
  [CONDITION.OWNER_DEVICE_NOT_CONFIRMING]:
    'A push subscription on the owner account was pushed to but confirmed no receipt in 3 days',
  [CONDITION.OWNER_ADDRESSED]:
    'A push-health notice was addressed to the owner account personally since the last window push-health judged',
});

// Closed by the task: never reused (a recurrence reaches it as a new open
// episode, as in Club Arena's detector).
const CLOSED = Object.freeze(['verified_fixed', 'historical']);
// Marked a test row by the task: not an episode at all.
const NOT_AN_EPISODE = Object.freeze(['test']);
const STATES = Object.freeze(['present', 'absent', 'reported']);
// A new episode carries at most this many unresolved predecessors.
const MAX_CARRIED = 20;
// fn_record_operational_alerts accepts 1 to 200 events per call.
const BATCH = 200;
const READ_TIMEOUT_MS = 8000;

export const isOwnerAccount = (userId) => isOwnerId(userId);
export const includesOwnerAccount = (userIds) => (userIds || []).some(isOwnerId);

/** The recipients push-health may address personally: everyone but the owner account. */
export function personalRecipients(userIds) {
  return (userIds || []).filter((id) => !isOwnerId(id));
}

/**
 * THE INVARIANT. The only way push-health addresses a person. Its conditions
 * are operational alerts, and for the owner account those are recorded in the
 * Production Alerts store (recordPushHealthAlerts), never in his personal inbox
 * or on his phone. So a notice to him is refused here whatever the caller
 * passes, and the admin fan-out always skips him. Nothing else changes for any
 * other recipient: the same notify()/notifyAdmins() calls with the same fields.
 */
export function pushHealthNotices({ notify, notifyAdmins }) {
  if (typeof notify !== 'function' || typeof notifyAdmins !== 'function') {
    throw new TypeError('pushHealthNotices needs the notify gateway');
  }
  return Object.freeze({
    async toRecipient(supabase, args = {}) {
      if (isOwnerId(args?.userId)) {
        console.warn('[push-health] refused a personal notice to the owner account; '
          + 'its condition is recorded for the Production Alerts task instead');
        return { ok: false, notificationId: null, push: null, refused: OWNER_NOTICE_REFUSED };
      }
      return notify(supabase, args);
    },
    async toAdmins(supabase, args = {}) {
      const skip = Array.isArray(args?.skipUserIds) ? args.skipUserIds : [];
      return notifyAdmins(supabase, { ...args, skipUserIds: [...skip, OWNER_OPERATIONAL_ID] });
    },
  });
}

const errorText = (error) => String(error?.message || error || 'unknown error').slice(0, 300);
const READ_ONLY = 'push-health problems are reported through pushHealthObservations(), '
  + 'which records each one for the Production Alerts store';

/**
 * What one push-health run observed. `problems` is what push-health tells the
 * other admins and returns, in the same order as before; it is read-only, so a
 * line can only be added by a method below, and every one of them records the
 * store copy too.
 *
 *   fault(name, summary, evidence, { severity, identity, note })
 *       problem reported, condition present (identity: a one-shot event)
 *   clear(name, evidence)             condition observed absent
 *   unverified(name, summary, error)  problem reported to the admins exactly as
 *                                     before, but its read failed: unknown
 *                                     here, and the failure is its own episode
 *   unobserved(name, error?)          not judged this run (an error is its own
 *                                     failure episode)
 *   checkFailed(check, summary, error) a whole check threw
 *   readFailed(check, error)          a store-only read failed, or was cut off
 *                                     (also beside a fault it still found)
 *   passed(check)                     a whole check worked
 *   owner(name, present, evidence)    an owner-account condition (no problem
 *                                     line: it replaces a notice)
 *   reported(name, identity, summary, evidence)  a one-shot event an earlier
 *                                     run told the admins about
 *
 * The first observation of a condition in a run stands; one-shot events are
 * observed one identity at a time, and a condition observed as events is not
 * also observed as a whole. Never throws: a name outside the catalogue is
 * recorded as a failed observation instead.
 */
export function pushHealthObservations() {
  const list = [];
  const refuse = () => { throw new TypeError(READ_ONLY); };
  const problems = new Proxy(list, { set: refuse, defineProperty: refuse, deleteProperty: refuse });
  const observed = new Map();
  const modes = new Map();
  const failures = new Map();
  const worked = new Set();
  const fail = (check, error, told = null, severity = 'warning', kind = 'read') => {
    if (!failures.has(check)) failures.set(check, { error: errorText(error), told, severity, kind });
  };
  const note = (alertname, state, fields = {}) => {
    if (!Object.hasOwn(CATALOGUE, alertname) || alertname === CONDITION.CHECK_FAILED) {
      fail(CHECK.OBSERVATION, `unknown push-health condition ${String(alertname)}`);
      return;
    }
    const mode = fields.identity ? 'event' : 'condition';
    if ((modes.get(alertname) ?? mode) !== mode) return;
    modes.set(alertname, mode);
    const id = fields.identity ? `${alertname} ${JSON.stringify(fields.identity)}` : alertname;
    if (!observed.has(id)) observed.set(id, { alertname, state, summary: null, evidence: {}, ...fields });
  };
  return {
    problems,
    fault(alertname, summary, evidence = {}, { severity = null, identity = null, note: storeNote = null } = {}) {
      list.push(summary);
      note(alertname, 'present', { summary: storeNote ? `${summary} -- ${storeNote}` : summary, told: summary, evidence,
        ...(severity ? { severity } : {}), ...(identity ? { identity } : {}) });
    },
    clear(alertname, evidence = {}) { note(alertname, 'absent', { evidence }); },
    unverified(alertname, summary, error) {
      list.push(summary);
      note(alertname, 'unknown');
      fail(alertname, error, summary, CATALOGUE[alertname]?.[0] || 'warning', 'unverified');
    },
    unobserved(alertname, error = null) {
      note(alertname, 'unknown');
      if (error !== null && error !== undefined) fail(alertname, error);
    },
    checkFailed(check, summary, error) {
      list.push(summary);
      fail(String(check), error, summary, 'warning', 'check');
    },
    readFailed(check, error) { fail(String(check), error); },
    passed(check) { worked.add(String(check)); },
    owner(alertname, present, evidence = {}) {
      note(alertname, present ? 'present' : 'absent', { summary: present ? OWNER_SUMMARY[alertname] ?? null : null, evidence });
    },
    reported(alertname, identity, summary, evidence = {}) {
      note(alertname, 'reported', { identity, summary, evidence });
    },
    conditions() {
      const out = [...observed.values()];
      // A condition observed either way was read, and so was a check that
      // passed, and a run that named no unknown condition observed cleanly -
      // unless a failure is recorded for it too: a cut-off read that still
      // found the fault stays a failed observation (review r25).
      const judged = new Set([CHECK.OBSERVATION, ...worked,
        ...out.filter((c) => c.state !== 'unknown').map((c) => c.alertname)]);
      for (const [check, f] of failures) {
        const summary = f.kind === 'check' ? f.told
          : f.kind === 'unverified' ? `${f.told} -- not verified: push-health could not read ${check}: ${f.error}`
            : `push-health could not observe ${check}: ${f.error}`;
        out.push({ alertname: CONDITION.CHECK_FAILED, check, state: 'present', severity: f.severity,
          summary: String(summary).slice(0, 1000), ...(f.told ? { told: f.told } : {}),
          evidence: { check, error: f.error, ...(f.told ? { told_admins: f.told } : {}) } });
      }
      for (const check of judged) {
        if (!failures.has(check)) out.push({ alertname: CONDITION.CHECK_FAILED, check, state: 'absent', evidence: { check } });
      }
      return out;
    },
  };
}

async function read(query) {
  const { data, error, count } = await query.abortSignal(AbortSignal.timeout(READ_TIMEOUT_MS));
  if (error) throw new Error(errorText(error));
  return { data, count };
}

// ---- 5. Every rotation in the fingerprint log, re-derived for a week --------
export const ROTATION_REDERIVE_MS = 8 * 86400_000;

/** One rotation's identity: the fingerprint row it replaced and the key it rotated to. */
export function vapidRotation(replacedRow, fingerprint) {
  return { from: replacedRow?.note ?? null, fromSlot: replacedRow?.slot ?? null, to: fingerprint };
}

/**
 * Every rotation the fingerprint log (newest first, push_dispatch_runs ordered
 * by started_at) says was already logged, while it is recent enough to still
 * owe the store its episode (two rotations during a store outage are two).
 */
export function settledVapidRotations(log, now) {
  const entries = Array.isArray(log) ? log : [];
  const rotations = [];
  for (let i = 0; i + 1 < entries.length; i += 1) {
    const [newer, older] = [entries[i], entries[i + 1]];
    const at = Date.parse(newer?.slot);
    if (!Number.isFinite(at) || now - at > ROTATION_REDERIVE_MS) break;
    if (newer.note && older?.note && newer.note !== older.note) {
      rotations.push({ identity: vapidRotation(older, newer.note), rotatedAt: newer.slot });
    }
  }
  return rotations;
}

// ---- 6. Detection ---------------------------------------------------------------
// A judged window ends when the detector looked (its marker's slot, the
// function's clock); the database's clock stamps a notice's created_at. The
// margin covers the skew between the two and a notice written while the
// detector's reads ran (bounded by their timeouts). A notice inside the
// margin can be found by two runs; its episode then stays open one run longer.
const WRITE_MARGIN_MS = 10 * 60_000;
// Before push-health's first store write: cron_health_log.last_run_at is the
// function's clock, so the window opens a margin after a clean run.
const CLOCK_SKEW_MARGIN_MS = 120_000;
// No run recorded at all: one daily cycle plus slack.
const FIRST_RUN_LOOKBACK_MS = 25 * 3600_000;

const windowFrom = (value, now, from) => {
  const at = Date.parse(value);
  if (!Number.isFinite(at) || at > now + 60_000) throw new Error(`the ${from} time is unreadable`);
  return { since: new Date(at - WRITE_MARGIN_MS).toISOString(), from };
};

/**
 * Where the detector's window starts: where the last window that was actually
 * judged AND recorded ended - the push-health-detector marker
 * recordPushHealthAlerts writes once the store acknowledged that run, whose
 * slot is when its detector looked - less the margin. A run whose detector
 * could not look writes no marker, so the next window still covers what it
 * missed; so does a run whose store write failed. A notice from an older
 * deployment that ran push-health the old way is after the marker, so it is
 * found. Before the first marker: push-health's first store write (nothing
 * since has been judged), else the previous run - after its end when it
 * succeeded (a pre-fix run's own notices are history, not a recurrence), from
 * its start when it failed. Null when that window has not opened yet: an empty
 * window is not "none found". A marker that was not written (after an
 * acknowledged write) only widens the next window: a notice already recorded
 * can be found again, never one missed.
 */
async function detectionWindow(supabase, now) {
  const { data: judged } = await read(supabase.from('push_dispatch_runs').select('slot')
    .eq('job', PUSH_HEALTH_JOBS.DETECTOR).order('slot', { ascending: false }).limit(1));
  if (!Array.isArray(judged)) throw new Error('detector window lookup returned no row set');
  if (judged[0]) return windowFrom(judged[0].slot, now, 'last judged window');
  const { data: written } = await read(supabase.from('operational_alert_events').select('received_at')
    .eq('source', PUSH_HEALTH_SOURCE).order('received_at', { ascending: true }).limit(1));
  if (!Array.isArray(written)) throw new Error('operational alert lookup returned no row set');
  if (written[0]) return windowFrom(written[0].received_at, now, 'first store write');
  const { data } = await read(supabase.from('cron_health_log').select('last_run_at, last_status, last_duration_ms')
    .eq('cron_name', PUSH_HEALTH_CRON).limit(1));
  const row = Array.isArray(data) ? data[0] : null;
  if (!row) return { since: new Date(now - FIRST_RUN_LOOKBACK_MS).toISOString(), from: 'first run' };
  const end = Date.parse(row.last_run_at);
  if (!Number.isFinite(end) || end > now + 60_000) throw new Error('previous push-health run time is unreadable');
  let start = end + CLOCK_SKEW_MARGIN_MS;
  if (row.last_status !== 'success') {
    const took = Number(row.last_duration_ms);
    if (!Number.isSafeInteger(took) || took < 0) throw new Error('the failed previous push-health run has no duration');
    start = end - took - CLOCK_SKEW_MARGIN_MS;
  }
  return start < now ? { since: new Date(start).toISOString(), from: 'previous run' } : null;
}

// A captured original is windowed by when the notice was WRITTEN (the complete
// original row it holds, created_at included), never by when it was captured.
// A classifier install's history intake captures weeks-old notices at install
// time - Club Arena migration 20260928171444 preserves the owner account's
// 2026-08-19 "Push Notifications Are Off" that way - and those are history,
// not a recurrence. PostgREST compares original_notification->>created_at as
// text, so the server-side filter only narrows, with a day of slack for any
// UTC offset a rendering could carry (every capture renders UTC), and the
// exact comparison is made here, as instants.
const WRITTEN_TEXT_SLACK_MS = 86400_000;
const CAPTURED_READ_LIMIT = 50;

function capturedSince({ data, count }, since) {
  if (!Array.isArray(data)) throw new Error('owner notice lookup returned no row set');
  const floor = Date.parse(since);
  const written = data.map((row) => ({ id: row?.notification_id, at: Date.parse(row?.written) }));
  if (written.some((row) => !Number.isFinite(row.at))) throw new Error('a captured original has no readable created_at');
  const fresh = written.filter((row) => row.at > floor);
  // Cut off, or not counted, with nothing new among what came back: the rest
  // is not "none" (a count that did not come back is incomplete, review r27).
  if ((!Number.isSafeInteger(count) || count > data.length) && fresh.length === 0) {
    throw new Error('captured originals were cut off, or not counted, before any written in the window was seen');
  }
  return { count: fresh.length, ids: fresh.map((row) => row.id) };
}

/**
 * DETECTION. Did any push-health notice reach the owner account that the store
 * does not have yet? Personal inbox rows, push_outbox rows, and originals the
 * classifier captured (store-only delivery writes no personal row for those,
 * so the capture is the only trace), each by when the notice was written. Run
 * it after this run's notices are sent, so a notice this very run addressed to
 * him is found too. A failed read is unknown, never "none found".
 */
export async function observeOwnerAddressedNotices(supabase, health, { now = Date.now() } = {}) {
  try {
    const scope = await detectionWindow(supabase, now);
    if (scope === null) {
      health.unobserved(CONDITION.OWNER_ADDRESSED);
      return;
    }
    const { since } = scope;
    const titles = [...PUSH_HEALTH_NOTICE_TITLES];
    const [inbox, outbox, routed] = await Promise.all([
      read(supabase.from('notifications').select('id', { count: 'exact' })
        .eq('user_id', OWNER_OPERATIONAL_ID).eq('type', 'system').in('title', titles)
        .gt('created_at', since).limit(10)),
      read(supabase.from('push_outbox').select('id', { count: 'exact' })
        .eq('recipient_user_id', OWNER_OPERATIONAL_ID).eq('event', 'system').in('title', titles)
        .gt('created_at', since).limit(10)),
      // Written after `since` implies captured after it; the text filter drops
      // anything written more than a day before, and capturedSince decides.
      read(supabase.from('operational_notification_destinations')
        .select('notification_id, written:original_notification->>created_at', { count: 'exact' })
        .eq('recipient_user_id', OWNER_OPERATIONAL_ID).eq('original_notification->>type', 'system')
        .in('original_notification->>title', titles).gt('captured_at', since)
        .gt('original_notification->>created_at', new Date(Date.parse(since) - WRITTEN_TEXT_SLACK_MS).toISOString())
        .order('captured_at', { ascending: false }).limit(CAPTURED_READ_LIMIT)),
    ]);
    const counted = ({ data, count }, key) => {
      if (!Array.isArray(data)) throw new Error('owner notice lookup returned no row set');
      return { count: Number.isSafeInteger(count) ? count : data.length, ids: data.map((row) => row?.[key]) };
    };
    const found = {
      personal_inbox: counted(inbox, 'id'),
      push_outbox: counted(outbox, 'id'),
      captured_originals: capturedSince(routed, since),
    };
    const total = found.personal_inbox.count + found.push_outbox.count + found.captured_originals.count;
    health.owner(CONDITION.OWNER_ADDRESSED, total > 0, { since, until: new Date(now).toISOString(), window_from: scope.from, ...found });
  } catch (error) {
    health.unobserved(CONDITION.OWNER_ADDRESSED, error);
  }
}

// ---- 2. The episode chain ------------------------------------------------------
const CHAIN_COLUMNS = 'id, event_key, status, investigation_status, received_at, unresolved:payload->unresolved, '
  + 'unresolved_since:payload->>unresolved_since, observed_at:payload->>observed_at';

function checkedRows(data) {
  if (!Array.isArray(data)) throw new Error('operational alert lookup returned no row set');
  for (const row of data) {
    if (typeof row?.event_key !== 'string' || !row.event_key || !Number.isSafeInteger(row.id)
        || !Number.isFinite(Date.parse(row.received_at))
        || (row.observed_at != null && !Number.isFinite(Date.parse(row.observed_at)))
        || (row.unresolved != null && (!Array.isArray(row.unresolved)
          || row.unresolved.some((key) => typeof key !== 'string' || !key)))) {
      throw new Error('operational alert lookup returned an invalid row');
    }
  }
  return data;
}

async function latestRow(supabase, alertname, check) {
  let query = supabase.from('operational_alert_events').select(CHAIN_COLUMNS)
    .eq('source', PUSH_HEALTH_SOURCE).eq('alertname', alertname);
  if (check !== null) query = query.eq('payload->>check', check);
  const { data } = await read(query.order('received_at', { ascending: false }).order('id', { ascending: false }).limit(1));
  return checkedRows(data)[0] || null;
}

const episodeKey = (condition, identity) => alertEventKey({ source: PUSH_HEALTH_SOURCE, alertname: condition.alertname,
  ...(condition.check ? { check: condition.check } : {}), ...identity });

// A one-shot event's own row, wherever it sits in the chain (after two
// rotations the newest row is the other rotation's).
async function eventRow(supabase, condition) {
  const { data } = await read(supabase.from('operational_alert_events').select(CHAIN_COLUMNS)
    .eq('source', PUSH_HEALTH_SOURCE).eq('alertname', condition.alertname)
    .eq('event_key', episodeKey(condition, { event: condition.identity })).limit(1));
  return { firing: checkedRows(data)[0] || null };
}

// When a row's own episode opened: the run that observed it, whenever it was
// recorded - never a predecessor it carries.
const ownOpening = (row) => row.observed_at || row.received_at;
const isOpen = (row) => row.status === 'firing' && !NOT_AN_EPISODE.includes(row.investigation_status)
  && !CLOSED.includes(row.investigation_status);

/**
 * The store events for one observed condition, given the newest-created row of
 * its chain (and, for a one-shot event, its own row). Exported for the
 * regression tests.
 *   present:  reuse the open episode's key, or open a new one chained to the
 *             row before it (deterministic, so a retried or concurrent run
 *             lands on the same row, and never a closed one); a one-shot event
 *             is keyed by its identity and recorded once;
 *   reported: a one-shot event an earlier run told the admins about: recorded
 *             if the store does not hold it;
 *   absent:   a condition closed by the fleet: nothing. Any other: resolve the
 *             newest firing row and every row it carries, if this observation
 *             was made after that episode opened;
 *   unknown:  nothing.
 * `replayed`: the observation was kept from a refused run and is older than
 * anything recorded since (review r25). Present, it adds to an open episode or
 * opens the first one, or one after a recovery it postdates. After a row the
 * task closed or marked `test` it is dropped - the row does not say whether the
 * task acted before or after the observation, and a condition that persists is
 * observed again by the next live run - and so it is after any row observed
 * later than it.
 */
export function episodeEvents(condition, latest, observedAt, own = null, { replayed = false } = {}) {
  const [defaultSeverity, notice] = CATALOGUE[condition.alertname];
  const check = condition.check ?? null;
  const fleet = closedByFleet(condition.alertname);
  // Nothing resolved the newest link yet (recoveries are newer rows).
  const unresolved = Boolean(latest) && !NOT_AN_EPISODE.includes(latest.investigation_status) && latest.status === 'firing';
  const label = check ? `${condition.alertname} (${check})` : condition.alertname;
  const base = { target_task_id: ALERT_TASK_ID, condition: condition.alertname, ...(check ? { check } : {}),
    route: 'push-health', replaces_personal_notice: notice, observed_at: observedAt, evidence: condition.evidence || {},
    ...(fleet ? { resolved_by: FLEET_RESOLUTION } : {}) };
  const key = (identity) => episodeKey(condition, identity);
  const fire = (eventKey, summary, extra = {}) => {
    // A recurrence after a firing row nothing resolved carries it, so that row
    // still gets its recovery when this one does. A condition the fleet closes
    // has no recoveries to carry.
    const carried = !fleet && unresolved && latest.event_key !== eventKey
      ? [...(latest.unresolved || []), latest.event_key].slice(-MAX_CARRIED) : [];
    return { source: PUSH_HEALTH_SOURCE, event_key: eventKey, alertname: condition.alertname, status: 'firing',
      severity: condition.severity || defaultSeverity,
      payload: { ...base, summary: summary ?? label, ...extra,
        ...(carried.length ? { unresolved: carried, unresolved_since: latest.unresolved_since || ownOpening(latest) } : {}) } };
  };

  if (condition.identity) {
    if (condition.state !== 'present' && condition.state !== 'reported') return [];
    const eventKey = key({ event: condition.identity });
    const held = own ? own.firing : (latest?.event_key === eventKey ? latest : null);
    if (held) return condition.state === 'present' && isOpen(held) ? [fire(eventKey, condition.summary)] : [];
    return [fire(eventKey, condition.summary, { event: condition.identity,
      ...(condition.state === 'reported' ? { recorded_late: true } : {}) })];
  }
  if (condition.state === 'present') {
    if (latest && isOpen(latest)) return [fire(latest.event_key, condition.summary)];
    // A replayed observation never reopens what the task closed or marked
    // `test`, nor opens an episode behind a row observed later than it.
    if (replayed && latest && (latest.status === 'firing'
        || !(Date.parse(observedAt) > Date.parse(ownOpening(latest))))) return [];
    const after = latest?.event_key ?? null;
    return [fire(key({ after }), condition.summary, { episode_after: after })];
  }
  if (condition.state === 'absent' && !fleet && unresolved) {
    // Only an observation made after this episode opened can resolve it (a
    // recurrence is not resolved by what was seen before it).
    if (!(Date.parse(observedAt) > Date.parse(ownOpening(latest)))) return [];
    return [...new Set([latest.event_key, ...(latest.unresolved || [])])].map((firingKey) => ({
      source: PUSH_HEALTH_SOURCE, event_key: `${firingKey}:resolved`, alertname: condition.alertname, status: 'resolved',
      severity: 'info', payload: { ...base, summary: `push-health observed ${label} cleared`, resolves: firingKey,
        ...(firingKey === latest.event_key ? { resolves_event_id: latest.id } : {}) } }));
  }
  return [];
}

// ---- The store write, and what a refused one keeps ------------------------------
// Kept runs replayed per run, oldest first; the rest wait for the next.
const OWED_READ_LIMIT = 20;
// At most this many runs are kept: a longer outage keeps no more (the run says so).
const MAX_KEPT_RUNS = 60;
// A claim older than this belongs to a run that died replaying: another may take it.
const CLAIM_LEASE_MS = 15 * 60_000;
// Conditions about the owner account: a kept row (push_dispatch_runs is read
// by every admin) holds their keys and nothing else.
const OWNER_SPECIFIC = Object.freeze([CONDITION.OWNER_PUSH_OFF, CONDITION.OWNER_DEVICE_NOT_CONFIRMING,
  CONDITION.OWNER_ADDRESSED]);

/**
 * What a kept row holds for one condition (review round 4): its key, its
 * counts, the line the admins were already told (a failed check's line names
 * the error it reported), and when it was observed - never a notification id,
 * a receipt time, or any line or evidence about the owner account (for his
 * conditions, only the key and its state). The detector's own observation is
 * not kept at all: a refused run writes no detector marker, so the next window
 * starts before it and finds the same notices again, with their evidence.
 */
export function keptCondition(c) {
  const owner = OWNER_SPECIFIC.includes(c.alertname) || OWNER_SPECIFIC.includes(c.check);
  const counts = owner ? {} : Object.fromEntries(Object.entries(c.evidence || {})
    .filter(([, value]) => Number.isSafeInteger(value) || value === null));
  return { alertname: c.alertname, ...(c.check ? { check: c.check } : {}), state: c.state,
    ...(c.severity ? { severity: c.severity } : {}), ...(c.identity ? { identity: c.identity } : {}),
    ...(c.told && !owner ? { told: c.told } : {}),
    ...(c.identity && typeof c.evidence?.rotatedAt === 'string' ? { rotatedAt: c.evidence.rotatedAt } : {}),
    counts };
}

function replayedCondition(k) {
  const label = k.check ? `${k.alertname} (${k.check})` : k.alertname;
  const summary = k.told ?? (k.rotatedAt ? `VAPID key rotated at ${k.rotatedAt}` : null) ?? OWNER_SUMMARY[k.alertname]
    ?? (k.state === 'present' ? `push-health observed ${label} (kept from a refused run; its details were not kept)` : null);
  return { alertname: k.alertname, ...(k.check ? { check: k.check } : {}), state: k.state,
    ...(k.severity ? { severity: k.severity } : {}), ...(k.identity ? { identity: k.identity } : {}),
    summary, evidence: { ...(k.counts || {}) } };
}

function keptRun(row) {
  let kept;
  try {
    kept = JSON.parse(row?.note);
  } catch {
    kept = null;
  }
  if (!kept || !Number.isFinite(Date.parse(kept.observed_at)) || !Array.isArray(kept.conditions)
      || kept.conditions.some((c) => !Object.hasOwn(CATALOGUE, c?.alertname) || !STATES.includes(c.state))) {
    throw new Error(`the push-health observations kept at ${String(row?.slot)} are unreadable`);
  }
  return { observedAt: kept.observed_at, conditions: kept.conditions.map(replayedCondition) };
}

async function eventsFor(supabase, conditions, observedAt, { replayed = false } = {}) {
  const events = new Map();
  for (const condition of conditions) {
    if (!STATES.includes(condition.state)) continue;
    // Sequential and a row or two each: exact, and bounded by the catalogue.
    // eslint-disable-next-line no-await-in-loop
    const latest = await latestRow(supabase, condition.alertname, condition.check ?? null);
    // eslint-disable-next-line no-await-in-loop
    const own = condition.identity ? await eventRow(supabase, condition) : null;
    for (const event of episodeEvents(condition, latest, observedAt, own, { replayed })) {
      // One event per key in a delivery.
      if (!events.has(event.event_key)) events.set(event.event_key, JSON.parse(JSON.stringify(event)));
    }
  }
  const list = [...events.values()];
  if (list.some((event) => event.payload?.target_task_id !== ALERT_TASK_ID)) {
    throw new Error('push-health alert is not addressed to the Production Alerts task');
  }
  return list;
}

async function deliver(record, events, out) {
  for (let at = 0; at < events.length; at += BATCH) {
    const batch = events.slice(at, at + BATCH);
    // eslint-disable-next-line no-await-in-loop
    const receipts = await record(batch);
    if (!Array.isArray(receipts) || receipts.length !== batch.length
        || receipts.some((id) => !Number.isSafeInteger(id) || id <= 0)) {
      throw new Error('Operational inbox returned an invalid receipt');
    }
    out.receipts.push(...receipts);
  }
}

/**
 * Replay what earlier refused runs kept, oldest first. Each kept row is first
 * CLAIMED by a conditional update that moves it out of the state this run read
 * it in, so of two overlapping runs only one replays it (review round 4); a
 * claim whose run died lapses after CLAIM_LEASE_MS. A run that finds a row
 * claimed by another stops, so its own observations never overtake an older
 * run's. A replayed observation never reopens an episode the task closed
 * (episodeEvents, `replayed`). Returns why this run must keep its own instead
 * of recording them, or null.
 */
async function replayKept(supabase, record, out, now) {
  const { OWED, CLAIMED, DELIVERED } = PUSH_HEALTH_JOBS;
  const at = new Date(now).toISOString();
  const { data, count } = await read(supabase.from('push_dispatch_runs').select('id, job, slot, note, finished_at',
    { count: 'exact' }).in('job', [OWED, CLAIMED]).order('slot', { ascending: true }).limit(OWED_READ_LIMIT));
  if (!Array.isArray(data) || !Number.isSafeInteger(count)) throw new Error('kept push-health observations returned no row set');
  for (const row of data) {
    const lapsed = row.job === CLAIMED && Date.parse(row.finished_at) < now - CLAIM_LEASE_MS;
    if (row.job === CLAIMED && !lapsed) return 'another push-health run is replaying kept observations';
    const claim = supabase.from('push_dispatch_runs').update({ job: CLAIMED, finished_at: at })
      .eq('id', row.id).eq('job', row.job);
    // eslint-disable-next-line no-await-in-loop
    const { data: won } = await read((row.job === CLAIMED ? claim.eq('finished_at', row.finished_at)
      : claim.is('finished_at', null)).select('id'));
    if (!Array.isArray(won) || won.length !== 1) return 'another push-health run claimed a kept observation first';
    let events;
    try {
      const kept = keptRun(row);
      // eslint-disable-next-line no-await-in-loop
      events = (await eventsFor(supabase, kept.conditions, kept.observedAt, { replayed: true }))
        .map((event) => ({ ...event, payload: { ...event.payload, recorded_late: true } }));
      // eslint-disable-next-line no-await-in-loop
      await deliver(record, events, out);
    } catch (error) {
      // Give it back to the next run; if that fails too, its claim lapses.
      try {
        // eslint-disable-next-line no-await-in-loop
        await read(supabase.from('push_dispatch_runs').update({ job: OWED, finished_at: null })
          .eq('id', row.id).eq('job', CLAIMED));
      } catch (releaseError) {
        throw new Error(`${errorText(error)}; its claim lapses in 15 minutes (release failed: ${errorText(releaseError)})`);
      }
      throw error;
    }
    // eslint-disable-next-line no-await-in-loop
    await read(supabase.from('push_dispatch_runs').update({ job: DELIVERED, finished_at: at, sent: events.length })
      .eq('id', row.id).eq('job', CLAIMED));
    out.replayed += 1;
  }
  return count > data.length ? `${count - data.length} earlier refused run(s) are still owed to the store` : null;
}

/**
 * Record this run's episodes for the owner account in the Production Alerts
 * store. Never throws: the result says whether the store acknowledged every
 * event, and push-health reports a failure as a failed run (there is never a
 * personal fallback).
 *
 * NOTHING THE ADMINS WERE TOLD IS LOST (review round 3). A fault present only
 * in a refused run cannot be re-derived later, so a refused run keeps its
 * observations in push_dispatch_runs (keptCondition: keys, counts, the admins'
 * lines, no owner-account evidence), and every run first replays what is kept
 * (replayKept), then records its own. The residuals: a run whose store write
 * AND whose keeping both fail loses its one-off observations, and says so; and
 * at most MAX_KEPT_RUNS runs are kept.
 *
 * After an acknowledged write in which the detector judged its window, it
 * writes the push-health-detector marker (slot = when the detector looked, no
 * note) the next window starts from.
 */
export async function recordPushHealthAlerts(supabase, conditions, { record = recordOperationalAlerts, now = Date.now() } = {}) {
  const out = { ok: false, fired: 0, resolved: 0, receipts: [], replayed: 0, kept: 0, error: null };
  const observedAt = new Date(now).toISOString();
  const mine = conditions.filter((c) => STATES.includes(c.state)).map((c) => JSON.parse(JSON.stringify(c)));
  try {
    const waiting = await replayKept(supabase, record, out, now);
    if (waiting) throw new Error(waiting);
    const events = await eventsFor(supabase, mine, observedAt);
    await deliver(record, events, out);
    out.fired = events.filter((event) => event.status === 'firing').length;
    out.resolved = events.filter((event) => event.status === 'resolved').length;
    out.ok = true;
  } catch (error) {
    out.error = errorText(error);
    console.warn('[push-health] owner-account operational alerts were not recorded:', out.error);
    const kept = mine.filter((c) => c.alertname !== CONDITION.OWNER_ADDRESSED).map(keptCondition);
    if (kept.length) {
      try {
        const { count } = await read(supabase.from('push_dispatch_runs').select('id', { count: 'exact', head: true })
          .in('job', [PUSH_HEALTH_JOBS.OWED, PUSH_HEALTH_JOBS.CLAIMED]));
        if (!Number.isSafeInteger(count)) throw new Error('the number of kept runs was not returned');
        if (count >= MAX_KEPT_RUNS) throw new Error(`${count} refused runs are already kept`);
        await read(supabase.from('push_dispatch_runs').insert({ job: PUSH_HEALTH_JOBS.OWED, slot: observedAt,
          note: JSON.stringify({ observed_at: observedAt, conditions: kept }), claimed: kept.length }));
        out.kept = kept.length;
      } catch (keepError) {
        out.error = `${out.error}; and this run's observations could not be kept for the next run: ${errorText(keepError)}`;
      }
    }
  }
  // The window this run judged is recorded: the next one starts where it ended.
  const detection = conditions.find((c) => c.alertname === CONDITION.OWNER_ADDRESSED && !c.check);
  const until = detection?.evidence?.until;
  if (out.ok && ['present', 'absent'].includes(detection?.state) && Number.isFinite(Date.parse(until))) {
    try {
      await read(supabase.from('push_dispatch_runs').insert({ job: PUSH_HEALTH_JOBS.DETECTOR, slot: until,
        finished_at: observedAt }));
    } catch (error) {
      out.detectorWindow = `not marked: ${errorText(error)}`;
    }
  }
  return out;
}
