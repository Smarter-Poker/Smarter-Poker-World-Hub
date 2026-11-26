/**
 * useTrainingFavorites — Authoritative Training Game Favorites Hook
 * ─────────────────────────────────────────────────────────────────────────────
 * Persists starred training games via /api/training/game-favorites for
 * authenticated users. Never fabricates persistence on database errors:
 * mutations only settle after a validated `{ success: true }` server payload.
 *
 * For signed-out visitors, keeps an honest in-memory session set so stars work
 * during browsing while surfacing a clear prompt that signing in syncs them.
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { authedFetch } from '../lib/authUtils';
import toast from '../stores/toastStore';

export default function useTrainingFavorites(authUser) {
  const [favoriteIds, setFavoriteIds] = useState(() => new Set());
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const pendingRef = useRef(new Set());

  useEffect(() => {
    let cancelled = false;
    if (!authUser?.id) {
      setLoading(false);
      setError(null);
      return () => { cancelled = true; };
    }

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

    // Signed-out visitors get honest session-only favorites in memory
    if (!authUser?.id) {
      setFavoriteIds((prev) => {
        const next = new Set(prev);
        if (currentlyStarred) next.delete(gameId);
        else next.add(gameId);
        return next;
      });
      toast.info(
        currentlyStarred
          ? 'Removed From Session Favorites.'
          : 'Saved For This Session. Sign In To Sync Favorites Across Devices.',
      );
      return true;
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
