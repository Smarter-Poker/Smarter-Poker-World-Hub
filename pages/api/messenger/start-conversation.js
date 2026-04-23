/**
 * POST /api/messenger/start-conversation
 *
 * Gets or creates a 1-on-1 conversation between two users.
 * Runs fn_get_or_create_conversation via service role — bypasses the
 * missing GRANT EXECUTE on the authenticated role.
 *
 * Body: { otherUserId: string }
 * Returns: { success: true, conversationId: string }
 */
import { getServerUserWithFallback } from '../../../src/lib/serverAuth';
import { applyRateLimit, LIMITS } from '../../../src/lib/apiRateLimit';
import { createClient } from '../../../src/lib/supabaseServerClient';

let _supabase = null;
function getSupabase() {
    if (!_supabase) {
        const url = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://kuklfnapbkmacvwxktbh.supabase.co';
        const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
        _supabase = createClient(url, key);
    }
    return _supabase;
}

export default async function handler(req, res) {
    try {
        if (req.method !== 'POST') return res.status(405).json({ success: false, error: 'Method not allowed' });
        if (!applyRateLimit(req, res, LIMITS.write)) return;

        const { user, error: authErr } = await getServerUserWithFallback(req, getSupabase());
        if (authErr || !user) return res.status(401).json({ success: false, error: 'Authentication required' });

        const { otherUserId } = req.body;
        if (!otherUserId) return res.status(400).json({ success: false, error: 'otherUserId required' });
        if (otherUserId === user.id) return res.status(400).json({ success: false, error: 'Cannot start conversation with yourself' });

        const supabase = getSupabase();

        // Try RPC first (works with service role)
        const { data: convId, error: rpcErr } = await supabase.rpc('fn_get_or_create_conversation', {
            user1_id: user.id,
            user2_id: otherUserId,
        });

        if (rpcErr) {
            // RPC not found — implement inline with service role
            console.warn('[start-conversation] RPC not found, using inline implementation:', rpcErr.message);

            // Find existing direct conversation
            const { data: existing } = await supabase
                .from('social_conversation_participants')
                .select('conversation_id, social_conversations!inner(id, is_group)')
                .eq('user_id', user.id)
                .eq('social_conversations.is_group', false)
                .limit(50);

            const myConvIds = (existing || []).map(p => p.conversation_id);

            let foundId = null;
            if (myConvIds.length > 0) {
                // Check if otherUser is in any of the same conversations
                const { data: shared } = await supabase
                    .from('social_conversation_participants')
                    .select('conversation_id')
                    .eq('user_id', otherUserId)
                    .in('conversation_id', myConvIds)
                    .limit(1);

                foundId = shared?.[0]?.conversation_id || null;
            }

            if (foundId) {
                return res.status(200).json({ success: true, conversationId: foundId });
            }

            // Create new conversation
            const { data: newConv, error: createErr } = await supabase
                .from('social_conversations')
                .insert({ is_group: false, created_at: new Date().toISOString(), updated_at: new Date().toISOString() })
                .select('id')
                .maybeSingle();

            if (createErr) return res.status(500).json({ success: false, error: 'Failed to create conversation' });

            await supabase.from('social_conversation_participants').insert([
                { conversation_id: newConv.id, user_id: user.id, joined_at: new Date().toISOString(), last_read_at: new Date().toISOString() },
                { conversation_id: newConv.id, user_id: otherUserId, joined_at: new Date().toISOString(), last_read_at: new Date().toISOString() },
            ]);

            return res.status(200).json({ success: true, conversationId: newConv.id });
        }

        return res.status(200).json({ success: true, conversationId: convId });
    } catch (err) {
        console.error('[start-conversation] Error:', err.message);
        if (!res.headersSent) return res.status(500).json({ success: false, error: 'Internal server error' });
    }
}
