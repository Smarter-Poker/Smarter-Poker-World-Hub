import { getServerUserWithFallback } from '../../../src/lib/serverAuth';
/**
 * POST /api/training/log-request
 * Logs a "Train This Spot" conversion event to the training_events table.
 * Uses event_type='train_this_spot' and event_data jsonb for context.
 * Lightweight fire-and-forget analytics. The client never blocks on this
 * request, while the API still reports failed persistence truthfully.
 *
 * Body: { ref, vid, title, source, tags, matchedGameIds }
 *
 * 2026-07-19 AUDIT FIX:
 *  - Was a raw `@supabase/supabase-js` import with a module-scope
 *    createClient() (violates repo rules #3 and #4). Now uses the patched
 *    supabaseServerClient behind an SSG-safe lazy getter.
 *  - Was trusting `req.body.userId` (IDOR — any caller could attribute
 *    events to any user). user_id now comes only from a verified JWT when
 *    one is supplied; anonymous events log with user_id = null.
 */

import { createClient } from '../../../src/lib/supabaseServerClient';
import { applyRateLimit, LIMITS } from '../../../src/lib/apiRateLimit';

// ●● Lazy Supabase getter (SSG-safe) ●●●●●●●●●●●●●●●●●●●●●●●●●●●●●
let _supabase = null;
function getSupabase() {
    if (!_supabase) {
        if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
            throw new Error('Training analytics storage is not configured');
        }
        _supabase = createClient(
            process.env.NEXT_PUBLIC_SUPABASE_URL,
            process.env.SUPABASE_SERVICE_ROLE_KEY
        );
    }
    return _supabase;
}

export default async function handler(req, res) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    if (!applyRateLimit(req, res, LIMITS.write)) return;

    try {
        if (JSON.stringify(req.body || {}).length > 8192) {
            return res.status(413).json({ error: 'Request body too large' });
        }
        const { ref, vid, title, source, tags, matchedGameIds } = req.body || {};

        if (!ref || !vid) {
            return res.status(400).json({ error: 'ref and vid are required' });
        }

        // Identity from verified JWT only — never from the request body
        let userId = null;
        const token = req.headers.authorization?.replace('Bearer ', '');
        if (token) {
            try {
                const { user: authUser, error: authErr } = await getServerUserWithFallback(req, getSupabase());
    const authData = { user: authUser };
                if (!authErr && authData?.user) userId = authData.user.id;
            } catch (_e) {
                // Anonymous logging is fine — analytics must never block
            }
        }

        const { error } = await getSupabase().from('training_events').insert({
            user_id: userId,
            event_type: 'train_this_spot',
            event_data: {
                source_ref: ref,                             // 'video-library' | 'reels' | 'sandbox'
                video_id: String(vid).slice(0, 100),
                video_title: String(title || '').slice(0, 200),
                video_source: String(source || '').slice(0, 100),
                video_tags: Array.isArray(tags) ? tags : String(tags || '').split(',').filter(Boolean),
                matched_game_ids: Array.isArray(matchedGameIds) ? matchedGameIds : [],
            },
        });

        if (error) {
            console.warn('[training/log-request] Insert failed:', error.message);
            return res.status(503).json({ ok: false, error: 'Training analytics are temporarily unavailable' });
        }

        return res.status(200).json({ ok: true });
    } catch (err) {
        console.warn('[training/log-request] Error:', err.message);
        return res.status(503).json({ ok: false, error: 'Training analytics are temporarily unavailable' });
    }
}
