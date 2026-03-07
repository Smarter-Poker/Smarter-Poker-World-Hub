// API Route: Get messages for a conversation (bypasses broken RLS)
// pages/api/messenger/get-messages.js

import { createClient } from '../../../src/lib/supabaseServerClient';
import { applyRateLimit, LIMITS } from '../../../src/lib/apiRateLimit';
import { getServerUser } from '../../../src/lib/serverAuth';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

export default async function handler(req, res) {
  if (['POST','PUT','PATCH','DELETE'].includes(req.method)) {
    if (!applyRateLimit(req, res, LIMITS.write)) return;
  }

    if (req.method !== 'POST') {
        return res.status(405).json({ success: false, error: 'Method not allowed' });
    }

    if (!SUPABASE_SERVICE_ROLE_KEY) {
        return res.status(500).json({ success: false, error: 'Service key not configured' });
    }

    const supabase = createClient(SUPABASE_URL.trim(), SUPABASE_SERVICE_ROLE_KEY);

    // ── Auth: verify JWT identity ──
    const token = req.headers.authorization?.replace('Bearer ', '');
    if (!token) return res.status(401).json({ success: false, error: 'Auth required' });
    const { data: { user }, error: authErr } = await supabase.auth.getUser(token);
    if (authErr || !user) return res.status(401).json({ success: false, error: 'Invalid token' });

    const userId = user.id; // From JWT, NOT body
    const { conversationId } = req.body;

    if (!conversationId) {
        return res.status(400).json({ success: false, error: 'Missing conversationId' });
    }

    try {
        // First verify user is a participant in this conversation (security check)
        const { data: participant, error: partError } = await supabase
            .from('social_conversation_participants')
            .select('id')
            .eq('conversation_id', conversationId)
            .eq('user_id', userId)
            .single();

        if (partError || !participant) {
            return res.status(403).json({ success: false, error: 'Not a participant in this conversation' });
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
                profiles:sender_id (id, username, avatar_url, is_vip)
            `)
            .eq('conversation_id', conversationId)
            .eq('is_deleted', false)
            .order('created_at', { ascending: true })
            .limit(100);

        if (error) {
            console.error('[ANTIGRAVITY] Error fetching messages:', error);
            return res.status(500).json({ success: false, error: error.message });
        }

        return res.json({
            success: true,
            messages: messages || [],
            count: messages?.length || 0
        });
    } catch (e) {
        console.error('[ANTIGRAVITY] Exception:', e);
        return res.status(500).json({ success: false, error: e.message });
    }
}
