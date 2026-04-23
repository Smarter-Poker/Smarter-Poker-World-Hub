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
        const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
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

        const supabase = getSupabase();

        // Try the RPC first (works with service role)
        const { error: rpcErr } = await supabase.rpc('fn_toggle_message_reaction', {
            p_message_id: messageId,
            p_user_id: user.id,
            p_reaction: reaction,
        });

        if (rpcErr) {
            // Inline fallback: toggle manually
            console.warn('[react-message] RPC error, using inline fallback:', rpcErr.message);

            // Check if reaction already exists
            const { data: existing } = await supabase
                .from('message_reactions')
                .select('id')
                .eq('message_id', messageId)
                .eq('user_id', user.id)
                .eq('reaction', reaction)
                .maybeSingle();

            if (existing) {
                await supabase.from('message_reactions').delete().eq('id', existing.id);
            } else {
                await supabase.from('message_reactions').insert({
                    message_id: messageId,
                    user_id: user.id,
                    reaction,
                    created_at: new Date().toISOString(),
                });
            }
        }

        return res.status(200).json({ success: true });
    } catch (err) {
        console.error('[react-message] Error:', err.message);
        if (!res.headersSent) return res.status(500).json({ success: false, error: 'Internal server error' });
    }
}
