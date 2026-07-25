/**
 * DETERMINISTIC ENGINE AUDIT PATCHES — 2026-07-19 (v2 reader flip 2026-07-24)
 * ════════════════════════════════════════════════════════════════════
 * WHY THIS FILE EXISTS: DeterministicGTOEngine.js is ~967KB, which exceeds
 * what the current agent push path can transit in one piece, so the phase-3
 * engine-audit fixes are applied here as runtime patches on the exported
 * singleton instead of edits inside the monolith. When a session with real
 * git push touches the engine file next, MERGE THESE PATCHES INTO THE CLASS
 * and delete this module (see .agent/handoffs/2026-07-19-solved-spots-gold-
 * reingest.md and .agent/audits/2026-07-19-training-engine-phase3-*.md).
 *
 * 2026-07-24: the rebuilt PioSOLVER pipeline writes clean per-combo data to
 * solved_spots_gold.strategy_matrix_v2. fetchSolverPool + queryNextStreet now
 * PREFER strategy_matrix_v2 (converted to the legacy per-class shape via
 * v2ToAppMatrix) when present, and fall back to the sanitized v1 otherwise.
 *
 * WHAT THE PATCHES FIX (all confirmed by live audit):
 * 1. fetchSolverPool called .eq('street', null) when getStreetForLevel
 *    returned null ("all streets") — matched ZERO rows, so the live engine
 *    generation path was dead by default.
 * 2. solved_spots_gold per-hand frequencies are scale-corrupted at ingest
 *    (f/b45 values of 5-500 next to 0-1 c/b16 values; the PIO tree root in
 *    tree_lines only has [b16,c]). The engine's naive 0-1 filter discarded
 *    the corrupted values and took argmax over the remainder — inverting the
 *    "correct" answer for many hands. sanitizeStrategyMatrix() keeps a hand
 *    only when its in-range values form a CREDIBLE distribution (sum≈1, or a
 *    pure ≥0.98 action) and renormalizes; non-credible hands are removed so
 *    the engine can never serve them. (v2 rows are already clean.)
 * 3. Answer-class bias: live sampling showed "always Check" scored 73%.
 *    buildQuestionFromScenario now alternates the preferred answer class
 *    (aggressive/passive) across questionIndex via bounded retries.
 * 4. queryNextStreet ignored the user's hand (a player holding QJo could get
 *    the turn graded for Q6s, or a hand with all-zero frequencies) and used
 *    substring board matching. Now: hand normalized to its 169-class and
 *    FORCED through question building (clean null when the hand has no
 *    credible data), true child preferred via suffix match, approximate
 *    boards flagged isApproximateBoard.
 * ════════════════════════════════════════════════════════════════════
 */

import { parseBoardFromHash } from '../utils/trainingApiUtils';
import { v2ToAppMatrix } from '../utils/v2Matrix';

// ── Hand-class normalization ("AhKs" / ["Ah","Ks"] → "AKs"/"AKo"/"AA") ────
export function toHandClass(h) {
    let cards = h;
    if (Array.isArray(cards)) cards = cards.join('');
    if (typeof cards !== 'string') return null;
    cards = cards.replace(/\s+/g, '');
    const m = cards.match(/^([2-9TJQKA])([shdc])([2-9TJQKA])([shdc])$/i);
    if (!m) return /^[2-9TJQKA]{2}[so]?$/i.test(cards) ? cards : null; // already a class
    const order = '23456789TJQKA';
    let [r1, s1, r2, s2] = [m[1].toUpperCase(), m[2].toLowerCase(), m[3].toUpperCase(), m[4].toLowerCase()];
    if (order.indexOf(r1) < order.indexOf(r2)) { [r1, r2] = [r2, r1]; [s1, s2] = [s2, s1]; }
    if (r1 === r2) return r1 + r2;
    return r1 + r2 + (s1 === s2 ? 's' : 'o');
}

const isAggressiveAction = (a) => /^b|^r|allin|jam|push/i.test(String(a || ''));

/** Prefer strategy_matrix_v2 (rebuilt PioSOLVER data) when present. Mutates row. */
function preferV2(row) {
    if (row && row.strategy_matrix_v2) {
        const m = v2ToAppMatrix(row.strategy_matrix_v2);
        if (m) row.strategy_matrix = m;
    }
    return row;
}

/**
 * Sanitize a strategy_matrix IN PLACE (idempotent):
 * for every hand, keep it only if its in-range action values form a credible
 * probability distribution; renormalize; delete non-credible hands entirely.
 */
export function sanitizeStrategyMatrix(matrix) {
    if (!matrix || matrix.__sanitized) return matrix;
    const actions = matrix.actions || [];
    const frequencies = matrix.frequencies || {};
    if (actions.length === 0) { matrix.__sanitized = true; return matrix; }

    // Union of hands across all action maps
    const hands = new Set();
    actions.forEach(a => {
        const map = frequencies[a];
        if (map && typeof map === 'object') Object.keys(map).forEach(h => hands.add(h));
    });

    hands.forEach(hand => {
        const vals = {};
        let sum = 0;
        let corrupted = false;
        actions.forEach(a => {
            const v = frequencies[a]?.[hand];
            if (typeof v === 'number' && v >= 0) {
                if (v <= 1.02) {
                    vals[a] = Math.min(1, v);
                    sum += vals[a];
                } else {
                    corrupted = true; // scale-corrupted value present for this hand
                }
            }
        });
        const kept = Object.keys(vals);
        const maxVal = kept.length ? Math.max(...Object.values(vals)) : 0;
        const isNormalized = !corrupted && kept.length > 0 && Math.abs(sum - 1) <= 0.05;
        const isPure = maxVal >= 0.98 && (sum - maxVal) <= 0.02;

        if ((isNormalized || isPure) && sum > 0) {
            // Write back the renormalized distribution; remove corrupt entries
            actions.forEach(a => {
                if (vals[a] !== undefined) {
                    if (frequencies[a]) frequencies[a][hand] = vals[a] / sum;
                } else if (frequencies[a] && frequencies[a][hand] !== undefined) {
                    delete frequencies[a][hand];
                }
            });
        } else {
            // Not credible — remove the hand everywhere so it is never served
            actions.forEach(a => {
                if (frequencies[a] && frequencies[a][hand] !== undefined) {
                    delete frequencies[a][hand];
                }
            });
        }
    });

    matrix.__sanitized = true;
    return matrix;
}

function matrixHasHand(matrix, hand) {
    const actions = matrix?.actions || [];
    const frequencies = matrix?.frequencies || {};
    return actions.some(a => typeof frequencies[a]?.[hand] === 'number');
}

/** Deep-enough copy of a scenario pruned to a single hand (for forced-hand builds). */
function pruneScenarioToHand(scenario, hand) {
    const matrix = scenario.strategy_matrix || {};
    const actions = matrix.actions || [];
    const frequencies = matrix.frequencies || {};
    const pruned = {};
    actions.forEach(a => {
        const v = frequencies[a]?.[hand];
        pruned[a] = typeof v === 'number' ? { [hand]: v } : {};
    });
    return {
        ...scenario,
        strategy_matrix: {
            ...matrix,
            frequencies: pruned,
            __sanitized: true, // already sanitized upstream
        },
    };
}

export function applyDeterministicEnginePatches(engine) {
    if (!engine || engine.__auditPatches20260719) return engine;
    engine.__auditPatches20260719 = true;

    const originalFetchSolverPool = engine.fetchSolverPool.bind(engine);
    const originalBuild = engine.buildQuestionFromScenario.bind(engine);

    // ── PATCH 1+2: street-null guard + v2 preference + matrix sanitization ──
    engine.fetchSolverPool = async function patchedFetchSolverPool(
        gameConfig, level, limit = 25, targetStreet = null, routingParams = {}
    ) {
        try {
            const street = targetStreet || this.getStreetForLevel(level);
            const { stackDepths, spotTypes } = routingParams || {};
            const effectiveStackDepths = (stackDepths && stackDepths.length > 0)
                ? stackDepths
                : [gameConfig.pioStackDepth];
            const fetchLimit = Math.min(limit * 4, 500);

            let allData = [];
            for (const depth of effectiveStackDepths) {
                let q = this.db
                    .from('solved_spots_gold')
                    .select('id, scenario_hash, street, stack_depth, game_type, strategy_matrix, strategy_matrix_v2')
                    .eq('game_type', gameConfig.pioGameType)
                    .eq('stack_depth', depth);
                if (street) q = q.eq('street', street); // FIX: never .eq('street', null)
                const { data, error } = await q.limit(Math.ceil(fetchLimit / effectiveStackDepths.length));
                if (!error && data && data.length > 0) allData = allData.concat(data);
            }

            if (allData.length === 0) return null;

            if (spotTypes && spotTypes.length > 0) {
                // (^|_) anchors: \b never matches inside underscore-delimited
                // scenario hashes ('_' is a word character), so the \b versions
                // silently matched nothing.
                const spotTypePatterns = {
                    'rfi': /(^|_)(rfi|open|raise_first)(_|$)/i,
                    'vs3bet': /(^|_)(vs_?3bet|facing_?3bet|3bet_def|3b)(_|$)/i,
                    'bb_defense': /(^|_)(bb_def|bb_vs|big_blind)(_|$)/i,
                    'cold_call': /(^|_)(cold_call|flat|overcall)(_|$)/i,
                    '4bet': /(^|_)(4bet|four_bet|4b)(_|$)/i,
                    'squeeze': /(^|_)(squeeze|sqz)(_|$)/i,
                    'cbet': /(^|_)(cbet|c_?bet|flop_bet)(_|$)/i,
                    'turn_barrel': /(^|_)(barrel|turn_bet|double_barrel)(_|$)/i,
                    'river_bluff': /(^|_)(river|bluff|triple_barrel)(_|$)/i,
                    'check_raise': /(^|_)(check_?raise|xr)(_|$)/i,
                    'turn_probe': /(^|_)(probe|turn_lead)(_|$)/i,
                    'river_value': /(^|_)(river_value|thin_value|value_bet)(_|$)/i,
                };
                const patterns = spotTypes.map(st => spotTypePatterns[st]).filter(Boolean);
                if (patterns.length > 0) {
                    const filtered = allData.filter(row =>
                        patterns.some(p => p.test((row.scenario_hash || '').toLowerCase()))
                    );
                    if (filtered.length > 0) allData = filtered;
                }
            }

            // Prefer rebuilt v2 data, then sanitize; drop rows with no credible hands
            allData.forEach(row => preferV2(row));
            allData.forEach(row => sanitizeStrategyMatrix(row.strategy_matrix));
            allData = allData.filter(row => {
                const f = row.strategy_matrix?.frequencies || {};
                return (row.strategy_matrix?.actions || []).some(
                    a => f[a] && Object.keys(f[a]).length > 0
                );
            });
            if (allData.length === 0) return null;

            const shuffled = [...allData];
            for (let i = shuffled.length - 1; i > 0; i--) {
                const j = Math.floor(Math.random() * (i + 1));
                [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
            }
            return shuffled.slice(0, limit);
        } catch (err) {
            console.warn('[EnginePatches] fetchSolverPool error:', err.message);
            return null;
        }
    };

    // ── PATCH 3: sanitize + answer-class balance + forcedHand support ──
    engine.buildQuestionFromScenario = function patchedBuild(
        scenario, gameConfig, level, questionIndex, forcedHand = null
    ) {
        try {
            if (scenario?.strategy_matrix) sanitizeStrategyMatrix(scenario.strategy_matrix);

            if (forcedHand) {
                const handClass = toHandClass(forcedHand);
                if (!handClass || !matrixHasHand(scenario?.strategy_matrix, handClass)) return null;
                const prunedScenario = pruneScenarioToHand(scenario, handClass);
                return originalBuild(prunedScenario, gameConfig, level, questionIndex);
            }

            // Alternate the preferred answer class across questionIndex so no
            // single action dominates the answer key (bounded retries — each
            // offset re-seeds the internal hand pick).
            const preferAggressive = questionIndex % 2 === 1;
            let first = null;
            for (const offset of [0, 131, 263, 397]) {
                const q = originalBuild(scenario, gameConfig, level, questionIndex + offset);
                if (!q) continue;
                if (!first) first = q;
                if (isAggressiveAction(q.correctAnswer) === preferAggressive) return q;
            }
            return first;
        } catch (err) {
            console.warn('[EnginePatches] buildQuestionFromScenario error:', err.message);
            return null;
        }
    };

    // ── PATCH 4: multi-street with hand integrity + true-child preference ──
    engine.queryNextStreet = async function patchedQueryNextStreet(
        { gameConfig, heroHand: rawHeroHand, boardCards, street, pot, stackDepth, heroPosition, villainPosition }
    ) {
        if (!gameConfig || !boardCards || boardCards.length < 3) return null;
        const heroHand = toHandClass(rawHeroHand);
        try {
            const boardStr = boardCards.map(c => c.toLowerCase()).join('');

            // True child node: hash ENDS WITH the full board
            const { data: exactMatches } = await this.db
                .from('solved_spots_gold')
                .select('id, scenario_hash, street, stack_depth, game_type, strategy_matrix, strategy_matrix_v2')
                .eq('game_type', gameConfig.pioGameType)
                .eq('stack_depth', gameConfig.pioStackDepth)
                .eq('street', street)
                .ilike('scenario_hash', `%${boardStr}`)
                .limit(5);

            for (const scenario of exactMatches || []) {
                preferV2(scenario);
                const question = this.buildQuestionFromScenario(scenario, gameConfig, 5, 0, heroHand || null);
                if (question) return question;
            }

            // Nearest-texture fallback on the flop prefix
            const flopStr = boardCards.slice(0, 3).map(c => c.toLowerCase()).join('');
            const { data: partialMatches } = await this.db
                .from('solved_spots_gold')
                .select('id, scenario_hash, street, stack_depth, game_type, strategy_matrix, strategy_matrix_v2')
                .eq('game_type', gameConfig.pioGameType)
                .eq('stack_depth', gameConfig.pioStackDepth)
                .eq('street', street)
                .ilike('scenario_hash', `%${flopStr}%`)
                .limit(50);

            if (partialMatches && partialMatches.length > 0) {
                const rankToVal = r => "23456789TJQKA".indexOf(r.toUpperCase()) + 2;
                const getTexture = (cards) => {
                    const ranks = cards.map(c => c[0].toUpperCase());
                    const suits = cards.map(c => c[1].toLowerCase());
                    const hasPair = new Set(ranks).size < cards.length;
                    const maxSuitFreq = Math.max(...Object.values(suits.reduce((acc, s) => { acc[s] = (acc[s] || 0) + 1; return acc; }, {})));
                    return { hasPair, hasFlushDraw: maxSuitFreq >= 3 };
                };
                const reqTexture = getTexture(boardCards);

                const scored = partialMatches.map(scenario => {
                    const scenarioBoard = parseBoardFromHash(scenario.scenario_hash);
                    let dist = 0;
                    for (let i = 3; i < boardCards.length; i++) {
                        if (!scenarioBoard[i]) continue;
                        const rankDiff = Math.abs(rankToVal(boardCards[i][0]) - rankToVal(scenarioBoard[i][0]));
                        const suitDiff = boardCards[i][1].toLowerCase() === scenarioBoard[i][1].toLowerCase() ? 0 : 6;
                        dist += (rankDiff * 2) + suitDiff;
                    }
                    const dbTexture = getTexture(scenarioBoard);
                    if (reqTexture.hasPair !== dbTexture.hasPair) dist += 25;
                    if (reqTexture.hasFlushDraw !== dbTexture.hasFlushDraw) dist += 15;
                    return { scenario, dist };
                }).sort((a, b) => a.dist - b.dist);

                // Walk candidates nearest-first until one has credible data for
                // the user's hand
                for (const { scenario, dist } of scored.slice(0, 10)) {
                    preferV2(scenario);
                    const question = this.buildQuestionFromScenario(scenario, gameConfig, 5, 0, heroHand || null);
                    if (question) {
                        question.scenario.board = boardCards.join(' ');
                        question.boardCards = boardCards;
                        question.isApproximateBoard = true; // similar, not identical, runout
                        console.debug(`[EnginePatches] Multi-street semantic match (dist ${dist})`);
                        return question;
                    }
                }
            }

            return null; // no credible continuation — client ends the hand cleanly
        } catch (err) {
            console.warn('[EnginePatches] queryNextStreet error:', err.message);
            return null;
        }
    };

    return engine;
}

export default applyDeterministicEnginePatches;
