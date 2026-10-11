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
import { reportApiError } from '../../../src/lib/apiErrorHandler';
import { contributionPrivate, contributionBody, contributionSession, contributionId, contributionUuid, schedulePayload, contributionRpc, contributionError } from '../../../src/lib/poker-near-me/venueContributionsServer';

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
const SCHEDULE_PAGE_SIZE = 200;
const SCHEDULE_MAX_PAGES = 25;

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


export default async function handler(req, res) {
    Object.entries(getCorsHeaders(req, req.method)).forEach(([k, v]) => res.setHeader(k, v));
    if (req.method === 'OPTIONS') return res.status(200).end();

    if (['POST', 'DELETE'].includes(req.method)) {
        contributionPrivate(res);
        if (!applyRateLimit(req, res, LIMITS.write)) return;
        let operationId;
        try {
            const session = await contributionSession(req, res);
            if (!session) return;
            const body = req.method === 'DELETE' && !req.body ? req.query : contributionBody(req);
            operationId = contributionUuid(body.operation_id);
            const venueId = contributionId(body.venue_id);
            const payload = schedulePayload(body, req.method === 'DELETE' ? 'delete' : body.id ? 'update' : 'create');
            const receipt = await contributionRpc(session.client, 'pnm_mutate_venue_schedule', { p_request_id: operationId, p_venue_id: venueId, p_payload: payload }, operationId);
            return res.status(payload.action === 'create' ? 201 : 200).json({ success: true, ...receipt, data: receipt.schedule, action: payload.action === 'delete' ? 'deleted' : payload.action === 'update' ? 'updated' : 'created' });
        } catch (error) { if (operationId && !error.code && !error.status) error.operationId = operationId; return contributionError(res, error); }
    }


    try {
        // ─── GET: Fetch schedules for a venue ───
        if (req.method === 'GET') {
            if (!applyRateLimit(req, res, LIMITS.read)) return;
            res.setHeader('Cache-Control', req.query.refresh === '1' ? 'private, no-store' : 'public, s-maxage=60, stale-while-revalidate=300');

            const safeQ = (v) => v ? (Array.isArray(v) ? String(v[0]) : typeof v === 'object' ? null : String(v)) : v;
            const venue_id = safeQ(req.query.venue_id);
            if (!venue_id) {
                return res.status(400).json({ success: false, error: 'Missing venue_id' });
            }

            const venueId = parseInt(venue_id, 10);
            if (isNaN(venueId) || venueId < 1) {
                return res.status(400).json({ success: false, error: 'Invalid venue_id' });
            }

            const data = [];
            const seen = new Set();
            let complete = false;
            for (let page = 0; page < SCHEDULE_MAX_PAGES; page++) {
                const offset = page * SCHEDULE_PAGE_SIZE;
                const { data: rows, error } = await getSupabase()
                    .from('venue_game_schedules')
                    .select('*')
                    .eq('venue_id', venueId)
                    .eq('is_active', true)
                    .order('day_of_week')
                    .order('start_time')
                    .order('id', { ascending: true })
                    .range(offset, offset + SCHEDULE_PAGE_SIZE - 1);
                if (error || !Array.isArray(rows)) {
                    contributionPrivate(res);
                    return res.status(503).json({ success: false, error: 'Venue schedules unavailable. Try again.' });
                }
                for (const row of rows) {
                    // A concurrent reorder must not advertise a duplicate partial
                    // inventory as complete. The caller can make a fresh read.
                    if (row.id == null || seen.has(String(row.id))) {
                        contributionPrivate(res);
                        return res.status(503).json({ success: false, error: 'Venue schedules changed during loading. Try again.' });
                    }
                    seen.add(String(row.id));
                    data.push(row);
                }
                if (rows.length < SCHEDULE_PAGE_SIZE) { complete = true; break; }
            }
            if (!complete) {
                contributionPrivate(res);
                return res.status(503).json({ success: false, error: 'Complete venue schedules unavailable. Try again.' });
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

        return res.status(405).json({ success: false, error: 'Method not allowed' });
    } catch (err) {
        try { reportApiError(err, req); } catch (_reportError) { console.warn('[App] Handled exception:', _reportError?.message || _reportError); }
        console.warn('[venue-schedules] Unhandled error:', err);
        return res.status(500).json({ success: false, error: 'Internal server error' });
    }
}
