/**
 * Test Video Clip Posting with YouTube URLs
 */
import { config } from 'dotenv';
config({ path: '.env.local' });

import { createClient } from '@supabase/supabase-js';
import OpenAI from 'openai';
import { getRandomClip, getRandomCaption, CLIP_CATEGORIES } from './ClipLibrary.js';

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

async function testVideoPost() {
    console.log('\n🎬 TESTING VIDEO CLIP POSTING');
    console.log('═'.repeat(50));

    // Get a test horse
    const { data: horses, error: horseError } = await supabase
        .from('content_authors')
        .select('id, name, profile_id, voice, stakes')
        .eq('is_active', true)
        .limit(1);

    if (horseError || !horses?.length) {
        console.log('❌ No active horses found:', horseError?.message);
        return;
    }

    const horse = horses[0];
    console.log(`\nHorse: ${horse.name}`);

    // Get a random clip
    const clip = getRandomClip();
    console.log(`Clip: ${clip.id}`);
    console.log(`URL: ${clip.source_url}`);

    // Generate caption
    const templateCaption = getRandomCaption(clip.category || CLIP_CATEGORIES.FUNNY);

    console.log(`\nGenerating caption from template: "${templateCaption}"`);

    const response = await openai.chat.completions.create({
        model: 'gpt-4o',
        messages: [{
            role: 'system',
            content: `You are ${horse.name}, a poker player posting a video clip. Keep it VERY short (1-2 sentences max).`
        }, {
            role: 'user',
            content: `Write a brief caption for sharing this poker clip: ${clip.description || 'sick hand'}. Reference: "${templateCaption}"`
        }],
        max_tokens: 60,
        temperature: 0.9
    });

    const caption = response.choices[0].message.content;
    console.log(`Caption: ${caption}`);

    // Create post with YouTube URL
    console.log('\nCreating post...');
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
        .single();

    if (postError) {
        console.log(`\n❌ Post error: ${postError.message}`);
        console.log('Error details:', postError);
    } else {
        console.log(`\n✅ Post created successfully!`);
        console.log(`Post ID: ${post.id}`);
        console.log(`Clip ID in metadata: ${post.metadata?.clip_id}`);
    }

    console.log('\n' + '═'.repeat(50));
}

testVideoPost().catch(console.error);
