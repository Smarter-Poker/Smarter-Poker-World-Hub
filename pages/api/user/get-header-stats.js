// API Route: Get user profile for header (bypasses RLS issues)
// pages/api/user/get-header-stats.js

import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://kuklfnapbkmacvwxktbh.supabase.co';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

export default async function handler(req, res) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    if (!SUPABASE_SERVICE_KEY) {
        return res.status(500).json({ error: 'Service key not configured' });
    }

    const { userId } = req.body;

    if (!userId) {
        return res.status(400).json({ error: 'Missing userId' });
    }

    const supabase = createClient(SUPABASE_URL.trim(), SUPABASE_SERVICE_KEY);

    try {
        // Fetch profile data for header
        const { data: profile, error } = await supabase
            .from('profiles')
            .select('username, full_name, avatar_url, xp_total, diamonds')
            .eq('id', userId)
            .single();

        if (error) {
            console.error('[get-header-stats] Profile error:', error);
            return res.status(500).json({ error: error.message });
        }

        if (!profile) {
            return res.status(404).json({ error: 'Profile not found' });
        }

        // Calculate level from XP
        const xpTotal = profile.xp_total || 0;
        const level = Math.max(1, Math.floor(Math.sqrt(xpTotal / 231)));

        // Count unread notifications
        const { count: notificationCount } = await supabase
            .from('notifications')
            .select('*', { count: 'exact', head: true })
            .eq('user_id', userId)
            .eq('read', false);

        // Count unread messages - using social messaging schema
        // Get user's conversations with their last_read_at timestamp
        // Join with social_conversations to only include conversations that have actual messages
        const { data: conversations } = await supabase
            .from('social_conversation_participants')
            .select(`
                conversation_id, 
                last_read_at,
                social_conversations!inner(last_message_at, last_message_preview)
            `)
            .eq('user_id', userId)
            .not('social_conversations.last_message_at', 'is', null)
            .not('social_conversations.last_message_preview', 'is', null);

        let unreadMessages = 0;
        if (conversations && conversations.length > 0) {
            // Count messages in each conversation that are newer than last_read_at and not sent by user
            for (const conv of conversations) {
                const lastRead = conv.last_read_at || '1970-01-01';
                const { count } = await supabase
                    .from('social_messages')
                    .select('id', { count: 'exact', head: true })
                    .eq('conversation_id', conv.conversation_id)
                    .neq('sender_id', userId)
                    .eq('is_deleted', false)
                    .gt('created_at', lastRead);

                unreadMessages += count || 0;
            }
        }

        return res.json({
            success: true,
            profile: {
                username: profile.username,
                full_name: profile.full_name,
                avatar_url: profile.avatar_url,
                xp: xpTotal,
                diamonds: profile.diamonds || 0,
                level
            },
            notificationCount: notificationCount || 0,
            unreadMessages
        });
    } catch (e) {
        console.error('[get-header-stats] Exception:', e);
        return res.status(500).json({ error: e.message });
    }
}
