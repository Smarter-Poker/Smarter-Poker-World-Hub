/**
 * Test Video Deduplication
 */
import { config } from 'dotenv';
config({ path: '.env.local' });

import { createClient } from '@supabase/supabase-js';
import { getRandomClip } from './ClipLibrary.js';

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

async function testDeduplication() {
    console.debug('\n🔍 TESTING VIDEO DEDUPLICATION');
    console.debug('═'.repeat(50));

    const cutoff = new Date(Date.now() - 48 * 60 * 60 * 1000);

    // Get recent posts with metadata
    const { data: recentPosts } = await supabase
        .from('social_posts')
        .select('metadata')
        .eq('content_type', 'video')
        .gte('created_at', cutoff.toISOString())
        .limit(50);

    const usedClipIds = new Set();
    (recentPosts || []).forEach(post => {
        if (post.metadata?.clip_id) usedClipIds.add(post.metadata.clip_id);
        if (post.metadata?.source_video_id) usedClipIds.add(post.metadata.source_video_id);
    });

    console.debug(`\nRecent video posts: ${recentPosts?.length || 0}`);
    console.debug(`Posts with metadata.clip_id: ${recentPosts?.filter(p => p.metadata?.clip_id).length || 0}`);
    console.debug(`Used clip IDs to exclude: ${usedClipIds.size}`);

    // Try to select 5 unique clips
    console.debug('\n📋 Selecting 5 unique clips:');
    const usedThisSession = new Set();

    for (let i = 0; i < 5; i++) {
        let attempts = 0;
        let clip = null;

        while (!clip && attempts < 30) {
            const candidate = getRandomClip();
            if (!candidate) break;

            const isUsed = usedClipIds.has(candidate.id) || usedThisSession.has(candidate.id);
            if (!isUsed) {
                clip = candidate;
                usedThisSession.add(candidate.id);
            }
            attempts++;
        }

        if (clip) {
            console.debug(`  ✅ Clip ${i + 1}: ${clip.id} (found in ${attempts} attempts)`);
        } else {
            console.debug(`  ❌ Failed to find unique clip after ${attempts} attempts`);
        }
    }

    // Check if all selected clips are unique
    console.debug(`\n📊 Session clips selected: ${usedThisSession.size}`);
    console.debug(`All unique: ${usedThisSession.size === 5 ? '✅ YES' : '❌ NO'}`);

    console.debug('\n' + '═'.repeat(50));
    console.debug('✅ Deduplication test complete!\n');
}

testDeduplication().catch(console.warn);
