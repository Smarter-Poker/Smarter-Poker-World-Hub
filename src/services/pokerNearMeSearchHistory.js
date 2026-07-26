/**
 * Poker Near Me Search History Service
 * Tracks user's search history for poker venues
 */

import { supabase } from '../lib/supabase';

/**
 * Search history is only persisted for real (authenticated) users.
 * Anonymous ids ('anon-...') are not UUIDs and make PostgREST throw 22P02,
 * so they are short-circuited here the same way the favorites service does.
 */
function canPersist(userId) {
    return !!userId && !String(userId).startsWith('anon-');
}

/**
 * Get search history for a user
 */
export async function getSearchHistory(userId, limit = 20) {
    if (!canPersist(userId)) return [];

    const { data, error } = await supabase
        .from('poker_near_me_search_history')
        .select('*')
        .eq('user_id', userId)
        .order('searched_at', { ascending: false })
        .limit(limit);

    if (error) {
        console.warn('Error fetching search history:', error);
        throw error;
    }

    return data || [];
}

/**
 * Add a search query to history
 * @param {string} userId - User ID
 * @param {string} searchQuery - Raw search text
 * @param {Object} searchData - Optional context ({ type, location, filters })
 */
export async function addSearchHistory(userId, searchQuery, searchData = {}) {
    if (!canPersist(userId) || !searchQuery) return null;

    const query = String(searchQuery).trim();
    if (!query) return null;

    // poker_near_me_search_history has no UNIQUE(user_id, search_query) index,
    // so ON CONFLICT (i.e. .upsert with onConflict) is rejected by Postgres with
    // 42P10 on every call. De-duplicate client-side instead: drop any previous
    // row for this exact query, then insert a fresh one. Both DELETE and INSERT
    // are covered by the table's existing RLS policies (there is no UPDATE policy).
    const { error: deleteError } = await supabase
        .from('poker_near_me_search_history')
        .delete()
        .eq('user_id', userId)
        .eq('search_query', query);

    if (deleteError) {
        // Non-fatal: worst case we end up with a duplicate row.
        console.warn('Error de-duplicating search history:', deleteError);
    }

    const { data, error } = await supabase
        .from('poker_near_me_search_history')
        .insert({
            user_id: userId,
            search_query: query,
            search_type: searchData?.type || searchData?.search_type || null,
            searched_at: new Date().toISOString()
        })
        .select()
        .maybeSingle();

    if (error) {
        console.warn('Error adding search history:', error);
        throw error;
    }

    return data || null;
}

/**
 * Clear search history
 */
export async function clearSearchHistory(userId) {
    if (!canPersist(userId)) return true;

    const { error } = await supabase
        .from('poker_near_me_search_history')
        .delete()
        .eq('user_id', userId);

    if (error) {
        console.warn('Error clearing search history:', error);
        throw error;
    }

    return true;
}

/**
 * Remove a specific search from history
 */
export async function removeSearchHistory(userId, searchId) {
    if (!canPersist(userId) || !searchId) return true;

    const { error } = await supabase
        .from('poker_near_me_search_history')
        .delete()
        .eq('user_id', userId)
        .eq('id', searchId);

    if (error) {
        console.warn('Error removing search history:', error);
        throw error;
    }

    return true;
}
