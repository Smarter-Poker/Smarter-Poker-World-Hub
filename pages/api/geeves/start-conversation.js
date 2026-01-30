/* ═══════════════════════════════════════════════════════════════════════════
   START GEEVES CONVERSATION — Initialize new poker strategy conversation
   ═══════════════════════════════════════════════════════════════════════════ */

import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
);

export default async function handler(req, res) {
    if (req.method !== 'POST') {
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

        // Fetch user profile for personalized greeting
        const { data: profile } = await supabase
            .from('profiles')
            .select('first_name, username')
            .eq('id', user.id)
            .single();

        const userName = profile?.first_name || profile?.username || 'there';

        // Create conversation
        const { data: conversation, error: convError } = await supabase
            .from('geeves_conversations')
            .insert({
                user_id: user.id,
                title: 'New Poker Conversation'
            })
            .select()
            .single();

        if (convError) {
            throw convError;
        }

        // Create personalized greeting
        const greeting = `Good evening, ${userName}! I'm Geeves, your poker strategy expert.

I have deep knowledge of:
• **GTO Strategy** — Optimal play theory
• **Tournament Poker** — ICM, bubble play, final tables
• **Cash Games** — All stakes and formats
• **Hand Analysis** — Detailed breakdowns
• **Poker Math** — Equity, odds, EV calculations

What poker question can I help you with today?`;

        // Save greeting message
        await supabase.from('geeves_messages').insert({
            conversation_id: conversation.id,
            content: greeting,
            is_user: false
        });

        return res.status(200).json({
            conversationId: conversation.id,
            greeting
        });

    } catch (error) {
        console.error('[Geeves] Start conversation error:', error);
        return res.status(500).json({ error: 'Failed to start conversation' });
    }
}
