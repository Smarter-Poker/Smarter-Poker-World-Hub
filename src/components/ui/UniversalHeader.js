/**
 * ═══════════════════════════════════════════════════════════════════════════
 * UNIVERSAL HEADER COMPONENT — Hub-Style Dark Theme
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * CRITICAL: This is the GLOBAL STANDARD header for ALL smarter.poker pages.
 * DO NOT MODIFY without running /social-feed-protection workflow.
 *
 * Features:
 * - Dark background with neon blue accents
 * - "Smarter.Poker" in white text
 * - Diamond wallet with + (REAL balance from user_diamond_balance)
 * - Profile picture (uploaded photo by default; Arena avatar only by opt-in)
 * - VIP card entitlement state without selector boxes
 * - Return to Hub button (for major pages) or Back button (for nested pages)
 */

import React, { useState, useEffect, useLayoutEffect, useRef, useCallback, useMemo } from 'react';
import dynamic from 'next/dynamic';

import Head from 'next/head';
import { useRouter } from 'next/router';
import { supabase } from '../../lib/supabase';

import { useLiveHelp, LiveHelpPanel } from '../../world/components/Geeves';

import FullScreenPageOverlay from './FullScreenPageOverlay';

// ── PERF: Lazy-load DiamondWalletModal only when opened (saves ~95KB from initial bundle) ──
const DiamondWalletModal = dynamic(() => import('../store/DiamondWalletModal'), {
  ssr: false,
  loading: () => null, // No visible flash — modal has its own skeleton
});
const HamburgerMenu = dynamic(() => import('./HamburgerMenu'), {
  ssr: false,
  loading: () => null,
});
import { useAvatar } from '../../contexts/AvatarContext';
import { useUnreadCount } from '../../hooks/useUnreadCount';
import { useDiamondBalance } from '../../hooks/useDiamondBalance';
import useCurrentUser from '../../hooks/useCurrentUser';
import { useActiveIdentity } from '../../contexts/ActiveIdentityContext';
import { eventBus, EventType } from '../../engine/EventBus';
import { listenBroadcast, broadcastSync } from '../../lib/broadcastSync';
import { getHeaderStats } from '../../lib/headerStats';
import { resolveWorldMenu } from '../../config/worldMenuNavigation';
import { resolveActiveVip, resolveHeaderPortrait } from '../../lib/headerPortrait';

// Dark theme colors matching hub
const C = {
  bg: '#000000',
  border: 'rgba(0, 136, 255, 0.2)',
  cyan: '#00f5ff',
  blue: '#0088ff',
  gold: '#ffd700',
  white: '#ffffff',
  textSec: 'rgba(255,255,255,0.6)',
};

/**
 * @param {Object} props
 * @param {Function} [props.onMenuClick]
 * @param {Function} [props.onBackClick]
 */
// ── Header data cache freshness window ────────────────────────────────────
// The header is rendered per-page (it is NOT mounted in _app), so it remounts on
// EVERY route change. Without this guard each navigation fired a
// /api/user/get-header-stats POST — up to ~8 DB round-trips — purely to re-derive
// data already sitting in localStorage. Inside this window we trust the cache.
const HEADER_CACHE_FRESH_MS = 60 * 1000;

// Static — hoisted out of the component so it is not rebuilt on every render.
const OVERLAY_TITLES = {
  profile: 'My Profile',
  messenger: 'Messenger',
  notifications: 'Notifications',
  settings: 'Settings',
  'diamond-store': 'Diamond Store',
};

// useLayoutEffect warns when it runs during SSR, so fall back to useEffect on the
// server. On the client this flushes BEFORE the browser paints, which means the
// isMounted gate below never shows the un-hydrated (avatar-less) frame to the user.
const useIsomorphicLayoutEffect = typeof window !== 'undefined' ? useLayoutEffect : useEffect;

export default function UniversalHeader({
  onMenuClick, // Callback for hamburger menu click
  onBackClick, // Override for back navigation
  commandMenuOpen,
  onCommandMenuOpenChange,
}) {
  const router = useRouter();
  const [fallbackMenuOpen, setFallbackMenuOpen] = useState(false);
  const resolvedHeaderWorld = useMemo(
    () => resolveWorldMenu(router?.asPath || router?.pathname || ''),
    [router?.asPath, router?.pathname]
  );
  // Social still carries a legacy feed sidebar, so its approved header owns
  // the canonical drawer directly. Other worlds keep their page-owned
  // handlers so contextual actions such as search and tutorials stay wired.
  const ownsCanonicalMenu = resolvedHeaderWorld?.id === 'social-media';
  const isCommandMenuControlled = typeof commandMenuOpen === 'boolean';
  const resolvedCommandMenuOpen = isCommandMenuControlled
    ? commandMenuOpen
    : fallbackMenuOpen;
  const setCommandMenuOpen = (nextOpen) => {
    if (!isCommandMenuControlled) setFallbackMenuOpen(nextOpen);
    onCommandMenuOpenChange?.(nextOpen);
  };

  // 🛡️ INSTANT UI: Single-parse helper with 24h cache TTL
  // Parses localStorage once and returns the cached header object (or null if expired/missing).
  // This prevents double JSON.parse and ensures stale data (>24h) is discarded.
  // PERF (header-audit follow-up): this was a bare IIFE, so it re-read localStorage
  // TWICE and re-parsed TWO JSON payloads on every single render — and this component
  // re-renders on every notification tick, balance tick and realtime event. Nothing
  // downstream wants a fresh read: the value feeds a useState initializer and two
  // effects with [] deps, all of which only ever see the first-render value. Memoising
  // with [] deps is therefore behaviour-preserving and drops the work to once per mount.
  const _cachedHeader = useMemo(() => {
    if (typeof window === 'undefined') return null;
    try {
      // Get current user ID to prevent cross-session cache bleed
      let currentUserId = null;
      const authData = JSON.parse(localStorage.getItem('smarter-poker-auth') || '{}');
      currentUserId = authData?.user?.id;
      if (!currentUserId) {
        const sbKeys = Object.keys(localStorage).filter(
          (k) => k.startsWith('sb-') && k.endsWith('-auth-token')
        );
        if (sbKeys.length > 0)
          currentUserId = JSON.parse(localStorage.getItem(sbKeys[0]) || '{}')?.user?.id;
      }

      const raw = localStorage.getItem('sp-cached-header-user');
      if (!raw) return null;
      const data = JSON.parse(raw);

      // TTL check: discard cache older than 24 hours, OR if it belongs to a different user
      if (data?._ts && Date.now() - data._ts > 24 * 60 * 60 * 1000) return null;
      if (data?.userId && data.userId !== currentUserId) return null;
      // Older cache entries stored a single ambiguous `avatar` value. They can
      // point at the Club Arena character even when "Use Avatar" is off, so
      // they are not safe to paint on a global surface.
      if (data?.portraitPolicyVersion !== 2) return null;

      return data;
    } catch (_) {
      return null;
    }
  }, []);

  const [user, setUser] = useState(_cachedHeader);
  const [notificationCount, setNotificationCount] = useState(() => {
    if (typeof window === 'undefined') return 0;
    try {
      const n = parseInt(localStorage.getItem('sp-notif-count') || '0', 10);
      return isNaN(n) ? 0 : Math.max(0, n); // NaN-safe + clamp to 0
    } catch (_) {
      return 0;
    }
  });

  const [isWalletOpen, setIsWalletOpen] = useState(false);

  // ── FULL-SCREEN OVERLAY STATES ──
  const [overlayPage, setOverlayPage] = useState(null); // null | 'profile' | 'messenger' | 'notifications' | 'settings' | 'diamond-store'
  const [isVip, setIsVip] = useState(() => {
    if (typeof window === 'undefined') return false;
    try {
      return localStorage.getItem('sp-profile-vip') === 'true';
    } catch (_) {
      return false;
    }
  });
  const [isAdmin, setIsAdmin] = useState(() => {
    if (typeof window === 'undefined') return false;
    try {
      return localStorage.getItem('sp-profile-admin') === 'true';
    } catch (_) {
      return false;
    }
  });
  const [isMounted, setIsMounted] = useState(false);

  // ── Diamond balance: shared hook handles caching, realtime, cross-tab sync ──
  const { balance: diamondBalance, setBalance: setDiamondBalance } = useDiamondBalance(user?.id);

  // ── INSTANT PROFILE LINK: Resolve cached username for direct navigation ──
  const [profileHref, setProfileHref] = useState(() => {
    if (typeof window === 'undefined') return '/hub/profile';
    try {
      // Get current user ID to prevent cross-session cache bleed
      let currentUserId = null;
      const authData = JSON.parse(localStorage.getItem('smarter-poker-auth') || '{}');
      currentUserId = authData?.user?.id;
      if (!currentUserId) {
        const sbKeys = Object.keys(localStorage).filter(
          (k) => k.startsWith('sb-') && k.endsWith('-auth-token')
        );
        if (sbKeys.length > 0)
          currentUserId = JSON.parse(localStorage.getItem(sbKeys[0]) || '{}')?.user?.id;
      }

      const nameCache = localStorage.getItem('sp-profile-username');
      if (nameCache) {
        const { userId, username } = JSON.parse(nameCache);
        if (username && (!userId || userId === currentUserId)) return `/hub/user/${username}`;
      }
      // Fallback: extract username from header user cache
      const headerCache = localStorage.getItem('sp-cached-header-user');
      if (headerCache) {
        const { userId, username } = JSON.parse(headerCache);
        if (username && (!userId || userId === currentUserId)) return `/hub/user/${username}`;
      }
    } catch (_) {
      console.warn('[App] Handled exception:', _?.message || _);
    }
    return '/hub/profile';
  });

  // Global Avatar State (instant caching)
  const { avatar: contextAvatar } = useAvatar();

  // Global Active Identity State (for Commander/Page Owners)
  const { isClubMode, clubPage } = useActiveIdentity();

  // Global Unread Messages State (instant caching)
  // BUG-FIX-LIVE-6: useUnreadCount is now the single source of truth for
  // BOTH unread DM count AND unread notification count, with a Realtime
  // subscription. Header badges now mirror the bottom-nav badges in
  // real time — no more "header shows old count until you open the
  // overlay and close it" lag.
  const { unreadCount, notificationCount: liveNotificationCount } = useUnreadCount();

  // Header keeps a localStorage-cached `notificationCount` for first-paint
  // (avoids a 0→N flicker on hard reload). Once the realtime hook reports
  // a non-null number, we trust it as the source of truth. setNotificationCount
  // remains for the overlay-close path which still re-fetches via API to
  // capture both social + poker counts the bare `notifications` table query
  // does not include.
  useEffect(() => {
    if (typeof liveNotificationCount === 'number') {
      setNotificationCount(liveNotificationCount);
      try {
        localStorage.setItem('sp-notif-count', String(liveNotificationCount));
      } catch (_) {
        /* private browsing — ignore */
      }
    }
  }, [liveNotificationCount]);

  // 🛡️ INSTANT UI: Mark mounted for hydration-safe gates.
  // Cache read is now synchronous in _cachedHeader above — no extra effect needed.
  useIsomorphicLayoutEffect(() => {
    setIsMounted(true);
    // Seed diamond balance from cache (hook needs explicit init)
    if (_cachedHeader?.diamonds !== undefined) {
      setDiamondBalance(_cachedHeader.diamonds);
    }
  }, []);

  // Derived values — gated behind isMounted for SSR hydration safety.
  // Because user/isVip are initialized synchronously from localStorage,
  // the FIRST post-mount render (when isMounted flips true) already has
  // cached data — so there is zero visual flash despite the gate.

  const profilePhotoUrl = user?.profilePhotoUrl || user?.avatar || null;
  const arenaAvatarUrl = user?.arenaAvatarUrl || contextAvatar?.imageUrl || null;
  const resolvedPortrait = resolveHeaderPortrait(
    profilePhotoUrl,
    arenaAvatarUrl,
    user?.useAvatarAsProfilePic === true
  );
  const displayAvatar = isMounted ? resolvedPortrait || '/default-avatar.png' : null;
  const safeUnreadCount = isMounted ? unreadCount : 0;
  const safeNotificationCount = isMounted ? notificationCount : 0;

  // Live Help state
  const liveHelp = useLiveHelp();

  // ── OVERLAY HELPERS ──
  const openOverlay = (page) => setOverlayPage(page);

  // BUGFIX (header-audit #2/#10): closing an overlay no longer schedules an 800ms
  // poll of /api/user/get-header-stats. FullScreenPageOverlay reports the fresh count
  // straight up its postMessage bridge (onNotifCleared), which is both faster and
  // authoritative. The old timer RACED that bridge, so every notification-overlay
  // close produced two competing writes and one redundant API call. Anything the
  // bridge misses is reconciled by useUnreadCount's realtime subscription.
  const closeOverlay = useCallback(() => {
    setOverlayPage(null);
  }, []);

  // Fresh count pushed up from the notifications iframe. useCallback keeps the
  // identity stable so FullScreenPageOverlay's message listener is not torn down
  // and re-added on every count/balance tick.
  const handleNotifCleared = useCallback((count) => {
    setNotificationCount(count);
    try {
      localStorage.setItem('sp-notif-count', String(count));
    } catch (_) {
      /* private browsing — ignore */
    }
  }, []);

  // Persist "all notifications read" so the optimistic badge zero is actually TRUE.
  // An empty body means mark-all (see pages/api/notifications/mark-read.js), and that
  // endpoint writes BOTH the `read` and `is_read` columns — which is exactly what
  // stops the count resurrecting on the next poll.
  const markAllNotificationsRead = useCallback(async () => {
    try {
      let accessToken = null;
      try {
        const authData = JSON.parse(localStorage.getItem('smarter-poker-auth') || '{}');
        accessToken = authData?.access_token || null;
      } catch (_) {
        /* private browsing — ignore */
      }
      await fetch('/api/notifications/mark-read', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
        },
        body: JSON.stringify({}),
      });
      try {
        broadcastSync('smarter_poker_notif_sync', { action: 'refresh_notifications' });
      } catch (_) {}
    } catch (e) {
      console.warn('[UniversalHeader] mark-all-read failed:', e?.message || e);
    }
  }, []);

  // Only the profile entry is dynamic; the rest are constants (see OVERLAY_TITLES).
  const overlayUrlMap = useMemo(
    () => ({
      profile: profileHref,
      messenger: '/hub/messenger',
      notifications: '/hub/notifications',
      settings: '/hub/settings',
      'diamond-store': '/hub/diamond-store',
    }),
    [profileHref]
  );

  useEffect(() => {
    let mounted = true; // Prevent state updates after unmount
    let cleanupNotifSync = null;

    const loadUser = async () => {
      try {
        // 🛡️ BULLETPROOF: Bypass Supabase client entirely to avoid AbortError
        // Read user directly from localStorage instead of calling getUser()
        let authUser = null;
        if (typeof window !== 'undefined') {
          try {
            // Check explicit storage key first
            const explicitAuth = localStorage.getItem('smarter-poker-auth');
            if (explicitAuth) {
              const tokenData = JSON.parse(explicitAuth);
              authUser = tokenData?.user || null;
            }
            // Fallback to legacy sb-* keys
            if (!authUser) {
              const sbKeys = Object.keys(localStorage || {}).filter(
                (k) => k.startsWith('sb-') && k.endsWith('-auth-token')
              );
              if (sbKeys.length > 0) {
                const tokenData = JSON.parse(localStorage.getItem(sbKeys[0]) || '{}');
                authUser = tokenData?.user || null;
              }
            }
          } catch (e) {
            console.warn('[UniversalHeader] Error reading localStorage:', e);
          }
        }

        if (!mounted) return;

        if (authUser) {
          // BUGFIX (header-audit, primary cause of the avatar reloading on every
          // navigation): this was `setUser(authUser)` — a full REPLACE. `authUser`
          // is the raw Supabase auth object read out of localStorage and carries
          // no `avatar` / `name` keys, so the replace destroyed the cached avatar
          // that was seeded synchronously at mount and dropped the orb to
          // /default-avatar.png for the ENTIRE get-header-stats round-trip (up to
          // 3 retries with backoff plus a REST fallback). Merging keeps the cached
          // avatar painted until fresh data actually arrives.
          setUser((prev) => ({ ...(prev || {}), ...authUser }));
          console.debug('[UniversalHeader] User found in localStorage:', authUser.email);

          // 🛡️ BULLETPROOF: Retry logic with exponential backoff
          const MAX_RETRIES = 3;
          const fetchProfileWithRetry = async (attempt = 1) => {
            if (!mounted) return false;
            try {
              // PERF (2026-08-24): this hand-rolled fetch was one of THREE
              // concurrent /api/user/get-header-stats calls per page load (the
              // others being UnreadProvider and useDiamondBalance), each ~8 DB
              // round-trips. getHeaderStats() memoises the in-flight promise so
              // they collapse into a single request.
              // force from attempt 2 on: a retry must re-hit the network rather
              // than be handed back the cached failure it is retrying.
              const result = await getHeaderStats({
                userId: authUser.id,
                force: attempt > 1,
              });
              console.debug(`[UniversalHeader] API fetch attempt ${attempt}:`, result);

              if (result?.success && result.profile && mounted) {
                const {
                  diamonds,
                  full_name,
                  username,
                  avatar_url,
                  arena_avatar_url,
                  use_avatar_as_profile_pic,
                  is_vip,
                  vip_expires_at,
                  is_admin,
                } = result.profile;
                const vipActive = resolveActiveVip(!!is_vip, vip_expires_at);
                setDiamondBalance(diamonds ?? 0);
                setIsVip(vipActive);
                setIsAdmin(!!is_admin);
                try {
                  localStorage.setItem('sp-profile-diamonds', String(diamonds ?? 0));
                } catch (_) {}
                try {
                  localStorage.setItem('sp-profile-vip', String(vipActive));
                } catch (_) {}
                try {
                  localStorage.setItem('sp-profile-admin', String(!!is_admin));
                } catch (_) {}
                setUser((prev) => ({
                  ...prev,
                  avatar: avatar_url,
                  profilePhotoUrl: avatar_url,
                  arenaAvatarUrl: arena_avatar_url,
                  useAvatarAsProfilePic: use_avatar_as_profile_pic === true,
                  name: username || full_name,
                }));
                if (typeof result.notificationCount === 'number') {
                  setNotificationCount(result.notificationCount);
                }
                // 🛡️ INSTANT UI: Cache user data for next page load (with TTL timestamp)
                // Lowercase username before caching — prevents stale mixed-case
                // values propagating into profileHref via the cache init path.
                const normalizedUsername = username ? username.toLowerCase() : null;
                try {
                  localStorage.setItem(
                    'sp-cached-header-user',
                    JSON.stringify({
                      userId: authUser.id,
                      id: authUser.id,
                      avatar: avatar_url,
                      profilePhotoUrl: avatar_url,
                      arenaAvatarUrl: arena_avatar_url,
                      useAvatarAsProfilePic: use_avatar_as_profile_pic === true,
                      portraitPolicyVersion: 2,
                      name: normalizedUsername || full_name,
                      username: normalizedUsername,
                      diamonds: diamonds ?? 0,
                      is_vip: vipActive,
                      _ts: Date.now(),
                    })
                  );
                } catch (_) {
                  console.warn('[App] Handled exception:', _?.message || _);
                }

                // Update direct profile link if we got the username
                // ALWAYS lowercase — DB trigger enforces this, but
                // the API response may return a mixed-case value
                // if the profile was created before the trigger.
                if (username) {
                  const directHref = `/hub/user/${username.toLowerCase()}`;
                  setProfileHref(directHref);
                  router.prefetch(directHref);
                }
                return true; // Success
              }
              return false; // API returned error
            } catch (e) {
              console.warn(`[UniversalHeader] Attempt ${attempt} failed:`, e.message);
              return false;
            }
          };

          // PERF (header-audit): skip the network entirely when the cached header
          // payload is younger than HEADER_CACHE_FRESH_MS and belongs to THIS user.
          // Everything the fetch would set — avatar, name, VIP, admin, diamonds —
          // is already seeded synchronously from localStorage at mount, so a route
          // change no longer costs an API round-trip.
          const cacheIsFresh = !!(
            _cachedHeader &&
            _cachedHeader.userId === authUser.id &&
            _cachedHeader._ts &&
            Date.now() - _cachedHeader._ts < HEADER_CACHE_FRESH_MS
          );

          // Try up to MAX_RETRIES times with exponential backoff
          let success = cacheIsFresh ? true : await fetchProfileWithRetry(1);
          for (let attempt = 2; attempt <= MAX_RETRIES && !success && mounted; attempt++) {
            const delay = Math.pow(2, attempt - 1) * 500; // 500ms, 1000ms, 2000ms
            console.debug(`[UniversalHeader] Retrying in ${delay}ms...`);
            await new Promise((r) => setTimeout(r, delay));
            success = await fetchProfileWithRetry(attempt);
          }

          // Final fallback: direct REST API call (not Supabase client)
          if (!success && mounted) {
            console.debug('[UniversalHeader] All API retries failed, trying direct REST...');
            try {
              // SECURITY/OPS (header-audit #13): no baked-in literals. A
              // hardcoded project URL and anon JWT silently survive a key
              // rotation and then fail in a way nobody can trace back here.
              // If the env is not configured we skip the fallback instead.
              const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
              const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
              if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
                console.warn(
                  '[UniversalHeader] REST fallback skipped - Supabase env not configured'
                );
                throw new Error('supabase-env-missing');
              }

              // Get access token for authenticated query
              let accessToken = SUPABASE_ANON_KEY;
              try {
                const authData = JSON.parse(localStorage.getItem('smarter-poker-auth') || '{}');
                if (authData.access_token) accessToken = authData.access_token;
              } catch (e) {
                console.warn('[App] Handled exception:', e?.message || e);
              }

              const response = await fetch(
                `${SUPABASE_URL}/rest/v1/profiles?id=eq.${authUser.id}&select=username,full_name,avatar_url,arena_avatar_url,use_avatar_as_profile_pic,diamonds,is_vip,vip_expires_at,is_admin`,
                {
                  headers: {
                    apikey: SUPABASE_ANON_KEY,
                    Authorization: `Bearer ${accessToken}`,
                    'Content-Type': 'application/json',
                  },
                }
              );
              const profiles = await response.json();
              const profile = profiles?.[0];

              if (profile && mounted) {
                const vipActive = resolveActiveVip(!!profile.is_vip, profile.vip_expires_at);
                setDiamondBalance(profile.diamonds ?? 0);
                setIsVip(vipActive);
                setIsAdmin(!!profile.is_admin);
                setUser((prev) => ({
                  ...prev,
                  avatar: profile.avatar_url,
                  profilePhotoUrl: profile.avatar_url,
                  arenaAvatarUrl: profile.arena_avatar_url,
                  useAvatarAsProfilePic: profile.use_avatar_as_profile_pic === true,
                  name: profile.username || profile.full_name,
                }));
                // Cache the REST fallback data too — lowercase username
                const normalizedFallbackUsername = profile.username
                  ? profile.username.toLowerCase()
                  : null;
                try {
                  localStorage.setItem(
                    'sp-cached-header-user',
                    JSON.stringify({
                      userId: authUser.id,
                      id: authUser.id,
                      avatar: profile.avatar_url,
                      profilePhotoUrl: profile.avatar_url,
                      arenaAvatarUrl: profile.arena_avatar_url,
                      useAvatarAsProfilePic: profile.use_avatar_as_profile_pic === true,
                      portraitPolicyVersion: 2,
                      name: normalizedFallbackUsername || profile.full_name,
                      username: normalizedFallbackUsername,
                      diamonds: profile.diamonds ?? 0,
                      is_vip: vipActive,
                      _ts: Date.now(),
                    })
                  );
                } catch (_) {
                  console.warn('[App] Handled exception:', _?.message || _);
                }
                // Update direct profile link — lowercase username
                if (normalizedFallbackUsername) {
                  const directHref = `/hub/user/${normalizedFallbackUsername}`;
                  setProfileHref(directHref);
                  router.prefetch(directHref);
                }
                console.debug('[UniversalHeader] Direct REST fallback SUCCESS:', {
                  diamonds: profile.diamonds,
                });
              }
            } catch (e) {
              console.warn('[UniversalHeader] Direct REST fallback failed:', e);
            }
          }

          // BUG-11 FIX: fetchProfileWithRetry already sets notificationCount (line 291-292)
          // above. The separate fetchUnreadCount() call here was a duplicate 3s API hit.
          // fetchUnreadCount is now only used by the BroadcastChannel refresh listener below.
          const fetchUnreadCount = async () => {
            try {
              // force: this only runs from the cross-tab "notifications were
              // read elsewhere" broadcast, which exists precisely to pick up a
              // change the cached payload predates.
              const result = await getHeaderStats({ userId: authUser.id, force: true });
              if (result?.success && typeof result.notificationCount === 'number' && mounted) {
                setNotificationCount(result.notificationCount);
                try {
                  localStorage.setItem('sp-notif-count', String(result.notificationCount));
                } catch (_) {
                  console.warn('[App] Handled exception:', _?.message || _);
                }
              }
            } catch (e) {
              console.warn('[UniversalHeader] fetchUnreadCount failed:', e);
            }
          };
          // NOTE: Do NOT call fetchUnreadCount() here — count already set by fetchProfileWithRetry above.

          // ── CROSS-TAB SYNC: Listen for read notifications in other tabs ──
          // BUGFIX (header-audit #5): the awaits above (up to 3 retries with
          // 500/1000/2000ms backoff plus a REST fallback) can easily outlive the
          // component. Without this guard the channel was opened AFTER unmount, so
          // the effect cleanup — which had already run while cleanupNotifSync was
          // still null — could never close it. That leaked one live channel per
          // navigation, each still hitting the API forever.
          if (!mounted) return;
          cleanupNotifSync = listenBroadcast('smarter_poker_notif_sync', (msg) => {
            // Support both legacy string and new object payloads
            const isRefresh =
              msg === 'refresh_notifications' || msg?.action === 'refresh_notifications';
            if (isRefresh) {
              console.debug('[UniversalHeader] received refresh_notifications broadcast');
              fetchUnreadCount();
            }
          });

          // NOTE: Removed redundant Supabase Realtime channel for notifications.
          // useUnreadCount hook (line 150) already maintains a Realtime subscription
          // to the notifications table and feeds liveNotificationCount into this
          // component via the useEffect on line 158. Having TWO channels for the
          // same INSERT event caused a transient +2 flash before the reconciliation
          // useEffect corrected the count, and wasted a Supabase connection.

          // Global useUnreadCount handles social_messages naturally
        }
      } catch (e) {
        console.warn('[UniversalHeader] Data fetch error:', e);
      } finally {
        // loadUser complete
      }
    };
    loadUser();

    return () => {
      mounted = false;
      if (cleanupNotifSync) cleanupNotifSync();
    };
  }, []);

  // ── EventBus: Instant badge update when notifications are read (same-tab) ──
  // NOTE: eventBus.on() callback receives the full event object: { type, payload, timestamp, source }
  // The actual count lives at event.payload.count
  useEffect(() => {
    const unsub = eventBus.on(EventType.NOTIFICATIONS_READ, (event) => {
      const count = event?.payload?.count || 1;
      setNotificationCount((prev) => Math.max(0, prev - count));
    });
    return () => unsub();
  }, []);

  // ── Diamond balance: All refresh/realtime/cross-tab logic handled by useDiamondBalance hook ──

  // ── TIER 2: Avatar Changes Cross-Tab Sync ──
  // Listen for avatar changes from AvatarContext and other tabs
  useEffect(() => {
    if (!user?.id) return;

    const cleanup = listenBroadcast('smarter_poker_avatar_sync', (msg) => {
      if (msg === 'refresh') {
        console.debug('[UniversalHeader] Avatar refresh via BroadcastChannel');
        // Trigger a profile re-fetch so avatar + name update in the header
        window.dispatchEvent(new CustomEvent('profile-updated'));
      }
    });

    return cleanup;
  }, [user?.id]);

  // ── TIER 2: Club Arena Chip Balance Cross-Tab Sync ──
  // Now handled by useDiamondBalance hook

  // ── VIP status bus listener — updates VIP badge in real time ──
  // Triggered by PhoneVerifyVIPModal after successful phone verification
  useEffect(() => {
    const handleVipChange = (e) => {
      console.debug('[UniversalHeader] 🚌 VIP status change event received:', e.detail);
      if (e.detail?.vipGranted) {
        setIsVip(true);
      }
    };

    const handleProfileUpdate = async () => {
      // Re-fetch header stats to pick up all profile changes
      if (!user?.id) return;
      try {
        // Get access token for JWT auth
        let accessToken = null;
        try {
          const authData = JSON.parse(localStorage.getItem('smarter-poker-auth') || '{}');
          accessToken = authData?.access_token || null;
        } catch (e) {
          console.warn('[App] Handled exception:', e?.message || e);
        }

        const response = await fetch('/api/user/get-header-stats', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
          },
          body: JSON.stringify({ userId: user.id }),
        });
        const result = await response.json();
        if (result.success && result.profile) {
          const vipActive = resolveActiveVip(
            !!result.profile.is_vip,
            result.profile.vip_expires_at
          );
          setDiamondBalance(result.profile.diamonds ?? 0);
          setIsVip(vipActive);
          setIsAdmin(!!result.profile.is_admin);
          setUser((prev) => ({
            ...prev,
            avatar: result.profile.avatar_url || prev?.avatar,
            profilePhotoUrl: result.profile.avatar_url || null,
            arenaAvatarUrl: result.profile.arena_avatar_url || null,
            useAvatarAsProfilePic: result.profile.use_avatar_as_profile_pic === true,
            name: result.profile.username || result.profile.full_name || prev?.name,
          }));
          // Update localStorage cache with fresh profile data — lowercase username
          const refreshedUsername = result.profile.username
            ? result.profile.username.toLowerCase()
            : null;
          try {
            localStorage.setItem(
              'sp-cached-header-user',
              JSON.stringify({
                userId: user.id,
                id: user.id,
                avatar: result.profile.avatar_url,
                profilePhotoUrl: result.profile.avatar_url,
                arenaAvatarUrl: result.profile.arena_avatar_url,
                useAvatarAsProfilePic: result.profile.use_avatar_as_profile_pic === true,
                portraitPolicyVersion: 2,
                name: refreshedUsername || result.profile.full_name,
                username: refreshedUsername,
                diamonds: result.profile.diamonds ?? 0,
                is_vip: vipActive,
                _ts: Date.now(),
              })
            );
          } catch (_) {
            console.warn('[App] Handled exception:', _?.message || _);
          }
          // Update direct profile link if username changed — always lowercase
          if (refreshedUsername) {
            const directHref = `/hub/user/${refreshedUsername}`;
            setProfileHref(directHref);
          }
          console.debug('[UniversalHeader] 🚌 Profile refreshed via bus event');
        }
      } catch (e) {
        console.warn('[UniversalHeader] Profile refresh failed:', e.message);
      }
    };

    window.addEventListener('vip-status-changed', handleVipChange);
    window.addEventListener('profile-updated', handleProfileUpdate);
    return () => {
      window.removeEventListener('vip-status-changed', handleVipChange);
      window.removeEventListener('profile-updated', handleProfileUpdate);
    };
  }, [user?.id]);

  // ── useCurrentUser: keep profileHref in sync with fresh DB username ──────
  // This runs after AvatarContext resolves and gives us a guaranteed
  // lowercase username straight from the profiles table, overriding any
  // stale cache value that was used for the initial render.
  const { user: currentUserProfile } = useCurrentUser();
  useEffect(() => {
    if (!currentUserProfile?.username) return;
    const freshHref = `/hub/user/${currentUserProfile.username}`; // username is lowercased by DB trigger + hook
    setProfileHref((prev) => (prev !== freshHref ? freshHref : prev));
  }, [currentUserProfile?.username]);
  const goToProfile = useCallback(() => {
    router.push(isClubMode && clubPage ? `/hub/social-pages/${clubPage.id}` : profileHref);
  }, [router, isClubMode, clubPage, profileHref]);

  // Guard against rapid double-click on back button
  const backInProgressRef = useRef(false);

  const handleBack = () => {
    if (typeof window === 'undefined') return;
    // Block re-entrant clicks while a back navigation is in flight
    if (backInProgressRef.current) return;
    backInProgressRef.current = true;

    // CRITICAL: Use router.back() — NOT window.history.back().
    // window.history.back() updates the URL bar but does NOT trigger
    // Next.js re-renders, so the user sees the old page content.
    // router.back() is always correct for SPA navigation. Do NOT gate
    // on window.history.length — it is unreliable in Mobile Chrome
    // and across SPA sessions (can be 1 even after several pushes).
    router.back();

    // Release the guard after a short delay to prevent double-clicks
    setTimeout(() => {
      backInProgressRef.current = false;
    }, 500);
  };

  return (
    <>
      <Head>
        {/* Aggressive background cache of the Club Arena integration. This downloads the HTML document and triggers sub-resource fetching before the user clicks. */}
        <link rel="prefetch" href="/hub/club-arena" as="document" />
        {/* 🛡️ PRELOAD avatar image so it stays in browser cache across page navigations */}
        {displayAvatar && <link rel="preload" as="image" href={displayAvatar} />}
      </Head>

      {/* Mobile-responsive CSS */}
      <style
        dangerouslySetInnerHTML={{
          __html: `
                .universal-header {
                    background: ${C.bg};
                    /*
                     * THE NOTCH. In a standalone PWA the document starts at
                     * y=0, UNDERNEATH the status bar, so an 8px top pad put
                     * the header contents directly beneath the clock. On an
                     * iPhone the time overlapped the word "Settings".
                     * The bottom nav has reserved the home indicator from the
                     * start (env(safe-area-inset-bottom)); the top was simply
                     * never done. padding-top MUST come after the shorthand,
                     * or the shorthand resets it back to 8px.
                     */
                    padding: 8px 12px;
                    padding-top: calc(8px + env(safe-area-inset-top, 0px));
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    border-bottom: 3px solid rgba(200, 200, 200, 0.8);
                    position: sticky;
                    top: 0;
                    z-index: 100;
                    gap: 8px;
                    flex-wrap: nowrap;
                }
                
                .header-left {
                    display: flex;
                    align-items: center;
                    gap: 8px;
                    flex-shrink: 0;
                }
                
                .header-center {
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    flex: 1;
                    min-width: 0;
                }
                
                .header-right {
                    display: flex;
                    align-items: center;
                    gap: 6px;
                    flex-shrink: 0;
                    justify-content: flex-end;
                }

                /* Force all children (Links render as inline <a>) to be flex items */
                .header-right > * {
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    flex-shrink: 0;
                    height: 40px;
                }
                
                .nav-btn {
                    display: flex;
                    align-items: center;
                    gap: 4px;
                    padding: 6px 10px;
                    border-radius: 6px;
                    background: linear-gradient(135deg, rgba(0, 136, 255, 0.2) 0%, rgba(0, 102, 204, 0.3) 100%);
                    border: 1px solid rgba(0, 136, 255, 0.4);
                    color: white;
                    font-weight: 600;
                    font-size: 13px;
                    cursor: pointer;
                    box-shadow: 0 2px 8px rgba(0,136,255,0.2);
                }
                
                .header-img-btn {
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    background: none;
                    border: none;
                    padding: 0;
                    cursor: pointer;
                    height: 36px;
                    width: 36px;
                    flex-shrink: 0;
                    transition: transform 0.1s ease, opacity 0.15s ease;
                }

                .header-img-btn:hover {
                    opacity: 0.85;
                    transform: scale(1.05);
                }

                .header-img-btn:active {
                    transform: scale(0.95);
                }

                .header-nav-btn {
                    width: auto;
                    min-width: 72px;
                    height: 32px;
                    padding: 0 16px;
                    border: 1px solid transparent;
                    border-radius: 999px;
                    background:
                        linear-gradient(#111315, #111315) padding-box,
                        repeating-linear-gradient(
                            90deg,
                            #777d82 0,
                            #c9ced1 1px,
                            #8d9398 2px,
                            #d4d8da 4px,
                            #7f858a 5px
                        ) border-box;
                    box-shadow:
                        inset 0 1px 0 rgba(255,255,255,0.1),
                        inset 0 -1px 0 rgba(0,0,0,0.72),
                        0 1px 2px rgba(0,0,0,0.55);
                    color: #c9ced1;
                    font-family: 'Orbitron', 'Rajdhani', system-ui, sans-serif;
                    font-size: 11px;
                    font-weight: 800;
                    line-height: 1;
                    letter-spacing: 1.45px;
                    text-transform: uppercase;
                    overflow: hidden;
                    white-space: nowrap;
                }

                .header-nav-btn > span {
                    background: repeating-linear-gradient(
                        90deg,
                        #8c9297 0,
                        #d9dddf 1px,
                        #a1a7ab 2px,
                        #e0e3e5 4px,
                        #8f959a 5px
                    );
                    -webkit-background-clip: text;
                    background-clip: text;
                    color: transparent;
                    text-shadow: 0 1px 0 rgba(0,0,0,0.75);
                }

                .header-nav-btn:hover {
                    opacity: 1;
                    border-color: transparent;
                    background:
                        linear-gradient(#171a1d, #171a1d) padding-box,
                        repeating-linear-gradient(
                            90deg,
                            #858b90 0,
                            #d8dcde 1px,
                            #999fa4 2px,
                            #e0e3e5 4px,
                            #898f94 5px
                        ) border-box;
                }

                .header-nav-btn:focus-visible {
                    outline: 2px solid #00d4ff;
                    outline-offset: 3px;
                }

                .hamburger-btn {
                    width: 40px;
                    height: 40px;
                    background: transparent;
                    border: none;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    cursor: pointer;
                    position: relative;
                    flex-shrink: 0;
                    overflow: visible;
                    padding: 0;
                    transition: transform 0.1s ease, opacity 0.15s ease;
                }

                .hamburger-btn:hover {
                    opacity: 0.8;
                    transform: scale(1.1);
                }

                .hamburger-btn:active {
                    transform: scale(0.95);
                }
                
                .brand-text {
                    color: white;
                    font-size: 16px;
                    font-weight: 700;
                    letter-spacing: 0.3px;
                    white-space: nowrap;
                }

                .brand-text-img {
                    flex-shrink: 0;
                    height: 32px;
                    object-fit: contain;
                }
                
                .diamond-wallet {
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    gap: 4px;
                    background: transparent;
                    border: none;
                    padding: 0 10px;
                    border-radius: 0;
                    text-decoration: none;
                    color: white;
                    width: auto;
                    height: 40px;
                    box-sizing: border-box;
                }
                

                
                .orb-btn {
                    width: 40px;
                    height: 40px;
                    background: transparent;
                    border: none;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    cursor: pointer;
                    position: relative;
                    flex-shrink: 0;
                    overflow: visible;
                    transition: transform 0.1s ease, opacity 0.15s ease;
                }

                .orb-btn:hover {
                    opacity: 0.8;
                    transform: scale(1.1);
                }

                .orb-btn:active {
                    transform: scale(0.95);
                }
                
                .orb-badge {
                    position: absolute;
                    top: 0;
                    right: 0;
                    background: #e41e3f;
                    color: white;
                    border-radius: 10px;
                    padding: 2px 6px;
                    font-size: 11px;
                    font-weight: 700;
                    min-width: 18px;
                    text-align: center;
                    box-shadow: 0 2px 4px rgba(0,0,0,0.3);
                    border: 2px solid #000000;
                }
                
                .profile-orb {
                    width: 40px;
                    height: 40px;
                    border-radius: 50%;
                    border: 2px solid rgba(0, 245, 255, 0.5);
                    box-shadow: 0 0 12px rgba(0, 245, 255, 0.3);
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    font-size: 18px;
                    flex-shrink: 0;
                    background-size: cover;
                    background-position: center;
                    transition: transform 0.1s ease, opacity 0.15s ease;
                    cursor: pointer;
                    animation: pulse-orb 2s ease-in-out infinite;
                }

                .profile-orb[style*="url("] {
                    animation: none;
                }

                @keyframes pulse-orb {
                    0%, 100% { box-shadow: 0 0 12px rgba(0, 245, 255, 0.3); }
                    50% { box-shadow: 0 0 18px rgba(0, 245, 255, 0.6), 0 0 4px rgba(0, 245, 255, 0.2); }
                }

                .profile-orb:hover {
                    opacity: 0.85;
                    transform: scale(1.08);
                }

                .profile-orb:active {
                    transform: scale(0.92);
                }
                
                /* MOBILE: Compact layout with all icons visible */
                @media (max-width: 640px) {
                    .universal-header {
                        padding: calc(4px + env(safe-area-inset-top, 0px)) 6px 4px;
                        gap: 2px;
                    }
                    
                    .header-left {
                        gap: 4px;
                    }

                    .header-center {
                        height: 24px;
                    }
                    
                    .header-right {
                        gap: 4px;
                    }
                    
                    /* Reset flex items */
                    .header-right > * {
                        align-items: center;
                        justify-content: center;
                        height: 24px;
                    }
                    
                    .brand-text {
                        display: none; /* Hide brand text on mobile */
                    }
                    
                    /* Hamburger button - mobile sizing */
                    .header-img-btn {
                        height: 24px;
                        width: 24px;
                        padding: 2px;
                    }

                    /* The shared navigation control remains a true pill on mobile. */
                    .header-nav-btn {
                        height: 24px;
                        width: auto;
                        min-width: 58px;
                        max-width: none;
                        padding: 0 10px;
                        font-size: 9px;
                        letter-spacing: 1.05px;
                    }
                    
                    .hamburger-btn {
                        width: 24px;
                        height: 24px;
                        padding: 4px;
                    }
                    
                    /* Diamond wallet - mobile sizing */
                    .diamond-wallet {
                        width: auto;
                        min-width: 40px;
                        height: 24px;
                        padding: 0 4px;
                        font-size: 10px;
                    }
                    
                    .hide-mobile {
                        display: none !important;
                    }
                    
                    /* Shrink all orb icons to fit on mobile */
                    .orb-btn, .profile-orb {
                        width: 24px;
                        height: 24px;
                        font-size: 10px;
                    }
                    
                    .orb-badge {
                        top: -2px;
                        right: -2px;
                        padding: 0 3px;
                        font-size: 8px;
                        min-width: 12px;
                    }
                }
                
                /* Tablets and Desktops */
                @media (min-width: 641px) {
                    .universal-header {
                        padding: 8px 16px;
                        gap: 12px;
                    }
                    
                    .orb-btn, .profile-orb {
                        width: 40px;
                        height: 40px;
                        font-size: 18px;
                    }
                }

                /* Approved 2026-08-29 global header. The complete desktop artwork
                   is the header at every width; mobile only scales the same row. */
                .approved-global-header {
                    position: sticky;
                    top: 0;
                    /* Global navigation stays reachable above page-owned tours
                       and modal scrims; the command drawer itself is 10100+. */
                    z-index: 10050;
                    flex: 0 0 auto;
                    width: 100%;
                    box-sizing: border-box;
                    padding-top: env(safe-area-inset-top, 0px);
                    overflow: hidden;
                    background: #000;
                    line-height: 0;
                    isolation: isolate;
                }

                .approved-global-header__art {
                    display: block;
                    width: calc(100% - env(safe-area-inset-left, 0px) - env(safe-area-inset-right, 0px));
                    height: auto;
                    margin-inline: env(safe-area-inset-left, 0px) env(safe-area-inset-right, 0px);
                    aspect-ratio: 1648 / 168;
                    object-fit: contain;
                    object-position: center;
                    user-select: none;
                    pointer-events: none;
                }

                .approved-global-header__controls {
                    position: absolute;
                    top: env(safe-area-inset-top, 0px);
                    right: env(safe-area-inset-right, 0px);
                    left: env(safe-area-inset-left, 0px);
                    aspect-ratio: 1648 / 168;
                }

                .approved-global-header__button {
                    position: absolute;
                    top: 13%;
                    height: 74%;
                    margin: 0;
                    padding: 0;
                    appearance: none;
                    border: 0;
                    border-radius: 8px;
                    background: transparent;
                    cursor: pointer;
                    -webkit-tap-highlight-color: transparent;
                    touch-action: manipulation;
                }

                /* NO BOXES OVER HEADER ICONS (Dan, 2026-09-01, binding).
                   The icons are baked into the approved artwork and these
                   buttons are transparent hit regions laid over it, so ANY
                   ring -- outline, box-shadow, or a bordered ::before -- is a
                   rectangle drawn on top of the picture of the icon.

                   The pulled-inside ::before ring this replaces was itself a
                   fix for detached corner strokes from a negative outline. Both
                   attempts were shapes with straight edges; the answer is not a
                   better-placed box, it is no box. Safari on macOS matches
                   :focus-visible on a plain mouse click, so the ring stuck to
                   the hamburger after every tap.

                   Keyboard focus is a soft radial glow: visible, no edges. */
                .approved-global-header__button:focus,
                .approved-global-header__button:focus-visible {
                    outline: none;
                    box-shadow: none;
                }

                .approved-global-header__button:focus-visible {
                    background: radial-gradient(
                        closest-side,
                        rgba(54, 186, 255, 0.32),
                        rgba(54, 186, 255, 0) 78%
                    );
                }

                .approved-global-header__button:active { opacity: .76; }
                .approved-global-header__menu { left: 1.7%; width: 7%; }
                .approved-global-header__back { left: 8%; width: 12%; }
                .approved-global-header__hub { left: 19.1%; width: 12.9%; }
                .approved-global-header__profile {
                    top: 15%;
                    left: 66.75%;
                    width: 7.15%;
                    height: auto;
                    aspect-ratio: 1;
                    position: absolute !important;
                    box-sizing: border-box;
                    overflow: hidden;
                    border: 0;
                    border-radius: 50%;
                    background: #000;
                    contain: layout paint;
                    isolation: isolate;
                }
                .approved-global-header__wallet { left: 73.2%; width: 7.1%; }
                .approved-global-header__vip {
                    left: 79.9%;
                    width: 6.5%;
                    overflow: hidden;
                    isolation: isolate;
                }
                .approved-global-header__messenger { left: 86%; width: 6.9%; }
                .approved-global-header__notifications { left: 92.3%; width: 6.2%; }

                @media (max-width: 430px) {
                    /* Keep the command-grid target at the WCAG 2.2 minimum on
                       narrow phones without covering the adjacent Back zone. */
                    .approved-global-header__menu {
                        left: .75%;
                        width: 8%;
                        min-width: 24px;
                    }
                    .approved-global-header__back {
                        left: 8.75%;
                        width: 11.5%;
                    }
                }

                .approved-global-header__avatar-slot {
                    position: absolute !important;
                    top: 50% !important;
                    left: 50% !important;
                    z-index: 1;
                    display: block;
                    width: 72%;
                    height: auto;
                    aspect-ratio: 1;
                    transform: translate(-50%, -50%) !important;
                    overflow: hidden;
                    box-sizing: border-box;
                    border: 0.5px solid rgba(0, 0, 0, .94);
                    border-radius: 50%;
                    background: transparent;
                    pointer-events: none;
                }

                .approved-global-header__avatar-slot > .approved-global-header__avatar {
                    position: absolute !important;
                    inset: 0 !important;
                    display: block !important;
                    width: 100% !important;
                    height: 100% !important;
                    max-width: none !important;
                    aspect-ratio: auto !important;
                    transform: none !important;
                    border: 0 !important;
                    border-radius: 50% !important;
                    background: transparent !important;
                    object-fit: cover !important;
                    object-position: center !important;
                    opacity: 1 !important;
                    pointer-events: none;
                }

                .approved-global-header__vip:not(.approved-global-header__vip--active)::after {
                    content: '';
                    position: absolute;
                    inset: 0;
                    z-index: 1;
                    background: rgba(0, 0, 0, .42);
                    pointer-events: none;
                }

                .approved-global-header__badge {
                    position: absolute;
                    top: 3px;
                    right: 3px;
                    display: grid;
                    min-width: 20px;
                    min-height: 20px;
                    place-items: center;
                    box-sizing: border-box;
                    padding: 1px 5px;
                    border: 2px solid #050505;
                    border-radius: 999px;
                    background: #d91136;
                    color: #fff;
                    box-shadow: 0 2px 8px rgba(0,0,0,.72);
                    font: 800 11px/1 system-ui, sans-serif;
                }

                @media (max-width: 900px) {
                    .approved-global-header__badge {
                        top: 0;
                        right: -2px;
                        min-width: clamp(12px, 1.7vw, 18px);
                        min-height: clamp(12px, 1.7vw, 18px);
                        padding: 0 2px;
                        border-width: 1px;
                        box-shadow: 0 1px 3px rgba(0,0,0,.72);
                        font-size: clamp(7px, 1vw, 10px);
                    }
                }

                @media (display-mode: standalone), (display-mode: fullscreen) {
                    .approved-global-header { padding-top: max(env(safe-area-inset-top, 0px), 24px); }
                    .approved-global-header__controls { top: max(env(safe-area-inset-top, 0px), 24px); }
                }
            `,
        }}
      />

      {(!onMenuClick || ownsCanonicalMenu) && (
        <HamburgerMenu
          isOpen={resolvedCommandMenuOpen}
          onClose={() => setCommandMenuOpen(false)}
          direction="left"
          theme="dark"
          user={user}
          menuItems={[]}
          bottomLinks={[]}
          menuKey={router.asPath || 'global-header-default'}
        />
      )}

      <header className="approved-global-header" data-artwork="approved-global-header">
        <img
          src="/images/global-header/global-header-desktop.png"
          alt=""
          width="1648"
          height="168"
          className="approved-global-header__art"
          aria-hidden="true"
          fetchpriority="high"
          decoding="sync"
        />
        <div className="approved-global-header__controls">
          <button
            type="button"
            className="approved-global-header__button approved-global-header__menu"
            data-world-menu-trigger="approved-header"
            data-menu-symbol="command-grid"
            onClick={() => (
              onMenuClick && !ownsCanonicalMenu
                ? onMenuClick()
                : setCommandMenuOpen(true)
            )}
            aria-label={resolvedHeaderWorld
              ? `Open ${resolvedHeaderWorld.label} Command Menu`
              : 'Open Menu'}
          />
          <button
            type="button"
            className="approved-global-header__button approved-global-header__back"
            onClick={onBackClick || handleBack}
            aria-label="Go back"
          />
          <button
            type="button"
            className="approved-global-header__button approved-global-header__hub"
            onClick={() => router.push('/hub')}
            aria-label="Go to the Hub"
          />
          <button
            type="button"
            className="approved-global-header__button approved-global-header__profile"
            onClick={goToProfile}
            aria-label="My Profile"
          >
            <span className="approved-global-header__avatar-slot" aria-hidden="true">
              <img
                src={displayAvatar || '/default-avatar.png'}
                alt=""
                className="approved-global-header__avatar"
                onError={(event) => {
                  event.currentTarget.src = '/default-avatar.png';
                }}
              />
            </span>
          </button>
          <button
            type="button"
            className="approved-global-header__button approved-global-header__wallet"
            onClick={() => setIsWalletOpen(true)}
            aria-label="Diamond Wallet"
          />
          <button
            type="button"
            className={`approved-global-header__button approved-global-header__vip${
              isVip ? ' approved-global-header__vip--active' : ''
            }`}
            onClick={() => router.push('/hub/vip-membership')}
            aria-label={isVip ? 'VIP Membership active' : 'VIP Membership inactive'}
            data-vip-active={isVip ? 'true' : 'false'}
          />
          <button
            type="button"
            className="approved-global-header__button approved-global-header__messenger"
            onClick={() => router.push('/hub/messenger')}
            aria-label="Messages"
          >
            {safeUnreadCount > 0 && (
              <span className="approved-global-header__badge" aria-live="polite" aria-atomic="true">
                {safeUnreadCount > 99 ? '99+' : safeUnreadCount}
              </span>
            )}
          </button>
          <button
            type="button"
            className="approved-global-header__button approved-global-header__notifications"
            onClick={() => {
              setNotificationCount(0);
              try {
                localStorage.setItem('sp-notif-count', '0');
              } catch (_) {
                console.warn('[App] Handled exception:', _?.message || _);
              }
              markAllNotificationsRead();
              openOverlay('notifications');
            }}
            aria-label="Notifications"
          >
            {safeNotificationCount > 0 && (
              <span className="approved-global-header__badge" aria-live="polite" aria-atomic="true">
                {safeNotificationCount > 99 ? '99+' : safeNotificationCount}
              </span>
            )}
          </button>
        </div>
      </header>


      {/* Live Help Panel */}
      <LiveHelpPanel {...liveHelp} />

      <DiamondWalletModal
        isOpen={isWalletOpen}
        onClose={() => setIsWalletOpen(false)}
        onBuyClick={() => openOverlay('diamond-store')}
        initialBalance={diamondBalance}
      />

      {/* Full-Screen Page Overlay — opens pages as popup instead of redirect */}
      {/* Full-Screen Page Overlay — opens pages as a popup instead of navigating.
                BUGFIX (header-audit #10): rendered unconditionally and driven by isOpen.
                It used to be mounted behind `{overlayPage && ...}` with a hardcoded
                isOpen={true}, which made the component's entire !isOpen branch dead code,
                and the two inline arrow props were recreated on every parent render —
                tearing down and re-adding the keydown and postMessage listeners on every
                notification/balance tick. */}
      <FullScreenPageOverlay
        isOpen={!!overlayPage}
        onClose={closeOverlay}
        url={overlayPage ? overlayUrlMap[overlayPage] : null}
        title={overlayPage ? OVERLAY_TITLES[overlayPage] : ''}
        onNotifCleared={handleNotifCleared}
      />
    </>
  );
}

// GEEVES LIVE HELP PANEL EXPORT
export { LiveHelpPanel } from '../../world/components/Geeves';
// trigger deploy
