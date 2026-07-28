/**
 * 🎯 DETERMINISTIC GTO Scenario Generation API (Operation Grok-Sweep — 2026-05)
 * ═══════════════════════════════════════════════════════════════════════════
 * Generates Memory-Matrix preflop training scenarios from REAL solver-derived
 * range tables in src/config/solverRanges.js. NO LLM calls. NO hallucinations.
 *
 * Prior implementation (DELETED) used grok-3 with `temperature: 0.7` to
 * "generate" scenarios — the system prompt even claimed they were
 * "solver-accurate". They were not. Every Memory Matrix session was burning
 * grok-3 tokens and serving hallucinated GTO ranges to users.
 *
 * The new implementation pulls from solverRanges.js, which has hand-by-hand
 * mixed-strategy frequencies for:
 *   • RFI / RFI_20BB / RFI_50BB / RFI_200BB  — Open-raise ranges by stack depth
 *   • THREE_BET                                — 3-bet ranges vs each opener
 *   • BB_DEFENSE                               — BB defense (call + 3bet)
 *   • FOUR_BET                                 — 4-bet ranges
 *   • SQUEEZE                                  — Squeeze ranges
 *   • COLD_CALL                                — Cold-call ranges
 *   • SB_COMPLETE                              — SB complete vs BB
 *   • SHOVE_FOLD                               — Push/fold (short-stack)
 *   • BB_CALL_VS_SHOVE                         — BB call ranges vs shove
 *
 * Output shape preserved exactly so existing frontend consumers
 * (pages/hub/memory-games.js, src/games/GrokScenarioLoader.js) keep working.
 *
 * POST /api/gto/generate-scenario
 * Body: { level, position?, stackDepth?, format?, scenarioType? }
 * ═══════════════════════════════════════════════════════════════════════════
 */

import { applyRateLimit, LIMITS } from '../../../src/lib/apiRateLimit';
import { createClient as _createAuthClient } from '../../../src/lib/supabaseServerClient';
import { reportApiError } from '../../../src/lib/sentryWrap';
import {
    RFI, RFI_20BB, RFI_50BB, RFI_200BB,
    THREE_BET, BB_DEFENSE, FOUR_BET, SQUEEZE, COLD_CALL,
    SB_COMPLETE, SHOVE_FOLD, BB_CALL_VS_SHOVE,
} from '../../../src/config/solverRanges';

// ── Position / stack / format / scenario-type configs by level ───────────────
const POSITION_CONFIGS = {
    1: ['UTG', 'MP', 'HJ'],
    2: ['UTG', 'MP', 'HJ', 'CO'],
    3: ['UTG', 'MP', 'HJ', 'CO', 'BTN'],
    4: ['UTG', 'MP', 'HJ', 'CO', 'BTN', 'SB'],
    5: ['UTG', 'MP', 'HJ', 'CO', 'BTN', 'SB', 'BB'],
    6: ['CO', 'BTN', 'SB', 'BB'],
    7: ['SB', 'BB'],
    8: ['UTG', 'MP', 'HJ', 'CO', 'BTN', 'SB', 'BB'],
    9: ['BTN', 'SB', 'BB'],
    10: ['UTG', 'CO', 'BTN', 'BB'],
};

const STACK_DEPTHS = {
    1: [100], 2: [100, 50], 3: [100, 50, 200], 4: [100, 50, 200, 30],
    5: [100, 50, 200, 30, 150], 6: [100, 50, 30],
    7: [20, 25, 30], 8: [100, 200, 150], 9: [30, 40, 50],
    10: [100, 200, 30, 50],
};

const FORMATS = {
    1: ['Cash 6-max'],
    2: ['Cash 6-max', 'Cash 9-max'],
    3: ['Cash 6-max', 'Cash 9-max', 'MTT'],
    4: ['Cash 6-max', 'Cash 9-max', 'MTT', 'Spin & Go'],
    5: ['Cash 6-max', 'Cash 9-max', 'MTT', 'Spin & Go'],
    6: ['Cash 6-max', 'MTT'],
    7: ['MTT', 'Spin & Go'],
    8: ['Cash 6-max deep'],
    9: ['MTT FT', 'Spin & Go HU'],
    10: ['Cash 6-max', 'MTT', 'Spin & Go', 'Mixed'],
};

// Scenario types restricted to ones we can serve from real solver data.
// (Removed "PLO 6-max", "Exploitative Adjustments" etc. — those are not
// preflop-range scenarios and have no engine support yet.)
const SCENARIO_TYPES = {
    1: ['Open Raise Range'],
    2: ['Open Raise Range', '3-Bet Defense'],
    3: ['Open Raise Range', '3-Bet Defense', 'Squeeze Range'],
    4: ['Open Raise Range', '3-Bet Defense', 'Squeeze Range', 'vs 4-Bet'],
    5: ['Open Raise Range', '3-Bet Defense', 'Squeeze Range', 'vs 4-Bet', 'Blind vs Blind'],
    6: ['3-Bet Range', 'Cold 4-Bet', 'Mixed Frequency'],
    7: ['Push/Fold', 'ICM Spots', 'Bubble Play'],
    8: ['Open Raise Range', 'Mixed Frequency', '3-Bet Defense'],
    9: ['Push/Fold', 'BB Call vs Shove'],
    10: ['Open Raise Range', '3-Bet Defense', 'Mixed Frequency', 'vs 4-Bet'],
};

// ── Helpers ──────────────────────────────────────────────────────────────────
function pickRfiTable(stackDepth) {
    if (stackDepth <= 25) {
        // 2026-07-26 AUDIT FIX: SHOVE_FOLD is keyed by stack bucket ('10BB',
        // '15BB', ...) and only THEN by position, unlike the RFI tables which are
        // keyed by position directly. Returning the raw table made the caller's
        // `table[position]` undefined for every short-stack open-raise scenario,
        // so those 404'd. Resolve the nearest bucket here so the caller can keep
        // indexing by position uniformly.
        const buckets = Object.keys(SHOVE_FOLD)
            .map((k) => ({ key: k, bb: parseInt(k, 10) }))
            .filter((b) => isFinite(b.bb))
            .sort((a, b) => Math.abs(a.bb - stackDepth) - Math.abs(b.bb - stackDepth));
        const bucketKey = buckets.length > 0 ? buckets[0].key : null;
        return {
            table: (bucketKey && SHOVE_FOLD[bucketKey]) || {},
            kind: bucketKey ? `SHOVE_FOLD_${bucketKey}` : 'SHOVE_FOLD',
        };
    }
    if (stackDepth <= 35) return { table: RFI_20BB, kind: 'RFI_20BB' };
    if (stackDepth <= 75) return { table: RFI_50BB, kind: 'RFI_50BB' };
    if (stackDepth >= 175) return { table: RFI_200BB, kind: 'RFI_200BB' };
    return { table: RFI, kind: 'RFI_100BB' };
}

function pickOpponentForDefense(heroPosition) {
    // For BB defense / vs-3bet / vs-4bet, pair the hero with a plausible opener.
    if (heroPosition === 'BB' || heroPosition === 'SB') {
        const candidates = ['UTG', 'MP', 'CO', 'BTN'];
        return candidates[Math.floor(Math.random() * candidates.length)];
    }
    // Hero is the opener — defender is BB.
    return 'BB';
}

function topAction(freqs) {
    if (!freqs) return null;
    const entries = Object.entries(freqs).filter(([, v]) =>
        typeof v === 'number' && Number.isFinite(v) && v > 0);
    if (entries.length === 0) return null;
    entries.sort((a, b) => b[1] - a[1]);
    return entries[0]; // [action, freq] e.g. ['raise', 0.85]
}

// Normalize solverRanges action labels to the Memory-Matrix vocabulary.
// validateScenario accepts: raise/call/3bet/4bet/fold/check/allin/jam (+ mix%).
const ACTION_NORMALIZE = {
    shove: 'allin',
    jam: 'allin',
    complete: 'call', // SB-complete (flat from the SB) is effectively a call
};

function freqsToSolutionEntry(freqs) {
    // Convert a {raise:0.85, call:0.10, fold:0.05} map to a single
    // Memory-Matrix action string. If the top action is dominant (≥0.95),
    // emit a pure label ("raise"). Otherwise emit a mixed-strategy label
    // ("raise85") — the existing validateScenario regex accepts this form.
    const top = topAction(freqs);
    if (!top) return 'fold';
    const [rawAction, freq] = top;
    const action = ACTION_NORMALIZE[rawAction] || rawAction;
    if (freq >= 0.95) return action;
    const pct = Math.round(freq * 100);
    return `${action}${pct}`;
}

function rangeToSolution(range) {
    if (!range) return {};
    const out = {};
    for (const [hand, freqs] of Object.entries(range)) {
        const entry = freqsToSolutionEntry(freqs);
        if (entry) out[hand] = entry;
    }
    return out;
}

// Map (scenarioType, position, stackDepth) → real solver range table.
function selectSolverRange({ scenarioType, position, stackDepth, opponent }) {
    const sd = Number(stackDepth) || 100;

    switch (scenarioType) {
        case 'Open Raise Range':
        case 'Mixed Frequency': {
            const { table, kind } = pickRfiTable(sd);
            return {
                range: table[position] || table.BTN || {},
                source: kind,
                title: `${position} Open-Raise (${sd}bb)`,
                description: `Open-raise frequencies from ${position} at ${sd}bb effective stacks. Solver-equilibrium ranges for 6-max cash.`,
                tip: 'The mixed-strategy hands at the edge of the range are the highest-leverage spots — wrong frequencies here cost the most EV over time.',
            };
        }

        case '3-Bet Range': {
            return {
                range: THREE_BET[`vs_${opponent}`] || THREE_BET.vs_BTN || {},
                source: 'THREE_BET',
                title: `${position} 3-Bet vs ${opponent}`,
                description: `3-bet ranges from ${position} facing a ${opponent} open at ~100bb. Includes value 3-bets, polar bluffs, and the mixed-frequency boundary.`,
                tip: '3-bet ranges are tighter than they look — most "borderline" suited connectors get folded, with a dedicated polar-bluff tier for blockers.',
            };
        }

        case '3-Bet Defense':
        case 'vs 4-Bet': {
            return {
                range: BB_DEFENSE[`vs_${opponent}`] || BB_DEFENSE.vs_BTN || {},
                source: 'BB_DEFENSE',
                title: `${position} Defense vs ${opponent}`,
                description: `Defending range from ${position} facing a ${opponent} open. Combines flat-calls (call-heavy) with the polar 3-bet tier.`,
                tip: 'BB defense is wider than feels intuitive because of the discount on calling — but most of those hands are pure flats, not 3-bets.',
            };
        }

        case 'Squeeze Range': {
            // SQUEEZE keys are <position>_vs_<opener>_open_<caller>_call.
            // Pick a key matching the hero position; fall back across keys
            // if the requested combo isn't tabulated.
            const candidateKeys = [
                `${position}_vs_${opponent}_open_BTN_call`,
                `${position}_vs_${opponent}_open_MP_call`,
                'BTN_vs_UTG_open_MP_call',
                'BB_vs_CO_open_BTN_call',
                'SB_vs_CO_open_BTN_call',
            ];
            let pickedRange = null, pickedKey = null;
            for (const k of candidateKeys) {
                if (SQUEEZE[k] && Object.keys(SQUEEZE[k]).length > 0) {
                    pickedRange = SQUEEZE[k];
                    pickedKey = k;
                    break;
                }
            }
            return {
                range: pickedRange || {},
                source: `SQUEEZE_${pickedKey || 'default'}`,
                title: `${position} Squeeze vs ${opponent} + caller`,
                description: `Squeeze 3-bet ranges from ${position} when ${opponent} opens and a player calls. Tighter for value, more polar than a standard 3-bet.`,
                tip: 'Squeezing is mostly a value play — the dead money in the pot rewards stronger ranges, not wider bluffs.',
            };
        }

        case 'Cold 4-Bet': {
            return {
                // 2026-07-26 AUDIT FIX: FOUR_BET is keyed by the HERO position that
                // opened and is now facing a 3-bet -- UTG_vs_3bet / CO_vs_3bet /
                // BTN_vs_3bet. The old `vs_${opponent}_3bet` key (and its
                // `vs_BTN_3bet` fallback) exist nowhere in solverRanges, so every
                // Cold 4-Bet scenario resolved to {} and the endpoint 404'd.
                range: FOUR_BET[`${position}_vs_3bet`] || FOUR_BET.BTN_vs_3bet || {},
                source: `FOUR_BET_${position}`,
                title: `${position} 4-Bet vs ${opponent} 3-bet`,
                description: `4-bet ranges from ${position} facing a ${opponent} 3-bet. Tight value range plus a small polar bluff tier.`,
                tip: '4-betting is a tight value game — most "almost 4-bet" hands like AQs and JJ are actually flat-calls at 100bb.',
            };
        }

        case 'Blind vs Blind': {
            return {
                range: SB_COMPLETE.SB_open || SB_COMPLETE || {},
                source: 'SB_COMPLETE',
                title: 'SB vs BB — Open Range',
                description: 'SB open-raise frequencies vs BB at 100bb. Wide and aggressive — BB defends ~70% in response.',
                tip: 'SB plays a polar strategy: very wide raises with limps mixed in for trap-style play.',
            };
        }

        case 'Push/Fold':
        case 'ICM Spots':
        case 'Bubble Play': {
            // SHOVE_FOLD has nested stack-depth buckets ('10BB', '15BB', etc).
            // Pick the bucket closest to (but not above) the requested stack.
            const buckets = Object.keys(SHOVE_FOLD)
                .map(k => ({ key: k, bb: parseInt(k, 10) }))
                .filter(b => Number.isFinite(b.bb))
                .sort((a, b) => a.bb - b.bb);
            let bucketKey = buckets[0]?.key;
            for (const b of buckets) {
                if (b.bb <= sd) bucketKey = b.key;
            }
            const bucket = (bucketKey && SHOVE_FOLD[bucketKey]) || {};
            const range = bucket[position] || bucket.BTN || {};
            return {
                range,
                source: `SHOVE_FOLD_${bucketKey || 'default'}`,
                title: `${position} Push/Fold (~${bucketKey || sd + 'bb'})`,
                description: `Push-or-fold equilibrium ranges from ${position} at short stacks (${bucketKey || sd + 'bb'}). Below 15bb, calling is rarely profitable; above 25bb, post-flop play returns.`,
                tip: 'Pay attention to the ICM premium on tournament bubbles — chip-EV ranges shrink ~10-15% under real ICM pressure.',
            };
        }

        case 'BB Call vs Shove': {
            // BB_CALL_VS_SHOVE also has stack-depth buckets ('10BB', etc).
            const buckets = Object.keys(BB_CALL_VS_SHOVE)
                .map(k => ({ key: k, bb: parseInt(k, 10) }))
                .filter(b => Number.isFinite(b.bb))
                .sort((a, b) => a.bb - b.bb);
            let bucketKey = buckets[0]?.key;
            for (const b of buckets) {
                if (b.bb <= sd) bucketKey = b.key;
            }
            const bucket = (bucketKey && BB_CALL_VS_SHOVE[bucketKey]) || {};
            const range = bucket[`vs_${opponent}`] || bucket.vs_BTN || bucket || {};
            return {
                range,
                source: `BB_CALL_VS_SHOVE_${bucketKey || 'default'}`,
                title: `BB Call vs ${opponent} Shove (~${bucketKey || sd + 'bb'})`,
                description: `Call ranges in the BB vs a ${opponent} all-in shove at ${bucketKey || sd + 'bb'}. Wider than people think — pot odds force calls with surprising hands.`,
                tip: 'BB getting ~2:1 to call needs only ~33% equity — even hands like 65s clear that bar against many shoving ranges.',
            };
        }

        default: {
            const { table, kind } = pickRfiTable(sd);
            return {
                range: table[position] || table.BTN || {},
                source: kind,
                title: `${position} Open-Raise (${sd}bb)`,
                description: `Default open-raise scenario at ${position}, ${sd}bb effective.`,
                tip: 'Memorize the upper boundary of the range first — those are the highest-EV hands to get right.',
            };
        }
    }
}

// ── Handler ──────────────────────────────────────────────────────────────────
export default async function handler(req, res) {
    try {
        if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method)) {
            if (!applyRateLimit(req, res, LIMITS.write)) return;
        }

        // Auth (preserved exactly from the prior implementation)
        const _authSupa = _createAuthClient(
            process.env.NEXT_PUBLIC_SUPABASE_URL,
            process.env.SUPABASE_SERVICE_ROLE_KEY
        );
        const _token = req.headers.authorization?.replace('Bearer ', '');
        if (!_token) return res.status(401).json({ success: false, error: 'Auth required' });
        const { data: authData, error: _authErr } = await _authSupa.auth.getUser(_token);
        const _authUser = authData?.user;
        if (_authErr || !_authUser) return res.status(401).json({ success: false, error: 'Invalid token' });

        // Query profiles for VIP status
        const { data: profile } = await _authSupa
            .from('profiles')
            .select('is_vip, vip_tier, vip_expires_at')
            .eq('id', _authUser.id)
            .maybeSingle();

        let isVip = false;
        if (profile?.is_vip === true) {
            if (profile.vip_tier === 'lifetime') {
                isVip = true;
            } else if (profile.vip_expires_at) {
                isVip = new Date(profile.vip_expires_at).getTime() > Date.now();
            }
        }

        if (req.method !== 'POST') {
            return res.status(405).json({ success: false, error: 'Method not allowed' });
        }

        try {
            const { level = 1, position, stackDepth, format, scenarioType } = req.body || {};

            const lvl = Number(level);
            if (!Number.isFinite(lvl) || lvl < 1 || lvl > 10) {
                return res.status(400).json({ success: false, error: 'Level must be between 1 and 10' });
            }

            if (lvl > 3 && !isVip) {
                return res.status(403).json({ success: false, error: 'VIP subscription required for levels 4-10' });
            }

            const positionPool = POSITION_CONFIGS[lvl] || POSITION_CONFIGS[1];
            const stackPool    = STACK_DEPTHS[lvl]      || STACK_DEPTHS[1];
            const formatPool   = FORMATS[lvl]           || FORMATS[1];
            const typePool     = SCENARIO_TYPES[lvl]    || SCENARIO_TYPES[1];

            const selectedPosition  = position    || positionPool[Math.floor(Math.random() * positionPool.length)];
            const selectedStackDepth = stackDepth || stackPool[Math.floor(Math.random() * stackPool.length)];
            const selectedFormat    = format      || formatPool[Math.floor(Math.random() * formatPool.length)];
            const selectedType      = scenarioType || typePool[Math.floor(Math.random() * typePool.length)];

            const opponent = pickOpponentForDefense(selectedPosition);

            const { range, source, title, description, tip } = selectSolverRange({
                scenarioType: selectedType,
                position: selectedPosition,
                stackDepth: selectedStackDepth,
                opponent,
            });

            const solution = rangeToSolution(range);

            // If the picked range is empty (data gap), fail loudly rather
            // than serve a blank scenario. The Memory Matrix UI handles
            // 4xx responses by retrying with different params.
            if (!solution || Object.keys(solution).length === 0) {
                return res.status(404).json({
                    success: false,
                    error: 'No solver range available for this scenario',
                    meta: {
                        level: lvl,
                        position: selectedPosition,
                        stackDepth: selectedStackDepth,
                        format: selectedFormat,
                        scenarioType: selectedType,
                        rangeSource: source,
                    },
                });
            }

            const scenario = {
                id: `det-${source}-${selectedPosition}-${selectedStackDepth}bb-${Date.now()}`,
                level: lvl,
                title,
                position: selectedPosition,
                stackDepth: selectedStackDepth,
                description,
                tip,
                solution,
                source: 'DETERMINISTIC_SOLVER',
                rangeSource: source,
            };

            return res.status(200).json({
                success: true,
                scenario,
                meta: {
                    level: lvl,
                    position: selectedPosition,
                    stackDepth: selectedStackDepth,
                    format: selectedFormat,
                    type: selectedType,
                    opponent,
                    rangeSource: source,
                    handsInRange: Object.keys(solution).length,
                    generatedAt: new Date().toISOString(),
                    engine: 'DETERMINISTIC_SOLVER_RANGES',
                },
            });
        } catch (error) {
            console.warn('[GenerateScenario] Error:', error);
            return res.status(500).json({
                success: false,
                error: error.message || 'Failed to generate scenario',
            });
        }
    } catch (err) {
        try { reportApiError(err, req); } catch (_sentryErr) {
            console.warn('[App] Handled exception:', _sentryErr?.message || _sentryErr);
        }
        console.warn('[API Error]', err);
        if (!res.headersSent) return res.status(500).json({ success: false, error: 'Internal server error' });
    }
}
