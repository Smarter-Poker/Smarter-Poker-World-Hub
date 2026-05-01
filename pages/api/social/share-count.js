/**
 * 📊 SHARE COUNT INCREMENT API
 * pages/api/social/share-count.js
 * 
 * Increments the share_count on social_posts OR social_reels when a user shares content.
 * Detects which table the ID belongs to and routes to the correct atomic RPC.
 * Fire-and-forget endpoint — non-critical if it fails.
 * 
 * SECURITY: JWT auth required + rate limiting.
 */

import { createClient } from '@supabase/supabase-js';
import { applyRateLimit, LIMITS } from '../../../src/lib/apiRateLimit';
import { reportApiError } from '../../../src/lib/sentryWrap';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

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

    // Fire-and-forget analytics insert + streak reward
    getSupabase().from('share_events').insert({
        post_id,
        user_id: user.id,
        destination,
        platform: platform || null,
    }).then(() => {
        // After inserting share event, award streak diamond reward (non-blocking)
        getSupabase()
            .rpc('fn_award_share_streak_diamonds', { p_user_id: user.id })
            .then(({ data: streakResult }) => {
                if (streakResult?.awarded) {
                    const mult = streakResult.multiplier ?? 1.0;
                    console.log(`[share-streak] Awarded ${streakResult.diamonds}💎 to ${user.id} (day ${streakResult.streak}, ${streakResult.tier} tier, ${mult}× multiplier)`);
                }
            })
            .catch(() => {});
        // Opportunistically reset any users whose streak broke (no dedicated cron needed)
        getSupabase().rpc('fn_reset_broken_streak_multipliers').catch(() => {});
    }).catch(() => {});

    try {
        // Detect whether this is a native reel (social_reels) or post (social_posts)
        let source = 'posts';
        const { data: reelCheck } = await getSupabase()
            .from('social_reels')
            .select('id')
            .eq('id', post_id)
            .maybeSingle();
        if (reelCheck) source = 'reels';

        if (source === 'reels') {
            // Atomic increment on social_reels via RPC
            const { error: rpcError } = await getSupabase().rpc('increment_reel_count', {
                p_reel_id: post_id, p_field: 'share_count'
            });
            if (rpcError) {
                console.warn('[share-count] Reel RPC failed (non-critical):', rpcError.message);
            }
        } else {
            // Atomic increment on social_posts via RPC
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
                    await getSupabase()
                        .from('social_posts')
                        .update({ share_count: (post.share_count || 0) + 1 })
                        .eq('id', post_id);
                }
            }
        }

        // Check today's streak reward status to include in response
        let streakData = null;
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
