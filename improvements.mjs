/**
 * IMPROVEMENTS SCRIPT
 * 1. Lock display_name_preference to 'full_name' for all 208 horses
 * 2. Seed friendship network (3-5 friends per horse based on location/specialty)
 */
import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';
import { fileURLToPath } from 'url';
import path from 'path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '.env.local') });

const supabase = createClient(
    'https://kuklfnapbkmacvwxktbh.supabase.co',
    process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function lockDisplayPreference() {
    console.log('1. LOCKING display_name_preference TO full_name\n');

    // Get all horse profile_ids
    const { data: horses } = await supabase.from('content_authors')
        .select('profile_id').gte('id', 201).not('profile_id', 'is', null);

    const profileIds = horses.map(h => h.profile_id);

    // Batch update in groups of 50
    let updated = 0;
    for (let i = 0; i < profileIds.length; i += 50) {
        const batch = profileIds.slice(i, i + 50);
        const { error } = await supabase.from('profiles')
            .update({ display_name_preference: 'full_name' })
            .in('id', batch);
        if (error) console.error(`  Batch error: ${error.message}`);
        else updated += batch.length;
    }
    console.log(`  Updated ${updated} profiles\n`);
}

async function seedFriendships() {
    console.log('2. SEEDING FRIENDSHIP NETWORK\n');

    // Get all horses with profile_id and location
    const { data: horses } = await supabase.from('content_authors')
        .select('id, profile_id, location, specialty')
        .gte('id', 201)
        .not('profile_id', 'is', null)
        .order('id');

    // Group by location
    const byLocation = {};
    horses.forEach(h => {
        const loc = h.location || 'unknown';
        if (!byLocation[loc]) byLocation[loc] = [];
        byLocation[loc].push(h);
    });

    // Group by specialty
    const bySpecialty = {};
    horses.forEach(h => {
        const spec = h.specialty || 'cash_game';
        if (!bySpecialty[spec]) bySpecialty[spec] = [];
        bySpecialty[spec].push(h);
    });

    let friendships = 0;
    let duplicates = 0;
    const seenPairs = new Set();

    // For each horse, add 3-5 friends from same location or specialty
    for (const horse of horses) {
        const loc = horse.location || 'unknown';
        const spec = horse.specialty || 'cash_game';

        // Get potential friends (same location first, then specialty)
        let candidates = [
            ...(byLocation[loc]?.filter(h => h.id !== horse.id) || []),
            ...(bySpecialty[spec]?.filter(h => h.id !== horse.id) || [])
        ];

        // Deduplicate
        const seen = new Set();
        candidates = candidates.filter(c => {
            if (seen.has(c.id)) return false;
            seen.add(c.id);
            return true;
        });

        // Pick 3-5 random friends
        const numFriends = 3 + Math.floor(Math.random() * 3);
        const shuffled = candidates.sort(() => Math.random() - 0.5).slice(0, numFriends);

        for (const friend of shuffled) {
            // Avoid duplicate pairs
            const pairKey = [horse.profile_id, friend.profile_id].sort().join('|');
            if (seenPairs.has(pairKey)) { duplicates++; continue; }
            seenPairs.add(pairKey);

            // Insert friendship (bidirectional = accepted)
            const { error } = await supabase.from('friends')
                .upsert({
                    user_id: horse.profile_id,
                    friend_id: friend.profile_id,
                    status: 'accepted'
                }, { onConflict: 'user_id,friend_id' });

            if (!error) friendships++;
        }
    }

    console.log(`  Created ${friendships} friendships (${duplicates} duplicates skipped)\n`);
}

async function main() {
    console.log('HORSE IMPROVEMENTS SCRIPT');
    console.log('='.repeat(60) + '\n');

    await lockDisplayPreference();
    await seedFriendships();

    console.log('='.repeat(60));
    console.log('DONE');
}

main().catch(console.error);
