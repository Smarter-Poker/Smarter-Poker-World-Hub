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
function updateCachedBalance(diamonds) {
    try {
        const cached = JSON.parse(localStorage.getItem('sp-cached-header-user') || '{}');
        cached.diamonds = diamonds;
        cached._ts = Date.now(); // Refresh TTL on balance update
        localStorage.setItem('sp-cached-header-user', JSON.stringify(cached));
    } catch (_) { console.warn('[App] Handled exception:', _?.message || _); }
}

// ── Helper: read cached diamond balance from localStorage ──
function getCachedBalance() {
    try {
        const cached = localStorage.getItem('sp-cached-header-user');
        if (cached) {
            const data = JSON.parse(cached);
            return data.diamonds ?? 0;
        }
    } catch (_) { console.warn('[App] Handled exception:', _?.message || _); }
    return 0;
}

export function useDiamondBalance(userId) {
    // Initialize from cache for instant display
    const [balance, setBalance] = useState(() => {
        if (typeof window === 'undefined') return 0;
        return getCachedBalance();
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
                updateCachedBalance(newBalance);
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
                updateCachedBalance(diamonds);
            }
        },
    });

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
        updateCachedBalance(newBalance);
    }, []);

    return { balance, refreshBalance, setBalance: setBalanceDirect };
}

export default useDiamondBalance;
