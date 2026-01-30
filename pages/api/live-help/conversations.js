/* ═══════════════════════════════════════════════════════════════════════════
   API: Get Recent Conversations
   Returns list of user's recent Live Help conversations
   ═══════════════════════════════════════════════════════════════════════════ */

import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
);

export default async function handler(req, res) {
    if (req.method !== 'GET') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    try {
        const authHeader = req.headers.authorization;
        if (!authHeader?.startsWith('Bearer ')) {
            return res.status(401).json({ error: 'Unauthorized' });
        }

        const token = authHeader.replace('Bearer ', '');
        const { data: { user }, error: authError } = await supabase.auth.getUser(token);

        if (authError || !user) {
            return res.status(401).json({ error: 'Invalid token' });
        }

        // Get last 5 conversations with first message
        const { data: conversations, error } = await supabase
            .from('live_help_conversations')
            .select(`
                id,
                updated_at,
                live_help_messages!inner (
                    content
                )
            `)
            .eq('user_id', user.id)
            .order('updated_at', { ascending: false })
            .limit(5);

        if (error) {
            console.error('Failed to fetch conversations:', error);
            return res.status(500).json({ error: 'Failed to fetch conversations' });
        }

        // Format response with first message
        const formattedConversations = conversations.map(conv => ({
            id: conv.id,
            first_message: conv.live_help_messages[0]?.content || 'New conversation',
            updated_at: conv.updated_at
        }));

        return res.status(200).json({ conversations: formattedConversations });

    } catch (error) {
        console.error('Conversations API error:', error);
        return res.status(500).json({ error: 'Internal server error' });
    }
}
