/**
 * Birthday Reward API — 300 Diamonds
 * 
 * POST /api/rewards/birthday-reward
 * Headers: Authorization: Bearer <JWT>
 * 
 * Rules:
 * - JWT auth required (uses token identity, not body userId)
 * - Account must be 60+ days old
 * - Birthday must match today (month+day, UTC)
 * - One claim per calendar year (deduplicated via diamond_reward_claims)
 */

import { createClient } from '../../../src/lib/supabaseServerClient';
import { applyRateLimit, LIMITS } from '../../../src/lib/apiRateLimit';
import { reportApiError } from '../../../src/lib/sentryWrap';

let _supabase = null;
function getSupabase() {
    if (!_supabase) {
        const url = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://kuklfnapbkmacvwxktbh.supabase.co';
        const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
        _supabase = createClient(url, key);
    }
    return _supabase;
}

const BIRTHDAY_DIAMONDS = 300;

export default async function handler(req, res) {
  try {
    if (['POST','PUT','PATCH','DELETE'].includes(req.method)) {
      if (!applyRateLimit(req, res, LIMITS.write)) return;
    }

    if (req.method !== 'POST') {
        return res.status(405).json({ success: false, error: 'Method not allowed' });
    }

    // ── Auth: JWT required (awards diamonds) ──
    const token = req.headers.authorization?.replace('Bearer ', '');
    if (!token) return res.status(401).json({ success: false, error: 'Auth required' });
    const { data: authData, error: authErr } = await getSupabase().auth.getUser(token);
    const authUser = authData?.user;
    if (authErr || !authUser) return res.status(401).json({ success: false, error: 'Invalid token' });

    const userId = authUser.id; // Use JWT identity, NOT body

    try {
        // SAFEGUARD 1: Already claimed this year
        const now = new Date();
        const currentYear = now.getUTCFullYear();
        const claimKey = `birthday_reward_${currentYear}`;

        const { data: existing } = await getSupabase()
            .from('diamond_reward_claims')
            .select('id')
            .eq('user_id', userId)
            .eq('reward_type', claimKey)
            .maybeSingle();

        if (existing) {
            return res.status(200).json({ success: true, alreadyClaimed: true, message: 'Birthday reward already claimed this year' });
        }

        // SAFEGUARD 2: Fetch profile and verify birthday
        const { data: profile, error: profileError } = await getSupabase()
            .from('profiles')
            .select('id, birthday, created_at')
            .eq('id', userId)
            .maybeSingle();

        if (profileError || !profile) {
            return res.status(404).json({ success: false, error: 'Profile not found' });
        }

        if (!profile.birthday) {
            return res.status(400).json({ success: false, error: 'No birthday set on profile' });
        }

        // SAFEGUARD 3: Account age (60+ days)
        const createdAt = new Date(profile.created_at);
        const daysSinceCreation = Math.floor((now - createdAt) / (1000 * 60 * 60 * 24));
        if (daysSinceCreation < 60) {
            return res.status(403).json({
                success: false,
                error: 'Account must be at least 60 days old to claim birthday reward',
                daysRemaining: 60 - daysSinceCreation
            });
        }

        // SAFEGUARD 4: Today matches birthday (UTC-safe)
        // Parse birthday as UTC to avoid timezone drift on Vercel
        const [bYear, bMonth, bDay] = profile.birthday.split('-').map(Number);
        const todayMonth = now.getUTCMonth() + 1; // getUTCMonth is 0-indexed
        const todayDay = now.getUTCDate();

        if (bMonth !== todayMonth || bDay !== todayDay) {
            return res.status(400).json({ success: false, error: 'Today is not your birthday' });
        }

        // Record claim FIRST (prevents race condition / double-claim)
        const cstNow = new Date(now.toLocaleString('en-US', { timeZone: 'America/Chicago' }));
        const today = `${cstNow.getFullYear()}-${String(cstNow.getMonth() + 1).padStart(2, '0')}-${String(cstNow.getDate()).padStart(2, '0')}`;

        const { error: claimInsertErr } = await getSupabase().from('diamond_reward_claims').insert({
            user_id: userId,
            reward_type: claimKey,
            diamonds_awarded: BIRTHDAY_DIAMONDS,
            claim_date: today,
            metadata: { birthday: profile.birthday, account_age_days: daysSinceCreation }
        });

        if (claimInsertErr) {
            if (claimInsertErr.code === '23505') {
                return res.status(200).json({ success: true, alreadyClaimed: true, message: 'Birthday reward already claimed this year' });
            }
            console.warn('[BirthdayReward] Insert error:', claimInsertErr);
            throw claimInsertErr;
        }

        // Award diamonds
        // Stable reference_id (`claimKey` already encodes year) closes the
        // retry-double-credit window: if the RPC commits but response delivery
        // fails, the rollback path lets the user retry — without a stable
        // reference_id the retry would have no dedup and double-credit.
        const { error: rpcError } = await getSupabase().rpc('add_diamonds_to_balance', {
            p_user_id: userId,
            p_amount: BIRTHDAY_DIAMONDS,
            p_type: 'birthday_reward',
            p_description: `Happy Birthday! 🎂 ${BIRTHDAY_DIAMONDS}diamonds awarded`,
            p_reference_id: `${claimKey}_${userId}`
        });

        if (rpcError) {
            // Roll back the idempotency claim row so the user can retry next year
            // (or today, if it was a transient RPC failure). Same bug shape as
            // daily-login (commit 8d9ce5c9f1).
            const { error: rollbackErr } = await getSupabase()
                    .from('diamond_reward_claims')
                    .delete()
                    .eq('user_id', userId)
                    .eq('reward_type', claimKey)
                    .eq('claim_date', today);
              if (rollbackErr) {
                  console.warn('[BirthdayReward] Rollback delete failed:', rollbackErr.message);
              }
            console.warn('[BirthdayReward] RPC error (claim rolled back so user can retry):', rpcError);
            return res.status(500).json({ success: false, error: 'Failed to credit diamonds — please retry' });
        }

        return res.status(200).json({
            success: true,
            claimed: true,
            diamondsAwarded: BIRTHDAY_DIAMONDS,
            message: `Happy Birthday! You received ${BIRTHDAY_DIAMONDS} diamonds!`
        });

    } catch (error) {
        console.warn('[BirthdayReward] Error:', error.message || error);
        return res.status(500).json({ success: false, error: 'Failed to claim birthday reward' });
    }

  } catch (err) {
      try { reportApiError(err, req); } catch (_sentryErr) { console.warn('[App] Handled exception:', _sentryErr?.message || _sentryErr); }
    console.warn('[API Error]', err);
    if (!res.headersSent) return res.status(500).json({ success: false, error: 'Internal server error' });
  }
}
