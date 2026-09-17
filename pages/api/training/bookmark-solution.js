import { getServerUserWithFallback } from '../../../src/lib/serverAuth';
/**
 * API: Bookmark Solutions — Save/Retrieve/Delete Favorite Spots
 * ●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●
 * POST /api/training/bookmark-solution
 *   body: { spotId, scenarioHash, action: 'save' | 'delete' }
 *
 * GET /api/training/bookmark-solution
 *   Returns all bookmarks for the authenticated user.
 * ●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●
 */

import { createClient } from '../../../src/lib/supabaseServerClient';
import { applyRateLimit, LIMITS } from '../../../src/lib/apiRateLimit';
import { sanitizeParam, withTiming } from '../../../src/utils/trainingApiUtils';
import { reportApiError } from '../../../src/lib/apiErrorHandler';

// ●● Lazy Supabase getter (SSG-safe) ●●●●●●●●●●●●●●●●●●●●●●●●●●●●●
let _supabase = null;
function getSupabase() {
    if (!_supabase) {
        _supabase = createClient(
            process.env.NEXT_PUBLIC_SUPABASE_URL,
            process.env.SUPABASE_SERVICE_ROLE_KEY
        );
    }
    return _supabase;
}
export default async function handler(req, res) {
    try {
      withTiming(res);
        // Rate limit write operations
        if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method)) {
            if (!applyRateLimit(req, res, LIMITS.write)) return;
        }

        // Auth check — JWT only (no x-user-id fallback — prevents IDOR)
        const authHeader = req.headers.authorization;
        let userId = null;

        if (authHeader?.startsWith('Bearer ')) {
            const token = authHeader.substring(7);
            // 2026-07-19 AUDIT FIX: previous code referenced an undeclared
            // `error` variable here — every authenticated request threw a
            // ReferenceError and the endpoint 500'd unconditionally.
            const { user: authUser, error: authErr } = await getServerUserWithFallback(req, getSupabase());
    const authData = { user: authUser };
            const user = authData?.user;
            if (!authErr && user) userId = user.id;
        }

        if (!userId) {
            return res.status(401).json({ success: false, error: 'Authentication required' });
        }

        // ●●● GET: Retrieve user's bookmarks ●●●●●●●●●●●●●●●●●●●●●●●●●●
        if (req.method === 'GET') {
            res.setHeader('Cache-Control', 'private, max-age=10, stale-while-revalidate=30');
            res.setHeader('Vary', 'Authorization');
            const { data: bookmarks, error } = await getSupabase()
                .from('solution_bookmarks')
                .select('id, spot_id, scenario_hash, notes, created_at')
                .eq('user_id', userId)
                .order('created_at', { ascending: false })
                .limit(200);

            if (error) {
                console.warn('[BookmarkSolution] Query error:', error.message);
                return res.status(503).json({
                    success: false,
                    error: 'Bookmarks are temporarily unavailable. Please retry.',
                    code: 'TRAINING_BOOKMARK_PERSISTENCE_UNAVAILABLE',
                    retryable: true,
                });
            }

            return res.status(200).json({ success: true, bookmarks: bookmarks || [] });
        }

        // ●●● POST: Save or delete a bookmark ●●●●●●●●●●●●●●●●●●●●●●●●●
        if (req.method === 'POST') {
            // Body size guard — only accepts spotId, scenarioHash, action, notes
            const bodySize = JSON.stringify(req.body || {}).length;
            if (bodySize > 5120) {
                return res.status(413).json({ success: false, error: 'Request body too large' });
            }

            const action = sanitizeParam(req.body?.action, 16);
            const scenarioHash = sanitizeParam(req.body?.scenarioHash, 256);
            const spotId = req.body?.spotId == null ? null : sanitizeParam(req.body.spotId, 180);
            const notes = req.body?.notes == null ? req.body?.notes : sanitizeParam(req.body.notes, 2000);

            if (!action || !scenarioHash) {
                return res.status(400).json({ success: false, error: 'action and scenarioHash are required' });
            }

            if (action === 'save') {
                // Upsert — don't create duplicates
                const { data: existing, error: existingError } = await getSupabase()
                    .from('solution_bookmarks')
                    .select('id')
                    .eq('user_id', userId)
                    .eq('scenario_hash', scenarioHash)
                    .limit(1)
                    .maybeSingle();

                if (existingError) {
                    console.warn('[BookmarkSolution] Existing bookmark lookup failed:', existingError.message);
                    return res.status(503).json({
                        success: false,
                        error: 'Bookmark could not be verified. Please retry.',
                        code: 'TRAINING_BOOKMARK_PERSISTENCE_UNAVAILABLE',
                        retryable: true,
                    });
                }

                if (existing) {
                    // Update notes if provided
                    if (notes !== undefined) {
                        const { data: updated, error: updateError } = await getSupabase()
                          .from('solution_bookmarks')
                          .update({ notes })
                          .eq('user_id', userId)
                          .eq('id', existing.id)
                          .select('id')
                          .maybeSingle();
                        if (updateError || !updated?.id) {
                            console.warn('[BookmarkSolution] Bookmark update failed:', updateError?.message || 'updated row missing');
                            return res.status(503).json({
                                success: false,
                                error: 'Bookmark update failed. Please retry.',
                                code: 'TRAINING_BOOKMARK_PERSISTENCE_UNAVAILABLE',
                                retryable: true,
                            });
                        }
                    }
                    return res.status(200).json({ success: true, action: 'updated', bookmarkId: existing.id });
                }

                const { data: newBookmark, error: insertErr } = await getSupabase()
                    .from('solution_bookmarks')
                    .upsert({
                        user_id: userId,
                        spot_id: spotId || null,
                        scenario_hash: scenarioHash,
                        notes: notes ?? null,
                    }, { onConflict: 'user_id,scenario_hash' })
                    .select('id')
                    .maybeSingle();

                if (insertErr || !newBookmark?.id) {
                    console.warn('[BookmarkSolution] Insert error:', insertErr);
                    return res.status(503).json({
                        success: false,
                        error: 'Bookmark save failed. Please retry.',
                        code: 'TRAINING_BOOKMARK_PERSISTENCE_UNAVAILABLE',
                        retryable: true,
                    });
                }

                return res.status(200).json({ success: true, action: 'saved', bookmarkId: newBookmark?.id });
            }

            if (action === 'delete') {
                const { data: deleted, error: deleteErr } = await getSupabase()
                    .from('solution_bookmarks')
                    .delete()
                    .eq('user_id', userId)
                    .eq('scenario_hash', scenarioHash)
                    .select('id');

                if (deleteErr) {
                    console.warn('[BookmarkSolution] Delete error:', deleteErr);
                    return res.status(503).json({
                        success: false,
                        error: 'Bookmark removal failed. Please retry.',
                        code: 'TRAINING_BOOKMARK_PERSISTENCE_UNAVAILABLE',
                        retryable: true,
                    });
                }

                return res.status(200).json({
                    success: true,
                    action: 'deleted',
                    deletedCount: Array.isArray(deleted) ? deleted.length : 0,
                });
            }

            return res.status(400).json({ success: false, error: 'Invalid action' });
        }

        return res.status(405).json({ success: false, error: 'GET or POST only' });

    } catch (err) {
        try { reportApiError(err, req); } catch (_reportError) { console.warn('[App] Handled exception:', _reportError?.message || _reportError); }
        console.warn('[BookmarkSolution] Error:', err);
        if (!res.headersSent) return res.status(500).json({ success: false, error: 'Internal server error' });
    }
}
