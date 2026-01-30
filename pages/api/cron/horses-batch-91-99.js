/**
 * 🐴 BATCH HORSE CRON - Handles horses 91-99 (remaining 9 horses)
 * 
 * Since we hit the 100 cron limit, this handles the last 9 horses together
 */

import { createClient } from '@supabase/supabase-js';
import { getGrokClient } from '../../../src/lib/grokClient.js';
import { applyWritingStyle } from '../../../src/content-engine/pipeline/HorseScheduler.js';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);
const grok = getGrokClient();

function extractVideoIdFromUrl(url) {
    if (!url) return null;
    const patterns = [
        /(?:youtube\.com\/watch\?v=|youtu\.be\/)([a-zA-Z0-9_-]{11})/,
        /youtube\.com\/shorts\/([a-zA-Z0-9_-]{11})/,
        /youtube\.com\/embed\/([a-zA-Z0-9_-]{11})/
    ];
    for (const pattern of patterns) {
        const match = url.match(pattern);
        if (match) return match[1];
    }
    return null;
}

function convertToEmbedUrl(url) {
    if (!url) return url;
    const videoId = extractVideoIdFromUrl(url);
    if (!videoId) return url;
    return `https://www.youtube.com/embed/${videoId}`;
}

export default async function handler(req, res) {
    try {
        console.log(`\n🐴 BATCH HORSE CRON: Horses 91-99`);

        // Get all active horses ordered by profile_id
        const { data: horses } = await supabase
            .from('content_authors')
            .select('*')
            .eq('is_active', true)
            .not('profile_id', 'is', null)
            .order('profile_id');

        if (!horses?.length) {
            return res.status(200).json({ success: false, error: 'No horses found' });
        }

        // Get horses 90-99 (last 10 horses)
        const batchHorses = horses.slice(90, 100);
        const results = [];

        for (const horse of batchHorses) {
            console.log(`   🎯 Processing: ${horse.name}`);

            // Get a clip
            const { data: clips } = await supabase
                .from('poker_clips')
                .select('*')
                .eq('is_active', true)
                .order('last_used_at', { ascending: true, nullsFirst: true })
                .limit(20);

            if (!clips?.length) continue;

            const clip = clips[Math.floor(Math.random() * Math.min(10, clips.length))];
            if (!clip) continue;

            // Generate caption
            let caption = clip.title?.slice(0, 80) || 'Check this 🔥';
            caption = applyWritingStyle(caption, horse.profile_id);

            // Create post
            const { data: post, error } = await supabase
                .from('social_posts')
                .insert({
                    author_id: horse.profile_id,
                    content: caption,
                    content_type: 'video',
                    media_urls: [convertToEmbedUrl(clip.source_url)],
                    visibility: 'public',
                    metadata: {
                        clip_id: clip.id,
                        source_video_id: clip.video_id,
                        posted_by_cron: 'batch-91-99'
                    }
                })
                .select()
                .single();

            if (!error) {
                results.push({ horse: horse.name, postId: post.id });
                await supabase.from('poker_clips').update({ last_used_at: new Date().toISOString() }).eq('id', clip.id);
            }
        }

        return res.status(200).json({
            success: true,
            posted: results.length,
            horses: results.map(r => r.horse)
        });

    } catch (error) {
        console.error('Batch horse cron error:', error);
        return res.status(500).json({ success: false, error: error.message });
    }
}
