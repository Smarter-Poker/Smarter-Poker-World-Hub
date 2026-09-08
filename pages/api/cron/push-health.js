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

const ZOMBIE_RECEIPT_DAYS = 3;
// Ceiling on per-user alerts in one run. Each alert is a notifications insert
// plus a full enqueuePush; an unbounded serial loop would exceed the function
// timeout and the run would report nothing at all.
const MAX_ALERTS_PER_RUN = 100;
const DISPATCH_STALE_MINUTES = 30;
// A daily watchdog that re-nags the same person every single day trains them to
// ignore it, which defeats the whole point. Each person hears about a given
// problem at most once per this window.
const ALERT_COOLDOWN_DAYS = 7;

let _supabase = null;
function getSupabase() {
    if (!_supabase) _supabase = createClient();
    return _supabase;
}

/**
 * Returns the subset of userIds that have NOT already received `title` within
 * the cooldown window, so a persistent problem is reported once a week rather
 * than once a day. Fails OPEN (returns everyone) -- a lookup failure must not
 * silence a genuine alert.
 */
async function filterRecentlyAlerted(supabase, userIds, title, sinceIso) {
    if (!userIds.length) return [];
    try {
        const { data, error } = await supabase
            .from('notifications')
            .select('user_id')
            .in('user_id', userIds)
            .eq('title', title)
            .gte('created_at', sinceIso);
        if (error) return userIds;
        const already = new Set((data || []).map((n) => n.user_id));
        return userIds.filter((id) => !already.has(id));
    } catch {
        return userIds;
    }
}

async function handler(req, res) {
    let authed;
    try {
        authed = validateCronAuth(req);
    } catch {
        return res.status(500).json({ error: 'Cron authentication is not configured' });
    }
    if (!authed) return res.status(401).json({ error: 'Unauthorized' });

    const supabase = getSupabase();
    const problems = [];
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
        const { data: subs, error: subsErr } = await supabase
            .from('push_subscriptions')
            .select(
                'id, user_id, device_label, endpoint, user_agent, last_used_at, last_receipt_at, created_at'
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
        const zombieToAlert = new Set(
            await filterRecentlyAlerted(supabase, zombieUserIds, ZOMBIE_TITLE, cooldownSince)
        );

        for (const z of zombies.slice(0, MAX_ALERTS_PER_RUN)) {
            if (seen.has(z.user_id)) continue;
            if (!zombieToAlert.has(z.user_id)) continue; // told them within the cooldown
            seen.add(z.user_id);
            // No push on this one -- the whole point is that push is not reaching them.
            await notify(supabase, {
                userId: z.user_id,
                type: 'system',
                withPush: false,
                title: ZOMBIE_TITLE,
                body: 'We sent you push notifications but your device never confirmed them. Open notification settings and turn push back on.',
                url: '/hub/settings/notifications',
            });
        }
        if (zombies.length > 0) {
            problems.push(`${zombies.length} zombie subscription(s) across ${zombieUserIds.length} user(s)`);
        }
    } catch (e) {
        problems.push(`zombie check failed: ${e?.message || e}`);
    }

    // ---- CHECK 2: staff with no reachable device --------------------------
    try {
        const { data: staff, error: staffErr } = await supabase
            .from('profiles')
            .select('id, username, role')
            .in('role', ['admin', 'god']);
        if (staffErr) throw new Error(staffErr.message);

        const staffIds = (staff || []).map((p) => p.id);

        // One query instead of one per admin (the old N+1 loop).
        const { data: activeSubs, error: activeErr } = await supabase
            .from('push_subscriptions')
            .select('user_id')
            .in('user_id', staffIds.length ? staffIds : ['00000000-0000-0000-0000-000000000000'])
            .eq('is_active', true);
        if (activeErr) throw new Error(activeErr.message);

        const reachable = new Set((activeSubs || []).map((s) => s.user_id));
        const unreachable = (staff || []).filter((p) => !reachable.has(p.id));
        report.staffUnreachable = unreachable.length;

        // NOBODY has enrolled a device yet -- that is a rollout state, not a
        // fault. Alerting every admin every day about it just trains them to
        // ignore the alert before the first real one arrives.
        const { count: globalActive } = await supabase
            .from('push_subscriptions')
            .select('id', { count: 'exact', head: true })
            .eq('is_active', true);
        const nobodyEnrolled = !globalActive;

        const STAFF_TITLE = 'Push Notifications Are Off';
        const staffToAlert = nobodyEnrolled
            ? new Set()
            : new Set(await filterRecentlyAlerted(
                supabase, unreachable.map((p) => p.id), STAFF_TITLE, cooldownSince));

        for (const p of unreachable.filter((x) => staffToAlert.has(x.id))) {
            await notify(supabase, {
                userId: p.id,
                type: 'system',
                withPush: false,
                title: STAFF_TITLE,
                body: 'Your staff account has no device registered for push. Enable notifications so you receive live alerts.',
                url: '/hub/settings/notifications',
            });
        }
        if (unreachable.length > 0 && !nobodyEnrolled) {
            problems.push(`${unreachable.length} staff account(s) cannot receive push`);
        }
        report.nobodyEnrolled = nobodyEnrolled;
    } catch (e) {
        problems.push(`staff check failed: ${e?.message || e}`);
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
        const { data: liveRows, error: liveErr } = await supabase
            .from('push_subscriptions')
            .select('user_id, device_label, device_id')
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

        if (duplicated.length > 0) {
            const extraBanners = duplicated.reduce((sum, n) => sum + (n - 1), 0);
            problems.push(
                `${duplicated.length} device(s) hold more than one live subscription -- ` +
                    `${extraBanners} duplicate banner(s) on every notification`
            );
        }
    } catch (e) {
        problems.push(`duplicate-device check failed: ${e?.message || e}`);
    }

    // ---- CHECK 3: configuration -------------------------------------------
    if (!isPushConfigured()) {
        report.configOk = false;
        problems.push('VAPID keys are missing -- no push can be sent at all');
    } else {
        const { publicKey } = vapidConfig();
        const clientKey = (process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY || '').trim();
        if (clientKey && clientKey !== publicKey) {
            report.configOk = false;
            problems.push('VAPID_PUBLIC_KEY and NEXT_PUBLIC_VAPID_PUBLIC_KEY do not match -- every send will 403');
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

            const { data: seen } = await supabase
                .from('push_dispatch_runs')
                .select('note')
                .eq('job', 'vapid-fingerprint')
                .order('started_at', { ascending: false })
                .limit(1);

            const previous = seen?.[0]?.note || null;

            if (previous && previous !== fingerprint) {
                const { count: activeSubs } = await supabase
                    .from('push_subscriptions')
                    .select('id', { count: 'exact', head: true })
                    .eq('is_active', true);

                report.vapidRotated = true;
                if (activeSubs && activeSubs > 0) {
                    report.configOk = false;
                    problems.push(
                        `VAPID KEY ROTATED with ${activeSubs} active subscription(s) -- every one of them is now permanently dead and each user must re-enable notifications on their device`
                    );
                } else {
                    problems.push('VAPID key rotated (no active subscriptions were affected)');
                }
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
        }
    }

    // ---- CHECK 4: dispatch liveness ---------------------------------------
    try {
        const { data: lastRun } = await supabase
            .from('push_dispatch_runs')
            .select('started_at')
            .eq('job', 'push-dispatch')
            .order('started_at', { ascending: false })
            .limit(1);

        const lastAt = lastRun?.[0]?.started_at ? Date.parse(lastRun[0].started_at) : 0;
        const minutesSince = lastAt ? Math.round((now - lastAt) / 60000) : null;
        if (!lastAt || minutesSince > DISPATCH_STALE_MINUTES) {
            report.dispatchOk = false;
            problems.push(
                lastAt
                    ? `push-dispatch has not run in ${minutesSince} minutes -- check the Open Claw dispatcher`
                    : 'push-dispatch has never run -- it is not registered on Open Claw'
            );
        }
        report.dispatchMinutesSince = minutesSince;
    } catch (e) {
        problems.push(`dispatch liveness check failed: ${e?.message || e}`);
    }

    // ---- Backlog signal ----------------------------------------------------
    try {
        const { count } = await supabase
            .from('push_outbox')
            .select('id', { count: 'exact', head: true })
            .eq('status', 'pending');
        report.pendingBacklog = count || 0;
        if ((count || 0) > 250) problems.push(`${count} pushes are backed up in the outbox`);
    } catch { /* ignore */ }

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
        const [{ count: activeSubs }, { count: skipped24h }] = await Promise.all([
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
        if ((activeSubs || 0) === 0) {
            problems.push('no active push subscriptions exist platform-wide - nobody can receive a notification');
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
        const { count: sent24h } = await supabase
            .from('push_outbox')
            .select('id', { count: 'exact', head: true })
            .eq('status', 'sent')
            .gte('sent_at', new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString());
        report.sent24h = sent24h || 0;

        if ((activeSubs || 0) > 0 && (sent24h || 0) === 0 && (skipped24h || 0) > 0) {
            problems.push(
                `${activeSubs} device(s) are subscribed but nothing was delivered in 24h ` +
                `(${skipped24h} discarded) - delivery is failing, not adoption`
            );
        }
    } catch { /* a failed diagnostic must never fail the cron */ }

    // ---- Report ------------------------------------------------------------
    if (problems.length > 0) {
        await notifyAdmins(supabase, {
            type: 'system',
            title: 'Push Health Alert',
            body: problems.slice(0, 3).join(' | '),
            url: '/admin/push-health',
        });
    }

    return res.status(200).json({ ok: problems.length === 0, problems, report });
}

export default withCronHealth('push-health', handler);
