/**
 * Preferences Service
 * ═══════════════════════════════════════════════════════════════════════════
 * Centralized service for managing user preferences across all hamburger menus
 * Syncs localStorage with Supabase for cross-device consistency
 * ═══════════════════════════════════════════════════════════════════════════
 */

import { supabase } from '../lib/supabase';

// ═══════════════════════════════════════════════════════════════════════════
// MESSENGER PREFERENCES
// ═══════════════════════════════════════════════════════════════════════════

export const messengerPreferences = {
    // Get preferences (localStorage first, then DB)
    async get(userId) {
        try {
            // Try localStorage first for instant UI
            const local = {
                notifications: localStorage.getItem('messenger-notifications') !== 'false',
                readReceipts: localStorage.getItem('messenger-read-receipts') !== 'false',
                activeStatus: localStorage.getItem('messenger-active-status') !== 'false',
                messageSounds: localStorage.getItem('messenger-sounds') !== 'false'
            };

            // Fetch from DB in background
            if (userId) {
                const { data } = await supabase
                    .from('profiles')
                    .select('messenger_preferences')
                    .eq('id', userId)
                    .single();

                if (data?.messenger_preferences) {
                    return data.messenger_preferences;
                }
            }

            return local;
        } catch (error) {
            console.error('[Preferences] Error getting messenger preferences:', error);
            return {
                notifications: true,
                readReceipts: true,
                activeStatus: true,
                messageSounds: true
            };
        }
    },

    // Update preferences (localStorage + DB)
    async update(userId, preferences) {
        try {
            // Update localStorage immediately for instant UI feedback
            if (preferences.notifications !== undefined) {
                localStorage.setItem('messenger-notifications', preferences.notifications.toString());
            }
            if (preferences.readReceipts !== undefined) {
                localStorage.setItem('messenger-read-receipts', preferences.readReceipts.toString());
            }
            if (preferences.activeStatus !== undefined) {
                localStorage.setItem('messenger-active-status', preferences.activeStatus.toString());
            }
            if (preferences.messageSounds !== undefined) {
                localStorage.setItem('messenger-sounds', preferences.messageSounds.toString());
            }

            // Sync to DB in background
            if (userId) {
                const { data, error } = await supabase.rpc('update_messenger_preferences', {
                    p_user_id: userId,
                    p_preferences: preferences
                });

                if (error) throw error;
                return data;
            }

            return preferences;
        } catch (error) {
            console.error('[Preferences] Error updating messenger preferences:', error);
            throw error;
        }
    }
};

// ═══════════════════════════════════════════════════════════════════════════
// FRIEND PREFERENCES
// ═══════════════════════════════════════════════════════════════════════════

export const friendPreferences = {
    async get(userId) {
        try {
            const local = {
                allowRequests: localStorage.getItem('friends-allow-requests') !== 'false',
                showOnlineStatus: localStorage.getItem('friends-show-online') !== 'false',
                friendSuggestions: localStorage.getItem('friends-suggestions') !== 'false'
            };

            if (userId) {
                const { data } = await supabase
                    .from('profiles')
                    .select('friend_preferences')
                    .eq('id', userId)
                    .single();

                if (data?.friend_preferences) {
                    return data.friend_preferences;
                }
            }

            return local;
        } catch (error) {
            console.error('[Preferences] Error getting friend preferences:', error);
            return {
                allowRequests: true,
                showOnlineStatus: true,
                friendSuggestions: true
            };
        }
    },

    async update(userId, preferences) {
        try {
            if (preferences.allowRequests !== undefined) {
                localStorage.setItem('friends-allow-requests', preferences.allowRequests.toString());
            }
            if (preferences.showOnlineStatus !== undefined) {
                localStorage.setItem('friends-show-online', preferences.showOnlineStatus.toString());
            }
            if (preferences.friendSuggestions !== undefined) {
                localStorage.setItem('friends-suggestions', preferences.friendSuggestions.toString());
            }

            if (userId) {
                const { data, error } = await supabase.rpc('update_friend_preferences', {
                    p_user_id: userId,
                    p_preferences: preferences
                });

                if (error) throw error;
                return data;
            }

            return preferences;
        } catch (error) {
            console.error('[Preferences] Error updating friend preferences:', error);
            throw error;
        }
    }
};

// ═══════════════════════════════════════════════════════════════════════════
// REELS PREFERENCES
// ═══════════════════════════════════════════════════════════════════════════

export const reelsPreferences = {
    async get(userId) {
        try {
            const local = {
                autoplay: localStorage.getItem('reels-autoplay') !== 'false',
                soundOnScroll: localStorage.getItem('reels-sound-on-scroll') !== 'false',
                dataSaver: localStorage.getItem('reels-data-saver') === 'true',
                showCaptions: localStorage.getItem('reels-show-captions') !== 'false'
            };

            if (userId) {
                const { data } = await supabase
                    .from('profiles')
                    .select('reels_preferences')
                    .eq('id', userId)
                    .single();

                if (data?.reels_preferences) {
                    return data.reels_preferences;
                }
            }

            return local;
        } catch (error) {
            console.error('[Preferences] Error getting reels preferences:', error);
            return {
                autoplay: true,
                soundOnScroll: true,
                dataSaver: false,
                showCaptions: true
            };
        }
    },

    async update(userId, preferences) {
        try {
            if (preferences.autoplay !== undefined) {
                localStorage.setItem('reels-autoplay', preferences.autoplay.toString());
            }
            if (preferences.soundOnScroll !== undefined) {
                localStorage.setItem('reels-sound-on-scroll', preferences.soundOnScroll.toString());
            }
            if (preferences.dataSaver !== undefined) {
                localStorage.setItem('reels-data-saver', preferences.dataSaver.toString());
            }
            if (preferences.showCaptions !== undefined) {
                localStorage.setItem('reels-show-captions', preferences.showCaptions.toString());
            }

            if (userId) {
                const { data, error } = await supabase.rpc('update_reels_preferences', {
                    p_user_id: userId,
                    p_preferences: preferences
                });

                if (error) throw error;
                return data;
            }

            return preferences;
        } catch (error) {
            console.error('[Preferences] Error updating reels preferences:', error);
            throw error;
        }
    }
};

// ═══════════════════════════════════════════════════════════════════════════
// STORE PREFERENCES
// ═══════════════════════════════════════════════════════════════════════════

export const storePreferences = {
    async get(userId) {
        try {
            const local = {
                emailReceipts: localStorage.getItem('store-email-receipts') !== 'false',
                promotionalEmails: localStorage.getItem('store-promotional-emails') === 'true'
            };

            if (userId) {
                const { data } = await supabase
                    .from('profiles')
                    .select('store_preferences')
                    .eq('id', userId)
                    .single();

                if (data?.store_preferences) {
                    return data.store_preferences;
                }
            }

            return local;
        } catch (error) {
            console.error('[Preferences] Error getting store preferences:', error);
            return {
                emailReceipts: true,
                promotionalEmails: false
            };
        }
    },

    async update(userId, preferences) {
        try {
            if (preferences.emailReceipts !== undefined) {
                localStorage.setItem('store-email-receipts', preferences.emailReceipts.toString());
            }
            if (preferences.promotionalEmails !== undefined) {
                localStorage.setItem('store-promotional-emails', preferences.promotionalEmails.toString());
            }

            if (userId) {
                const { data, error } = await supabase.rpc('update_store_preferences', {
                    p_user_id: userId,
                    p_preferences: preferences
                });

                if (error) throw error;
                return data;
            }

            return preferences;
        } catch (error) {
            console.error('[Preferences] Error updating store preferences:', error);
            throw error;
        }
    }
};

// ═══════════════════════════════════════════════════════════════════════════
// WISHLIST SERVICE
// ═══════════════════════════════════════════════════════════════════════════

export const wishlistService = {
    async getWishlist(userId) {
        try {
            const { data, error } = await supabase
                .from('wishlists')
                .select('*')
                .eq('user_id', userId)
                .order('created_at', { ascending: false });

            if (error) throw error;
            return data || [];
        } catch (error) {
            console.error('[Wishlist] Error getting wishlist:', error);
            return [];
        }
    },

    async addToWishlist(userId, product) {
        try {
            const { data, error } = await supabase
                .from('wishlists')
                .insert({
                    user_id: userId,
                    product_id: product.id,
                    product_type: product.type,
                    product_name: product.name,
                    product_price: product.price
                })
                .select()
                .single();

            if (error) throw error;
            return data;
        } catch (error) {
            console.error('[Wishlist] Error adding to wishlist:', error);
            throw error;
        }
    },

    async removeFromWishlist(userId, productId) {
        try {
            const { error } = await supabase
                .from('wishlists')
                .delete()
                .eq('user_id', userId)
                .eq('product_id', productId);

            if (error) throw error;
        } catch (error) {
            console.error('[Wishlist] Error removing from wishlist:', error);
            throw error;
        }
    },

    async isInWishlist(userId, productId) {
        try {
            const { data, error } = await supabase
                .from('wishlists')
                .select('id')
                .eq('user_id', userId)
                .eq('product_id', productId)
                .single();

            if (error && error.code !== 'PGRST116') throw error;
            return !!data;
        } catch (error) {
            console.error('[Wishlist] Error checking wishlist:', error);
            return false;
        }
    }
};

// ═══════════════════════════════════════════════════════════════════════════
// SAVED REELS SERVICE
// ═══════════════════════════════════════════════════════════════════════════

export const savedReelsService = {
    async getSavedReels(userId) {
        try {
            const { data, error } = await supabase
                .from('saved_reels')
                .select(`
                    *,
                    reel:social_reels(*)
                `)
                .eq('user_id', userId)
                .order('saved_at', { ascending: false });

            if (error) throw error;
            return data || [];
        } catch (error) {
            console.error('[SavedReels] Error getting saved reels:', error);
            return [];
        }
    },

    async saveReel(userId, reelId) {
        try {
            const { data, error } = await supabase
                .from('saved_reels')
                .insert({
                    user_id: userId,
                    reel_id: reelId
                })
                .select()
                .single();

            if (error) throw error;
            return data;
        } catch (error) {
            console.error('[SavedReels] Error saving reel:', error);
            throw error;
        }
    },

    async unsaveReel(userId, reelId) {
        try {
            const { error } = await supabase
                .from('saved_reels')
                .delete()
                .eq('user_id', userId)
                .eq('reel_id', reelId);

            if (error) throw error;
        } catch (error) {
            console.error('[SavedReels] Error unsaving reel:', error);
            throw error;
        }
    },

    async isReelSaved(userId, reelId) {
        try {
            const { data, error } = await supabase
                .from('saved_reels')
                .select('id')
                .eq('user_id', userId)
                .eq('reel_id', reelId)
                .single();

            if (error && error.code !== 'PGRST116') throw error;
            return !!data;
        } catch (error) {
            console.error('[SavedReels] Error checking saved status:', error);
            return false;
        }
    }
};
