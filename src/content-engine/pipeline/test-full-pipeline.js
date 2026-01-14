/**
 * 🧪 FULL HORSE VIDEO CLIP PIPELINE TEST
 * Tests: Download -> Clip -> Vertical -> Upload -> Post -> Story
 * 
 * Run with: node test-full-pipeline.js
 */

import { videoClipper } from './VideoClipper.js';
import { getRandomClip, getRandomCaption, markClipUsed } from './ClipLibrary.js';
import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import path from 'path';

// Load env vars from .env.local
import { config } from 'dotenv';
config({ path: '../../../.env.local' });

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://kuklfnapbkmacvwxktbh.supabase.co';
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

console.log('\n🎬 FULL HORSE VIDEO CLIP PIPELINE TEST');
console.log('═'.repeat(60));
console.log('Supabase URL:', SUPABASE_URL);
console.log('Has Supabase Key:', !!SUPABASE_ANON_KEY);

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

async function testFullPipeline() {
    try {
        // Step 1: Get a random Horse
        console.log('\n📋 Step 1: Getting random Horse...');
        const { data: horses, error: horseError } = await supabase
            .from('content_authors')
            .select('*')
            .eq('is_active', true)
            .not('profile_id', 'is', null)
            .limit(5);

        if (horseError) {
            console.error('Failed to get horses:', horseError.message);
            // Try listing tables to debug
            console.log('Attempting to verify tables...');
            const { data: profiles } = await supabase.from('profiles').select('id, display_name').limit(3);
            console.log('Sample profiles:', profiles);
            return;
        }

        if (!horses || horses.length === 0) {
            console.log('No active horses found. Creating test scenario...');
            // Just use a test profile ID for now
            const { data: testProfile } = await supabase
                .from('profiles')
                .select('id, display_name')
                .limit(1)
                .single();

            if (!testProfile) {
                console.error('No profiles found in database');
                return;
            }

            console.log(`Using test profile: ${testProfile.display_name} (${testProfile.id})`);
            var horse = {
                name: 'Test Horse',
                profile_id: testProfile.id,
                voice: 'casual',
                stakes: '2/5'
            };
        } else {
            var horse = horses[Math.floor(Math.random() * horses.length)];
            console.log(`Selected: ${horse.name} (${horse.profile_id})`);
        }

        // Step 2: Get a random clip
        console.log('\n📚 Step 2: Getting random clip...');
        const clip = getRandomClip();
        console.log(`   Clip: ${clip.title}`);
        console.log(`   Category: ${clip.category}`);
        console.log(`   URL: ${clip.source_url}`);

        // Step 3: Get caption
        console.log('\n💬 Step 3: Getting caption...');
        const caption = getRandomCaption(clip.category);
        console.log(`   Caption: "${caption}"`);

        // Step 4: Download the video
        console.log('\n📥 Step 4: Downloading video...');
        const downloadResult = await videoClipper.downloadVideo(clip.source_url);

        if (!downloadResult.success) {
            console.error('Download failed:', downloadResult.error);
            return;
        }
        console.log(`   Downloaded: ${downloadResult.path}`);

        // Step 5: Convert to vertical
        console.log('\n📐 Step 5: Converting to vertical (1080x1920)...');
        const verticalResult = await videoClipper.convertToVertical(downloadResult.path, {
            deleteOriginal: false // Keep for debugging
        });

        if (!verticalResult.success) {
            console.error('Vertical conversion failed:', verticalResult.error);
            return;
        }
        console.log(`   Vertical: ${verticalResult.path}`);

        // Step 6: Upload to Supabase storage
        console.log('\n☁️ Step 6: Uploading to Supabase storage...');
        const fileName = `clip_${Date.now()}_${Math.random().toString(36).slice(2, 8)}.mp4`;
        const storagePath = `reels/clips/${fileName}`;

        const fileBuffer = fs.readFileSync(verticalResult.path);

        const { error: uploadError } = await supabase.storage
            .from('social-media')
            .upload(storagePath, fileBuffer, {
                contentType: 'video/mp4',
                upsert: false
            });

        if (uploadError) {
            console.error('Upload failed:', uploadError.message);
            // Try creating the bucket
            console.log('Attempting to create bucket...');
            await supabase.storage.createBucket('social-media', { public: true });
            // Retry
            const { error: retryError } = await supabase.storage
                .from('social-media')
                .upload(storagePath, fileBuffer, { contentType: 'video/mp4' });
            if (retryError) {
                console.error('Retry failed:', retryError.message);
                return;
            }
        }

        const { data: urlData } = supabase.storage
            .from('social-media')
            .getPublicUrl(storagePath);

        const videoUrl = urlData.publicUrl;
        console.log(`   Public URL: ${videoUrl}`);

        // Step 7: Create social post
        console.log('\n📝 Step 7: Creating social post...');
        const { data: post, error: postError } = await supabase
            .from('social_posts')
            .insert({
                author_id: horse.profile_id,
                content: caption,
                content_type: 'video',
                media_urls: [videoUrl],
                visibility: 'public'
            })
            .select()
            .single();

        if (postError) {
            console.error('Post creation failed:', postError.message);
            return;
        }
        console.log(`   Post created: ${post.id}`);

        // Step 8: Create story
        console.log('\n📱 Step 8: Creating story...');
        const { data: story, error: storyError } = await supabase
            .from('stories')
            .insert({
                author_id: horse.profile_id,
                media_url: videoUrl,
                media_type: 'video',
                expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()
            })
            .select()
            .single();

        if (storyError) {
            console.error('Story creation failed:', storyError.message);
        } else {
            console.log(`   Story created: ${story.id}`);
        }

        // Mark clip as used
        markClipUsed(clip.id);

        // Summary
        console.log('\n' + '═'.repeat(60));
        console.log('✅ FULL PIPELINE SUCCESS!');
        console.log('═'.repeat(60));
        console.log(`Horse: ${horse.name}`);
        console.log(`Clip: ${clip.title}`);
        console.log(`Caption: "${caption}"`);
        console.log(`Video URL: ${videoUrl}`);
        console.log(`Post ID: ${post.id}`);
        console.log(`Story ID: ${story?.id || 'N/A'}`);

        // Cleanup local files
        console.log('\n🧹 Cleaning up local files...');
        if (fs.existsSync(downloadResult.path)) fs.unlinkSync(downloadResult.path);
        if (fs.existsSync(verticalResult.path)) fs.unlinkSync(verticalResult.path);
        console.log('   Done!');

        return { success: true, post, story, videoUrl };

    } catch (error) {
        console.error('\n❌ PIPELINE ERROR:', error.message);
        console.error(error.stack);
        return { success: false, error: error.message };
    }
}

// Run the test
testFullPipeline().then(result => {
    console.log('\nFinal Result:', result?.success ? 'SUCCESS' : 'FAILED');
    process.exit(result?.success ? 0 : 1);
});
