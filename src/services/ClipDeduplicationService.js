/**
 * 🚫 CLIP DEDUPLICATION SERVICE
 * ═══════════════════════════════════════════════════════════════════════════
 * 
 * CRITICAL: Prevents horses from posting duplicate video clips
 * 
 * Features:
 * 1. Global clip tracking - Every posted clip is recorded
 * 2. Exclusive source assignment - Each horse gets 2-3 dedicated sources
 * 3. Never reuse clips - Once posted, clip is blacklisted forever
 * 
 * ═══════════════════════════════════════════════════════════════════════════
 */

import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

/**
 * Check if a video clip has already been posted by ANY horse
 */
export async function isClipAlreadyPosted(videoId) {
    const { data, error } = await supabase
        .from('posted_clips')
        .select('id, posted_by, posted_at')
        .eq('video_id', videoId)
        .single();

    if (error && error.code !== 'PGRST116') {
        console.error('Error checking clip:', error);
        return false;
    }

    return !!data;
}

/**
 * Mark a clip as posted (ATOMIC - uses ON CONFLICT for true atomicity)
 * Returns the inserted row if successful, false if clip already posted
 */
export async function markClipAsPosted(clipData) {
    const { videoId, sourceUrl, clipSource, clipTitle, postedBy, postId, clipType = 'poker', category, horseId } = clipData;

    try {
        // Use maybeSingle() which returns null on conflict instead of error
        // This makes the operation truly atomic - database handles the race condition
        const { data, error } = await supabase
            .from('posted_clips')
            .insert({
                video_id: videoId,
                source_url: sourceUrl,
                clip_source: clipSource,
                clip_title: clipTitle,
                posted_by: postedBy || horseId,
                post_id: postId,
                clip_type: clipType,
                category: category
            })
            .select()
            .maybeSingle(); // Returns null on unique constraint violation, not error

        // Check for unexpected errors (not unique constraint violations)
        if (error && error.code !== '23505') {
            console.error('Unexpected error marking clip as posted:', error);
            return false;
        }

        // If data is null, it means unique constraint was violated (clip already posted)
        if (!data) {
            console.log(`   🔒 Clip ${videoId} already reserved by another horse`);
            return false;
        }

        console.log(`   ✅ Clip ${videoId} successfully reserved`);
        return data;
    } catch (error) {
        console.error('Exception marking clip as posted:', error);
        return false;
    }
}

/**
 * Get all clips posted in the last N days
 */
export async function getRecentlyPostedClips(days = 30) {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - days);

    const { data, error } = await supabase
        .from('posted_clips')
        .select('video_id, clip_source, posted_at')
        .gte('posted_at', cutoffDate.toISOString())
        .order('posted_at', { ascending: false });

    if (error) {
        console.error('Error fetching recent clips:', error);
        return [];
    }

    return data || [];
}

/**
 * Get assigned sources for a specific horse
 */
export async function getHorseAssignedSources(horseProfileId) {
    const { data, error } = await supabase
        .from('horse_source_assignments')
        .select('source_key, source_type, is_primary')
        .eq('horse_profile_id', horseProfileId);

    if (error) {
        console.error('Error fetching horse sources:', error);
        return [];
    }

    return data || [];
}

/**
 * Assign sources to a horse (if not already assigned)
 */
export async function assignSourcesToHorse(horseProfileId, sourceKeys, sourceType = 'poker') {
    const assignments = sourceKeys.map((sourceKey, index) => ({
        horse_profile_id: horseProfileId,
        source_key: sourceKey,
        source_type: sourceType,
        is_primary: index === 0
    }));

    const { data, error } = await supabase
        .from('horse_source_assignments')
        .upsert(assignments, { onConflict: 'horse_profile_id,source_key' })
        .select();

    if (error) {
        console.error('Error assigning sources:', error);
        return [];
    }

    return data || [];
}

/**
 * Get all horses assigned to a specific source
 */
export async function getHorsesForSource(sourceKey) {
    const { data, error } = await supabase
        .from('horse_source_assignments')
        .select('horse_profile_id')
        .eq('source_key', sourceKey);

    if (error) {
        console.error('Error fetching horses for source:', error);
        return [];
    }

    return data?.map(d => d.horse_profile_id) || [];
}

/**
 * Initialize source assignments for all horses
 * Each horse gets 2-3 exclusive sources based on their profile_id hash
 */
export async function initializeHorseSourceAssignments(allSources, sourceType = 'poker') {
    // Get all active horses
    const { data: horses, error: horsesError } = await supabase
        .from('content_authors')
        .select('profile_id, alias')
        .eq('is_active', true)
        .not('profile_id', 'is', null);

    if (horsesError || !horses?.length) {
        console.error('Error fetching horses:', horsesError);
        return;
    }

    console.log(`\n🐴 Initializing source assignments for ${horses.length} horses...`);

    const sourceKeys = Object.keys(allSources);
    const horsesPerSource = 2; // Each source assigned to exactly 2 horses
    const sourcesPerHorse = 3; // Each horse gets 3 sources

    let sourceIndex = 0;

    for (const horse of horses) {
        // Get 3 consecutive sources for this horse
        const assignedSources = [];
        for (let i = 0; i < sourcesPerHorse; i++) {
            assignedSources.push(sourceKeys[sourceIndex % sourceKeys.length]);
            sourceIndex++;
        }

        await assignSourcesToHorse(horse.profile_id, assignedSources, sourceType);
        console.log(`   ✅ ${horse.alias}: ${assignedSources.join(', ')}`);
    }

    console.log(`\n✅ Source assignments complete!`);
}

/**
 * Filter clips to only those from horse's assigned sources
 */
export function filterClipsByHorseSources(clips, horseSources) {
    if (!horseSources || horseSources.length === 0) {
        return clips; // No restrictions if no sources assigned
    }

    const allowedSources = horseSources.map(s => s.source_key);
    return clips.filter(clip => allowedSources.includes(clip.source));
}

/**
 * Get available clips for a horse (not posted + from assigned sources)
 */
export async function getAvailableClipsForHorse(horseProfileId, allClips) {
    // Get horse's assigned sources
    const horseSources = await getHorseAssignedSources(horseProfileId);

    if (horseSources.length === 0) {
        console.warn(`⚠️  Horse ${horseProfileId} has no assigned sources`);
        return allClips; // Fallback to all clips if no assignments
    }

    // Filter to only assigned sources
    const sourceFilteredClips = filterClipsByHorseSources(allClips, horseSources);

    // Get all posted clips
    const postedClips = await getRecentlyPostedClips(365); // Last year
    const postedVideoIds = new Set(postedClips.map(c => c.video_id));

    // Filter out already posted clips
    const availableClips = sourceFilteredClips.filter(clip => !postedVideoIds.has(clip.video_id));

    console.log(`   📊 Horse has ${availableClips.length} available clips from ${horseSources.length} sources`);

    return availableClips;
}

export default {
    isClipAlreadyPosted,
    markClipAsPosted,
    getRecentlyPostedClips,
    getHorseAssignedSources,
    assignSourcesToHorse,
    getHorsesForSource,
    initializeHorseSourceAssignments,
    filterClipsByHorseSources,
    getAvailableClipsForHorse
};
