/**
 * 🐴 SEED PERSONAS TO DATABASE
 * Run this once to populate the content_authors table with the 100 personas
 */

import { createClient } from '@supabase/supabase-js';
import personas from './personas.json' assert { type: 'json' };

const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
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
