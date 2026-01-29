/**
 * Tournament Series API - Get major poker tournament series
 * Serves all 70 tournament series from poker-tour-series-2026.json
 * Supports date range filtering, search, and individual series lookup
 */
import { createClient } from '@supabase/supabase-js';
import tourSeriesData from '../../../data/poker-tour-series-2026.json';

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

// Build full series list from JSON data with numeric IDs
function getSeriesFromJson() {
    return (tourSeriesData.series_2026 || []).map((s, index) => ({
        id: index + 1,
        series_uid: s.series_uid,
        name: s.name,
        short_name: s.short_name,
        tour: s.tour,
        venue_name: s.venue,
        location: `${s.city}, ${s.state}`,
        city: s.city,
        state: s.state,
        start_date: s.start_date,
        end_date: s.end_date,
        total_events: s.total_events,
        main_event_buyin: s.main_event_buyin,
        main_event_guaranteed: s.main_event_guaranteed,
        series_type: s.series_type,
        source_url: s.source_url,
        is_featured: s.is_featured || false
    }));
}

const ALL_SERIES = getSeriesFromJson();

export default async function handler(req, res) {
    if (req.method !== 'GET') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    try {
        const {
            id,             // Get series by numeric ID
            series_uid,     // Get series by UID
            upcoming = 'true',
            type,           // major, regional, circuit
            tour,           // Filter by tour code (WSOP, WPT, etc.)
            limit = 50,
            start_date,
            end_date,
            search
        } = req.query;

        // --- Single series lookup by ID ---
        if (id) {
            const series = ALL_SERIES.find(s => String(s.id) === String(id));
            if (series) {
                return res.status(200).json({ success: true, data: [series], total: 1 });
            }
            return res.status(404).json({ success: false, error: 'Series not found' });
        }

        // --- Single series lookup by UID ---
        if (series_uid) {
            const series = ALL_SERIES.find(s => s.series_uid === series_uid);
            if (series) {
                return res.status(200).json({ success: true, data: [series], total: 1 });
            }
            return res.status(404).json({ success: false, error: 'Series not found' });
        }

        // --- Try database first, fallback to JSON ---
        let seriesData = [];
        let fromDb = false;

        try {
            let query = supabase
                .from('tournament_series')
                .select('*')
                .order('start_date', { ascending: true })
                .limit(parseInt(limit));

            if (upcoming === 'true' && !start_date) {
                query = query.gte('start_date', new Date().toISOString().split('T')[0]);
            }
            if (start_date) query = query.gte('start_date', start_date);
            if (end_date) query = query.lte('start_date', end_date);
            if (type) query = query.eq('series_type', type);
            if (search) query = query.or(`name.ilike.%${search}%,location.ilike.%${search}%,venue_name.ilike.%${search}%`);

            const { data, error } = await query;
            if (!error && data && data.length > 0) {
                seriesData = data;
                fromDb = true;
            }
        } catch (e) {
            // DB not available, use JSON fallback
        }

        // --- Fallback: filter from JSON data ---
        if (!fromDb) {
            seriesData = [...ALL_SERIES];
            const today = new Date().toISOString().split('T')[0];

            // Filter upcoming
            if (upcoming === 'true' && !start_date) {
                seriesData = seriesData.filter(s => s.end_date >= today);
            }

            // Filter by date range
            if (start_date) {
                seriesData = seriesData.filter(s => s.start_date >= start_date);
            }
            if (end_date) {
                seriesData = seriesData.filter(s => s.start_date <= end_date);
            }

            // Filter by series type
            if (type) {
                seriesData = seriesData.filter(s => s.series_type === type);
            }

            // Filter by tour
            if (tour) {
                seriesData = seriesData.filter(s => s.tour === tour.toUpperCase());
            }

            // Search by name, location, or venue
            if (search) {
                const searchLower = search.toLowerCase();
                seriesData = seriesData.filter(s =>
                    s.name.toLowerCase().includes(searchLower) ||
                    s.location.toLowerCase().includes(searchLower) ||
                    (s.venue_name && s.venue_name.toLowerCase().includes(searchLower)) ||
                    (s.tour && s.tour.toLowerCase().includes(searchLower)) ||
                    (s.series_uid && s.series_uid.toLowerCase().includes(searchLower))
                );
            }

            // Sort by start date
            seriesData.sort((a, b) => new Date(a.start_date) - new Date(b.start_date));
        }

        const total = seriesData.length;

        return res.status(200).json({
            success: true,
            data: seriesData.slice(0, parseInt(limit)),
            total,
            source: fromDb ? 'database' : 'json'
        });
    } catch (error) {
        console.error('Series API error:', error);
        return res.status(200).json({
            success: true,
            data: ALL_SERIES,
            total: ALL_SERIES.length,
            source: 'json-fallback'
        });
    }
}
