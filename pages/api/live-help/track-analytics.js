/* ═══════════════════════════════════════════════════════════════════════════
   TRACK ANALYTICS — Track Live Help usage analytics
   ═══════════════════════════════════════════════════════════════════════════ */

import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
    throw new Error('Missing Supabase environment variables');
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

export default async function handler(req, res) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    try {
        // Get auth token
        const authHeader = req.headers.authorization;
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return res.status(401).json({ error: 'Unauthorized' });
        }

        const token = authHeader.substring(7);
        const { data: { user }, error: authError } = await supabase.auth.getUser(token);

        if (authError || !user) {
            return res.status(401).json({ error: 'Invalid token' });
        }

        const { event_type, conversation_id, metadata } = req.body;

        if (!event_type) {
            return res.status(400).json({ error: 'Event type required' });
        }

        // Insert analytics event
        const { error: insertError } = await supabase
            .from('live_help_analytics')
            .insert({
                user_id: user.id,
                conversation_id,
                event_type,
                metadata: metadata || {}
            });

        if (insertError) {
            throw insertError;
        }

        return res.status(200).json({ success: true });

    } catch (error) {
        console.error('[Track Analytics] Error:', error);
        return res.status(500).json({ error: 'Internal server error' });
    }
}
