/**
 * Video Watch Later Service
 * Manages user's watch later queue
 */

import { supabase } from '../lib/supabase';

/**
 * Get watch later videos for a user
 */
export async function getWatchLater(userId) {
    const { data, error } = await supabase
        .from('video_watch_later')
        .select('*')
        .eq('user_id', userId)
        .order('created_at', { ascending: false });

    if (error) {
        console.error('Error fetching watch later:', error);
        throw error;
    }

    return data || [];
}

/**
 * Add a video to watch later
 */
export async function addToWatchLater(userId, videoId, videoData = {}) {
    const { data, error } = await supabase
        .from('video_watch_later')
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
        console.error('Error adding to watch later:', error);
        throw error;
    }

    return data;
}

/**
 * Remove a video from watch later
 */
export async function removeFromWatchLater(userId, videoId) {
    const { error } = await supabase
        .from('video_watch_later')
        .delete()
        .eq('user_id', userId)
        .eq('video_id', videoId);

    if (error) {
        console.error('Error removing from watch later:', error);
        throw error;
    }

    return true;
}

/**
 * Check if a video is in watch later
 */
export async function isInWatchLater(userId, videoId) {
    const { data, error } = await supabase
        .from('video_watch_later')
        .select('id')
        .eq('user_id', userId)
        .eq('video_id', videoId)
        .maybeSingle();

    if (error && error.code !== 'PGRST116') {
        console.error('Error checking watch later:', error);
        throw error;
    }

    return !!data;
}
