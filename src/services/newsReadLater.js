/**
 * News Read Later Service
 * Manages user's read later queue for news articles
 *
 * NOTE — currently an orphan: no page imports this service yet, although the
 * hamburger menu ships a "Read Later" item pointing at /hub/news?filter=later.
 * Kept (not deleted) so that wiring the feature into pages/hub/news.js only
 * requires mirroring the newsBookmarks pattern. Hardened to the same
 * never-throw contract as newsBookmarks so it can be used fire-and-forget:
 *   - getReadLater        → [] on any failure
 *   - addToReadLater      → inserted/existing row object, or null on failure
 *   - removeFromReadLater → true on success, false on failure
 *   - isInReadLater       → boolean, false on failure
 */

import { supabase } from '../lib/supabase';

/**
 * Get all read later articles for a user
 */
export async function getReadLater(userId) {
    if (!userId) return [];

    try {
        const { data, error } = await supabase
            .from('news_read_later')
            .select('*')
            .eq('user_id', userId)
            .order('created_at', { ascending: false });

        if (error) {
            console.warn('Read later fetch failed (non-critical):', error?.message);
            return [];
        }

        return data || [];
    } catch (error) {
        console.warn('Read later not available:', error?.message);
        return [];
    }
}

/**
 * Add an article to read later (idempotent)
 *
 * Upserts on (user_id, article_id) so repeat taps can't create duplicate rows.
 * Falls back to a plain insert when the table has no matching UNIQUE
 * constraint (42P10), and treats a duplicate-key race (23505) as success.
 */
export async function addToReadLater(userId, articleId, articleData = {}) {
    if (!userId || articleId === undefined || articleId === null) return null;

    const row = {
        user_id: userId,
        article_id: articleId,
        article_title: articleData.title || null,
        article_url: articleData.url || null,
        source: articleData.source || null,
        thumbnail_url: articleData.thumbnail || null
    };

    try {
        let { data, error } = await supabase
            .from('news_read_later')
            .upsert(row, { onConflict: 'user_id,article_id' })
            .select()
            .maybeSingle();

        if (error && error.code === '42P10') {
            // No UNIQUE(user_id, article_id) constraint — fall back to insert.
            ({ data, error } = await supabase
                .from('news_read_later')
                .insert(row)
                .select()
                .maybeSingle());
        }

        if (error) {
            if (error.code === '23505') {
                // Already saved by a concurrent request — treat as success.
                const { data: existing } = await supabase
                    .from('news_read_later')
                    .select('*')
                    .eq('user_id', userId)
                    .eq('article_id', articleId)
                    .limit(1);
                return (existing && existing[0]) || row;
            }
            console.warn('Error adding to read later:', error?.message);
            return null;
        }

        return data || row;
    } catch (error) {
        console.warn('Read later add failed:', error?.message);
        return null;
    }
}

/**
 * Remove an article from read later
 */
export async function removeFromReadLater(userId, articleId) {
    if (!userId || articleId === undefined || articleId === null) return false;

    try {
        const { error } = await supabase
            .from('news_read_later')
            .delete()
            .eq('user_id', userId)
            .eq('article_id', articleId);

        if (error) {
            console.warn('Error removing from read later:', error?.message);
            return false;
        }

        return true;
    } catch (error) {
        console.warn('Read later remove failed:', error?.message);
        return false;
    }
}

/**
 * Check if an article is in read later
 */
export async function isInReadLater(userId, articleId) {
    if (!userId || articleId === undefined || articleId === null) return false;

    try {
        // limit(1) instead of maybeSingle(): stays correct even if legacy
        // duplicate rows exist (maybeSingle errors on >1 row).
        const { data, error } = await supabase
            .from('news_read_later')
            .select('id')
            .eq('user_id', userId)
            .eq('article_id', articleId)
            .limit(1);

        if (error) {
            console.warn('Error checking read later:', error?.message);
            return false;
        }

        return Array.isArray(data) && data.length > 0;
    } catch (error) {
        console.warn('Read later check failed:', error?.message);
        return false;
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// GUEST-SIDE ROW CACHE (additive — the exports above are unchanged)
//
// Shared contract 2 stores the guest queue in localStorage['news_read_later'] as
// a plain JSON array of article ids. That is enough to know WHAT was saved but
// not enough to RENDER it: /hub/news can only draw a saved article it can still
// find in the currently loaded feed, and the feed is now paginated (24 rows per
// page) rather than a single 100-row fetch. So a guest who saved a story from
// /hub/article — or who saved one that has since scrolled out of page 1 — saw
// "N saved for later" in the stats bar and "Nothing saved for later yet" in the
// list at the same time.
//
// This sidecar key holds the same denormalized columns the signed-in
// `news_read_later` table stores, so both surfaces can render a saved article
// offline. The id array remains the source of truth: a row here without a
// matching id is ignored, and nothing here is ever invented — every field comes
// from the article that was on screen when the user saved it.
// ─────────────────────────────────────────────────────────────────────────────

export const READ_LATER_LOCAL_KEY = 'news_read_later';
export const READ_LATER_META_KEY = 'news_read_later_meta';

// Bounded so a long-lived queue cannot grow the localStorage entry without end.
const MAX_LOCAL_META_ROWS = 200;

/** Read the cached rows. Always an array; never throws (SSR-safe). */
export function getLocalReadLaterMeta() {
    if (typeof window === 'undefined') return [];
    try {
        const raw = window.localStorage.getItem(READ_LATER_META_KEY);
        const parsed = raw ? JSON.parse(raw) : [];
        if (!Array.isArray(parsed)) return [];
        return parsed.filter(r => r && typeof r === 'object' && r.article_id !== undefined);
    } catch (error) {
        console.warn('Read later metadata unreadable:', error?.message || error);
        return [];
    }
}

/** Persist the cached rows (newest first, de-duped, capped). Never throws. */
export function saveLocalReadLaterMeta(rows) {
    if (typeof window === 'undefined') return;
    try {
        const seen = new Set();
        const deduped = [];
        for (const row of Array.isArray(rows) ? rows : []) {
            if (!row || row.article_id === undefined || row.article_id === null) continue;
            const key = String(row.article_id);
            if (seen.has(key)) continue;
            seen.add(key);
            deduped.push(row);
            if (deduped.length >= MAX_LOCAL_META_ROWS) break;
        }
        window.localStorage.setItem(READ_LATER_META_KEY, JSON.stringify(deduped));
    } catch (error) {
        console.warn('Read later metadata not persisted:', error?.message || error);
    }
}

/**
 * Build the cached row for an article that is currently on screen.
 * Column names match the `news_read_later` table so the signed-in rows and the
 * guest rows are the same shape at the render site.
 */
export function toLocalReadLaterRow(articleId, article = {}) {
    return {
        article_id: articleId,
        article_title: article.title || null,
        article_url: article.source_url || article.url || null,
        source: article.source_name || article.source || null,
        thumbnail_url: article.image_url || article.thumbnail || null,
        // The article's real publication date, when we have it. Kept distinct
        // from created_at (the time it was SAVED) so a render site never has to
        // pass the save time off as a publish time.
        published_at: article.published_at || null,
        created_at: new Date().toISOString()
    };
}
