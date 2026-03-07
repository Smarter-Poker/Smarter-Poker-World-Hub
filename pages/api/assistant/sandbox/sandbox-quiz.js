/**
 * Sandbox Quiz API — Save quiz results for "What Would You Do?" mode
 * POST: Save a quiz result
 * GET: Fetch user's quiz stats
 */
import { createClient } from '../../../../src/lib/supabaseServerClient';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

export default async function handler(req, res) {
    if (!supabaseUrl || !supabaseServiceKey) {
        return res.status(500).json({ error: 'Server configuration error' });
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Auth guard
    const token = req.headers.authorization?.replace('Bearer ', '');
    if (!token) return res.status(401).json({ error: 'Auth required' });
    const { data: { user: authUser }, error: authErr } = await supabase.auth.getUser(token);
    if (authErr || !authUser) return res.status(401).json({ error: 'Invalid token' });
    const userId = authUser.id; // Trust JWT, not client-supplied value

    if (req.method === 'POST') {
        const { scenarioHash, userAction, correctAction, isCorrect } = req.body;
        if (!scenarioHash || !userAction || !correctAction) {
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
                // If table doesn't exist, silently succeed (quiz works client-side)
                console.error('Quiz save error:', error);
                return res.status(200).json({ success: true, persisted: false });
            }

            return res.status(200).json({ success: true });
        } catch (err) {
            console.error('Quiz API error:', err);
            return res.status(500).json({ error: 'Internal server error' });
        }
    }

    if (req.method === 'GET') {

        try {
            const { data, error } = await supabase
                .from('sandbox_quiz_results')
                .select('is_correct, created_at')
                .eq('user_id', userId)
                .order('created_at', { ascending: false })
                .limit(100);

            if (error) {
                // If table doesn't exist, return empty stats (quiz works client-side)
                console.error('Quiz fetch error:', error);
                return res.status(200).json({ total: 0, correct: 0, accuracy: 0, streak: 0 });
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
