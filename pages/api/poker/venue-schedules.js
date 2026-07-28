/**
 * Venue Game Schedules API
 * Manages per-day cash game schedules for poker venues.
 *
 * GET  ?venue_id=123        — Returns all active schedules for a venue, grouped by day
 * POST { venue_id, day_of_week, game_name, start_time?, end_time?, notes? }  — Add/update a schedule entry
 * DELETE ?id=456             — Soft-delete (set is_active = false)
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

const DAYS_ORDER = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];

// [Phase 6.1.13] Origin-scoped via shared helper. GETs used to allow `*`
// (public venue data) but that let any site — including ad frames —
// pull authenticated venue data if the user happened to be signed in.
// Now same-origin + our domains + localhost + Vercel previews only.
const { corsHeaders } = require('../../../src/lib/cors');

function getCorsHeaders(req /*, method */) {
    return corsHeaders(req, {
        methods: 'GET, POST, DELETE, OPTIONS',
        headers: 'Content-Type, Authorization',
    });
}


/**
 * Check if user is authorized to edit a venue's schedule:
 * - Admin role, OR
 * - Has an approved venue_claims entry for this venue
 */
async function isAuthorizedEditor(userId, venueId) {
    if (!userId || !venueId) return false;

    // Check admin role
    try {
        const { data: profile } = await getSupabase()
            .from('profiles')
            .select('role')
            .eq('id', userId)
            .maybeSingle();
        if (profile && (profile.role === 'admin' || profile.role === 'superadmin')) return true;
    } catch { /* continue to claim check */ }

    // Check venue claims
    try {
        const { data: claim } = await getSupabase()
            .from('venue_claims')
            .select('id')
            .eq('venue_id', venueId)
            .eq('user_id', userId)
            .eq('status', 'approved')
            .maybeSingle();
        if (claim) return true;
    } catch { /* no claim */ }

    return false;
}

export default async function handler(req, res) {
    Object.entries(getCorsHeaders(req, req.method)).forEach(([k, v]) => res.setHeader(k, v));
    if (req.method === 'OPTIONS') return res.status(200).end();


    try {
        // ─── GET: Fetch schedules for a venue ───
        if (req.method === 'GET') {
            if (!applyRateLimit(req, res, LIMITS.read)) return;
            res.setHeader('Cache-Control', 'public, s-maxage=60, stale-while-revalidate=300');

            const safeQ = (v) => v ? (Array.isArray(v) ? String(v[0]) : typeof v === 'object' ? null : String(v)) : v;
            const venue_id = safeQ(req.query.venue_id);
            if (!venue_id) {
                return res.status(400).json({ success: false, error: 'Missing venue_id' });
            }

            const venueId = parseInt(venue_id, 10);
            if (isNaN(venueId) || venueId < 1) {
                return res.status(400).json({ success: false, error: 'Invalid venue_id' });
            }

            const { data, error } = await getSupabase()
                .from('venue_game_schedules')
                .select('*')
                .eq('venue_id', venueId)
                .eq('is_active', true)
                .order('day_of_week')
                .order('start_time')
                .limit(200);

            if (error) {
                console.warn('[venue-schedules] GET error:', error);
                return res.status(500).json({ success: false, error: 'Internal server error' });
            }

            // Group by day of week
            const grouped = {};
            DAYS_ORDER.forEach(day => { grouped[day] = []; });
            (data || []).forEach(row => {
                if (grouped[row.day_of_week]) {
                    grouped[row.day_of_week].push(row);
                }
            });

            // Count days with games
            const activeDays = DAYS_ORDER.filter(d => grouped[d].length > 0);

            return res.status(200).json({
                success: true,
                venue_id: venueId,
                schedule: grouped,
                total_entries: (data || []).length,
                active_days: activeDays.length,
            });
        }

        // ─── POST: Add or update a schedule entry ───
        if (req.method === 'POST') {
            if (!applyRateLimit(req, res, LIMITS.write)) return;

            // Auth required
            const token = req.headers.authorization?.replace('Bearer ', '');
            if (!token) return res.status(401).json({ success: false, error: 'Authentication required' });

            const { user: authUser, error: authErr } = await getServerUserWithFallback(req, getSupabase());
    const authData = { user: authUser };
            /* removed duplicate authUser */
            if (authErr || !authUser) return res.status(401).json({ success: false, error: 'Invalid token' });

            const { venue_id, day_of_week, game_name, start_time, end_time, notes, id: updateId } = req.body;

            if (!venue_id || !day_of_week || !game_name) {
                return res.status(400).json({ success: false, error: 'Missing required fields: venue_id, day_of_week, game_name' });
            }

            const venueId = parseInt(venue_id, 10);
            if (isNaN(venueId) || venueId < 1) {
                return res.status(400).json({ success: false, error: 'Invalid venue_id' });
            }

            if (!DAYS_ORDER.includes(day_of_week)) {
                return res.status(400).json({ success: false, error: 'Invalid day_of_week. Must be one of: ' + DAYS_ORDER.join(', ') });
            }

            // Authorization check
            const authorized = await isAuthorizedEditor(authUser.id, venueId);
            if (!authorized) {
                return res.status(403).json({ success: false, error: 'Not authorized to edit this venue\'s schedule. Claim the venue first.' });
            }

            if (updateId) {
                // Update existing entry
                const { data, error } = await getSupabase()
                    .from('venue_game_schedules')
                    .update({
                        day_of_week,
                        game_name: game_name.trim(),
                        start_time: start_time?.trim() || null,
                        end_time: end_time?.trim() || null,
                        notes: notes?.trim() || null,
                        updated_by: authUser.id,
                        updated_at: new Date().toISOString(),
                    })
                    .eq('id', updateId)
                    .eq('venue_id', venueId)
                    .select()
                    .maybeSingle();

                if (error) {
                    console.warn('[venue-schedules] UPDATE error:', error);
                    return res.status(500).json({ success: false, error: 'Internal server error' });
                }

                return res.status(200).json({ success: true, data, action: 'updated' });
            } else {
                // Insert new entry
                const { data, error } = await getSupabase()
                    .from('venue_game_schedules')
                    .insert({
                        venue_id: venueId,
                        day_of_week,
                        game_name: game_name.trim(),
                        start_time: start_time?.trim() || null,
                        end_time: end_time?.trim() || null,
                        notes: notes?.trim() || null,
                        is_active: true,
                        updated_by: authUser.id,
                    })
                    .select()
                    .maybeSingle();

                if (error) {
                    console.warn('[venue-schedules] INSERT error:', error);
                    return res.status(500).json({ success: false, error: 'Internal server error' });
                }

                return res.status(201).json({ success: true, data, action: 'created' });
            }
        }

        // ─── DELETE: Soft-delete a schedule entry ───
        if (req.method === 'DELETE') {
            if (!applyRateLimit(req, res, LIMITS.write)) return;

            const token = req.headers.authorization?.replace('Bearer ', '');
            if (!token) return res.status(401).json({ success: false, error: 'Authentication required' });

            const { user: authUser, error: authErr } = await getServerUserWithFallback(req, getSupabase());
    const authData = { user: authUser };
            /* removed duplicate authUser */
            if (authErr || !authUser) return res.status(401).json({ success: false, error: 'Invalid token' });

            const safeQD = (v) => Array.isArray(v) ? v[0] : v;
            const deleteId = safeQD(req.query.id);
            const venue_id = safeQD(req.query.venue_id);
            if (!deleteId) {
                return res.status(400).json({ success: false, error: 'Missing id parameter' });
            }

            const venueId = parseInt(venue_id, 10);
            if (isNaN(venueId) || venueId < 1) {
                return res.status(400).json({ success: false, error: 'Missing or invalid venue_id' });
            }

            const authorized = await isAuthorizedEditor(authUser.id, venueId);
            if (!authorized) {
                return res.status(403).json({ success: false, error: 'Not authorized' });
            }

            const { error } = await getSupabase()
                .from('venue_game_schedules')
                .update({ is_active: false, updated_at: new Date().toISOString(), updated_by: authUser.id })
                .eq('id', parseInt(deleteId, 10))
                .eq('venue_id', venueId);

            if (error) {
                console.warn('[venue-schedules] DELETE error:', error);
                return res.status(500).json({ success: false, error: 'Internal server error' });
            }

            return res.status(200).json({ success: true, action: 'deleted' });
        }

        return res.status(405).json({ success: false, error: 'Method not allowed' });
    } catch (err) {
        try { reportApiError(err, req); } catch (_sentryErr) { console.warn('[App] Handled exception:', _sentryErr?.message || _sentryErr); }
        console.warn('[venue-schedules] Unhandled error:', err);
        return res.status(500).json({ success: false, error: 'Internal server error' });
    }
}
