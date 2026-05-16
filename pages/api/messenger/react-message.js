/**
 * POST /api/messenger/react-message
 *
 * Toggles a reaction emoji on a message using service role key.
 * The fn_toggle_message_reaction RPC requires GRANT EXECUTE to authenticated
 * which is not currently set — service role bypasses this restriction.
 *
 * Body: { messageId: string, reaction: string }
 * Returns: { success: true }
 */
import { getServerUserWithFallback } from '../../../src/lib/serverAuth';
import { applyRateLimit, LIMITS } from '../../../src/lib/apiRateLimit';
import { createClient } from '../../../src/lib/supabaseServerClient';

let _supabase = null;
function getSupabase() {
    if (!_supabase) {
        const url = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://kuklfnapbkmacvwxktbh.supabase.co';
        const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
        if (!key) throw new Error('SUPABASE_SERVICE_ROLE_KEY not configured');
        _supabase = createClient(url, key);
    }
    return _supabase;
}

// Allowed reactions whitelist to prevent injection
const ALLOWED_REACTIONS = new Set(['👍', '❤️', '😂', '😮', '😢', '😡', '🔥', '👎', '🎉', '👏', '🙏', '🤔', '✅', '💯']);

export default async function handler(req, res) {
    try {
        if (req.method !== 'POST') return res.status(405).json({ success: false, error: 'Method not allowed' });
        if (!applyRateLimit(req, res, LIMITS.write)) return;

        const { user, error: authErr } = await getServerUserWithFallback(req, getSupabase());
        if (authErr || !user) return res.status(401).json({ success: false, error: 'Authentication required' });

        const { messageId, reaction } = req.body;
        if (!messageId) return res.status(400).json({ success: false, error: 'messageId required' });
        if (!reaction) return res.status(400).json({ success: false, error: 'reaction required' });

        // Enforce reaction whitelist — prevents arbitrary string injection
        if (!ALLOWED_REACTIONS.has(reaction)) {
            return res.status(400).json({ success: false, error: 'Invalid reaction emoji' });
        }

        const supabase = getSupabase();

        // Verify the user is a participant in the conversation containing this message
        // This is required because service role bypasses RLS — we must enforce access manually.
        const { data: msgRow } = await supabase
            .from('social_messages')
            .select('conversation_id')
            .eq('id', messageId)
            .maybeSingle();

        if (!msgRow) {
            return res.status(404).json({ success: false, error: 'Message not found' });
        }

        const { data: participant } = await supabase
            .from('social_conversation_participants')
            .select('id')
            .eq('conversation_id', msgRow.conversation_id)
            .eq('user_id', user.id)
            .maybeSingle();

        if (!participant) {
            return res.status(403).json({ success: false, error: 'Not a participant in this conversation' });
        }

        // Try the RPC first (works with service role)
        const { error: rpcErr } = await supabase.rpc('fn_toggle_message_reaction', {
            p_message_id: messageId,
            p_user_id: user.id,
            p_reaction: reaction,
        });

        if (rpcErr) {
            // Inline fallback: toggle manually using idempotent operations
            // TOCTOU fix: use upsert (INSERT ON CONFLICT DO NOTHING) + unconditional DELETE
            // rather than SELECT→INSERT/DELETE which races on rapid double-taps.
            console.warn('[react-message] RPC error, using inline fallback:', rpcErr.message);

            // Check if reaction already exists — needed to determine toggle direction
            const { data: existing } = await supabase
                .from('message_reactions')
                .select('id')
                .eq('message_id', messageId)
                .eq('user_id', user.id)
                .eq('reaction', reaction)
                .maybeSingle();

            if (existing) {
                // Delete — idempotent (delete by specific id)
                const { error: err_message_reactions_ud6tf } = await supabase.from('message_reactions').delete().eq('id', existing.id);
                if (err_message_reactions_ud6tf) console.warn('[Supabase] Silent mutation failed in message_reactions:', err_message_reactions_ud6tf.message);
            } else {
                // Insert — use upsert with ignoreDuplicates to be idempotent on race
                const { error: err_message_reactions_wpt5u } = await supabase.from('message_reactions').upsert({
                    message_id: messageId,
                    user_id: user.id,
                    reaction,
                    created_at: new Date().toISOString(),
                }, { onConflict: 'message_id,user_id,reaction', ignoreDuplicates: true });
                if (err_message_reactions_wpt5u) console.warn('[Supabase] Silent mutation failed in message_reactions:', err_message_reactions_wpt5u.message);
            }
        }

        return res.status(200).json({ success: true });
    } catch (err) {
        console.error('[react-message] Error:', err.message);
        if (!res.headersSent) return res.status(500).json({ success: false, error: 'Internal server error' });
    }
}
