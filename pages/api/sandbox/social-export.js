/**
 * POST /api/sandbox/social-export
 * W6-6: Exports a Sandbox Session Report to the social_posts feed table.
 */
import { createClient } from '@supabase/supabase-js';

function getSupabase() {
    return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
}

export default async function handler(req, res) {
    if (req.method !== 'POST') return res.status(405).json({ success: false, error: 'Method not allowed' });

    try {
        const supabase = getSupabase();

        let userId = null;
        const authHeader = req.headers.authorization;
        if (authHeader?.startsWith('Bearer ')) {
            const token = authHeader.replace('Bearer ', '');
            try {
                const { data: { user } } = await supabase.auth.getUser(token);
                if (user) userId = user.id;
            } catch (e) { }
        }

        if (!userId) return res.status(401).json({ success: false, error: 'Authentication required' });

        const { handCount, content, evLoss } = req.body;

        // Use the existing social_posts table format
        const { data, error } = await supabase
            .from('social_posts')
            .insert({
                user_id: userId,
                content: content || `Just wrapped up a Sandbox session analyzing ${handCount} spots. ${evLoss ? `Identified ${evLoss.toFixed(2)} EV lost.` : 'Reviewing my lines.'} #study-grind`,
                post_type: 'sandbox_report',
                metadata: {
                    handCount, evLoss, source: 'Sandbox'
                }
            })
            .select('id')
            .maybeSingle();

        if (error) {
            // Graceful fallback if social_posts table doesn't exist yet on this env
            if (error.code === '42P01') {
                return res.status(200).json({ success: true, dummy: true, message: 'Simulated post (social_posts table pending Phase 14)' });
            }
            throw error;
        }

        return res.status(200).json({ success: true, post: data });
    } catch (err) {
        console.error('[social-export] Error:', err);
        return res.status(500).json({ success: false, error: err.message });
    }
}
