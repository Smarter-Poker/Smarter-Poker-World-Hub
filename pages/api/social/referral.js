/**
 * Referral/Crew System API
 * POST /api/social/referral — Generate or retrieve referral code
 * GET  /api/social/referral — Get referral stats
 * 
 * Referrals award diamonds to both referrer and referee.
 */

import { createClient } from '@supabase/supabase-js';

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
    // Auth
    const token = (req.headers.authorization || '').replace('Bearer ', '');
    const supabase = getSupabase();
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
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
                await supabase
                    .from('profiles')
                    .update({ referral_code: referralCode })
                    .eq('id', user.id);
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
            console.error('[Referral] GET error:', err);
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
                await supabase
                    .from('profiles')
                    .update({ referral_code: newCode })
                    .eq('id', user.id);

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
                await supabase.from('referrals').insert({
                    referrer_id: referrer.id,
                    referee_id: user.id,
                    referral_code_used: code.trim().toUpperCase(),
                    status: 'completed',
                });

                // Award diamonds to referrer
                await supabase.rpc('add_diamonds_to_balance', {
                    p_user_id: referrer.id,
                    p_amount: REFERRAL_BONUS_REFERRER,
                    p_type: 'referral_bonus',
                    p_description: `Referral Bonus — New Player Joined`,
                    p_reference_id: user.id,
                }).catch(() => {});

                // Award diamonds to referee
                await supabase.rpc('add_diamonds_to_balance', {
                    p_user_id: user.id,
                    p_amount: REFERRAL_BONUS_REFEREE,
                    p_type: 'referral_bonus',
                    p_description: `Welcome Bonus — Referred By ${referrer.username || 'A Friend'}`,
                    p_reference_id: referrer.id,
                }).catch(() => {});

                return res.status(200).json({
                    success: true,
                    bonusAwarded: REFERRAL_BONUS_REFEREE,
                    referrerUsername: referrer.username,
                });
            } catch (err) {
                console.error('[Referral] Apply error:', err);
                return res.status(500).json({ error: 'Failed to apply referral' });
            }
        }

        return res.status(400).json({ error: 'Invalid action' });
    }

    return res.status(405).json({ error: 'Method not allowed' });
}
