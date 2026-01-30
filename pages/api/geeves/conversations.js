/* ═══════════════════════════════════════════════════════════════════════════
   GET GEEVES CONVERSATIONS — Fetch user's conversation history
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

        const { limit = 10 } = req.query;

        // Fetch conversations with message count
        const { data: conversations, error } = await supabase
            .from('geeves_conversations')
            .select(`
                id,
                title,
                created_at,
                updated_at,
                geeves_messages!inner(id)
            `)
            .eq('user_id', user.id)
            .order('updated_at', { ascending: false })
            .limit(parseInt(limit));

        if (error) throw error;

        // Format response with message counts
        const formattedConversations = conversations?.map(conv => ({
            id: conv.id,
            title: conv.title,
            createdAt: conv.created_at,
            updatedAt: conv.updated_at,
            messageCount: conv.geeves_messages?.length || 0
        })) || [];

        return res.status(200).json({
            conversations: formattedConversations
        });

    } catch (error) {
        console.error('[Geeves Conversations] Error:', error);
        return res.status(500).json({ error: 'Failed to fetch conversations' });
    }
}
