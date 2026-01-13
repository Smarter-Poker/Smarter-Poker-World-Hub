/**
 * 🐴 REGISTER HORSES AS OFFICIAL USERS
 * Creates bot_profiles table and inserts all 100 horses
 * 
 * Run: node src/content-engine/registerHorsesDirectSQL.mjs
 */

import { createClient } from '@supabase/supabase-js';

// Production credentials
const supabase = createClient(
    'https://kuklfnapbkmacvwxktbh.supabase.co',
    'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imt1a2xmbmFwYmttYWN2d3hrdGJoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njc3MzA4NDQsImV4cCI6MjA4MzMwNjg0NH0.ZGFrUYq7yAbkveFdudh4q_Xk0qN0AZ-jnu4FkX9YKjo'
);

async function registerHorses() {
    console.log('🐴 REGISTER HORSES AS OFFICIAL USERS\n');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

    // Step 1: Fetch horses from content_authors
    console.log('📋 Fetching horses from content_authors...');
    const { data: horses, error: fetchError } = await supabase
        .from('content_authors')
        .select('*')
        .order('id');

    if (fetchError) {
        console.error('❌ Error fetching horses:', fetchError.message);
        return;
    }

    console.log(`✅ Found ${horses.length} horses\n`);

    // Step 2: Create bot_profiles table if needed
    // We'll use RPC to run raw SQL for table creation
    console.log('🔧 Creating bot_profiles table...');

    const createTableSQL = `
        CREATE TABLE IF NOT EXISTS public.bot_profiles (
            id TEXT PRIMARY KEY,
            username TEXT UNIQUE NOT NULL,
            display_name TEXT NOT NULL,
            avatar_url TEXT,
            player_number INTEGER UNIQUE NOT NULL,
            bio TEXT,
            location TEXT,
            specialty TEXT,
            stakes TEXT,
            voice TEXT,
            is_active BOOLEAN DEFAULT TRUE,
            xp_total INTEGER DEFAULT 0,
            diamonds INTEGER DEFAULT 0,
            total_hands INTEGER DEFAULT 0,
            content_author_id INTEGER,
            created_at TIMESTAMPTZ DEFAULT NOW(),
            updated_at TIMESTAMPTZ DEFAULT NOW()
        );
        
        ALTER TABLE public.bot_profiles ENABLE ROW LEVEL SECURITY;
        
        DROP POLICY IF EXISTS "Public can read bot profiles" ON public.bot_profiles;
        CREATE POLICY "Public can read bot profiles" ON public.bot_profiles FOR SELECT USING (true);
    `;

    // Since we can't run raw SQL with anon key, let's insert directly
    console.log('📥 Inserting horses into bot_profiles...\n');

    // Prepare the data
    const profiles = horses.map((horse, index) => {
        const playerNumber = 101 + index;
        return {
            id: `horse-${String(playerNumber).padStart(3, '0')}`,
            username: horse.alias,
            display_name: horse.name,
            avatar_url: null,
            player_number: playerNumber,
            bio: horse.bio,
            location: horse.location,
            specialty: horse.specialty,
            stakes: horse.stakes,
            voice: horse.voice,
            is_active: true,
            xp_total: Math.floor(Math.random() * 5000) + 1000,
            diamonds: Math.floor(Math.random() * 500),
            total_hands: Math.floor(Math.random() * 50000) + 5000,
            content_author_id: horse.id
        };
    });

    // Insert in batches
    const batchSize = 25;
    let inserted = 0;

    for (let i = 0; i < profiles.length; i += batchSize) {
        const batch = profiles.slice(i, i + batchSize);
        const batchNum = Math.floor(i / batchSize) + 1;

        const { data, error } = await supabase
            .from('bot_profiles')
            .upsert(batch, { onConflict: 'id' })
            .select();

        if (error) {
            if (error.message.includes('does not exist')) {
                console.error('❌ Table bot_profiles does not exist!');
                console.log('\n📌 Please run this SQL in Supabase Dashboard first:\n');
                console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
                console.log(createTableSQL);
                console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
                return;
            }
            console.error(`❌ Batch ${batchNum} error:`, error.message);
        } else {
            inserted += data?.length || 0;
            const names = data?.slice(0, 3).map(p => p.display_name).join(', ');
            console.log(`✅ Batch ${batchNum}: ${data?.length || 0} horses → ${names}...`);
        }
    }

    console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log(`🎉 SUCCESS! ${inserted} horses registered.`);
    console.log(`   Player Numbers: #101 - #${100 + inserted}`);
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

    // Verify
    const { data: samples } = await supabase
        .from('bot_profiles')
        .select('player_number, display_name, username')
        .order('player_number')
        .limit(5);

    if (samples && samples.length > 0) {
        console.log('📊 Sample registered users:');
        samples.forEach(p => {
            console.log(`   #${p.player_number} - ${p.display_name} (@${p.username})`);
        });
    }
}

registerHorses().catch(console.error);
