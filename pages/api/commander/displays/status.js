/**
 * Display Status API
 * GET /api/commander/displays/status?venue_id=VENUE_ID
 *
 * Returns the online status of all registered tablet displays for a venue.
 * Used by the admin table-tablets page to show green/gray online indicators.
 */
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
);

export default async function handler(req, res) {
    if (req.method !== 'GET') {
        return res.status(405).json({ success: false, error: 'Method not allowed' });
    }

    const { venue_id } = req.query;

    if (!venue_id) {
        return res.status(400).json({ success: false, error: 'venue_id required' });
    }

    try {
        const { data, error } = await supabase
            .from('commander_table_displays')
            .select('device_id, device_name, device_type, is_online, last_heartbeat')
            .eq('venue_id', venue_id)
            .order('device_name', { ascending: true });

        if (error) {
            // Table might not exist yet — return empty
            console.warn('Display status query warning:', error.message);
            return res.status(200).json({ success: true, data: [] });
        }

        // Mark devices as offline if heartbeat is stale (>2 min)
        const TWO_MINUTES = 2 * 60 * 1000;
        const enriched = (data || []).map(d => ({
            ...d,
            is_online: d.is_online && d.last_heartbeat && (Date.now() - new Date(d.last_heartbeat).getTime()) < TWO_MINUTES,
        }));

        return res.status(200).json({ success: true, data: enriched });
    } catch (err) {
        console.error('Display status error:', err);
        return res.status(500).json({ success: false, error: err.message });
    }
}
