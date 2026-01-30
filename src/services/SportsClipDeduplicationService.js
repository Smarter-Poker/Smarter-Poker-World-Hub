/**
 * SPORTS CLIP DEDUPLICATION SERVICE
 * ═══════════════════════════════════════════════════════════════════════════
 * 
 * Mirrors the ClipDeduplicationService.js for poker clips.
 * Prevents duplicate sports clips from being posted by multiple horses.
 * 
 * Uses atomic database operations to ensure thread-safe clip reservation.
 * ═══════════════════════════════════════════════════════════════════════════
 */

import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

/**
 * Check if a sports clip has already been posted (globally)
 * @param {string} videoId - YouTube video ID
 * @returns {Promise<boolean>} - True if clip already posted
 */
export async function isSportsClipAlreadyPosted(videoId) {
    try {
        const { data, error } = await supabase
            .from('posted_sports_clips')
            .select('id')
            .eq('video_id', videoId)
            .single();

        if (error && error.code !== 'PGRST116') {
            console.error('Error checking sports clip:', error);
            return false;
        }

        return !!data;
    } catch (error) {
        console.error('Exception checking sports clip:', error);
        return false;
    }
}

/**
 * Atomically reserve a sports clip for a horse
 * Uses RPC function with ON CONFLICT to prevent race conditions
 * 
 * @param {Object} clipData - Clip information
 * @param {string} clipData.videoId - YouTube video ID
 * @param {string} clipData.sourceUrl - Full YouTube URL
 * @param {string} clipData.clipSource - Source name (ESPN, NBA, etc.)
 * @param {string} clipData.horseId - Horse profile ID
 * @returns {Promise<Object|false>} - Clip object if reserved, false if already taken
 */
export async function markSportsClipAsPosted(clipData) {
    const { videoId, sourceUrl, clipSource, horseId } = clipData;

    try {
        // Use RPC function which implements ON CONFLICT at database level
        // This is truly atomic - the database handles the race condition
        const { data, error } = await supabase.rpc('reserve_sports_clip', {
            p_video_id: videoId,
            p_source_url: sourceUrl,
            p_clip_source: clipSource,
            p_horse_id: horseId
        });

        if (error) {
            console.error('Error calling reserve_sports_clip RPC:', error);
            return false;
        }

        // RPC returns array with single row: { success: boolean, clip_id: uuid }
        if (!data || data.length === 0 || !data[0].success) {
            console.log(`   🔒 Sports clip ${videoId} already reserved by another horse`);
            return false;
        }

        console.log(`   ✅ Sports clip ${videoId} successfully reserved (ID: ${data[0].clip_id})`);
        return { id: data[0].clip_id };
    } catch (error) {
        console.error('Exception calling reserve_sports_clip RPC:', error);
        return false;
    }
}

/**
 * Get recently posted sports clips
 * @param {number} days - Number of days to look back (default 30)
 * @returns {Promise<Array>} - Array of recently posted clips
 */
export async function getRecentlyPostedSportsClips(days = 30) {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - days);

    const { data, error } = await supabase
        .from('posted_sports_clips')
        .select('video_id, clip_source, sport_type, posted_at')
        .gte('posted_at', cutoffDate.toISOString())
        .order('posted_at', { ascending: false });

    if (error) {
        console.error('Error fetching recent sports clips:', error);
        return [];
    }

    return data || [];
}

/**
 * Get sports source assignments for a horse
 * @param {string} horseId - Horse profile ID
 * @returns {Promise<Array>} - Array of assigned source names
 */
export async function getHorseSportsSources(horseId) {
    try {
        const { data, error } = await supabase
            .from('horse_sports_source_assignments')
            .select('source_name, is_primary')
            .eq('horse_id', horseId)
            .order('is_primary', { ascending: false });

        if (error) {
            console.error('Error fetching horse sports sources:', error);
            return [];
        }

        return data || [];
    } catch (error) {
        console.error('Exception fetching horse sports sources:', error);
        return [];
    }
}

/**
 * Get available sports clips for a horse based on their assigned sources
 * @param {string} horseId - Horse profile ID
 * @param {Array} excludeIds - Clip IDs to exclude
 * @returns {Promise<Array>} - Array of available clips
 */
export async function getAvailableSportsClipsForHorse(horseId, excludeIds = []) {
    try {
        // Get horse's assigned sources
        const sources = await getHorseSportsSources(horseId);

        if (!sources || sources.length === 0) {
            console.log(`   ⚠️ No sports sources assigned to horse ${horseId}`);
            return [];
        }

        const sourceNames = sources.map(s => s.source_name);
        console.log(`   📺 Horse assigned to sports sources: ${sourceNames.join(', ')}`);

        // Get clips from assigned sources
        let query = supabase
            .from('sports_clips')
            .select('*')
            .in('source', sourceNames);

        if (excludeIds.length > 0) {
            query = query.not('id', 'in', `(${excludeIds.join(',')})`);
        }

        const { data: clips, error } = await query
            .order('created_at', { ascending: false })
            .limit(100);

        if (error) {
            console.error('Error fetching sports clips:', error);
            return [];
        }

        // Filter out already posted clips
        const recentlyPosted = await getRecentlyPostedSportsClips(365);
        const postedVideoIds = new Set(recentlyPosted.map(c => c.video_id));

        const availableClips = clips.filter(clip => !postedVideoIds.has(clip.video_id));

        console.log(`   📊 Found ${availableClips.length} available sports clips (${clips.length} total, ${postedVideoIds.size} already posted)`);

        return availableClips;
    } catch (error) {
        console.error('Exception getting available sports clips:', error);
        return [];
    }
}

export default {
    isSportsClipAlreadyPosted,
    markSportsClipAsPosted,
    getRecentlyPostedSportsClips,
    getHorseSportsSources,
    getAvailableSportsClipsForHorse
};
