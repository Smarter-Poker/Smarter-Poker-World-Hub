/**
 * 🎬 POST VIDEO CLIP TO HORSE
 * 
 * Tests the full video clip pipeline by posting a real clip 
 * to a random active horse's social feed and story.
 */

import { config } from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
config({ path: path.resolve(__dirname, '../../../.env.local') });

import { createClient } from '@supabase/supabase-js';
import { getGrokClient } from '../../lib/grokClient.js';
import { videoClipper } from './VideoClipper.js';
import { getRandomClip, getRandomCaption } from './ClipLibrary.js';

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

const openai = getGrokClient();

async function postVideoClipToHorse() {
    console.log('\n🎬 POSTING VIDEO CLIP TO HORSE');
    console.log('═'.repeat(60));

    // Get a random active horse
    const { data: horses, error: horseErr } = await supabase
        .from('content_authors')
        .select('id, name, alias, profile_id, stakes, voice')
        .eq('is_active', true)
        .not('profile_id', 'is', null)
        .limit(10);

    if (horseErr || !horses?.length) {
        console.error('No active horses found');
        return;
    }

    const horse = horses[Math.floor(Math.random() * horses.length)];
    console.log(`\n🐴 Selected horse: ${horse.name} (${horse.alias})`);

    // Get a random clip - try up to 5 times if video unavailable
    let clip = null;
    let result = null;
    const triedClips = [];

    for (let attempt = 1; attempt <= 5; attempt++) {
        clip = getRandomClip({ excludeIds: triedClips });
        triedClips.push(clip.id);

        console.log(`\n📼 Attempt ${attempt}: ${clip.id}`);
        console.log(`   Title: ${clip.title}`);
        console.log(`   URL: ${clip.source_url}`);

        // Process the video clip
        console.log('\n⏳ Processing video...');
        result = await videoClipper.processVideo(clip.source_url, {
            startTime: clip.start_time,
            duration: Math.min(clip.duration, 45),
            addCaptions: false
        });

        if (result.success) {
            console.log(`\n✅ Video uploaded: ${result.publicUrl}`);
            break;
        } else {
            console.log(`❌ Failed: ${result.error}`);
            if (attempt < 5) console.log('   Trying another clip...');
        }
    }

    if (!result || !result.success) {
        console.error('❌ All clip attempts failed');
        return;
    }

    // Generate caption
    const templateCaption = getRandomCaption(clip.category);
    let caption = templateCaption;

    try {
        const response = await openai.chat.completions.create({
            model: 'gpt-4o',
            messages: [{
                role: 'system',
                content: `You are ${horse.name}, a poker player sharing a clip. Style: ${horse.voice || 'casual'}. Keep it VERY short (1-2 sentences).`
            }, {
                role: 'user',
                content: `Write a brief caption for this poker clip: ${clip.title}. Reference: "${templateCaption}"`
            }],
            max_tokens: 60,
            temperature: 0.9
        });
        caption = response.choices[0].message.content;
    } catch (e) {
        console.log('Using template caption');
    }

    console.log(`\n📝 Caption: ${caption}`);

    // Create the post
    const { data: post, error: postErr } = await supabase
        .from('social_posts')
        .insert({
            author_id: horse.profile_id,
            content: caption,
            content_type: 'video',
            media_urls: [result.publicUrl],
            visibility: 'public'
        })
        .select()
        .maybeSingle();

    if (postErr) {
        console.error('❌ Post creation failed:', postErr.message);
        return;
    }

    console.log(`\n✅ POST CREATED: ${post.id}`);

    // Also add to stories
    const { error: storyErr } = await supabase
        .from('stories')
        .insert({
            author_id: horse.profile_id,
            media_url: result.publicUrl,
            media_type: 'video',
            expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()
        });

    if (storyErr) {
        console.error('Story error:', storyErr.message);
    } else {
        console.log('✅ Story created (24h)');
    }

    console.log('\n═'.repeat(60));
    console.log(`🎉 ${horse.alias} posted a video clip!`);
    console.log('═'.repeat(60) + '\n');
}

postVideoClipToHorse();
