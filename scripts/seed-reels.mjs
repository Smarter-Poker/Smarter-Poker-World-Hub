// Run: node scripts/seed-reels.mjs
import { createClient } from '@supabase/supabase-js';
import { config } from 'dotenv';
config({ path: '.env.local' });

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

// Sample clips from ClipLibrary
const SAMPLE_CLIPS = [
    { id: 'hcl_dwan_1', title: 'Tom Dwan $900K POT', url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ', source: 'HCL' },
    { id: 'hcl_nik_1', title: 'Nik Airball CRAZY Bluff', url: 'https://www.youtube.com/watch?v=xvFZjo5PgG0', source: 'HCL' },
    { id: 'lodge_polk_1', title: 'Doug Polk vs Garrett', url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ', source: 'LODGE' },
    { id: 'triton_ivey_1', title: 'Phil Ivey SICK Read', url: 'https://www.youtube.com/watch?v=xvFZjo5PgG0', source: 'TRITON' },
    { id: 'wsop_hellmuth_1', title: 'Hellmuth TILTS', url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ', source: 'WSOP' },
    { id: 'rampage_1', title: 'Rampage SHIPS It!', url: 'https://www.youtube.com/watch?v=xvFZjo5PgG0', source: 'RAMPAGE' },
    { id: 'brad_owen_1', title: 'Brad Owen Session', url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ', source: 'BRAD_OWEN' },
    { id: 'neeme_1', title: 'Andrew Neeme Vlog', url: 'https://www.youtube.com/watch?v=xvFZjo5PgG0', source: 'ANDREW_NEEME' },
    { id: 'polk_strategy_1', title: 'Doug Polk Strategy', url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ', source: 'DOUG_POLK' },
    { id: 'pokergo_drama_1', title: 'PokerGO Table Drama', url: 'https://www.youtube.com/watch?v=xvFZjo5PgG0', source: 'POKERGO' },
];

async function main() {
    console.log('🎬 Seeding video posts for Reels...\n');

    // Get content_authors (horse personas) with their profile_ids
    const { data: horses, error: horsesError } = await supabase
        .from('content_authors')
        .select('id, name, alias, profile_id')
        .not('profile_id', 'is', null)
        .limit(10);

    if (horsesError) {
        console.error('❌ Failed to get horses:', horsesError);
        process.exit(1);
    }

    console.log(`✅ Found ${horses.length} horse profiles\n`);

    // Create video posts
    let posted = 0;
    for (let i = 0; i < SAMPLE_CLIPS.length; i++) {
        const clip = SAMPLE_CLIPS[i];
        const horse = horses[i % horses.length];

        const { data: post, error: postError } = await supabase
            .from('social_posts')
            .insert({
                author_id: horse.profile_id,  // Use profile_id from horse_personas
                content: `🎬 ${clip.title}`,
                content_type: 'video',
                media_urls: [clip.url],
                visibility: 'public',
                metadata: {
                    clip_id: clip.id,
                    source: clip.source
                }
            })
            .select('id')
            .single();

        if (post) {
            console.log(`✅ ${horse.name}: Posted "${clip.title}"`);
            posted++;
        } else {
            console.log(`❌ ${horse.name}: Failed - ${postError?.message}`);
        }
    }

    console.log(`\n✅ Seeded ${posted}/${SAMPLE_CLIPS.length} video posts!`);
    console.log('🔄 Refresh https://smarter.poker/hub/reels to see them');
}

main();
