/**
 * 🤖 JARVIS TRAINING RECOMMENDATIONS API
 * ═══════════════════════════════════════════════════════════════════════════
 * Analyzes user's training history to recommend games targeting weak areas
 * ═══════════════════════════════════════════════════════════════════════════
 */

import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

// Training games catalog (simplified - could be pulled from DB)
const TRAINING_GAMES = [
    { id: 'cash_001', name: 'Preflop Ranges 101', category: 'preflop', difficulty: 'beginner' },
    { id: 'cash_002', name: 'Opening Ranges', category: 'preflop', difficulty: 'beginner' },
    { id: 'cash_003', name: '3-Bet Defense', category: 'preflop', difficulty: 'intermediate' },
    { id: 'cash_004', name: 'C-Bet Sizing', category: 'postflop', difficulty: 'intermediate' },
    { id: 'cash_005', name: 'Check-Raise Spots', category: 'postflop', difficulty: 'advanced' },
    { id: 'cash_006', name: 'Turn Barrel Strategy', category: 'postflop', difficulty: 'advanced' },
    { id: 'cash_007', name: 'River Bluff Catching', category: 'postflop', difficulty: 'advanced' },
    { id: 'cash_008', name: 'Pot Odds Mastery', category: 'math', difficulty: 'beginner' },
    { id: 'cash_009', name: 'Implied Odds', category: 'math', difficulty: 'intermediate' },
    { id: 'cash_010', name: 'Equity Realization', category: 'math', difficulty: 'advanced' },
    { id: 'mtt_001', name: 'ICM Fundamentals', category: 'tournament', difficulty: 'intermediate' },
    { id: 'mtt_002', name: 'Bubble Play', category: 'tournament', difficulty: 'advanced' },
    { id: 'mtt_003', name: 'Final Table Push/Fold', category: 'tournament', difficulty: 'advanced' },
];

export default async function handler(req, res) {
  // BUG #246 FIX: Require JWT auth
  const _token = req.headers.authorization?.replace('Bearer ', '');
  if (!_token) return res.status(401).json({ error: 'Auth required' });
  const { data: { user: _authUser }, error: _authErr } = await supabase.auth.getUser(_token);
  if (_authErr || !_authUser) return res.status(401).json({ error: 'Invalid token' });

    if (req.method !== 'GET') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    const supabase = createClient(supabaseUrl, supabaseKey);
    const { userId } = req.query;

    if (!userId) {
        return res.status(400).json({ error: 'userId required' });
    }

    try {
        // Fetch user's training history
        const { data: sessions } = await supabase
            .from('jarvis_training_sessions')
            .select('game_id, accuracy, created_at')
            .eq('user_id', userId)
            .order('created_at', { ascending: false })
            .limit(100);

        if (!sessions || sessions.length === 0) {
            // New user - recommend beginner games
            const beginnerGames = TRAINING_GAMES
                .filter(g => g.difficulty === 'beginner')
                .slice(0, 3);

            return res.status(200).json({
                success: true,
                isNewUser: true,
                recommendations: beginnerGames.map(g => ({
                    ...g,
                    reason: 'Great starting point for new players'
                })),
                message: "Welcome! Here are some beginner-friendly games to get started."
            });
        }

        // Analyze performance by category
        const categoryStats = {};
        const gameAccuracy = {};

        sessions.forEach(session => {
            const game = TRAINING_GAMES.find(g => g.id === session.game_id);
            if (!game) return;

            // Track by category
            if (!categoryStats[game.category]) {
                categoryStats[game.category] = { total: 0, correct: 0 };
            }
            categoryStats[game.category].total++;
            categoryStats[game.category].correct += session.accuracy / 100;

            // Track by game
            if (!gameAccuracy[session.game_id]) {
                gameAccuracy[session.game_id] = [];
            }
            gameAccuracy[session.game_id].push(session.accuracy);
        });

        // Calculate category accuracy
        const categoryAccuracy = Object.entries(categoryStats).map(([category, data]) => ({
            category,
            accuracy: Math.round((data.correct / data.total) * 100),
            sessions: data.total
        }));

        // Identify weak categories (< 75% accuracy OR < 5 sessions)
        const weakCategories = categoryAccuracy
            .filter(c => c.accuracy < 75 || c.sessions < 5)
            .sort((a, b) => a.accuracy - b.accuracy);

        // Find untried categories
        const triedCategories = new Set(categoryAccuracy.map(c => c.category));
        const untriedCategories = [...new Set(TRAINING_GAMES.map(g => g.category))]
            .filter(c => !triedCategories.has(c));

        // Build recommendations
        const recommendations = [];

        // Priority 1: Games in weak categories
        if (weakCategories.length > 0) {
            const weakCat = weakCategories[0];
            const gamesInWeakCat = TRAINING_GAMES
                .filter(g => g.category === weakCat.category)
                .filter(g => {
                    const avgAcc = gameAccuracy[g.id]
                        ? gameAccuracy[g.id].reduce((a, b) => a + b, 0) / gameAccuracy[g.id].length
                        : null;
                    return avgAcc === null || avgAcc < 80;
                });

            gamesInWeakCat.slice(0, 2).forEach(g => {
                recommendations.push({
                    ...g,
                    reason: `Your ${g.category} accuracy is ${weakCat.accuracy}% - let's improve it!`,
                    priority: 1
                });
            });
        }

        // Priority 2: Untried categories
        if (untriedCategories.length > 0 && recommendations.length < 4) {
            const untriedCat = untriedCategories[0];
            const gamesInUntried = TRAINING_GAMES
                .filter(g => g.category === untriedCat && g.difficulty === 'beginner');

            gamesInUntried.slice(0, 1).forEach(g => {
                recommendations.push({
                    ...g,
                    reason: `You haven't tried ${g.category} training yet - expand your skills!`,
                    priority: 2
                });
            });
        }

        // Priority 3: Games they've played but could improve
        if (recommendations.length < 4) {
            Object.entries(gameAccuracy).forEach(([gameId, accuracies]) => {
                if (recommendations.length >= 4) return;
                const avgAcc = accuracies.reduce((a, b) => a + b, 0) / accuracies.length;
                if (avgAcc < 85 && avgAcc >= 50) {
                    const game = TRAINING_GAMES.find(g => g.id === gameId);
                    if (game && !recommendations.find(r => r.id === gameId)) {
                        recommendations.push({
                            ...game,
                            reason: `Your average accuracy is ${Math.round(avgAcc)}% - aim for 90%+!`,
                            priority: 3
                        });
                    }
                }
            });
        }

        // Generate Jarvis message
        let message = "Based on your training history, I recommend focusing on these areas:";
        if (weakCategories.length > 0) {
            message = `I noticed your ${weakCategories[0].category} game could use work. Let's sharpen those skills!`;
        } else if (recommendations.length === 0) {
            message = "You're doing great! Keep up the consistent practice.";
        }

        return res.status(200).json({
            success: true,
            isNewUser: false,
            recommendations: recommendations.slice(0, 4),
            weakCategories: weakCategories.slice(0, 3),
            categoryAccuracy,
            totalSessions: sessions.length,
            message
        });

    } catch (error) {
        console.error('[Recommendations] Error:', error.message);
        return res.status(500).json({ error: 'Failed to generate recommendations' });
    }
}
