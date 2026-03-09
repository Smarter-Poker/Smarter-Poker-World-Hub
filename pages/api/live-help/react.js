/* ═══════════════════════════════════════════════════════════════════════════
   API: React to Live Help Message
   Saves user reaction (helpful/unhelpful) to Jarvis message
   ═══════════════════════════════════════════════════════════════════════════ */

import { createClient } from '../../../src/lib/supabaseServerClient';
import { applyRateLimit, LIMITS } from '../../../src/lib/apiRateLimit';

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
);

export default async function handler(req, res) {
  if (['POST','PUT','PATCH','DELETE'].includes(req.method)) {
    if (!applyRateLimit(req, res, LIMITS.write)) return;
  }

    if (req.method !== 'POST') {
        return res.status(405).json({ success: false, error: 'Method not allowed' });
    }

    try {
        const authHeader = req.headers.authorization;
        if (!authHeader?.startsWith('Bearer ')) {
            return res.status(401).json({ success: false, error: 'Unauthorized' });
        }

        const token = authHeader.replace('Bearer ', '');
        const { data: { user }, error: authError } = await supabase.auth.getUser(token);

        if (authError || !user) {
            return res.status(401).json({ success: false, error: 'Invalid token' });
        }

        const { messageId, reaction } = req.body;

        if (!messageId) {
            return res.status(400).json({ success: false, error: 'Missing messageId' });
        }

        // If reaction is null, delete the reaction
        if (reaction === null) {
            const { error: deleteError } = await supabase
                .from('live_help_reactions')
                .delete()
                .eq('message_id', messageId)
                .eq('user_id', user.id);

            if (deleteError) {
                console.error('Failed to delete reaction:', deleteError);
                return res.status(500).json({ success: false, error: 'Failed to delete reaction' });
            }

            return res.status(200).json({ success: true, reaction: null });
        }

        // Validate reaction value
        if (!['helpful', 'unhelpful'].includes(reaction)) {
            return res.status(400).json({ success: false, error: 'Invalid reaction value' });
        }

        // Upsert reaction (insert or update)
        const { data, error } = await supabase
            .from('live_help_reactions')
            .upsert({
                message_id: messageId,
                user_id: user.id,
                reaction
            }, {
                onConflict: 'message_id,user_id'
            })
            .select()
            .maybeSingle();

        if (error) {
            console.error('Failed to save reaction:', error);
            return res.status(500).json({ success: false, error: 'Failed to save reaction' });
        }

        return res.status(200).json({ success: true, reaction: data.reaction });

    } catch (error) {
        console.error('React API error:', error);
        return res.status(500).json({ success: false, error: 'Internal server error' });
    }
}
