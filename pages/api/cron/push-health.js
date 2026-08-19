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
import { createClient } from '../../../src/lib/supabaseServerClient';
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

let _supabase = null;
function getSupabase() {
    if (!_supabase) _supabase = createClient();
    return _supabase;
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
    const usedSince = new Date(now - ZOMBIE_RECEIPT_DAYS * 86400_000).toISOString();

    // ---- CHECK 1: zombie subscriptions ------------------------------------
    try {
        const { data: subs, error: subsErr } = await supabase
            .from('push_subscriptions')
            .select('id, user_id, device_label, last_used_at, last_receipt_at, created_at')
            .eq('is_active', true)
            .gte('last_used_at', usedSince)
            // GRACE PERIOD. Without this a device that enrolled ten minutes ago
            // and was pushed once has last_receipt_at = null (phone asleep, the
            // beacon has not fired yet) and is immediately branded a zombie --
            // so the user's very first experience of push is an alarming
            // "notifications are not reaching you" message. Only subscriptions
            // older than the window can qualify.
            .lt('created_at', zombieCutoff);

        // A failed query must not read as "0 zombies, all healthy". That is the
        // green-dashboard-silent-phones failure this watchdog exists to catch,
        // and it was reintroduced here by discarding `error`.
        if (subsErr) throw new Error(subsErr.message);

        const zombies = (subs || []).filter(
            (s) => !s.last_receipt_at || s.last_receipt_at < zombieCutoff
        );
        report.zombies = zombies.length;

        // One alert per user, not per endpoint. Capped: this loop does a
        // notifications insert plus a full enqueuePush per user, and an
        // unbounded serial loop will blow the function timeout at any real
        // scale -- which would mean the whole run reports nothing.
        const seen = new Set();
        for (const z of zombies.slice(0, MAX_ALERTS_PER_RUN)) {
            if (seen.has(z.user_id)) continue;
            seen.add(z.user_id);
            // No push on this one -- the whole point is that push is not reaching them.
            await notify(supabase, {
                userId: z.user_id,
                type: 'system',
                withPush: false,
                title: 'Notifications May Not Be Reaching This Device',
                body: 'We sent you push notifications but your device never confirmed them. Open notification settings and turn push back on.',
                url: '/hub/settings/notifications',
            });
        }
        if (zombies.length > 0) {
            problems.push(`${zombies.length} zombie subscription(s) across ${seen.size} user(s)`);
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

        for (const p of nobodyEnrolled ? [] : unreachable) {
            await notify(supabase, {
                userId: p.id,
                type: 'system',
                withPush: false,
                title: 'Push Notifications Are Off',
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
