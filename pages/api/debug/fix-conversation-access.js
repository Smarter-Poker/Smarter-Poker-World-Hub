// Debug API: Check conversation participants and fix if needed
// pages/api/debug/fix-conversation-access.js

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
    const CONVO_ID = 'ab868e7d-a75b-4a6d-ab46-7839e8302e89';

    try {
        // Check participants
        const { data: participants, error: pError } = await supabase
            .from('social_conversation_participants')
            .select('*')
            .eq('conversation_id', CONVO_ID);

        const danielInConvo = participants?.some(p => p.user_id === DANIEL_ID);
        const marcelaInConvo = participants?.some(p => p.user_id === MARCELA_ID);

        let fixes = [];

        // Add missing participants
        if (!danielInConvo) {
            const { error } = await supabase
                .from('social_conversation_participants')
                .insert({ conversation_id: CONVO_ID, user_id: DANIEL_ID });
            fixes.push(error ? `Failed to add Daniel: ${error.message}` : 'Added Daniel to conversation');
        }

        if (!marcelaInConvo) {
            const { error } = await supabase
                .from('social_conversation_participants')
                .insert({ conversation_id: CONVO_ID, user_id: MARCELA_ID });
            fixes.push(error ? `Failed to add Marcela: ${error.message}` : 'Added Marcela to conversation');
        }

        // Check messages count
        const { data: messages, count } = await supabase
            .from('social_messages')
            .select('id', { count: 'exact' })
            .eq('conversation_id', CONVO_ID);

        return res.json({
            success: true,
            conversationId: CONVO_ID,
            participants: participants,
            danielInConvo,
            marcelaInConvo,
            fixes: fixes.length > 0 ? fixes : 'No fixes needed - both users are participants',
            messageCount: count,
            diagnosis: !danielInConvo || !marcelaInConvo
                ? 'PARTICIPANT RECORD MISSING - This was the bug! RLS couldnt verify user was in conversation'
                : 'Participants look good, RLS should work. Try refreshing messenger.'
        });
    } catch (e) {
        return res.status(500).json({ error: e.message, stack: e.stack });
    }
}
