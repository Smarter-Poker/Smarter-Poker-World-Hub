/**
 * ═══════════════════════════════════════════════════════════════════════════
 * useDiamondBalance — Shared hook for diamond balance state management
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Used by both UniversalHeader and ThreePillHeader to:
 * - Read cached balance from localStorage instantly
 * - Fetch fresh balance from /api/user/get-header-stats
 * - Subscribe to Supabase realtime profile.diamonds changes
 * - Listen for diamond-balance-refresh CustomEvents
 * - Sync across tabs via BroadcastChannel
 *
 * Usage:
 *   const { balance, refreshBalance } = useDiamondBalance(userId);
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '../lib/supabase';
import { listenBroadcast } from '../lib/broadcastSync';

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
        localStorage.setItem('sp-cached-header-user', JSON.stringify(cached));
    } catch (_) { /* quota exceeded — ignore */ }
}

// ── Helper: read cached diamond balance from localStorage ──
function getCachedBalance() {
    try {
        const cached = localStorage.getItem('sp-cached-header-user');
        if (cached) {
            const data = JSON.parse(cached);
            return data.diamonds ?? 0;
        }
    } catch (_) {}
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
        return () => window.removeEventListener('diamond-balance-refresh', refreshBalance);
    }, [refreshBalance]);

    // ── Supabase realtime: profile.diamonds changes + cross-tab sync ──
    useEffect(() => {
        if (!userId) return;
        mountedRef.current = true;

        // Supabase realtime: listen for profile updates on this user
        const diamondChannel = supabase
            .channel(`diamonds:${userId}`)
            .on('postgres_changes', {
                event: 'UPDATE',
                schema: 'public',
                table: 'profiles',
                filter: `id=eq.${userId}`
            }, (payload) => {
                if (payload.new?.diamonds !== undefined && mountedRef.current) {
                    setBalance(payload.new.diamonds);
                    updateCachedBalance(payload.new.diamonds);
                }
            })
            .subscribe();

        // BroadcastChannel: cross-tab sync
        const cleanupDiamondSync = listenBroadcast('smarter_poker_diamond_sync', () => {
            refreshBalance();
        });

        // Club Arena chip sync → triggers diamond refresh
        const cleanupChipSync = listenBroadcast('smarter_poker_chips_sync', (msg) => {
            if (msg === 'refresh') {
                window.dispatchEvent(new CustomEvent('diamond-balance-refresh'));
            }
        });

        return () => {
            mountedRef.current = false;
            supabase.removeChannel(diamondChannel);
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
