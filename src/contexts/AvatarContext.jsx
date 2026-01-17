/**
 * 🎨 AVATAR CONTEXT
 * Global context provider for user avatar state
 * Makes avatar available throughout the entire app
 */

import React, { createContext, useContext, useState, useEffect } from 'react';
import supabase from '../lib/supabase.ts';
import { getUserAvatar, setPresetAvatar, generateCustomAvatar } from '../services/avatar-service';

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
                // Fallback: check session metadata
                const { data: { user: freshUser } } = await supabase.auth.getUser();
                setIsVip(freshUser?.user_metadata?.is_vip || false);
            }
        } catch (err) {
            console.error('Error fetching VIP status:', err);
            // Fallback to metadata on any error
            try {
                const { data: { user: freshUser } } = await supabase.auth.getUser();
                setIsVip(freshUser?.user_metadata?.is_vip || false);
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

    // Load user on mount
    useEffect(() => {
        const fetchUser = async () => {
            const { data: { user } } = await supabase.auth.getUser();
            setUser(user);
            if (user) {
                await fetchVipStatus(user.id);
            }
        };
        fetchUser();

        // Listen for auth changes
        const { data: { subscription } } = supabase.auth.onAuthStateChange(async (_event, session) => {
            setUser(session?.user ?? null);
            if (session?.user) {
                await fetchVipStatus(session.user.id);
            }
        });

        return () => subscription.unsubscribe();
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

    async function setActiveAvatar(imageUrl, type = 'custom', avatarId = null, prompt = null) {
        if (!user) return { success: false, error: 'Not authenticated' };

        try {
            // Update user avatar in database
            const { error } = await supabase
                .from('user_avatars')
                .upsert({
                    user_id: user.id,
                    avatar_id: avatarId,
                    avatar_type: type,
                    custom_image_url: imageUrl,
                    custom_prompt: prompt,
                    updated_at: new Date().toISOString()
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
