require('dotenv').config({ path: '.env.local' });
const fs = require('fs');
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

const venuesPath = '/Users/smarter.poker/Documents/Smarter-Poker-World-Hub/public/data/all-venues.json';
const auditPath = '/tmp/dedup_audit_log.json';

const venues = JSON.parse(fs.readFileSync(venuesPath, 'utf8'));
const audit = JSON.parse(fs.readFileSync(auditPath, 'utf8'));

const venuesById = {};
venues.forEach(v => venuesById[v.id] = v);

async function main() {
    const drops = new Set();
    const updates = new Set();

    for (const log of audit) {
        if (log.action === 'MERGE_AND_DROP' || log.action === 'NAME_UPDATED' || log.action === 'NULL_COORDS') {
            if (log.drop_id) drops.add(log.drop_id);
            if (log.keep_id) updates.add(log.keep_id);
        }
    }

    // Include the CCG fix from the previous session (ID 2960 dropped, ID 2802 updated)
    drops.add(2960);
    updates.add(2802);

    console.log(`Starting Supabase sync.\nDrops: ${Array.from(drops).join(', ')}\nUpdates: ${Array.from(updates).join(', ')}\n`);

    // Execute Deletes
    for (const id of drops) {
        process.stdout.write(`Dropping ID ${id}... `);
        const { error } = await supabase.from('poker_venues').delete().eq('id', id);
        if (error) {
            console.log(`ERROR: ${error.message}`);
        } else {
            console.log('OK');
        }
    }

    // Execute Updates
    for (const id of updates) {
        const v = venuesById[id];
        if (!v) {
            console.log(`Update ID ${id} not found in all-venues.json. Skipping...`);
            continue;
        }

        // We only update the fields that we touched during the dedup merge
        const updatePayload = {
            name: v.name,
            games_offered: v.games_offered,
            tournament_schedule: v.tournament_schedule,
            trust_score: v.trust_score,
            latitude: v.latitude,
            longitude: v.longitude,
            logo_url: v.logo_url,
            profile_photo_url: v.profile_photo_url,
            cover_photo_url: v.cover_photo_url,
            stakes_cash: v.stakes_cash,
            poker_tables: v.poker_tables,
            hours_weekday: v.hours_weekday,
            hours_weekend: v.hours_weekend,
            hours: v.hours,
            email: v.email,
            phone: v.phone,
            website: v.website,
            about: v.about,
            tagline: v.tagline,
            address: v.address,
            city: v.city
        };

        process.stdout.write(`Updating ID ${id} (${v.name})... `);
        const { error } = await supabase.from('poker_venues').update(updatePayload).eq('id', id);
        if (error) {
            console.log(`ERROR: ${error.message}`);
        } else {
            console.log('OK');
        }
    }

    console.log('\nSupabase master sync complete. The scraper cron job will now match our deduplicated state.');
}

main().catch(console.error);
