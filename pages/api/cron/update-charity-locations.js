/**
 * Cron: Update Charity Event Locations
 * 
 * Runs daily at midnight CST.
 * For each charity social page with a weekly run_schedule in metadata,
 * finds today's (or the next upcoming) location and updates
 * location_city + location_state on the social_pages record.
 *
 * Schedule in vercel.json or Vercel cron:  0 6 * * *   (06:00 UTC = 00:00 CST)
 * GET /api/cron/update-charity-locations?key=<CRON_SECRET>
 */
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
);

const DAYS_ORDER = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];

/**
 * Parse a "City, State" string into { city, state }.
 * Handles formats like "Chicago, IL" or "Rockford, Illinois" or just "Chicago".
 */
function parseLocation(loc) {
    if (!loc || !loc.trim()) return null;
    const parts = loc.split(',').map(s => s.trim());
    if (parts.length >= 2) {
        return { city: parts[0], state: parts[1] };
    }
    return { city: parts[0], state: '' };
}

/**
 * Given a run_schedule object and today's day index (0=Sun...6=Sat),
 * find the location to use:
 *   1. If today has a location  -> use it
 *   2. Otherwise, look ahead up to 7 days for the next open day with a location
 *   3. If nothing found, return null (no change)
 */
function resolveLocation(schedule, todayIdx) {
    if (!schedule || typeof schedule !== 'object') return null;

    // Check today first
    const todayKey = DAYS_ORDER[todayIdx];
    const todayEntry = schedule[todayKey];
    if (todayEntry?.open && todayEntry.location) {
        return parseLocation(todayEntry.location);
    }

    // Look ahead to find the next event
    for (let offset = 1; offset <= 7; offset++) {
        const idx = (todayIdx + offset) % 7;
        const key = DAYS_ORDER[idx];
        const entry = schedule[key];
        if (entry?.open && entry.location) {
            return parseLocation(entry.location);
        }
    }

    return null;
}

export default async function handler(req, res) {
    if (req.method !== 'GET') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    // Simple auth check for cron
    const cronSecret = process.env.CRON_SECRET;
    const providedKey = req.query.key || req.headers['x-cron-secret'];
    if (cronSecret && providedKey !== cronSecret) {
        return res.status(401).json({ error: 'Unauthorized' });
    }

    try {
        // Fetch all charity social pages that have metadata
        const { data: charityPages, error } = await supabase
            .from('social_pages')
            .select('id, name, metadata, location_city, location_state')
            .eq('page_type', 'charity')
            .eq('is_public', true);

        if (error) {
            console.error('Failed to fetch charity pages:', error);
            return res.status(500).json({ error: 'Database error' });
        }

        if (!charityPages || charityPages.length === 0) {
            return res.status(200).json({ success: true, message: 'No charity pages found', updated: 0 });
        }

        // Current day in CST (UTC-6)
        const now = new Date();
        const cstOffset = -6 * 60; // CST is UTC-6
        const utcMs = now.getTime() + now.getTimezoneOffset() * 60000;
        const cstDate = new Date(utcMs + cstOffset * 60000);
        const todayIdx = cstDate.getDay(); // 0=Sun...6=Sat

        let updatedCount = 0;
        const results = [];

        for (const page of charityPages) {
            const schedule = page.metadata?.run_schedule;
            if (!schedule) continue;

            const newLoc = resolveLocation(schedule, todayIdx);
            if (!newLoc) continue;

            // Skip if location is already correct
            if (page.location_city === newLoc.city && page.location_state === newLoc.state) {
                results.push({ id: page.id, name: page.name, status: 'unchanged' });
                continue;
            }

            // Update the social page's location
            const { error: updateError } = await supabase
                .from('social_pages')
                .update({
                    location_city: newLoc.city,
                    location_state: newLoc.state,
                    updated_at: new Date().toISOString()
                })
                .eq('id', page.id);

            if (updateError) {
                console.error(`Failed to update page ${page.id}:`, updateError);
                results.push({ id: page.id, name: page.name, status: 'error', error: updateError.message });
            } else {
                updatedCount++;

                // Geocode the new location and cache coordinates (non-fatal)
                try {
                    const locStr = `${newLoc.city}, ${newLoc.state}`;
                    const existingGeo = (page.metadata && page.metadata.geocoded_locations) || {};
                    if (!existingGeo[locStr]) {
                        const geoRes = await fetch(
                            `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(locStr)}&format=json&limit=1&countrycodes=us`,
                            { headers: { 'User-Agent': 'SmarterPoker/1.0 (https://smarter.poker)' } }
                        );
                        const geoData = await geoRes.json();
                        if (geoData && geoData.length > 0) {
                            existingGeo[locStr] = {
                                lat: parseFloat(geoData[0].lat),
                                lng: parseFloat(geoData[0].lon),
                            };
                            await supabase.from('social_pages').update({
                                metadata: { ...page.metadata, geocoded_locations: existingGeo },
                            }).eq('id', page.id);
                        }
                        // Rate limit: wait 1.1s between Nominatim calls
                        await new Promise(r => setTimeout(r, 1100));
                    }
                } catch (geoErr) {
                    console.warn(`[update-charity-locations] Geocoding non-fatal error for ${page.id}:`, geoErr.message);
                }

                results.push({
                    id: page.id,
                    name: page.name,
                    status: 'updated',
                    from: `${page.location_city || ''}, ${page.location_state || ''}`,
                    to: `${newLoc.city}, ${newLoc.state}`
                });
            }
        }

        console.log(`[update-charity-locations] Updated ${updatedCount}/${charityPages.length} charity pages`);

        return res.status(200).json({
            success: true,
            updated: updatedCount,
            total: charityPages.length,
            day: DAYS_ORDER[todayIdx],
            results
        });
    } catch (err) {
        console.error('Cron update-charity-locations error:', err);
        return res.status(500).json({ error: 'Internal server error' });
    }
}
