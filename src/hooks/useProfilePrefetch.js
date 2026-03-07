/**
 * useProfilePrefetch — Prefetch profile data for visible post authors
 * ═══════════════════════════════════════════════════════════════════
 * When a user scrolls through the social feed, this hook prefetches
 * profile data for post authors into localStorage so clicking their
 * avatar loads the profile page instantly.
 *
 * Uses requestIdleCallback to avoid blocking the main thread.
 *
 * Usage:
 *   import { prefetchProfile } from './useProfilePrefetch';
 *   // Call when a post becomes visible:
 *   prefetchProfile(post.author_id, post.author?.username);
 */

import { supabase } from '../lib/supabase';

// Track which profiles are already prefetched to avoid duplicates
const prefetchedSet = new Set();
const inflightSet = new Set();

/**
 * Prefetch a single user's profile data into localStorage cache.
 * Runs during idle time — completely non-blocking.
 * @param {string} userId - The user's ID
 * @param {string} username - The user's username (for cache key)
 */
export function prefetchProfile(userId, username) {
    if (!userId || !username) return;
    if (typeof window === 'undefined') return;

    const cacheKey = `sp-profile-cache-${username}`;

    // Skip if already prefetched, in-flight, or cached
    if (prefetchedSet.has(username) || inflightSet.has(username)) return;
    try {
        const existing = localStorage.getItem(cacheKey);
        if (existing) {
            const parsed = JSON.parse(existing);
            if (parsed._cachedAt && (Date.now() - parsed._cachedAt) < 10 * 60 * 1000) {
                prefetchedSet.add(username);
                return; // Fresh cache exists
            }
        }
    } catch { /* noop */ }

    inflightSet.add(username);

    // Use requestIdleCallback if available, otherwise debounce with setTimeout
    const schedule = window.requestIdleCallback || ((cb) => setTimeout(cb, 200));

    schedule(() => {
        // Lightweight prefetch — just profile + stats (no posts/photos to keep it small)
        Promise.all([
            supabase.from('profiles').select('*').eq('username', username).maybeSingle(),
            supabase.from('friendships').select('*', { count: 'exact', head: true }).eq('status', 'accepted').or(`user_id.eq.${userId},friend_id.eq.${userId}`),
            supabase.from('follows').select('*', { count: 'exact', head: true }).eq('follower_id', userId),
            supabase.from('follows').select('*', { count: 'exact', head: true }).eq('following_id', userId),
        ]).then(([profileRes, friendsCount, followingCount, followersCount]) => {
            if (!profileRes.data) return;
            try {
                const cachePayload = {
                    _cachedAt: Date.now(),
                    profile: profileRes.data,
                    stats: {
                        friends: friendsCount.count ? Math.floor(friendsCount.count / 2) : 0,
                        following: followingCount.count || 0,
                        followers: followersCount.count || 0,
                        posts: 0, // Will be fetched on actual page visit
                    },
                    friends: [],
                    posts: [],
                    photos: [],
                    videos: [],
                    reels: [],
                };
                localStorage.setItem(cacheKey, JSON.stringify(cachePayload));
                prefetchedSet.add(username);
            } catch { /* quota exceeded */ }
        }).catch(() => {
            // Prefetch failed — profile will load normally
        }).finally(() => {
            inflightSet.delete(username);
        });
    });
}

/**
 * Prefetch profiles for an array of posts.
 * Typically called once after the social feed loads.
 * @param {Array} posts - Array of post objects with author data
 */
export function prefetchProfilesFromPosts(posts) {
    if (!posts?.length) return;

    // Only prefetch first 5 unique authors to avoid hammering the DB
    const seen = new Set();
    let count = 0;
    for (const post of posts) {
        if (count >= 5) break;
        const authorId = post.author_id || post.author?.id;
        const authorUsername = post.author?.username;
        if (authorId && authorUsername && !seen.has(authorUsername)) {
            seen.add(authorUsername);
            count++;
            // Stagger prefetches by 500ms each to avoid burst
            setTimeout(() => prefetchProfile(authorId, authorUsername), count * 500);
        }
    }
}

/**
 * useFeedPrefetchObserver — IntersectionObserver that auto-prefetches
 * author profiles when post elements scroll into the viewport.
 *
 * Usage:
 *   const observerRef = useFeedPrefetchObserver();
 *   // On each post element: ref={el => { if (el) observerRef.current?.observe(el); }}
 *   // Or attach data attributes: data-author-id, data-author-username
 *
 * @returns {React.MutableRefObject<IntersectionObserver|null>}
 */
import { useEffect, useRef } from 'react';

export function useFeedPrefetchObserver() {
    const observerRef = useRef(null);

    useEffect(() => {
        if (typeof window === 'undefined' || !('IntersectionObserver' in window)) return;

        const observer = new IntersectionObserver(
            (entries) => {
                for (const entry of entries) {
                    if (entry.isIntersecting) {
                        const el = entry.target;
                        const authorId = el.dataset?.authorId;
                        const authorUsername = el.dataset?.authorUsername;
                        if (authorId && authorUsername) {
                            prefetchProfile(authorId, authorUsername);
                        }
                        // Unobserve after processing — each post only triggers once
                        observer.unobserve(el);
                    }
                }
            },
            {
                rootMargin: '200px', // Start prefetching 200px before visible
                threshold: 0,
            }
        );

        observerRef.current = observer;
        return () => observer.disconnect();
    }, []);

    return observerRef;
}

