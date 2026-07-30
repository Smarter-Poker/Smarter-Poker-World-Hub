/**
 * 🎨 AVATAR SERVICE
 * Centralized service for managing user avatars across the ecosystem
 * Supports preset library avatars and custom AI-generated avatars
 */

import supabase from '../lib/supabase';
import { getAll, getByTier, getAvatarById } from '../data/AVATAR_LIBRARY';

/**
 * Resolve a preset avatar id to its library entry, tolerating the legacy
 * `free_shark` / `vip_wolf` id scheme (old DB rows + unlock_free_avatars RPC)
 * alongside the current `free-animal-001` library ids.
 */
export function resolvePresetAvatar(avatarId) {
    if (!avatarId) return null;

    const entry = getAvatarById(avatarId);
    if (entry) return entry;

    // Legacy scheme: `{tier}_{filename}` maps directly to /avatars/{tier}/{filename}.png
    const legacy = /^(free|vip)_(.+)$/.exec(avatarId);
    if (legacy) {
        const [, tier, slug] = legacy;
        const image = `/avatars/${tier}/${slug}.png`;
        // Prefer the real library entry if one uses this image
        const byImage = getAll().find(a => a.image === image);
        if (byImage) return byImage;
        return {
            id: avatarId,
            name: slug.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()),
            tier: tier.toUpperCase(),
            category: 'archetypes',
            image
        };
    }

    return null;
}

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
            .maybeSingle();

        if (error && error.code !== 'PGRST116') {
            // PGRST116 is "no rows returned" - not an error for new users
            throw error;
        }

        // If no active custom/preset avatar is set, return null so AvatarContext can fall back to profile uploads
        if (!data) {
            return null;
        }

        // Return formatted avatar
        if (data.avatar_type === 'preset') {
            const avatarData = resolvePresetAvatar(data.preset_avatar_id);
            return {
                type: 'preset',
                // Normalize legacy ids (free_shark) to the library id so
                // selected-state checks in the gallery match up
                id: avatarData?.id || data.preset_avatar_id,
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
        console.warn('Error fetching user avatar:', error);
        return null;
    }
}

/**
 * Set a preset avatar from the library
 * @param {string} userId
 * @param {string} avatarId
 * @param {object} [opts]
 * @param {boolean} [opts.isVip]   - VIP members have the whole library unlocked
 */
export async function setPresetAvatar(userId, avatarId, opts = {}) {
    try {
        // Check if avatar is unlocked (FREE tier always is; VIP tier for VIP members
        // or via an explicit avatar_unlocks row from a purchase/achievement)
        const isUnlocked = await isAvatarUnlocked(userId, avatarId, opts.isVip === true);

        if (!isUnlocked) {
            throw new Error('This avatar is VIP-only. Upgrade to VIP to unlock it!');
        }

        const entry = resolvePresetAvatar(avatarId);
        const imageUrl = entry?.image || null;

        // Use the database function to set active avatar.
        // p_image_url lets the RPC sync profiles.avatar_url so Club Arena,
        // training games and the header all pick up the change.
        const { error } = await supabase.rpc('set_active_avatar', {
            p_user_id: userId,
            p_avatar_type: 'preset',
            p_preset_avatar_id: avatarId,
            p_image_url: imageUrl
        });

        if (error) {
            // FALLBACK: direct table writes (covers environments where the RPC
            // signature hasn't been migrated yet). RLS restricts both writes
            // to the caller's own rows.
            console.warn('set_active_avatar RPC failed, falling back to direct write:', error.message);
            const { error: upsertError } = await supabase
                .from('user_avatars')
                .upsert({
                    user_id: userId,
                    avatar_type: 'preset',
                    preset_avatar_id: avatarId,
                    custom_image_url: null,
                    custom_prompt: null,
                    is_active: true,
                    updated_at: new Date().toISOString()
                }, { onConflict: 'user_id' });
            if (upsertError) throw upsertError;
        }

        // Belt & braces: make sure profiles.avatar_url reflects the new avatar
        // even on the fallback path (ignore failure — RPC path already synced it).
        if (imageUrl) {
            try {
                await supabase.from('profiles').update({ avatar_url: imageUrl }).eq('id', userId);
            } catch (_) { /* non-fatal */ }
        }

        return { success: true, avatarId, imageUrl };
    } catch (error) {
        console.warn('Error setting preset avatar:', error);
        return { success: false, error: error.message };
    }
}

/**
 * Generate and set a custom AI avatar using OpenAI DALL-E
 * The API handles image download and Supabase upload server-side
 */
export async function generateCustomAvatar(userId, prompt, isVip = false, photoFile = null) {
    try {
        console.debug('🎨 generateCustomAvatar called with:', {
            userId,
            prompt,
            isVip,
            hasPhotoFile: !!photoFile,
            photoFileName: photoFile?.name,
            photoFileSize: photoFile?.size,
            photoFileType: photoFile?.type
        });

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
            console.debug('📸 Using PHOTO-based generation (likeness mode)');
            // Photo-based generation (likeness)
            generatedImageUrl = await generateAvatarFromPhoto(photoFile, prompt, userId);
        } else {
            console.debug('📝 Using TEXT-based generation (no photo)');
            // Text-based generation
            generatedImageUrl = await generateAvatarFromText(prompt, userId);
        }

        // The API already uploaded to Supabase and returned the public URL
        // DON'T auto-save to gallery - only save when user clicks "Accept Avatar"

        // REMOVED AUTO-SAVE: User must click "Accept Avatar" to save to gallery
        /*
        // Save to custom gallery
        const { data: galleryData, error: galleryError } = await supabase
            .from('custom_avatar_gallery')
            .insert({
                user_id: userId,
                image_url: generatedImageUrl,
                prompt: prompt || 'Generated from photo'
            })
            .select()
            .maybeSingle();

        if (galleryError) {
            console.warn('Gallery save error:', galleryError);
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
            console.warn('Set active avatar error:', setError);
            // Don't throw - avatar was still generated successfully
        }
        */

        return {
            success: true,
            imageUrl: generatedImageUrl,
            prompt: prompt || 'Generated from photo'
        };
    } catch (error) {
        console.warn('Error generating custom avatar:', error);
        return { success: false, error: error.message };
    }
}

/**
 * Generate avatar from photo using GPT-4 Vision + DALL-E 3
 */
async function generateAvatarFromPhoto(photoFile, additionalPrompt = '', userId = null) {
    try {
        // Get auth token for JWT-authenticated endpoint (BUG #266 FIX requires it)
        let token = null;
        try {
            token = JSON.parse(localStorage.getItem('smarter-poker-auth') || '{}').access_token;
        } catch (_) { console.warn('[App] Handled exception:', _?.message || _); }

        if (!token) {
            throw new Error('Authentication required. Please sign in and try again.');
        }

        // Convert photo to base64 with proper error handling
        const reader = new FileReader();
        const photoBase64 = await new Promise((resolve, reject) => {
            reader.onload = (e) => resolve(e.target.result);
            reader.onerror = (e) => reject(new Error('Failed to read photo file'));
            reader.onabort = () => reject(new Error('Photo read was aborted'));
            reader.readAsDataURL(photoFile);
        });

        console.debug('📏 Photo base64 length:', photoBase64?.length || 0);

        // Call API for image-to-image generation with a 90 second timeout
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 90000); // 90 second timeout

        try {
            const response = await fetch('/api/avatar/generate-from-photo', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
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
        console.warn('Photo generation error:', error);
        throw error;
    }
}

/**
 * Generate avatar from text description using DALL-E 3
 */
async function generateAvatarFromText(prompt, userId = null) {
    try {
        // Get auth token for JWT-authenticated endpoint (BUG #266 FIX requires it)
        let token = null;
        try {
            token = JSON.parse(localStorage.getItem('smarter-poker-auth') || '{}').access_token;
        } catch (_) { console.warn('[App] Handled exception:', _?.message || _); }

        if (!token) {
            throw new Error('Authentication required. Please sign in and try again.');
        }

        // 90 second timeout to match photo-based generation
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 90000);

        try {
            const response = await fetch('/api/avatar/generate-from-text', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify({ prompt, userId }),
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
                throw new Error('Avatar generation timed out. Please try again.');
            }
            throw fetchError;
        }
    } catch (error) {
        console.warn('Text generation error:', error);
        throw error;
    }
}

/**
 * Check if an avatar is unlocked for a user
 * @param {string} userId
 * @param {string} avatarId
 * @param {boolean} [isVip] - VIP members have every library avatar unlocked
 *
 * BUGFIX: this used to check `avatarId.startsWith('free_')`, but the library
 * ids use hyphens (`free-animal-001`), so EVERY free avatar failed the check,
 * fell through to the avatar_unlocks table (seeded with the old `free_*` ids),
 * and came back locked — preset selection was broken for everyone.
 */
export async function isAvatarUnlocked(userId, avatarId, isVip = false) {
    try {
        // FREE-tier library avatars are always unlocked
        // (supports both current `free-...` ids and legacy `free_...` ids)
        const entry = resolvePresetAvatar(avatarId);
        if (entry?.tier === 'FREE' || String(avatarId).startsWith('free')) {
            return true;
        }

        // VIP members have the full library unlocked
        if (isVip) return true;

        // Non-VIP: check unlock table (individual purchase / achievement)
        const { data, error } = await supabase
            .from('avatar_unlocks')
            .select('id')
            .eq('user_id', userId)
            .eq('avatar_id', avatarId)
            .maybeSingle();

        if (error && error.code !== 'PGRST116') throw error;

        return !!data;
    } catch (error) {
        console.warn('Error checking avatar unlock:', error);
        return false;
    }
}

/**
 * Get all available avatars for a user (filtered by unlocks)
 * @param {string|null} userId
 * @param {string} tierFilter - 'all' | 'free' | 'vip'
 * @param {boolean} [isVip]   - VIP members have every library avatar unlocked
 */
export async function getAvailableAvatars(userId, tierFilter = 'all', isVip = false) {
    try {
        let unlockedIds = new Set();

        // Only query individual unlocks for non-VIP logged-in users
        // (VIP members have everything unlocked anyway)
        if (userId && !isVip) {
            const { data: unlocks } = await supabase
                .from('avatar_unlocks')
                .select('avatar_id')
                .eq('user_id', userId);
            unlockedIds = new Set(unlocks?.map(u => u.avatar_id) || []);
        }

        // Get all avatars from library
        let avatars = tierFilter === 'all' ? getAll() : getByTier(tierFilter);

        // Mark locked status: FREE avatars are always unlocked; VIP avatars are
        // unlocked for VIP members or via an explicit avatar_unlocks row.
        return avatars.map(avatar => ({
            ...avatar,
            isLocked: avatar.tier === 'VIP' && !isVip && !unlockedIds.has(avatar.id)
        }));
    } catch (error) {
        console.warn('Error fetching available avatars:', error);
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
            .maybeSingle();

        if (error) throw error;

        return { success: true, avatarId };
    } catch (error) {
        console.warn('Error unlocking avatar:', error);
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
        console.warn('Error fetching custom avatar gallery:', error);
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
        console.warn('Error deleting custom avatar:', error);
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
        console.warn('Error initializing free avatars:', error);
        return { success: false, error: error.message };
    }
}

export default {
    getUserAvatar,
    resolvePresetAvatar,
    setPresetAvatar,
    generateCustomAvatar,
    isAvatarUnlocked,
    getAvailableAvatars,
    unlockAvatar,
    getCustomAvatarGallery,
    deleteCustomAvatar,
    initializeFreeAvatars
};
