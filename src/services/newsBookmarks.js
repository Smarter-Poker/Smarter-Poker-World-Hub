/**
 * News Bookmarks Service
 * Manages user's bookmarked news articles
 */

import { getSupabase } from '../lib/supabase';

/**
 * Get all bookmarked articles for a user
 */
export async function getNewsBookmarks(userId) {
    try {
        const { data, error } = await getSupabase()
            .from('news_bookmarks')
            .select('*')
            .eq('user_id', userId)
            .order('created_at', { ascending: false });

        if (error) {
            console.warn('News bookmarks fetch failed (non-critical):', error?.message);
            return [];
        }

        return data || [];
    } catch (error) {
        console.warn('News bookmarks not available:', error?.message);
        return [];
    }
}

/**
 * Add an article to bookmarks
 */
export async function addNewsBookmark(userId, articleId, articleData = {}) {
    try {
        const { data, error } = await getSupabase()
            .from('news_bookmarks')
            .insert({
                user_id: userId,
                article_id: articleId,
                article_title: articleData.title || null,
                article_url: articleData.url || null,
                source: articleData.source || null,
                thumbnail_url: articleData.thumbnail || null
            })
            .select()
            .maybeSingle();

        if (error) {
            console.warn('Error adding news bookmark:', error?.message);
            return null;
        }

        return data || null;
    } catch (error) {
        console.warn('News bookmark add failed:', error?.message);
        return null;
    }
}

/**
 * Remove an article from bookmarks
 */
export async function removeNewsBookmark(userId, articleId) {
    try {
        const { error } = await getSupabase()
            .from('news_bookmarks')
            .delete()
            .eq('user_id', userId)
            .eq('article_id', articleId);

        if (error) {
            console.warn('Error removing news bookmark:', error?.message);
            return false;
        }

        return true;
    } catch (error) {
        console.warn('News bookmark remove failed:', error?.message);
        return false;
    }
}

/**
 * Check if an article is bookmarked
 */
export async function isArticleBookmarked(userId, articleId) {
    try {
        const { data, error } = await getSupabase()
            .from('news_bookmarks')
            .select('id')
            .eq('user_id', userId)
            .eq('article_id', articleId)
            .maybeSingle();

        if (error && error.code !== 'PGRST116') {
            console.warn('Error checking news bookmark:', error?.message);
            return false;
        }

        return !!data;
    } catch (error) {
        console.warn('News bookmark check failed:', error?.message);
        return false;
    }
}
