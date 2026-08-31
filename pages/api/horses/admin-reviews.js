import { getServerUserWithFallback } from '../../../src/lib/serverAuth';
/**
 * ADMIN REVIEWS API
 * GET  /api/horses/admin-reviews — List all venue reviews with filters
 * DELETE /api/horses/admin-reviews — Admin-delete any review by id
 * PATCH  /api/horses/admin-reviews — Flag/unflag a review as inappropriate
 *
 * All endpoints require admin/superadmin/god role via JWT.
 *
 * PAGING (GET) is by query string: ?offset=<n>&limit=<n>. offset defaults to
 * 0, limit defaults to 100 and is clamped to 1..500. The response echoes what
 * was actually applied as `page: { offset, limit, returned }`, and
 * `stats.total` is the whole-table row count to page against.
 */
import { createClient } from '../../../src/lib/supabaseServerClient';
import { reportApiError } from '../../../src/lib/sentryWrap';
const { logAdminAction } = require('../../../src/lib/antiAbuse');

import { applyRateLimit, LIMITS } from '../../../src/lib/apiRateLimit';
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
    const { user: authUser, error: authErr } = await getServerUserWithFallback(req, getSupabase());
    const authData = { user: authUser };
    const user = authData?.user;
    if (authErr || !user) { res.status(401).json({ error: 'Invalid token' }); return null; }
    const { data: profile } = await getSupabase()
        .from('profiles').select('role').eq('id', user.id).maybeSingle();
    if (!profile || !['admin', 'superadmin', 'god'].includes(profile.role)) {
        res.status(403).json({ error: 'Admin access required' }); return null;
    }
    return user;
}

export default async function handler(req, res) {
  // [Phase 6.1.15] Rate limit writes — prevents enumeration + drain attacks.
  if (['POST','PUT','PATCH','DELETE'].includes(req.method)) {
    if (!applyRateLimit(req, res, LIMITS.write)) return;
  } else if (!applyRateLimit(req, res, LIMITS.read)) {
    // The GET enumerates every review plus the reviewers' user_ids — bound it
    // the same way the write verbs are bounded.
    return;
  }

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

            // Coerce paging inputs FIRST. parseInt('abc') is NaN, and
            // .range(NaN, NaN) makes PostgREST return 400. Also drop the
            // redundant .limit() — .range() already bounds the page, and
            // applying both made the two disagree whenever offset > 0.
            const off = Math.max(parseInt(offset, 10) || 0, 0);
            const lim = Math.min(Math.max(parseInt(limit, 10) || 100, 1), 500);

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
                .range(off, off + lim - 1);

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
                console.warn('[Admin Reviews GET] Error:', error);
                return res.status(500).json({ success: false, error: 'Internal server error' });
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
                        (venues || []).forEach(v => { venueNames[String(v.id)] = `${v.name}${v.city ? ` - ${v.city}` : ''}${v.state ? `, ${v.state}` : ''}`; });
                    } catch (_) { console.warn('[App] Handled exception:', _?.message || _); }
                }
            }

            // Whole-table stats. These were previously computed over the
            // CURRENT PAGE only, so the dashboard's "Total Reviews" was really
            // just the page size (100 by default).
            //
            // The average is still computed from a capped sample rather than
            // a server-side avg(): PostgREST aggregate functions are DISABLED
            // on this project (`rating.avg()` returns PGRST123 "Use of
            // aggregate functions is not allowed", verified against
            // production 2026-08-26) and there is no review-stats RPC to call
            // instead. So the cap stays, and `avg_rating_sampled` /
            // `avg_rating_sample_size` say exactly what the number was built
            // from. venue_reviews holds 0 rows in production today, so the
            // cap is not currently reached.
            //
            // FILTERED COUNT, 2026-08-27. `total` is what the UI builds
            // "Page X of N" from, but it was counted over the WHOLE table
            // while the listing above is filtered by venue_id / rating /
            // flagged. With "flagged only" on, the pager offered pages that
            // did not exist and every one of them rendered empty. The
            // unfiltered figures are still returned separately, because the
            // header tiles legitimately want the whole-table numbers.
            const AVG_SAMPLE_CAP = 10000;
            const applyFilters = (q) => {
                if (venue_id) q = q.eq('venue_id', String(venue_id));
                if (rating) q = q.eq('rating', parseInt(rating, 10));
                if (flagged === 'true') q = q.eq('is_flagged', true);
                return q;
            };
            const [totalRes, flaggedRes, ratingsRes, filteredRes] = await Promise.all([
                getSupabase().from('venue_reviews').select('id', { count: 'exact', head: true }),
                getSupabase().from('venue_reviews').select('id', { count: 'exact', head: true }).eq('is_flagged', true),
                getSupabase().from('venue_reviews').select('rating').not('rating', 'is', null).limit(AVG_SAMPLE_CAP),
                applyFilters(getSupabase().from('venue_reviews').select('id', { count: 'exact', head: true })),
            ]);
            if (filteredRes.error) console.warn('[Admin Reviews GET] filtered count error:', filteredRes.error.message || filteredRes.error);

            if (totalRes.error) console.warn('[Admin Reviews GET] total count error:', totalRes.error.message || totalRes.error);
            if (flaggedRes.error) console.warn('[Admin Reviews GET] flagged count error:', flaggedRes.error.message || flaggedRes.error);
            if (ratingsRes.error) console.warn('[Admin Reviews GET] rating average error:', ratingsRes.error.message || ratingsRes.error);

            const totalCount = totalRes.count ?? null;
            const flaggedCount = flaggedRes.count ?? null;

            const ratingRows = ratingsRes.data || [];
            const avgRating = ratingRows.length > 0
                ? parseFloat((ratingRows.reduce((sum, r) => sum + (r.rating || 0), 0) / ratingRows.length).toFixed(2))
                : null;

            return res.status(200).json({
                success: true,
                reviews: (reviews || []).map(r => ({
                    ...r,
                    venue_name: venueNames[String(r.venue_id)] || `Venue ${r.venue_id}`,
                })),
                page: { offset: off, limit: lim, returned: reviews?.length || 0 },
                stats: {
                    total: totalCount,
                    flagged: flaggedCount,
                    // The count under the CURRENT filters. This is what the
                    // pager must divide by; `total` is the whole table and is
                    // what the header tile shows. Using `total` for both meant
                    // "flagged only" offered pages that did not exist.
                    filtered_total: filteredRes.count ?? null,
                    avg_rating: avgRating,
                    // True when the average was computed from a capped sample
                    // rather than every row, so the number is not presented as
                    // something it is not. False here means every rated row on
                    // the table went into the average.
                    avg_rating_sampled: ratingRows.length >= AVG_SAMPLE_CAP,
                    avg_rating_sample_size: ratingRows.length,
                    avg_rating_sample_cap: AVG_SAMPLE_CAP,
                },
            });
        }

        // ─── DELETE — Admin hard-delete a review ────────────────────────────────
        if (req.method === 'DELETE') {
            const { review_id } = req.query;
            if (!review_id) return res.status(400).json({ success: false, error: 'review_id required' });

            // Grab venue_id and user_id before delete for trust score recalc and punishments
            const { data: existing } = await getSupabase()
                .from('venue_reviews')
                .select('venue_id, user_id, reviewer_name')
                .eq('id', review_id)
                .maybeSingle();

            // .select() so the affected row count is knowable. Without it a stale
            // or already-deleted id came back { error: null }, the UI removed the
            // row and decremented the total, and admin_audit_log recorded a
            // deletion that never happened -- a false entry in the one table that
            // is supposed to be the record of truth.
            const { data: deletedRows, error } = await getSupabase()
                .from('venue_reviews')
                .delete()
                .eq('id', review_id)
                .select('id');

            if (error) {
                console.warn('[Admin Reviews DELETE] Error:', error);
                return res.status(500).json({ success: false, error: 'Internal server error' });
            }

            // Stop here on a zero-row delete. Everything below -- the trust-score
            // recalc, the reviewer punishment, the push notification and the audit
            // write -- is a consequence of a deletion that did not occur.
            if (!deletedRows || deletedRows.length === 0) {
                return res.status(404).json({ success: false, error: 'That review no longer exists.' });
            }

            // Recalculate trust score after deletion. RPC errors don't throw —
            // capture explicitly so a real RPC failure logs instead of leaving
            // the venue trust_score stale.
            if (existing?.venue_id) {
                try {
                    const { error: trustErr } = await getSupabase().rpc('recalculate_venue_trust_score', { p_venue_id: String(existing.venue_id) });
                    if (trustErr) {
                        console.warn('[Admin Reviews DELETE] trust_score recalc RPC error (score stale):', trustErr?.message || trustErr);
                    }
                } catch (_) { console.warn('[App] Handled exception:', _?.message || _); }
            }

            // Apply Trust Score Punishment & Send Push Notification
            if (existing?.user_id) {
                try {
                    const { data: prof } = await getSupabase().from('profiles').select('deleted_reviews_count').eq('id', existing.user_id).maybeSingle();
                    if (prof) {
                        const newCount = (prof.deleted_reviews_count || 0) + 1;
                        const updateObj = { deleted_reviews_count: newCount };
                        
                        if (newCount >= 3) {
                            updateObj.can_review = false;
                        }
                        
                        const { error: err_profiles_jetkg } = await getSupabase().from('profiles').update(updateObj).eq('id', existing.user_id);
                        
                        if (err_profiles_jetkg) console.warn('[Supabase] Silent mutation failed in profiles:', err_profiles_jetkg.message);
                        
                        // Push Notification Dispatch via internal API
                        const pushMessage = updateObj.can_review === false 
                           ? 'Your review was removed. Due to repeated violations of Community Guidelines, you can no longer leave reviews.'
                           : 'Your recent poker venue review was removed for violating Community Guidelines.';
                           
                        // /api/notifications/send takes `externalUserIds` (an
                        // array of Supabase user ids) and authenticates
                        // server-to-server callers with the x-admin-secret
                        // header. The old call sent `userId` with a
                        // service-role JWT as a Bearer token — that JWT has no
                        // `sub`, so it failed auth every time and no
                        // moderation notification was ever delivered.
                        try {
                            const notifyRes = await fetch(`${process.env.NEXT_PUBLIC_APP_URL || process.env.NEXT_PUBLIC_SITE_URL || 'https://smarter.poker'}/api/notifications/send`, {
                                method: 'POST',
                                headers: {
                                    'Content-Type': 'application/json',
                                    'x-admin-secret': process.env.ADMIN_ROUTE_SECRET || ''
                                },
                                body: JSON.stringify({
                                    externalUserIds: [existing.user_id],
                                    title: 'Community Guidelines Update',
                                    message: pushMessage
                                })
                            });
                            if (!notifyRes.ok) {
                                const detail = await notifyRes.text().catch(() => '');
                                console.warn('[Admin Reviews DELETE] Moderation notification not delivered:', notifyRes.status, detail.slice(0, 300));
                            }
                        } catch (e) {
                            console.warn('[Admin Reviews DELETE] Push dispatch failed:', e?.message || e);
                        }
                    }
                } catch (punishErr) {
                    console.warn('[Admin Reviews DELETE] Trust Score Error:', punishErr);
                }
            }

            // Audit log
            const { error: auditErr } = await getSupabase().from('admin_audit_log').insert([{
                admin_user_id: user.id,
                action: 'delete_venue_review',
                target_type: 'venue_review',
                target_id: review_id,
                details: { reviewer_name: existing?.reviewer_name, venue_id: existing?.venue_id },
                created_at: new Date().toISOString(),
            }]);
            if (auditErr) console.warn('[Admin Reviews DELETE] Failed to log audit:', auditErr.message);

            return res.status(200).json({ success: true, deleted_id: review_id });
        }

        // ─── PATCH — Flag or unflag a review ────────────────────────────────────
        if (req.method === 'PATCH') {
            const { review_id, action, reason } = req.body || {};
            if (!review_id || !['flag', 'unflag'].includes(action)) {
                return res.status(400).json({ success: false, error: 'review_id and action (flag|unflag) required' });
            }

            // Capture the prior state before writing, so the audit row can say
            // what actually changed.
            const { data: priorReview } = await getSupabase()
                .from('venue_reviews')
                .select('venue_id, user_id, reviewer_name, is_flagged, flag_reason')
                .eq('id', review_id)
                .maybeSingle();

            // NOTE: venue_reviews has NO updated_at column in production.
            // Sending one made PostgREST reject every flag/unflag with
            // PGRST204, so moderation flagging 500'd 100% of the time.
            const updatePayload = action === 'flag'
                ? { is_flagged: true, flag_reason: reason || 'Admin flagged' }
                : { is_flagged: false, flag_reason: null };

            // Same zero-row problem as DELETE. Flagging suppresses a business's
            // public review; reporting success without having written one is not a
            // cosmetic bug.
            const { data: updatedRows, error } = await getSupabase()
                .from('venue_reviews')
                .update(updatePayload)
                .eq('id', review_id)
                .select('id');

            if (error) {
                console.warn('[Admin Reviews PATCH] Error:', error);
                return res.status(500).json({ success: false, error: 'Internal server error' });
            }

            if (!updatedRows || updatedRows.length === 0) {
                return res.status(404).json({ success: false, error: 'That review no longer exists.' });
            }

            // Audit log. DELETE has written one since it was built; flag/unflag
            // never did, even though flagging SUPPRESSES a business's public
            // review — a moderation act with commercial consequences that left
            // no record of who did it or why. Routed through logAdminAction so
            // it lands in admin_audit_log with the same columns DELETE uses
            // (admin_user_id, action, target_type, target_id, details,
            // ip_address, created_at) plus before/after state.
            await logAdminAction(getSupabase(), {
                admin_user_id: user.id,
                action: action === 'flag' ? 'flag_venue_review' : 'unflag_venue_review',
                target_type: 'venue_review',
                target_id: review_id,
                details: {
                    reviewer_name: priorReview?.reviewer_name,
                    venue_id: priorReview?.venue_id,
                    reason: action === 'flag' ? (reason || 'Admin flagged') : null,
                },
                before: priorReview
                    ? { is_flagged: priorReview.is_flagged, flag_reason: priorReview.flag_reason }
                    : null,
                after: updatePayload,
                req,
            });

            return res.status(200).json({ success: true, action, review_id });
        }

        return res.status(405).json({ success: false, error: `Method ${req.method} not allowed` });

    } catch (err) {
        try { reportApiError(err, req); } catch (_sentryErr) { console.warn('[App] Handled exception:', _sentryErr?.message || _sentryErr); }
        console.warn('[Admin Reviews API] Error:', err);
        if (!res.headersSent) return res.status(500).json({ success: false, error: 'Internal server error' });
    }
}
