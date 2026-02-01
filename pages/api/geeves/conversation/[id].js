/* ═══════════════════════════════════════════════════════════════════════════
   GET CONVERSATION MESSAGES — Load messages for a specific conversation
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

        const { id } = req.query;

        if (!id) {
            return res.status(400).json({ error: 'Conversation ID is required' });
        }

        // Verify conversation belongs to user
        const { data: conversation, error: convError } = await supabase
            .from('geeves_conversations')
            .select('id, title, user_id')
            .eq('id', id)
            .single();

        if (convError || !conversation) {
            return res.status(404).json({ error: 'Conversation not found' });
        }

        if (conversation.user_id !== user.id) {
            return res.status(403).json({ error: 'Access denied' });
        }

        // Fetch messages
        const { data: messages, error: msgError } = await supabase
            .from('geeves_messages')
            .select('id, content, is_user, cache_id, from_cache, created_at')
            .eq('conversation_id', id)
            .order('created_at', { ascending: true });

        if (msgError) throw msgError;

        return res.status(200).json({
            conversation: {
                id: conversation.id,
                title: conversation.title
            },
            messages: messages?.map(msg => ({
                id: msg.id,
                content: msg.content,
                isUser: msg.is_user,
                cacheId: msg.cache_id,
                fromCache: msg.from_cache,
                timestamp: msg.created_at
            })) || []
        });

    } catch (error) {
        console.error('[Geeves Get Conversation] Error:', error);
        return res.status(500).json({ error: 'Failed to fetch conversation' });
    }
}
