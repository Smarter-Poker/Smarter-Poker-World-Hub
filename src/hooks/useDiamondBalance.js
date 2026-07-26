/**
 * ═══════════════════════════════════════════════════════════════════════════
 * useDiamondBalance — Shared hook for diamond balance state management
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Used by both UniversalHeader and ThreePillHeader to:
 * - Read cached balance from localStorage instantly
 * - Fetch fresh balance from /api/user/get-header-stats
 * - Receive profile.diamonds changes via the shared useProfileRealtime hook
 *   (replaces the old dedicated `diamonds:{userId}` channel)
 * - Listen for EventBus DIAMONDS_EARNED/SPENT events (primary channel)
 * - Listen for legacy diamond-balance-refresh CustomEvents (backward compat)
 * - Sync across tabs via BroadcastChannel
 *
 * Usage:
 *   const { balance, refreshBalance } = useDiamondBalance(userId);
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { listenBroadcast } from '../lib/broadcastSync';
import { eventBus, EventType } from '../engine/EventBus';
import { useProfileRealtime } from './useProfileRealtime';

// ── Helper: read access token from localStorage ──
function getAccessToken() {
    try {
        const authData = JSON.parse(localStorage.getItem('smarter-poker-auth') || '{}');
        return authData?.access_token || null;
    } catch (_) { return null; }
}

// ── Helper: update cached diamond balance in localStorage ──
// Never write an unattributed payload — an entry without a userId defeats the owner
// guard in BOTH this file and UniversalHeader (whose check is `if (data?.userId && ...)`,
// so a falsy userId skips validation entirely).
function updateCachedBalance(diamonds, userId) {
    try {
        const cached = JSON.parse(localStorage.getItem('sp-cached-header-user') || '{}');
        const owner = cached?.userId || cached?.id || null;
        if (userId && owner && owner !== userId) return; // belongs to another account
        cached.diamonds = diamonds;
        if (userId) { cached.userId = userId; cached.id = userId; }
        cached._ts = Date.now(); // Refresh TTL on balance update
        localStorage.setItem('sp-cached-header-user', JSON.stringify(cached));
    } catch (_) { console.warn('[App] Handled exception:', _?.message || _); }
}

// ── Helper: read cached diamond balance from localStorage ──
// BUGFIX (header-audit #7): this used to return `data.diamonds` with NO owner check and
// NO TTL — unlike UniversalHeader's own cache reader, which checks both. Log out, log in
// as someone else on the same device, and the header rendered the PREVIOUS user's diamond
// balance until the API round-trip landed. Now the cache is only trusted when it belongs
// to this user and is inside the same 24h window the writer stamps.
const DIAMOND_CACHE_TTL_MS = 24 * 60 * 60 * 1000;
function getCachedBalance(userId) {
    try {
        const cached = localStorage.getItem('sp-cached-header-user');
        if (!cached) return 0;
        const data = JSON.parse(cached);
        const owner = data?.userId || data?.id || null;
        if (userId && owner && owner !== userId) return 0;   // different account
        if (!owner) return 0;                                 // unattributed — do not trust
        if (data?._ts && (Date.now() - data._ts) > DIAMOND_CACHE_TTL_MS) return 0;
        return data.diamonds ?? 0;
    } catch (_) { console.warn('[App] Handled exception:', _?.message || _); }
    return 0;
}

export function useDiamondBalance(userId) {
    // Initialize from cache for instant display
    const [balance, setBalance] = useState(() => {
        if (typeof window === 'undefined') return 0;
        return getCachedBalance(userId);
    });
    const mountedRef = useRef(true);

    // ── Core refresh function — fetches fresh balance from API ──
    const refreshBalance = useCallback(async () => {
        if (!userId) return;
        try {
            const accessToken = getAccessToken();
            const response = await fetch('/api/user/get-header-stats', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    ...(accessToken ? { 'Authorization': `Bearer ${accessToken}` } : {}),
                },
                body: JSON.stringify({ userId }),
            });
            const result = await response.json();
            if (result.success && result.profile && mountedRef.current) {
                const newBalance = result.profile.diamonds ?? 0;
                setBalance(newBalance);
                updateCachedBalance(newBalance, userId);
            }
        } catch (e) {
            console.warn('[useDiamondBalance] Refresh failed:', e.message);
        }
    }, [userId]);

    // ── Event listener: diamond-balance-refresh custom event ──
    useEffect(() => {
        window.addEventListener('diamond-balance-refresh', refreshBalance);

        // Listen to global EventBus for robust real-time synchronization
        const unsubscribeEarned = eventBus.on(EventType.DIAMONDS_EARNED, refreshBalance);
        const unsubscribeSpent = eventBus.on(EventType.DIAMONDS_SPENT, refreshBalance);

        return () => {
            window.removeEventListener('diamond-balance-refresh', refreshBalance);
            unsubscribeEarned();
            unsubscribeSpent();
        };
    }, [refreshBalance]);

    // ── Shared profile channel: diamonds field updates ──
    // Replaces the old dedicated `diamonds:{userId}` supabase.channel() call.
    useEffect(() => {
        mountedRef.current = true;
        return () => { mountedRef.current = false; };
    }, []);

    useProfileRealtime(userId, {
        onDiamondsUpdate: (diamonds) => {
            if (mountedRef.current) {
                setBalance(diamonds);
                updateCachedBalance(diamonds, userId);
            }
        },
    });

    // Re-seed from cache when the resolved user changes (login, account switch).
    // The useState initializer only ran once, before userId was known.
    useEffect(() => {
        if (!userId) return;
        setBalance(getCachedBalance(userId));
    }, [userId]);

    // ── Cross-tab sync via BroadcastChannel ──
    useEffect(() => {
        if (!userId) return;

        const cleanupDiamondSync = listenBroadcast('smarter_poker_diamond_sync', () => {
            refreshBalance();
        });

        const cleanupChipSync = listenBroadcast('smarter_poker_chips_sync', (msg) => {
            if (msg === 'refresh') refreshBalance();
        });

        return () => {
            cleanupDiamondSync();
            cleanupChipSync();
        };
    }, [userId, refreshBalance]);

    // ── Direct setter for cases where the balance comes from another API ──
    const setBalanceDirect = useCallback((newBalance) => {
        setBalance(newBalance);
        updateCachedBalance(newBalance, userId);
    }, [userId]);

    return { balance, refreshBalance, setBalance: setBalanceDirect };
}

export default useDiamondBalance;
