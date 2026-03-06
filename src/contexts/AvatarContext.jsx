/**
 * 🎨 AVATAR CONTEXT
 * Global context provider for user avatar state
 * Makes avatar available throughout the entire app
 */

import React, { createContext, useContext, useState, useEffect } from 'react';
import supabase from '../lib/supabase.ts';
import { getUserAvatar, setPresetAvatar, generateCustomAvatar } from '../services/avatar-service';
import { getAuthUser } from '../lib/authUtils';

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
    const [avatar, setAvatar] = useState(null);
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
            const { data: { session: currentSession } } = await supabase.auth.getSession();
            const headers = {};
            if (currentSession?.access_token) {
                headers['Authorization'] = `Bearer ${currentSession.access_token}`;
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
                try { localStorage.setItem('sp-vip-status', String(vipStatus)); } catch (_) { }
            } else {
                // 🛡️ BULLETPROOF: Fallback to localStorage instead of getUser()
                const localUser = getAuthUser();
                setIsVip(localUser?.user_metadata?.is_vip || false);
            }
        } catch (err) {
            console.error('Error fetching VIP status:', err);
            // 🛡️ BULLETPROOF: Fallback to localStorage on any error
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
        const { data: { user: freshUser }, error } = await supabase.auth.refreshSession();
        if (freshUser && !error) {
            setUser(freshUser);
            await fetchVipStatus(freshUser.id);
        }
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
                    const { data: { session: currentSession } } = await supabase.auth.getSession();
                    if (!currentSession?.access_token) {
                        console.warn('[AvatarContext] ensureUserProfile skipped — no auth token available yet');
                        return; // Skip silently — will be called again on next auth event
                    }
                    token = currentSession.access_token;
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
                if (data.created) {
                    console.log('[ANTIGRAVITY] Profile was missing - created:', data.profile?.username);

                    // ═════════════════════════════════════════════════════════════
                    // NEW USER WELCOME PACKAGE: Trigger welcome modal
                    // Only show once per user via localStorage flag
                    // ═════════════════════════════════════════════════════════════
                    const welcomeKey = `sp-welcome-shown-${user.id}`;
                    if (!localStorage.getItem(welcomeKey)) {
                        setShowWelcomeModal(true);
                        // Dispatch VIP bus event so header updates immediately
                        window.dispatchEvent(new CustomEvent('vip-status-changed', { detail: { vipGranted: true } }));
                    }
                }
            } catch (err) {
                if (err.name === 'AbortError') {
                    console.warn('[ANTIGRAVITY] ensure-profile timed out (non-blocking)');
                } else {
                    console.error('[ANTIGRAVITY] ensure-profile failed:', err);
                }
            }
        }

        // Listen for auth changes - this includes INITIAL_SESSION event
        const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
            console.log('[AvatarContext] Auth event:', event, session?.user?.email || 'no session');

            // INITIAL_SESSION fires when Supabase restores session from localStorage
            if (event === 'INITIAL_SESSION') {
                if (session?.user) {
                    // Use the existing session IMMEDIATELY — don't block on refresh
                    console.log('[AvatarContext] Session found, using immediately');
                    setUser(session.user);

                    // Run initialization steps concurrently, don't wait for profile generation to check VIP
                    ensureUserProfile(session.user, session).catch(e => console.error('[AvatarContext] ensureUserProfile error:', e));
                    await fetchVipStatus(session.user.id);

                    // Background refresh — non-blocking, won't affect UI if it fails
                    supabase.auth.refreshSession().then(({ data, error }) => {
                        if (data?.session?.user && !error) {
                            console.log('[AvatarContext] Background refresh succeeded');
                            setUser(data.session.user);
                        } else if (error) {
                            // Only clear session on permanent auth death (invalid_grant)
                            const isPermanent = error.message?.includes('invalid_grant') ||
                                error.message?.includes('Invalid Refresh Token');
                            if (isPermanent) {
                                console.error('[AvatarContext] Permanent auth failure:', error.message);
                                setUser(null);
                                try { localStorage.removeItem('smarter-poker-auth'); } catch (_) { }
                            }
                            // Transient errors (timeout, network) — keep existing session
                        }
                    }).catch(() => { /* Network failure — keep existing session */ });
                } else {
                    // No session — user is not logged in
                    setUser(null);
                }
                setInitializing(false);
                return;
            }

            // SIGNED_OUT — always respect it
            if (event === 'SIGNED_OUT') {
                setUser(null);
                setIsVip(false);
                // Clear VIP cache so next user doesn't get stale VIP status
                try { localStorage.removeItem('sp-vip-status'); } catch (_) { }
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
            console.log('[AvatarContext] 🚌 vip-status-changed received:', e.detail);
            const vipGranted = e.detail?.vipGranted !== false;
            setIsVip(vipGranted);
            try { localStorage.setItem('sp-vip-status', String(vipGranted)); } catch (_) { }
            // Also re-fetch from server to confirm (non-blocking)
            if (user?.id) {
                fetchVipStatus(user.id);
            }
        }

        function handleProfileUpdate(e) {
            console.log('[AvatarContext] 🚌 profile-updated received:', e.detail);
            const { avatar_url, full_name, username } = e.detail;

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
            if (avatar_url) {
                setAvatar(prev => ({
                    ...prev,
                    type: 'profile_upload',
                    imageUrl: avatar_url
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

    // Load user's avatar when user changes
    useEffect(() => {
        if (user) {
            loadAvatar();
        } else {
            setAvatar(null);
            setLoading(false);
        }
    }, [user]);

    async function loadAvatar() {
        if (!user) return;

        setLoading(true);
        try {
            const avatarData = await getUserAvatar(user.id);
            setAvatar(avatarData);
        } catch (error) {
            console.error('Error loading avatar:', error);
        } finally {
            setLoading(false);
        }
    }

    async function selectPresetAvatar(avatarId) {
        if (!user) return { success: false, error: 'Not authenticated' };

        const result = await setPresetAvatar(user.id, avatarId);

        if (result.success) {
            await loadAvatar(); // Refresh avatar
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

            await loadAvatar(); // Refresh avatar
            return { success: true };
        } catch (error) {
            console.error('Error setting active avatar:', error);
            return { success: false, error: error.message };
        }
    }

    const dismissWelcomeModal = () => {
        setShowWelcomeModal(false);
        // Persist so it never shows again for this user
        if (user?.id) {
            try { localStorage.setItem(`sp-welcome-shown-${user.id}`, 'true'); } catch (_) { }
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
