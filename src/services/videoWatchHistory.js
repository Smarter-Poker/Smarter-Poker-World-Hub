/**
 * Video Watch History Service
 * Tracks videos the user has watched
 */

import { supabase } from '../lib/supabase';

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

/**
 * Update watch duration for a video
 * Adds the new duration to the existing duration (cumulative)
 */
export async function updateWatchDuration(userId, videoId, additionalSeconds, videoData = {}) {
    // Check if already exists
    const { data: existing } = await supabase
        .from('video_watch_history')
        .select('id, watch_duration_seconds')
        .eq('user_id', userId)
        .eq('video_id', videoId)
        .single();

    if (existing) {
        // Update with additional duration
        const newDuration = (existing.watch_duration_seconds || 0) + additionalSeconds;
        const { data, error } = await supabase
            .from('video_watch_history')
            .update({
                watch_duration_seconds: newDuration,
                watched_at: new Date().toISOString()
            })
            .eq('id', existing.id)
            .select()
            .single();

        if (error) {
            console.error('Error updating watch duration:', error);
            throw error;
        }

        return data;
    }

    // Insert new record with duration
    const { data, error } = await supabase
        .from('video_watch_history')
        .insert({
            user_id: userId,
            video_id: videoId,
            video_title: videoData.title || null,
            video_url: videoData.url || null,
            thumbnail_url: videoData.thumbnail || null,
            watch_duration_seconds: additionalSeconds
        })
        .select()
        .single();

    if (error) {
        console.error('Error adding watch duration:', error);
        throw error;
    }

    return data;
}

/**
 * Get videos watched for at least minDuration seconds
 * Returns a Set of video IDs that meet the threshold
 */
export async function getWatchedVideos(userId, minDuration = 60) {
    const { data, error } = await supabase
        .from('video_watch_history')
        .select('video_id, watch_duration_seconds')
        .eq('user_id', userId)
        .gte('watch_duration_seconds', minDuration);

    if (error) {
        console.error('Error fetching watched videos:', error);
        return new Set();
    }

    return new Set((data || []).map(v => v.video_id));
}
