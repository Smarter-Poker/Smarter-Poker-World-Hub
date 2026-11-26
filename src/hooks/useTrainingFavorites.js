/**
 * useTrainingFavorites — Authoritative Training Game Favorites Hook
 * ─────────────────────────────────────────────────────────────────────────────
 * Persists starred training games via /api/training/game-favorites for
 * authenticated users. Never fabricates persistence on database errors:
 * mutations only settle after a validated `{ success: true }` server payload.
 *
 * For signed-out visitors, keeps favorites in tab-scoped session storage so stars work
 * during browsing while surfacing a clear prompt that signing in syncs them.
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { authedFetch } from '../lib/authUtils';
import toast from '../stores/toastStore';
import { readGuestTrainingFavorites, toggleGuestTrainingFavorite } from '../lib/training/guestTrainingFavorites.mjs';

export default function useTrainingFavorites(authUser) {
  const [favoriteIds, setFavoriteIds] = useState(() => new Set());
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const pendingRef = useRef(new Set());

  useEffect(() => {
    let cancelled = false;
    if (!authUser?.id) {
      try {
        setFavoriteIds(readGuestTrainingFavorites(window.sessionStorage));
      } catch {
        setFavoriteIds(new Set());
      }
      setLoading(false);
      setError(null);
      return () => { cancelled = true; };
    }

    setFavoriteIds(new Set());
    setLoading(true);
    setError(null);

    authedFetch('/api/training/game-favorites')
      .then(async (res) => {
        const body = await res.json().catch(() => null);
        if (!res.ok || body?.success !== true || !Array.isArray(body?.favorites)) {
          throw new Error(body?.error || `favorites ${res.status}`);
        }
        if (!cancelled) {
          setFavoriteIds(new Set(body.favorites));
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setError('Favorites are temporarily unavailable.');
          console.warn('[Training] favorites load failed:', err?.message || err);
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => { cancelled = true; };
  }, [authUser?.id]);

  const toggleFavorite = useCallback(async (gameId) => {
    if (!gameId || pendingRef.current.has(gameId)) return false;

    const currentlyStarred = favoriteIds.has(gameId);
    const nextAction = currentlyStarred ? 'remove' : 'add';

    if (!authUser?.id) {
      try {
        const next = toggleGuestTrainingFavorite(window.sessionStorage, gameId);
        setFavoriteIds(next);
        toast.info(next.has(gameId) ? 'Saved For This Tab.' : 'Removed From Favorites.');
        return true;
      } catch {
        toast.error('Favorites Could Not Be Saved In This Tab.');
        return false;
      }
    }

    pendingRef.current.add(gameId);
    try {
      const res = await authedFetch('/api/training/game-favorites', {
        method: nextAction === 'add' ? 'POST' : 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ gameId }),
      });
      const body = await res.json().catch(() => null);
      if (!res.ok || body?.success !== true) {
        toast.error('Favorite Change Was Not Saved. Your Display Has Not Been Changed.');
        return false;
      }
      setFavoriteIds((prev) => {
        const next = new Set(prev);
        if (nextAction === 'add') next.add(gameId);
        else next.delete(gameId);
        return next;
      });
      return true;
    } catch (err) {
      console.warn('[Training] favorite toggle failed:', err?.message || err);
      toast.error('Favorite Change Was Not Saved. Your Display Has Not Been Changed.');
      return false;
    } finally {
      pendingRef.current.delete(gameId);
    }
  }, [authUser?.id, favoriteIds]);

  return {
    favoriteIds,
    favoriteCount: favoriteIds.size,
    favoritesLoading: loading,
    favoritesError: error,
    toggleFavorite,
  };
}
