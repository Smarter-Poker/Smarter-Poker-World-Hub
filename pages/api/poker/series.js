/**
 * Tournament Series API - Get major poker tournament series
 */
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

// Fallback tournament series
const FALLBACK_SERIES = [
    { id: 1, name: "55th Annual World Series of Poker", short_name: "WSOP", location: "Las Vegas, NV", start_date: "2026-05-26", end_date: "2026-07-16", main_event_buyin: 10000, main_event_guaranteed: 50000000, total_events: 99, series_type: "major", is_featured: true },
    { id: 2, name: "WPT World Championship", short_name: "WPT", location: "Las Vegas, NV", start_date: "2026-11-29", end_date: "2026-12-17", main_event_buyin: 10400, main_event_guaranteed: 15000000, total_events: 35, series_type: "major", is_featured: true },
    { id: 3, name: "Venetian DeepStack Championship", short_name: "VDC", location: "Las Vegas, NV", start_date: "2026-05-01", end_date: "2026-05-31", main_event_buyin: 5000, main_event_guaranteed: 2000000, total_events: 60, series_type: "major", is_featured: true },
    { id: 4, name: "Seminole Hard Rock Poker Open", short_name: "SHRPO", location: "Hollywood, FL", start_date: "2026-08-01", end_date: "2026-08-15", main_event_buyin: 5250, main_event_guaranteed: 5000000, total_events: 45, series_type: "major", is_featured: true },
    { id: 5, name: "European Poker Tour Barcelona", short_name: "EPT", location: "Barcelona, Spain", start_date: "2026-08-14", end_date: "2026-08-25", main_event_buyin: 5300, main_event_guaranteed: 10000000, total_events: 70, series_type: "major", is_featured: true },
];

export default async function handler(req, res) {
    if (req.method !== 'GET') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    try {
        const {
            upcoming = 'true',
            type, // major, regional, circuit
            limit = 20
        } = req.query;

        let query = supabase
            .from('tournament_series')
            .select('*')
            .order('start_date', { ascending: true })
            .limit(parseInt(limit));

        // Filter upcoming only
        if (upcoming === 'true') {
            query = query.gte('start_date', new Date().toISOString().split('T')[0]);
        }

        // Filter by series type
        if (type) {
            query = query.eq('series_type', type);
        }

        const { data, error } = await query;

        if (error || !data?.length) {
            let filtered = FALLBACK_SERIES;
            if (type) filtered = filtered.filter(s => s.series_type === type);
            return res.status(200).json({ success: true, data: filtered.slice(0, parseInt(limit)) });
        }

        return res.status(200).json({ success: true, data });
    } catch (error) {
        return res.status(200).json({ success: true, data: FALLBACK_SERIES });
    }
}
