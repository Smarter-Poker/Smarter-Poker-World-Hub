import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { authedFetch } from '../lib/authUtils';
import toast from '../stores/toastStore';
import { readGuestTrainingFavorites, toggleGuestTrainingFavorite } from '../lib/training/guestTrainingFavorites.mjs';

const EMPTY_IDS = new Set();
const FAVORITES_URL = '/api/training/game-favorites';

export default function useTrainingFavorites(authUser, initializing) {
  const userId = authUser?.id || null;
  const [attempt, setAttempt] = useState(0);
  const [result, setResult] = useState(null);
  const requestRef = useRef(null);
  const scope = useMemo(() => ({ userId, initializing, attempt }), [userId, initializing, attempt]);
  const retryFavorites = useCallback(() => setAttempt(value => value + 1), []);

  useEffect(() => {
    if (initializing) return;
    const request = { scope, controller: new AbortController(), pending: new Set() };
    requestRef.current = request;
    const { signal } = request.controller;
    async function load() {
      try {
        let ids;
        if (userId) {
          const res = await authedFetch(FAVORITES_URL, {
            signal,
            headers: { 'X-Expected-Account': userId },
            cache: 'no-store',
          });
          const body = await res.json().catch(() => null);
          if (!res.ok || body?.success !== true || !Array.isArray(body.favorites)) {
            throw new Error('Favorites could not be loaded');
          }
          ids = new Set(body.favorites);
        } else {
          ids = readGuestTrainingFavorites(window.sessionStorage);
        }
        if (!signal.aborted) setResult({ scope, ids, error: null });
      } catch {
        if (!signal.aborted) setResult({ scope, ids: EMPTY_IDS, error: 'Favorites Are Unavailable.' });
      }
    }
    load();
    return () => {
      request.controller.abort();
      requestRef.current = null;
    };
  }, [scope, initializing, userId]);

  const current = result?.scope === scope ? result : null;
  const favoriteIds = current?.ids || EMPTY_IDS;
  const toggleFavorite = useCallback(async (gameId) => {
    const request = requestRef.current;
    if (!current || current.error || request?.scope !== scope || !gameId || request.pending.has(gameId)) return false;
    if (!userId) {
      try {
        const ids = toggleGuestTrainingFavorite(window.sessionStorage, gameId);
        setResult({ scope, ids, error: null });
        toast.info(ids.has(gameId) ? 'Saved For This Tab.' : 'Removed From Favorites.');
        return true;
      } catch {
        toast.error('Favorites Could Not Be Saved In This Tab.');
        return false;
      }
    }

    const remove = current.ids.has(gameId);
    request.pending.add(gameId);
    const { signal } = request.controller;
    try {
      const res = await authedFetch(FAVORITES_URL, {
        method: remove ? 'DELETE' : 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Expected-Account': userId },
        body: JSON.stringify({ gameId }),
        signal,
      });
      const body = await res.json().catch(() => null);
      if (signal.aborted) return false;
      if (!res.ok || body?.success !== true) throw new Error('Favorite write failed');
      setResult(prev => {
        if (prev?.scope !== scope) return prev;
        const ids = new Set(prev.ids);
        if (remove) ids.delete(gameId);
        else ids.add(gameId);
        return { ...prev, ids };
      });
      return true;
    } catch {
      if (!signal.aborted) toast.error('Favorite Change Was Not Saved. Your Display Has Not Been Changed.');
      return false;
    } finally {
      request.pending.delete(gameId);
    }
  }, [current, scope, userId]);

  return {
    favoriteIds,
    favoriteCount: favoriteIds.size,
    favoritesLoading: !current,
    favoritesError: current?.error,
    retryFavorites,
    toggleFavorite,
  };
}
