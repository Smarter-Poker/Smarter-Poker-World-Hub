/**
 * 📊 SHARE COUNT INCREMENT API
 * pages/api/social/share-count.js
 *
 * Increments the share_count on social_posts OR social_reels when a user shares content.
 * Detects which table the ID belongs to and routes to the correct atomic RPC.
 * Runs share_events insert + streak award synchronously to return fresh streak data.
 *
 * SECURITY: JWT auth required + rate limiting.
 */

import { createClient } from '@supabase/supabase-js';
import { applyRateLimit, LIMITS } from '../../../src/lib/apiRateLimit';
import { reportApiError } from '../../../src/lib/sentryWrap';
import { getTodayCST } from '../../../src/lib/trivia/getTodayCST';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

// Validated set of allowed destinations (mirrors CHECK constraint in share_events)
const VALID_DESTINATIONS = new Set([
    'feed', 'messenger', 'messenger_group', 'copy', 'twitter', 'whatsapp', 'external'
]);

let _supabase = null;
function getSupabase() {
    if (_supabase) return _supabase;
    _supabase = createClient(supabaseUrl, supabaseKey);
    return _supabase;
}

export default async function handler(req, res) {
  try {

    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    // Rate limiting
    if (!applyRateLimit(req, res, LIMITS.write)) return;

    // JWT authentication
    const token = req.headers.authorization?.replace('Bearer ', '');
    if (!token) return res.status(401).json({ error: 'Authentication required' });

    const { data: authData, error: authErr } = await getSupabase().auth.getUser(token);
    const user = authData?.user;
    if (authErr || !user) return res.status(401).json({ error: 'Invalid token' });

    const { post_id, destination = 'external', platform } = req.body;

    if (!post_id) {
        return res.status(400).json({ error: 'post_id is required' });
    }

    // Normalize destination to prevent CHECK constraint violation
    const safeDestination = VALID_DESTINATIONS.has(destination) ? destination : 'external';

    try {
        // === STEP 1: Insert share event synchronously ===
        try {
            const { error } = await getSupabase().from('share_events').insert({
                post_id,
                user_id: user.id,
                destination: safeDestination,
                platform: platform || null,
            });
            if (error) console.warn('[share-count] share_events insert failed:', error.message);
        } catch (e) {
            console.warn('[share-count] share_events insert exception:', e?.message);
        }

        // === STEP 2: Award streak diamonds — synchronous so response has fresh data ===
        let streakAward = null;
        try {
            const { data: awardResult } = await getSupabase()
                .rpc('fn_award_share_streak_diamonds', { p_user_id: user.id });
            if (awardResult?.awarded) {
                console.log(`[share-streak] Awarded ${awardResult.diamonds}💎 to ${user.id} (${awardResult.streak_days}-day streak, ${awardResult.tier} tier)`);
                streakAward = awardResult;
            }
        } catch (e) {
            console.warn('[share-count] streak award RPC failed:', e?.message);
        }

        // === STEP 3: Reset broken multipliers — fire-and-forget ===
        const { error: rpcErr } = await getSupabase().rpc('fn_reset_broken_streak_multipliers');
        if (rpcErr) console.warn('[social] fn_reset_broken_streak_multipliers failed:', rpcErr.message);

        // === STEP 4: Increment post/reel share count ===
        const { data: reelCheck } = await getSupabase()
            .from('social_reels')
            .select('id')
            .eq('id', post_id)
            .maybeSingle();

        if (reelCheck) {
            const { error: rpcError } = await getSupabase().rpc('increment_reel_count', {
                p_reel_id: post_id, p_field: 'share_count'
            });
            if (rpcError) console.warn('[share-count] Reel RPC failed (non-critical):', rpcError.message);
        } else {
            const { error: rpcError } = await getSupabase().rpc('increment_post_count', {
                p_post_id: post_id, p_field: 'share_count'
            });
            if (rpcError) {
                // Fallback: read-then-write (shares are idempotent, race is non-critical)
                const { data: post } = await getSupabase()
                    .from('social_posts')
                    .select('share_count')
                    .eq('id', post_id)
                    .maybeSingle();
                if (post) {
                    const { error: updError } = await getSupabase()
                        .from('social_posts')
                        .update({ share_count: (post.share_count || 0) + 1 })
                        .eq('id', post_id);
                    if (updError) console.warn('[share-count] Fallback update failed:', updError.message);
                }
            }
        }

        // === STEP 5: Build streak response for frontend toast ===
        let streakData = null;
        if (streakAward) {
            // Return fresh award data directly — no extra DB query needed
            streakData = {
                streak_length: streakAward.streak_days,
                diamonds_awarded: streakAward.diamonds,
                reward_day: getTodayCST(), // Phase 76 — match RPC's CST anchor
                tier: streakAward.tier,
            };
        } else {
            // Check if there's already a reward logged today (idempotent re-check)
            try {
                const { data: sr } = await getSupabase()
                    .from('share_streak_rewards')
                    .select('streak_length, diamonds_awarded, reward_day')
                    .eq('user_id', user.id)
                    .order('reward_day', { ascending: false })
                    .limit(1)
                    .maybeSingle();
                if (sr) streakData = sr;
            } catch (_) {}
        }

        return res.status(200).json({ success: true, streak: streakData });
    } catch (err) {
        try { reportApiError(err, req); } catch (_sentryErr) { console.warn('[App] Handled exception:', _sentryErr?.message || _sentryErr); }
        console.warn('Share count API error:', err);
        return res.status(200).json({ success: false }); // Don't fail the request
    }

  } catch (err) {
    console.warn('[API] Unhandled exception in handler:', err?.message || err);
    if (!res.headersSent) {
      return res.status(500).json({ error: 'Internal server error', message: err?.message || 'Unknown error' });
    }
  }
}
