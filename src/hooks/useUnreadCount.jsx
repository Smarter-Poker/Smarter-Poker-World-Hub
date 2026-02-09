/**
 * UNREAD MESSAGE COUNT HOOK
 * Global hook for tracking unread messages across all pages
 */

import { useState, useEffect, createContext, useContext } from 'react';
import { supabase } from '../lib/supabase';
import { getAuthUser } from '../lib/authUtils';

const UnreadContext = createContext({
    unreadCount: 0,
    refreshUnread: () => { },
});

export function UnreadProvider({ children }) {
    const [unreadCount, setUnreadCount] = useState(0);
    const [userId, setUserId] = useState(null);

    // Get user on mount - use bulletproof authUtils instead of supabase client
    useEffect(() => {
        // 🛡️ BULLETPROOF: Read from localStorage to avoid AbortError
        const user = getAuthUser();
        if (user) {
            setUserId(user.id);
        }
    }, []);

    // Fetch unread count
    const refreshUnread = async () => {
        if (!userId) return;

        try {
            // Get all conversations the user is in
            const { data: participations } = await supabase
                .from('social_conversation_participants')
                .select('conversation_id, last_read_at')
                .eq('user_id', userId);

            if (!participations?.length) {
                setUnreadCount(0);
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
                .gt('created_at', earliestRead);

            // Count locally — only messages after the per-conversation last_read_at
            const readMap = new Map(participations.map(p => [p.conversation_id, p.last_read_at || '1970-01-01']));
            let total = 0;
            (messages || []).forEach(msg => {
                const lastRead = readMap.get(msg.conversation_id);
                if (lastRead && msg.created_at > lastRead) total++;
            });

            setUnreadCount(total);
        } catch (e) {
            console.error('Error fetching unread count:', e);
        }
    };

    // Refresh on mount and when userId changes
    useEffect(() => {
        if (userId) {
            refreshUnread();

            // Set up real-time subscription for new messages
            const channel = supabase
                .channel('unread-messages')
                .on('postgres_changes', {
                    event: 'INSERT',
                    schema: 'public',
                    table: 'social_messages',
                }, (payload) => {
                    // If the message is not from us, increment count
                    if (payload.new.sender_id !== userId) {
                        setUnreadCount(prev => prev + 1);
                    }
                })
                .subscribe();

            // Refresh periodically as backup
            const interval = setInterval(refreshUnread, 60000);

            return () => {
                supabase.removeChannel(channel);
                clearInterval(interval);
            };
        }
    }, [userId]);

    return (
        <UnreadContext.Provider value={{ unreadCount, refreshUnread, setUnreadCount }}>
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
