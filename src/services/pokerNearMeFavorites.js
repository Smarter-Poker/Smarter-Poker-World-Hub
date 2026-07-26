/**
 * Poker Near Me Favorites Service
 * Manages user's favorite poker venues
 */

import { supabase } from '../lib/supabase';
import { busEmit } from '../engine/EventBus';

/**
 * Get all favorite venues for a user
 */
export async function getVenueFavorites(userId) {
    if (!userId || String(userId).startsWith('anon-')) return [];

    const { data, error } = await supabase
        .from('poker_near_me_favorites')
        .select('*')
        .eq('user_id', userId)
        .order('created_at', { ascending: false });

    if (error) {
        console.warn('Error fetching venue favorites:', error);
        throw error;
    }

    return data || [];
}

/**
 * Add a venue to favorites
 */
export async function addVenueFavorite(userId, venueId, venueData = {}) {
    if (!userId || !venueId) return null;

    if (String(userId).startsWith('anon-')) {
        // Broadcast update globally for anonymous users (relies on localStorage exclusively)
        busEmit.venueSaved(venueId, venueData.name || null);
        return null;
    }

    // ignoreDuplicates makes the conflict arm DO NOTHING instead of DO UPDATE.
    // poker_near_me_favorites has SELECT/INSERT/DELETE RLS policies but no UPDATE
    // policy, so a DO UPDATE on an already-favorited venue (double-tap, stale UI,
    // second tab/device) would fail with 42501 and make the caller roll the heart
    // back even though the row exists. DO NOTHING returns zero rows instead.
    const { data, error } = await supabase
        .from('poker_near_me_favorites')
        .upsert({
            user_id: userId,
            venue_id: venueId,
            venue_name: venueData.name || null
        }, { onConflict: 'user_id,venue_id', ignoreDuplicates: true })
        .select()
        .maybeSingle();

    if (error) {
        console.warn('Error adding venue favorite:', error);
        throw error;
    }

    // Broadcast update globally
    busEmit.venueSaved(venueId, venueData.name || null);

    return data || null;
}

/**
 * Remove a venue from favorites
 */
export async function removeVenueFavorite(userId, venueId) {
    if (!userId || !venueId) return false;

    if (String(userId).startsWith('anon-')) {
        busEmit.venueUnsaved(venueId);
        return true;
    }

    const { error } = await supabase
        .from('poker_near_me_favorites')
        .delete()
        .eq('user_id', userId)
        .eq('venue_id', venueId);

    if (error) {
        console.warn('Error removing venue favorite:', error);
        throw error;
    }

    // Broadcast update globally
    busEmit.venueUnsaved(venueId);

    return true;
}

/**
 * Check if a venue is favorited
 */
export async function isVenueFavorited(userId, venueId) {
    if (!userId || !venueId) return false;

    if (String(userId).startsWith('anon-')) return false;

    const { data, error } = await supabase
        .from('poker_near_me_favorites')
        .select('id')
        .eq('user_id', userId)
        .eq('venue_id', venueId)
        .maybeSingle();

    if (error && error.code !== 'PGRST116') {
        console.warn('Error checking venue favorite:', error);
        throw error;
    }

    return !!data;
}
