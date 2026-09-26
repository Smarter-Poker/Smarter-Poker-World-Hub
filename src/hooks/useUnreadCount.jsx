/** Shared unread badges. Reads use the same server visibility rules as the
 * inboxes. Explicit persisted-read events refresh once and invalidate stale
 * requests; the existing visible-tab interval only observes incoming activity.
 */

import { useState, useEffect, useRef, createContext, useContext } from 'react';
import { supabase } from '../lib/supabase';
import { getAuthUser } from '../lib/authUtils';
import { listenBroadcast, broadcastSync, BROADCAST_TAB_ID } from '../lib/broadcastSync';
import { getHeaderStats, invalidateHeaderStats } from '../lib/headerStats';
import toast from '../stores/toastStore';


const UnreadContext = createContext({
    unreadCount: 0,
    messageCount: 0,
    notificationCount: 0,
    total: 0,
    refreshUnread: () => { },
    refreshNotifications: () => { },
});

export function UnreadProvider({ children }) {
    const [messageCount, setMessageCount] = useState(0);
    const [notificationCount, setNotificationCount] = useState(0);
    const [userId, setUserId] = useState(null);
    const notifDebounceRef = useRef(null);
    const [messengerUnread, setMessengerUnread] = useState(null);
    const identityRef = useRef(userId);
    identityRef.current = userId;
    const refreshSequence = useRef(0);

    // Resolve the current user — and KEEP resolving it.
    // BUGFIX (header-audit #4): this was a single localStorage read on mount.
    // UnreadProvider mounts at app root, i.e. BEFORE login, so after an SPA sign-in with
    // no full reload userId stayed null forever: both refresh functions early-returned,
    // no realtime channel was ever created, and BOTH header badges read 0 for the entire
    // session. Symmetrically, sign-out never cleared it, so the previous user's counts
    // persisted on a shared device. Seed from localStorage for instant paint, then track
    // auth properly. Note we only clear on an explicit SIGNED_OUT — INITIAL_SESSION can
    // legitimately arrive with a null session while localStorage still holds a valid
    // user (the navigator.locks AbortError path), and clearing there would regress.
    useEffect(() => {
        const seed = getAuthUser();
        if (seed?.id) setUserId(seed.id);

        let sub = null;
        try {
            const { data } = supabase.auth.onAuthStateChange((event, session) => {
                if (event === 'SIGNED_OUT') { setUserId(null); return; }
                const next = session?.user?.id || getAuthUser()?.id || null;
                setUserId(prev => (prev === next ? prev : next));
            });
            sub = data?.subscription || null;
        } catch (e) {
            console.warn('[UnreadProvider] auth subscription failed:', e?.message || e);
        }
        return () => { try { sub?.unsubscribe(); } catch (_) { /* already gone */ } };
    }, []);

    // One authoritative snapshot serves both badges and the club tab counts.
    // Explicit read events invalidate in-flight pre-read responses as well.
    const refreshCounts = async (opts = {}) => {
        if (!userId) return;
        const requestId = ++refreshSequence.current;
        if (opts?.invalidate) invalidateHeaderStats();
        try {
            const result = await getHeaderStats({ userId, force: opts === true || opts?.force === true });
            if (identityRef.current !== userId || requestId !== refreshSequence.current) return;
            if (!result?.success || typeof result.unreadMessages !== 'number' || typeof result.notificationCount !== 'number') {
                throw new Error('Unread Counts Unavailable');
            }
            setMessageCount(result.unreadMessages);
            setNotificationCount(result.notificationCount);
            setMessengerUnread(result.messengerUnread || null);
            return result;
        } catch (error) {
            console.warn('[UnreadProvider] Count refresh failed:', error?.message || error);
        }
    };
    const refreshUnread = () => refreshCounts({ force: true, invalidate: true });
    const refreshNotifications = (opts) => refreshCounts(opts);

    // Refresh on mount and when userId changes
    useEffect(() => {
        setMessageCount(0);
        setNotificationCount(0);
        setMessengerUnread(null);
        ++refreshSequence.current;
        invalidateHeaderStats();
        if (userId) {
            refreshNotifications();

            // ── Realtime subscription: notifications ───────────────────────
            // BUG-FIX-LIVE-6: subscribe to notifications inserts for THIS user
            // so both the global header bell AND the bottom-nav Alerts tab
            // receive the same update event in real time.
            //
            const scheduleNotifRefresh = () => {
                if (notifDebounceRef.current) clearTimeout(notifDebounceRef.current);
                notifDebounceRef.current = setTimeout(() => {
                    notifDebounceRef.current = null;
                    refreshCounts({ force: true, invalidate: true });
                }, 300);
            };

            let notifChannel = null;
            try {
                notifChannel = supabase
                    .channel(`unread-notifications:${userId}`)
                    .on('postgres_changes', {
                        event: 'INSERT',
                        schema: 'public',
                        table: 'notifications',
                        filter: `user_id=eq.${userId}`,
                    }, (payload) => {
                        scheduleNotifRefresh();
                        if (payload.new && payload.new.type === 'live_invite') {
                            const data = payload.new.data || {};
                            const content = data.content || '';
                            const senderName = data.sender_name || 'Someone';
                            if (content.startsWith('[LIVE_INVITE]')) {
                                const qs = content.replace('[LIVE_INVITE]', '');
                                const joinUrl = `/hub/live/guest?${qs}`;
                                toast.action(
                                    `🎥 ${senderName} invited you to join their live stream as a guest co-host!`,
                                    () => {
                                        window.location.href = joinUrl;
                                    },
                                    'info'
                                );
                            }
                        }
                    })
                    .on('postgres_changes', {
                        event: 'UPDATE',
                        schema: 'public',
                        table: 'notifications',
                        filter: `user_id=eq.${userId}`,
                    }, () => {
                        // Mark-as-read updates — recalculate the count, since UPDATE
                        // payloads don't tell us whether `read` flipped.
                        // PERF (header-audit #9): Supabase emits ONE event per row, so a
                        // mark-all over 40 notifications used to fire 40 concurrent count
                        // queries. Coalesce them.
                        scheduleNotifRefresh();
                    })
                    .on('postgres_changes', {
                        event: 'DELETE',
                        schema: 'public',
                        table: 'notifications',
                        filter: `user_id=eq.${userId}`,
                    }, () => {
                        scheduleNotifRefresh();
                    })
                    .subscribe();
            } catch (realtimeErr) {
                console.warn('[UnreadProvider] notifications realtime subscription failed - falling back to polling:', realtimeErr);
            }

            // BroadcastChannel for cross-tab sync (instantly updates other tabs when read)
            const cleanupUnreadSync = listenBroadcast('smarter_poker_unread_sync', (msg) => {
                if (msg === 'refresh_unread') {
                    refreshUnread();
                }
            });

            const cleanupNotificationSync = listenBroadcast('smarter_poker_notif_sync', msg => {
                if (msg?.tabId === BROADCAST_TAB_ID) return;
                refreshCounts({ force: true, invalidate: true });
            });

            // Keep the existing visibility-gated observation interval.
            const tick = () => {
                if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return;
                // force: a drift-correction tick must never be answered from the
                // shared short-lived result cache.
                refreshNotifications({ force: true });
            };
            const interval = setInterval(tick, 30000);

            // Catch-up on return. Without this the badge could be up to 30s stale at
            // precisely the moment the user looks at it.
            const onVisibility = () => {
                if (document.visibilityState === 'visible') tick();
            };
            if (typeof document !== 'undefined') {
                document.addEventListener('visibilitychange', onVisibility);
            }

            return () => {
                if (notifChannel) { try { supabase.removeChannel(notifChannel); } catch (_) { console.warn('[App] Handled exception:', _?.message || _); } }
                if (notifDebounceRef.current) { clearTimeout(notifDebounceRef.current); notifDebounceRef.current = null; }
                clearInterval(interval);
                if (typeof document !== 'undefined') {
                    document.removeEventListener('visibilitychange', onVisibility);
                }
                cleanupUnreadSync();
                cleanupNotificationSync();
            };
        }
    }, [userId]);

    // Enhanced setMessageCount that also broadcasts to other tabs
    const setAndBroadcastUnreadCount = (count) => {
        setMessageCount(count);
        // Only broadcast if we are specifically clearing/changing it
        broadcastSync('smarter_poker_unread_sync', 'refresh_unread');
    };

    // ── Derived totals + backwards-compat alias ────────────────────────────
    const total = messageCount + notificationCount;

    return (
        <UnreadContext.Provider value={{
            // Legacy alias — `unreadCount` historically meant messages-only.
            // Existing callers (messenger badges) keep working unchanged.
            unreadCount: messageCount,
            messageCount,
            messengerUnread,
            notificationCount,
            total,
            refreshUnread,
            refreshNotifications,
            setUnreadCount: setAndBroadcastUnreadCount,
        }}>
            {children}
        </UnreadContext.Provider>
    );
}

export function useUnreadCount() {
    return useContext(UnreadContext);
}

// UnreadBadge was removed on 2026-09-10. It was a standalone presentational
// badge "for use anywhere", and the only place that ever used it was
// src/components/social/SmarterPokerLayout.jsx - one of the 39 unreachable
// files deleted in the same pass. With that gone the export had no importer
// anywhere in pages, src, scripts or the test trees, which is exactly what
// scripts/training-surface-inventory.mjs flagged: functionPhaseReview went
// 0 -> 1 and named this export.
//
// UnreadProvider and useUnreadCount above are untouched and still live -
// _app.js provides the context, and messenger and the feed consume it.
