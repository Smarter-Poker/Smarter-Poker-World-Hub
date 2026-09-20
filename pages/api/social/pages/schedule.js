/**
 * Social Page Tournament Schedule API
 *
 * GET /api/social/pages/schedule?page_id=xxx — Get upcoming/running tournaments
 *     Bridges to commander_tournaments via linked_venue_id
 */
import { createClient } from '../../../../src/lib/supabaseServerClient';
import { reportApiError } from '../../../../src/lib/apiErrorHandler';

// NOTE: Removed edge runtime — this handler uses Node.js Pages Router API (req.query/res.status/etc)
// and cannot run on Vercel Edge Runtime. Keep as Node.js runtime.

let _supabase = null;
function getSupabase() {
    if (!_supabase) {
        const url = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://kuklfnapbkmacvwxktbh.supabase.co';
        const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
        _supabase = createClient(url, key);
    }
    return _supabase;
}

export default async function handler(req, res) {
    try {
        if (req.method !== 'GET') {
            return res.status(405).json({ success: false, error: 'Method not allowed' });
        }

        const { page_id } = req.query;
        if (!page_id) {
            return res.status(400).json({ success: false, error: 'page_id required' });
        }

        // Look up the social page to get linked_venue_id
        const { data: pageData } = await getSupabase()
            .from('social_pages')
            .select('linked_venue_id, metadata')
            .eq('id', page_id)
            .maybeSingle();

        const rawVenueId = pageData?.linked_venue_id || pageData?.metadata?.linked_venue_id;
        if (!rawVenueId) {
            return res.status(200).json({ success: true, data: [], source: 'none' });
        }

        const venueId = parseInt(rawVenueId, 10);
        if (isNaN(venueId)) {
            return res.status(200).json({ success: true, data: [], source: 'none' });
        }

        // Fetch upcoming and running tournaments from Commander
        const { data: tournaments, error } = await getSupabase()
            .from('commander_tournaments')
            .select('id, name, description, tournament_type, buyin_amount, buyin_fee, starting_chips, scheduled_start, registration_opens, late_registration_levels, status, current_entries, players_remaining, min_entries, max_entries, guaranteed_pool, allows_rebuys, rebuy_amount, allows_addon, addon_amount, bounty_amount, series_id, created_at')
            .eq('venue_id', venueId)
            .in('status', ['scheduled', 'registration', 'running', 'paused', 'final_table'])
            .order('scheduled_start', { ascending: true })
            .limit(50);

        if (error) {
            console.warn('[Schedule API] Error:', error);
            return res.status(500).json({ success: false, error: 'Internal server error' });
        }

        // Also fetch recently completed (last 7 days) for reference
        const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
        const { data: recent } = await getSupabase()
            .from('commander_tournaments')
            .select('id, name, tournament_type, buyin_amount, buyin_fee, status, current_entries, scheduled_start, guaranteed_pool')
            .eq('venue_id', venueId)
            .eq('status', 'completed')
            .gte('scheduled_start', sevenDaysAgo)
            .order('scheduled_start', { ascending: false })
            .limit(10);

        // Map to a clean response shape
        const mapped = (tournaments || []).map(t => ({
            id: t.id,
            name: t.name,
            description: t.description,
            type: t.tournament_type,
            buyin: t.buyin_amount + (t.buyin_fee || 0),
            buyin_amount: t.buyin_amount,
            buyin_fee: t.buyin_fee || 0,
            starting_chips: t.starting_chips,
            scheduled_start: t.scheduled_start,
            registration_opens: t.registration_opens,
            late_reg_levels: t.late_registration_levels,
            status: t.status,
            entries: t.current_entries || 0,
            remaining: t.players_remaining || 0,
            min_entries: t.min_entries,
            max_entries: t.max_entries,
            guaranteed: t.guaranteed_pool,
            rebuys: t.allows_rebuys,
            rebuy_amount: t.rebuy_amount,
            addon: t.allows_addon,
            addon_amount: t.addon_amount,
            bounty: t.bounty_amount,
            series_id: t.series_id,
        }));

        const recentMapped = (recent || []).map(t => ({
            id: t.id,
            name: t.name,
            type: t.tournament_type,
            buyin: t.buyin_amount + (t.buyin_fee || 0),
            status: 'completed',
            entries: t.current_entries || 0,
            scheduled_start: t.scheduled_start,
            guaranteed: t.guaranteed_pool,
        }));

        return res.status(200).json({
            success: true,
            data: mapped,
            recent: recentMapped,
            source: 'commander',
            venue_id: venueId,
        });

    } catch (err) {
        try { reportApiError(err, req); } catch (_reportError) { console.warn('[App] Handled exception:', _reportError?.message || _reportError); }
        console.warn('[Schedule API Error]', err);
        if (!res.headersSent) return res.status(500).json({ success: false, error: 'Internal server error' });
    }
}
