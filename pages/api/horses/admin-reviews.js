/**
 * ⭐ ADMIN REVIEWS API
 * GET  /api/horses/admin-reviews — List all venue reviews with filters
 * DELETE /api/horses/admin-reviews — Admin-delete any review by id
 * PATCH  /api/horses/admin-reviews — Flag/unflag a review as inappropriate
 *
 * All endpoints require admin/superadmin/god role via JWT.
 */
import { createClient } from '../../../src/lib/supabaseServerClient';

let _supabase = null;
function getSupabase() {
    if (!_supabase) {
        const url = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://kuklfnapbkmacvwxktbh.supabase.co';
        const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
        _supabase = createClient(url, key);
    }
    return _supabase;
}

async function requireAdmin(req, res) {
    const token = req.headers.authorization?.replace('Bearer ', '');
    if (!token) { res.status(401).json({ error: 'Authorization required' }); return null; }
    const { data: { user }, error: authError } = await getSupabase().auth.getUser(token);
    if (authError || !user) { res.status(401).json({ error: 'Invalid token' }); return null; }
    const { data: profile } = await getSupabase()
        .from('profiles').select('role').eq('id', user.id).maybeSingle();
    if (!profile || !['admin', 'superadmin', 'god'].includes(profile.role)) {
        res.status(403).json({ error: 'Admin access required' }); return null;
    }
    return user;
}

export default async function handler(req, res) {
    try {
        const user = await requireAdmin(req, res);
        if (!user) return;

        // ─── GET — List all reviews with optional filters ───────────────────────
        if (req.method === 'GET') {
            const {
                venue_id,
                rating,
                flagged,
                limit = '100',
                offset = '0',
                sort = 'newest',
            } = req.query;

            let query = getSupabase()
                .from('venue_reviews')
                .select(`
                    id,
                    venue_id,
                    user_id,
                    reviewer_name,
                    rating,
                    review_text,
                    helpful_count,
                    unhelpful_count,
                    is_flagged,
                    flag_reason,
                    created_at,
                    metadata
                `)
                .limit(parseInt(limit, 10) || 100)
                .range(parseInt(offset, 10), parseInt(offset, 10) + (parseInt(limit, 10) || 100) - 1);

            // Filters
            if (venue_id) query = query.eq('venue_id', String(venue_id));
            if (rating) query = query.eq('rating', parseInt(rating, 10));
            if (flagged === 'true') query = query.eq('is_flagged', true);

            // Sort
            if (sort === 'newest') query = query.order('created_at', { ascending: false });
            else if (sort === 'oldest') query = query.order('created_at', { ascending: true });
            else if (sort === 'highest') query = query.order('rating', { ascending: false });
            else if (sort === 'lowest') query = query.order('rating', { ascending: true });
            else if (sort === 'flagged') query = query.order('is_flagged', { ascending: false }).order('created_at', { ascending: false });
            else query = query.order('created_at', { ascending: false });

            const { data: reviews, error } = await query;
            if (error) {
                console.error('[Admin Reviews GET] Error:', error);
                return res.status(500).json({ success: false, error: error.message });
            }

            // Enrich with venue name if available (best-effort)
            let venueNames = {};
            if (reviews && reviews.length > 0) {
                const venueIds = [...new Set(reviews.map(r => r.venue_id).filter(Boolean))];
                if (venueIds.length > 0) {
                    try {
                        const { data: venues } = await getSupabase()
                            .from('venues')
                            .select('id, name, city, state')
                            .in('id', venueIds.map(String));
                        (venues || []).forEach(v => { venueNames[String(v.id)] = `${v.name}${v.city ? ` — ${v.city}` : ''}${v.state ? `, ${v.state}` : ''}`; });
                    } catch (_) { /* non-fatal */ }
                }
            }

            // Count stats
            const totalCount = reviews?.length || 0;
            const flaggedCount = (reviews || []).filter(r => r.is_flagged).length;
            const avgRating = totalCount > 0
                ? ((reviews || []).reduce((sum, r) => sum + (r.rating || 0), 0) / totalCount).toFixed(2)
                : 0;

            return res.status(200).json({
                success: true,
                reviews: (reviews || []).map(r => ({
                    ...r,
                    venue_name: venueNames[String(r.venue_id)] || `Venue ${r.venue_id}`,
                })),
                stats: { total: totalCount, flagged: flaggedCount, avg_rating: parseFloat(avgRating) },
            });
        }

        // ─── DELETE — Admin hard-delete a review ────────────────────────────────
        if (req.method === 'DELETE') {
            const { review_id } = req.query;
            if (!review_id) return res.status(400).json({ success: false, error: 'review_id required' });

            // Grab venue_id before delete for trust score recalc
            const { data: existing } = await getSupabase()
                .from('venue_reviews')
                .select('venue_id, reviewer_name')
                .eq('id', review_id)
                .maybeSingle();

            const { error } = await getSupabase()
                .from('venue_reviews')
                .delete()
                .eq('id', review_id);

            if (error) {
                console.error('[Admin Reviews DELETE] Error:', error);
                return res.status(500).json({ success: false, error: error.message });
            }

            // Recalculate trust score after deletion
            if (existing?.venue_id) {
                try {
                    await getSupabase().rpc('recalculate_venue_trust_score', { p_venue_id: String(existing.venue_id) });
                } catch (_) { /* non-fatal */ }
            }

            // Audit log
            try {
                await getSupabase().from('admin_audit_log').insert([{
                    admin_user_id: user.id,
                    action: 'delete_venue_review',
                    target_id: review_id,
                    details: { reviewer_name: existing?.reviewer_name, venue_id: existing?.venue_id },
                    created_at: new Date().toISOString(),
                }]);
            } catch (_) { /* non-fatal audit */ }

            return res.status(200).json({ success: true, deleted_id: review_id });
        }

        // ─── PATCH — Flag or unflag a review ────────────────────────────────────
        if (req.method === 'PATCH') {
            const { review_id, action, reason } = req.body;
            if (!review_id || !['flag', 'unflag'].includes(action)) {
                return res.status(400).json({ success: false, error: 'review_id and action (flag|unflag) required' });
            }

            const updatePayload = action === 'flag'
                ? { is_flagged: true, flag_reason: reason || 'Admin flagged', updated_at: new Date().toISOString() }
                : { is_flagged: false, flag_reason: null, updated_at: new Date().toISOString() };

            const { error } = await getSupabase()
                .from('venue_reviews')
                .update(updatePayload)
                .eq('id', review_id);

            if (error) {
                console.error('[Admin Reviews PATCH] Error:', error);
                return res.status(500).json({ success: false, error: error.message });
            }

            return res.status(200).json({ success: true, action, review_id });
        }

        return res.status(405).json({ success: false, error: `Method ${req.method} not allowed` });

    } catch (err) {
        console.error('[Admin Reviews API] Error:', err);
        if (!res.headersSent) return res.status(500).json({ success: false, error: err.message || 'Internal server error' });
    }
}
