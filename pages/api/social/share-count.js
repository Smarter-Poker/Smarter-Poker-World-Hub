/**
 * 📊 SHARE COUNT INCREMENT API
 * pages/api/social/share-count.js
 * 
 * Increments the share_count on social_posts when a user shares a post.
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
        // Try RPC first (if fn exists)
        const { error: rpcError } = await getSupabase().rpc('increment_share_count', { p_post_id: post_id });

        if (rpcError) {
            // Fallback: read current count and increment by 1
            const { data: post, error: readError } = await getSupabase()
                .from('social_posts')
                .select('share_count')
                .eq('id', post_id)
                .maybeSingle();

            if (!readError && post) {
                const newCount = (post.share_count || 0) + 1;
                const { error: updateError } = await getSupabase()
                    .from('social_posts')
                    .update({ share_count: newCount })
                    .eq('id', post_id);

                if (updateError) {
                    console.warn('Share count update failed (non-critical):', updateError.message);
                }
            }
        }

        return res.status(200).json({ success: true });
    } catch (err) {
        try { reportApiError(err, req); } catch (_sentryErr) { console.warn('[App] Handled exception:', _sentryErr?.message || _sentryErr); }
        console.warn('Share count API error:', err);
        return res.status(200).json({ success: false }); // Don't fail the request
    }
}
