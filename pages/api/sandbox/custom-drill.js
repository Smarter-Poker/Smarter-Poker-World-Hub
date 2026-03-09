/**
 * GET /api/sandbox/custom-drill
 * W6-3: Fetches training_questions filtered by custom parameters (street, hero_position).
 */
import { createClient } from '@supabase/supabase-js';

function getSupabase() {
    return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
}

export default async function handler(req, res) {
    if (req.method !== 'GET') return res.status(405).json({ success: false, error: 'Method not allowed' });

    try {
        const supabase = getSupabase();
        const { street, position, limit = 10 } = req.query;

        let query = supabase
            .from('training_questions')
            .select('id, context, question_type, metadata, correct_answer')
            .eq('status', 'active');

        // Apply filters
        if (street && street !== 'Any') {
            query = query.ilike('metadata->>street', `${street}%`);
        }
        if (position && position !== 'Any') {
            query = query.ilike('metadata->>hero_position', `${position}%`);
        }

        // Random sampling
        const { data, error } = await query;
        if (error) throw error;

        // Shuffle and limit
        const shuffled = (data || []).sort(() => 0.5 - Math.random());
        const pool = shuffled.slice(0, Math.min(parseInt(limit), 20));

        return res.status(200).json({ success: true, questions: pool });
    } catch (err) {
        console.error('[custom-drill] Error:', err);
        return res.status(500).json({ success: false, error: err.message });
    }
}
