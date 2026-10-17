/**
 * REFERRAL REWARD - paid when the new player confirms their email (2026-10-17)
 * ═══════════════════════════════════════════════════════════════════════════
 * Dan, 2026-10-17: "YES PAY OUT DIAMONDS FOR ALL REFERRALS".
 *
 * A referral is recorded and paid by ONE database function,
 * public.fn_settle_signup_referral (migration 20261017180200):
 *   referral_qualified -> 500 diamonds to the referrer
 *   referral_referee   -> 100 diamonds to the new player
 * Amounts come from the catalog inside award_diamonds_v2, never from here.
 * The referrer is read from the new account's own sign-up record, never from
 * this request body, and the only condition is a confirmed email.
 *
 * The database already settles the referral the moment the email is
 * confirmed (a trigger on auth.users). This endpoint is the second live door:
 * the sign-up page calls it right after verification, so a settlement the
 * trigger could not complete is finished by the player's own next step. Both
 * doors share award_diamonds_v2's reference ids, so a referral is paid once.
 *
 * Before 2026-10-17 this endpoint read public.referrals, which nothing ever
 * wrote, and withheld payment for a verified phone, seven days and five login
 * days. No referral was ever recorded or paid.
 * ═══════════════════════════════════════════════════════════════════════════
 */

import { createClient } from '../../../src/lib/supabaseServerClient';
import { applyRateLimit, LIMITS } from '../../../src/lib/apiRateLimit';
import { reportApiError } from '../../../src/lib/apiErrorHandler';

// fn_settle_signup_referral is GRANTed to service_role only.
let _supabase = null;
function getSupabase() {
    if (!_supabase) {
        const url = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://kuklfnapbkmacvwxktbh.supabase.co';
        const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
        _supabase = createClient(url, key);
    }
    return _supabase;
}

export default async function handler(req, res) {
    try {
        if (req.method !== 'POST') {
            return res.status(405).json({ success: false, error: 'Method not allowed' });
        }
        if (!applyRateLimit(req, res, LIMITS.write)) return;

        const supabase = getSupabase();
        const token = req.headers.authorization?.replace('Bearer ', '');
        if (!token) return res.status(401).json({ success: false, error: 'Auth required' });
        const { data: authData, error: authErr } = await supabase.auth.getUser(token);
        const authUser = authData?.user;
        if (authErr || !authUser) return res.status(401).json({ success: false, error: 'Invalid token' });

        const body = req.body || {};
        // `referredUserId` is the v1 field name, accepted so older callers keep working.
        const refereeId = body.refereeId || body.referredUserId || authUser.id;

        // A referrer may ask about their own referee; nobody else may.
        if (refereeId !== authUser.id) {
            const { data: row } = await supabase
                .from('referrals')
                .select('referrer_id')
                .eq('referee_id', refereeId)
                .maybeSingle();
            if (!row || row.referrer_id !== authUser.id) {
                return res.status(403).json({ success: false, error: 'Cannot claim referral rewards for unrelated accounts' });
            }
        }

        const { data, error } = await supabase.rpc('fn_settle_signup_referral', { p_referee: refereeId });
        if (error) {
            console.warn('[Referral] settlement RPC failed:', error.message || error);
            // Not final: the sign-up page keeps the referral and tries again.
            return res.status(500).json({ success: false, error: 'Could not settle the referral - please retry' });
        }

        const result = data || {};
        const referrerAwarded = Number(result.referrer?.awarded || 0);
        const refereeAwarded = Number(result.referee?.awarded || 0);
        return res.status(200).json({
            success: result.ok === true,
            reason: result.reason || 'unknown',
            referrerId: result.referrer_id || null,
            referrerAwarded,
            refereeAwarded,
            diamondsAwarded: refereeId === authUser.id ? refereeAwarded : referrerAwarded,
        });
    } catch (err) {
        try { reportApiError(err, req); } catch (_reportError) { console.warn('[Referral] Handled exception:', _reportError?.message || _reportError); }
        if (!res.headersSent) return res.status(500).json({ success: false, error: 'Internal server error' });
    }
}
