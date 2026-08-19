/**
 * GET /api/admin/push-health-data
 *
 * Backs /admin/push-health. Admin/god only -- the role is read from the DB for
 * the JWT-verified caller, never from anything the client sent.
 *
 * Answers the one question a push dashboard has to answer honestly:
 * WHO CANNOT BE REACHED, and is it because they opted out or because we are
 * broken? Send-result dashboards cannot tell those apart, because FCM and Apple
 * return 2xx for endpoints belonging to devices that no longer exist.
 */
import { createClient } from '../../../src/lib/supabaseServerClient';
import { getServerUserWithFallback } from '../../../src/lib/serverAuth';
import { isPushConfigured, vapidConfig } from '../../../src/lib/push/web-push';
import { applyRateLimit } from '../../../src/lib/apiRateLimit';

let _supabase = null;
function getSupabase() {
    if (!_supabase) _supabase = createClient();
    return _supabase;
}

const ZOMBIE_DAYS = 3;

/**
 * Is this suppression the user's choice, an expected state, or our fault?
 * Everything on this page hangs off that distinction.
 */
function classifyReason(family) {
    switch (family) {
        case 'mute_all':
        case 'push_disabled':
        case 'type_disabled':
        case 'legacy_disabled':
        case 'quiet_hours':
        case 'daily_cap_reached':
            return 'user_choice';
        case 'no_subscription':
            return 'not_enrolled';
        case 'too_stale_to_deliver':
        case 'time_budget_exhausted':
            return 'throttled';
        default:
            return 'fault';
    }
}

export default async function handler(req, res) {
    if (req.method !== 'GET') {
        res.setHeader('Allow', 'GET');
        return res.status(405).json({ error: 'Method not allowed' });
    }

    // This route pulls the whole subscription table plus several exact counts.
    // Every other route in the stack is rate limited; an admin holding refresh
    // should not be a self-inflicted load generator.
    if (!applyRateLimit(req, res, { max: 30, windowMs: 60_000, scope: 'push-health-data' })) return;

    const supabase = getSupabase();
    const { user } = await getServerUserWithFallback(req, supabase);
    if (!user?.id) return res.status(401).json({ error: 'Not authenticated' });

    const { data: me } = await supabase.from('profiles').select('role').eq('id', user.id).maybeSingle();
    if (!me || !['admin', 'god'].includes(me.role)) {
        return res.status(403).json({ error: 'Admin required' });
    }

    const now = Date.now();
    const zombieCutoff = new Date(now - ZOMBIE_DAYS * 86400_000).toISOString();

    try {
        const [{ data: staff }, { data: subs }, { data: lastRun }] = await Promise.all([
            supabase.from('profiles').select('id, username, email, role').in('role', ['admin', 'god']),
            supabase.from('push_subscriptions')
                .select('id, user_id, device_label, is_active, last_used_at, last_receipt_at, last_failure_reason, created_at'),
            supabase.from('push_dispatch_runs')
                .select('started_at, finished_at, claimed, sent, failed, skipped, note')
                .eq('job', 'push-dispatch').order('started_at', { ascending: false }).limit(10),
        ]);

        const byUser = new Map();
        for (const s of subs || []) {
            if (!byUser.has(s.user_id)) byUser.set(s.user_id, []);
            byUser.get(s.user_id).push(s);
        }

        const staffStatus = (staff || []).map((p) => {
            const rows = byUser.get(p.id) || [];
            const active = rows.filter((r) => r.is_active);
            let status = 'ok';
            if (rows.length === 0) status = 'never_enabled';
            else if (active.length === 0) status = 'subscription_dead';
            else if (active.every((r) => !r.last_receipt_at || r.last_receipt_at < zombieCutoff)) status = 'zombie';
            return {
                id: p.id,
                username: p.username,
                email: p.email,
                role: p.role,
                status,
                devices: active.length,
                totalDevices: rows.length,
                lastReceiptAt: active.map((r) => r.last_receipt_at).filter(Boolean).sort().pop() || null,
                lastFailure: active.map((r) => r.last_failure_reason).filter(Boolean)[0] || null,
            };
        }).sort((a, b) => (a.status === 'ok' ? 1 : 0) - (b.status === 'ok' ? 1 : 0));

        const activeSubs = (subs || []).filter((s) => s.is_active);
        const zombies = activeSubs.filter(
            (s) => s.last_used_at && (!s.last_receipt_at || s.last_receipt_at < zombieCutoff)
        );

        const [{ count: pending }, { count: failed }, { count: skipped }, { count: sent24 }] = await Promise.all([
            supabase.from('push_outbox').select('id', { count: 'exact', head: true }).eq('status', 'pending'),
            supabase.from('push_outbox').select('id', { count: 'exact', head: true }).eq('status', 'failed'),
            supabase.from('push_outbox').select('id', { count: 'exact', head: true }).eq('status', 'skipped'),
            supabase.from('push_outbox').select('id', { count: 'exact', head: true })
                .eq('status', 'sent').gte('sent_at', new Date(now - 86400_000).toISOString()),
        ]);

        // WHY were pushes suppressed? A bare "skipped: 412" cannot tell an
        // operator whether users opted out or the system is broken -- which is
        // the only question this page exists to answer. Group the reasons.
        //
        // Reasons are normalised: `type_disabled:new_message` and
        // `daily_cap_reached:20` collapse to their family so the list stays
        // readable instead of fragmenting into one row per type.
        let skipReasons = [];
        try {
            const since = new Date(now - 7 * 86400_000).toISOString();
            const { data: skips } = await supabase
                .from('push_outbox')
                .select('failure_reason')
                .in('status', ['skipped', 'failed'])
                .gte('created_at', since)
                .limit(5000);

            const tally = new Map();
            for (const r of skips || []) {
                const raw = r.failure_reason || 'unknown';
                const family = raw.split(':')[0];
                tally.set(family, (tally.get(family) || 0) + 1);
            }
            skipReasons = Array.from(tally.entries())
                .map(([reason, count]) => ({ reason, count, kind: classifyReason(reason) }))
                .sort((a, b) => b.count - a.count);
        } catch { /* diagnostics only */ }

        const lastRunAt = lastRun?.[0]?.started_at ? Date.parse(lastRun[0].started_at) : null;

        // ---- DELIVERY FUNNEL --------------------------------------------
        // The whole point of this stack is that "accepted by FCM" is NOT
        // "shown on a phone" -- push services return 2xx for devices that were
        // wiped months ago. The only honest measure of delivery is the receipt
        // the service worker beacons back after showNotification() resolves.
        //
        // Queued -> Sent tells you whether the dispatcher is keeping up.
        // Sent -> Displayed tells you whether phones are actually rendering
        // them. A healthy system has a small gap (phones asleep, receipts
        // rate-limited); a large or growing gap is the zombie-fleet signature.
        let funnel = null;
        try {
            const since24 = new Date(now - 86400_000).toISOString();
            const [{ count: queued24 }, { count: suppressed24 }] = await Promise.all([
                supabase.from('push_outbox').select('id', { count: 'exact', head: true })
                    .gte('created_at', since24),
                supabase.from('push_outbox').select('id', { count: 'exact', head: true })
                    .in('status', ['skipped', 'failed']).gte('created_at', since24),
            ]);

            // Device-level confirmation: of the subscriptions we pushed to in
            // the window, how many beaconed a receipt inside it.
            const pushed = activeSubs.filter((s) => s.last_used_at && s.last_used_at >= since24);
            const confirmed = pushed.filter((s) => s.last_receipt_at && s.last_receipt_at >= since24);

            funnel = {
                windowHours: 24,
                queued: queued24 || 0,
                sent: sent24 || 0,
                suppressed: suppressed24 || 0,
                devicesPushed: pushed.length,
                devicesConfirmed: confirmed.length,
                // Null rather than a fake 100% when there is nothing to measure.
                confirmRate: pushed.length
                    ? Math.round((confirmed.length / pushed.length) * 100)
                    : null,
                deliveryRate: queued24 ? Math.round(((sent24 || 0) / queued24) * 100) : null,
            };
        } catch { /* diagnostics only -- never break the page */ }

        return res.status(200).json({
            config: {
                configured: isPushConfigured(),
                keyMatches: !((process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY || '').trim()
                    && (process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY || '').trim() !== vapidConfig().publicKey),
            },
            dispatch: {
                lastRunAt: lastRun?.[0]?.started_at || null,
                minutesSince: lastRunAt ? Math.round((now - lastRunAt) / 60000) : null,
                recent: lastRun || [],
            },
            subscriptions: {
                total: (subs || []).length,
                active: activeSubs.length,
                zombies: zombies.length,
            },
            outbox: {
                pending: pending || 0,
                failed: failed || 0,
                skipped: skipped || 0,
                sentLast24h: sent24 || 0,
            },
            funnel,
            // skipReasons was computed and then dropped on the floor -- the
            // "did they opt out or are we broken" breakdown never reached the
            // page it was written for.
            skipReasons,
            staff: staffStatus,
        });
    } catch (e) {
        return res.status(500).json({ error: e?.message || 'Failed to load push health' });
    }
}
