/**
 * Poker Near Me Search History Service
 * Tracks user's search history for poker venues
 */

import { supabase } from '../lib/supabase';

/**
 * Get search history for a user
 */
export async function getSearchHistory(userId, limit = 20) {
    const { data, error } = await supabase
        .from('poker_near_me_search_history')
        .select('*')
        .eq('user_id', userId)
        .order('searched_at', { ascending: false })
        .limit(limit);

    if (error) {
        console.error('Error fetching search history:', error);
        throw error;
    }

    return data || [];
}

/**
 * Add a search query to history
 */
export async function addSearchHistory(userId, searchQuery, searchData = {}) {
    // Check if query already exists
    const { data: existing } = await supabase
        .from('poker_near_me_search_history')
        .select('id')
        .eq('user_id', userId)
        .eq('search_query', searchQuery)
        .maybeSingle();

    if (existing) {
        // Update searched_at timestamp
        const { data, error } = await supabase
            .from('poker_near_me_search_history')
            .update({ searched_at: new Date().toISOString() })
            .eq('id', existing.id)
            .select()
            .maybeSingle();

        if (error) {
            console.error('Error updating search history:', error);
            throw error;
        }

        return data;
    }

    // Insert new record
    const { data, error } = await supabase
        .from('poker_near_me_search_history')
        .insert({
            user_id: userId,
            search_query: searchQuery,
            location: searchData.location || null,
            filters: searchData.filters || null
        })
        .select()
        .maybeSingle();

    if (error) {
        console.error('Error adding search history:', error);
        throw error;
    }

    return data;
}

/**
 * Clear search history
 */
export async function clearSearchHistory(userId) {
    const { error } = await supabase
        .from('poker_near_me_search_history')
        .delete()
        .eq('user_id', userId);

    if (error) {
        console.error('Error clearing search history:', error);
        throw error;
    }

    return true;
}

/**
 * Remove a specific search from history
 */
export async function removeSearchHistory(userId, searchId) {
    const { error } = await supabase
        .from('poker_near_me_search_history')
        .delete()
        .eq('user_id', userId)
        .eq('id', searchId);

    if (error) {
        console.error('Error removing search history:', error);
        throw error;
    }

    return true;
}
