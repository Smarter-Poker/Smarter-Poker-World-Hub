/**
 * AVATAR CONTEXT
 * Global context provider for user avatar state
 * Makes avatar available throughout the entire app
 */

import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import supabase from '../lib/supabase';
import { getUserAvatar, setPresetAvatar, generateCustomAvatar } from '../services/avatar-service';
import { getAuthUser } from '../lib/authUtils';
import { listenBroadcast, broadcastSync } from '../lib/broadcastSync';
import { busEmit } from '../engine/EventBus';
import { useProfileRealtime } from '../hooks/useProfileRealtime';

const AvatarContext = createContext();

export function useAvatar() {
    const context = useContext(AvatarContext);
    if (!context) {
        throw new Error('useAvatar must be used within AvatarProvider');
    }
    return context;
}

export function AvatarProvider({ children }) {
    const [user, setUser] = useState(null);
    // BUGFIX (header-audit, avatar reload): this was `useState(null)`. AvatarProvider is
    // the ONE piece of header state that survives navigation — it sits in _app above the
    // page-remount boundary — but starting at null meant it could not mask the avatar gap
    // on a hard load, because it only populates after an async DB round-trip. Seeding it
    // synchronously from the same localStorage payload the header already writes makes
    // the avatar paint on the very first frame.
    const [avatar, setAvatar] = useState(() => {
        if (typeof window === 'undefined') return null;
        try {
            const raw = localStorage.getItem('sp-cached-header-user');
            if (!raw) return null;
            const data = JSON.parse(raw);
            if (data?._ts && (Date.now() - data._ts) > 24 * 60 * 60 * 1000) return null;
            return data?.avatar ? { type: 'profile_upload', imageUrl: data.avatar } : null;
        } catch (_) { return null; }
    });
    const [loading, setLoading] = useState(true);
    const [isVip, setIsVip] = useState(() => {
        if (typeof window !== 'undefined') {
            try { return localStorage.getItem('sp-vip-status') === 'true'; } catch (e) { return false; }
        }
        return false;
    });
    // CRITICAL: Track auth initialization to prevent race condition
    // This stays true until INITIAL_SESSION event fires from Supabase
    const [initializing, setInitializing] = useState(true);
    // NEW USER WELCOME: Track whether to show welcome modal
    const [showWelcomeModal, setShowWelcomeModal] = useState(false);

    // Fetch VIP status from server-side API bridge (with fallbacks)
    async function fetchVipStatus(userId) {
        if (!userId) {
            setIsVip(false);
            return;
        }
        try {
            // Set a 5 second timeout for the API call
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 5000);

            // Get session token for authenticated API call
            const _lsToken = JSON.parse(localStorage.getItem('smarter-poker-auth') || '{}').access_token;
            const headers = {};
            if (_lsToken) {
                headers['Authorization'] = `Bearer ${_lsToken}`;
            }

            const response = await fetch(`/api/vip/check-status?userId=${userId}`, {
                signal: controller.signal,
                headers
            });
            clearTimeout(timeoutId);

            if (response.ok) {
                const data = await response.json();
                const vipStatus = data.isVip === true;
                setIsVip(vipStatus);
                // Sync to localStorage for optimistic rendering via useVIP hook
                try { localStorage.setItem('sp-vip-status', String(vipStatus)); } catch (_) { console.warn('[App] Handled exception:', _?.message || _); }
            } else {
                // BULLETPROOF: Fallback to localStorage instead of getUser()
                const localUser = getAuthUser();
                setIsVip(localUser?.user_metadata?.is_vip || false);
            }
        } catch (err) {
            console.warn('Error fetching VIP status:', err);
            // BULLETPROOF: Fallback to localStorage on any error
            try {
                const cachedVip = localStorage.getItem('sp-vip-status') === 'true';
                if (cachedVip) {
                    setIsVip(true);
                } else {
                    const localUser = getAuthUser();
                    setIsVip(localUser?.user_metadata?.is_vip || false);
                }
            } catch {
                setIsVip(false);
            }
        }
    }

    // Refresh user session to get latest metadata
    async function refreshUser() {
        try {
            const { data: authData, error } = await supabase.auth.refreshSession();
            const freshUser = authData?.user;
            if (freshUser && !error) {
                setUser(freshUser);
                await fetchVipStatus(freshUser.id);
            }
        } catch (e) { console.warn('[App] Handled exception:', e?.message || e); }
    }

    // Load user on mount - WAIT for INITIAL_SESSION before concluding user is null
    useEffect(() => {
        async function ensureUserProfile(user, session) {
            if (!user) return;
            try {
                // Use the session passed in directly (avoids race condition where
                // getSession() returns null because the new session isn't persisted yet)
                let token = session?.access_token || null;
                if (!token) {
                    // Fallback: try getSession() if no session was passed
                    const _lsToken2 = JSON.parse(localStorage.getItem('smarter-poker-auth') || '{}').access_token;
                    if (!_lsToken2) {
                        console.warn('[AvatarContext] ensureUserProfile skipped — no auth token available yet');
                        return; // Skip silently — will be called again on next auth event
                    }
                    token = _lsToken2;
                }

                const controller = new AbortController();
                const timeoutId = setTimeout(() => controller.abort(), 5000); // 5s timeout

                const res = await fetch('/api/auth/ensure-profile', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        ...(token ? { 'Authorization': `Bearer ${token}` } : {}),
                    },
                    signal: controller.signal,
                    body: JSON.stringify({
                        user_id: user.id,
                        email: user.email,
                        full_name: user.user_metadata?.full_name || user.user_metadata?.poker_alias,
                        username: user.user_metadata?.poker_alias,
                        avatar_url: user.user_metadata?.avatar_url,
                        metadata: user.user_metadata
                    })
                });
                clearTimeout(timeoutId);
                const data = await res.json();
                if (data.created || data.isBrandNew) {
                    console.debug('[ANTIGRAVITY] Profile was missing or brand new - checking welcome modal for:', data.profile?.username);

                    // NEW USER WELCOME PACKAGE: Trigger welcome modal
                    // Only show once per user via localStorage flag
                    const welcomeKey = `sp-welcome-shown-${user.id}`;
                    if (!localStorage.getItem(welcomeKey)) {
                        setShowWelcomeModal(true);
                        // Dispatch VIP bus event so header updates immediately
                        window.dispatchEvent(new CustomEvent('vip-status-changed', { detail: { vipGranted: true } }));
                        // BUS EVENT: Hydrate diamond balance across the UI immediately
                        busEmit.diamondsEarned(0, 'Welcome Package Hydration');
                    }
                }
            } catch (err) {
                if (err.name === 'AbortError') {
                    console.warn('[ANTIGRAVITY] ensure-profile timed out (non-blocking)');
                } else {
                    console.warn('[ANTIGRAVITY] ensure-profile failed:', err);
                }
            }
        }

        // Listen for auth changes - this includes INITIAL_SESSION event
        const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
            console.debug('[AvatarContext] Auth event:', event, session?.user?.email || 'no session');

            // INITIAL_SESSION fires when Supabase restores session from localStorage
            if (event === 'INITIAL_SESSION') {
                if (session?.user) {
                    // Use the existing session IMMEDIATELY — don't block on refresh
                    console.debug('[AvatarContext] Session found, using immediately');
                    setUser(session.user);

                    // Run initialization steps concurrently, don't wait for profile generation to check VIP
                    ensureUserProfile(session.user, session).catch(e => console.warn('[AvatarContext] ensureUserProfile error:', e));
                    await fetchVipStatus(session.user.id);

                    // Background refresh — non-blocking, won't affect UI if it fails
                    supabase.auth.refreshSession().then(({ data, error }) => {
                        if (data?.session?.user && !error) {
                            console.debug('[AvatarContext] Background refresh succeeded');
                            setUser(data.session.user);
                        } else if (error) {
                            // Only clear session on permanent auth death (invalid_grant)
                            const isPermanent = error.message?.includes('invalid_grant') ||
                                error.message?.includes('Invalid Refresh Token');
                            if (isPermanent) {
                                console.warn('[AvatarContext] Permanent auth failure:', error.message);
                                setUser(null);
                                try { localStorage.removeItem('smarter-poker-auth'); } catch (_) { console.warn('[App] Handled exception:', _?.message || _); }
                            }
                            // Transient errors (timeout, network) — keep existing session
                        }
                    }).catch(e => { console.warn('[App] Handled promise rejection:', e?.message || e); });
                } else {
                    // No session from Supabase — try direct localStorage fallback
                    // This catches the case where navigator.locks AbortError killed session restoration
                    const fallbackUser = getAuthUser();
                    if (fallbackUser?.id) {
                        console.debug('[AvatarContext] INITIAL_SESSION empty but found user in localStorage fallback:', fallbackUser.email);
                        setUser(fallbackUser);
                        fetchVipStatus(fallbackUser.id);
                    } else {
                        // Truly not logged in
                        setUser(null);
                    }
                }
                setInitializing(false);
                return;
            }

            // SIGNED_OUT — always respect it
            if (event === 'SIGNED_OUT') {
                setUser(null);
                setIsVip(false);
                // Clear VIP cache so next user doesn't get stale VIP status
                try { localStorage.removeItem('sp-vip-status'); } catch (_) { console.warn('[App] Handled exception:', _?.message || _); }
                return;
            }

            // For other events (SIGNED_IN, TOKEN_REFRESHED, etc.)
            setUser(session?.user ?? null);
            if (session?.user) {
                if (event === 'SIGNED_IN') {
                    await ensureUserProfile(session.user, session);
                }
                await fetchVipStatus(session.user.id);
            }
        });

        // Fallback timeout: if INITIAL_SESSION never fires (edge case), mark as initialized after 5s
        const fallbackTimeout = setTimeout(() => {
            setInitializing(prev => {
                if (prev) {
                    console.warn('[AvatarContext] Fallback: marking initialized after timeout');
                    return false;
                }
                return prev;
            });
        }, 5000);

        return () => {
            subscription.unsubscribe();
            clearTimeout(fallbackTimeout);
        };
    }, []);

    // ═══════════════════════════════════════════════════════════════════
    // HARDENED: Listen for vip-status-changed bus events so gates
    // update immediately when VIP is granted mid-session (e.g., phone
    // verification). Also update localStorage cache for optimistic loads.
    // ═══════════════════════════════════════════════════════════════════
    useEffect(() => {
        function handleVipChange(e) {
            console.debug('[AvatarContext] VIP status change event received:', e.detail);
            const vipGranted = e.detail?.vipGranted !== false;
            setIsVip(vipGranted);
            try { localStorage.setItem('sp-vip-status', String(vipGranted)); } catch (_) { console.warn('[App] Handled exception:', _?.message || _); }
            // Also re-fetch from server to confirm (non-blocking)
            if (user?.id) {
                fetchVipStatus(user.id);
            }
        }

        function handleProfileUpdate(e) {
            console.debug('[AvatarContext] Profile update event received:', e.detail);
            const d = e.detail;
            if (!d) return; // Headers dispatch without detail — skip gracefully
            const { avatar_url, full_name, username } = d;

            setUser(prev => {
                if (!prev) return prev;
                // Create a clone of the user object to trigger React update
                const nextUser = { ...prev };
                if (!nextUser.user_metadata) nextUser.user_metadata = {};

                if (avatar_url) nextUser.user_metadata.avatar_url = avatar_url;
                if (full_name) nextUser.user_metadata.full_name = full_name;
                if (username) nextUser.user_metadata.poker_alias = username;

                return nextUser;
            });

            // If the user changed their basic profile pic, also update the active avatar state
            // so contextAvatar.imageUrl reflects the new image immediately
            if (d.avatar_url) {
                setAvatar(prev => ({
                    ...prev,
                    type: 'profile_upload',
                    imageUrl: d.avatar_url
                }));
            }
        }

        window.addEventListener('vip-status-changed', handleVipChange);
        window.addEventListener('profile-updated', handleProfileUpdate);
        return () => {
            window.removeEventListener('vip-status-changed', handleVipChange);
            window.removeEventListener('profile-updated', handleProfileUpdate);
        };
    }, [user]);

    // ═══════════════════════════════════════════════════════════════════
    // TIER 1: VIP Status Realtime Sync
    // Uses the shared useProfileRealtime hook instead of a dedicated channel.
    // Replaces the old `vip:{userId}` supabase.channel() call.
    // Also listens for cross-tab VIP sync via BroadcastChannel.
    // ═══════════════════════════════════════════════════════════════════
    useProfileRealtime(user?.id, {
        onVipUpdate: (vipStatus) => {
            setIsVip(vipStatus);
            try { localStorage.setItem('sp-vip-status', String(vipStatus)); } catch (_) { console.warn('[App] Handled exception:', _?.message || _); }
        },
    });

    useEffect(() => {
        if (!user?.id) return;
        const cleanupVipSync = listenBroadcast('smarter_poker_vip_sync', () => {
            fetchVipStatus(user.id);
        });
        return () => cleanupVipSync();
    }, [user?.id]);

    // ═════════════════════════════════════════════════════════════════════════════
    // TIER 2: Avatar Changes — event-driven (no Realtime channel)
    // The old `avatar:{userId}` postgres_changes channel watched for admin-side
    // avatar changes, which happen <0.1% of the time. Replaced with:
    //   1. window focus refetch — covers the remote-change case
    //   2. BroadcastChannel — cross-tab sync when the user changes their own avatar
    // ═════════════════════════════════════════════════════════════════════════════
    const loadAvatarRef = useRef(null);

    // Keep a stable ref so the focus handler always calls the latest loadAvatar
    useEffect(() => {
        loadAvatarRef.current = loadAvatar;
    });

    useEffect(() => {
        if (!user?.id) return;

        // Cross-tab sync: another tab changed the avatar
        const cleanupAvatarSync = listenBroadcast('smarter_poker_avatar_sync', (msg) => {
            if (msg === 'refresh') {
                console.debug('[AvatarContext] Avatar refresh via BroadcastChannel');
                loadAvatarRef.current?.();
            }
        });

        // Tab focus: pick up any admin/remote avatar change on next focus
        const handleFocus = () => {
            loadAvatarRef.current?.();
        };
        window.addEventListener('focus', handleFocus);

        return () => {
            cleanupAvatarSync();
            window.removeEventListener('focus', handleFocus);
        };
    }, [user?.id]);

    // Load user's avatar when the user IDENTITY changes.
    // BUGFIX (header-audit): the dep was `[user]` — the whole object. setUser is called
    // with a fresh object on INITIAL_SESSION, again on the background refreshSession,
    // again on every TOKEN_REFRESHED, and again from handleProfileUpdate's spread — so
    // loadAvatar re-ran (two DB queries each time) for the same user, over and over.
    // Keying on the id collapses that to once per actual identity change.
    useEffect(() => {
        if (user?.id) {
            loadAvatar();
        } else if (!user) {
            setAvatar(null);
            setLoading(false);
        }
    }, [user?.id]);

    async function loadAvatar() {
        if (!user) return;

        setLoading(true);
        try {
            const avatarData = await getUserAvatar(user.id);
            if (avatarData) {
                setAvatar(avatarData);
            } else {
                // NO ACTIVE CUSTOM/PRESET: Fallback to uploaded profile photo
                const { data: profile } = await supabase.from('profiles').select('avatar_url').eq('id', user.id).maybeSingle();
                if (profile?.avatar_url) {
                    setAvatar({ type: 'profile_upload', imageUrl: profile.avatar_url });
                } else if (user.user_metadata?.avatar_url) {
                    setAvatar({ type: 'profile_upload', imageUrl: user.user_metadata.avatar_url });
                } else {
                    setAvatar({
                        type: 'preset',
                        id: 'free_shark',
                        imageUrl: '/avatars/free/shark.png',
                        name: 'Poker Shark'
                    });
                }
            }
        } catch (error) {
            console.warn('Error loading avatar:', error);
            const profilePic = user.user_metadata?.avatar_url;
            if (profilePic) {
                setAvatar({ type: 'profile_upload', imageUrl: profilePic });
            } else {
                setAvatar({
                    type: 'preset',
                    id: 'free_shark',
                    imageUrl: '/avatars/free/shark.png',
                    name: 'Poker Shark'
                });
            }
        } finally {
            setLoading(false);
        }
    }

    async function selectPresetAvatar(avatarId) {
        if (!user) return { success: false, error: 'Not authenticated' };

        // Pass VIP status so the service can unlock the full library for VIP members
        const result = await setPresetAvatar(user.id, avatarId, { isVip });

        if (result.success) {
            await loadAvatar(); // Refresh avatar
            // Broadcast avatar change to other tabs
            broadcastSync('smarter_poker_avatar_sync', 'refresh');
            // Notify same-tab listeners (header, hamburger menu, open games)
            // that profiles.avatar_url changed
            if (result.imageUrl && typeof window !== 'undefined') {
                window.dispatchEvent(new CustomEvent('profile-updated', {
                    detail: { avatar_url: result.imageUrl }
                }));
            }
        }

        return result;
    }

    async function createCustomAvatar(prompt, isVip = false, photoFile = null) {
        if (!user) return { success: false, error: 'Not authenticated' };

        const result = await generateCustomAvatar(user.id, prompt, isVip, photoFile);

        if (result.success) {
            await loadAvatar(); // Refresh avatar
        }

        return result;
    }

    async function setActiveAvatar(imageUrl, type = 'custom', presetAvatarId = null, prompt = null) {
        if (!user) return { success: false, error: 'Not authenticated' };

        try {
            // Update user avatar in database using correct column names
            const { error } = await supabase
                .from('user_avatars')
                .upsert({
                    user_id: user.id,
                    preset_avatar_id: presetAvatarId,  // Correct column name
                    avatar_type: type,
                    custom_image_url: imageUrl,
                    custom_prompt: prompt,
                    is_active: true,
                    updated_at: new Date().toISOString()
                }, {
                    onConflict: 'user_id'  // Use the unique constraint
                });

            if (error) throw error;

            // Sync profiles.avatar_url so Club Arena, training games and the
            // header (all of which read profiles) see the new avatar too.
            if (imageUrl) {
                const { error: profileError } = await supabase
                    .from('profiles')
                    .update({ avatar_url: imageUrl })
                    .eq('id', user.id);
                if (profileError) console.warn('Profile avatar sync failed (non-fatal):', profileError.message);
            }

            await loadAvatar(); // Refresh avatar

            // Broadcast avatar change to other tabs
            broadcastSync('smarter_poker_avatar_sync', 'refresh');

            // Notify same-tab listeners that profiles.avatar_url changed
            if (imageUrl && typeof window !== 'undefined') {
                window.dispatchEvent(new CustomEvent('profile-updated', {
                    detail: { avatar_url: imageUrl }
                }));
            }

            return { success: true };
        } catch (error) {
            console.warn('Error setting active avatar:', error);
            return { success: false, error: error.message };
        }
    }

    const dismissWelcomeModal = () => {
        setShowWelcomeModal(false);
        // Persist so it never shows again for this user
        if (user?.id) {
            try { localStorage.setItem(`sp-welcome-shown-${user.id}`, 'true'); } catch (_) { console.warn('[App] Handled exception:', _?.message || _); }
        }
    };

    const value = {
        avatar,
        loading,
        user,
        isVip,
        initializing, // CRITICAL: Consumers must check this before showing "not logged in" UI
        showWelcomeModal,
        dismissWelcomeModal,
        selectPresetAvatar,
        createCustomAvatar,
        setActiveAvatar,
        refreshAvatar: loadAvatar,
        refreshUser
    };

    return (
        <AvatarContext.Provider value={value}>
            {children}
        </AvatarContext.Provider>
    );
}

export default AvatarContext;
