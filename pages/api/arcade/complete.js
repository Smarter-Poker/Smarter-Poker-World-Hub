/**
 * POST /api/arcade/complete
 * Complete an arcade game — award prize diamonds if won, log result
 *
 * Body: { gameType, score, correctCount, totalQuestions, won, prize, entryFee, timeSpentMs }
 * Auth: Bearer token required
 */

import { createClient } from '../../../src/lib/supabaseServerClient';
import { applyRateLimit, LIMITS } from '../../../src/lib/apiRateLimit';

const supabaseAdmin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
);

// Server-side prize caps per game type (prevent inflation)
const MAX_PRIZE = {
    'hand-snap':     250,
    'board-nuts':    125,
    'the-gauntlet':  500,
    'range-radar':   150,
    'equity-edge':   200,
};

// Minimum accuracy to win
const WIN_THRESHOLD = 0.7; // 70% correct

export default async function handler(req, res) {
    if (['POST','PUT','PATCH','DELETE'].includes(req.method)) {
        if (!applyRateLimit(req, res, LIMITS.write)) return;
    }
    if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });

    const token = req.headers.authorization?.replace('Bearer ', '');
    if (!token) return res.status(401).json({ error: 'Authentication required' });

    const { data: { user }, error: authErr } = await supabaseAdmin.auth.getUser(token);
    if (authErr || !user) return res.status(401).json({ error: 'Invalid token' });

    const {
        gameType,
        correctCount = 0,
        totalQuestions = 1,
        timeSpentMs = 0,
    } = req.body;

    if (!gameType) return res.status(400).json({ error: 'gameType required' });

    // Server verifies win condition — never trust client-supplied 'won' or 'prize'
    const accuracy = totalQuestions > 0 ? correctCount / totalQuestions : 0;
    const won = accuracy >= WIN_THRESHOLD;

    // Server calculates prize based on accuracy and game type
    const entryFees = { 'hand-snap': 50, 'board-nuts': 25, 'the-gauntlet': 75, 'range-radar': 30, 'equity-edge': 40 };
    const entryFee = entryFees[gameType] ?? 0;
    const cap = MAX_PRIZE[gameType] ?? 100;
    const rawPrize = won ? Math.floor(entryFee * 1.8 * accuracy) : 0; // win = ~1.8x adjusted for accuracy
    const prize = Math.min(rawPrize, cap);

    try {
        if (won && prize > 0) {
            const { error: awardErr } = await supabaseAdmin.rpc('add_diamonds_to_balance', {
                p_user_id: user.id,
                p_amount: prize,
                p_type: 'arcade_prize',
                p_description: `${gameType} win — ${correctCount}/${totalQuestions} correct (${prize}💎)`,
                p_reference_id: null,
            });
            if (awardErr) throw new Error(awardErr.message);
        }

        // Log result for leaderboard + analytics
        await supabaseAdmin
            .from('diamond_arena_events')
            .insert({
                user_id: user.id,
                event_type: 'game_complete',
                game_type: gameType,
                score: correctCount,
                correct_count: correctCount,
                total_questions: totalQuestions,
                time_spent_ms: Math.max(0, Math.min(timeSpentMs, 3600000)), // cap at 1hr
                won,
                prize_awarded: prize,
                diamonds_delta: prize,
                status: 'completed',
            });

        return res.status(200).json({
            success: true,
            won,
            prize,
            accuracy: Math.round(accuracy * 100),
            message: won ? `You won ${prize} diamonds!` : 'Better luck next time!',
        });
    } catch (err) {
        console.error('[arcade/complete]', err.message);
        return res.status(500).json({ error: 'Failed to record game result' });
    }
}
