/**
 * Referral/Crew System API
 * POST /api/social/referral — Generate or retrieve referral code
 * GET  /api/social/referral — Get referral stats
 * 
 * Referrals award diamonds to both referrer and referee.
 */

import { createClient } from '@supabase/supabase-js';
import { reportApiError } from '../../../src/lib/sentryWrap';

import { applyRateLimit, LIMITS } from '../../../src/lib/apiRateLimit';
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

const REFERRAL_BONUS_REFERRER = 100;  // Diamonds awarded to the person who referred
const REFERRAL_BONUS_REFEREE = 50;    // Diamonds awarded to the new user who signed up

function generateCode(username) {
    const base = (username || 'SP').substring(0, 8).toUpperCase().replace(/[^A-Z0-9]/g, '');
    const suffix = Math.random().toString(36).substring(2, 6).toUpperCase();
    return `${base}-${suffix}`;
}

export default async function handler(req, res) {
  // [Phase 6.1.15] Rate limit writes — prevents enumeration + drain attacks.
  if (['POST','PUT','PATCH','DELETE'].includes(req.method)) {
    if (!applyRateLimit(req, res, LIMITS.write)) return;
  }

    // Auth
    const token = (req.headers.authorization || '').replace('Bearer ', '');
    const supabase = getSupabase();
    const { data: authData, error: authError } = await supabase.auth.getUser(token);
    const user = authData?.user;
    if (authError || !user) {
        return res.status(401).json({ error: 'Not authenticated' });
    }

    // ─── GET: Retrieve referral stats ─────────────────────────────────
    if (req.method === 'GET') {
        try {
            // Get or create referral code
            const { data: profile } = await supabase
                .from('profiles')
                .select('username, referral_code')
                .eq('id', user.id)
                .maybeSingle();

            let referralCode = profile?.referral_code;

            if (!referralCode) {
                referralCode = generateCode(profile?.username);
                const { error: err_profiles_z0mv3 } = await supabase
                  .from('profiles')
                  .update({ referral_code: referralCode })
                    .eq('id', user.id);
                if (err_profiles_z0mv3) console.warn('[Supabase] Silent mutation failed in profiles:', err_profiles_z0mv3.message);
            }

            // Count successful referrals
            const { count: totalReferrals } = await supabase
                .from('referrals')
                .select('*', { count: 'exact', head: true })
                .eq('referrer_id', user.id)
                .eq('status', 'completed');

            // Sum diamonds earned from referrals
            const { data: earnedData } = await supabase
                .from('diamond_transactions')
                .select('amount')
                .eq('user_id', user.id)
                .eq('transaction_type', 'referral_bonus');

            const totalDiamondsEarned = (earnedData || []).reduce((sum, t) => sum + (t.amount || 0), 0);

            // Recent referral list
            const { data: recentReferrals } = await supabase
                .from('referrals')
                .select('id, status, created_at, referee_id')
                .eq('referrer_id', user.id)
                .order('created_at', { ascending: false })
                .limit(20);

            // Get referred user names
            const referredIds = (recentReferrals || []).map(r => r.referee_id).filter(Boolean);
            let referredProfiles = {};
            if (referredIds.length > 0) {
                const { data: profiles } = await supabase
                    .from('profiles')
                    .select('id, username, avatar_url')
                    .in('id', referredIds);
                (profiles || []).forEach(p => { referredProfiles[p.id] = p; });
            }

            const enrichedReferrals = (recentReferrals || []).map(r => ({
                ...r,
                referredUser: referredProfiles[r.referee_id] || null,
            }));

            return res.status(200).json({
                referralCode,
                shareUrl: `https://smarter.poker/?ref=${referralCode}`,
                totalReferrals: totalReferrals || 0,
                totalDiamondsEarned,
                bonusPerReferral: REFERRAL_BONUS_REFERRER,
                recentReferrals: enrichedReferrals,
            });
        } catch (err) {
            console.warn('[Referral] GET error:', err);
            return res.status(500).json({ error: 'Failed to load referral data' });
        }
    }

    // ─── POST: Apply referral code (for new users) ───────────────────
    if (req.method === 'POST') {
        const { action, code } = req.body;

        // Generate new referral code
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
                const { error: err_profiles_sfmz4 } = await supabase
                  .from('profiles')
                  .update({ referral_code: newCode })
                    .eq('id', user.id);
                if (err_profiles_sfmz4) console.warn('[Supabase] Silent mutation failed in profiles:', err_profiles_sfmz4.message);

                return res.status(200).json({ code: newCode, existing: false });
            } catch (err) {
                return res.status(500).json({ error: 'Failed to generate code' });
            }
        }

        // Apply referral code (claim reward)
        if (action === 'apply' && code) {
            try {
                // Find the referrer
                const { data: referrer } = await supabase
                    .from('profiles')
                    .select('id, username')
                    .eq('referral_code', code.trim().toUpperCase())
                    .maybeSingle();

                if (!referrer) {
                    return res.status(404).json({ error: 'Invalid referral code' });
                }

                if (referrer.id === user.id) {
                    return res.status(400).json({ error: 'Cannot use your own referral code' });
                }

                // Check for duplicate
                const { data: existing } = await supabase
                    .from('referrals')
                    .select('id')
                    .eq('referee_id', user.id)
                    .maybeSingle();

                if (existing) {
                    return res.status(400).json({ error: 'Referral already applied' });
                }

                // Create referral record
                const { error: insertErr } = await supabase.from('referrals').insert({
                    referrer_id: referrer.id,
                    referee_id: user.id,
                    referral_code_used: code.trim().toUpperCase(),
                    status: 'completed',
                });

                if (insertErr) {
                    console.warn('[Referral] Insert error:', insertErr);
                    return res.status(500).json({ error: 'Failed to record referral' });
                }

                // Helper: roll back the referrals row so the user can retry.
                // Without this, the duplicate-referral check at line 174 (one
                // referee_id per row) would block re-application forever.
                const rollbackReferral = async (label) => {
                    try {
                        const { error: err_referrals_flf6b } = await supabase
                          .from('referrals')
                          .delete()
                            .eq('referee_id', user.id)
                            .eq('referrer_id', referrer.id);
                        if (err_referrals_flf6b) console.warn('[Supabase] Silent mutation failed in referrals:', err_referrals_flf6b.message);
                    } catch (rbErr) {
                        console.warn(`[Referral] Rollback delete failed (${label}):`, rbErr?.message || rbErr);
                    }
                };

                // Award diamonds to referrer.
                // reference_id pattern: referral_credit_{referee} ensures one credit
                // per referee + survives retries via the function's idempotency check.
                const referrerCreditRefId = `referral_credit_${user.id}`;
                const { error: referrerErr } = await supabase.rpc('add_diamonds_to_balance', {
                    p_user_id: referrer.id,
                    p_amount: REFERRAL_BONUS_REFERRER,
                    p_type: 'referral_bonus',
                    p_description: `Referral Bonus — New Player Joined`,
                    p_reference_id: referrerCreditRefId,
                });
                if (referrerErr) {
                    await rollbackReferral('referrer credit failed');
                    console.warn('[Referral] Referrer credit RPC failed (rolled back so user can retry):', referrerErr);
                    return res.status(500).json({ error: 'Failed to credit referrer — please retry' });
                }

                // Award diamonds to referee.
                // Distinct reference_id (welcome_bonus_*) so the function-side
                // idempotency check doesn't mistake this for the referrer credit.
                const refereeCreditRefId = `welcome_bonus_${user.id}`;
                const { error: refereeErr } = await supabase.rpc('add_diamonds_to_balance', {
                    p_user_id: user.id,
                    p_amount: REFERRAL_BONUS_REFEREE,
                    p_type: 'referral_bonus',
                    p_description: `Welcome Bonus — Referred By ${referrer.username || 'A Friend'}`,
                    p_reference_id: refereeCreditRefId,
                });
                if (refereeErr) {
                    // Compensate the referrer credit we just made, then roll back the referral
                    // record. Without this, the referrer keeps their bonus AND the referee can
                    // retry — paying the referrer twice.
                    try {
                        // CRITICAL: capture RPC errors. Supabase rpc() returns
                        // {data, error} and does NOT throw — the previous catch
                        // only caught network exceptions, so a real reversal
                        // failure left the referrer overpaid forever with no
                        // log to reconcile from. Money-loss class.
                        // Reversal MUST use a DIFFERENT reference_id from the original
                        // referrer credit at line 215 — otherwise the function's
                        // idempotency check (added 2026-04-30 in
                        // 20260430_consolidate_add_diamonds_to_balance.sql) would
                        // see the existing tx and silently skip the reversal,
                        // leaving the referrer overpaid forever.
                        const reversalRefId = `referral_credit_${user.id}_reversal`;
                        const { error: revErr } = await supabase.rpc('add_diamonds_to_balance', {
                            p_user_id: referrer.id,
                            p_amount: -REFERRAL_BONUS_REFERRER,
                            p_type: 'referral_bonus_reversal',
                            p_description: `Referral bonus reversal — referee credit failed`,
                            p_reference_id: reversalRefId,
                        });
                        if (revErr) {
                            console.warn('[Referral] CRITICAL: reversal RPC failed — referrer', referrer.id, 'is overpaid by', REFERRAL_BONUS_REFERRER, ':', revErr?.message || revErr);
                        }
                    } catch (compErr) {
                        console.warn('[Referral] Referrer compensation reversal threw:', compErr?.message || compErr);
                    }
                    await rollbackReferral('referee credit failed');
                    console.warn('[Referral] Referee credit RPC failed (rolled back so user can retry):', refereeErr);
                    return res.status(500).json({ error: 'Failed to credit welcome bonus — please retry' });
                }

                return res.status(200).json({
                    success: true,
                    bonusAwarded: REFERRAL_BONUS_REFEREE,
                    referrerUsername: referrer.username,
                });
            } catch (err) {
                try { reportApiError(err, req); } catch (_sentryErr) { console.warn('[App] Handled exception:', _sentryErr?.message || _sentryErr); }
                console.warn('[Referral] Apply error:', err);
                return res.status(500).json({ error: 'Failed to apply referral' });
            }
        }

        return res.status(400).json({ error: 'Invalid action' });
    }

    return res.status(405).json({ error: 'Method not allowed' });
}
