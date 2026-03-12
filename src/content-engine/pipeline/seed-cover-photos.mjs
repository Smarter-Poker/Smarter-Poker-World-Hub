/**
 * Phase 23: Seed Horse Cover Photos (Deterministic, No AI)
 * Assigns high-quality Unsplash poker/casino/lifestyle banner images to all 308 horses.
 * Run: node src/content-engine/pipeline/seed-cover-photos.mjs
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';

// Load .env.local
dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
    console.error('❌ Missing Supabase credentials in .env.local');
    process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

// High-quality Unsplash image URLs curated for poker player vibes
const COVER_POOLS = {
    // Vegas / Casinos / High Stakes
    vegas: [
        'https://images.unsplash.com/photo-1596702330722-19e481b7e289?auto=format&fit=crop&q=80&w=1600&h=600', // Casino chips
        'https://images.unsplash.com/photo-1511516053351-4e782ea751d9?auto=format&fit=crop&q=80&w=1600&h=600', // Vegas sign
        'https://images.unsplash.com/photo-1605810230434-7631ac76ec81?auto=format&fit=crop&q=80&w=1600&h=600', // Cards falling
        'https://images.unsplash.com/photo-1593351415075-3bac9f45c877?auto=format&fit=crop&q=80&w=1600&h=600', // Slot machines
    ],
    // Luxury / Miami / LA / Yachts
    luxury: [
        'https://images.unsplash.com/photo-1544551763-46a013bb70d5?auto=format&fit=crop&q=80&w=1600&h=600', // Yacht
        'https://images.unsplash.com/photo-1522708323590-d24dbb6b0267?auto=format&fit=crop&q=80&w=1600&h=600', // Modern apartment
        'https://images.unsplash.com/photo-1536640712-4d4c36ef0e81?auto=format&fit=crop&q=80&w=1600&h=600', // Miami beach
        'https://images.unsplash.com/photo-1515516089376-88db1e26e950?auto=format&fit=crop&q=80&w=1600&h=600', // Luxury car
    ],
    // Texas / Grinder / Underground
    grinder: [
        'https://images.unsplash.com/photo-1518546305927-5a555bb7020d?auto=format&fit=crop&q=80&w=1600&h=600', // Dark neon
        'https://images.unsplash.com/photo-1533038590840-1cde6e2247aa?auto=format&fit=crop&q=80&w=1600&h=600', // Texas landscape
        'https://images.unsplash.com/photo-1582234033100-84519eb38eff?auto=format&fit=crop&q=80&w=1600&h=600', // Coffee shop coding/grinding
        'https://images.unsplash.com/photo-1453728013993-6d66e9c9123a?auto=format&fit=crop&q=80&w=1600&h=600', // Night street
    ],
    // General Poker / Cards
    general: [
        'https://images.unsplash.com/photo-1541580621-0bfdb55bb5bb?auto=format&fit=crop&q=80&w=1600&h=600', // Playing cards close up
        'https://images.unsplash.com/photo-1606167668580-2d8803d9d3ac?auto=format&fit=crop&q=80&w=1600&h=600', // Poker table felt
        'https://images.unsplash.com/photo-1570534204561-ebae6305aab7?auto=format&fit=crop&q=80&w=1600&h=600', // Chips stack
        'https://images.unsplash.com/photo-1521127474489-d524412fd439?auto=format&fit=crop&q=80&w=1600&h=600', // Abstract neon lights
    ]
};

// Deterministic string hash to pick consistent image
function hashString(str) {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
        hash = (hash << 5) - hash + str.charCodeAt(i);
        hash |= 0;
    }
    return Math.abs(hash);
}

async function seedCoverPhotos() {
    console.log('🖼️ Seeding Cover Photos for 308 Horses...\n');

    // 1. Fetch all horses
    const { data: horses, error: fetchError } = await supabase
        .from('content_authors')
        .select('profile_id, name, timezone')
        .eq('is_active', true)
        .not('profile_id', 'is', null);

    if (fetchError || !horses) {
        console.error('❌ Failed to fetch horses:', fetchError);
        return;
    }

    let updated = 0;

    // 2. Assign deterministic deterministic image based on location/timezone/hash
    for (const horse of horses) {
        let pool = 'general';
        const tz = horse.timezone || '';
        
        if (tz.includes('Los_Angeles') || tz.includes('Chicago')) pool = 'vegas'; // Vegas/LA poker vibes
        else if (tz.includes('New_York') || tz.includes('Miami')) pool = 'luxury'; // East coast luxury
        else if (tz.includes('Denver') || tz.includes('Phoenix')) pool = 'grinder'; // Grinder vibes
        
        const hash = hashString(horse.profile_id);
        const imageList = COVER_POOLS[pool];
        const cover_photo_url = imageList[hash % imageList.length];

        const { error } = await supabase
            .from('profiles')
            .update({ cover_photo_url })
            .eq('id', horse.profile_id);

        if (error) {
            console.error(`❌ Failed to update cover photo for ${horse.name}:`, error.message);
        } else {
            updated++;
            // process.stdout.write(`\r✅ Updated ${updated}/${horses.length} cover photos`);
        }
    }

    console.log(`\n\n🎉 Successfully updated ${updated}/${horses.length} horse cover photos.`);
}

seedCoverPhotos();
