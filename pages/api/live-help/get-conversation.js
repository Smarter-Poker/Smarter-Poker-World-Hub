/* ═══════════════════════════════════════════════════════════════════════════
   API: Get Live Help Conversation
   Fetches conversation history
   ═══════════════════════════════════════════════════════════════════════════ */

import { supabase } from '../../../src/lib/supabase';
import { getAuthUser } from '../../../src/lib/authUtils';

export default async function handler(req, res) {
    if (req.method !== 'GET') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    try {
        // Get authenticated user
        const user = getAuthUser();
        if (!user) {
            return res.status(401).json({ error: 'Unauthorized' });
        }

        const { conversationId } = req.query;

        if (!conversationId) {
            return res.status(400).json({ error: 'Missing conversationId' });
        }

        // Get conversation with messages
        const { data: conversation, error: convError } = await supabase
            .from('live_help_conversations')
            .select(`
                *,
                live_help_messages (*)
            `)
            .eq('id', conversationId)
            .eq('user_id', user.id)
            .single();

        if (convError || !conversation) {
            return res.status(404).json({ error: 'Conversation not found' });
        }

        // Sort messages by created_at
        const messages = (conversation.live_help_messages || []).sort((a, b) =>
            new Date(a.created_at) - new Date(b.created_at)
        );

        return res.status(200).json({
            conversation: {
                id: conversation.id,
                agentId: conversation.agent_id,
                status: conversation.status,
                startedAt: conversation.started_at,
                endedAt: conversation.ended_at,
                context: conversation.context
            },
            messages
        });

    } catch (error) {
        console.error('Get conversation error:', error);
        return res.status(500).json({ error: 'Internal server error' });
    }
}
