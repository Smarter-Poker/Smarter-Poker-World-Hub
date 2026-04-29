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
    if (!_supabase) _supabase = createClient(supabaseUrl, supabaseKey);
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

    const { post_id } = req.body;

    if (!post_id) {
        return res.status(400).json({ error: 'post_id is required' });
    }

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

        return res.status(200).json({ success: true });
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
