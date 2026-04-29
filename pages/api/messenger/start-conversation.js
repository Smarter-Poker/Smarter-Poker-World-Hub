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

        // Try RPC first (works with service role).
        // CRITICAL: param names are p_user_id / p_other_user_id (verified via
        // pg_get_functiondef). The previous call sent user1_id / user2_id which
        // PostgREST could not bind, returning PGRST202. That silently dropped
        // every call to the (broken) inline path below — and any partial-insert
        // failure there left conversations with only ONE participant row,
        // which is what caused KingFish's Johnny conversation to vanish.
        const { data: rpcResult, error: rpcErr } = await supabase.rpc('fn_get_or_create_conversation', {
            p_user_id: user.id,
            p_other_user_id: otherUserId,
        });

        if (!rpcErr) {
            // The RPC returns jsonb { success, conversation_id, created }.
            // Treating the whole jsonb as a UUID (the previous bug) gave the
            // client an object instead of an ID and broke the navigation.
            if (rpcResult && rpcResult.success && rpcResult.conversation_id) {
                return res.status(200).json({
                    success: true,
                    conversationId: rpcResult.conversation_id,
                    created: rpcResult.created === true,
                });
            }
            // RPC returned but signaled failure — surface it.
            console.warn('[start-conversation] RPC returned non-success:', rpcResult);
            return res.status(500).json({ success: false, error: rpcResult?.error || 'RPC failed' });
        }

        // RPC errored — only fall back if it doesn't exist. Other errors must
        // surface so we don't paper over real bugs.
        const code = String(rpcErr.code || '');
        const msg = String(rpcErr.message || '');
        const rpcMissing = code === 'PGRST202' || /function .* does not exist/i.test(msg) || /could not find the function/i.test(msg);
        if (!rpcMissing) {
            console.warn('[start-conversation] RPC error (not falling back):', rpcErr);
            return res.status(500).json({ success: false, error: 'Internal server error' });
        }

        console.warn('[start-conversation] RPC not deployed; using inline fallback:', msg);

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
            return res.status(200).json({ success: true, conversationId: foundId, created: false });
        }

        // Create new conversation
        const { data: newConv, error: createErr } = await supabase
            .from('social_conversations')
            .insert({ is_group: false, created_at: new Date().toISOString(), updated_at: new Date().toISOString() })
            .select('id')
            .maybeSingle();

        if (createErr || !newConv) {
            console.warn('[start-conversation] Failed to create conversation:', createErr);
            return res.status(500).json({ success: false, error: 'Failed to create conversation' });
        }

        // CRITICAL: insert BOTH participants and check the result. The previous
        // code never inspected the insert error, so any partial failure (RLS,
        // unique-constraint race, transient outage) left exactly one participant
        // row in place — which is the asymmetric-row bug we just had to manually
        // repair on Dan's KingFish account.
        const { error: partErr, data: partData } = await supabase
            .from('social_conversation_participants')
            .insert([
                { conversation_id: newConv.id, user_id: user.id, joined_at: new Date().toISOString(), last_read_at: new Date().toISOString() },
                { conversation_id: newConv.id, user_id: otherUserId, joined_at: new Date().toISOString(), last_read_at: new Date().toISOString() },
            ])
            .select('user_id');

        if (partErr || !partData || partData.length !== 2) {
            // Roll back the conversation row so we don't leave an orphan parent.
            try {
                await supabase.from('social_conversations').delete().eq('id', newConv.id);
            } catch (rbErr) {
                console.warn('[start-conversation] Conversation rollback failed:', rbErr?.message || rbErr);
            }
            console.warn('[start-conversation] Participant insert failed:', partErr, 'inserted:', partData?.length);
            return res.status(500).json({ success: false, error: 'Failed to add participants' });
        }

        return res.status(200).json({ success: true, conversationId: newConv.id, created: true });
    } catch (err) {
        console.error('[start-conversation] Error:', err.message);
        if (!res.headersSent) return res.status(500).json({ success: false, error: 'Internal server error' });
    }
}
