/**
 * 🐴 SEED PERSONAS TO DATABASE
 * Run this once to populate the content_authors table with the 100 personas
 */

import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const personas = JSON.parse(readFileSync(join(__dirname, 'personas.json'), 'utf-8'));

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

async function seedPersonas() {
    console.log('🐴 Seeding personas to database...\n');

    const authorsToInsert = personas.personas.map(p => ({
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

    // Insert in batches of 25
    const batchSize = 25;
    let inserted = 0;

    for (let i = 0; i < authorsToInsert.length; i += batchSize) {
        const batch = authorsToInsert.slice(i, i + batchSize);

        const { data, error } = await supabase
            .from('content_authors')
            .upsert(batch, { onConflict: 'alias' })
            .select();

        if (error) {
            console.error(`Batch ${i / batchSize + 1} error:`, error);
        } else {
            inserted += data.length;
            console.log(`✅ Batch ${i / batchSize + 1}: Inserted ${data.length} authors`);
        }
    }

    console.log(`\n🎉 Done! ${inserted} personas seeded to database.`);
}

// Run if called directly
seedPersonas();
