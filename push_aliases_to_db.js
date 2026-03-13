/**
 * Push updated persona aliases and bios directly to Supabase content_authors table
 */
import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const SUPABASE_URL = 'https://kuklfnapbkmacvwxktbh.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imt1a2xmbmFwYmttYWN2d3hrdGJoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njc3MzA4NDQsImV4cCI6MjA4MzMwNjg0NH0.ZGFrUYq7yAbkveFdudh4q_Xk0qN0AZ-jnu4FkX9YKjo';

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

// Read updated personas
const personas = JSON.parse(readFileSync(join(__dirname, 'src/content-engine/personas.json'), 'utf-8'));

async function updateAliasesInDB() {
    console.log('📋 Updating persona aliases in Supabase...\n');

    // First, load existing content_authors to match by name
    const { data: existing, error: fetchErr } = await supabase
        .from('content_authors')
        .select('id, alias, name, bio')
        .order('name');

    if (fetchErr) {
        console.error('❌ Failed to fetch content_authors:', fetchErr.message);
        return;
    }

    console.log(`📦 Found ${existing?.length || 0} existing authors in DB`);

    // Build a name-to-new-alias map
    const nameToNewData = {};
    for (const p of personas.personas) {
        nameToNewData[p.name] = { alias: p.alias, bio: p.bio };
    }

    let updated = 0;
    let errors = 0;

    for (const author of (existing || [])) {
        const newData = nameToNewData[author.name];
        if (newData && newData.alias !== author.alias) {
            // Clean the bio of AI/horse/smarter.poker references
            let cleanBio = newData.bio || author.bio || '';
            cleanBio = cleanBio
                .replace(/\bAI\b/gi, '')
                .replace(/\bhorse\b/gi, '')
                .replace(/\bsmarter\.poker\b/gi, '')
                .replace(/\bbot\b/gi, '')
                .replace(/AI grinder.*?persona[^.]*\./gi, '')
                .replace(/\s{2,}/g, ' ')
                .trim();

            const { error: updateErr } = await supabase
                .from('content_authors')
                .update({ alias: newData.alias, bio: cleanBio })
                .eq('id', author.id);

            if (updateErr) {
                console.error(`❌ Failed to update ${author.name}: ${updateErr.message}`);
                errors++;
            } else {
                updated++;
                if (updated <= 10) {
                    console.log(`  ✅ ${author.name}: "${author.alias}" → "${newData.alias}"`);
                }
            }
        }
    }

    if (updated > 10) {
        console.log(`  ... and ${updated - 10} more`);
    }

    // Also update profiles table if it has horse-prefixed IDs
    console.log('\n📋 Updating profiles table...');
    const { data: profiles, error: profErr } = await supabase
        .from('profiles')
        .select('id, username, bio, display_name')
        .or('id.like.horse-%,id.like.player-%');

    if (!profErr && profiles?.length > 0) {
        console.log(`📦 Found ${profiles.length} persona profiles`);
        let profUpdated = 0;

        for (const prof of profiles) {
            const newData = nameToNewData[prof.display_name];
            if (newData) {
                let cleanBio = newData.bio || '';
                cleanBio = cleanBio
                    .replace(/\bAI\b/gi, '')
                    .replace(/\bhorse\b/gi, '')
                    .replace(/\bsmarter\.poker\b/gi, '')
                    .replace(/\bbot\b/gi, '')
                    .replace(/AI grinder.*?persona[^.]*\./gi, '')
                    .replace(/\s{2,}/g, ' ')
                    .trim();

                const updates = {
                    username: newData.alias,
                    bio: cleanBio,
                    is_bot: false
                };

                const { error: uErr } = await supabase
                    .from('profiles')
                    .update(updates)
                    .eq('id', prof.id);

                if (!uErr) {
                    profUpdated++;
                    if (profUpdated <= 5) {
                        console.log(`  ✅ Profile ${prof.display_name}: "${prof.username}" → "${newData.alias}"`);
                    }
                }
            }
        }
        console.log(`✅ Updated ${profUpdated} profiles`);
    } else {
        console.log('  No persona profiles found (or error:', profErr?.message, ')');
    }

    console.log(`\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
    console.log(`🎉 Done! Updated ${updated} aliases, ${errors} errors`);
}

updateAliasesInDB().catch(console.error);
