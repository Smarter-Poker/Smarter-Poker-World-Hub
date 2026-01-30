/**
 * 🐴 INDIVIDUAL HORSE CRON - One Horse, One Post
 * 
 * Each horse gets their own cron trigger via /api/cron/horse/[horseIndex]
 * horseIndex = 0-99 (maps to the 100 horses)
 * 
 * Call with: /api/cron/horse/0, /api/cron/horse/1, ... /api/cron/horse/99
 */

import { createClient } from '@supabase/supabase-js';
import { getGrokClient } from '../../../../src/lib/grokClient.js';
import { applyWritingStyle } from '../../../../src/content-engine/pipeline/HorseScheduler.js';
import * as ClipDeduplicationService from '../../../../src/services/ClipDeduplicationService.js';

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
    const { horseIndex } = req.query;
    const index = parseInt(horseIndex, 10);

    if (isNaN(index) || index < 0 || index > 99) {
        return res.status(400).json({ error: 'horseIndex must be 0-99' });
    }

    try {
        console.log(`\n🐴 INDIVIDUAL HORSE CRON: Horse #${index}`);

        // Get all active horses ordered by profile_id for consistent indexing
        const { data: horses, error: horseError } = await supabase
            .from('content_authors')
            .select('*')
            .eq('is_active', true)
            .not('profile_id', 'is', null)
            .order('profile_id');

        if (horseError || !horses?.length) {
            return res.status(200).json({ success: false, error: 'No horses found' });
        }

        // Get the specific horse by index
        if (index >= horses.length) {
            return res.status(200).json({
                success: true,
                message: `Horse index ${index} exceeds available horses (${horses.length})`,
                posted: 0
            });
        }

        const horse = horses[index];
        console.log(`   🎯 Processing: ${horse.name} (${horse.alias})`);

        // Get a random unused clip from the database
        const { data: clips, error: clipError } = await supabase
            .from('poker_clips')
            .select('*')
            .eq('is_active', true)
            .order('last_used_at', { ascending: true, nullsFirst: true })
            .limit(10);

        if (!clips?.length) {
            // Try sports clips as fallback
            const { data: sportsClips } = await supabase
                .from('sports_clips')
                .select('*')
                .order('last_used_at', { ascending: true, nullsFirst: true })
                .limit(10);

            if (!sportsClips?.length) {
                return res.status(200).json({
                    success: false,
                    error: 'No clips available',
                    horse: horse.name
                });
            }
        }

        // Pick a random clip from the least-used ones
        const availableClips = clips || [];
        const clip = availableClips[Math.floor(Math.random() * Math.min(5, availableClips.length))];

        if (!clip) {
            return res.status(200).json({ success: false, error: 'No clip selected' });
        }

        // Reserve the clip for this horse
        const reserved = await ClipDeduplicationService.markClipAsPosted({
            videoId: clip.video_id,
            sourceUrl: clip.source_url,
            clipSource: clip.source || 'poker_clips',
            horseId: horse.profile_id
        });

        if (!reserved) {
            console.log(`   ⚠️ Clip already reserved, skipping`);
            return res.status(200).json({
                success: true,
                message: 'Clip already used',
                horse: horse.name
            });
        }

        // Generate caption
        let caption = '';
        try {
            const response = await grok.chat.completions.create({
                model: 'grok-3-mini',
                messages: [{
                    role: 'user',
                    content: `Write a very short, casual social media caption (under 100 chars) for this poker video: "${clip.title}". Be natural, use slang. No hashtags.`
                }],
                max_tokens: 50
            });
            caption = response.choices[0]?.message?.content?.trim() || clip.title;
        } catch (e) {
            caption = clip.title?.slice(0, 80) || 'Check this out 🔥';
        }

        // Apply horse's unique writing style
        caption = applyWritingStyle(caption, horse.profile_id);

        // Create the post
        const { data: post, error: postError } = await supabase
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
                    clip_source: clip.source,
                    posted_by_cron: 'individual-horse',
                    horse_index: index
                }
            })
            .select()
            .single();

        if (postError) {
            console.error(`   ❌ Post error:`, postError);
            return res.status(500).json({ success: false, error: postError.message });
        }

        // Update clip's last_used_at
        await supabase
            .from('poker_clips')
            .update({ last_used_at: new Date().toISOString() })
            .eq('id', clip.id);

        console.log(`   ✅ Posted! ID: ${post.id}`);

        return res.status(200).json({
            success: true,
            horse: horse.name,
            horseIndex: index,
            postId: post.id,
            caption: caption.slice(0, 50) + '...',
            clipTitle: clip.title?.slice(0, 50)
        });

    } catch (error) {
        console.error('Individual horse cron error:', error);
        return res.status(500).json({
            success: false,
            error: error.message,
            horseIndex: index
        });
    }
}
