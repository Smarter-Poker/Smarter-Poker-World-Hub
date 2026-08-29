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
  // Get preferences (localStorage only — messenger_preferences column not yet in DB)
  async get(userId) {
    return {
      notifications: localStorage.getItem('messenger-notifications') !== 'false',
      readReceipts: localStorage.getItem('messenger-read-receipts') !== 'false',
      activeStatus: localStorage.getItem('messenger-active-status') !== 'false',
      messageSounds: localStorage.getItem('messenger-sounds') !== 'false',
    };
  },

  // Update preferences (localStorage only — DB sync disabled until column exists)
  async update(userId, preferences) {
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
    return preferences;
  },
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
        friendSuggestions: localStorage.getItem('friends-suggestions') !== 'false',
      };

      if (userId) {
        const { data } = await supabase
          .from('profiles')
          .select('friend_preferences')
          .eq('id', userId)
          .maybeSingle();

        if (data?.friend_preferences) {
          return data.friend_preferences;
        }
      }

      return local;
    } catch (error) {
      console.warn('[Preferences] Error getting friend preferences:', error);
      return {
        allowRequests: true,
        showOnlineStatus: true,
        friendSuggestions: true,
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
          p_preferences: preferences,
        });

        if (error) throw error;
        return data;
      }

      return preferences;
    } catch (error) {
      console.warn('[Preferences] Error updating friend preferences:', error);
      throw error;
    }
  },
};

// ═══════════════════════════════════════════════════════════════════════════
// REELS PREFERENCES
// ═══════════════════════════════════════════════════════════════════════════

export const reelsPreferences = {
  // Get preferences (localStorage only — reels_preferences column not yet in profiles DB)
  async get(userId) {
    return {
      autoplay: localStorage.getItem('reels-autoplay') !== 'false',
      soundOnScroll: localStorage.getItem('reels-sound-on-scroll') !== 'false',
      dataSaver: localStorage.getItem('reels-data-saver') === 'true',
      showCaptions: localStorage.getItem('reels-show-captions') !== 'false',
    };
  },

  // Update preferences (localStorage only — DB sync disabled until reels_preferences column exists)
  async update(userId, preferences) {
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
    return preferences;
  },
};

// ═══════════════════════════════════════════════════════════════════════════
// STORE PREFERENCES
// ═══════════════════════════════════════════════════════════════════════════

export const storePreferences = {
  async get(userId) {
    try {
      const local = {
        emailReceipts: localStorage.getItem('store-email-receipts') !== 'false',
        promotionalEmails: localStorage.getItem('store-promotional-emails') === 'true',
      };

      if (userId) {
        const { data } = await supabase
          .from('profiles')
          .select('store_preferences')
          .eq('id', userId)
          .maybeSingle();

        if (data?.store_preferences) {
          return data.store_preferences;
        }
      }

      return local;
    } catch (error) {
      console.warn('[Preferences] Error getting store preferences:', error);
      return {
        emailReceipts: true,
        promotionalEmails: false,
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
          p_preferences: preferences,
        });

        if (error) throw error;
        return data;
      }

      return preferences;
    } catch (error) {
      console.warn('[Preferences] Error updating store preferences:', error);
      throw error;
    }
  },
};

// ═══════════════════════════════════════════════════════════════════════════
// WISHLIST SERVICE
// ═══════════════════════════════════════════════════════════════════════════

export const wishlistService = {
  async getWishlist(userId) {
    try {
      const { data, error } = await supabase
        .from('wishlists')
        .select('id, product_id, product_type, product_name, product_price, created_at')
        .eq('user_id', userId)
        .order('created_at', { ascending: false });

      if (error) throw error;
      return data || [];
    } catch (error) {
      console.warn('[Wishlist] Error getting wishlist:', error);
      throw error;
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
          product_price: product.price,
        })
        .select()
        .maybeSingle();

      if (error) throw error;
      return data || null;
    } catch (error) {
      console.warn('[Wishlist] Error adding to wishlist:', error);
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
      console.warn('[Wishlist] Error removing from wishlist:', error);
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
        .maybeSingle();

      if (error && error.code !== 'PGRST116') throw error;
      return !!data;
    } catch (error) {
      console.warn('[Wishlist] Error checking wishlist:', error);
      return false;
    }
  },
};

// ═══════════════════════════════════════════════════════════════════════════
// SAVED REELS SERVICE
// ═══════════════════════════════════════════════════════════════════════════

export const savedReelsService = {
  async getSavedReels(userId) {
    try {
      const { data, error } = await supabase
        .from('saved_reels')
        // BUG FIX (Bug 28): include source_type so callers know which table to join
        .select('id, user_id, reel_id, saved_at, source_type')
        .eq('user_id', userId)
        .order('saved_at', { ascending: false });

      if (error) throw error;
      const rows = data || [];
      const reelIds = rows.filter((row) => row.source_type !== 'post').map((row) => row.reel_id);
      const postIds = rows.filter((row) => row.source_type === 'post').map((row) => row.reel_id);
      const [reelResult, postResult] = await Promise.all([
        reelIds.length
          ? supabase
              .from('social_reels')
              .select(
                'id, author_id, caption, video_url, thumbnail_url, view_count, like_count, comment_count, created_at, source_type'
              )
              .in('id', reelIds)
          : Promise.resolve({ data: [], error: null }),
        postIds.length
          ? supabase
              .from('social_posts')
              .select(
                'id, author_id, content, media_urls, thumbnail_url, like_count, comment_count, created_at'
              )
              .in('id', postIds)
          : Promise.resolve({ data: [], error: null }),
      ]);
      if (reelResult.error) throw reelResult.error;
      if (postResult.error) throw postResult.error;

      const reelMap = new Map(
        (reelResult.data || []).map((reel) => [reel.id, { ...reel, source: 'reels' }])
      );
      const postMap = new Map(
        (postResult.data || []).map((post) => [
          post.id,
          {
            id: post.id,
            author_id: post.author_id,
            caption: post.content || '',
            video_url: Array.isArray(post.media_urls) ? post.media_urls[0] : null,
            thumbnail_url: post.thumbnail_url || null,
            like_count: post.like_count || 0,
            comment_count: post.comment_count || 0,
            created_at: post.created_at,
            source: 'posts',
          },
        ])
      );

      return rows
        .map((row) => ({
          ...row,
          reel: row.source_type === 'post' ? postMap.get(row.reel_id) : reelMap.get(row.reel_id),
        }))
        .filter((row) => row.reel?.video_url);
    } catch (error) {
      console.warn('[SavedReels] Error getting saved reels:', error);
      throw error;
    }
  },

  // BUG FIX (Bug 28): accept source_type so post-sourced reels ('post') can be saved
  // Old: always inserted source_type='reel' implicitly (default) which FK would reject for posts
  async saveReel(userId, reelId, sourceType = 'reel') {
    try {
      const { data, error } = await supabase
        .from('saved_reels')
        .insert({
          user_id: userId,
          reel_id: reelId,
          source_type: sourceType,
        })
        .select()
        .maybeSingle();

      if (error) throw error;
      return data || null;
    } catch (error) {
      console.warn('[SavedReels] Error saving reel:', error);
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
      console.warn('[SavedReels] Error unsaving reel:', error);
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
        .maybeSingle();

      if (error && error.code !== 'PGRST116') throw error;
      return !!data;
    } catch (error) {
      console.warn('[SavedReels] Error checking saved status:', error);
      return false;
    }
  },
};
