/**
 * useCurrentUser — Unified Session + Profile Hook
 * ═══════════════════════════════════════════════════════════════════════
 * Single source of truth for the authenticated user's profile data.
 *
 * MANDATE: Every component that needs the current user's username, avatar,
 * full_name, or role MUST use this hook instead of:
 *   ❌ localStorage.getItem('sp-social-user')
 *   ❌ localStorage.getItem('sp-profile-username')
 *   ❌ localStorage.getItem('sp-cached-header-user')
 *   ❌ authUser.user_metadata?.avatar_url  (JWT metadata — stale!)
 *   ❌ raw fetch() to Supabase REST with ANON_KEY (no session token!)
 *
 * This hook proxies AvatarContext (already initialized at app root) and
 * enriches it with a fresh profiles row on first mount. It caches the
 * result in 'sp-social-user' as a write-through cache so all existing
 * consumers of that key see consistent data without code changes.
 *
 * Truth chain:
 *   AvatarContext (auth session) → supabase.from('profiles') → setState
 *   → writes sp-social-user  → dispatches 'profile-updated' for other tabs
 *
 * NOTE: this hook both DISPATCHES and LISTENS FOR 'profile-updated'. The
 * listener must never react to this hook's own dispatch — see
 * selfDispatchDepth below.
 * ═══════════════════════════════════════════════════════════════════════
 */

import { useState, useEffect, useRef } from 'react';
import { useAvatar } from '../contexts/AvatarContext';
import supabase from '../lib/supabase';

const CACHE_KEY = 'sp-social-user';

// BUGFIX (2026-08-12, profile-updated feedback loop): this hook dispatches
// 'profile-updated' after every successful profiles fetch AND listens for that
// same event to trigger a refetch, resetting fetchedRef on the way in. Nothing
// broke the cycle, so one mount locked into fetch -> dispatch -> handler
// -> fetch at network speed: ~8 profiles selects/sec per open tab, and because
// UniversalHeader listens to the same event, ~8 POSTs/sec to
// /api/user/get-header-stats (up to 8 DB round-trips each). The endpoint's rate
// limiter was the only thing containing it, returning 429 once its window
// filled. Measured on production 2026-08-12 at 5.6-8.5 calls/sec on every hub
// page; it went unnoticed because the platform has had near-zero traffic.
//
// dispatchEvent() invokes listeners SYNCHRONOUSLY, so bracketing the dispatch
// with this counter reliably covers every handler that runs as a result --
// including the handlers of OTHER mounted useCurrentUser instances, which is
// why this is module scope and not a per-instance ref (a per-instance ref would
// still allow instance A's dispatch to drive instance B into the same loop).
let selfDispatchDepth = 0;
const PROFILE_TTL_MS = 5 * 60 * 1000; // 5 minutes — prevents stale avatar displays

/**
 * Read sp-social-user from localStorage safely.
 * Returns null if missing, expired (> TTL), or parse error.
 */
function readCache(userId) {
    if (typeof window === 'undefined') return null;
    try {
        const raw = localStorage.getItem(CACHE_KEY);
        if (!raw) return null;
        const data = JSON.parse(raw);
        // Reject cache if it belongs to a different user
        if (data?.id && data.id !== userId) return null;
        // Reject if stale
        if (data?.ts && Date.now() - data.ts > PROFILE_TTL_MS) return null;
        return data;
    } catch (_) {
        return null;
    }
}

/**
 * Write to sp-social-user cache. Always tags with the user id and timestamp
 * so stale / cross-user reads are rejected by readCache().
 */
function writeCache(profile) {
    if (typeof window === 'undefined') return;
    try {
        localStorage.setItem(CACHE_KEY, JSON.stringify({ ...profile, ts: Date.now() }));
    } catch (_) {
        /* private browsing — non-critical */
    }
}

/**
 * @typedef {Object} CurrentUser
 * @property {string}      id
 * @property {string|null} username      — ALWAYS lowercase (DB trigger enforced)
 * @property {string|null} full_name
 * @property {string|null} avatar        — profiles.avatar_url (not JWT metadata)
 * @property {string|null} role
 * @property {string}      profileHref   — ready-to-use link: /hub/user/<username>
 */

/**
 * @returns {{ user: CurrentUser|null, loading: boolean, refresh: () => void }}
 */
export default function useCurrentUser() {
    const { user: authUser, initializing } = useAvatar();

    const [profile, setProfile] = useState(() => {
        // Optimistic: seed from cache on first render so consuming components
        // don't flicker. Will be overridden with a fresh DB fetch below.
        if (typeof window !== 'undefined' && authUser?.id) {
            return readCache(authUser?.id) || null;
        }
        return null;
    });
    const [loading, setLoading] = useState(true);
    const fetchedRef = useRef(false);

    const fetchProfile = async (userId) => {
        if (!userId) {
            setProfile(null);
            setLoading(false);
            return;
        }

        setLoading(true);
        try {
            const { data, error } = await supabase
                .from('profiles')
                .select('id, username, full_name, display_name, avatar_url, role, is_vip')
                .eq('id', userId)
                .maybeSingle();

            if (error) {
                console.warn('[useCurrentUser] profiles fetch error:', error.message);
                // Fall back to whatever is in cache / auth metadata
                setLoading(false);
                return;
            }

            if (data) {
                const normalized = {
                    id:          data.id,
                    username:    data.username || null,          // DB trigger guarantees lowercase
                    full_name:   data.full_name || null,
                    avatar:      data.avatar_url || null,         // Always from DB — never JWT metadata
                    role:        data.role || null,
                    is_vip:      !!data.is_vip,
                    profileHref: data.username ? `/hub/user/${data.username}` : '/hub/profile',
                };
                setProfile(normalized);
                writeCache(normalized);
                // Notify same-tab listeners (Header, SocialMedia, etc.).
                // Bracketed so this hook's own listener ignores the echo.
                selfDispatchDepth++;
                try {
                    window.dispatchEvent(new CustomEvent('profile-updated', { detail: normalized }));
                } finally {
                    selfDispatchDepth--;
                }
            }
        } catch (err) {
            console.warn('[useCurrentUser] unexpected error:', err.message);
        } finally {
            setLoading(false);
        }
    };

    // ── Fetch on auth ready ─────────────────────────────────────────────
    useEffect(() => {
        if (initializing) return;     // Wait for auth to settle
        if (!authUser?.id) {
            setProfile(null);
            setLoading(false);
            return;
        }

        // Only fetch once per mount (or explicit refresh)
        if (fetchedRef.current) return;
        fetchedRef.current = true;

        // Seed instantly from cache, then fetch fresh in the background
        const cached = readCache(authUser.id);
        if (cached) setProfile(cached);

        fetchProfile(authUser.id);
    }, [initializing, authUser?.id]);

    // ── Sync: listen for profile-edit saves ────────────────────────────
    useEffect(() => {
        if (!authUser?.id) return;

        const handler = () => {
            // Ignore the echo of our own dispatch in fetchProfile. A genuine
            // profile-edit save (profileHandlers, BasicInfoSection,
            // CustomAvatarBuilder, PhoneVerifyVIPModal, ...) dispatches outside
            // that bracket and still refetches exactly as before.
            if (selfDispatchDepth > 0) return;
            fetchedRef.current = false;
            fetchProfile(authUser.id);
        };

        window.addEventListener('profile-updated', handler);
        return () => window.removeEventListener('profile-updated', handler);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [authUser?.id]);

    return {
        user:    profile,
        loading: loading || initializing,
        refresh: () => {
            fetchedRef.current = false;
            if (authUser?.id) fetchProfile(authUser.id);
        },
    };
}
