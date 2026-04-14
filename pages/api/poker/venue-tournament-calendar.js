/**
 * /api/poker/venue-tournament-calendar
 *
 * Returns the full tournament calendar for a specific venue:
 *   - Recurring weekly schedule (day_of_week patterns)
 *   - Specific dated events (event_date set)
 *   - Grouped by day for easy UI rendering
 *
 * GET ?venue_id=1234           — all tournaments for venue
 * GET ?venue_id=1234&days=60  — dated events up to 60 days out (default: all)
 */
import { createClient } from '../../../src/lib/supabaseServerClient';

let _sb = null;
function getSupabase() {
    if (!_sb) {
        _sb = createClient(
            process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://kuklfnapbkmacvwxktbh.supabase.co',
            process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
        );
    }
    return _sb;
}

const CORS = {
    'Access-Control-Allow-Origin':  '*',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
};

const DAYS_ORDER = ['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday','Daily'];

function parseTime(t) {
    if (!t) return 0;
    const m = t.match(/(\d{1,2}):?(\d{2})?\s*(AM|PM)?/i);
    if (!m) return 0;
    let h = parseInt(m[1]);
    const min = parseInt(m[2] || '0');
    const p = (m[3] || '').toUpperCase();
    if (p === 'PM' && h !== 12) h += 12;
    if (p === 'AM' && h === 12) h = 0;
    return h * 60 + min;
}

function formatMoney(n) {
    if (!n) return null;
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n);
}

export default async function handler(req, res) {
    Object.entries(CORS).forEach(([k, v]) => res.setHeader(k, v));
    if (req.method === 'OPTIONS') return res.status(200).end();
    if (req.method !== 'GET') return res.status(405).json({ success: false, error: 'Method not allowed' });

    // Cache: fresh 5 min, stale 30 min (tournament schedules don't change hourly)
    res.setHeader('Cache-Control', 'public, s-maxage=300, stale-while-revalidate=1800');

    const { venue_id, days } = req.query;
    if (!venue_id) return res.status(400).json({ success: false, error: 'Missing venue_id' });

    const venueId = parseInt(venue_id, 10);
    if (isNaN(venueId) || venueId < 1) return res.status(400).json({ success: false, error: 'Invalid venue_id' });

    try {
        const sb = getSupabase();

        // ── 1. Fetch venue info ─────────────────────────────────────────────
        const { data: venue } = await sb
            .from('poker_venues')
            .select('id,name,state,city,has_tournaments,schedule_scrape_url,schedule_last_scraped_at')
            .eq('id', venueId)
            .maybeSingle();

        if (!venue) return res.status(404).json({ success: false, error: 'Venue not found' });

        // ── 2. Fetch all tournament records for this venue ──────────────────
        const { data: rows, error } = await sb
            .from('venue_daily_tournaments')
            .select(`
                id, venue_id, venue_name,
                day_of_week, event_date, start_time,
                tournament_name, buy_in, game_type, format,
                guaranteed, starting_stack, blind_levels, level_duration_minutes,
                rebuy_addon, late_registration, structure_sheet_url, parent_tournament_id, source_url,
                last_scraped, is_active, data_quality
            `)
            .eq('venue_id', venueId)
            .eq('is_active', true)
            .eq('data_quality', 'scraped_verified')
            .order('buy_in', { ascending: true })
            .limit(500);

        if (error) {
            console.error('[venue-tournament-calendar] DB error:', error);
            return res.status(500).json({ success: false, error: error.message });
        }

        const allRows = rows || [];

        // ── 3. Split recurring vs dated ──────────────────────────────────────
        const recurring = allRows.filter(r => !r.event_date);
        const dated     = allRows.filter(r =>  r.event_date);

        // ── 4. Group recurring by day of week ────────────────────────────────
        const byDay = {};
        DAYS_ORDER.forEach(d => { byDay[d] = []; });
        recurring.forEach(r => {
            const day = r.day_of_week || 'Daily';
            if (!byDay[day]) byDay[day] = [];
            byDay[day].push(enrichRecord(r));
        });
        // Sort each day by start time
        DAYS_ORDER.forEach(d => {
            byDay[d].sort((a, b) => parseTime(a.start_time) - parseTime(b.start_time));
        });

        // ── 5. Group dated events by date ────────────────────────────────────
        const byDate = {};
        dated
            .sort((a, b) => (a.event_date > b.event_date ? 1 : -1))
            .forEach(r => {
                const d = r.event_date;
                if (!byDate[d]) byDate[d] = [];
                byDate[d].push(enrichRecord(r));
            });

        // ── 6. Build 30-day calendar from recurring pattern ──────────────────
        // Generate next 30+ days of instances from recurring records
        const generatedDated = generateDatedInstances(recurring);

        // ── 7. Merge: real dated events override generated ones ───────────────
        const mergedByDate = { ...generatedDated };
        Object.entries(byDate).forEach(([date, events]) => {
            mergedByDate[date] = events; // Real scraped dated events win
        });

        // Sort merged calendar dates
        const sortedDates = Object.keys(mergedByDate).sort();

        // ── 8. Stats ──────────────────────────────────────────────────────────
        const activeDays     = DAYS_ORDER.filter(d => byDay[d].length > 0);
        const uniqueBuyins   = [...new Set(allRows.map(r => r.buy_in).filter(Boolean))].sort((a,b)=>a-b);
        const maxGtd         = Math.max(0, ...allRows.map(r => r.guaranteed || 0));
        const hasData        = allRows.length > 0;

        return res.status(200).json({
            success: true,
            venue: {
                id:                   venue.id,
                name:                 venue.name,
                state:                venue.state,
                city:                 venue.city,
                has_tournaments:      venue.has_tournaments,
                schedule_last_updated: venue.schedule_last_scraped_at,
                schedule_source_url:  venue.schedule_scrape_url,
            },
            has_data: hasData,
            stats: {
                total_records:     allRows.length,
                recurring_entries: recurring.length,
                dated_events:      dated.length,
                active_days:       activeDays.length,
                buy_in_range: uniqueBuyins.length > 0
                    ? { min: uniqueBuyins[0], max: uniqueBuyins[uniqueBuyins.length - 1] }
                    : null,
                max_guaranteed:    maxGtd > 0 ? maxGtd : null,
                max_guaranteed_fmt: maxGtd > 0 ? formatMoney(maxGtd) : null,
            },
            // Weekly recurring schedule (for "every week" display)
            weekly_schedule: byDay,
            active_days: activeDays,
            // Full dated calendar (recurring expanded + real dated events)
            calendar: sortedDates.reduce((obj, date) => {
                obj[date] = mergedByDate[date];
                return obj;
            }, {}),
            calendar_dates: sortedDates,
            // Raw dated events scraped directly
            dated_events: dated.map(enrichRecord),
        });

    } catch (err) {
        console.error('[venue-tournament-calendar] Unhandled error:', err);
        return res.status(500).json({ success: false, error: 'Internal server error' });
    }
}

// Enrich record with display helpers
function enrichRecord(r) {
    return {
        ...r,
        buy_in_fmt:        r.buy_in ? `$${r.buy_in.toLocaleString()}` : null,
        guaranteed_fmt:    r.guaranteed ? `$${r.guaranteed.toLocaleString()} GTD` : null,
        starting_stack_fmt: r.starting_stack ? r.starting_stack.toLocaleString() + ' chips' : null,
        display_name:      r.tournament_name || buildDisplayName(r),
    };
}

function buildDisplayName(r) {
    const parts = [];
    if (r.buy_in)     parts.push(`$${r.buy_in.toLocaleString()}`);
    if (r.game_type && r.game_type !== 'NLH') parts.push(r.game_type);
    else parts.push('NLH');
    if (r.format)     parts.push(r.format);
    if (r.guaranteed) parts.push(`$${r.guaranteed.toLocaleString()} GTD`);
    return parts.join(' ');
}

// Generate next N days of dated instances from recurring weekly patterns
function generateDatedInstances(recurring, daysAhead = 90) {
    const today   = new Date();
    today.setHours(0, 0, 0, 0);
    const dayName = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
    const result  = {};

    for (let offset = 0; offset <= daysAhead; offset++) {
        const d = new Date(today);
        d.setDate(today.getDate() + offset);
        const dow = dayName[d.getDay()];
        const key = d.toISOString().split('T')[0];

        // Find all recurring events for this day of week (or "Daily")
        const matchingEvents = recurring.filter(r =>
            r.day_of_week === dow || r.day_of_week === 'Daily'
        );

        if (matchingEvents.length > 0) {
            const seenKeys = new Set();
            const dedupedEvents = [];
            
            // Sort so specific-day events get priority over 'Daily' if there is a clash
            matchingEvents.sort((a, b) => {
                if (a.day_of_week !== 'Daily' && b.day_of_week === 'Daily') return -1;
                if (a.day_of_week === 'Daily' && b.day_of_week !== 'Daily') return 1;
                return 0;
            });
            
            for (const r of matchingEvents) {
                let normGame = (r.game_type || r.tournament_name || 'nlh').toLowerCase().trim();
                if (normGame.includes('nlh') || normGame.includes('no limit') || normGame.includes('holdem') || normGame.includes("hold'em")) {
                    normGame = 'nlh';
                } else if (normGame.includes('plo') || normGame.includes('omaha')) {
                    normGame = 'omaha';
                } else if (normGame.includes('mixed') || normGame.includes('horse')) {
                    normGame = 'mixed';
                }
                const evtKey = [
                    (r.start_time || '').toLowerCase().trim(),
                    normGame,
                    (r.buy_in || 0).toString()
                ].join('|');
                
                if (!seenKeys.has(evtKey)) {
                    seenKeys.add(evtKey);
                    dedupedEvents.push(r);
                }
            }

            result[key] = dedupedEvents
                .sort((a, b) => parseTime(a.start_time) - parseTime(b.start_time))
                .map(r => ({ ...enrichRecord(r), event_date: key, schedule_type: 'recurring' }));
        }
    }

    return result;
}
