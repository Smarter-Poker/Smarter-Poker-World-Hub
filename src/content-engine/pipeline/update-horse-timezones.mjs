/**
 * Phase 19: Update Horse Timezones Based on Location
 * Sets timezone for each horse based on their profile location
 * Run: node src/content-engine/pipeline/update-horse-timezones.mjs
 */

import { createClient } from '@supabase/supabase-js';
import { config } from 'dotenv';
import { fileURLToPath } from 'url';
import path from 'path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
config({ path: path.resolve(__dirname, '../../../.env.local') });

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
);

// Map common poker locations to timezones
const LOCATION_TO_TIMEZONE = {
    // US West
    'las vegas': 'America/Los_Angeles',
    'vegas': 'America/Los_Angeles',
    'los angeles': 'America/Los_Angeles',
    'la': 'America/Los_Angeles',
    'san francisco': 'America/Los_Angeles',
    'seattle': 'America/Los_Angeles',
    'portland': 'America/Los_Angeles',
    'san diego': 'America/Los_Angeles',
    'phoenix': 'America/Phoenix',
    'reno': 'America/Los_Angeles',
    'commerce': 'America/Los_Angeles',
    'hollywood': 'America/Los_Angeles',
    // US Central
    'chicago': 'America/Chicago',
    'houston': 'America/Chicago',
    'dallas': 'America/Chicago',
    'new orleans': 'America/Chicago',
    'minneapolis': 'America/Chicago',
    'austin': 'America/Chicago',
    'biloxi': 'America/Chicago',
    'tulsa': 'America/Chicago',
    // US Mountain
    'denver': 'America/Denver',
    'salt lake': 'America/Denver',
    'albuquerque': 'America/Denver',
    // US East
    'new york': 'America/New_York',
    'nyc': 'America/New_York',
    'miami': 'America/New_York',
    'atlantic city': 'America/New_York',
    'boston': 'America/New_York',
    'philadelphia': 'America/New_York',
    'tampa': 'America/New_York',
    'ft. lauderdale': 'America/New_York',
    'foxwoods': 'America/New_York',
    'mohegan sun': 'America/New_York',
    'bethlehem': 'America/New_York',
    'charlotte': 'America/New_York',
    'detroit': 'America/New_York',
    'pittsburgh': 'America/New_York',
    // International - Europe
    'london': 'Europe/London',
    'uk': 'Europe/London',
    'paris': 'Europe/Paris',
    'berlin': 'Europe/Berlin',
    'barcelona': 'Europe/Madrid',
    'madrid': 'Europe/Madrid',
    'monte carlo': 'Europe/Paris',
    'monaco': 'Europe/Paris',
    'vienna': 'Europe/Vienna',
    'prague': 'Europe/Prague',
    'rozvadov': 'Europe/Prague',
    'dublin': 'Europe/Dublin',
    // International - Other
    'macau': 'Asia/Macau',
    'manila': 'Asia/Manila',
    'melbourne': 'Australia/Melbourne',
    'sydney': 'Australia/Sydney',
    'toronto': 'America/Toronto',
    'vancouver': 'America/Vancouver',
    'calgary': 'America/Edmonton',
    'montreal': 'America/Toronto',
    'sao paulo': 'America/Sao_Paulo',
    'brazil': 'America/Sao_Paulo',
    'buenos aires': 'America/Argentina/Buenos_Aires',
    'tel aviv': 'Asia/Jerusalem',
    'mumbai': 'Asia/Kolkata',
    'tokyo': 'Asia/Tokyo',
    'seoul': 'Asia/Seoul',
    'bangkok': 'Asia/Bangkok',
};

function detectTimezone(locationStr) {
    if (!locationStr) return 'America/New_York';
    const loc = locationStr.toLowerCase().trim();
    for (const [key, tz] of Object.entries(LOCATION_TO_TIMEZONE)) {
        if (loc.includes(key)) return tz;
    }
    return 'America/New_York'; // Default
}

async function updateTimezones() {
    console.log('Setting horse timezones based on location...');

    // Get all horses with their profile data
    const { data: horses } = await supabase
        .from('content_authors')
        .select('id, name, profile_id')
        .eq('is_active', true)
        .not('profile_id', 'is', null);

    if (!horses?.length) { console.log('No horses found'); return; }

    // Get profile locations
    const profileIds = horses.map(h => h.profile_id);
    // 2026-08-15 CHECK 13 fix: profiles has no `location` column (real:
    // city/state/country) — the select 42703'd and every horse got the
    // default timezone.
    const { data: profiles } = await supabase
        .from('profiles')
        .select('id, city, state, country')
        .in('id', profileIds);

    const profileMap = {};
    (profiles || []).forEach(p => { profileMap[p.id] = { ...p, location: [p.city, p.state, p.country].filter(Boolean).join(', ') || null }; });

    let updated = 0;
    const tzCounts = {};

    for (const horse of horses) {
        const profile = profileMap[horse.profile_id];
        const tz = detectTimezone(profile?.location);
        tzCounts[tz] = (tzCounts[tz] || 0) + 1;

        const { error } = await supabase
            .from('content_authors')
            .update({ timezone: tz })
            .eq('id', horse.id);

        if (!error) updated++;
    }

    console.log(`Updated ${updated}/${horses.length} horse timezones`);
    console.log('Distribution:', tzCounts);
}

updateTimezones().then(() => process.exit(0));
