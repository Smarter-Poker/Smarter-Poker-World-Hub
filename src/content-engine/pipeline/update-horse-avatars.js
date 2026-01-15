/**
 * 🖼️ HORSE AVATAR UPDATER
 * Uses DiceBear API for instant unique avatar generation
 * More cost-effective than DALL-E for 100+ avatars
 */
import { config } from 'dotenv';
config({ path: '.env.local' });

import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

// DiceBear avatar styles that look professional
const AVATAR_STYLES = [
    'avataaars',      // Cartoon-style avatars
    'lorelei',        // Minimalist faces
    'personas',       // Professional style
    'notionists',     // Modern sketchy style
];

function generateDiceBearUrl(name, style) {
    // DiceBear generates consistent avatars based on seed (name)
    const seed = encodeURIComponent(name);
    return `https://api.dicebear.com/7.x/${style}/png?seed=${seed}&size=256&backgroundColor=b6e3f4,c0aede,d1d4f9,ffd5dc,ffdfbf`;
}

async function updateProfileAvatar(profileId, avatarUrl) {
    const { error } = await supabase
        .from('profiles')
        .update({ avatar_url: avatarUrl })
        .eq('id', profileId);

    return !error;
}

async function main() {
    console.log('\n🖼️ HORSE AVATAR UPDATER (DiceBear)');
    console.log('═'.repeat(50));

    // Get all horses
    const { data: horses } = await supabase
        .from('content_authors')
        .select('id, name, profile_id')
        .eq('is_active', true);

    if (!horses?.length) {
        console.log('No horses found');
        return;
    }

    console.log(`Found ${horses.length} horses to update\n`);

    let success = 0;
    let failed = 0;

    for (let i = 0; i < horses.length; i++) {
        const horse = horses[i];

        // Rotate through avatar styles
        const style = AVATAR_STYLES[i % AVATAR_STYLES.length];
        const avatarUrl = generateDiceBearUrl(horse.name, style);

        try {
            const updated = await updateProfileAvatar(horse.profile_id, avatarUrl);
            if (updated) {
                console.log(`✅ ${horse.name}: ${avatarUrl.substring(0, 60)}...`);
                success++;
            } else {
                console.log(`❌ ${horse.name}: Profile update failed`);
                failed++;
            }
        } catch (error) {
            console.error(`❌ ${horse.name}: ${error.message}`);
            failed++;
        }
    }

    console.log('\n' + '═'.repeat(50));
    console.log(`COMPLETE: ${success} success, ${failed} failed`);
}

main().catch(console.error);
