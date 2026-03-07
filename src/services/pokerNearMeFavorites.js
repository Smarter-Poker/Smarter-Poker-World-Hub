/**
 * Poker Near Me Favorites Service
 * Manages user's favorite poker venues
 */

import { supabase } from '../lib/supabase';

/**
 * Get all favorite venues for a user
 */
export async function getVenueFavorites(userId) {
    const { data, error } = await supabase
        .from('poker_near_me_favorites')
        .select('*')
        .eq('user_id', userId)
        .order('created_at', { ascending: false });

    if (error) {
        console.error('Error fetching venue favorites:', error);
        throw error;
    }

    return data || [];
}

/**
 * Add a venue to favorites
 */
export async function addVenueFavorite(userId, venueId, venueData = {}) {
    const { data, error } = await supabase
        .from('poker_near_me_favorites')
        .insert({
            user_id: userId,
            venue_id: venueId,
            venue_name: venueData.name || null,
            venue_address: venueData.address || null,
            venue_city: venueData.city || null,
            venue_state: venueData.state || null
        })
        .select()
        .maybeSingle();

    if (error) {
        console.error('Error adding venue favorite:', error);
        throw error;
    }

    return data;
}

/**
 * Remove a venue from favorites
 */
export async function removeVenueFavorite(userId, venueId) {
    const { error } = await supabase
        .from('poker_near_me_favorites')
        .delete()
        .eq('user_id', userId)
        .eq('venue_id', venueId);

    if (error) {
        console.error('Error removing venue favorite:', error);
        throw error;
    }

    return true;
}

/**
 * Check if a venue is favorited
 */
export async function isVenueFavorited(userId, venueId) {
    const { data, error } = await supabase
        .from('poker_near_me_favorites')
        .select('id')
        .eq('user_id', userId)
        .eq('venue_id', venueId)
        .maybeSingle();

    if (error && error.code !== 'PGRST116') {
        console.error('Error checking venue favorite:', error);
        throw error;
    }

    return !!data;
}
