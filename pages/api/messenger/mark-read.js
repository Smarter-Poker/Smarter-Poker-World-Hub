/**
 * 📬 MARK CONVERSATION AS READ API - Service Role
 * Bypasses RLS to ensure last_read_at is properly updated
 */

import { createClient } from '@supabase/supabase-js';

// Use service role to bypass RLS
const supabaseAdmin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
);

export default async function handler(req, res) {
    if (req.method !== 'POST') {
        return res.status(405).json({ success: false, error: 'Method not allowed' });
    }

    const { conversationId, userId } = req.body;

    if (!conversationId || !userId) {
        return res.status(400).json({ success: false, error: 'conversationId and userId required' });
    }

    console.log('[MARK-READ] Marking conversation read:', { conversationId, userId });

    try {
        // Update last_read_at to now
        const { data, error } = await supabaseAdmin
            .from('social_conversation_participants')
            .update({ last_read_at: new Date().toISOString() })
            .eq('conversation_id', conversationId)
            .eq('user_id', userId)
            .select()
            .single();

        if (error) {
            console.error('[MARK-READ] Update error:', error);
            return res.status(500).json({ success: false, error: error.message });
        }

        console.log('[MARK-READ] Success:', data);
        return res.json({ success: true, data });

    } catch (error) {
        console.error('[MARK-READ] Error:', error);
        return res.status(500).json({ success: false, error: error.message });
    }
}
