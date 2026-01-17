/**
 * 🎨 AVATAR SERVICE
 * Centralized service for managing user avatars across the ecosystem
 * Supports preset library avatars and custom AI-generated avatars
 */

import { supabase } from '../lib/supabaseClient';
import { AVATAR_LIBRARY } from '../data/AVATAR_LIBRARY';

/**
 * Get user's current active avatar
 */
export async function getUserAvatar(userId) {
    try {
        const { data, error } = await supabase
            .from('user_avatars')
            .select('*')
            .eq('user_id', userId)
            .eq('is_active', true)
            .single();

        if (error && error.code !== 'PGRST116') {
            // PGRST116 is "no rows returned" - not an error for new users
            throw error;
        }

        // If no avatar set, return default
        if (!data) {
            return {
                type: 'preset',
                id: 'free_shark',
                imageUrl: '/avatars/free/shark.png',
                name: 'Poker Shark'
            };
        }

        // Return formatted avatar
        if (data.avatar_type === 'preset') {
            const avatarData = AVATAR_LIBRARY.getById(data.preset_avatar_id);
            return {
                type: 'preset',
                id: data.preset_avatar_id,
                imageUrl: avatarData?.image || '/avatars/free/shark.png',
                name: avatarData?.name || 'Avatar'
            };
        } else {
            return {
                type: 'custom',
                imageUrl: data.custom_image_url,
                prompt: data.custom_prompt,
                name: 'Custom Avatar'
            };
        }
    } catch (error) {
        console.error('Error fetching user avatar:', error);
        return {
            type: 'preset',
            id: 'free_shark',
            imageUrl: '/avatars/free/shark.png',
            name: 'Poker Shark'
        };
    }
}

/**
 * Set a preset avatar from the library
 */
export async function setPresetAvatar(userId, avatarId) {
    try {
        // Check if avatar is unlocked
        const isUnlocked = await isAvatarUnlocked(userId, avatarId);

        if (!isUnlocked) {
            throw new Error('Avatar is locked. Unlock it first!');
        }

        // Use the database function to set active avatar
        const { data, error } = await supabase.rpc('set_active_avatar', {
            p_user_id: userId,
            p_avatar_type: 'preset',
            p_preset_avatar_id: avatarId
        });

        if (error) throw error;

        return { success: true, avatarId };
    } catch (error) {
        console.error('Error setting preset avatar:', error);
        return { success: false, error: error.message };
    }
}

/**
 * Generate and set a custom AI avatar
 */
export async function generateCustomAvatar(userId, prompt, isVip = false) {
    try {
        // Check limits: FREE users get 1 custom avatar, VIP unlimited
        if (!isVip) {
            const existingCustom = await supabase
                .from('custom_avatar_gallery')
                .select('id')
                .eq('user_id', userId)
                .eq('is_deleted', false);

            if (existingCustom.data && existingCustom.data.length >= 1) {
                throw new Error('FREE users can only create 1 custom avatar. Upgrade to VIP for unlimited!');
            }
        }

        // TODO: Replace with actual AI generation API call
        // For now, return a placeholder
        const imageUrl = `/avatars/custom/${userId}_${Date.now()}.png`;

        // Save to custom gallery
        const { data: galleryData, error: galleryError } = await supabase
            .from('custom_avatar_gallery')
            .insert({
                user_id: userId,
                image_url: imageUrl,
                prompt: prompt
            })
            .select()
            .single();

        if (galleryError) throw galleryError;

        // Set as active avatar
        const { error: setError } = await supabase.rpc('set_active_avatar', {
            p_user_id: userId,
            p_avatar_type: 'custom',
            p_custom_image_url: imageUrl,
            p_custom_prompt: prompt
        });

        if (setError) throw setError;

        return {
            success: true,
            imageUrl,
            prompt
        };
    } catch (error) {
        console.error('Error generating custom avatar:', error);
        return { success: false, error: error.message };
    }
}

/**
 * Check if an avatar is unlocked for a user
 */
export async function isAvatarUnlocked(userId, avatarId) {
    try {
        // All FREE avatars are unlocked by default
        if (avatarId.startsWith('free_')) {
            return true;
        }

        // Check unlock table for VIP avatars
        const { data, error } = await supabase
            .from('avatar_unlocks')
            .select('id')
            .eq('user_id', userId)
            .eq('avatar_id', avatarId)
            .single();

        if (error && error.code !== 'PGRST116') throw error;

        return !!data;
    } catch (error) {
        console.error('Error checking avatar unlock:', error);
        return false;
    }
}

/**
 * Get all available avatars for a user (filtered by unlocks)
 */
export async function getAvailableAvatars(userId, tierFilter = 'all') {
    try {
        // Get all unlocked avatar IDs
        const { data: unlocks } = await supabase
            .from('avatar_unlocks')
            .select('avatar_id')
            .eq('user_id', userId);

        const unlockedIds = new Set(unlocks?.map(u => u.avatar_id) || []);

        // Get all avatars from library
        let avatars = AVATAR_LIBRARY.getAll();

        // Filter by tier
        if (tierFilter !== 'all') {
            avatars = AVATAR_LIBRARY.getByTier(tierFilter.toUpperCase());
        }

        // Mark locked status
        return avatars.map(avatar => ({
            ...avatar,
            isLocked: avatar.tier === 'VIP' && !unlockedIds.has(avatar.id)
        }));
    } catch (error) {
        console.error('Error fetching available avatars:', error);
        return [];
    }
}

/**
 * Unlock a VIP avatar (via purchase or achievement)
 */
export async function unlockAvatar(userId, avatarId, method = 'vip_purchase') {
    try {
        const { data, error } = await supabase
            .from('avatar_unlocks')
            .insert({
                user_id: userId,
                avatar_id: avatarId,
                unlock_method: method
            })
            .select()
            .single();

        if (error) throw error;

        return { success: true, avatarId };
    } catch (error) {
        console.error('Error unlocking avatar:', error);
        return { success: false, error: error.message };
    }
}

/**
 * Get user's custom avatar gallery
 */
export async function getCustomAvatarGallery(userId) {
    try {
        const { data, error } = await supabase
            .from('custom_avatar_gallery')
            .select('*')
            .eq('user_id', userId)
            .eq('is_deleted', false)
            .order('created_at', { ascending: false });

        if (error) throw error;

        return data || [];
    } catch (error) {
        console.error('Error fetching custom avatar gallery:', error);
        return [];
    }
}

/**
 * Delete a custom avatar from gallery
 */
export async function deleteCustomAvatar(userId, avatarId) {
    try {
        const { error } = await supabase
            .from('custom_avatar_gallery')
            .update({ is_deleted: true })
            .eq('id', avatarId)
            .eq('user_id', userId);

        if (error) throw error;

        return { success: true };
    } catch (error) {
        console.error('Error deleting custom avatar:', error);
        return { success: false, error: error.message };
    }
}

/**
 * Initialize FREE avatars for a new user
 */
export async function initializeFreeAvatars(userId) {
    try {
        const { error } = await supabase.rpc('unlock_free_avatars', {
            p_user_id: userId
        });

        if (error) throw error;

        return { success: true };
    } catch (error) {
        console.error('Error initializing free avatars:', error);
        return { success: false, error: error.message };
    }
}

export default {
    getUserAvatar,
    setPresetAvatar,
    generateCustomAvatar,
    isAvatarUnlocked,
    getAvailableAvatars,
    unlockAvatar,
    getCustomAvatarGallery,
    deleteCustomAvatar,
    initializeFreeAvatars
};
