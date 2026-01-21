/**
 * 🎨 AVATAR SERVICE
 * Centralized service for managing user avatars across the ecosystem
 * Supports preset library avatars and custom AI-generated avatars
 */

import supabase from '../lib/supabase.ts';
import { getAll, getByTier, getAvatarById } from '../data/AVATAR_LIBRARY';

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
            const avatarData = getAvatarById(data.preset_avatar_id);
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
 * Generate and set a custom AI avatar using OpenAI DALL-E
 * The API handles image download and Supabase upload server-side
 */
export async function generateCustomAvatar(userId, prompt, isVip = false, photoFile = null) {
    try {
        // Check limits based on user tier
        if (isVip) {
            // VIP: Check ACTIVE avatars only (can delete to make room)
            const activeCustom = await supabase
                .from('custom_avatar_gallery')
                .select('id')
                .eq('user_id', userId)
                .eq('is_deleted', false);

            const activeCount = activeCustom.data?.length || 0;
            if (activeCount >= 5) {
                throw new Error(`VIP limit reached! You have ${activeCount}/5 custom avatars. Please delete one to create a new avatar.`);
            }
        } else {
            // FREE: Check ALL avatars ever created (including deleted - one time only!)
            const allCustom = await supabase
                .from('custom_avatar_gallery')
                .select('id')
                .eq('user_id', userId);

            const totalEver = allCustom.data?.length || 0;
            if (totalEver >= 1) {
                throw new Error('FREE users get 1 custom avatar (one time only). Upgrade to VIP for up to 5!');
            }
        }

        // Generate avatar using AI API (API handles storage upload)
        let generatedImageUrl;

        if (photoFile) {
            // Photo-based generation (likeness)
            generatedImageUrl = await generateAvatarFromPhoto(photoFile, prompt, userId);
        } else {
            // Text-based generation
            generatedImageUrl = await generateAvatarFromText(prompt, userId);
        }

        // The API already uploaded to Supabase and returned the public URL
        // Now just save to gallery and set as active

        // Save to custom gallery
        const { data: galleryData, error: galleryError } = await supabase
            .from('custom_avatar_gallery')
            .insert({
                user_id: userId,
                image_url: generatedImageUrl,
                prompt: prompt || 'Generated from photo'
            })
            .select()
            .single();

        if (galleryError) {
            console.error('Gallery save error:', galleryError);
            // Don't throw - avatar was still generated successfully
        }

        // Set as active avatar using database function
        const { error: setError } = await supabase.rpc('set_active_avatar', {
            p_user_id: userId,
            p_avatar_type: 'custom',
            p_custom_image_url: generatedImageUrl,
            p_custom_prompt: prompt || 'Generated from photo'
        });

        if (setError) {
            console.error('Set active avatar error:', setError);
            // Don't throw - avatar was still generated successfully
        }

        return {
            success: true,
            imageUrl: generatedImageUrl,
            prompt: prompt || 'Generated from photo'
        };
    } catch (error) {
        console.error('Error generating custom avatar:', error);
        return { success: false, error: error.message };
    }
}

/**
 * Generate avatar from photo using GPT-4 Vision + DALL-E 3
 */
async function generateAvatarFromPhoto(photoFile, additionalPrompt = '', userId = null) {
    try {
        // Convert photo to base64 with proper error handling
        const reader = new FileReader();
        const photoBase64 = await new Promise((resolve, reject) => {
            reader.onload = (e) => resolve(e.target.result);
            reader.onerror = (e) => reject(new Error('Failed to read photo file'));
            reader.onabort = () => reject(new Error('Photo read was aborted'));
            reader.readAsDataURL(photoFile);
        });

        console.log('📏 Photo base64 length:', photoBase64?.length || 0);

        // Call API for image-to-image generation with a 90 second timeout
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 90000); // 90 second timeout

        try {
            const response = await fetch('/api/avatar/generate-from-photo', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    photoBase64,
                    prompt: additionalPrompt,
                    userId
                }),
                signal: controller.signal
            });

            clearTimeout(timeoutId);

            if (!response.ok) {
                const errorData = await response.json().catch(() => ({}));
                throw new Error(errorData.error || `AI generation failed (HTTP ${response.status})`);
            }

            const data = await response.json();
            return data.imageUrl;
        } catch (fetchError) {
            clearTimeout(timeoutId);
            if (fetchError.name === 'AbortError') {
                throw new Error('Avatar generation timed out. Please try again with a smaller image.');
            }
            throw fetchError;
        }
    } catch (error) {
        console.error('Photo generation error:', error);
        throw error;
    }
}

/**
 * Generate avatar from text description using DALL-E 3
 */
async function generateAvatarFromText(prompt, userId = null) {
    try {
        // Call OpenAI API for text-to-image generation
        // The API now handles the full prompt enhancement
        const response = await fetch('/api/avatar/generate-from-text', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ prompt, userId })
        });

        if (!response.ok) throw new Error('AI generation failed');

        const data = await response.json();
        return data.imageUrl;
    } catch (error) {
        console.error('Text generation error:', error);
        throw error;
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
        let unlockedIds = new Set();

        // Only query unlocks if user is logged in
        if (userId) {
            const { data: unlocks } = await supabase
                .from('avatar_unlocks')
                .select('avatar_id')
                .eq('user_id', userId);
            unlockedIds = new Set(unlocks?.map(u => u.avatar_id) || []);
        }

        // Get all avatars from library
        let avatars = tierFilter === 'all' ? getAll() : getByTier(tierFilter);

        // Mark locked status (VIP avatars locked if not in unlocked set)
        // FREE avatars are always unlocked
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
