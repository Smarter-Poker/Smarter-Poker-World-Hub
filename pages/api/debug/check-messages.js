// Debug API: Check messaging between two users
// pages/api/debug/check-messages.js

import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://kuklfnapbkmacvwxktbh.supabase.co';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

export default async function handler(req, res) {
    if (!SUPABASE_SERVICE_KEY) {
        return res.status(500).json({ error: 'Service key not configured' });
    }

    const supabase = createClient(SUPABASE_URL.trim(), SUPABASE_SERVICE_KEY);

    const DANIEL_ID = '47965354-0e56-43ef-931c-ddaab82af765';
    const MARCELA_ID = '9ca264f1-c0aa-4df9-bc39-1a97bdaad016';

    try {
        // Find conversations between Daniel and Marcela
        const { data: danielConvos, error: dcError } = await supabase
            .from('social_conversation_participants')
            .select('conversation_id')
            .eq('user_id', DANIEL_ID);

        const { data: marcelaConvos, error: mcError } = await supabase
            .from('social_conversation_participants')
            .select('conversation_id')
            .eq('user_id', MARCELA_ID);

        // Find shared conversation
        const danielConvoIds = new Set(danielConvos?.map(c => c.conversation_id) || []);
        const sharedConvoId = marcelaConvos?.find(c => danielConvoIds.has(c.conversation_id))?.conversation_id;

        let messages = [];
        let conversation = null;

        if (sharedConvoId) {
            // Get the conversation
            const { data: convo } = await supabase
                .from('social_conversations')
                .select('*')
                .eq('id', sharedConvoId)
                .single();
            conversation = convo;

            // Get all messages in this conversation
            const { data: msgs, error: msgError } = await supabase
                .from('social_messages')
                .select(`
                    id,
                    conversation_id,
                    sender_id,
                    content,
                    created_at,
                    is_deleted,
                    is_read
                `)
                .eq('conversation_id', sharedConvoId)
                .order('created_at', { ascending: false })
                .limit(20);

            messages = msgs || [];
        }

        // Check for recent messages from either user
        const { data: recentFromDaniel } = await supabase
            .from('social_messages')
            .select('*')
            .eq('sender_id', DANIEL_ID)
            .order('created_at', { ascending: false })
            .limit(5);

        const { data: recentFromMarcela } = await supabase
            .from('social_messages')
            .select('*')
            .eq('sender_id', MARCELA_ID)
            .order('created_at', { ascending: false })
            .limit(5);

        return res.json({
            success: true,
            users: { daniel: DANIEL_ID, marcela: MARCELA_ID },
            sharedConversationId: sharedConvoId || 'NONE - They have no shared conversation!',
            conversation,
            messagesInConversation: messages.length,
            messages: messages,
            recentFromDaniel: recentFromDaniel,
            recentFromMarcela: recentFromMarcela,
            diagnosis: !sharedConvoId
                ? 'NO SHARED CONVERSATION - They need to start a chat first!'
                : messages.length === 0
                    ? 'CONVERSATION EXISTS BUT NO MESSAGES SAVED'
                    : 'Messages exist, checking RLS or real-time issues'
        });
    } catch (e) {
        return res.status(500).json({ error: e.message, stack: e.stack });
    }
}
