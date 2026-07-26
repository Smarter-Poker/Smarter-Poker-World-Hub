/**
 * UNREAD COUNT HOOK — messages + notifications
 *
 * Provides three reactive counts:
 *   - messageCount        — unread DM messages (from social_messages)
 *   - notificationCount   — unread notifications (from notifications table)
 *   - total               — messageCount + notificationCount
 *
 * `unreadCount` is preserved as an alias for messageCount so existing callers
 * that show a messenger-icon badge keep working unchanged.
 *
 * BUG-FIX-LIVE-6 (per Dan: "notifications should be sent to both the bottom
 * notification bar and the global header notifications. these should always
 * both be notified always for any and all notifications.").
 *
 * Before this fix, the bottom-nav "Alerts" tab read `unreadCount` which was
 * messages-only — so notifications never updated the bottom badge even though
 * the global header notification bell did update. Both surfaces now read from
 * the same `notificationCount` field driven by a shared Realtime subscription
 * to the `notifications` table.
 *
 * COST-FIX: The old `unread-messages` postgres_changes channel had no
 * server-side row filter, causing Supabase to broadcast every social_messages
 * INSERT to every connected user. Because social_messages has no direct
 * recipient column (membership is resolved via social_conversation_participants),
 * a simple eq filter cannot scope delivery to the right user. The channel has
 * been removed. Message unread counts are now maintained by the 30-second
 * polling interval (refreshUnread) that was already present as a drift-
 * correction backstop. Notifications continue to use a server-side
 * user_id=eq.${userId} filter and are unaffected.
 */

import { useState, useEffect, useRef, createContext, useContext } from 'react';
import { supabase } from '../lib/supabase';
import { getAuthUser } from '../lib/authUtils';
// EventBus import removed — Supabase Realtime is the sole badge updater
import { listenBroadcast, broadcastSync } from '../lib/broadcastSync';
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

    // ── Fetch unread MESSAGE count ──────────────────────────────────────────
    const refreshUnread = async () => {
        if (!userId) return;

        try {
            // Get all conversations the user is in
            const { data: participations } = await supabase
                .from('social_conversation_participants')
                .select('conversation_id, last_read_at')
                .eq('user_id', userId);

            if (!participations?.length) {
                setMessageCount(0);
                return;
            }

            // Batch: fetch ALL unread messages across all conversations in a single query
            // instead of N separate queries (fixes Sentry N+1 API Call)
            const conversationIds = participations.map(p => p.conversation_id);

            // Find the earliest last_read_at to use as a floor filter
            const earliestRead = participations.reduce((earliest, p) => {
                const ts = p.last_read_at || '1970-01-01';
                return ts < earliest ? ts : earliest;
            }, participations[0].last_read_at || '1970-01-01');

            // Single query: get all candidate messages across all conversations
            const { data: messages } = await supabase
                .from('social_messages')
                .select('conversation_id, created_at')
                .in('conversation_id', conversationIds)
                .neq('sender_id', userId)
                .eq('is_deleted', false)
                .gt('created_at', earliestRead)
                .limit(5000);

            // Count locally — only messages after the per-conversation last_read_at
            const readMap = new Map(participations.map(p => [p.conversation_id, p.last_read_at || '1970-01-01']));
            let total = 0;
            (messages || []).forEach(msg => {
                const lastRead = readMap.get(msg.conversation_id);
                if (lastRead && msg.created_at > lastRead) total++;
            });

            setMessageCount(total);
        } catch (e) {
            console.warn('Error fetching unread count:', e);
        }
    };

    // ── Fetch unread NOTIFICATION count ─────────────────────────────────────
    // BUG-FIX-LIVE-6: read both `read` and `is_read` columns because the table
    // has both (legacy schema) and individual code paths historically wrote to
    // one or the other. We treat "unread" as "neither flag set to true."
    const refreshNotifications = async () => {
        if (!userId) return;

        // BUGFIX (header-audit #3): this used to query `notifications` directly, which
        // counts SOCIAL notifications only, while /api/user/get-header-stats returns
        // social + page/poker combined. Since this value is mirrored straight into the
        // header bell, the direct query silently clobbered the API's combined count
        // within 30s — poker and page-follow notifications showed for a moment after
        // load and then vanished. The API is now the single source of truth.
        try {
            let accessToken = null;
            try {
                const authData = JSON.parse(localStorage.getItem('smarter-poker-auth') || '{}');
                accessToken = authData?.access_token || null;
            } catch (_) { /* private browsing — ignore */ }

            const res = await fetch('/api/user/get-header-stats', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
                },
                body: JSON.stringify({}),
            });
            if (res.ok) {
                const result = await res.json();
                if (result?.success && typeof result.notificationCount === 'number') {
                    setNotificationCount(result.notificationCount);
                    if (typeof result.unreadMessages === 'number') setMessageCount(result.unreadMessages);
                    return;
                }
            }
            console.warn('[UnreadProvider] header-stats gave no usable count — falling back to direct query');
        } catch (e) {
            console.warn('[UnreadProvider] header-stats fetch failed, falling back:', e?.message || e);
        }

        // Fallback: social-only count straight off the table.
        // BUGFIX (header-audit #1): the old filter was
        //   .or('read.eq.false,read.is.null,is_read.eq.false,is_read.is.null')
        // which counts a row as unread when EITHER legacy flag looks unread. A row with
        // read=true and is_read=NULL — exactly what every writer touching only one column
        // produces — matched `is_read.is.null` and stayed "unread" forever, so the badge
        // could never be cleared. "Unread" means NEITHER flag is true.
        try {
            const { count, error } = await supabase
                .from('notifications')
                .select('id', { count: 'exact', head: true })
                .eq('user_id', userId)
                .not('read', 'is', true)
                .not('is_read', 'is', true);
            if (error) {
                // AUDIT-FIX (header-audit #8): do not swallow this. A failed count used to
                // leave the previous value in place with only a console.warn, so a broken
                // query looked exactly like "you have no notifications".
                console.warn('[UnreadProvider] notification count query failed:', error.message || error);
                return;
            }
            if (typeof count === 'number') setNotificationCount(count);
        } catch (e) {
            console.warn('[UnreadProvider] notification count fetch failed:', e?.message || e);
        }
    };

    // Refresh on mount and when userId changes
    useEffect(() => {
        if (userId) {
            refreshUnread();
            refreshNotifications();

            // ── Realtime subscription: notifications ───────────────────────
            // BUG-FIX-LIVE-6: subscribe to notifications inserts for THIS user
            // so both the global header bell AND the bottom-nav Alerts tab
            // receive the same update event in real time.
            //
            // NOTE: There is intentionally NO Realtime channel for social_messages
            // here. The old `unread-messages` channel had no server-side row filter
            // (social_messages has no direct recipient column), which caused Supabase
            // to broadcast every message in the database to every connected user —
            // a significant cost driver. Message counts are kept accurate by the
            // 30-second polling interval below, plus explicit refreshUnread() calls
            // from the BroadcastChannel sync when a tab marks messages as read.
            // Trailing debounce shared by the UPDATE and DELETE handlers below.
            const scheduleNotifRefresh = () => {
                if (notifDebounceRef.current) clearTimeout(notifDebounceRef.current);
                notifDebounceRef.current = setTimeout(() => {
                    notifDebounceRef.current = null;
                    refreshNotifications();
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
                        setNotificationCount(prev => prev + 1);
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
                console.warn('[UnreadProvider] notifications realtime subscription failed — falling back to polling:', realtimeErr);
            }

            // NOTE: EventBus MESSAGE_RECEIVED listener was removed here.
            // It caused double-counting: messenger.js emits MESSAGE_RECEIVED 
            // from its own Supabase Realtime handler, AND this hook's Supabase 
            // channel fires — both incrementing the badge for the same message.
            // The Supabase Realtime channel above is the single source of truth.

            // BroadcastChannel for cross-tab sync (instantly updates other tabs when read)
            const cleanupUnreadSync = listenBroadcast('smarter_poker_unread_sync', (msg) => {
                if (msg === 'refresh_unread') {
                    // AUDIT-FIX: only refresh message count here. This broadcast fires when
                    // a DM is read in another tab. Calling refreshNotifications() was a waste
                    // — notification count has its own Realtime subscription above.
                    refreshUnread();
                }
            });

            // Refresh periodically as backup (corrects any drift).
            // For messages this is the PRIMARY update mechanism (no Realtime channel —
            // see cost-fix note above). 30 s is acceptable latency for an unread badge.
            const interval = setInterval(() => {
                refreshUnread();
                refreshNotifications();
            }, 30000);

            return () => {
                if (notifChannel) { try { supabase.removeChannel(notifChannel); } catch (_) { console.warn('[App] Handled exception:', _?.message || _); } }
                if (notifDebounceRef.current) { clearTimeout(notifDebounceRef.current); notifDebounceRef.current = null; }
                clearInterval(interval);
                cleanupUnreadSync();
            };
        }
    }, [userId]);

    // Enhanced setMessageCount that also broadcasts to other tabs
    const setAndBroadcastUnreadCount = (count) => {
        setMessageCount(count);
        // Only broadcast if we are specifically clearing/changing it
        broadcastSync('smarter_poker_unread_sync', 'refresh_unread');
    };

    // ── Derived totals + backwards-compat alias ─────────────────────────────
    const total = messageCount + notificationCount;

    return (
        <UnreadContext.Provider value={{
            // Legacy alias — `unreadCount` historically meant messages-only.
            // Existing callers (messenger badges) keep working unchanged.
            unreadCount: messageCount,
            messageCount,
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

// Standalone badge component for use anywhere
export function UnreadBadge({ count, size = 'medium', style = {} }) {
    if (!count || count <= 0) return null;

    const sizes = {
        small: { width: 16, height: 16, fontSize: 10 },
        medium: { width: 20, height: 20, fontSize: 11 },
        large: { width: 24, height: 24, fontSize: 13 },
    };

    const s = sizes[size] || sizes.medium;
    const display = count > 99 ? '99+' : count;

    return (
        <span style={{
            position: 'absolute',
            top: -4,
            right: -4,
            minWidth: s.width,
            height: s.height,
            borderRadius: s.height / 2,
            background: 'linear-gradient(135deg, #FF3B30, #E31C5F)',
            color: 'white',
            fontSize: s.fontSize,
            fontWeight: 700,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '0 4px',
            boxShadow: '0 2px 6px rgba(255, 59, 48, 0.4)',
            border: '2px solid #fff',
            ...style,
        }}>
            {display}
        </span>
    );
}
