/**
 * 🎰 BATCH QUESTION PRE-LOADER — API Endpoint
 * ═══════════════════════════════════════════════════════════════════════════
 * Fetches 25 questions for a game level at once
 * Returns array of questions for instant client-side serving
 * ═══════════════════════════════════════════════════════════════════════════
 */

import { createClient } from '../../../src/lib/supabaseServerClient';
import { applyRateLimit, LIMITS } from '../../../src/lib/apiRateLimit';
import { deterministicEngine } from '../../../src/engines/DeterministicGTOEngine';
import { pioQueryService } from '../../../src/services/PIOQueryService';
import { getGameConfig as getGameCfg } from '../../../src/config/gameConfigs';

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
            // Don't return 500 — fall through to solver engine
        }

        // ═══════════════════════════════════════════════════════════════════
        // SOLVER ENGINE FALLBACK: If cache is empty or insufficient,
        // generate LIVE questions from DeterministicGTOEngine (187k+ records)
        // ═══════════════════════════════════════════════════════════════════
        const cachedQuestions = questions || [];
        let solverQuestions = [];

        if (cachedQuestions.length < questionCount) {
            const pioConfig = pioQueryService.getGameConfig(gameId);
            const gameCfg = getGameCfg(gameId);

            if (pioConfig && pioConfig.sourceOfTruth !== 'SCENARIO') {
                // PIO/CHART ENGINE: Generate from real solver data
                try {
                    const needed = questionCount - cachedQuestions.length;
                    const batch = await deterministicEngine.generateBatch({
                        gameId,
                        level: gameLevel,
                        count: needed,
                        gameConfig: pioConfig,
                    });
                    if (batch && batch.length > 0) {
                        solverQuestions = batch.map(q => ({ question_data: q }));
                        console.log(`[BatchPreload] ✅ DeterministicEngine generated ${batch.length} solver questions for ${gameId}`);
                    }
                } catch (solverErr) {
                    console.error('[BatchPreload] ⚠️ Solver engine failed:', solverErr.message);
                }
            } else if (gameCfg?.engine === 'SCENARIO' || pioConfig?.sourceOfTruth === 'SCENARIO') {
                // SCENARIO/PSYCHOLOGY: Generate via Grok AI when cache is empty
                try {
                    const { getGrokClient } = await import('../../../src/lib/grokClient');
                    const grok = getGrokClient();
                    const TRAINING_LIBRARY = require('../../../src/data/TRAINING_LIBRARY').default;
                    const game = TRAINING_LIBRARY.find(g => g.id === gameId);
                    const gameName = game?.name || 'Training Game';
                    const gameFocus = game?.focus || 'poker psychology';
                    const needed = questionCount - cachedQuestions.length;

                    for (let i = 0; i < Math.min(needed, 10); i++) {
                        try {
                            const prompt = `You are an elite poker mental game coach. Generate a unique PSYCHOLOGY training question #${i + 1} for "${gameName}" focusing on: ${gameFocus}. Difficulty: ${gameLevel}/10.\n\nGenerate in this EXACT JSON format (no markdown):\n{"id":"grok_${gameId}_${Date.now()}_${i}","type":"SCENARIO","source":"GROK_GTO","question":"...","scenario":{"title":"${gameName}","context":"...","isPsychology":true,"heroPosition":"BTN","villainPosition":"BB","pot":12,"heroStack":100,"villainStack":100,"street":"flop"},"options":[{"id":"a","text":"..."},{"id":"b","text":"..."},{"id":"c","text":"..."},{"id":"d","text":"..."}],"correctAnswer":"b","explanation":"..."}`;
                            const resp = await grok.chat.completions.create({
                                model: 'grok-3', messages: [{ role: 'user', content: prompt }],
                                temperature: 0.9, max_tokens: 600,
                            });
                            const content = resp.choices[0]?.message?.content || '';
                            const jsonMatch = content.match(/\{[\s\S]*\}/);
                            if (jsonMatch) {
                                const parsed = JSON.parse(jsonMatch[0]);
                                if (parsed.scenario) parsed.scenario.isPsychology = true;
                                solverQuestions.push({ question_data: parsed });
                            }
                        } catch (grokErr) {
                            console.warn('[BatchPreload] Grok question gen failed:', grokErr.message);
                        }
                    }
                    if (solverQuestions.length > 0) {
                        console.log(`[BatchPreload] ✅ Grok generated ${solverQuestions.length} psychology questions for ${gameId}`);
                    }
                } catch (grokImportErr) {
                    console.error('[BatchPreload] ⚠️ Grok import failed:', grokImportErr.message);
                }
            }
        }

        // Merge cached + solver-generated questions
        const allQuestions = [...cachedQuestions, ...solverQuestions];

        if (allQuestions.length === 0) {
            return res.status(404).json({ success: false, error: 'No questions available for this game/level' });
        }

        // BUG-03 FIX: Use Fisher-Yates shuffle (sort-based shuffle is biased in V8 TimSort)
        const shuffled = [...allQuestions];
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

                    // Map options directly to their intended string IDs based on source indices
                    const mappedOptions = options.map((opt, idx) => ({
                        id: opt.id || String.fromCharCode(97 + idx),
                        isCorrect: (opt.id || String.fromCharCode(97 + idx)) === correctAnswer
                    }));

                    // 1. Target the correct answer
                    const correctOpt = mappedOptions.find(o => o.isCorrect);
                    if (correctOpt) {
                        const dominance = 55 + (hashSeed(correctOpt.id + (q.id || '')) % 25);
                        qData.gtoFrequencies[correctOpt.id] = dominance;
                        remaining -= dominance;
                    }

                    // 2. Diffuse the remaining percentages across incorrect targets
                    const incorrectOpts = mappedOptions.filter(o => !o.isCorrect);
                    incorrectOpts.forEach((opt, idx) => {
                        const isLast = idx === incorrectOpts.length - 1;
                        if (isLast) {
                            qData.gtoFrequencies[opt.id] = Math.max(0, remaining);
                        } else {
                            const share = Math.floor(remaining / (incorrectOpts.length - idx)) + (hashSeed(opt.id) % 5) - 2;
                            const clampedShare = Math.max(0, Math.min(share, remaining));
                            qData.gtoFrequencies[opt.id] = clampedShare;
                            remaining -= clampedShare;
                        }
                    });

                    // 3. Absolute Checksum enforcement over the real target string
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
