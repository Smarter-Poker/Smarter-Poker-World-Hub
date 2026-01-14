/**
 * 🐴 UNLEASH THE HORSES - Mass Video Clip Posting
 * Posts video clips for ALL active horses at once
 */

import { videoClipper } from './VideoClipper.js';
import { getRandomClip, getRandomCaption, markClipUsed, CLIP_LIBRARY } from './ClipLibrary.js';
import { createClient } from '@supabase/supabase-js';
import fs from 'fs';

// Load env
import { config } from 'dotenv';
config({ path: '../../../.env.local' });

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://kuklfnapbkmacvwxktbh.supabase.co';
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// Track which clips we've used this run
const usedClipIds = new Set();

function getUniqueClip() {
    const availableClips = CLIP_LIBRARY.filter(c => !usedClipIds.has(c.id));
    if (availableClips.length === 0) return null;
    const clip = availableClips[Math.floor(Math.random() * availableClips.length)];
    usedClipIds.add(clip.id);
    return clip;
}

async function postForHorse(horse) {
    console.log(`\n🐴 ${horse.name} (@${horse.username || 'unknown'})`);
    console.log('─'.repeat(50));

    try {
        // Get unique clip
        const clip = getUniqueClip();
        if (!clip) {
            console.log('   ⚠️ No more clips available');
            return { success: false, reason: 'no_clips' };
        }

        console.log(`   📹 Clip: ${clip.title.slice(0, 40)}...`);

        // Get caption
        const caption = getRandomCaption(clip.category);
        console.log(`   💬 Caption: "${caption}"`);

        // Download
        console.log(`   📥 Downloading...`);
        const downloadResult = await videoClipper.downloadVideo(clip.source_url);
        if (!downloadResult.success) {
            console.log(`   ❌ Download failed`);
            return { success: false, reason: 'download_failed' };
        }

        // Convert to vertical
        console.log(`   📐 Converting to vertical...`);
        const verticalResult = await videoClipper.convertToVertical(downloadResult.path, {
            deleteOriginal: true
        });
        if (!verticalResult.success) {
            console.log(`   ❌ Conversion failed`);
            return { success: false, reason: 'conversion_failed' };
        }

        // Upload to storage
        console.log(`   ☁️ Uploading...`);
        const fileName = `clip_${Date.now()}_${Math.random().toString(36).slice(2, 8)}.mp4`;
        const storagePath = `reels/clips/${fileName}`;
        const fileBuffer = fs.readFileSync(verticalResult.path);

        const { error: uploadError } = await supabase.storage
            .from('social-media')
            .upload(storagePath, fileBuffer, { contentType: 'video/mp4' });

        if (uploadError) {
            console.log(`   ❌ Upload failed: ${uploadError.message}`);
            return { success: false, reason: 'upload_failed' };
        }

        const { data: urlData } = supabase.storage
            .from('social-media')
            .getPublicUrl(storagePath);
        const videoUrl = urlData.publicUrl;

        // Create post
        console.log(`   📝 Creating post...`);
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
            console.log(`   ❌ Post failed: ${postError.message}`);
            return { success: false, reason: 'post_failed' };
        }

        // Create story
        console.log(`   📱 Creating story...`);
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
            console.log(`   ⚠️ Story failed: ${storyError.message}`);
        }

        // Cleanup local file
        if (fs.existsSync(verticalResult.path)) {
            fs.unlinkSync(verticalResult.path);
        }

        markClipUsed(clip.id);

        console.log(`   ✅ SUCCESS! Post: ${post.id}`);
        if (story) console.log(`   ✅ Story: ${story.id}`);

        return {
            success: true,
            horse: horse.name,
            clip: clip.title,
            caption,
            postId: post.id,
            storyId: story?.id,
            videoUrl
        };

    } catch (error) {
        console.log(`   ❌ Error: ${error.message}`);
        return { success: false, reason: error.message };
    }
}

async function unleashTheHorses() {
    console.log('\n🐴🐴🐴 UNLEASHING THE HORSES 🐴🐴🐴');
    console.log('═'.repeat(60));
    console.log('Loading all active horses...\n');

    // Get all active horses
    const { data: horses, error } = await supabase
        .from('content_authors')
        .select('*')
        .eq('is_active', true)
        .not('profile_id', 'is', null);

    if (error || !horses?.length) {
        console.log('No horses found!');
        return;
    }

    console.log(`Found ${horses.length} active horses\n`);

    const results = [];

    for (const horse of horses) {
        // Random delay between horses (2-5 seconds)
        await new Promise(r => setTimeout(r, 2000 + Math.random() * 3000));

        const result = await postForHorse(horse);
        results.push(result);
    }

    // Summary
    console.log('\n' + '═'.repeat(60));
    console.log('📊 RESULTS SUMMARY');
    console.log('═'.repeat(60));

    const successful = results.filter(r => r.success);
    const failed = results.filter(r => !r.success);

    console.log(`\n✅ Successful: ${successful.length}`);
    console.log(`❌ Failed: ${failed.length}`);

    if (successful.length > 0) {
        console.log('\n📝 Posts Created:');
        successful.forEach(r => {
            console.log(`   • ${r.horse}: "${r.caption}"`);
        });
    }

    console.log('\n🎉 HORSES UNLEASHED!');
}

unleashTheHorses().catch(console.error);
