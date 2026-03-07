/**
 * API: Bookmark Solutions — Save/Retrieve/Delete Favorite Spots
 * ═══════════════════════════════════════════════════════════════════════════
 * POST /api/training/bookmark-solution
 *   body: { spotId, scenarioHash, action: 'save' | 'delete' }
 *
 * GET /api/training/bookmark-solution
 *   Returns all bookmarks for the authenticated user.
 * ═══════════════════════════════════════════════════════════════════════════
 */

import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

export default async function handler(req, res) {
    try {
        // Auth check — get user from header or cookie
        const authHeader = req.headers.authorization;
        let userId = null;

        if (authHeader?.startsWith('Bearer ')) {
            const token = authHeader.substring(7);
            const { data: { user }, error } = await supabase.auth.getUser(token);
            if (!error && user) userId = user.id;
        }

        // Fallback: try x-user-id header (for server-side calls)
        if (!userId) {
            userId = req.headers['x-user-id'] || null;
        }

        if (!userId) {
            return res.status(401).json({ success: false, error: 'Authentication required' });
        }

        // ─── GET: Retrieve user's bookmarks ──────────────────────────
        if (req.method === 'GET') {
            const { data: bookmarks, error } = await supabase
                .from('solution_bookmarks')
                .select('id, spot_id, scenario_hash, notes, created_at')
                .eq('user_id', userId)
                .order('created_at', { ascending: false })
                .limit(200);

            if (error) {
                // Table might not exist yet — return empty
                console.warn('[BookmarkSolution] Query error (table may not exist):', error.message);
                return res.status(200).json({ success: true, bookmarks: [] });
            }

            return res.status(200).json({ success: true, bookmarks: bookmarks || [] });
        }

        // ─── POST: Save or delete a bookmark ─────────────────────────
        if (req.method === 'POST') {
            const { spotId, scenarioHash, action, notes } = req.body;

            if (!action || !scenarioHash) {
                return res.status(400).json({ success: false, error: 'action and scenarioHash are required' });
            }

            if (action === 'save') {
                // Upsert — don't create duplicates
                const { data: existing } = await supabase
                    .from('solution_bookmarks')
                    .select('id')
                    .eq('user_id', userId)
                    .eq('scenario_hash', scenarioHash)
                    .limit(1)
                    .maybeSingle();

                if (existing) {
                    // Update notes if provided
                    if (notes !== undefined) {
                        await supabase
                            .from('solution_bookmarks')
                            .update({ notes })
                            .eq('id', existing.id);
                    }
                    return res.status(200).json({ success: true, action: 'updated', bookmarkId: existing.id });
                }

                const { data: newBookmark, error: insertErr } = await supabase
                    .from('solution_bookmarks')
                    .insert({
                        user_id: userId,
                        spot_id: spotId || null,
                        scenario_hash: scenarioHash,
                        notes: notes || null,
                    })
                    .select('id')
                    .maybeSingle();

                if (insertErr) {
                    console.error('[BookmarkSolution] Insert error:', insertErr);
                    // If table doesn't exist, fail gracefully
                    return res.status(200).json({ success: false, error: 'Bookmark save failed — table may not exist yet', fallback: true });
                }

                return res.status(200).json({ success: true, action: 'saved', bookmarkId: newBookmark?.id });
            }

            if (action === 'delete') {
                const { error: deleteErr } = await supabase
                    .from('solution_bookmarks')
                    .delete()
                    .eq('user_id', userId)
                    .eq('scenario_hash', scenarioHash);

                if (deleteErr) {
                    console.error('[BookmarkSolution] Delete error:', deleteErr);
                }

                return res.status(200).json({ success: true, action: 'deleted' });
            }

            return res.status(400).json({ success: false, error: `Unknown action: ${action}` });
        }

        return res.status(405).json({ success: false, error: 'GET or POST only' });

    } catch (err) {
        console.error('[BookmarkSolution] Error:', err);
        return res.status(500).json({ success: false, error: err.message });
    }
}
