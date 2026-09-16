/**
 * News Hub tournament preview.
 *
 * Location mode reads the canonical unified_events_calendar view, whose venue
 * rows already carry coordinates. Coordinates are used for this request only:
 * they are never persisted, logged, or echoed back to the browser.
 */
import { createClient } from '../../../src/lib/supabaseServerClient';
import { applyRateLimit, LIMITS } from '../../../src/lib/apiRateLimit';
import { reportApiError } from '../../../src/lib/apiErrorHandler';

let _supabase = null;
function getSupabase() {
    if (!_supabase) {
        const url = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://kuklfnapbkmacvwxktbh.supabase.co';
        const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
        _supabase = createClient(url, key);
    }
    return _supabase;
}

function clampInt(value, fallback, min, max) {
    const n = parseInt(value, 10);
    return Number.isNaN(n) ? fallback : Math.min(Math.max(n, min), max);
}

function parseCoordinate(value, min, max) {
    if (Array.isArray(value)) value = value[0];
    if (value === '' || value == null) return null;
    const n = Number(value);
    return Number.isFinite(n) && n >= min && n <= max ? n : null;
}

function haversineMiles(lat1, lng1, lat2, lng2) {
    const toRad = (v) => (v * Math.PI) / 180;
    const dLat = toRad(lat2 - lat1);
    const dLng = toRad(lng2 - lng1);
    const a = Math.sin(dLat / 2) ** 2
        + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
    return 3958.8 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

const DAY_INDEX = {
    sunday: 0, sun: 0, monday: 1, mon: 1, tuesday: 2, tue: 2,
    wednesday: 3, wed: 3, thursday: 4, thu: 4, friday: 5, fri: 5,
    saturday: 6, sat: 6,
};

function nextOccurrence(row, now = new Date()) {
    const today = new Date(now);
    today.setUTCHours(12, 0, 0, 0);

    if (typeof row.specific_date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(row.specific_date)) {
        const dated = new Date(`${row.specific_date}T12:00:00Z`);
        if (!Number.isNaN(dated.getTime()) && dated >= today) return row.specific_date;
    }
    if (!row.is_recurring || !row.day_of_week) return null;

    const days = String(row.day_of_week)
        .split(/[,/|]/)
        .map((d) => DAY_INDEX[d.trim().toLowerCase()])
        .filter(Number.isInteger);
    if (!days.length) return null;

    let smallestDelta = 7;
    for (const day of days) {
        const delta = (day - today.getUTCDay() + 7) % 7;
        if (delta < smallestDelta) smallestDelta = delta;
    }
    const next = new Date(today);
    next.setUTCDate(today.getUTCDate() + smallestDelta);
    return next.toISOString().slice(0, 10);
}

function mapEvent(row, eventDate, distanceMiles = null) {
    return {
        id: `${row.source || 'event'}:${row.native_id || `${row.venue_id}:${row.event_name}`}`,
        name: row.event_name || 'Poker tournament',
        event_date: eventDate,
        start_time: row.start_time || null,
        location: [row.venue_name, [row.city, row.state].filter(Boolean).join(', ')]
            .filter(Boolean)
            .join(' · '),
        buy_in: row.buy_in || null,
        guarantee: row.guaranteed || null,
        game_type: row.game_type || null,
        is_recurring: row.is_recurring === true,
        distance_miles: distanceMiles == null ? null : Math.round(distanceMiles * 10) / 10,
    };
}

export default async function handler(req, res) {
    if (req.method !== 'GET') {
        res.setHeader('Allow', 'GET');
        return res.status(405).json({ success: false, error: 'Method not allowed' });
    }
    if (!applyRateLimit(req, res, LIMITS.read)) return;

    const limit = clampInt(req.query.limit, 5, 1, 25);
    const radiusMiles = clampInt(req.query.radius, 100, 10, 500);
    const lat = parseCoordinate(req.query.lat, -90, 90);
    const lng = parseCoordinate(req.query.lng, -180, 180);
    const requestedLocation = req.query.lat != null || req.query.lng != null;

    if (requestedLocation && (lat == null || lng == null)) {
        return res.status(400).json({ success: false, error: 'Valid latitude and longitude are required' });
    }

    try {
        let query = getSupabase()
            .from('unified_events_calendar')
            .select('source,native_id,venue_id,venue_name,event_name,start_time,buy_in,guaranteed,game_type,day_of_week,specific_date,is_recurring,city,state,latitude,longitude')
            .eq('is_active', true)
            .eq('is_suppressed', false);

        if (lat != null && lng != null) {
            const latDelta = radiusMiles / 69;
            const cosLat = Math.max(Math.cos((lat * Math.PI) / 180), 0.15);
            const lngDelta = radiusMiles / (69 * cosLat);
            query = query
                .not('latitude', 'is', null)
                .not('longitude', 'is', null)
                .gte('latitude', lat - latDelta)
                .lte('latitude', lat + latDelta)
                .gte('longitude', lng - lngDelta)
                .lte('longitude', lng + lngDelta);
        }

        const { data, error } = await query.limit(lat == null ? 300 : 750);
        if (error) throw error;

        const seen = new Set();
        const candidates = [];
        for (const row of data || []) {
            const eventDate = nextOccurrence(row);
            if (!eventDate) continue;
            let distance = null;
            if (lat != null && lng != null) {
                distance = haversineMiles(lat, lng, Number(row.latitude), Number(row.longitude));
                if (!Number.isFinite(distance) || distance > radiusMiles) continue;
            }
            const key = `${row.venue_id || row.venue_name}|${row.event_name}|${eventDate}|${row.start_time || ''}`;
            if (seen.has(key)) continue;
            seen.add(key);
            candidates.push({ row, eventDate, distance });
        }

        candidates.sort((a, b) => {
            if (a.distance != null && b.distance != null && a.distance !== b.distance) return a.distance - b.distance;
            return `${a.eventDate} ${a.row.start_time || ''}`.localeCompare(`${b.eventDate} ${b.row.start_time || ''}`);
        });

        const mapped = candidates.slice(0, limit).map(({ row, eventDate, distance }) => mapEvent(row, eventDate, distance));
        res.setHeader('Cache-Control', lat == null
            ? 's-maxage=300, stale-while-revalidate=600'
            : 'private, max-age=60');
        return res.status(200).json({
            success: true,
            data: mapped,
            mode: lat == null ? 'upcoming' : 'nearby',
            radius_miles: lat == null ? null : radiusMiles,
            location_stored: false,
        });
    } catch (error) {
        try { reportApiError(error, req); } catch (_e) { /* noop */ }
        console.warn('[News events] unavailable:', error?.message || error);
        return res.status(503).json({ success: false, error: 'Tournament feed unavailable' });
    }
}
