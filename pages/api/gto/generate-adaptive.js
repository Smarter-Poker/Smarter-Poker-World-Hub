/**
 * 🎯 DETERMINISTIC Adaptive Scenario Generation API (Operation Grok-Sweep — 2026-05)
 * ═══════════════════════════════════════════════════════════════════════════
 * Generates personalized training scenarios targeting the user's weakest
 * positions, using REAL solver-derived ranges from src/config/solverRanges.js.
 * NO LLM. NO hallucination.
 *
 * "Personalization" here means: which position to drill (based on past
 * mistakes) — the scenario CONTENT itself is always real solver data, not a
 * fabricated grok-3 output.
 *
 * Prior implementation used grok-3 with `temperature: 0.7` to "generate" the
 * scenario, then fell back to hardcoded raise-only solutions when that failed.
 * The hardcoded fallbacks were also incomplete (missing folds, no mixed
 * frequencies). The new implementation always returns the full mixed-strategy
 * solver range for the targeted position.
 *
 * POST /api/gto/generate-adaptive
 * (auth via JWT — userId derived from token, never trusted from body)
 * ═══════════════════════════════════════════════════════════════════════════
 */

import { createClient } from '../../../src/lib/supabaseServerClient';
import { getCachedResponse, setCachedResponse } from '../../../src/lib/jarvisCache';
import { applyRateLimit, LIMITS } from '../../../src/lib/apiRateLimit';
import { reportApiError } from '../../../src/lib/apiErrorHandler';
import {
    RFI, RFI_20BB, RFI_50BB, RFI_200BB,
    BB_DEFENSE, THREE_BET,
} from '../../../src/config/solverRanges';

// ── Lazy Supabase getter ─────────────────────────────────────────────────────
let _supabase = null;
function getSupabase() {
    if (!_supabase) {
        _supabase = createClient(
            process.env.NEXT_PUBLIC_SUPABASE_URL,
            process.env.SUPABASE_SERVICE_ROLE_KEY
        );
    }
    return _supabase;
}

// ── Solver-range helpers (mirrored from generate-scenario.js for isolation) ──
const ACTION_NORMALIZE = { shove: 'allin', jam: 'allin', complete: 'call' };

function topAction(freqs) {
    if (!freqs) return null;
    const e = Object.entries(freqs).filter(([, v]) =>
        typeof v === 'number' && Number.isFinite(v) && v > 0);
    if (e.length === 0) return null;
    e.sort((a, b) => b[1] - a[1]);
    return e[0];
}

function freqsToSolutionEntry(freqs) {
    const top = topAction(freqs);
    if (!top) return 'fold';
    const [raw, freq] = top;
    const action = ACTION_NORMALIZE[raw] || raw;
    if (freq >= 0.95) return action;
    return `${action}${Math.round(freq * 100)}`;
}

function rangeToSolution(range) {
    if (!range) return {};
    const out = {};
    for (const [hand, freqs] of Object.entries(range)) {
        const entry = freqsToSolutionEntry(freqs);
        // The range grid asks players to mark active hands; folds remain
        // intentionally blank. Persisting fold entries makes every blank fold
        // grade as a miss in the range-memory scoring contract.
        if (entry && !entry.startsWith('fold')) out[hand] = entry;
    }
    return out;
}

function pickRfiTable(stackDepth) {
    const sd = Number(stackDepth) || 100;
    if (sd <= 35) return RFI_20BB;
    if (sd <= 75) return RFI_50BB;
    if (sd >= 175) return RFI_200BB;
    return RFI;
}

function rangeLabLevelForRfiPosition(position) {
    return ['CO', 'BTN', 'SB'].includes(String(position || '').toUpperCase()) ? 2 : 1;
}

// ── Weakness analysis (deterministic — analyzes real session history) ────────
async function fetchWeakSpots(userId) {
    const { data: sessions, error } = await getSupabase()
        .from('training_sessions')
        .select('position_stats, classification_counts, hand_history, attempt_id, training_attempts!training_sessions_attempt_fk!inner(id, user_id, status, practice_only)')
        .eq('user_id', userId)
        .eq('training_attempts.user_id', userId)
        .eq('training_attempts.status', 'completed')
        .not('attempt_id', 'is', null)
        .eq('training_attempts.practice_only', false)
        .order('created_at', { ascending: false })
        .limit(100);

    if (error) throw error;
    if (!sessions?.length) return [];

    const patterns = {};
    sessions.forEach(session => {
        const stats = session?.position_stats && typeof session.position_stats === 'object'
            ? session.position_stats
            : {};
        Object.entries(stats).forEach(([position, values]) => {
            const normalizedPosition = String(position || '').toUpperCase();
            // This endpoint builds an RFI drill. Do not pretend an unknown,
            // BB-only, or unsupported seat maps to BTN behind the scenes.
            if (!RFI?.[normalizedPosition]) return;
            const total = Number(values?.total) || 0;
            const correct = Number(values?.correct) || 0;
            const errors = Math.max(0, total - correct);
            if (errors > 0) {
                patterns[normalizedPosition] = (patterns[normalizedPosition] || 0) + errors;
            }
        });
    });

    return Object.entries(patterns || {})
        .sort((a, b) => b[1] - a[1])
        .slice(0, 3)
        .map(([area, count]) => ({
            area: `${area} Play`,
            type: 'position',
            value: area,
            errorCount: count,
        }));
}

// ── Deterministic scenario builder for a given position ──────────────────────
function buildAdaptiveScenario(weakness) {
    const position = (weakness?.value || 'CO').toUpperCase();
    const stackDepth = 100;
    const rfiTable = pickRfiTable(stackDepth);
    const range = (rfiTable && rfiTable[position]) || (rfiTable && rfiTable.BTN) || {};
    const solution = rangeToSolution(range);

    return {
        id: `adaptive-${position}-${Date.now()}`,
        level: rangeLabLevelForRfiPosition(position),
        title: `${position} Opening Range - Targeted Drill`,
        description: `Practice your ${position} open-raise frequencies at ${stackDepth}bb. ` +
            `This range was flagged as your weakest spot - the solver-equilibrium ` +
            `frequencies below close that gap fastest.`,
        position,
        stackDepth,
        villainPosition: null,
        action: 'open',
        solution,
        source: 'DETERMINISTIC_SOLVER',
        rangeSource: 'RFI_100BB',
        isAdaptive: true,
        targetedWeakness: weakness?.area || `${position} Play`,
    };
}

function buildDefaultScenario() {
    // Untargeted scenario for users with no session history yet.
    const position = 'CO';
    const range = (RFI && RFI[position]) || {};
    const solution = rangeToSolution(range);

    return {
        id: `default-CO-${Date.now()}`,
        level: rangeLabLevelForRfiPosition(position),
        title: 'CO Opening Range',
        description: 'Standard cutoff opening range training at 100bb. ' +
            'Play more sessions to unlock personalized weakness-targeted drills.',
        position,
        stackDepth: 100,
        action: 'open',
        solution,
        source: 'DETERMINISTIC_SOLVER',
        rangeSource: 'RFI_100BB',
    };
}

// ── Handler ──────────────────────────────────────────────────────────────────
export default async function handler(req, res) {
    try {
        if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method)) {
            if (!applyRateLimit(req, res, LIMITS.write)) return;
        }

        // Auth (preserved)
        const _authSupa = createClient(
            process.env.NEXT_PUBLIC_SUPABASE_URL,
            process.env.SUPABASE_SERVICE_ROLE_KEY
        );
        const _token = req.headers.authorization?.replace('Bearer ', '');
        if (!_token) return res.status(401).json({ success: false, error: 'Auth required' });
        const { data: authData, error: _authErr } = await _authSupa.auth.getUser(_token);
        const _authUser = authData?.user;
        if (_authErr || !_authUser) return res.status(401).json({ success: false, error: 'Invalid token' });

        if (req.method !== 'POST') {
            return res.status(405).json({ success: false, error: 'Method not allowed' });
        }

        try {
            const userId = _authUser.id; // Trust JWT, not body

            const weakSpots = await fetchWeakSpots(userId);

            if (!weakSpots || weakSpots.length === 0) {
                return res.status(200).json({
                    success: true,
                    isNewUser: true,
                    scenario: buildDefaultScenario(),
                    targetedArea: null,
                    message: 'Play more games for personalized weakness-targeted training!',
                });
            }

            const targetWeakness = weakSpots[0];

            // Cache by position (multiple users with the same weakness benefit)
            const cacheParams = {
                position: (targetWeakness.value || 'CO').toUpperCase(),
                type: 'adaptive-scenario-deterministic',
            };
            const cached = await getCachedResponse('generate-adaptive', cacheParams);
            let scenario;
            if (cached) {
                scenario = { ...cached, id: `adaptive-${cacheParams.position}-${Date.now()}`, fromCache: true };
            } else {
                scenario = buildAdaptiveScenario(targetWeakness);
                await setCachedResponse('generate-adaptive', cacheParams, scenario, 14);
            }

            return res.status(200).json({
                success: true,
                scenario,
                targetedArea: targetWeakness.area,
                weakSpots,
                message: `Targeting your ${targetWeakness.area} weakness`,
            });
        } catch (error) {
            console.warn('[GenerateAdaptive] Error:', error);
            return res.status(503).json({
                success: false,
                unavailable: true,
                code: 'ADAPTIVE_TRAINING_HISTORY_UNAVAILABLE',
                error: 'Adaptive training history is temporarily unavailable',
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
