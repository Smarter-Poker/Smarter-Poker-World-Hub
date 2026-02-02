/**
 * DEBUG: Seed video posts for Reels testing
 * Creates sample video posts from horse profiles
 */

import { createClient } from '@supabase/supabase-js';
import { CLIP_LIBRARY } from '../../../src/content-engine/pipeline/ClipLibrary.js';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

export default async function handler(req, res) {
    try {
        // Get some horse profiles
        const { data: horses, error: horsesError } = await supabase
            .from('profiles')
            .select('id, username, full_name, avatar_url')
            .eq('is_horse', true)
            .limit(10);

        if (horsesError) {
            return res.status(500).json({ error: 'Failed to get horses', details: horsesError });
        }

        if (!horses || horses.length === 0) {
            return res.status(404).json({ error: 'No horse profiles found' });
        }

        // Check existing video posts
        const { data: existingVideos, error: checkError } = await supabase
            .from('social_posts')
            .select('id, content_type, media_urls')
            .eq('content_type', 'video')
            .limit(10);

        // Get 10 random clips from library
        const shuffledClips = [...CLIP_LIBRARY].sort(() => Math.random() - 0.5).slice(0, 10);

        // Create video posts
        const posts = [];
        for (let i = 0; i < shuffledClips.length; i++) {
            const clip = shuffledClips[i];
            const horse = horses[i % horses.length];

            const { data: post, error: postError } = await supabase
                .from('social_posts')
                .insert({
                    author_id: horse.id,
                    content: `🎬 ${clip.title}`,
                    content_type: 'video',
                    media_urls: [clip.source_url],
                    visibility: 'public',
                    metadata: {
                        clip_id: clip.id,
                        source: clip.source || 'unknown'
                    }
                })
                .select('id')
                .single();

            if (post) {
                posts.push({ id: post.id, horse: horse.username, clip: clip.title });
            } else if (postError) {
                posts.push({ error: postError.message, horse: horse.username });
            }
        }

        return res.status(200).json({
            success: true,
            horses_found: horses.length,
            existing_videos: existingVideos?.length || 0,
            clips_seeded: posts.filter(p => p.id).length,
            posts
        });

    } catch (error) {
        return res.status(500).json({ error: error.message });
    }
}
