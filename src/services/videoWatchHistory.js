/**
 * Video Watch History Service
 * Tracks videos the user has watched
 */

import { supabase } from '../lib/supabase';
import { claimReward } from '../lib/claimReward';
import { getAccessToken } from '../lib/authUtils';

// Track which videos already triggered a reward this session (avoids duplicate API calls)
const terminalRewardClaims = new Set();
const rewardClaimsInFlight = new Set();

async function claimEligibleWatchReward(userId, videoId) {
    const claimKey = `${userId}:${videoId}`;
    if (!userId || terminalRewardClaims.has(claimKey) || rewardClaimsInFlight.has(claimKey)) return;
    rewardClaimsInFlight.add(claimKey);
    try {
        const result = await claimReward(
            '/api/rewards/video-watch',
            { userId, videoId },
            'Watched a Video (5+ min)'
        );
        if (result?.terminal) terminalRewardClaims.add(claimKey);
    } finally {
        rewardClaimsInFlight.delete(claimKey);
    }
}

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
        console.warn('Error fetching watch history:', error);
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
        .maybeSingle();

    if (existing) {
        // Update watched_at timestamp
        const { data, error } = await supabase
            .from('video_watch_history')
            .update({ watched_at: new Date().toISOString() })
            .eq('id', existing.id)
            .select()
            .maybeSingle();

        if (error) {
            console.warn('Error updating watch history:', error);
            throw error;
        }

        return data || null;
    }

    // Insert new record
    const { data, error } = await supabase
        .from('video_watch_history')
        .insert({
            user_id: userId,
            video_id: videoId,
            video_title: videoData.title || null,
            thumbnail_url: videoData.thumbnail || null
        })
        .select()
        .maybeSingle();

    if (error) {
        console.warn('Error adding to watch history:', error);
        throw error;
    }

    return data || null;
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
        console.warn('Error clearing watch history:', error);
        throw error;
    }

    return true;
}

/**
 * Remove one video from watch history.
 * Used by the library's "Mark as unwatched" control so the change survives
 * refreshes and stays consistent across devices.
 */
export async function removeFromWatchHistory(userId, videoId, aliases = []) {
    const videoIds = [...new Set([videoId, ...aliases].filter(Boolean))];
    const { data, error } = await supabase
        .from('video_watch_history')
        .delete()
        .eq('user_id', userId)
        .in('video_id', videoIds)
        .select('id');

    if (error) {
        console.warn('Error removing video from watch history:', error);
        throw error;
    }

    return true;
}

/**
 * Update watch duration for a video
 * Adds the new duration to the existing duration (cumulative)
 */
export async function updateWatchDuration(userId, videoId, additionalSeconds, videoData = {}) {
    const durationSeconds = Number(videoData.durationSeconds) || null;
    const { data: rpcData, error: rpcError } = await supabase.rpc('record_video_watch_session', {
        p_expected_user_id: userId,
        p_video_id: videoId,
        p_additional_seconds: additionalSeconds,
        p_progress_seconds: Number.isFinite(Number(videoData.progressSeconds))
            ? Math.max(0, Math.floor(Number(videoData.progressSeconds)))
            : null,
        p_video_title: videoData.title || null,
        p_thumbnail_url: videoData.thumbnail || null,
        p_duration_seconds: durationSeconds
    });

    if (rpcError) {
        console.warn('Error recording watch session:', rpcError);
        throw rpcError;
    }
    const result = Array.isArray(rpcData) ? rpcData[0] : rpcData;
    if (Number(result?.watch_duration_seconds || 0) >= 300) {
        void claimEligibleWatchReward(userId, result?.canonical_video_id || videoId);
    }
    return result || null;
}

/**
 * Best-effort persistence for lifecycle events where the page may disappear
 * before a normal async Supabase request settles. fetch keepalive retains the
 * Authorization header (unlike sendBeacon) and the API derives the user from
 * that verified token instead of trusting a body user id.
 */
export async function flushWatchDuration(videoId, additionalSeconds, videoData = {}) {
    const token = getAccessToken();
    if (!token || !videoId || additionalSeconds <= 0) return false;

    const response = await fetch('/api/video-library/watch-progress', {
        method: 'POST',
        keepalive: true,
        headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
            videoId,
            additionalSeconds,
            progressSeconds: Number.isFinite(Number(videoData.progressSeconds))
                ? Math.max(0, Math.floor(Number(videoData.progressSeconds)))
                : null,
            durationSeconds: Number(videoData.durationSeconds) || null,
            title: videoData.title || null,
            thumbnail: videoData.thumbnail || null,
        }),
    });

    if (!response.ok) throw new Error(`Watch progress flush failed (${response.status})`);
    return true;
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
        console.warn('Error fetching watched videos:', error);
        throw error;
    }

    return new Set((data || []).map(v => v.video_id));
}

/**
 * Get watch progress for all videos (for progress bars and continue watching)
 * Returns a Map of videoId -> { watchedSeconds, videoDuration }
 */
export async function getWatchProgress(userId) {
    const { data, error } = await supabase
        .from('video_watch_history')
        .select('video_id, watch_duration_seconds, progress_seconds, duration_seconds, watched_at')
        .eq('user_id', userId)
        .order('watched_at', { ascending: false });

    if (error) {
        console.warn('Error fetching watch progress:', error);
        throw error;
    }

    const progressMap = new Map();
    (data || []).forEach(v => {
        progressMap.set(v.video_id, {
            watchedSeconds: v.progress_seconds || v.watch_duration_seconds || 0,
            totalWatchedSeconds: v.watch_duration_seconds || 0,
            durationSeconds: v.duration_seconds || 0,
            watchedAt: v.watched_at
        });
    });
    return progressMap;
}

/**
 * Get recently watched videos (for Recently Watched carousel)
 * Returns full watch history with video details
 */
export async function getRecentlyWatched(userId, limit = 10) {
    const { data, error } = await supabase
        .from('video_watch_history')
        .select('video_id, video_title, watch_duration_seconds, watched_at')
        .eq('user_id', userId)
        .gt('watch_duration_seconds', 0)
        .order('watched_at', { ascending: false })
        .limit(limit);

    if (error) {
        console.warn('Error fetching recently watched:', error);
        throw error;
    }

    return data || [];
}

/**
 * Get watch statistics for stats dashboard
 * Returns total watch time, videos watched, favorite sources, etc.
 */
export async function getWatchStats(userId) {
    const { data, error } = await supabase
        .from('video_watch_history')
        .select('video_id, watch_duration_seconds, video_title')
        .eq('user_id', userId);

    if (error) {
        console.warn('Error fetching watch stats:', error);
        return {
            totalWatchTimeSeconds: 0,
            totalVideosStarted: 0,
            totalVideosCompleted: 0,
            averageWatchTimeSeconds: 0
        };
    }

    const records = data || [];
    const totalWatchTimeSeconds = records.reduce((sum, r) => sum + (r.watch_duration_seconds || 0), 0);
    const totalVideosStarted = records.length;
    const totalVideosCompleted = records.filter(r => (r.watch_duration_seconds || 0) >= 60).length;
    const averageWatchTimeSeconds = totalVideosStarted > 0
        ? Math.round(totalWatchTimeSeconds / totalVideosStarted)
        : 0;

    return {
        totalWatchTimeSeconds,
        totalVideosStarted,
        totalVideosCompleted,
        averageWatchTimeSeconds
    };
}
