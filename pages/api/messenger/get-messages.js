// API Route: Get messages for a conversation (bypasses broken RLS)
// pages/api/messenger/get-messages.js

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

    const { conversationId, userId } = req.body;

    if (!conversationId || !userId) {
        return res.status(400).json({ error: 'Missing conversationId or userId' });
    }

    const supabase = createClient(SUPABASE_URL.trim(), SUPABASE_SERVICE_KEY);

    try {
        // First verify user is a participant in this conversation (security check)
        const { data: participant, error: partError } = await supabase
            .from('social_conversation_participants')
            .select('id')
            .eq('conversation_id', conversationId)
            .eq('user_id', userId)
            .single();

        if (partError || !participant) {
            return res.status(403).json({ error: 'Not a participant in this conversation' });
        }

        // Fetch messages with sender profiles
        const { data: messages, error } = await supabase
            .from('social_messages')
            .select(`
                id,
                content,
                created_at,
                sender_id,
                is_deleted,
                profiles:sender_id (id, username, avatar_url)
            `)
            .eq('conversation_id', conversationId)
            .eq('is_deleted', false)
            .order('created_at', { ascending: true })
            .limit(100);

        if (error) {
            console.error('[ANTIGRAVITY] Error fetching messages:', error);
            return res.status(500).json({ error: error.message });
        }

        return res.json({
            success: true,
            messages: messages || [],
            count: messages?.length || 0
        });
    } catch (e) {
        console.error('[ANTIGRAVITY] Exception:', e);
        return res.status(500).json({ error: e.message });
    }
}
