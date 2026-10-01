/**
 * useProfileRealtime — Shared, ref-counted profiles channel
 * ═══════════════════════════════════════════════════════════════════════════════
 * Replaces 3 duplicate postgres_changes subscriptions on the `profiles` table
 * that each watched the SAME row for the same userId:
 *
 *   diamonds:{userId}      (useDiamondBalance)
 *   vip:{userId}           (AvatarContext)
 *   wallet-diamonds:{userId} (useWalletData)
 *
 * Now there is exactly ONE `profiles:{userId}` channel per userId, shared
 * across all subscribers via module-level ref-counting. The channel opens on
 * the first subscriber and closes when the last one unsubscribes.
 *
 * Usage:
 *   useProfileRealtime(userId, {
 *     onDiamondsUpdate: (diamonds) => ...,  // called when profile.diamonds changes
 *     onVipUpdate:      (is_vip)   => ...,  // called when profile.is_vip changes
 *     onProfileUpdate:  (profile)  => ...,  // called for any profile UPDATE
 *   });
 *
 * All callbacks are optional. Pass only the ones you need.
 */
import { useEffect, useRef } from 'react';
import { supabase } from '../lib/supabase';
import { readOwnProfile } from '../lib/ownProfile';

// ── Module-level shared state per userId ────────────────────────────────────
// Map<userId, { channel, subscribers: Set<id>, callbacks: Map<id, CallbackSet> }>
const sharedChannels = new Map();
let nextSubscriberId = 0;

function getOrCreateChannel(userId) {
    if (!sharedChannels.has(userId)) {
        const channelName = `profiles:${userId}`;
        const entry = {
            channel: null,
            subscribers: new Set(),
            callbacks: new Map(),
        };

        entry.channel = supabase
            .channel(channelName)
            .on('postgres_changes', {
                event: 'UPDATE',
                schema: 'public',
                table: 'profiles',
                filter: `id=eq.${userId}`,
            }, async (payload) => {
                const profile = { ...(payload.new || {}) };
                // Realtime leaves out every column the subscriber's role may
                // not SELECT, and since 2026-09-30 the Diamond balance is one
                // of them even on the owner's own row. When the payload comes
                // without it, read it through the owner path so the balance
                // still moves live.
                if (profile.diamonds === undefined) {
                    try {
                        const { data } = await readOwnProfile(supabase, 'diamonds', { expectId: userId });
                        if (data && data.diamonds !== undefined) profile.diamonds = data.diamonds;
                    } catch (e) {
                        console.warn('[ProfileRealtime] Own balance read failed:', e?.message || e);
                    }
                }
                // Fan out to all current subscribers
                entry.callbacks.forEach((cbs) => {
                    if (profile.diamonds !== undefined) {
                        cbs.onDiamondsUpdate?.(profile.diamonds);
                    }
                    if (profile.is_vip !== undefined) {
                        cbs.onVipUpdate?.(!!profile.is_vip);
                    }
                    cbs.onProfileUpdate?.(profile);
                });
            })
            .subscribe((status) => {
                console.debug(`[ProfileRealtime] ${status}: ${channelName}`);
            });

        sharedChannels.set(userId, entry);
    }
    return sharedChannels.get(userId);
}

function releaseChannel(userId, subscriberId) {
    const entry = sharedChannels.get(userId);
    if (!entry) return;

    entry.subscribers.delete(subscriberId);
    entry.callbacks.delete(subscriberId);

    if (entry.subscribers.size === 0) {
        try { supabase.removeChannel(entry.channel); } catch (e) {
            console.warn('[ProfileRealtime] Cleanup warning:', e);
        }
        sharedChannels.delete(userId);
        console.debug(`[ProfileRealtime] Channel closed: profiles:${userId}`);
    }
}

// ── Hook ─────────────────────────────────────────────────────────────────────
export function useProfileRealtime(userId, { onDiamondsUpdate, onVipUpdate, onProfileUpdate } = {}) {
    // Keep callback refs stable so the channel closure always calls the latest version
    const onDiamondsRef = useRef(onDiamondsUpdate);
    const onVipRef      = useRef(onVipUpdate);
    const onProfileRef  = useRef(onProfileUpdate);
    onDiamondsRef.current = onDiamondsUpdate;
    onVipRef.current      = onVipUpdate;
    onProfileRef.current  = onProfileUpdate;

    useEffect(() => {
        if (!userId || typeof window === 'undefined') return;

        const id = nextSubscriberId++;
        const entry = getOrCreateChannel(userId);

        entry.subscribers.add(id);
        entry.callbacks.set(id, {
            onDiamondsUpdate: (v) => onDiamondsRef.current?.(v),
            onVipUpdate:      (v) => onVipRef.current?.(v),
            onProfileUpdate:  (v) => onProfileRef.current?.(v),
        });

        return () => releaseChannel(userId, id);
    }, [userId]);
}

export default useProfileRealtime;
