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
 */

import { useState, useEffect, createContext, useContext } from 'react';
import { supabase } from '../lib/supabase';
import { getAuthUser } from '../lib/authUtils';
// EventBus import removed — Supabase Realtime is the sole badge updater
import { listenBroadcast, broadcastSync } from '../lib/broadcastSync';

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

    // Get user on mount - use bulletproof authUtils instead of supabase client
    useEffect(() => {
        // 🛡️ BULLETPROOF: Read from localStorage to avoid AbortError
        const user = getAuthUser();
        if (user) {
            setUserId(user.id);
        }
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
        try {
            const { count, error } = await supabase
                .from('notifications')
                .select('id', { count: 'exact', head: true })
                .eq('user_id', userId)
                // .or() captures rows where either flag indicates unread.
                .or('read.eq.false,read.is.null,is_read.eq.false,is_read.is.null');
            if (!error && typeof count === 'number') {
                setNotificationCount(count);
            }
        } catch (e) {
            console.warn('[UnreadProvider] notification count fetch failed:', e?.message || e);
        }
    };

    // Refresh on mount and when userId changes
    useEffect(() => {
        if (userId) {
            refreshUnread();
            refreshNotifications();

            // ── Realtime subscription: messages ────────────────────────────
            // Wrapped in try-catch: if supabase.channel().on() chaining fails
            // (e.g. mock client resolved instead of real client), the page must
            // NOT crash — periodic refreshUnread() is the fallback.
            let messagesChannel = null;
            try {
                messagesChannel = supabase
                    .channel(`unread-messages:${userId}`)
                    .on('postgres_changes', {
                        event: 'INSERT',
                        schema: 'public',
                        table: 'social_messages',
                    }, async (payload) => {
                        // Ignore our own messages
                        if (payload.new.sender_id === userId) return;

                        // Verify this message is in a conversation we participate in
                        try {
                            const { data: participation } = await supabase
                                .from('social_conversation_participants')
                                .select('conversation_id')
                                .eq('user_id', userId)
                                .eq('conversation_id', payload.new.conversation_id)
                                .maybeSingle();

                            if (participation) {
                                setMessageCount(prev => prev + 1);
                            }
                        } catch (_) { console.warn('[App] Handled exception:', _?.message || _); }
                    })
                    .on('postgres_changes', {
                        event: 'UPDATE',
                        schema: 'public',
                        table: 'social_messages',
                    }, (payload) => {
                        // DEEP SWEEP FIX: Catch delete-for-everyone (Unsend) events
                        // If a message we haven't read gets deleted, we must decrement the badge.
                        // The safest real-time response is to just recalculate the badge completely:
                        if (payload.new.is_deleted === true) {
                            refreshUnread();
                        }
                    })
                    .subscribe();
            } catch (realtimeErr) {
                console.warn('[UnreadProvider] messages realtime subscription failed — falling back to polling:', realtimeErr);
            }

            // ── Realtime subscription: notifications ───────────────────────
            // BUG-FIX-LIVE-6: subscribe to notifications inserts for THIS user
            // so both the global header bell AND the bottom-nav Alerts tab
            // receive the same update event in real time.
            let notifChannel = null;
            try {
                notifChannel = supabase
                    .channel(`unread-notifications:${userId}`)
                    .on('postgres_changes', {
                        event: 'INSERT',
                        schema: 'public',
                        table: 'notifications',
                        filter: `user_id=eq.${userId}`,
                    }, () => {
                        setNotificationCount(prev => prev + 1);
                    })
                    .on('postgres_changes', {
                        event: 'UPDATE',
                        schema: 'public',
                        table: 'notifications',
                        filter: `user_id=eq.${userId}`,
                    }, () => {
                        // Mark-as-read updates — recalculate the count from the table
                        // since UPDATE payloads don't tell us whether read flipped from
                        // unread to read.
                        refreshNotifications();
                    })
                    .on('postgres_changes', {
                        event: 'DELETE',
                        schema: 'public',
                        table: 'notifications',
                        filter: `user_id=eq.${userId}`,
                    }, () => {
                        refreshNotifications();
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

            // Refresh periodically as backup (corrects any drift)
            const interval = setInterval(() => {
                refreshUnread();
                refreshNotifications();
            }, 30000);

            return () => {
                if (messagesChannel) { try { supabase.removeChannel(messagesChannel); } catch (_) { console.warn('[App] Handled exception:', _?.message || _); } }
                if (notifChannel) { try { supabase.removeChannel(notifChannel); } catch (_) { console.warn('[App] Handled exception:', _?.message || _); } }
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
