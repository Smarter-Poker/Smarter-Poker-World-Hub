/**
 * Sandbox Quiz API — Save quiz results for "What Would You Do?" mode
 * POST: Save a quiz result
 * GET: Fetch user's quiz stats
 */
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

export default async function handler(req, res) {
    if (!supabaseUrl || !supabaseServiceKey) {
        return res.status(500).json({ error: 'Server configuration error' });
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    if (req.method === 'POST') {
        const { userId, scenarioHash, userAction, correctAction, isCorrect } = req.body;
        if (!userId || !scenarioHash || !userAction || !correctAction) {
            return res.status(400).json({ error: 'Missing required fields' });
        }

        try {
            // Save quiz result
            const { error } = await supabase.from('sandbox_quiz_results').insert({
                user_id: userId,
                scenario_hash: scenarioHash,
                user_action: userAction,
                correct_action: correctAction,
                is_correct: isCorrect,
            });

            if (error) {
                console.error('Quiz save error:', error);
                return res.status(500).json({ error: 'Failed to save quiz result' });
            }

            return res.status(200).json({ success: true });
        } catch (err) {
            console.error('Quiz API error:', err);
            return res.status(500).json({ error: 'Internal server error' });
        }
    }

    if (req.method === 'GET') {
        const { userId } = req.query;
        if (!userId) return res.status(400).json({ error: 'userId required' });

        try {
            const { data, error } = await supabase
                .from('sandbox_quiz_results')
                .select('is_correct, created_at')
                .eq('user_id', userId)
                .order('created_at', { ascending: false })
                .limit(100);

            if (error) {
                console.error('Quiz fetch error:', error);
                return res.status(500).json({ error: 'Failed to fetch quiz stats' });
            }

            const total = data?.length || 0;
            const correct = data?.filter(r => r.is_correct).length || 0;
            const accuracy = total > 0 ? Math.round(correct / total * 100) : 0;

            // Calculate current streak
            let streak = 0;
            for (const r of (data || [])) {
                if (r.is_correct) streak++;
                else break;
            }

            return res.status(200).json({ total, correct, accuracy, streak });
        } catch (err) {
            console.error('Quiz stats error:', err);
            return res.status(500).json({ error: 'Internal server error' });
        }
    }

    return res.status(405).json({ error: 'Method not allowed' });
}
