/**
 * News Bookmarks Service
 * Manages user's bookmarked news articles
 */

import { supabase } from '../lib/supabase';

/**
 * Get all bookmarked articles for a user
 */
export async function getNewsBookmarks(userId) {
    const { data, error } = await supabase
        .from('news_bookmarks')
        .select('*')
        .eq('user_id', userId)
        .order('created_at', { ascending: false });

    if (error) {
        console.error('Error fetching news bookmarks:', error);
        throw error;
    }

    return data || [];
}

/**
 * Add an article to bookmarks
 */
export async function addNewsBookmark(userId, articleId, articleData = {}) {
    const { data, error } = await supabase
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
        .single();

    if (error) {
        console.error('Error adding news bookmark:', error);
        throw error;
    }

    return data;
}

/**
 * Remove an article from bookmarks
 */
export async function removeNewsBookmark(userId, articleId) {
    const { error } = await supabase
        .from('news_bookmarks')
        .delete()
        .eq('user_id', userId)
        .eq('article_id', articleId);

    if (error) {
        console.error('Error removing news bookmark:', error);
        throw error;
    }

    return true;
}

/**
 * Check if an article is bookmarked
 */
export async function isArticleBookmarked(userId, articleId) {
    const { data, error } = await supabase
        .from('news_bookmarks')
        .select('id')
        .eq('user_id', userId)
        .eq('article_id', articleId)
        .single();

    if (error && error.code !== 'PGRST116') {
        console.error('Error checking news bookmark:', error);
        throw error;
    }

    return !!data;
}
