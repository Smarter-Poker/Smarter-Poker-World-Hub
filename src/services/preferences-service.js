/**
 * Preferences Service
 * ═══════════════════════════════════════════════════════════════════════════
 * Centralized service for managing user preferences across all hamburger menus
 * Syncs localStorage with Supabase for cross-device consistency
 * ═══════════════════════════════════════════════════════════════════════════
 */

import { supabase } from '../lib/supabase';
import { getAccessToken } from '../lib/authUtils';

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
        .upsert(
          {
            user_id: userId,
            product_id: product.id,
            product_type: product.type,
            product_name: product.name,
            product_price: product.price,
          },
          {
            onConflict: 'user_id,product_id',
            // A fast double tap or a second signed-in tab is a successful
            // "already saved" outcome, not an error toast. DO NOTHING also
            // avoids requiring an UPDATE policy on this owner-scoped table.
            ignoreDuplicates: true,
          }
        )
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

const SAVED_REELS_PAGE_LIMIT = 50;
const MAX_SAVED_REELS_PAGE_LIMIT = 100;
const MAX_SAVED_REELS_PAGES = 100;

function clampSavedReelsPageLimit(value) {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed)) return SAVED_REELS_PAGE_LIMIT;
  return Math.min(MAX_SAVED_REELS_PAGE_LIMIT, Math.max(1, parsed));
}

function mergeSavedReelRows(current, incoming) {
  const byReelId = new Map();
  for (const row of [...current, ...incoming]) {
    if (!row?.reel_id) continue;
    const existing = byReelId.get(row.reel_id);
    if (!existing) {
      byReelId.set(row.reel_id, row);
      continue;
    }
    byReelId.set(row.reel_id, {
      ...existing,
      saved_target_ids: [...new Set([
        ...(existing.saved_target_ids || [existing.saved_target_id].filter(Boolean)),
        ...(row.saved_target_ids || [row.saved_target_id].filter(Boolean)),
      ])],
    });
  }
  return [...byReelId.values()];
}

async function fetchSavedReelsPage({ userId, cursor = null, limit, signal } = {}) {
  const token = getAccessToken();
  if (!token) throw new Error('Authentication required');
  const params = new URLSearchParams({
    limit: String(clampSavedReelsPageLimit(limit)),
  });
  if (cursor) params.set('cursor', cursor);
  const response = await fetch(`/api/reels/saved?${params.toString()}`, {
    method: 'GET',
    cache: 'no-store',
    credentials: 'same-origin',
    headers: {
      Accept: 'application/json',
      Authorization: `Bearer ${token}`,
    },
    signal,
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok || !payload?.success || !Array.isArray(payload.data)) {
    throw new Error(payload?.error || `Saved Reels request failed (${response.status})`);
  }
  if (payload.data.some(row => row?.user_id !== userId)) {
    throw new Error('Saved Reels response owner mismatch');
  }
  const hasMore = payload.has_more === true;
  const nextCursor = hasMore && typeof payload.next_cursor === 'string'
    ? payload.next_cursor
    : null;
  if (hasMore && (!nextCursor || nextCursor === cursor)) {
    throw new Error('Saved Reels pagination did not advance');
  }
  return {
    data: payload.data,
    hasMore,
    nextCursor,
    partial: payload.partial === true,
  };
}

export const savedReelsService = {
  async getSavedReelsPage(userId, { cursor = null, limit = SAVED_REELS_PAGE_LIMIT, signal } = {}) {
    try {
      if (!userId) return { data: [], hasMore: false, nextCursor: null, partial: false };
      return await fetchSavedReelsPage({ userId, cursor, limit, signal });
    } catch (error) {
      console.warn('[SavedReels] Error getting saved Reels page:', error);
      throw error;
    }
  },

  async getSavedReels(userId, {
    signal,
    pageLimit = MAX_SAVED_REELS_PAGE_LIMIT,
    maxPages = MAX_SAVED_REELS_PAGES,
  } = {}) {
    try {
      if (!userId) return [];
      const safeMaxPages = Math.min(
        MAX_SAVED_REELS_PAGES,
        Math.max(1, Number.parseInt(maxPages, 10) || MAX_SAVED_REELS_PAGES),
      );
      const seenCursors = new Set();
      let cursor = null;
      let rows = [];
      for (let pageNumber = 0; pageNumber < safeMaxPages; pageNumber += 1) {
        const page = await fetchSavedReelsPage({ userId, cursor, limit: pageLimit, signal });
        rows = mergeSavedReelRows(rows, page.data);
        if (!page.hasMore) return rows;
        if (seenCursors.has(page.nextCursor)) {
          throw new Error('Saved Reels pagination repeated a cursor');
        }
        seenCursors.add(page.nextCursor);
        cursor = page.nextCursor;
      }
      throw new Error('Saved Reels pagination exceeded its safety limit');
    } catch (error) {
      console.warn('[SavedReels] Error getting saved reels:', error);
      throw error;
    }
  },

  async getAllSavedReels(userId, options = {}) {
    return savedReelsService.getSavedReels(userId, options);
  },

  async getSavedReelsForIds(userId, reelIds, { signal } = {}) {
    try {
      if (!userId) return [];
      const ids = [...new Set(
        (Array.isArray(reelIds) ? reelIds : [])
          .map(value => String(value || '').trim())
          .filter(Boolean),
      )];
      if (!ids.length) return [];
      const token = getAccessToken();
      if (!token) throw new Error('Authentication required');
      let rows = [];
      for (let index = 0; index < ids.length; index += MAX_SAVED_REELS_PAGE_LIMIT) {
        const response = await fetch('/api/reels/saved-status', {
          method: 'POST',
          cache: 'no-store',
          credentials: 'same-origin',
          headers: {
            Accept: 'application/json',
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            reel_ids: ids.slice(index, index + MAX_SAVED_REELS_PAGE_LIMIT),
          }),
          signal,
        });
        const payload = await response.json().catch(() => null);
        if (!response.ok || !payload?.success || !Array.isArray(payload.data)) {
          throw new Error(payload?.error || `Saved Reel status request failed (${response.status})`);
        }
        if (payload.data.some(row => row?.user_id !== userId)) {
          throw new Error('Saved Reel status response owner mismatch');
        }
        rows = mergeSavedReelRows(rows, payload.data);
      }
      return rows;
    } catch (error) {
      console.warn('[SavedReels] Error getting saved Reel status:', error);
      throw error;
    }
  },

  // BUG FIX (Bug 28): accept source_type so post-sourced reels ('post') can be saved
  // Old: always inserted source_type='reel' implicitly (default) which FK would reject for posts
  async saveReel(userId, reelId, sourceType = 'reel') {
    try {
      const { data, error } = await supabase
        .from('saved_reels')
        .upsert(
          {
            user_id: userId,
            reel_id: reelId,
            source_type: sourceType,
          },
          {
            onConflict: 'user_id,reel_id',
            ignoreDuplicates: true,
          },
        )
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
      const targetIds = [...new Set(
        (Array.isArray(reelId) ? reelId : [reelId]).filter(Boolean),
      )];
      if (!userId || targetIds.length === 0) return;
      let query = supabase
        .from('saved_reels')
        .delete()
        .eq('user_id', userId);
      query = targetIds.length === 1
        ? query.eq('reel_id', targetIds[0])
        : query.in('reel_id', targetIds);
      const { error } = await query;

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
