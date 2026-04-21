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

// Load env vars from .env.local
import { config } from 'dotenv';
config({ path: '../../../.env.local' });

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://kuklfnapbkmacvwxktbh.supabase.co';
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

console.debug('\n🎬 FULL HORSE VIDEO CLIP PIPELINE TEST');
console.debug('═'.repeat(60));
console.debug('Supabase URL:', SUPABASE_URL);
console.debug('Has Supabase Key:', !!SUPABASE_ANON_KEY);

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

async function testFullPipeline() {
    try {
        // Step 1: Get a random Horse
        console.debug('\n📋 Step 1: Getting random Horse...');
        const { data: horses, error: horseError } = await supabase
            .from('content_authors')
            .select('*')
            .eq('is_active', true)
            .not('profile_id', 'is', null)
            .limit(5);

        if (horseError) {
            console.warn('Failed to get horses:', horseError.message);
            // Try listing tables to debug
            console.debug('Attempting to verify tables...');
            const { data: profiles } = await supabase.from('profiles').select('id, display_name').limit(3);
            console.debug('Sample profiles:', profiles);
            return;
        }

        if (!horses || horses.length === 0) {
            console.debug('No active horses found. Creating test scenario...');
            // Just use a test profile ID for now
            const { data: testProfile } = await supabase
                .from('profiles')
                .select('id, display_name')
                .limit(1)
                .maybeSingle();

            if (!testProfile) {
                console.warn('No profiles found in database');
                return;
            }

            console.debug(`Using test profile: ${testProfile.display_name} (${testProfile.id})`);
            var horse = {
                name: 'Test Horse',
                profile_id: testProfile.id,
                voice: 'casual',
                stakes: '2/5'
            };
        } else {
            var horse = horses[Math.floor(Math.random() * horses.length)];
            console.debug(`Selected: ${horse.name} (${horse.profile_id})`);
        }

        // Step 2: Get a random clip
        console.debug('\n📚 Step 2: Getting random clip...');
        const clip = getRandomClip();
        console.debug(`   Clip: ${clip.title}`);
        console.debug(`   Category: ${clip.category}`);
        console.debug(`   URL: ${clip.source_url}`);

        // Step 3: Get caption
        console.debug('\n💬 Step 3: Getting caption...');
        const caption = getRandomCaption(clip.category);
        console.debug(`   Caption: "${caption}"`);

        // Step 4: Download the video
        console.debug('\n📥 Step 4: Downloading video...');
        const downloadResult = await videoClipper.downloadVideo(clip.source_url);

        if (!downloadResult.success) {
            console.warn('Download failed:', downloadResult.error);
            return;
        }
        console.debug(`   Downloaded: ${downloadResult.path}`);

        // Step 5: Convert to vertical
        console.debug('\n📐 Step 5: Converting to vertical (1080x1920)...');
        const verticalResult = await videoClipper.convertToVertical(downloadResult.path, {
            deleteOriginal: false // Keep for debugging
        });

        if (!verticalResult.success) {
            console.warn('Vertical conversion failed:', verticalResult.error);
            return;
        }
        console.debug(`   Vertical: ${verticalResult.path}`);

        // Step 6: Upload to Supabase storage
        console.debug('\n☁️ Step 6: Uploading to Supabase storage...');
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
            console.warn('Upload failed:', uploadError.message);
            // Try creating the bucket
            console.debug('Attempting to create bucket...');
            await supabase.storage.createBucket('social-media', { public: true });
            // Retry
            const { error: retryError } = await supabase.storage
                .from('social-media')
                .upload(storagePath, fileBuffer, { contentType: 'video/mp4' });
            if (retryError) {
                console.warn('Retry failed:', retryError.message);
                return;
            }
        }

        const { data: urlData } = supabase.storage
            .from('social-media')
            .getPublicUrl(storagePath);

        const videoUrl = urlData.publicUrl;
        console.debug(`   Public URL: ${videoUrl}`);

        // Step 7: Create social post
        console.debug('\n📝 Step 7: Creating social post...');
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
            .maybeSingle();

        if (postError) {
            console.warn('Post creation failed:', postError.message);
            return;
        }
        console.debug(`   Post created: ${post.id}`);

        // Step 8: Create story
        console.debug('\n📱 Step 8: Creating story...');
        const { data: story, error: storyError } = await supabase
            .from('stories')
            .insert({
                author_id: horse.profile_id,
                media_url: videoUrl,
                media_type: 'video',
                expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()
            })
            .select()
            .maybeSingle();

        if (storyError) {
            console.warn('Story creation failed:', storyError.message);
        } else {
            console.debug(`   Story created: ${story.id}`);
        }

        // Mark clip as used
        markClipUsed(clip.id);

        // Summary
        console.debug('\n' + '═'.repeat(60));
        console.debug('✅ FULL PIPELINE SUCCESS!');
        console.debug('═'.repeat(60));
        console.debug(`Horse: ${horse.name}`);
        console.debug(`Clip: ${clip.title}`);
        console.debug(`Caption: "${caption}"`);
        console.debug(`Video URL: ${videoUrl}`);
        console.debug(`Post ID: ${post.id}`);
        console.debug(`Story ID: ${story?.id || 'N/A'}`);

        // Cleanup local files
        console.debug('\n🧹 Cleaning up local files...');
        if (fs.existsSync(downloadResult.path)) fs.unlinkSync(downloadResult.path);
        if (fs.existsSync(verticalResult.path)) fs.unlinkSync(verticalResult.path);
        console.debug('   Done!');

        return { success: true, post, story, videoUrl };

    } catch (error) {
        console.warn('\n❌ PIPELINE ERROR:', error.message);
        console.warn(error.stack);
        return { success: false, error: error.message };
    }
}

// Run the test
testFullPipeline().then(result => {
    console.debug('\nFinal Result:', result?.success ? 'SUCCESS' : 'FAILED');
    process.exit(result?.success ? 0 : 1);
});
