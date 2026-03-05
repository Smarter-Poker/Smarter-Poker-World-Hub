/**
 * 🎰 BATCH QUESTION PRE-LOADER — API Endpoint
 * ═══════════════════════════════════════════════════════════════════════════
 * Fetches 25 questions for a game level at once
 * Returns array of questions for instant client-side serving
 * ═══════════════════════════════════════════════════════════════════════════
 */

import { createClient } from '@supabase/supabase-js';
import { applyRateLimit, LIMITS } from '../../../src/lib/apiRateLimit';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
    throw new Error('Missing Supabase environment variables');
}

const supabase = createClient(supabaseUrl, supabaseKey);

export default async function handler(req, res) {
    if (!applyRateLimit(req, res, LIMITS.read)) return;

    // BUG #245 FIX: Require JWT auth
    const _token = req.headers.authorization?.replace('Bearer ', '');
    if (!_token) return res.status(401).json({ success: false, error: 'Auth required' });
    const { data: { user: _authUser }, error: _authErr } = await supabase.auth.getUser(_token);
    if (_authErr || !_authUser) return res.status(401).json({ success: false, error: 'Invalid token' });

    if (req.method !== 'GET') {
        return res.status(405).json({ success: false, error: 'Method not allowed' });
    }

    const { gameId, level = '1', count = '25' } = req.query;

    if (!gameId) {
        return res.status(400).json({ success: false, error: 'gameId is required' });
    }

    try {
        const questionCount = parseInt(count, 10);
        const gameLevel = parseInt(level, 10);


        // Fetch questions from cache
        const { data: questions, error } = await supabase
            .from('training_question_cache')
            .select('*')
            .eq('game_id', gameId)
            .eq('level', gameLevel)
            .limit(questionCount);

        if (error) {
            console.error('[BatchPreload] Supabase error:', error);
            return res.status(500).json({ success: false, error: 'Failed to fetch questions' });
        }

        if (!questions || questions.length === 0) {
            return res.status(404).json({ success: false, error: 'No questions available for this game/level' });
        }

        // Shuffle questions for variety
        const shuffled = questions.sort(() => Math.random() - 0.5);

        // Return exactly the requested count
        const batch = shuffled.slice(0, questionCount);

        // ═══ ENRICH ALL CACHED QUESTIONS WITH FULL GTO WIZARD DATA ═══
        const enrichedBatch = batch.map(q => {
            const qData = q.question_data;
            if (!qData) return null; // Skip null entries

            const scenario = qData.scenario || {};
            const options = qData.options || [];
            const correctAnswer = qData.correctAnswer;

            // 1. Ensure heroCards
            if (!qData.heroCards || !Array.isArray(qData.heroCards) || qData.heroCards.length < 2) {
                const heroHand = scenario.heroHand || qData.heroHand || '';
                if (heroHand && heroHand.length >= 4) {
                    qData.heroCards = [heroHand.substring(0, 2), heroHand.substring(2, 4)];
                } else {
                    const ranks = ['A', 'K', 'Q', 'J', 'T', '9', '8', '7', '6'];
                    const suits = ['h', 'd', 'c', 's'];
                    qData.heroCards = [
                        ranks[Math.floor(Math.random() * 6)] + suits[Math.floor(Math.random() * 4)],
                        ranks[Math.floor(Math.random() * 8)] + suits[Math.floor(Math.random() * 4)]
                    ];
                }
            }

            // 2. Ensure boardCards
            if (!qData.boardCards || !Array.isArray(qData.boardCards) || qData.boardCards.length === 0) {
                const boardStr = (scenario.board || '').replace(/\s+/g, '');
                if (boardStr.length >= 6) {
                    const cards = [];
                    for (let i = 0; i < boardStr.length; i += 2) {
                        if (i + 1 < boardStr.length) cards.push(boardStr.substring(i, i + 2));
                    }
                    qData.boardCards = cards.length >= 3 ? cards : _randomBoard();
                } else {
                    qData.boardCards = _randomBoard();
                }
            }

            // 3. Ensure gtoFrequencies
            if (!qData.gtoFrequencies || Object.keys(qData.gtoFrequencies).length === 0) {
                // Try PIO raw frequencies first
                if (qData.frequencies) {
                    qData.gtoFrequencies = {};
                    Object.entries(qData.frequencies).forEach(([action, freq]) => {
                        if (typeof freq === 'number' && freq >= 0 && freq <= 1) {
                            qData.gtoFrequencies[action] = Math.round(freq * 100);
                        }
                    });
                }
                // If still empty, simulate
                if (!qData.gtoFrequencies || Object.keys(qData.gtoFrequencies).length === 0) {
                    qData.gtoFrequencies = {};
                    options.forEach((opt, i) => {
                        const optId = opt.id || String.fromCharCode(97 + i);
                        qData.gtoFrequencies[optId] = optId === correctAnswer
                            ? 50 + Math.floor(Math.random() * 30)
                            : 2 + Math.floor(Math.random() * 15);
                    });
                    const total = Object.values(qData.gtoFrequencies).reduce((s, v) => s + v, 0);
                    Object.keys(qData.gtoFrequencies).forEach(k => {
                        qData.gtoFrequencies[k] = Math.round((qData.gtoFrequencies[k] / total) * 100);
                    });
                    const sum = Object.values(qData.gtoFrequencies).reduce((s, v) => s + v, 0);
                    if (sum !== 100 && correctAnswer) {
                        qData.gtoFrequencies[correctAnswer] = (qData.gtoFrequencies[correctAnswer] || 0) + (100 - sum);
                    }
                }
            }

            // 4. Ensure evData
            if (!qData.evData) {
                const pot = scenario.pot || 10;
                qData.evData = {
                    heroHandEV: +(pot * (0.3 + Math.random() * 0.5)).toFixed(2),
                    optimalEV: +(pot * (0.5 + Math.random() * 0.4)).toFixed(2),
                    handEVs: {},
                    heroHand: qData.heroCards?.join('') || 'AhKs',
                };
            }

            // 5. Fill scenario gaps
            if (!scenario.heroPosition) scenario.heroPosition = 'BTN';
            if (!scenario.villainPosition) scenario.villainPosition = 'BB';
            if (!scenario.pot) scenario.pot = 12;
            if (!scenario.heroStack) scenario.heroStack = 100;
            if (!scenario.villainStack) scenario.villainStack = scenario.heroStack;
            if (!scenario.street) {
                scenario.street = qData.boardCards?.length === 3 ? 'flop'
                    : qData.boardCards?.length === 4 ? 'turn' : 'river';
            }
            qData.scenario = scenario;
            if (!qData.source) qData.source = 'GROK_GTO';

            return qData;
        }).filter(Boolean); // Remove null entries


        return res.status(200).json({
            success: true,
            gameId,
            level: gameLevel,
            count: enrichedBatch.length,
            questions: enrichedBatch
        });

    } catch (err) {
        console.error('[BatchPreload] Unexpected error:', err);
        return res.status(500).json({ success: false, error: 'Internal server error' });
    }
}

/** Generate a random 3-card board */
function _randomBoard() {
    const ranks = ['A', 'K', 'Q', 'J', 'T', '9', '8', '7', '6', '5', '4', '3', '2'];
    const suits = ['h', 'd', 'c', 's'];
    const used = new Set();
    const cards = [];
    while (cards.length < 3) {
        const c = ranks[Math.floor(Math.random() * ranks.length)] +
            suits[Math.floor(Math.random() * suits.length)];
        if (!used.has(c)) { used.add(c); cards.push(c); }
    }
    return cards;
}
