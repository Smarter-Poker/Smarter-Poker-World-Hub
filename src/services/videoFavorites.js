/**
 * Video Favorites Service
 * Manages user's favorite videos
 */

import { supabase } from '../lib/supabase';
import { claimReward } from '../lib/claimReward';

/**
 * Get all favorite videos for a user
 */
export async function getVideoFavorites(userId) {
    const { data, error } = await supabase
        .from('video_favorites')
        .select('*')
        .eq('user_id', userId)
        .order('created_at', { ascending: false });

    if (error) {
        console.error('Error fetching video favorites:', error);
        throw error;
    }

    return data || [];
}

/**
 * Add a video to favorites
 */
export async function addVideoFavorite(userId, videoId, videoData = {}) {
    const { data, error } = await supabase
        .from('video_favorites')
        .insert({
            user_id: userId,
            video_id: videoId,
            video_title: videoData.title || null,
            video_url: videoData.url || null,
            thumbnail_url: videoData.thumbnail || null
        })
        .select()
        .maybeSingle();

    if (error) {
        console.error('Error adding video favorite:', error);
        throw error;
    }

    // Award video favorite diamonds (fire-and-forget, 2💎 max 3/day)
    if (userId && videoId) {
        claimReward('/api/rewards/video-favorite', { userId, videoId }, 'Favorited a Video');
    }

    return data || null;
}

/**
 * Remove a video from favorites
 */
export async function removeVideoFavorite(userId, videoId) {
    const { error } = await supabase
        .from('video_favorites')
        .delete()
        .eq('user_id', userId)
        .eq('video_id', videoId);

    if (error) {
        console.error('Error removing video favorite:', error);
        throw error;
    }

    return true;
}

/**
 * Check if a video is favorited
 */
export async function isVideoFavorited(userId, videoId) {
    const { data, error } = await supabase
        .from('video_favorites')
        .select('id')
        .eq('user_id', userId)
        .eq('video_id', videoId)
        .maybeSingle();

    if (error && error.code !== 'PGRST116') { // PGRST116 = no rows returned
        console.error('Error checking video favorite:', error);
        throw error;
    }

    return !!data;
}
