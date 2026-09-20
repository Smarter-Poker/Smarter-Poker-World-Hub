/** Exact, receipt-based push diagnostics for the verified administrator. */
import { createClient } from '../../../src/lib/supabaseServerClient';
import { getServerUserWithFallback } from '../../../src/lib/serverAuth';
import { isPushConfigured, vapidConfig } from '../../../src/lib/push/web-push';
import { isPushHealthSnapshot } from '../../../src/lib/pushHealthSnapshot.mjs';
import { applyRateLimit } from '../../../src/lib/apiRateLimit';

let _supabase = null;
function getSupabase() {
    if (!_supabase) _supabase = createClient();
    return _supabase;
}

export default async function handler(req, res) {
    if (req.method !== 'GET') {
        res.setHeader('Allow', 'GET');
        return res.status(405).json({ error: 'Method Not Allowed' });
    }
    if (!applyRateLimit(req, res, { max: 30, windowMs: 60_000, scope: 'push-health-data' })) return;
    res.setHeader('Cache-Control', 'private, no-store');
    try {
        const supabase = getSupabase();
        const { user } = await getServerUserWithFallback(req, supabase);
        if (!user?.id) return res.status(401).json({ error: 'Not Authenticated' });
        // One database statement computes the entire snapshot and independently
        // verifies this actual actor is an administrator. No sampled row totals.
        const { data, error } = await supabase.rpc('fn_push_health_snapshot', { p_user_id: user.id });
        if (error?.code === '42501') return res.status(403).json({ error: 'Admin Required' });
        if (error || !isPushHealthSnapshot(data)) {
            return res.status(503).json({ error: 'Push Health Is Unavailable. Please Try Again.' });
        }
        return res.status(200).json({
            ...data,
            config: {
                configured: isPushConfigured(),
                keyMatches: !((process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY || '').trim()
                    && (process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY || '').trim() !== vapidConfig().publicKey),
            },
        });
    } catch {
        return res.status(503).json({ error: 'Push Health Is Unavailable. Please Try Again.' });
    }
}
