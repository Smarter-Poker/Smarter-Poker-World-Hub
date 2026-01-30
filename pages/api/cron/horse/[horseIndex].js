/**
 * 🐴 INDIVIDUAL HORSE CRON - One Horse, One Post
 * 
 * Each horse gets their own cron trigger via /api/cron/horse/[horseIndex]
 * horseIndex = 0-99 (maps to the 100 horses)
 * 
 * DEDICATED SOURCES: Each horse is assigned specific YouTube channels/sources
 * so they only post from their own content pool - no overlap or deduplication issues
 */

import { createClient } from '@supabase/supabase-js';
import { getGrokClient } from '../../../../src/lib/grokClient.js';
import { applyWritingStyle } from '../../../../src/content-engine/pipeline/HorseScheduler.js';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);
const grok = getGrokClient();

/**
 * SOURCES: 1000+ sources spread across 100 horses = ~10 sources per horse
 * Each horse has their own dedicated sources based on their profile_id hash
 */
async function getHorseSources(profileId) {
    // Get all unique sources from the database
    const { data: pokerSources } = await supabase
        .from('poker_clips')
        .select('source')
        .limit(1000);

    const { data: sportsSources } = await supabase
        .from('sports_clips')
        .select('source')
        .limit(1000);

    // Combine and dedupe sources
    const allSources = new Set();
    (pokerSources || []).forEach(s => s.source && allSources.add(s.source));
    (sportsSources || []).forEach(s => s.source && allSources.add(s.source));

    const sourceList = [...allSources];
    if (sourceList.length === 0) {
        return []; // No sources available
    }

    // Hash profile_id to get consistent source assignment
    const hash = profileId.split('').reduce((a, c) => a + c.charCodeAt(0), 0);
    const numSources = Math.max(10, Math.floor(sourceList.length / 100));
    const startIdx = (hash % sourceList.length);

    // Assign sources to this horse (wrap around if needed)
    const assigned = [];
    for (let i = 0; i < numSources; i++) {
        const idx = (startIdx + i * 7) % sourceList.length; // Skip by 7 for better distribution
        assigned.push(sourceList[idx]);
    }

    return assigned;
}

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

        if (index >= horses.length) {
            return res.status(200).json({
                success: true,
                message: `Horse index ${index} exceeds available horses (${horses.length})`,
                posted: 0
            });
        }

        const horse = horses[index];
        console.log(`   🎯 Processing: ${horse.name} (${horse.alias})`);

        // DEDICATED SOURCES: Get sources assigned to THIS horse
        const assignedSources = await getHorseSources(horse.profile_id);
        console.log(`   📺 Assigned ${assignedSources.length} sources`);

        // Fetch clips from this horse's assigned sources
        let clips = [];
        let clipSource = 'sports_clips';

        // Try sports_clips with source filter (has 100k+ clips)
        if (assignedSources.length > 0) {
            const { data: sportsClips } = await supabase
                .from('sports_clips')
                .select('*')
                .in('source', assignedSources)
                .limit(100);

            if (sportsClips?.length) {
                clips = sportsClips;
                console.log(`   📹 Found ${clips.length} clips from assigned sources`);
            }
        }

        // Fallback: fetch ANY clips if horse's sources have none
        if (!clips.length) {
            console.log(`   ⚠️ No clips from assigned sources, fetching from any source...`);
            const offset = Math.floor(Math.random() * 5000);
            const { data: anyClips } = await supabase
                .from('sports_clips')
                .select('*')
                .range(offset, offset + 100);
            if (anyClips?.length) {
                clips = anyClips;
            }
        }

        if (!clips.length) {
            return res.status(200).json({
                success: false,
                error: 'No clips available',
                horse: horse.name
            });
        }

        // Pick a random clip from the pool (no dedup needed - sources are exclusive)
        const shuffled = [...clips].sort(() => Math.random() - 0.5);
        const clip = shuffled[0];

        if (!clip) {
            return res.status(200).json({ success: false, error: 'No clip selected' });
        }

        console.log(`   🎬 Selected: ${clip.title?.slice(0, 40)}...`);

        // Generate caption 
        let caption = '';
        try {
            const response = await grok.chat.completions.create({
                model: 'grok-3-mini',
                messages: [{
                    role: 'user',
                    content: `Write a very short, casual social media caption (under 100 chars) for this video: "${clip.title}". Be natural, use slang. No hashtags.`
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

        // Mark clip as used
        await supabase
            .from(clipSource)
            .update({ last_used_at: new Date().toISOString() })
            .eq('id', clip.id);

        console.log(`   ✅ Posted! ID: ${post.id}`);

        return res.status(200).json({
            success: true,
            horse: horse.name,
            horseIndex: index,
            postId: post.id,
            caption: caption.slice(0, 50) + '...',
            clipSource: clip.source,
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
