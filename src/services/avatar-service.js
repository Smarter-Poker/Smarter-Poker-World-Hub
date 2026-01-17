/**
 * 🎨 AVATAR SERVICE
 * Centralized service for managing user avatars across the ecosystem
 * Supports preset library avatars and custom AI-generated avatars
 */

import { createClient } from '@supabase/supabase-js';
import { getAll, getByTier, getAvatarById } from '../data/AVATAR_LIBRARY';

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

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
 * Generate and set a custom AI avatar using Replicate API
 */
export async function generateCustomAvatar(userId, prompt, isVip = false, photoFile = null) {
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

        // Generate avatar using AI API
        let generatedImageUrl;

        if (photoFile) {
            // Photo-based generation (likeness)
            generatedImageUrl = await generateAvatarFromPhoto(photoFile, prompt);
        } else {
            // Text-based generation
            generatedImageUrl = await generateAvatarFromText(prompt);
        }

        // Upload to Supabase Storage
        const timestamp = Date.now();
        const filename = `${userId}_${timestamp}.png`;
        const storagePath = `avatars/${userId}/${filename}`;

        // Download the generated image
        const imageResponse = await fetch(generatedImageUrl);
        const imageBlob = await imageResponse.blob();

        // Upload to Supabase Storage
        const { data: uploadData, error: uploadError } = await supabase.storage
            .from('custom-avatars')
            .upload(storagePath, imageBlob, {
                contentType: 'image/png',
                cacheControl: '3600'
            });

        if (uploadError) throw uploadError;

        // Get public URL
        const { data: { publicUrl } } = supabase.storage
            .from('custom-avatars')
            .getPublicUrl(storagePath);

        // Save to custom gallery
        const { data: galleryData, error: galleryError } = await supabase
            .from('custom_avatar_gallery')
            .insert({
                user_id: userId,
                image_url: publicUrl,
                prompt: prompt || 'Generated from photo'
            })
            .select()
            .single();

        if (galleryError) throw galleryError;

        // Set as active avatar
        const { error: setError } = await supabase.rpc('set_active_avatar', {
            p_user_id: userId,
            p_avatar_type: 'custom',
            p_custom_image_url: publicUrl,
            p_custom_prompt: prompt || 'Generated from photo'
        });

        if (setError) throw setError;

        return {
            success: true,
            imageUrl: publicUrl,
            prompt: prompt || 'Generated from photo'
        };
    } catch (error) {
        console.error('Error generating custom avatar:', error);
        return { success: false, error: error.message };
    }
}

/**
 * Generate avatar from photo using FLUX or Stable Diffusion
 */
async function generateAvatarFromPhoto(photoFile, additionalPrompt = '') {
    try {
        // Convert photo to base64
        const reader = new FileReader();
        const photoBase64 = await new Promise((resolve) => {
            reader.onload = (e) => resolve(e.target.result);
            reader.readAsDataURL(photoFile);
        });

        // Call Replicate API for image-to-image generation
        const response = await fetch('/api/avatar/generate-from-photo', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                photoBase64,
                prompt: additionalPrompt || 'Transform into a 3D Pixar-style poker avatar with white background, professional quality, detailed facial features'
            })
        });

        if (!response.ok) throw new Error('AI generation failed');

        const data = await response.json();
        return data.imageUrl;
    } catch (error) {
        console.error('Photo generation error:', error);
        throw error;
    }
}

/**
 * Generate avatar from text description using FLUX
 */
async function generateAvatarFromText(prompt) {
    try {
        const enhancedPrompt = `${prompt}, 3D Pixar style character portrait, white background, professional quality, detailed, vibrant colors, poker avatar`;

        // Call Replicate API for text-to-image generation
        const response = await fetch('/api/avatar/generate-from-text', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ prompt: enhancedPrompt })
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
        // Get all unlocked avatar IDs
        const { data: unlocks } = await supabase
            .from('avatar_unlocks')
            .select('avatar_id')
            .eq('user_id', userId);

        const unlockedIds = new Set(unlocks?.map(u => u.avatar_id) || []);

        // Get all avatars from library
        let avatars = tierFilter === 'all' ? getAll() : getByTier(tierFilter);

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
