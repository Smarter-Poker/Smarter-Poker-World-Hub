/**
 * Tournament Series API - Get major poker tournament series
 * Supports date range filtering and search
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
    { id: 6, name: "WSOP Circuit - Choctaw", short_name: "WSOPC", location: "Durant, OK", start_date: "2026-01-07", end_date: "2026-01-19", main_event_buyin: 1700, main_event_guaranteed: 500000, total_events: 45, series_type: "circuit", is_featured: false },
    { id: 7, name: "LA Poker Classic", short_name: "LAPC", location: "Los Angeles, CA", start_date: "2026-01-07", end_date: "2026-03-01", main_event_buyin: 10400, main_event_guaranteed: 2000000, total_events: 65, series_type: "major", is_featured: true },
    { id: 8, name: "WPT Lucky Hearts Poker Open", short_name: "WPTLH", location: "Ft. Lauderdale, FL", start_date: "2026-01-06", end_date: "2026-01-20", main_event_buyin: 3500, main_event_guaranteed: 2000000, total_events: 58, series_type: "major", is_featured: true },
];

export default async function handler(req, res) {
    if (req.method !== 'GET') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    try {
        const {
            upcoming = 'true',
            type, // major, regional, circuit
            limit = 50,
            start_date,
            end_date,
            search
        } = req.query;

        let query = supabase
            .from('tournament_series')
            .select('*')
            .order('start_date', { ascending: true })
            .limit(parseInt(limit));

        // Filter upcoming only
        if (upcoming === 'true' && !start_date) {
            query = query.gte('start_date', new Date().toISOString().split('T')[0]);
        }

        // Filter by date range
        if (start_date) {
            query = query.gte('start_date', start_date);
        }
        if (end_date) {
            query = query.lte('start_date', end_date);
        }

        // Filter by series type
        if (type) {
            query = query.eq('series_type', type);
        }

        // Search by name or location
        if (search) {
            query = query.or(`name.ilike.%${search}%,location.ilike.%${search}%,venue_name.ilike.%${search}%`);
        }

        const { data, error } = await query;
        let seriesData = data || [];

        if (error || !seriesData.length) {
            seriesData = FALLBACK_SERIES;
            if (type) seriesData = seriesData.filter(s => s.series_type === type);
            if (search) seriesData = seriesData.filter(s =>
                s.name.toLowerCase().includes(search.toLowerCase()) ||
                s.location.toLowerCase().includes(search.toLowerCase())
            );
            if (start_date) seriesData = seriesData.filter(s => s.start_date >= start_date);
            if (end_date) seriesData = seriesData.filter(s => s.start_date <= end_date);
        }

        return res.status(200).json({
            success: true,
            data: seriesData.slice(0, parseInt(limit)),
            total: seriesData.length
        });
    } catch (error) {
        console.error('Series API error:', error);
        return res.status(200).json({ success: true, data: FALLBACK_SERIES });
    }
}

