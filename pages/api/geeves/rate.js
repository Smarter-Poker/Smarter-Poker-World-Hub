/* ═══════════════════════════════════════════════════════════════════════════
   RATE GEEVES ANSWER — User feedback on cached answers
   Updates cache ratings for quality tracking
   ═══════════════════════════════════════════════════════════════════════════ */

import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
);

export default async function handler(req, res) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    try {
        const authHeader = req.headers.authorization;
        if (!authHeader?.startsWith('Bearer ')) {
            return res.status(401).json({ error: 'Unauthorized' });
        }

        const token = authHeader.replace('Bearer ', '');
        const { data: { user }, error: authError } = await supabase.auth.getUser(token);

        if (authError || !user) {
            return res.status(401).json({ error: 'Invalid token' });
        }

        const { cacheId, rating, feedback } = req.body;

        if (!cacheId) {
            return res.status(400).json({ error: 'Cache ID is required' });
        }

        if (!rating || rating < 1 || rating > 5) {
            return res.status(400).json({ error: 'Rating must be between 1 and 5' });
        }

        // Check if user already rated this answer
        const { data: existingRating } = await supabase
            .from('geeves_answer_ratings')
            .select('id, rating')
            .eq('cache_id', cacheId)
            .eq('user_id', user.id)
            .single();

        if (existingRating) {
            // Update existing rating
            const { error: updateError } = await supabase
                .from('geeves_answer_ratings')
                .update({ rating, feedback })
                .eq('id', existingRating.id);

            if (updateError) throw updateError;

            // Manually update cache stats (since trigger only fires on insert)
            await supabase.rpc('exec_sql', {
                sql: `
                    UPDATE geeves_knowledge_cache
                    SET rating_sum = rating_sum - ${existingRating.rating} + ${rating}
                    WHERE id = '${cacheId}'
                `
            });

            return res.status(200).json({
                success: true,
                message: 'Rating updated',
                previousRating: existingRating.rating,
                newRating: rating
            });
        }

        // Insert new rating (trigger will update cache stats)
        const { error: insertError } = await supabase
            .from('geeves_answer_ratings')
            .insert({
                cache_id: cacheId,
                user_id: user.id,
                rating,
                feedback
            });

        if (insertError) throw insertError;

        // Get updated cache stats
        const { data: cacheData } = await supabase
            .from('geeves_knowledge_cache')
            .select('avg_rating, total_ratings')
            .eq('id', cacheId)
            .single();

        return res.status(200).json({
            success: true,
            message: 'Rating saved',
            rating,
            avgRating: cacheData?.avg_rating,
            totalRatings: cacheData?.total_ratings
        });

    } catch (error) {
        console.error('[Geeves Rate] Error:', error);
        return res.status(500).json({
            error: 'Failed to save rating',
            details: error.message
        });
    }
}
