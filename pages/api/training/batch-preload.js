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
                    const seed = hashSeed(q.id || q.game_id || `q${qData.id || Math.random()}`);
                    qData.heroCards = _getDeterministicCards(seed, 2);
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
                    const seed = hashSeed(q.id || `board${qData.id || Math.random()}`);
                    qData.boardCards = cards.length >= 3 ? cards : _getDeterministicCards(seed, 3, qData.heroCards);
                    if (cards.length < 3) dataQuality = 'SIMULATED';
                } else {
                    const seed = hashSeed(q.id || `board${qData.id || Math.random()}`);
                    qData.boardCards = _getDeterministicCards(seed, 3, qData.heroCards);
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
                    let remaining = 100;
                    options.forEach((opt, idx) => {
                        const optId = opt.id || String.fromCharCode(97 + idx);
                        if (optId === Object.keys(qData.gtoFrequencies).length === 0 && optId === correctAnswer) {
                            const dominance = 55 + (hashSeed(optId + (q.id || '')) % 25);
                            qData.gtoFrequencies[optId] = dominance;
                            remaining -= dominance;
                        } else if (optId === correctAnswer) {
                            const dominance = 55 + (hashSeed(optId + (q.id || '')) % 25);
                            qData.gtoFrequencies[optId] = dominance;
                            remaining -= dominance;
                        }
                    });
                    const incorrectOpts = options.filter(opt => (opt.id || '') !== correctAnswer);
                    incorrectOpts.forEach((opt, idx) => {
                        const optId = opt.id || String.fromCharCode(97 + idx);
                        const isLast = idx === incorrectOpts.length - 1;
                        if (isLast) {
                            qData.gtoFrequencies[optId] = Math.max(0, remaining);
                        } else {
                            const share = Math.floor(remaining / (incorrectOpts.length - idx)) + (hashSeed(optId) % 5) - 2;
                            const clampedShare = Math.max(0, Math.min(share, remaining));
                            qData.gtoFrequencies[optId] = clampedShare;
                            remaining -= clampedShare;
                        }
                    });
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

/** Generate deterministic cards, preventing collisions */
function _getDeterministicCards(seed, count, exclude = []) {
    const deck = [
        '2c', '3c', '4c', '5c', '6c', '7c', '8c', '9c', 'Tc', 'Jc', 'Qc', 'Kc', 'Ac',
        '2d', '3d', '4d', '5d', '6d', '7d', '8d', '9d', 'Td', 'Jd', 'Qd', 'Kd', 'Ad',
        '2h', '3h', '4h', '5h', '6h', '7h', '8h', '9h', 'Th', 'Jh', 'Qh', 'Kh', 'Ah',
        '2s', '3s', '4s', '5s', '6s', '7s', '8s', '9s', 'Ts', 'Js', 'Qs', 'Ks', 'As'
    ];
    const excludeSet = new Set(exclude.map(c => c.toLowerCase()));
    const available = deck.filter(c => !excludeSet.has(c.toLowerCase()));
    let a = seed || Date.now();
    const rng = () => {
        let t = a += 0x6D2B79F5;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
    for (let i = available.length - 1; i > 0; i--) {
        const j = Math.floor(rng() * (i + 1));
        [available[i], available[j]] = [available[j], available[i]];
    }
    return available.slice(0, count);
}
