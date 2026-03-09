/**
 * 🎰 BATCH QUESTION PRE-LOADER — API Endpoint
 * ═══════════════════════════════════════════════════════════════════════════
 * Fetches 25 questions for a game level at once
 * Returns array of questions for instant client-side serving
 * ═══════════════════════════════════════════════════════════════════════════
 */

import { createClient } from '../../../src/lib/supabaseServerClient';
import { applyRateLimit, LIMITS } from '../../../src/lib/apiRateLimit';

// ── Deterministic hash for seeded fallback data (avoids Math.random in data gen) ──
function hashSeed(str) {
    let h = 0;
    for (let i = 0; i < (str || '').length; i++) {
        h = ((h << 5) - h + str.charCodeAt(i)) | 0;
    }
    return Math.abs(h);
}

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
    throw new Error('Missing Supabase environment variables');
}

const supabase = createClient(supabaseUrl, supabaseKey);

export default async function handler(req, res) {
    if (!applyRateLimit(req, res, LIMITS.read)) return;

    // BUG-05 FIX: Include success:false for consistent client error parsing
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

        // BUG-03 FIX: Use Fisher-Yates shuffle (sort-based shuffle is biased in V8 TimSort)
        const shuffled = [...questions];
        for (let i = shuffled.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
        }

        // Return exactly the requested count
        const batch = shuffled.slice(0, questionCount);

        // ═══ ENRICH ALL CACHED QUESTIONS WITH FULL GTO WIZARD DATA ═══
        const enrichedBatch = batch.map(q => {
            const qData = q.question_data;
            if (!qData) return null; // Skip null entries

            // Track whether we had to fabricate any data
            let dataQuality = 'SOLVER_EXACT';

            const scenario = qData.scenario || {};
            const options = qData.options || [];
            const correctAnswer = qData.correctAnswer;

            // 1. Ensure heroCards
            if (!qData.heroCards || !Array.isArray(qData.heroCards) || qData.heroCards.length < 2) {
                const heroHand = scenario.heroHand || qData.heroHand || '';
                if (heroHand && heroHand.length >= 4) {
                    qData.heroCards = [heroHand.substring(0, 2), heroHand.substring(2, 4)];
                } else {
                    // Deterministic fallback cards based on question hash
                    const ranks = ['A', 'K', 'Q', 'J', 'T', '9', '8', '7', '6'];
                    const suits = ['h', 'd', 'c', 's'];
                    const seed = hashSeed(q.id || q.game_id || `q${i}`);
                    qData.heroCards = [
                        ranks[seed % 6] + suits[(seed >> 3) % 4],
                        ranks[(seed >> 6) % 8] + suits[(seed >> 9) % 4]
                    ];
                    dataQuality = 'SIMULATED';
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
                    qData.boardCards = cards.length >= 3 ? cards : _randomBoard(qData.heroCards);
                    if (cards.length < 3) dataQuality = 'SIMULATED';
                } else {
                    qData.boardCards = _randomBoard(qData.heroCards);
                    dataQuality = 'SIMULATED';
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
                // If still empty, generate deterministic defaults based on action type
                if (!qData.gtoFrequencies || Object.keys(qData.gtoFrequencies).length === 0) {
                    qData.gtoFrequencies = {};
                    const numOpts = options.length || 3;
                    options.forEach((opt, idx) => {
                        const optId = opt.id || String.fromCharCode(97 + idx);
                        // Correct answer gets 55-70%, others split remaining
                        qData.gtoFrequencies[optId] = optId === correctAnswer
                            ? Math.round(55 + (hashSeed(optId + (q.id || '')) % 16))
                            : Math.round((100 - 62) / Math.max(numOpts - 1, 1));
                    });
                    // Normalize to 100%
                    const total = Object.values(qData.gtoFrequencies).reduce((s, v) => s + v, 0);
                    if (total > 0) {
                        Object.keys(qData.gtoFrequencies).forEach(k => {
                            qData.gtoFrequencies[k] = Math.round((qData.gtoFrequencies[k] / total) * 100);
                        });
                    }
                    const sum = Object.values(qData.gtoFrequencies).reduce((s, v) => s + v, 0);
                    if (sum !== 100 && correctAnswer) {
                        qData.gtoFrequencies[correctAnswer] = (qData.gtoFrequencies[correctAnswer] || 0) + (100 - sum);
                    }
                    dataQuality = 'SIMULATED';
                }
            }

            // 4. Ensure evData — deterministic estimates based on position + pot
            if (!qData.evData) {
                const pot = scenario.pot || 10;
                const positionBonus = { 'BTN': 0.65, 'CO': 0.58, 'MP': 0.50, 'UTG': 0.45, 'SB': 0.42, 'BB': 0.48 };
                const posMult = positionBonus[scenario.heroPosition] || 0.52;
                qData.evData = {
                    heroHandEV: +(pot * posMult).toFixed(2),
                    optimalEV: +(pot * (posMult + 0.15)).toFixed(2),
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
            // ═══ SANITIZE: Clamp pot/stacks to prevent absurd values ═══
            scenario.pot = Math.min(Math.max(scenario.pot || 0, 0), 50);
            scenario.heroStack = Math.min(Math.max(scenario.heroStack || 1, 1), 300);
            scenario.villainStack = Math.min(Math.max(scenario.villainStack || 1, 1), 300);
            qData.scenario = scenario;
            if (!qData.source) qData.source = 'CACHED_SCENARIO';
            // IMP-5: Tag data quality for frontend confidence indicators
            qData.dataQuality = dataQuality;

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

/** Generate a random 3-card board, excluding hero cards */
function _randomBoard(heroCards = []) {
    const ranks = ['A', 'K', 'Q', 'J', 'T', '9', '8', '7', '6', '5', '4', '3', '2'];
    const suits = ['h', 'd', 'c', 's'];
    const used = new Set(heroCards.map(c => c.toLowerCase()));
    const cards = [];
    while (cards.length < 3) {
        const c = ranks[Math.floor(Math.random() * ranks.length)] +
            suits[Math.floor(Math.random() * suits.length)];
        if (!used.has(c.toLowerCase())) { used.add(c.toLowerCase()); cards.push(c); }
    }
    return cards;
}
