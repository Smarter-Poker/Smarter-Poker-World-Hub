/**
 * 🐴 UNLEASH THE HORSES - HARDENED Video Clip Posting
 * ═══════════════════════════════════════════════════════════════════════════
 * 
 * HARDENING FEATURES:
 * ✅ HorseStable integration for source rotation & deduplication
 * ✅ Retry logic for failed downloads (3 attempts)
 * ✅ Auto-generate source_url from video_id
 * ✅ Graceful fallback when clips unavailable
 * ✅ Rate limiting to avoid YouTube blocks
 * 
 * ═══════════════════════════════════════════════════════════════════════════
 */

import { videoClipper } from './VideoClipper.js';
import {
    getRandomCaption,
    markClipUsed,
    CLIP_LIBRARY,
    CLIP_SOURCES
} from './ClipLibrary.js';
import { HorseStable } from './HorseStable.js';
import { createClient } from '@supabase/supabase-js';
import fs from 'fs';

// Load env
import { config } from 'dotenv';
config({ path: '../../../.env.local' });

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://kuklfnapbkmacvwxktbh.supabase.co';
// Use SERVICE_ROLE_KEY to bypass RLS when posting on behalf of horses
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

// ═══════════════════════════════════════════════════════════════════════════
// HARDENING CONSTANTS
// ═══════════════════════════════════════════════════════════════════════════
const MAX_DOWNLOAD_RETRIES = 3;
const RETRY_DELAY_MS = 2000;
const HORSE_DELAY_MS = { min: 3000, max: 7000 }; // Rate limiting

// Initialize HorseStable coordinator
const stable = new HorseStable();
const usedClipIds = new Set();
let lastSource = null;

// ═══════════════════════════════════════════════════════════════════════════
// UTILITY FUNCTIONS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Generate source_url from video_id if missing
 */
function ensureSourceUrl(clip) {
    if (clip.source_url) return clip.source_url;
    if (clip.video_id) return `https://www.youtube.com/watch?v=${clip.video_id}`;
    return null;
}

/**
 * Get unique clip with source rotation
 */
function getUniqueClipWithRotation() {
    // Try to get clip from different source than last time
    const availableClips = CLIP_LIBRARY.filter(c =>
        !usedClipIds.has(c.id) &&
        stable.isClipAvailable(c.id)
    );

    if (availableClips.length === 0) return null;

    // Prefer different source than last
    let candidates = availableClips.filter(c => c.source !== lastSource);
    if (candidates.length === 0) candidates = availableClips;

    const clip = candidates[Math.floor(Math.random() * candidates.length)];
    usedClipIds.add(clip.id);
    lastSource = clip.source;

    return clip;
}

/**
 * Sleep utility
 */
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

/**
 * Download with retry logic
 */
async function downloadWithRetry(sourceUrl, maxRetries = MAX_DOWNLOAD_RETRIES) {
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
            console.debug(`   📥 Attempt ${attempt}/${maxRetries}...`);
            const result = await videoClipper.downloadVideo(sourceUrl);

            if (result.success) {
                return result;
            }

            console.debug(`   ⚠️ Download failed, retrying...`);
            await sleep(RETRY_DELAY_MS * attempt); // Exponential backoff

        } catch (error) {
            console.debug(`   ⚠️ Attempt ${attempt} error: ${error.message}`);
            if (attempt < maxRetries) {
                await sleep(RETRY_DELAY_MS * attempt);
            }
        }
    }

    return { success: false };
}

// ═══════════════════════════════════════════════════════════════════════════
// MAIN POSTING FUNCTION
// ═══════════════════════════════════════════════════════════════════════════
async function postForHorse(horse, attemptNumber = 1) {
    console.debug(`\n🐴 ${horse.name} (@${horse.username || 'unknown'})`);
    console.debug('─'.repeat(50));

    try {
        // Get unique clip with source rotation
        const clip = getUniqueClipWithRotation();
        if (!clip) {
            console.debug('   ⚠️ No more clips available');
            return { success: false, reason: 'no_clips' };
        }

        // Ensure source_url exists
        const sourceUrl = ensureSourceUrl(clip);
        if (!sourceUrl) {
            console.debug('   ⚠️ No valid URL for clip, trying another...');
            if (attemptNumber < 3) {
                return postForHorse(horse, attemptNumber + 1);
            }
            return { success: false, reason: 'no_valid_url' };
        }

        const sourceName = CLIP_SOURCES[clip.source]?.name || clip.source;
        console.debug(`   📹 Clip: ${clip.title.slice(0, 40)}...`);
        console.debug(`   🎬 Source: ${sourceName}`);

        // Get caption
        const caption = getRandomCaption(clip.category);
        console.debug(`   💬 Caption: "${caption}"`);

        // Download with retry
        console.debug(`   📥 Downloading from ${clip.source}...`);
        const downloadResult = await downloadWithRetry(sourceUrl);

        if (!downloadResult.success) {
            console.debug(`   ❌ Download failed after ${MAX_DOWNLOAD_RETRIES} attempts`);
            // Try a different clip
            if (attemptNumber < 3) {
                console.debug(`   🔄 Trying different clip...`);
                return postForHorse(horse, attemptNumber + 1);
            }
            return { success: false, reason: 'download_failed' };
        }

        // Convert to vertical
        console.debug(`   📐 Converting to vertical...`);
        const verticalResult = await videoClipper.convertToVertical(downloadResult.path, {
            deleteOriginal: true
        });

        if (!verticalResult.success) {
            console.debug(`   ❌ Conversion failed`);
            return { success: false, reason: 'conversion_failed' };
        }

        // Upload to storage
        console.debug(`   ☁️ Uploading...`);
        const fileName = `clip_${Date.now()}_${Math.random().toString(36).slice(2, 8)}.mp4`;
        const storagePath = `reels/clips/${fileName}`;
        const fileBuffer = fs.readFileSync(verticalResult.path);

        const { error: uploadError } = await supabase.storage
            .from('social-media')
            .upload(storagePath, fileBuffer, { contentType: 'video/mp4' });

        if (uploadError) {
            console.debug(`   ❌ Upload failed: ${uploadError.message}`);
            return { success: false, reason: 'upload_failed' };
        }

        const { data: urlData } = supabase.storage
            .from('social-media')
            .getPublicUrl(storagePath);

        if (!urlData?.publicUrl) {
            console.debug(`   ❌ Failed to get public URL`);
            return { success: false, reason: 'url_generation_failed' };
        }

        const videoUrl = urlData.publicUrl;

        // Create post
        console.debug(`   📝 Creating post...`);
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

        if (postError || !post) {
            console.debug(`   ❌ Post failed: ${postError?.message || 'No data returned'}`);
            return { success: false, reason: 'post_failed' };
        }

        // Create story
        console.debug(`   📱 Creating story...`);
        const { data: story, error: storyError } = await supabase
            .from('social_stories')  // FIXED: was 'stories' (non-existent table)
            .insert({
                author_id: horse.profile_id,
                media_url: videoUrl,
                media_type: 'video',
                expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()
            })
            .select()
            .maybeSingle();

        if (storyError) {
            console.debug(`   ⚠️ Story failed: ${storyError.message}`);
        }

        // Cleanup local file
        if (fs.existsSync(verticalResult.path)) {
            fs.unlinkSync(verticalResult.path);
        }

        // Mark as used in both local and stable
        markClipUsed(clip.id);
        stable.reserveClip(clip.id, horse.profile_id, horse.name);

        console.debug(`   ✅ SUCCESS! Post: ${post.id}`);
        if (story) console.debug(`   ✅ Story: ${story.id}`);

        return {
            success: true,
            horse: horse.name,
            source: clip.source,
            clip: clip.title,
            caption,
            postId: post.id,
            storyId: story?.id,
            videoUrl
        };

    } catch (error) {
        console.debug(`   ❌ Error: ${error.message}`);
        return { success: false, reason: error.message };
    }
}

// ═══════════════════════════════════════════════════════════════════════════
// MAIN ORCHESTRATION
// ═══════════════════════════════════════════════════════════════════════════
async function unleashTheHorses() {
    console.debug('\n🐴🐴🐴 UNLEASHING THE HORSES (HARDENED) 🐴🐴🐴');
    console.debug('═'.repeat(60));
    console.debug('Features: Source rotation • Retry logic • Deduplication');
    console.debug('Loading all active horses...\n');

    // Get all active horses
    const { data: horses, error } = await supabase
        .from('content_authors')
        .select('*')
        .eq('is_active', true)
        .not('profile_id', 'is', null);

    if (error || !horses?.length) {
        console.debug('No horses found!');
        return;
    }

    console.debug(`Found ${horses.length} active horses`);
    console.debug(`Available clips: ${CLIP_LIBRARY.length}\n`);

    const results = [];
    const sourceStats = {};

    for (const horse of horses) {
        // Rate limiting delay
        const delay = HORSE_DELAY_MS.min + Math.random() * (HORSE_DELAY_MS.max - HORSE_DELAY_MS.min);
        await sleep(delay);

        const result = await postForHorse(horse);
        results.push(result);

        // Track source distribution
        if (result.success && result.source) {
            sourceStats[result.source] = (sourceStats[result.source] || 0) + 1;
        }
    }

    // Summary
    console.debug('\n' + '═'.repeat(60));
    console.debug('📊 HARDENED RESULTS SUMMARY');
    console.debug('═'.repeat(60));

    const successful = results.filter(r => r.success);
    const failed = results.filter(r => !r.success);

    console.debug(`\n✅ Successful: ${successful.length}`);
    console.debug(`❌ Failed: ${failed.length}`);

    if (Object.keys(sourceStats || {}).length > 0) {
        console.debug('\n📺 SOURCE DISTRIBUTION:');
        Object.entries(sourceStats || {})
            .sort((a, b) => b[1] - a[1])
            .forEach(([source, count]) => {
                const name = CLIP_SOURCES[source]?.name || source;
                console.debug(`   ${name}: ${count} clips`);
            });
    }

    if (successful.length > 0) {
        console.debug('\n📝 Posts Created:');
        successful.slice(0, 10).forEach(r => {
            console.debug(`   • ${r.horse} (${r.source}): "${r.caption.slice(0, 30)}..."`);
        });
        if (successful.length > 10) {
            console.debug(`   ... and ${successful.length - 10} more`);
        }
    }

    if (failed.length > 0) {
        console.debug('\n⚠️ Failed reasons:');
        const reasons = {};
        failed.forEach(r => {
            reasons[r.reason] = (reasons[r.reason] || 0) + 1;
        });
        Object.entries(reasons || {}).forEach(([reason, count]) => {
            console.debug(`   ${reason}: ${count}`);
        });
    }

    console.debug('\n🎉 HORSES UNLEASHED!');
}

unleashTheHorses().catch(console.warn);
