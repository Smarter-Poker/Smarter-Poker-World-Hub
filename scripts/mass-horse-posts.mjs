#!/usr/bin/env node
/**
 * MASS HORSE POSTING SCRIPT
 * Run this locally to immediately post clips from many horses
 */

import { createClient } from '@supabase/supabase-js';
import { getRandomClip } from '../src/content-engine/pipeline/ClipLibrary.js';

const supabase = createClient(
    'https://kuklfnapbkmacvwxktbh.supabase.co',
    process.env.SUPABASE_SERVICE_ROLE_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imt1a2xmbmFwYmttYWN2d3hrdGJoIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2NzczMDg0NCwiZXhwIjoyMDgzMzA2ODQ0fQ.bbDqj-me78PID99npWCZ5qUuINSC1-eCBb1BVhgiSRs'
);

const HORSES_TO_POST = 50; // Post clips from 50 different horses

async function main() {
    console.log('🐴 MASS HORSE POSTING - Starting...\n');

    // Get all horses
    const { data: horses, error: horseError } = await supabase
        .from('content_authors')
        .select('id, name, profile_id')
        .not('profile_id', 'is', null)
        .limit(100);

    if (horseError || !horses?.length) {
        console.error('Failed to get horses:', horseError?.message);
        process.exit(1);
    }

    console.log(`Found ${horses.length} horses with profiles\n`);

    // Shuffle and take first N
    const shuffled = horses.sort(() => Math.random() - 0.5);
    const selectedHorses = shuffled.slice(0, HORSES_TO_POST);

    const usedClips = new Set();
    let successCount = 0;

    for (const horse of selectedHorses) {
        // Get a unique clip
        let clip = null;
        let attempts = 0;
        while (!clip && attempts < 10) {
            const candidate = getRandomClip();
            if (candidate && !usedClips.has(candidate.id)) {
                clip = candidate;
                usedClips.add(candidate.id);
            }
            attempts++;
        }

        if (!clip) {
            console.log(`❌ ${horse.name}: No fresh clips available`);
            continue;
        }

        // Create caption
        const captions = [
            '🔥 Sick hand alert!',
            '💰 This is how you play poker',
            '😱 Would you make this call?',
            '🎯 Perfect read',
            '💪 Running good today',
            '🃏 Check out this line',
            '⚡ High stakes action',
            '🏆 Championship move',
            '🎬 Must-see hand',
            '💎 Premium content'
        ];
        const caption = captions[Math.floor(Math.random() * captions.length)];

        // Post
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
                    source: clip.source || 'unknown',
                    thumbnail_url: clip.thumbnail_url || null
                }
            })
            .select('id')
            .single();

        if (postError) {
            console.log(`❌ ${horse.name}: ${postError.message}`);
        } else {
            console.log(`✅ ${horse.name}: Posted clip ${clip.id}`);
            successCount++;
        }

        // Small delay to spread timestamps
        await new Promise(r => setTimeout(r, 200));
    }

    console.log(`\n📊 RESULTS: ${successCount}/${selectedHorses.length} posts created`);
}

main().catch(console.error);
