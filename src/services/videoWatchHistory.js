/**
 * Video Watch History Service
 * Tracks videos the user has watched
 */

import { supabase } from '../lib/supabaseClient';

/**
 * Get watch history for a user
 */
export async function getWatchHistory(userId, limit = 50) {
    const { data, error } = await supabase
        .from('video_watch_history')
        .select('*')
        .eq('user_id', userId)
        .order('watched_at', { ascending: false })
        .limit(limit);

    if (error) {
        console.error('Error fetching watch history:', error);
        throw error;
    }

    return data || [];
}

/**
 * Add a video to watch history
 */
export async function addToWatchHistory(userId, videoId, videoData = {}) {
    // Check if already exists
    const { data: existing } = await supabase
        .from('video_watch_history')
        .select('id')
        .eq('user_id', userId)
        .eq('video_id', videoId)
        .single();

    if (existing) {
        // Update watched_at timestamp
        const { data, error } = await supabase
            .from('video_watch_history')
            .update({ watched_at: new Date().toISOString() })
            .eq('id', existing.id)
            .select()
            .single();

        if (error) {
            console.error('Error updating watch history:', error);
            throw error;
        }

        return data;
    }

    // Insert new record
    const { data, error } = await supabase
        .from('video_watch_history')
        .insert({
            user_id: userId,
            video_id: videoId,
            video_title: videoData.title || null,
            video_url: videoData.url || null,
            thumbnail_url: videoData.thumbnail || null
        })
        .select()
        .single();

    if (error) {
        console.error('Error adding to watch history:', error);
        throw error;
    }

    return data;
}

/**
 * Clear watch history
 */
export async function clearWatchHistory(userId) {
    const { error } = await supabase
        .from('video_watch_history')
        .delete()
        .eq('user_id', userId);

    if (error) {
        console.error('Error clearing watch history:', error);
        throw error;
    }

    return true;
}
