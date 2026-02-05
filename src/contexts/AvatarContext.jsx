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
    const [isVip, setIsVip] = useState(false);
    // CRITICAL: Track auth initialization to prevent race condition
    // This stays true until INITIAL_SESSION event fires from Supabase
    const [initializing, setInitializing] = useState(true);

    // Fetch VIP status directly from database (not cached session)
    async function fetchVipStatus(userId) {
        if (!userId) {
            setIsVip(false);
            return;
        }
        try {
            // Set a 5 second timeout for the RPC call
            const timeoutPromise = new Promise((_, reject) =>
                setTimeout(() => reject(new Error('VIP status check timeout')), 5000)
            );

            const rpcPromise = supabase.rpc('get_user_vip_status', { p_user_id: userId });

            const { data, error } = await Promise.race([rpcPromise, timeoutPromise]);

            if (!error && data !== null) {
                setIsVip(data === true);
            } else {
                // 🛡️ BULLETPROOF: Fallback to localStorage instead of getUser()
                const localUser = getAuthUser();
                setIsVip(localUser?.user_metadata?.is_vip || false);
            }
        } catch (err) {
            console.error('Error fetching VIP status:', err);
            // 🛡️ BULLETPROOF: Fallback to localStorage on any error
            try {
                const localUser = getAuthUser();
                setIsVip(localUser?.user_metadata?.is_vip || false);
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
        // 🛡️ ANTIGRAVITY: Ensure user has profile (catches orphaned users)
        async function ensureUserProfile(user) {
            if (!user) return;
            try {
                const res = await fetch('/api/auth/ensure-profile', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        user_id: user.id,
                        email: user.email,
                        full_name: user.user_metadata?.full_name || user.user_metadata?.poker_alias,
                        username: user.user_metadata?.poker_alias,
                        avatar_url: user.user_metadata?.avatar_url,
                        metadata: user.user_metadata
                    })
                });
                const data = await res.json();
                if (data.created) {
                    console.log('[ANTIGRAVITY] Profile was missing - created:', data.profile?.username);
                }
            } catch (err) {
                console.error('[ANTIGRAVITY] ensure-profile failed:', err);
            }
        }

        // Listen for auth changes - this includes INITIAL_SESSION event
        const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
            console.log('[AvatarContext] Auth event:', event, session?.user?.email || 'no session');

            // INITIAL_SESSION fires when Supabase restores session from localStorage
            if (event === 'INITIAL_SESSION') {
                // If we have a session, FORCE REFRESH to renew potentially expired tokens
                if (session?.user) {
                    console.log('[AvatarContext] Session found, forcing refresh to renew tokens...');
                    try {
                        // 🛡️ CRITICAL: Use timeout to prevent infinite hang on corrupted tokens
                        const refreshPromise = supabase.auth.refreshSession();
                        const timeoutPromise = new Promise((_, reject) =>
                            setTimeout(() => reject(new Error('Session refresh timeout - clearing corrupted auth')), 3000)
                        );
                        const { data: refreshData, error: refreshError } = await Promise.race([refreshPromise, timeoutPromise]);

                        if (refreshError) {
                            console.error('[AvatarContext] Session refresh failed:', refreshError.message);
                            // Session is invalid, clear it AND remove corrupted localStorage key
                            // This breaks the infinite SIGNED_OUT loop that causes 0/0/LV1 bug
                            setUser(null);
                            try {
                                localStorage.removeItem('smarter-poker-auth');
                                console.log('[AvatarContext] Cleared corrupted auth key to break loop');
                            } catch (e) {
                                console.warn('[AvatarContext] Failed to clear auth key:', e);
                            }
                        } else if (refreshData?.session?.user) {
                            console.log('[AvatarContext] Session refreshed successfully');
                            setUser(refreshData.session.user);
                            // 🛡️ ANTIGRAVITY: Ensure profile exists
                            await ensureUserProfile(refreshData.session.user);
                            await fetchVipStatus(refreshData.session.user.id);
                        } else {
                            setUser(null);
                        }
                    } catch (err) {
                        console.error('[AvatarContext] Refresh exception (likely timeout):', err.message);
                        setUser(null);
                        // Clear corrupted auth key on exception/timeout
                        try {
                            localStorage.removeItem('smarter-poker-auth');
                            // Also clear any sb-* legacy keys
                            Object.keys(localStorage).filter(k => k.startsWith('sb-') && k.includes('auth')).forEach(k => localStorage.removeItem(k));
                            console.log('[AvatarContext] Cleared corrupted auth keys after timeout');
                        } catch (e) { /* ignore */ }
                    }
                } else {
                    // No session at all
                    setUser(null);
                }
                setInitializing(false);
                return; // Don't process further for INITIAL_SESSION
            }

            // For other events (SIGNED_IN, SIGNED_OUT, TOKEN_REFRESHED, etc.)
            setUser(session?.user ?? null);
            if (session?.user) {
                // 🛡️ ANTIGRAVITY: Ensure profile exists on EVERY sign-in event
                if (event === 'SIGNED_IN') {
                    await ensureUserProfile(session.user);
                }
                await fetchVipStatus(session.user.id);
            }
        });

        // Fallback timeout: if INITIAL_SESSION never fires (edge case), mark as initialized after 3s
        const fallbackTimeout = setTimeout(() => {
            setInitializing(prev => {
                if (prev) {
                    console.warn('[AvatarContext] Fallback: marking initialized after timeout');
                    return false;
                }
                return prev;
            });
        }, 3000);

        return () => {
            subscription.unsubscribe();
            clearTimeout(fallbackTimeout);
        };
    }, []);

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

    const value = {
        avatar,
        loading,
        user,
        isVip,
        initializing, // CRITICAL: Consumers must check this before showing "not logged in" UI
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
