/**
 * UNREAD MESSAGE COUNT HOOK
 * Global hook for tracking unread messages across all pages
 */

import { useState, useEffect, createContext, useContext } from 'react';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

const UnreadContext = createContext({
    unreadCount: 0,
    refreshUnread: () => { },
});

export function UnreadProvider({ children }) {
    const [unreadCount, setUnreadCount] = useState(0);
    const [userId, setUserId] = useState(null);

    // Get user on mount
    useEffect(() => {
        supabase.auth.getUser().then(({ data }) => {
            if (data?.user) {
                setUserId(data.user.id);
            }
        });
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

            // Count unread messages across all conversations
            let total = 0;
            for (const p of participations) {
                const { count } = await supabase
                    .from('social_messages')
                    .select('id', { count: 'exact', head: true })
                    .eq('conversation_id', p.conversation_id)
                    .neq('sender_id', userId)
                    .eq('is_deleted', false)
                    .gt('created_at', p.last_read_at || '1970-01-01');

                total += count || 0;
            }

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
