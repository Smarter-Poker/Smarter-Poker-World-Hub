/**
 * ===========================================================================
 *  CRON: /api/cron/push-health
 *  Schedule: daily 13:00 UTC, from Open Claw (Hetzner), NOT vercel.json.
 *
 *  THE WATCHDOG.
 *
 *  Web push fails silently by design. FCM and Apple answer 2xx for endpoints
 *  whose device was wiped months ago, so a dashboard built on send results will
 *  cheerfully report 100 percent success while a user's phone has been dead
 *  quiet for a week. This job is the only thing in the stack that can tell the
 *  difference, and it does it by comparing what we SENT (last_used_at) against
 *  what the service worker CONFIRMED it displayed (last_receipt_at).
 *
 *  Four checks:
 *    1. ZOMBIE SUBSCRIPTIONS  active + recently pushed + no receipt in 3 days
 *    2. STAFF UNREACHABLE     admin/god accounts with no active subscription
 *    3. CONFIGURATION         VAPID env vars missing or mismatched
 *    4. DISPATCH LIVENESS     push-dispatch has not run in over 30 minutes
 *
 *  Findings go to the affected user in-app, and a summary to every admin.
 *
 *  EXCEPT THE OWNER ACCOUNT (2026-09-28). What this job finds is an
 *  operational alert, and for the owner account operational alerts belong to
 *  the Production Alerts task, never his personal inbox or phone. Every notice
 *  goes through pushHealthNotices, which cannot address him; each condition is
 *  recorded instead as a store episode that coalesces while it persists. A
 *  condition that clears only when devices change (zombies, staff or the owner
 *  account without a device, duplicates, no device at all) and a key rotation
 *  (nothing push-health reads shows one is over) are closed by the Production
 *  Alerts fleet, never here; one that push-health observes directly with a
 *  complete read (dispatcher, backlog, delivery, keys, the detector's window,
 *  a check that completes) is resolved on the same source by a later run that
 *  sees it cleared. Every line the admins are told has its own addressed store
 *  copy, kept for the next run if the store refuses it. Every other recipient
 *  gets exactly the notice it always did.
 *  See src/lib/push/pushHealthOperationalAlerts.mjs.
 * ===========================================================================
 */
import { createHash } from 'crypto';
import { createClient } from '../../../src/lib/supabaseServerClient';
// Pure, no imports, so the retirement decision can be tested by RUNNING it.
// See the note in that file: the pins this replaced were regexes over THIS
// file's source, and all of them passed while the bug was live.
import { selectRetirable, selectDuplicateConfirmers } from '../../../src/lib/pushDeviceGroups.js';
import { validateCronAuth } from '../../../src/utils/cron-auth';
import { withCronHealth } from '../../../src/lib/cronHealth';
import { vapidConfig, isPushConfigured } from '../../../src/lib/push/web-push';
import { notify, notifyAdmins } from '../../../src/lib/notify';
// The cooldown lookup: which recipients were already told within the window.
// The owner account is never in the lists this route passes it (see below), so
// its once-per-window rule is the store episode, not the cooldown.
import { filterRecentlyAlerted } from '../../../src/lib/push/alertCooldown.mjs';
// The owner account's copy of everything this job finds: store episodes (with
// recoveries where push-health sees the condition clear itself), plus the only
// way this job may address a person.
import { CHECK, CONDITION, includesOwnerAccount, isOwnerAccount, observeOwnerAddressedNotices, personalRecipients, pushHealthNotices, pushHealthObservations, recordPushHealthAlerts, settledVapidRotations, vapidRotation } from '../../../src/lib/push/pushHealthOperationalAlerts.mjs';

const ZOMBIE_RECEIPT_DAYS = 3;
// Ceiling on per-user alerts in one run. Each alert is a notifications insert
// plus a full enqueuePush; an unbounded serial loop would exceed the function
// timeout and the run would report nothing at all.
const MAX_ALERTS_PER_RUN = 100;
const DISPATCH_STALE_MINUTES = 30;
// Fingerprint log entries read: a week of rotations is re-derived from them.
const FINGERPRINT_LOG_READ = 30;
// A daily watchdog that re-nags the same person every single day trains them to
// ignore it, which defeats the whole point. Each person hears about a given
// problem at most once per this window.
const ALERT_COOLDOWN_DAYS = 7;

let _supabase = null;
function getSupabase() {
    if (!_supabase) _supabase = createClient();
    return _supabase;
}

// The only way this route addresses a person. It refuses the owner account
// and skips him in the admin fan-out; nobody else sees any difference.
const notices = pushHealthNotices({ notify, notifyAdmins });

async function handler(req, res) {
    let authed;
    try {
        authed = validateCronAuth(req);
    } catch {
        return res.status(500).json({ error: 'Cron authentication is not configured' });
    }
    if (!authed) return res.status(401).json({ error: 'Unauthorized' });

    const supabase = getSupabase();
    // `problems` is what every other admin is told, in the order it always
    // was. `health` also keeps what each check observed - present, absent or
    // not observable - which is what the owner account's store copy is made of.
    const health = pushHealthObservations();
    const problems = health.problems;
    const report = { zombies: 0, staffUnreachable: 0, configOk: true, dispatchOk: true };

    const now = Date.now();
    const zombieCutoff = new Date(now - ZOMBIE_RECEIPT_DAYS * 86400_000).toISOString();
    const cooldownSince = new Date(now - ALERT_COOLDOWN_DAYS * 86400_000).toISOString();
    const usedSince = new Date(now - ZOMBIE_RECEIPT_DAYS * 86400_000).toISOString();

    // ---- CHECK 1: zombie subscriptions ------------------------------------
    try {
        /* THE GRACE PERIOD DECIDES WHO IS A ZOMBIE. IT MUST NOT DECIDE WHO
           COUNTS AS PROOF (2026-09-07).

           `.lt('created_at', zombieCutoff)` used to be part of this query, and
           it silently did TWO jobs: it withheld young rows from being branded
           zombies, which is right, and it also withheld them from
           `confirmingByUser` below, which is what broke the retire.

           Measured on Dan's account. Four active rows, two physical devices:

             iPhone  ff4645d3  created 09-05  last_receipt 09-07 17:12  <- proof
             iPhone  657b16e5  created 08-26  last_receipt NULL         <- zombie
             Mac     ec90f0f1  created 09-07  last_receipt 09-07 17:12  <- proof
             Mac     f902fc7b  created 09-01  last_receipt 09-01 02:11  <- zombie

           Both CONFIRMING rows were created inside the three-day window, so the
           query excluded them, so `confirmingByUser` did not contain Dan, so
           nothing was retirable and both silent rows stayed live. He received
           the Estate Digest and the engine-break alert twice, on one phone,
           while the sweep built to prevent exactly that reported zero.

           The grace period now applies where it belongs - to `matured`, below -
           and evidence is read from every active row. */
        // The count says whether every row came back. A cut-off read is not
        // evidence that the rest are healthy (it only affects the store copy).
        const { data: subs, error: subsErr, count: subsCount } = await supabase
            .from('push_subscriptions')
            .select(
                'id, user_id, device_label, endpoint, user_agent, last_used_at, last_receipt_at, created_at',
                { count: 'exact' }
            )
            .eq('is_active', true)
            .gte('last_used_at', usedSince);

        // A failed query must not read as "0 zombies, all healthy". That is the
        // green-dashboard-silent-phones failure this watchdog exists to catch,
        // and it was reintroduced here by discarding `error`.
        if (subsErr) throw new Error(subsErr.message);

        // Date.parse on BOTH sides. PostgREST returns '...123456+00:00' while
        // toISOString() gives '...123Z'; lexicographic ordering happens to work
        // for values seconds apart but is wrong at sub-second boundaries and
        // breaks outright if PostgREST ever returns a non-UTC offset.
        const zombieCutoffMs = Date.parse(zombieCutoff);
        const all = subs || [];
        // A cut-off read is not evidence that the rows it missed are healthy
        // (store copy only: it is recorded as a failed observation).
        const zombieUnread = Number.isSafeInteger(subsCount) && all.length >= subsCount ? null
            : `read ${all.length} of ${subsCount ?? 'an unknown number of'} recently pushed subscriptions`;

        // GRACE PERIOD, applied here rather than in the query. A device that
        // enrolled ten minutes ago and was pushed once has last_receipt_at =
        // null (phone asleep, beacon not fired) and must not be branded a
        // zombie -- the user's first experience of push would be an alarming
        // "notifications are not reaching you".
        const matured = all.filter((s) => Date.parse(s.created_at || 0) < zombieCutoffMs);
        const isConfirming = (s) =>
            s.last_receipt_at && Date.parse(s.last_receipt_at) >= zombieCutoffMs;
        const zombies = matured.filter((s) => !isConfirming(s));
        report.zombies = zombies.length;

        /* ═══ RETIRE A ZOMBIE ONLY WHEN A SIBLING PROVES THE DEVICE IS FINE ═══
         *
         * Dan 2026-08-30. This check has always ALERTED and never retired, so a
         * dead endpoint stays `is_active` forever and every send pays for it.
         * Measured 2026-08-29: one account held eleven active subscriptions of
         * which nine were redundant, and a single seat offer was delivered to
         * the same iPhone twice.
         *
         * Retiring on "no receipt" ALONE would be a guess, and the wrong kind:
         * a receipt can be missing because the device is genuinely dead, or
         * because the beacon is blocked, or because the user simply has not
         * unlocked their phone. Acting on that would silence a working device
         * and the owner would have no way to tell why. That is why this block
         * only alerted, and alerting-only was the right call in the absence of
         * a second signal.
         *
         * THE SECOND SIGNAL. If the SAME USER has another active endpoint that
         * IS confirming receipts inside the same window, then delivery to that
         * person demonstrably works — so a silent endpoint beside a talking one
         * is dead, not merely quiet. That is evidence rather than a guess, and
         * it is exactly the shape of the leftover pair on Dan's iPhone.
         *
         * Deliberately conservative in three ways:
         *   - a user with NO confirming endpoint is never touched, so nobody is
         *     ever left unreachable by this code (the alert above still fires
         *     for them, which is the correct outcome);
         *   - the newest endpoint per user is never retired, because a device
         *     enrolled moments ago has not had time to confirm anything;
         *   - `is_active` is scoped in the UPDATE, so a row another process has
         *     already retired is not counted twice.
         */
        /* AND THE PROOF IS PER DEVICE, NOT PER PERSON (2026-09-07).

           `confirmingByUser` asked "does this PERSON have anything that
           delivers". That is too weak in one direction and too strong in the
           other: a working Mac authorised retiring a genuinely-silent iPhone,
           while two rows belonging to ONE phone were never compared with each
           other at all.

           The group is (user, push host, user agent). Two rows in it are the
           same physical device wearing two `device_id`s -- which is the whole
           reason the UNIQUE (user_id, device_id) index cannot see this pair:
           `deviceId` lives in localStorage, an installed PWA and a browser tab
           on one phone do not share that storage, so one device mints two ids
           and keeps both lineages alive for ever. Every retire in this codebase
           matches on `device_id`, so none of them can see across the pair.

           `user_agent` is deliberately part of the key. Two identical iPhones
           on one account produce byte-identical strings and would be merged by
           it -- which is exactly why the receipt is still required: a row is
           only retired when a sibling in its own group PROVES delivery works.
           Nothing here can silence a device that is the only live row it has. */
        const retirable = selectRetirable(all, zombies, zombieCutoffMs);

        report.zombiesRetired = 0;
        if (retirable.length > 0) {
            try {
                const { error: retireErr } = await supabase
                    .from('push_subscriptions')
                    .update({
                        is_active: false,
                        last_failure_reason: 'no_receipt_while_sibling_confirmed',
                        updated_at: new Date().toISOString(),
                    })
                    .in('id', retirable.map((z) => z.id))
                    .eq('is_active', true);
                if (retireErr) throw new Error(retireErr.message);
                report.zombiesRetired = retirable.length;
            } catch (e) {
                /* Never fail the health run over a cleanup — the alert below is
                   the part that must not be lost.

                   Reported on the report object rather than pushed onto a
                   `report.errors` array: this report has no such array, and
                   inventing one inside a catch is how a cleanup failure turns
                   into a TypeError that takes down the health check it was
                   attached to. */
                report.zombieRetireError = String(e?.message || e).slice(0, 200);
            }
        }

        /* ── THE OTHER HALF OF THE SAME DUPLICATE ──────────────────────────
           `selectRetirable` draws only from `zombies`, and a zombie is by
           definition NOT confirming. So the block above can only ever fix the
           pair shape "one delivering, one silent". A group holding TWO rows
           that both deliver is two banners on one screen and nothing above can
           see it: neither row ever falls silent, and the UNIQUE index is on
           (user_id, device_id), which differ.

           That is not a rare shape. It is what the morning's pair became once
           the browser minted a fresh deviceId at 19:42 and that row began
           confirming - measured on Dan's Mac the same day, both rows on
           fcm.googleapis.com with a byte-identical user_agent.

           Deciding this one needs no caution, unlike the silent case: every
           row considered has itself confirmed a recent receipt, and the row
           kept is the group's most recent confirmer, so the device provably
           still receives push afterwards. */
        const redundant = selectDuplicateConfirmers(all, zombieCutoffMs);
        report.duplicateConfirmersRetired = 0;
        if (redundant.length > 0) {
            try {
                const { error: dupErr } = await supabase
                    .from('push_subscriptions')
                    .update({
                        is_active: false,
                        last_failure_reason: 'duplicate_confirming_row_for_one_device',
                        updated_at: new Date().toISOString(),
                    })
                    .in('id', redundant.map((d) => d.id))
                    .eq('is_active', true);
                if (dupErr) throw new Error(dupErr.message);
                report.duplicateConfirmersRetired = redundant.length;
            } catch (e) {
                /* Same rule as the block above: a cleanup never fails the run. */
                report.duplicateConfirmerRetireError = String(e?.message || e).slice(0, 200);
            }
        }

        // One alert per user, not per endpoint. Capped: this loop does a
        // notifications insert plus a full enqueuePush per user, and an
        // unbounded serial loop will blow the function timeout at any real
        // scale -- which would mean the whole run reports nothing.
        const seen = new Set();
        const ZOMBIE_TITLE = 'Notifications May Not Be Reaching This Device';
        const zombieUserIds = Array.from(new Set(zombies.map((z) => z.user_id)));
        // The owner account's own silent device is recorded for the Production
        // Alerts task, never sent to him as this notice. Like the zombies, it
        // is closed by that task on evidence, never here: a replaced, retired
        // or not-yet-pushed device looks exactly like one that recovered.
        health.owner(CONDITION.OWNER_DEVICE_NOT_CONFIRMING, includesOwnerAccount(zombieUserIds), {
            ownerZombieSubscriptions: zombies.filter((z) => isOwnerAccount(z.user_id)).length,
        });
        const zombieToAlert = new Set(
            await filterRecentlyAlerted(supabase, personalRecipients(zombieUserIds), ZOMBIE_TITLE, cooldownSince)
        );

        for (const z of zombies.slice(0, MAX_ALERTS_PER_RUN)) {
            if (seen.has(z.user_id)) continue;
            if (!zombieToAlert.has(z.user_id)) continue; // told them within the cooldown
            seen.add(z.user_id);
            // No push on this one -- the whole point is that push is not reaching them.
            await notices.toRecipient(supabase, {
                userId: z.user_id,
                type: 'system',
                withPush: false,
                title: ZOMBIE_TITLE,
                body: 'We sent you push notifications but your device never confirmed them. Open notification settings and turn push back on.',
                url: '/hub/settings/notifications',
            });
        }
        if (zombies.length > 0) {
            health.fault(CONDITION.ZOMBIES,
                `${zombies.length} zombie subscription(s) across ${zombieUserIds.length} user(s)`,
                { zombies: zombies.length, users: zombieUserIds.length });
        } else if (zombieUnread) {
            health.unobserved(CONDITION.ZOMBIES, zombieUnread);
        } else {
            health.clear(CONDITION.ZOMBIES, { zombies: 0 });
        }
        // A cut-off read is a failed observation whatever it found (review
        // r25): the faults it returned stand, and nothing is resolved on it.
        if (zombieUnread) health.readFailed(CONDITION.ZOMBIES, zombieUnread);
        else health.passed(CHECK.ZOMBIE);
    } catch (e) {
        health.checkFailed(CHECK.ZOMBIE, `zombie check failed: ${e?.message || e}`, e);
    }

    // ---- CHECK 2: staff with no reachable device --------------------------
    try {
        const { data: staff, error: staffErr, count: staffCount } = await supabase
            .from('profiles')
            .select('id, username, role', { count: 'exact' })
            .in('role', ['admin', 'god']);
        if (staffErr) throw new Error(staffErr.message);
        // A cut-off staff list is not evidence that the staff it missed can
        // receive push (store copy only; the admins are told as before).
        const staffUnread = Number.isSafeInteger(staffCount) && (staff || []).length >= staffCount ? null
            : `read ${(staff || []).length} of ${staffCount ?? 'an unknown number of'} staff accounts`;

        const staffIds = (staff || []).map((p) => p.id);

        // One query instead of one per admin (the old N+1 loop). Counted: in a
        // cut-off answer a staff account can look unreachable only because its
        // rows did not fit (store copy only; the admins are told as before).
        const { data: activeSubs, error: activeErr, count: activeCount } = await supabase
            .from('push_subscriptions')
            .select('user_id', { count: 'exact' })
            .in('user_id', staffIds.length ? staffIds : ['00000000-0000-0000-0000-000000000000'])
            .eq('is_active', true);
        if (activeErr) throw new Error(activeErr.message);
        const reachUnread = Number.isSafeInteger(activeCount) && (activeSubs || []).length >= activeCount ? null
            : `read ${(activeSubs || []).length} of ${activeCount ?? 'an unknown number of'} staff subscriptions`;

        const reachable = new Set((activeSubs || []).map((s) => s.user_id));
        const unreachable = (staff || []).filter((p) => !reachable.has(p.id));
        report.staffUnreachable = unreachable.length;

        // NOBODY has enrolled a device yet -- that is a rollout state, not a
        // fault. Alerting every admin every day about it just trains them to
        // ignore the alert before the first real one arrives.
        const { count: globalActive, error: globalErr } = await supabase
            .from('push_subscriptions')
            .select('id', { count: 'exact', head: true })
            .eq('is_active', true);
        const nobodyEnrolled = !globalActive;

        const STAFF_TITLE = 'Push Notifications Are Off';
        const staffToAlert = nobodyEnrolled
            ? new Set()
            : new Set(await filterRecentlyAlerted(
                supabase, personalRecipients(unreachable.map((p) => p.id)), STAFF_TITLE, cooldownSince));

        for (const p of unreachable.filter((x) => staffToAlert.has(x.id))) {
            await notices.toRecipient(supabase, {
                userId: p.id,
                type: 'system',
                withPush: false,
                title: STAFF_TITLE,
                body: 'Your staff account has no device registered for push. Enable notifications so you receive live alerts.',
                url: '/hub/settings/notifications',
            });
        }
        // A failed or missing count read as "nobody enrolled" has always
        // suppressed these notices; it is kept for the admins, but it is not
        // evidence that the condition cleared, so neither condition is judged
        // on it. Nor is the rollout state, which this check deliberately does
        // not call a fault.
        const globalUnread = globalErr
            || (Number.isSafeInteger(globalActive) ? null : 'the active subscription count was not returned');
        const ownerOff = unreachable.some((p) => isOwnerAccount(p.id));
        if (globalUnread || nobodyEnrolled || reachUnread) {
            health.unobserved(CONDITION.OWNER_PUSH_OFF);
        } else if (ownerOff || !staffUnread || (staff || []).some((p) => isOwnerAccount(p.id))) {
            health.owner(CONDITION.OWNER_PUSH_OFF, ownerOff, { staffAccountsWithoutPush: unreachable.length });
        } else {
            health.unobserved(CONDITION.OWNER_PUSH_OFF);
        }
        if (unreachable.length > 0 && !nobodyEnrolled) {
            const line = `${unreachable.length} staff account(s) cannot receive push`;
            // With the device read cut off, who is unreachable is not known.
            if (reachUnread) health.unverified(CONDITION.STAFF_UNREACHABLE, line, reachUnread);
            else health.fault(CONDITION.STAFF_UNREACHABLE, line, { staffAccounts: unreachable.length });
        } else if (globalUnread || nobodyEnrolled) {
            // Not judged, and the store copy says so (review r27): its silence
            // must never read as a recovery while nobody can receive a push.
            health.unobserved(CONDITION.STAFF_UNREACHABLE,
                globalUnread || 'nobody is enrolled, so no staff account is judged (see PushNoActiveSubscriptions)');
        } else if (staffUnread || reachUnread) {
            health.unobserved(CONDITION.STAFF_UNREACHABLE, staffUnread || reachUnread);
        } else {
            health.clear(CONDITION.STAFF_UNREACHABLE, { staffAccounts: 0 });
        }
        // A cut-off read is a failed observation whatever it found (review
        // r25), and nothing is resolved on it. What a cut-off staff list
        // returned stands; a cut-off device read judges nobody (above).
        const staffCut = staffUnread || reachUnread;
        if (staffCut) health.readFailed(CONDITION.STAFF_UNREACHABLE, staffCut);
        report.nobodyEnrolled = nobodyEnrolled;
        // The check passes only when every read it made came back whole.
        if (!staffCut && !globalUnread) health.passed(CHECK.STAFF);
    } catch (e) {
        health.checkFailed(CHECK.STAFF, `staff check failed: ${e?.message || e}`, e);
    }

    // ---- CHECK 2b: one live subscription per device ------------------------
    // push-dispatch sends to EVERY active row for a recipient, so a device
    // holding two live rows shows every banner twice. That is what Dan reported
    // on 2026-08-30, and nothing on the platform noticed it: the rows looked
    // healthy one at a time, and only the person holding the phone could see
    // the duplicate.
    //
    // `push_subscriptions_one_active_per_device_uidx` now prevents it at write
    // time -- but only WHERE device_id IS NOT NULL, so it cannot see a row
    // whose device_id was never populated. That is precisely how the bug got
    // in: Club Arena's client never sent one, and /api/push/rotate dropped the
    // one it had. Both are fixed; this check is what would say so if either
    // ever regresses, or if a third client arrives without the field.
    //
    // DELIBERATELY AN ALARM, NOT A REPAIR. The zombie check above retires what
    // it finds because a dead endpoint is unambiguous. A duplicate is not: with
    // both fixes in place a new one means a NEW bug, and silently healing it
    // would hide exactly the kind of failure this file exists to surface.
    try {
        const { data: liveRows, error: liveErr, count: liveCount } = await supabase
            .from('push_subscriptions')
            .select('user_id, device_label, device_id', { count: 'exact' })
            .eq('is_active', true);

        // A failed query must not read as "no duplicates, all healthy".
        if (liveErr) throw new Error(liveErr.message);

        const perDevice = new Map();
        let withoutDeviceId = 0;
        for (const r of liveRows || []) {
            if (!r.device_id) withoutDeviceId += 1;
            // Group on device_id where we have it -- that is exact. Fall back to
            // device_label only for rows that have none, which are the only rows
            // the unique index cannot already vouch for.
            const key = r.device_id
                ? `${r.user_id}|id:${r.device_id}`
                : `${r.user_id}|label:${r.device_label || '(unlabelled)'}`;
            perDevice.set(key, (perDevice.get(key) || 0) + 1);
        }

        const duplicated = [...perDevice.values()].filter((n) => n > 1);
        // Leading indicator: a row with no device_id is outside the index. Some
        // are legacy and heal on that device's next app load, so this is
        // reported rather than alarmed on.
        report.activeWithoutDeviceId = withoutDeviceId;
        report.devicesWithDuplicateSubs = duplicated.length;

        // A cut-off read is not evidence that the rows it missed hold one
        // subscription per device (store copy only; admins as before).
        const liveUnread = Number.isSafeInteger(liveCount) && (liveRows || []).length >= liveCount ? null
            : `read ${(liveRows || []).length} of ${liveCount ?? 'an unknown number of'} live subscriptions`;
        if (duplicated.length > 0) {
            const extraBanners = duplicated.reduce((sum, n) => sum + (n - 1), 0);
            health.fault(CONDITION.DUPLICATE_DEVICES,
                `${duplicated.length} device(s) hold more than one live subscription -- ` +
                    `${extraBanners} duplicate banner(s) on every notification`,
                { devices: duplicated.length, extraBanners });
        } else if (liveUnread) {
            health.unobserved(CONDITION.DUPLICATE_DEVICES, liveUnread);
        } else {
            health.clear(CONDITION.DUPLICATE_DEVICES, { devices: 0 });
        }
        // A cut-off read is a failed observation whatever it found (review
        // r25): the duplicates it returned stand, and nothing is resolved on it.
        if (liveUnread) health.readFailed(CONDITION.DUPLICATE_DEVICES, liveUnread);
        else health.passed(CHECK.DUPLICATE_DEVICE);
    } catch (e) {
        health.checkFailed(CHECK.DUPLICATE_DEVICE, `duplicate-device check failed: ${e?.message || e}`, e);
    }

    // ---- CHECK 3: configuration -------------------------------------------
    if (!isPushConfigured()) {
        report.configOk = false;
        health.fault(CONDITION.VAPID_MISSING, 'VAPID keys are missing -- no push can be sent at all');
        // Neither can be judged without keys: not a fault, not a recovery.
        health.unobserved(CONDITION.VAPID_MISMATCH);
        health.unobserved(CONDITION.VAPID_ROTATED);
    } else {
        health.clear(CONDITION.VAPID_MISSING);
        const { publicKey } = vapidConfig();
        const clientKey = (process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY || '').trim();
        if (clientKey && clientKey !== publicKey) {
            report.configOk = false;
            health.fault(CONDITION.VAPID_MISMATCH,
                'VAPID_PUBLIC_KEY and NEXT_PUBLIC_VAPID_PUBLIC_KEY do not match -- every send will 403');
        } else if (clientKey) {
            health.clear(CONDITION.VAPID_MISMATCH);
        } else {
            // No client key to compare: not evidence either way.
            health.unobserved(CONDITION.VAPID_MISMATCH);
        }

        // ---- VAPID ROTATION DETECTOR --------------------------------------
        // Rotating the keypair permanently kills every existing subscription:
        // the browser subscribed against the OLD applicationServerKey, so every
        // send returns 403 forever and each user must re-enrol. It is silent --
        // nothing else in the stack notices, and the sends still "succeed" from
        // the dispatcher's point of view until the 403s arrive.
        //
        // This happened on 2026-08-19 (keys were regenerated mid-session). It
        // was harmless only because zero devices were enrolled at the time.
        // Store a fingerprint of the active public key and shout if it changes
        // while real subscriptions exist.
        try {
            const fingerprint = createHash('sha256').update(publicKey).digest('hex').slice(0, 16);
            report.vapidFingerprint = fingerprint;

            // The newest entry is the fingerprint in force; every pair of
            // entries from the last week is a rotation a later run re-derives
            // (below).
            const { data: seen, error: seenErr } = await supabase
                .from('push_dispatch_runs')
                .select('note, slot')
                .eq('job', 'vapid-fingerprint')
                .order('started_at', { ascending: false })
                .limit(FINGERPRINT_LOG_READ);

            const previous = seen?.[0]?.note || null;
            // The rotation alarm is one-shot: the admins hear it once, from
            // the run that logs the new fingerprint below. That run's store
            // write can fail, so for a week every later run re-derives every
            // rotation the log holds - two during one outage are two - and
            // records each the store does not hold, once. push-health never
            // resolves one (nothing it reads shows a rotation is over): the
            // Production Alerts fleet closes it. The dead subscriptions a
            // rotation caused stay visible in the zombie and delivery
            // conditions.
            const logged = seenErr ? [] : settledVapidRotations(seen, now);

            if (previous && previous !== fingerprint) {
                const { count: activeSubs, error: rotatedCountErr } = await supabase
                    .from('push_subscriptions')
                    .select('id', { count: 'exact', head: true })
                    .eq('is_active', true);

                report.vapidRotated = true;
                // One rotation is one event: the log entry it replaces and the
                // new key. Its store episode is keyed by exactly that.
                const rotation = { identity: vapidRotation(seen[0], fingerprint) };
                if (activeSubs && activeSubs > 0) {
                    report.configOk = false;
                    health.fault(CONDITION.VAPID_ROTATED,
                        `VAPID KEY ROTATED with ${activeSubs} active subscription(s) -- every one of them is now permanently dead and each user must re-enable notifications on their device`,
                        { activeSubscriptions: activeSubs }, rotation);
                } else if (rotatedCountErr || !Number.isSafeInteger(activeSubs)) {
                    // The admins are told what they always were. The rotation
                    // itself was observed, so it is recorded as one; only how
                    // many devices it killed is unknown.
                    health.fault(CONDITION.VAPID_ROTATED, 'VAPID key rotated (no active subscriptions were affected)',
                        { activeSubscriptions: null,
                            activeSubscriptionsError: String(rotatedCountErr?.message || 'the count was not returned').slice(0, 300) },
                        { ...rotation, severity: 'critical',
                            note: 'the active subscription count could not be read, so how many devices it killed is unknown' });
                } else {
                    health.fault(CONDITION.VAPID_ROTATED, 'VAPID key rotated (no active subscriptions were affected)',
                        { activeSubscriptions: 0 }, { ...rotation, severity: 'warning' });
                }
            } else if (seenErr) {
                // An unreadable fingerprint is not "unchanged".
                health.unobserved(CONDITION.VAPID_ROTATED, seenErr);
            } else if (logged.length === 0) {
                health.clear(CONDITION.VAPID_ROTATED);
            }
            for (const settled of logged) {
                health.reported(CONDITION.VAPID_ROTATED, settled.identity,
                    `VAPID key rotated at ${settled.rotatedAt}`, { rotatedAt: settled.rotatedAt });
            }

            if (previous !== fingerprint) {
                // Record the new fingerprint so the alert fires once, not daily.
                // Exact timestamp, not a day bucket: push_dispatch_runs is
                // UNIQUE(job, slot), and a second rotation on the same day would
                // collide, leaving the stored fingerprint stale and re-alerting
                // every run. This row is a log entry, not a dedupe slot.
                await supabase.from('push_dispatch_runs').insert({
                    job: 'vapid-fingerprint',
                    slot: new Date(now).toISOString(),
                    note: fingerprint,
                    finished_at: new Date().toISOString(),
                });
            }
        } catch (e) {
            // Never let the detector break the watchdog.
            console.warn('[push-health] vapid fingerprint check failed:', e?.message || e);
            health.unobserved(CONDITION.VAPID_ROTATED, e);
        }
    }

    // ---- CHECK 4: dispatch liveness ---------------------------------------
    try {
        const { data: lastRun, error: lastRunErr } = await supabase
            .from('push_dispatch_runs')
            .select('started_at')
            .eq('job', 'push-dispatch')
            .order('started_at', { ascending: false })
            .limit(1);

        const lastAt = lastRun?.[0]?.started_at ? Date.parse(lastRun[0].started_at) : 0;
        const minutesSince = lastAt ? Math.round((now - lastAt) / 60000) : null;
        if (!lastAt || minutesSince > DISPATCH_STALE_MINUTES) {
            report.dispatchOk = false;
            const summary = lastAt
                ? `push-dispatch has not run in ${minutesSince} minutes -- check the Open Claw dispatcher`
                : 'push-dispatch has never run -- it is not registered on Open Claw';
            // A failed read has always been reported as "never run"; the
            // admins keep that line, the store is told the read failed.
            if (lastRunErr) health.unverified(CONDITION.DISPATCH_STALE, summary, lastRunErr);
            else health.fault(CONDITION.DISPATCH_STALE, summary, { minutesSince });
        } else {
            health.clear(CONDITION.DISPATCH_STALE, { minutesSince });
        }
        report.dispatchMinutesSince = minutesSince;
        // A failed read is not a check that worked (review r27).
        if (!lastRunErr) health.passed(CHECK.DISPATCH_LIVENESS);
    } catch (e) {
        health.checkFailed(CHECK.DISPATCH_LIVENESS, `dispatch liveness check failed: ${e?.message || e}`, e);
    }

    // ---- Backlog signal ----------------------------------------------------
    try {
        const { count, error: backlogErr } = await supabase
            .from('push_outbox')
            .select('id', { count: 'exact', head: true })
            .eq('status', 'pending');
        report.pendingBacklog = count || 0;
        if ((count || 0) > 250) {
            health.fault(CONDITION.OUTBOX_BACKLOG, `${count} pushes are backed up in the outbox`, { pending: count });
        } else if (backlogErr || !Number.isSafeInteger(count)) {
            health.unobserved(CONDITION.OUTBOX_BACKLOG, backlogErr || 'the pending count was not returned');
        } else {
            health.clear(CONDITION.OUTBOX_BACKLOG, { pending: count });
        }
    } catch (e) {
        // Still never fails the run, but an unread backlog is not an empty one.
        health.unobserved(CONDITION.OUTBOX_BACKLOG, e);
    }

    // ---- Platform-level delivery signal -------------------------------------
    //
    // 2026-08-26. Push was broken on every phone for months and this cron ran
    // the entire time without a word, because every check above inspects an
    // INDIVIDUAL user — zombie endpoints, staff with no device. With nobody
    // subscribed at all there was no user to complain about, so silence looked
    // like health. Meanwhile push_outbox had reached 1,376 rows skipped with
    // failure_reason='no_subscription'.
    //
    // These two ask about the PLATFORM instead: is anyone reachable, and are
    // we throwing notifications away because nobody is?
    try {
        const [{ count: activeSubs, error: activeErr }, { count: skipped24h, error: skippedErr }] = await Promise.all([
            supabase
                .from('push_subscriptions')
                .select('id', { count: 'exact', head: true })
                .eq('is_active', true),
            supabase
                .from('push_outbox')
                .select('id', { count: 'exact', head: true })
                .eq('status', 'skipped')
                .eq('failure_reason', 'no_subscription')
                .gte('created_at', new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()),
        ]);

        report.activeSubscriptions = activeSubs || 0;
        report.skippedNoSubscription24h = skipped24h || 0;

        // Nobody on the whole platform can receive a push. This is the exact
        // state that persisted unnoticed, and it is never normal once a single
        // user has enrolled.
        // A count that did not come back is as unknown as one that failed.
        const unreturned = (n) => (Number.isSafeInteger(n) ? null : 'a delivery count was not returned');
        if ((activeSubs || 0) === 0) {
            const summary = 'no active push subscriptions exist platform-wide - nobody can receive a notification';
            const unread = activeErr || unreturned(activeSubs);
            if (unread) health.unverified(CONDITION.NO_ACTIVE_SUBSCRIPTIONS, summary, unread);
            else health.fault(CONDITION.NO_ACTIVE_SUBSCRIPTIONS, summary, { activeSubscriptions: 0 });
        } else {
            health.clear(CONDITION.NO_ACTIVE_SUBSCRIPTIONS, { activeSubscriptions: activeSubs });
        }

        // NOT a raw skipped count. I nearly shipped `skipped24h > 200`, then
        // checked it against production: it is 999 in the last 24h WITH push
        // working, because the userbase is large and almost nobody has
        // enrolled yet. That alarm would have fired every single day, and an
        // alarm that always fires is one nobody reads — the same silence this
        // is meant to end, just louder.
        //
        // The precise signal is: we HAVE subscribers and still delivered
        // nothing. That is a delivery failure. High skipped counts alongside
        // healthy sends are just low adoption.
        const { count: sent24h, error: sentErr } = await supabase
            .from('push_outbox')
            .select('id', { count: 'exact', head: true })
            .eq('status', 'sent')
            .gte('sent_at', new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString());
        report.sent24h = sent24h || 0;

        const deliveryErr = activeErr || skippedErr || sentErr
            || unreturned(activeSubs) || unreturned(skipped24h) || unreturned(sent24h);
        if ((activeSubs || 0) > 0 && (sent24h || 0) === 0 && (skipped24h || 0) > 0) {
            const summary = `${activeSubs} device(s) are subscribed but nothing was delivered in 24h ` +
                `(${skipped24h} discarded) - delivery is failing, not adoption`;
            if (deliveryErr) health.unverified(CONDITION.DELIVERY_FAILING, summary, deliveryErr);
            else health.fault(CONDITION.DELIVERY_FAILING, summary, { activeSubscriptions: activeSubs, sent24h: 0, skipped24h });
        } else if (deliveryErr) {
            health.unobserved(CONDITION.DELIVERY_FAILING, deliveryErr);
        } else if (sent24h > 0) {
            health.clear(CONDITION.DELIVERY_FAILING, { activeSubscriptions: activeSubs, sent24h });
        } else {
            // Nothing delivered and nothing discarded, or nobody subscribed:
            // delivery was not exercised, so this is no evidence that it works.
            health.unobserved(CONDITION.DELIVERY_FAILING);
        }
    } catch (e) {
        // A failed diagnostic must never fail the cron - nor read as healthy.
        health.unobserved(CONDITION.DELIVERY_FAILING, e);
        health.unobserved(CONDITION.NO_ACTIVE_SUBSCRIPTIONS);
    }

    // ---- Report ------------------------------------------------------------
    if (problems.length > 0) {
        await notices.toAdmins(supabase, {
            type: 'system',
            title: 'Push Health Alert',
            body: problems.slice(0, 3).join(' | '),
            url: '/admin/push-health',
        });
    }

    // ---- The owner account's copy: Production Alerts store episodes ---------
    // After every notice above is sent, so a notice this very run addressed to
    // the owner account is found too. A store that does not acknowledge the
    // episodes fails the run (cron_health_log records it); there is never a
    // personal fallback.
    await observeOwnerAddressedNotices(supabase, health);
    const operationalAlerts = await recordPushHealthAlerts(supabase, health.conditions());

    return res.status(operationalAlerts.ok ? 200 : 500).json({
        ok: problems.length === 0 && operationalAlerts.ok, problems, report, operationalAlerts,
    });
}

export default withCronHealth('push-health', handler);
