/**
 * Jarvis Response Cache Utility
 * 
 * Caches Grok/Jarvis API responses to avoid redundant API calls.
 * Reduces costs and improves response times for common queries.
 */


import crypto from 'crypto';

import { supabase } from './supabase';

/**
 * Generate a cache key from request parameters
 */
function generateCacheKey(endpoint, params) {
    const normalizedParams = JSON.stringify(params, Object.keys(params || {}).sort());
    const hash = crypto.createHash('sha256').update(`${endpoint}:${normalizedParams}`).digest('hex');
    return hash.substring(0, 32); // Use first 32 chars
}

/**
 * Check cache for existing response
 * @returns {Object|null} Cached response or null if not found
 */
export async function getCachedResponse(endpoint, params) {
    try {
        const cacheKey = generateCacheKey(endpoint, params);

        const { data, error } = await supabase
            .from('jarvis_response_cache')
            .select('response_data, id')
            .eq('cache_key', cacheKey)
            .gt('expires_at', new Date().toISOString())
            .maybeSingle();

        if (error || !data) {
            return null;
        }

        // Update hit count and last accessed
        supabase
            .from('jarvis_response_cache')
            .update({
                hit_count: data.hit_count + 1,
                last_accessed_at: new Date().toISOString()
            })
            .eq('id', data.id)
            .then(() => { })
            .catch(e => console.warn('[App] Handled promise rejection:', e?.message || e)); // Fire and forget

        console.debug(`[JarvisCache] HIT for ${endpoint}`);
        return data.response_data;

    } catch (error) {
        console.warn('[JarvisCache] Get error:', error);
        return null;
    }
}

/**
 * Store response in cache
 */
export async function setCachedResponse(endpoint, params, response, ttlDays = 30) {
    try {
        const cacheKey = generateCacheKey(endpoint, params);
        const expiresAt = new Date();
        expiresAt.setDate(expiresAt.getDate() + ttlDays);

        const { error: err_jarvis_response_cache_hie5q } = await supabase

          .from('jarvis_response_cache')

          .upsert({
                cache_key: cacheKey,
                endpoint,
                request_params: params,
                response_data: response,
                hit_count: 1,
                created_at: new Date().toISOString(),
                last_accessed_at: new Date().toISOString(),
                expires_at: expiresAt.toISOString()
            }, { onConflict: 'cache_key' });

        if (err_jarvis_response_cache_hie5q) console.warn('[Supabase] Silent mutation failed in jarvis_response_cache:', err_jarvis_response_cache_hie5q.message);

        console.debug(`[JarvisCache] STORED for ${endpoint}`);

    } catch (error) {
        console.warn('[JarvisCache] Set error:', error);
        // Don't throw - caching is non-critical
    }
}

/**
 * Clear cache for a specific endpoint
 */
export async function clearCache(endpoint = null) {
    try {
        let query = supabase.from('jarvis_response_cache').delete();

        if (endpoint) {
            query = query.eq('endpoint', endpoint);
        } else {
            query = query.lt('expires_at', new Date().toISOString());
        }

        await query;
        console.debug(`[JarvisCache] Cleared${endpoint ? ` for ${endpoint}` : ' expired entries'}`);

    } catch (error) {
        console.warn('[JarvisCache] Clear error:', error);
    }
}

/**
 * Get cache stats
 */
export async function getCacheStats() {
    try {
        const { data, error } = await supabase
            .from('jarvis_response_cache')
            .select('endpoint, hit_count, created_at')
            .order('hit_count', { ascending: false })
            .limit(100);

        if (error) throw error;

        const stats = {
            totalEntries: data.length,
            totalHits: data.reduce((sum, e) => sum + (e.hit_count || 0), 0),
            byEndpoint: {}
        };

        data.forEach(entry => {
            if (!stats.byEndpoint[entry.endpoint]) {
                stats.byEndpoint[entry.endpoint] = { entries: 0, hits: 0 };
            }
            stats.byEndpoint[entry.endpoint].entries++;
            stats.byEndpoint[entry.endpoint].hits += entry.hit_count || 0;
        });

        return stats;

    } catch (error) {
        console.warn('[JarvisCache] Stats error:', error);
        return { totalEntries: 0, totalHits: 0, byEndpoint: {} };
    }
}
