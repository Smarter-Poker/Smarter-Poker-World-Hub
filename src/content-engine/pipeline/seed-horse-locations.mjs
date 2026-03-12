/**
 * Phase 21: Seed Horse Locations (Fixed: uses city + state columns)
 * Run: node src/content-engine/pipeline/seed-horse-locations.mjs
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

const POKER_CITIES = [
    { city: 'Las Vegas', state: 'NV', weight: 20, tz: 'America/Los_Angeles' },
    { city: 'Los Angeles', state: 'CA', weight: 12, tz: 'America/Los_Angeles' },
    { city: 'Miami', state: 'FL', weight: 8, tz: 'America/New_York' },
    { city: 'New York', state: 'NY', weight: 7, tz: 'America/New_York' },
    { city: 'Atlantic City', state: 'NJ', weight: 5, tz: 'America/New_York' },
    { city: 'Houston', state: 'TX', weight: 5, tz: 'America/Chicago' },
    { city: 'Chicago', state: 'IL', weight: 4, tz: 'America/Chicago' },
    { city: 'San Francisco', state: 'CA', weight: 3, tz: 'America/Los_Angeles' },
    { city: 'Phoenix', state: 'AZ', weight: 3, tz: 'America/Phoenix' },
    { city: 'Tampa', state: 'FL', weight: 3, tz: 'America/New_York' },
    { city: 'Dallas', state: 'TX', weight: 3, tz: 'America/Chicago' },
    { city: 'Denver', state: 'CO', weight: 2, tz: 'America/Denver' },
    { city: 'Seattle', state: 'WA', weight: 2, tz: 'America/Los_Angeles' },
    { city: 'Portland', state: 'OR', weight: 2, tz: 'America/Los_Angeles' },
    { city: 'Boston', state: 'MA', weight: 2, tz: 'America/New_York' },
    { city: 'Detroit', state: 'MI', weight: 2, tz: 'America/New_York' },
    { city: 'San Diego', state: 'CA', weight: 2, tz: 'America/Los_Angeles' },
    { city: 'New Orleans', state: 'LA', weight: 2, tz: 'America/Chicago' },
    { city: 'Reno', state: 'NV', weight: 2, tz: 'America/Los_Angeles' },
    { city: 'Minneapolis', state: 'MN', weight: 1, tz: 'America/Chicago' },
    { city: 'Charlotte', state: 'NC', weight: 1, tz: 'America/New_York' },
    { city: 'Nashville', state: 'TN', weight: 1, tz: 'America/Chicago' },
    { city: 'Pittsburgh', state: 'PA', weight: 1, tz: 'America/New_York' },
    { city: 'Austin', state: 'TX', weight: 1, tz: 'America/Chicago' },
    { city: 'Salt Lake City', state: 'UT', weight: 1, tz: 'America/Denver' },
];

const CITY_POOL = [];
for (const c of POKER_CITIES) for (let i = 0; i < c.weight; i++) CITY_POOL.push(c);

function getHorseCity(profileId) {
    if (!profileId) return POKER_CITIES[0];
    let hash = 0;
    for (let i = 0; i < profileId.length; i++) {
        hash = ((hash << 5) - hash) + profileId.charCodeAt(i);
        hash = hash & hash;
    }
    return CITY_POOL[Math.abs(hash) % CITY_POOL.length];
}

async function seedLocations() {
    console.log('Seeding horse locations...\n');

    const { data: horses } = await supabase
        .from('content_authors')
        .select('id, name, profile_id')
        .eq('is_active', true)
        .not('profile_id', 'is', null);

    if (!horses?.length) { console.log('No horses found'); return; }

    let updated = 0;
    const cityCounts = {};

    for (const horse of horses) {
        const loc = getHorseCity(horse.profile_id);
        const label = `${loc.city}, ${loc.state}`;
        cityCounts[label] = (cityCounts[label] || 0) + 1;

        const [profileResult, authorResult] = await Promise.all([
            supabase.from('profiles').update({ city: loc.city, state: loc.state, country: 'US' }).eq('id', horse.profile_id),
            supabase.from('content_authors').update({ timezone: loc.tz }).eq('id', horse.id)
        ]);

        if (!profileResult.error && !authorResult.error) updated++;
        else if (profileResult.error) console.log(`  ERR ${horse.name}: ${profileResult.error.message}`);
    }

    console.log(`\nUpdated ${updated}/${horses.length} horse locations + timezones\n`);
    console.log('City distribution:');
    Object.entries(cityCounts).sort((a, b) => b[1] - a[1]).forEach(([city, count]) => {
        console.log(`  ${city}: ${count}`);
    });
}

seedLocations().then(() => process.exit(0));
