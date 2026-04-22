/**
 * Test Video Clip Posting with YouTube URLs
 */
import { config } from 'dotenv';
config({ path: '.env.local' });

import { createClient } from '@supabase/supabase-js';
import { generatePostCaption } from './HumanVoiceEngine.js';
import { getRandomClip, getRandomCaption, CLIP_CATEGORIES } from './ClipLibrary.js';

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

async function testVideoPost() {
    console.debug('\n🎬 TESTING VIDEO CLIP POSTING');
    console.debug('═'.repeat(50));

    // Get a test horse
    const { data: horses, error: horseError } = await supabase
        .from('content_authors')
        .select('id, name, profile_id, voice, stakes')
        .eq('is_active', true)
        .limit(1);

    if (horseError || !horses?.length) {
        console.debug('❌ No active horses found:', horseError?.message);
        return;
    }

    const horse = horses[0];
    console.debug(`\nHorse: ${horse.name}`);

    // Get a random clip
    const clip = getRandomClip();
    console.debug(`Clip: ${clip.id}`);
    console.debug(`URL: ${clip.source_url}`);

    // Generate caption
    const caption = generatePostCaption(clip.category || 'massive_pot', horse.profile_id, clip.title || '');
    console.debug(`Caption: ${caption}`);

    // Create post with YouTube URL
    console.debug('\nCreating post...');
    const { data: post, error: postError } = await supabase
        .from('social_posts')
        .insert({
            author_id: horse.profile_id,
            content: caption,
            content_type: 'video',
            media_urls: [clip.source_url],
            visibility: 'public',
            metadata: {
                clip_id: clip.id,
                source_video_id: clip.video_id || clip.id,
                source: clip.source || 'unknown',
                category: clip.category || 'unknown'
            }
        })
        .select()
        .maybeSingle();

    if (postError) {
        console.debug(`\n❌ Post error: ${postError.message}`);
        console.debug('Error details:', postError);
    } else {
        console.debug(`\n✅ Post created successfully!`);
        console.debug(`Post ID: ${post.id}`);
        console.debug(`Clip ID in metadata: ${post.metadata?.clip_id}`);
    }

    console.debug('\n' + '═'.repeat(50));
}

testVideoPost().catch(console.warn);
