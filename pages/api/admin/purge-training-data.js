/**
 * Admin endpoint to purge corrupted training question data
 * POST /api/admin/purge-training-data
 */

import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
);

export default async function handler(req, res) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'POST required' });
    }

    console.log('[Purge] 🗑️ Starting purge of corrupted training data...');

    try {
        // 1. Delete all cached questions
        const { error: cacheError, count: cacheCount } = await supabase
            .from('training_question_cache')
            .delete()
            .neq('id', '00000000-0000-0000-0000-000000000000')
            .select('id', { count: 'exact' });

        console.log(`[Purge] Deleted from training_question_cache:`, cacheError || 'Success');

        // 2. Delete placeholder data from solved_spots_gold (keep valid data)
        const { error: pioError } = await supabase
            .from('solved_spots_gold')
            .delete()
            .or('scenario_hash.is.null,scenario_hash.eq.,game_type.is.null');

        console.log(`[Purge] Cleaned solved_spots_gold:`, pioError || 'Success');

        // 3. Verify counts
        const { count: remainingCache } = await supabase
            .from('training_question_cache')
            .select('*', { count: 'exact', head: true });

        const { count: remainingPIO } = await supabase
            .from('solved_spots_gold')
            .select('*', { count: 'exact', head: true });

        return res.status(200).json({
            success: true,
            purged: {
                training_question_cache: 'All deleted',
                solved_spots_gold: 'Placeholder data cleaned',
            },
            remaining: {
                training_question_cache: remainingCache || 0,
                solved_spots_gold: remainingPIO || 0,
            },
        });

    } catch (error) {
        console.error('[Purge] ❌ Error:', error);
        return res.status(500).json({ error: error.message });
    }
}
