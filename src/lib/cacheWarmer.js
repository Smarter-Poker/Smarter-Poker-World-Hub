/**
 * Cache Warmer — Prefetch critical data on login
 * ═══════════════════════════════════════════════════════
 * Called from _app.js once after auth user is detected.
 * Prefetches the user's own profile, friend list, and
 * notification count so pages load instantly on first visit.
 *
 * All fetches are fire-and-forget (non-blocking).
 */

import { supabase } from './supabase';

const WARMED_KEY = 'sp-cache-warmed';

/**
 * Warm the cache for the authenticated user.
 * Only runs once per session to avoid hammering the DB.
 */
export function warmCache(user) {
    if (!user?.id) return;
    if (typeof window === 'undefined') return;

    // Only warm once per session
    try {
        if (sessionStorage.getItem(WARMED_KEY)) return;
        sessionStorage.setItem(WARMED_KEY, '1');
    } catch { /* noop */ }

    const username = user.user_metadata?.username;
    const userId = user.id;

    // Use requestIdleCallback if available, otherwise setTimeout
    const schedule = window.requestIdleCallback || ((cb) => setTimeout(cb, 100));

    schedule(() => {
        // Prefetch own profile + stats + friends into localStorage
        const CACHE_KEY = username ? `sp-profile-cache-${username}` : null;

        // Only prefetch if not already cached
        if (CACHE_KEY) {
            try {
                const existing = localStorage.getItem(CACHE_KEY);
                if (existing) {
                    const parsed = JSON.parse(existing);
                    if (parsed._cachedAt && (Date.now() - parsed._cachedAt) < 10 * 60 * 1000) {
                        // Cache is still fresh — skip prefetch
                        return;
                    }
                }
            } catch { /* noop */ }
        }

        // Fire-and-forget parallel prefetch
        Promise.all([
            supabase.from('profiles').select('*').eq('id', userId).maybeSingle(),
            supabase.from('friendships').select('*', { count: 'exact', head: true }).eq('status', 'accepted').or(`user_id.eq.${userId},friend_id.eq.${userId}`),
            supabase.from('follows').select('*', { count: 'exact', head: true }).eq('follower_id', userId),
            supabase.from('follows').select('*', { count: 'exact', head: true }).eq('following_id', userId),
            supabase.from('social_posts').select('*', { count: 'exact', head: true }).eq('author_id', userId),
            supabase.from('friendships').select('user_id, friend_id').eq('status', 'accepted').or(`user_id.eq.${userId},friend_id.eq.${userId}`).limit(20),
        ]).then(([profileRes, friendsCount, followingCount, followersCount, postsCount, friendshipsRes]) => {
            if (!profileRes.data || !CACHE_KEY) return;

            // Build friend profiles
            const friendIds = (friendshipsRes.data || []).map(f => f.user_id === userId ? f.friend_id : f.user_id);

            const saveCachePayload = (friends = []) => {
                try {
                    const cachePayload = {
                        _cachedAt: Date.now(),
                        profile: profileRes.data,
                        stats: {
                            friends: friendsCount.count ? Math.floor(friendsCount.count / 2) : 0,
                            following: followingCount.count || 0,
                            followers: followersCount.count || 0,
                            posts: postsCount.count || 0,
                        },
                        friends,
                        posts: [],
                        photos: [],
                        videos: [],
                        reels: [],
                    };
                    localStorage.setItem(CACHE_KEY, JSON.stringify(cachePayload));
                } catch { /* quota exceeded */ }
            };

            if (friendIds.length > 0) {
                supabase.from('profiles').select('id, username, full_name, avatar_url').in('id', friendIds)
                    .then(({ data: friendProfiles }) => {
                        saveCachePayload(friendProfiles || []);
                        // Preload avatar images for first 5 friends
                        preloadAvatars(friendProfiles || []);
                    })
                    .catch(() => saveCachePayload());
            } else {
                saveCachePayload();
            }
        }).catch(() => {
            // Prefetch failed — pages will load normally
        });
    });
}

/**
 * Preload avatar images for the first N friends.
 * Uses <link rel="preload"> to start downloading images
 * before they're rendered, eliminating the flash of empty circles.
 */
function preloadAvatars(profiles, max = 5) {
    if (typeof document === 'undefined') return;
    let count = 0;
    for (const p of profiles) {
        if (count >= max) break;
        if (p.avatar_url) {
            try {
                const link = document.createElement('link');
                link.rel = 'preload';
                link.as = 'image';
                link.href = p.avatar_url;
                document.head.appendChild(link);
                count++;
            } catch { /* noop */ }
        }
    }
}

