/**
 * Referral Crew API
 * GET  /api/social/referral - the player's referral link, code and stats
 * POST /api/social/referral - { action: 'generate' } or { action: 'apply', code }
 *
 * EVERY REFERRAL PAYS THE SAME WAY (2026-10-17). Dan: "YES PAY OUT DIAMONDS FOR
 * ALL REFERRALS". A referral, however it arrives (a sign-up link, an invite
 * link, a typed player number, a Referral Crew code, or a code applied here
 * later), is recorded and paid by ONE database function,
 * public.fn_settle_signup_referral: 500 diamonds to the referrer and 100 to the
 * new player through award_diamonds_v2, idempotent by reference id.
 *
 * Before that date this route:
 *   - shared smarter.poker/?ref=<code>, a link the homepage dropped, so no
 *     Referral Crew link ever credited anybody;
 *   - counted only the legacy `referral_bonus` type, so a paid referral showed 0;
 *   - paid its own 100/50 through a separate diamond RPC, undoing a half-paid
 *     referral with hand-written reversal entries.
 */

import { createClient } from '../../../src/lib/supabaseServerClient';
import { reportApiError } from '../../../src/lib/apiErrorHandler';
import { applyRateLimit, LIMITS } from '../../../src/lib/apiRateLimit';
import { REFERRAL } from '../../../src/config/diamondRewards';

// Lazy-init Supabase client (RAT-AUTH-NUCLEAR compliant)
let _supabase = null;
function getSupabase() {
    if (!_supabase) {
        const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
        const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
        if (!key) throw new Error('[referral] No Supabase key');
        _supabase = createClient(url, key);
    }
    return _supabase;
}

const PLAYER_NUMBER = /^[0-9]{1,9}$/;
const CREW_CODE = /^[A-Z0-9]{1,16}-[A-Z0-9]{1,16}$/;
/** Every diamond type a referral has ever paid a referrer under. */
const REFERRER_TYPES = ['referral_qualified', 'referral_bonus'];

function generateCode(username) {
    const base = (username || 'SP').substring(0, 8).toUpperCase().replace(/[^A-Z0-9]/g, '') || 'SP';
    const suffix = Math.random().toString(36).substring(2, 6).toUpperCase();
    return `${base}-${suffix}`;
}

/** The link a player shares. The sign-up page reads ref= and records it on the new account. */
function shareUrlFor(playerNumber, referralCode) {
    const ref = playerNumber || referralCode;
    return ref ? `https://smarter.poker/auth/signup?ref=${encodeURIComponent(ref)}` : 'https://smarter.poker/auth/signup';
}

export default async function handler(req, res) {
  try {
    if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method)) {
        if (!applyRateLimit(req, res, LIMITS.write)) return;
    }

    const token = (req.headers.authorization || '').replace('Bearer ', '');
    const supabase = getSupabase();
    const { data: authData, error: authError } = await supabase.auth.getUser(token);
    const user = authData?.user;
    if (authError || !user) {
        return res.status(401).json({ error: 'Not authenticated' });
    }

    // ─── GET: the player's link and stats ─────────────────────────────
    if (req.method === 'GET') {
        try {
            const { data: profile } = await supabase
                .from('profiles')
                .select('username, referral_code, player_number')
                .eq('id', user.id)
                .maybeSingle();

            let referralCode = profile?.referral_code;
            if (!referralCode) {
                referralCode = generateCode(profile?.username);
                const { error: codeErr } = await supabase
                    .from('profiles')
                    .update({ referral_code: referralCode })
                    .eq('id', user.id);
                if (codeErr) console.warn('[Referral] Could not store a new referral code:', codeErr.message);
            }

            const { count: totalReferrals } = await supabase
                .from('referrals')
                .select('*', { count: 'exact', head: true })
                .eq('referrer_id', user.id)
                .eq('status', 'completed');

            const { data: earnedData } = await supabase
                .from('diamond_transactions')
                .select('amount')
                .eq('user_id', user.id)
                .in('transaction_type', REFERRER_TYPES)
                .gt('amount', 0);
            const totalDiamondsEarned = (earnedData || []).reduce((sum, t) => sum + (t.amount || 0), 0);

            const { data: recentReferrals } = await supabase
                .from('referrals')
                .select('id, status, created_at, referee_id')
                .eq('referrer_id', user.id)
                .order('created_at', { ascending: false })
                .limit(20);

            const referredIds = (recentReferrals || []).map((r) => r.referee_id).filter(Boolean);
            const referredProfiles = {};
            if (referredIds.length > 0) {
                const { data: profiles } = await supabase
                    .from('profiles')
                    .select('id, username, avatar_url')
                    .in('id', referredIds);
                (profiles || []).forEach((p) => { referredProfiles[p.id] = p; });
            }

            return res.status(200).json({
                referralCode,
                playerNumber: profile?.player_number || null,
                shareUrl: shareUrlFor(profile?.player_number, referralCode),
                totalReferrals: totalReferrals || 0,
                totalDiamondsEarned,
                bonusPerReferral: REFERRAL.referrer,
                refereeBonus: REFERRAL.referee,
                recentReferrals: (recentReferrals || []).map((r) => ({
                    ...r,
                    referredUser: referredProfiles[r.referee_id] || null,
                })),
            });
        } catch (err) {
            console.warn('[Referral] GET error:', err);
            return res.status(500).json({ error: 'Failed to load referral data' });
        }
    }

    if (req.method === 'POST') {
        const { action, code } = req.body || {};

        if (action === 'generate') {
            try {
                const { data: profile } = await supabase
                    .from('profiles')
                    .select('username, referral_code')
                    .eq('id', user.id)
                    .maybeSingle();
                if (profile?.referral_code) {
                    return res.status(200).json({ code: profile.referral_code, existing: true });
                }
                const newCode = generateCode(profile?.username);
                const { error: codeErr } = await supabase
                    .from('profiles')
                    .update({ referral_code: newCode })
                    .eq('id', user.id);
                if (codeErr) {
                    console.warn('[Referral] Could not store a new referral code:', codeErr.message);
                    return res.status(500).json({ error: 'Failed to generate code' });
                }
                return res.status(200).json({ code: newCode, existing: false });
            } catch (err) {
                return res.status(500).json({ error: 'Failed to generate code' });
            }
        }

        // Apply a referral after sign-up: recorded, then settled by the same
        // function as every other referral. A retry finishes a pending one.
        if (action === 'apply' && code) {
            try {
                const raw = String(code).trim().toUpperCase();
                const isNumber = PLAYER_NUMBER.test(raw) && Number(raw) > 0;
                if (!isNumber && !CREW_CODE.test(raw)) {
                    return res.status(400).json({ error: 'Invalid referral code' });
                }
                const lookup = supabase.from('profiles').select('id, username, player_number');
                const { data: referrer } = await (isNumber
                    ? lookup.eq('player_number', String(Number(raw)))
                    : lookup.eq('referral_code', raw)
                ).maybeSingle();
                if (!referrer) return res.status(404).json({ error: 'Invalid referral code' });
                if (referrer.id === user.id) {
                    return res.status(400).json({ error: 'Cannot use your own referral code' });
                }

                const { data: existing } = await supabase
                    .from('referrals')
                    .select('referrer_id, status')
                    .eq('referee_id', user.id)
                    .maybeSingle();
                if (existing && (existing.status === 'completed' || existing.referrer_id !== referrer.id)) {
                    return res.status(400).json({ error: 'Referral already applied' });
                }
                if (!existing) {
                    const { error: insertErr } = await supabase.from('referrals').insert({
                        referrer_id: referrer.id,
                        referee_id: user.id,
                        referral_code_used: raw,
                        status: 'pending',
                    });
                    // 23505: another request recorded it first; settle that one.
                    if (insertErr && insertErr.code !== '23505') {
                        console.warn('[Referral] Insert error:', insertErr.message || insertErr);
                        return res.status(500).json({ error: 'Failed to record referral - please retry' });
                    }
                }

                const { data: settled, error: settleErr } = await supabase.rpc('fn_settle_signup_referral', {
                    p_referee: user.id,
                });
                if (settleErr) {
                    console.warn('[Referral] Settlement RPC failed:', settleErr.message || settleErr);
                    return res.status(500).json({ error: 'Referral recorded; the bonus could not be paid yet - please retry' });
                }
                if (!settled?.ok) {
                    const reason = settled?.reason === 'email_not_verified'
                        ? 'Confirm your email first, then apply the code again'
                        : 'The referral bonus could not be paid - please retry';
                    return res.status(409).json({ error: reason, reason: settled?.reason || 'unknown' });
                }
                return res.status(200).json({
                    success: true,
                    bonusAwarded: Number(settled.referee?.awarded || 0),
                    referrerUsername: referrer.username,
                });
            } catch (err) {
                try { reportApiError(err, req); } catch (_reportError) { console.warn('[Referral] Handled exception:', _reportError?.message || _reportError); }
                return res.status(500).json({ error: 'Failed to apply referral' });
            }
        }

        return res.status(400).json({ error: 'Invalid action' });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (err) {
    try { reportApiError(err, req); } catch (_reportError) { console.warn('[Referral] Handled exception:', _reportError?.message || _reportError); }
    if (!res.headersSent) return res.status(500).json({ error: 'Internal server error' });
  }
}
