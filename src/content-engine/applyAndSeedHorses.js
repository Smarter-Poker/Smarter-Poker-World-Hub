/**
 * 🐴 APPLY CONTENT SCHEMA + SEED PERSONAS
 * Creates the content_authors table and seeds all 100 horses
 */

import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load environment from hub-vanguard's .env.local
const envPath = join(__dirname, '../../.env.local');
const envContent = readFileSync(envPath, 'utf-8');
const env = {};
envContent.split('\n').forEach(line => {
    const match = line.match(/^([^#=]+)=(.*)$/);
    if (match) env[match[1].trim()] = match[2].trim();
});

const supabase = createClient(
    env.NEXT_PUBLIC_SUPABASE_URL,
    env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

// Load personas
const personas = JSON.parse(readFileSync(join(__dirname, 'personas.json'), 'utf-8'));

async function checkAndSeedPersonas() {
    console.log('🐴 Ghost Fleet Horses Seeding Script\n');
    console.log(`📦 Total personas in JSON: ${personas.personas.length}`);

    // First, check if table exists by trying to select
    const { data: existing, error: checkError } = await supabase
        .from('content_authors')
        .select('id, alias')
        .limit(200);

    if (checkError) {
        console.log('\n❌ Table content_authors does not exist!');
        console.log('Please run this SQL in Supabase Dashboard SQL Editor:\n');
        console.log('------- COPY BELOW -------');
        console.log(readFileSync(join(__dirname, '../../supabase/migrations/008_seeded_content.sql'), 'utf-8'));
        console.log('------- END SQL -------\n');
        console.log('After running the SQL, execute this script again.');
        return;
    }

    console.log(`✅ Table exists! Found ${existing?.length || 0} existing authors`);

    const existingAliases = new Set(existing?.map(a => a.alias) || []);
    const toInsert = personas.personas.filter(p => !existingAliases.has(p.alias));

    console.log(`📝 Need to insert: ${toInsert.length} new personas\n`);

    if (toInsert.length === 0) {
        console.log('🎉 All 100 horses already in the database!');
        return;
    }

    // Insert new personas in batches
    const batchSize = 25;
    let inserted = 0;

    for (let i = 0; i < toInsert.length; i += batchSize) {
        const batch = toInsert.slice(i, i + batchSize).map(p => ({
            name: p.name,
            gender: p.gender,
            location: p.location,
            timezone: p.timezone,
            birthday: p.birthday,
            alias: p.alias,
            specialty: p.specialty,
            stakes: p.stakes,
            bio: p.bio,
            voice: p.voice,
            avatar_seed: p.avatar_seed,
            is_active: true
        }));

        const { data, error } = await supabase
            .from('content_authors')
            .insert(batch)
            .select();

        if (error) {
            console.error(`❌ Batch ${Math.floor(i / batchSize) + 1} error:`, error.message);
        } else {
            inserted += data.length;
            console.log(`✅ Batch ${Math.floor(i / batchSize) + 1}: Inserted ${data.length} authors`);
        }
    }

    console.log(`\n🎉 Done! ${inserted} new personas seeded to database.`);
    console.log(`🐴 Total horses in stable: ${(existing?.length || 0) + inserted}`);
}

checkAndSeedPersonas();
