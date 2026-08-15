/**
 * Phase 20: Generate Rich Bios for All Horses via Grok API
 * Creates unique 2-3 sentence bios based on each horse's name, specialty, and location.
 * No emojis. Authentic poker player voice.
 * Run: node src/content-engine/pipeline/generate-horse-bios.mjs
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

const XAI_API_KEY = process.env.XAI_API_KEY;

async function generateBio(horse) {
    if (!XAI_API_KEY) return null;

    const prompt = `Write a 2-3 sentence bio for a poker player named ${horse.name}. 
They specialize in ${horse.specialty || 'No Limit Hold\'em'} and are based in ${horse.location || 'Las Vegas'}.
RULES:
- Sound like a real person, not an AI
- NO emojis ever
- Include their playing style or a brief backstory
- Keep it under 40 words
- Use casual, authentic poker player voice
- Do NOT start with "I" or use first person
- Do NOT mention social media or online platforms`;

    try {
        const response = await fetch('https://api.x.ai/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${XAI_API_KEY}`
            },
            body: JSON.stringify({
                model: 'grok-2-latest',
                messages: [{ role: 'user', content: prompt }],
                temperature: 0.9,
                max_tokens: 80
            })
        });

        if (!response.ok) return null;

        const data = await response.json();
        let bio = data.choices[0].message.content.trim();

        // Strip emojis
        bio = bio.replace(/[\u{1F600}-\u{1F64F}\u{1F300}-\u{1F5FF}\u{1F680}-\u{1F6FF}\u{1F700}-\u{1F77F}\u{1F780}-\u{1F7FF}\u{1F800}-\u{1F8FF}\u{1F900}-\u{1F9FF}\u{1FA00}-\u{1FA6F}\u{1FA70}-\u{1FAFF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}\u{1F1E6}-\u{1F1FF}]/gu, '');

        // Remove quotes
        if (bio.startsWith('"') && bio.endsWith('"')) bio = bio.slice(1, -1);

        return bio;
    } catch (e) {
        console.error(`Error generating bio for ${horse.name}:`, e.message);
        return null;
    }
}

async function generateAllBios() {
    console.log('Generating rich bios for all horses via Grok API...\n');

    if (!XAI_API_KEY) {
        console.error('Missing XAI_API_KEY in .env.local');
        return;
    }

    // Get all horses with their profiles
    const { data: horses } = await supabase
        .from('content_authors')
        .select('id, name, specialty, profile_id')
        .eq('is_active', true)
        .not('profile_id', 'is', null);

    if (!horses?.length) { console.log('No horses found'); return; }

    // Get profile locations
    const profileIds = horses.map(h => h.profile_id);
    // 2026-08-15 CHECK 13 fix: profiles has no `location` column (real:
    // city/state/country) — the select 42703'd and every horse bio fell back
    // to the default location.
    const { data: profiles } = await supabase
        .from('profiles')
        .select('id, city, state, country, bio')
        .in('id', profileIds);

    const profileMap = {};
    (profiles || []).forEach(p => { profileMap[p.id] = { ...p, location: [p.city, p.state, p.country].filter(Boolean).join(', ') || null }; });

    // Only generate bios for horses that don't have one or have a very short one
    const needsBio = horses.filter(h => {
        const existingBio = profileMap[h.profile_id]?.bio;
        return !existingBio || existingBio.length < 20;
    });

    console.log(`${needsBio.length} horses need bio enrichment (out of ${horses.length} total)\n`);

    let generated = 0;
    const BATCH_SIZE = 5;

    for (let i = 0; i < needsBio.length; i += BATCH_SIZE) {
        const batch = needsBio.slice(i, i + BATCH_SIZE);
        
        const results = await Promise.all(batch.map(async (horse) => {
            const profile = profileMap[horse.profile_id];
            const bio = await generateBio({
                name: horse.name,
                specialty: horse.specialty,
                location: profile?.location
            });

            if (bio) {
                const { error } = await supabase
                    .from('profiles')
                    .update({ bio })
                    .eq('id', horse.profile_id);

                if (!error) {
                    console.log(`  ${horse.name}: "${bio}"`);
                    return true;
                }
            }
            return false;
        }));

        generated += results.filter(Boolean).length;

        // Rate limit: 2 second delay between batches
        if (i + BATCH_SIZE < needsBio.length) {
            await new Promise(r => setTimeout(r, 2000));
        }

        console.log(`  Progress: ${Math.min(i + BATCH_SIZE, needsBio.length)}/${needsBio.length}`);
    }

    console.log(`\nGenerated ${generated} bios successfully.`);
}

generateAllBios().then(() => process.exit(0));
