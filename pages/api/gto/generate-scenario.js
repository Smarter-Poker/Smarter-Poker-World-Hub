/**
 * AUTHORED PREFLOP PRACTICE SCENARIO API
 * ═══════════════════════════════════════════════════════════════════════════
 * Generates unranked Memory-Matrix practice scenarios from the authored range
 * reference in src/config/solverRanges.js. It makes no LLM call, but it also
 * has no solver artifact, tree checksum, binary checksum, or solve lineage.
 *
 * Prior implementation (DELETED) used grok-3 with `temperature: 0.7` to
 * "generate" scenarios — the system prompt even claimed they were
 * "solver-accurate". They were not. Every Memory Matrix session was burning
 * grok-3 tokens and serving hallucinated GTO ranges to users.
 *
 * The implementation pulls from solverRanges.js, which has hand-by-hand
 * mixed-strategy frequencies for:
 *   • RFI / RFI_20BB / RFI_50BB / RFI_200BB  — Open-raise ranges by stack depth
 *   • THREE_BET                                — 3-bet ranges vs each opener
 *   • BB_DEFENSE                               — BB defense (call + 3bet)
 *   • FOUR_BET                                 — 4-bet ranges
 *   • SQUEEZE                                  — Squeeze ranges
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
import { reportApiError } from '../../../src/lib/apiErrorHandler';
import {
    RFI, RFI_20BB, RFI_50BB, RFI_200BB,
    THREE_BET, BB_DEFENSE, FOUR_BET, SQUEEZE,
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
    1: [100], 2: [100, 50], 3: [100, 50, 200], 4: [100, 50, 200, 20],
    5: [100, 50, 200, 20], 6: [100, 50, 20],
    7: [10, 15], 8: [100, 200], 9: [10, 15],
    10: [100, 200, 20, 50],
};

const FORMATS = {
    1: ['Authored Local Practice'], 2: ['Authored Local Practice'],
    3: ['Authored Local Practice'], 4: ['Authored Local Practice'],
    5: ['Authored Local Practice'], 6: ['Authored Local Practice'],
    7: ['Authored Local Practice'], 8: ['Authored Local Practice'],
    9: ['Authored Local Practice'], 10: ['Authored Local Practice'],
};

// Scenario types restricted to ones present in the authored reference corpus.
// (Removed "PLO 6-max", "Exploitative Adjustments" etc. — those are not
// preflop-range scenarios and have no engine support yet.)
const SCENARIO_TYPES = {
    1: ['Open Raise Range'],
    2: ['Open Raise Range', '3-Bet Defense'],
    3: ['Open Raise Range', '3-Bet Defense', 'Squeeze Range'],
    4: ['Open Raise Range', '3-Bet Defense', 'Squeeze Range', 'vs 4-Bet'],
    5: ['Open Raise Range', '3-Bet Defense', 'Squeeze Range', 'vs 4-Bet', 'Blind vs Blind'],
    6: ['3-Bet Range', 'Cold 4-Bet', 'Mixed Frequency'],
    // This endpoint has chip-EV shove/fold ranges only. ICM and bubble spots
    // require payout, field, and stack-distribution inputs that are not part
    // of this contract and therefore must not be advertised here.
    7: ['Push/Fold'],
    8: ['Open Raise Range', 'Mixed Frequency', '3-Bet Defense'],
    9: ['Push/Fold', 'BB Call vs Shove'],
    10: ['Open Raise Range', '3-Bet Defense', 'Mixed Frequency', 'vs 4-Bet'],
};

// ── Helpers ──────────────────────────────────────────────────────────────────
function pickRfiTable(stackDepth) {
    if (stackDepth === 20) return { table: RFI_20BB, kind: 'RFI_20BB' };
    if (stackDepth === 50) return { table: RFI_50BB, kind: 'RFI_50BB' };
    if (stackDepth === 100) return { table: RFI, kind: 'RFI_100BB' };
    if (stackDepth === 200) return { table: RFI_200BB, kind: 'RFI_200BB' };
    return { table: {}, kind: 'UNAVAILABLE' };
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
        // Range-memory solutions contain only hands the player should mark.
        // Including reference-fold hands makes an untouched fold cell grade as
        // "missed" and turns a valid range into an impossible 169-cell task.
        if (entry && !entry.startsWith('fold')) out[hand] = entry;
    }
    return out;
}

// Map (scenarioType, position, stackDepth) → authored reference table.
function selectAuthoredRange({ scenarioType, position, stackDepth, opponent }) {
    const sd = Number(stackDepth) || 100;

    switch (scenarioType) {
        case 'Open Raise Range':
        case 'Mixed Frequency': {
            const { table, kind } = pickRfiTable(sd);
            return {
                range: table[position] || {},
                source: kind,
                title: `${position} Open-Raise (${sd}bb)`,
                description: `Authored open-raise teaching frequencies from ${position} at ${sd}bb effective stacks for local 6-max practice.`,
                tip: 'The mixed-strategy hands at the edge of the range are the highest-leverage spots - wrong frequencies here cost the most EV over time.',
            };
        }

        case '3-Bet Range': {
            return {
                range: THREE_BET[`${position}_vs_${opponent}`] || {},
                source: `THREE_BET_${position}_vs_${opponent}`,
                title: `${position} 3-Bet vs ${opponent}`,
                description: `3-bet ranges from ${position} facing a ${opponent} open at ~100bb. Includes value 3-bets, polar bluffs, and the mixed-frequency boundary.`,
                tip: '3-bet ranges are tighter than they look - most "borderline" suited connectors get folded, with a dedicated polar-bluff tier for blockers.',
            };
        }

        case '3-Bet Defense': {
            return {
                range: position === 'BB' ? (BB_DEFENSE[`vs_${opponent}`] || {}) : {},
                source: 'BB_DEFENSE',
                title: `${position} Defense vs ${opponent}`,
                description: `Defending range from ${position} facing a ${opponent} open. Combines flat-calls (call-heavy) with the polar 3-bet tier.`,
                tip: 'BB defense is wider than feels intuitive because of the discount on calling - but most of those hands are pure flats, not 3-bets.',
            };
        }

        case 'Squeeze Range': {
            // SQUEEZE keys are <position>_vs_<opener>_open_<caller>_call.
            // Pick a key matching the hero position; fall back across keys
            // if the requested combo isn't tabulated.
            const pickedKey = Object.keys(SQUEEZE).find(
                (key) => key.startsWith(`${position}_vs_${opponent}_open_`),
            ) || null;
            const pickedRange = pickedKey ? SQUEEZE[pickedKey] : null;
            return {
                range: pickedRange || {},
                source: `SQUEEZE_${pickedKey || 'default'}`,
                title: `${position} Squeeze vs ${opponent} + caller`,
                description: `Squeeze 3-bet ranges from ${position} when ${opponent} opens and a player calls. Tighter for value, more polar than a standard 3-bet.`,
                tip: 'Squeezing is mostly a value play - the dead money in the pot rewards stronger ranges, not wider bluffs.',
            };
        }

        case 'Cold 4-Bet': {
            return {
                // 2026-07-26 AUDIT FIX: FOUR_BET is keyed by the HERO position that
                // opened and is now facing a 3-bet -- UTG_vs_3bet / CO_vs_3bet /
                // BTN_vs_3bet. The old `vs_${opponent}_3bet` key (and its
                // `vs_BTN_3bet` fallback) exist nowhere in solverRanges, so every
                // Cold 4-Bet scenario resolved to {} and the endpoint 404'd.
                range: FOUR_BET[`${position}_vs_3bet`] || {},
                source: `FOUR_BET_${position}`,
                title: `${position} 4-Bet vs ${opponent} 3-bet`,
                description: `4-bet ranges from ${position} facing a ${opponent} 3-bet. Tight value range plus a small polar bluff tier.`,
                tip: '4-betting is a tight value game - most "almost 4-bet" hands like AQs and JJ are actually flat-calls at 100bb.',
            };
        }

        case 'vs 4-Bet': {
            return {
                range: FOUR_BET[`${position}_vs_3bet`] || {},
                source: `FOUR_BET_${position}`,
                title: `${position} Response Facing A 3-Bet`,
                description: `Authored 4-bet teaching frequencies for ${position} after opening and facing a 3-bet.`,
                tip: 'Use this as a local range-memory reference, not as an exact solve for an unspecified opponent or sizing.',
            };
        }

        case 'Blind vs Blind': {
            return {
                range: SB_COMPLETE.SB_open || SB_COMPLETE || {},
                source: 'SB_COMPLETE',
                title: 'SB vs BB - Open Range',
                description: 'SB open-raise frequencies vs BB at 100bb. Wide and aggressive - BB defends ~70% in response.',
                tip: 'SB plays a polar strategy: very wide raises with limps mixed in for trap-style play.',
            };
        }

        case 'Push/Fold': {
            const bucketKey = `${sd}BB`;
            const bucket = SHOVE_FOLD[bucketKey] || {};
            const range = bucket[position] || {};
            return {
                range,
                source: `SHOVE_FOLD_${bucketKey || 'default'}`,
                title: `${position} Push/Fold (~${bucketKey || sd + 'bb'})`,
                description: `Chip-EV push-or-fold ranges from ${position} at short stacks (${bucketKey || sd + 'bb'}). No payout, field, or bubble inputs are applied.`,
                tip: 'Use a dedicated ICM model for payout-sensitive decisions; these ranges describe chip-EV only.',
            };
        }

        case 'BB Call vs Shove': {
            const bucketKey = `${sd}BB`;
            const bucket = BB_CALL_VS_SHOVE[bucketKey] || {};
            const range = position === 'BB' ? (bucket[`vs_${opponent}`] || {}) : {};
            return {
                range,
                source: `BB_CALL_VS_SHOVE_${bucketKey || 'default'}`,
                title: `BB Call vs ${opponent} Shove (~${bucketKey || sd + 'bb'})`,
                description: `Call ranges in the BB vs a ${opponent} all-in shove at ${bucketKey || sd + 'bb'}. Wider than people think - pot odds force calls with surprising hands.`,
                tip: 'BB getting ~2:1 to call needs only ~33% equity - even hands like 65s clear that bar against many shoving ranges.',
            };
        }

        default: {
            return {
                range: {},
                source: 'UNAVAILABLE',
                title: 'Authored Practice Unavailable',
                description: 'This authored practice combination is not available.',
                tip: 'Choose a supported local practice contract.',
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
        const { data: profile, error: profileError } = await _authSupa
            .from('profiles')
            .select('is_vip, vip_tier, vip_expires_at')
            .eq('id', _authUser.id)
            .maybeSingle();

        if (profileError) {
            return res.status(503).json({
                success: false,
                code: 'AUTHORED_REFERENCE_ENTITLEMENT_UNAVAILABLE',
                error: 'Training entitlement could not be verified.',
            });
        }

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

            const requestedPosition = position == null ? null : String(position).trim().toUpperCase();
            const requestedStackDepth = stackDepth == null ? null : Number(stackDepth);
            const requestedFormat = format == null ? null : String(format).trim();
            if (
                (requestedPosition && !positionPool.includes(requestedPosition))
                || (requestedStackDepth != null && !stackPool.includes(requestedStackDepth))
                || (requestedFormat && !formatPool.includes(requestedFormat))
            ) {
                return res.status(400).json({
                    success: false,
                    code: 'AUTHORED_REFERENCE_FILTER_UNSUPPORTED',
                    error: 'The requested position, stack, or format is not present in this authored practice contract.',
                });
            }

            const selectedPosition = requestedPosition || positionPool[Math.floor(Math.random() * positionPool.length)];
            const selectedStackDepth = requestedStackDepth ?? stackPool[Math.floor(Math.random() * stackPool.length)];
            const selectedFormat = requestedFormat || formatPool[Math.floor(Math.random() * formatPool.length)];
            if (scenarioType && !typePool.includes(scenarioType)) {
                return res.status(400).json({
                    success: false,
                    code: 'AUTHORED_REFERENCE_TYPE_UNSUPPORTED',
                    error: 'This scenario type is not present in the authored practice contract for this level.',
                });
            }
            const selectedType      = scenarioType || typePool[Math.floor(Math.random() * typePool.length)];

            const opponent = pickOpponentForDefense(selectedPosition);

            const { range, source, title, description, tip } = selectAuthoredRange({
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
                    error: 'No authored practice range is available for this scenario',
                    meta: {
                        level: lvl,
                        position: selectedPosition,
                        stackDepth: selectedStackDepth,
                        format: selectedFormat,
                        scenarioType: selectedType,
                        referenceSource: source,
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
                source: 'AUTHORED_PREFLOP_REFERENCE',
                referenceSource: source,
                authority: 'authored_local_reference',
                authorityStatus: 'practice_only',
                practiceOnly: true,
                solverGenerated: false,
                solverVerified: false,
                countsTowardCompletion: false,
                evidenceDisclosure: 'Authored local preflop teaching reference for unranked practice; not a provenance-sealed solver export.',
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
                    referenceSource: source,
                    handsInRange: Object.keys(solution).length,
                    generatedAt: new Date().toISOString(),
                    engine: 'AUTHORED_PREFLOP_REFERENCE',
                    authorityStatus: 'practice_only',
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
        try { reportApiError(err, req); } catch (_reportError) {
            console.warn('[App] Handled exception:', _reportError?.message || _reportError);
        }
        console.warn('[API Error]', err);
        if (!res.headersSent) return res.status(500).json({ success: false, error: 'Internal server error' });
    }
}
