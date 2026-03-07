/**
 * News Read Later Service
 * Manages user's read later queue for news articles
 */

import { supabase } from '../lib/supabase';

/**
 * Get all read later articles for a user
 */
export async function getReadLater(userId) {
    const { data, error } = await supabase
        .from('news_read_later')
        .select('*')
        .eq('user_id', userId)
        .order('created_at', { ascending: false });

    if (error) {
        console.error('Error fetching read later:', error);
        throw error;
    }

    return data || [];
}

/**
 * Add an article to read later
 */
export async function addToReadLater(userId, articleId, articleData = {}) {
    const { data, error } = await supabase
        .from('news_read_later')
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
        console.error('Error adding to read later:', error);
        throw error;
    }

    return data || null;
}

/**
 * Remove an article from read later
 */
export async function removeFromReadLater(userId, articleId) {
    const { error } = await supabase
        .from('news_read_later')
        .delete()
        .eq('user_id', userId)
        .eq('article_id', articleId);

    if (error) {
        console.error('Error removing from read later:', error);
        throw error;
    }

    return true;
}

/**
 * Check if an article is in read later
 */
export async function isInReadLater(userId, articleId) {
    const { data, error } = await supabase
        .from('news_read_later')
        .select('id')
        .eq('user_id', userId)
        .eq('article_id', articleId)
        .maybeSingle();

    if (error && error.code !== 'PGRST116') {
        console.error('Error checking read later:', error);
        throw error;
    }

    return !!data;
}
