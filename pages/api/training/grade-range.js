/**
 * API: Compare A Constructed Range With One Authored Practice Reference
 *
 * This endpoint intentionally exposes only the exact static corpus identity
 * that the Range Builder can prove it has: 6-max cash RFI at 100BB. The
 * bundled frequencies are an authored study reference, not a verified solver
 * artifact and not an exact-EV source.
 *
 * POST /api/training/grade-range
 * {
 *   gameType: 'cash_6max',
 *   scenario: 'rfi',
 *   position: 'UTG' | 'MP' | 'HJ' | 'CO' | 'BTN' | 'SB',
 *   stackDepth: 100,
 *   selectedHands: ['AA', 'AKs', ...]
 * }
 */

import { getServerUserWithFallback } from '../../../src/lib/serverAuth';
import { createClient } from '../../../src/lib/supabaseServerClient';
import { applyRateLimit, LIMITS } from '../../../src/lib/apiRateLimit';
import { getAllHands, getCombos, withTiming } from '../../../src/utils/trainingApiUtils';
import { RFI, getHandFrequencies } from '../../../src/config/solverRanges';
import { reportApiError } from '../../../src/lib/sentryWrap';

export const RANGE_BUILDER_REFERENCE_PROVENANCE = Object.freeze({
    source: 'static_authored_preflop_reference',
    authority: 'authored_reference',
    authoritative: false,
    solverVerified: false,
    exactEVAvailable: false,
    practiceOnly: true,
    version: 'range-builder-rfi-100bb-v1',
});

export const RANGE_BUILDER_SUPPORTED_SPOT = Object.freeze({
    gameType: 'cash_6max',
    tableSize: 6,
    scenario: 'rfi',
    stackDepth: 100,
    positions: Object.freeze(['UTG', 'MP', 'HJ', 'CO', 'BTN', 'SB']),
});

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

/**
 * Resolve only an exact corpus identity. There is deliberately no closest
 * position, depth, scenario, or Button fallback.
 */
export function resolveAuthoredRangeReference({
    gameType,
    scenario,
    position,
    stackDepth,
    vsPosition,
} = {}) {
    const normalizedPosition = typeof position === 'string' ? position.toUpperCase() : '';
    const noOpponentDimension = vsPosition === undefined || vsPosition === null || vsPosition === '';
    const supported = gameType === RANGE_BUILDER_SUPPORTED_SPOT.gameType
        && scenario === RANGE_BUILDER_SUPPORTED_SPOT.scenario
        && Number(stackDepth) === RANGE_BUILDER_SUPPORTED_SPOT.stackDepth
        && noOpponentDimension
        && RANGE_BUILDER_SUPPORTED_SPOT.positions.includes(normalizedPosition)
        && Object.prototype.hasOwnProperty.call(RFI, normalizedPosition);

    if (!supported) return null;

    const referenceId = [
        RANGE_BUILDER_SUPPORTED_SPOT.gameType,
        RANGE_BUILDER_SUPPORTED_SPOT.scenario,
        normalizedPosition,
        `${RANGE_BUILDER_SUPPORTED_SPOT.stackDepth}bb`,
    ].join(':');

    return {
        spotData: RFI[normalizedPosition],
        reference: {
            id: referenceId,
            label: `${normalizedPosition} 6-Max Cash RFI At 100BB`,
            gameType: RANGE_BUILDER_SUPPORTED_SPOT.gameType,
            tableSize: RANGE_BUILDER_SUPPORTED_SPOT.tableSize,
            scenario: RANGE_BUILDER_SUPPORTED_SPOT.scenario,
            position: normalizedPosition,
            stackDepth: RANGE_BUILDER_SUPPORTED_SPOT.stackDepth,
        },
    };
}

function getLetterGrade(score) {
    if (score >= 97) return 'A+';
    if (score >= 93) return 'A';
    if (score >= 90) return 'A-';
    if (score >= 87) return 'B+';
    if (score >= 83) return 'B';
    if (score >= 80) return 'B-';
    if (score >= 77) return 'C+';
    if (score >= 73) return 'C';
    if (score >= 70) return 'C-';
    if (score >= 67) return 'D+';
    if (score >= 63) return 'D';
    if (score >= 60) return 'D-';
    return 'F';
}

function buildReferenceFrequencies(spotData, allHands) {
    const frequencies = {};
    allHands.forEach((hand) => {
        const authored = getHandFrequencies(spotData, hand);
        const combined = (Number(authored?.raise) || 0) + (Number(authored?.call) || 0);
        frequencies[hand] = Math.max(0, Math.min(1, combined));
    });
    return frequencies;
}

export default async function handler(req, res) {
    try {
        withTiming(res);
        if (!applyRateLimit(req, res, LIMITS.write)) return;

        if (req.method !== 'POST') {
            res.setHeader('Allow', 'POST');
            return res.status(405).json({ success: false, code: 'METHOD_NOT_ALLOWED', error: 'POST only' });
        }

        const bodySize = JSON.stringify(req.body || {}).length;
        if (bodySize > 10240) {
            return res.status(413).json({ success: false, code: 'REQUEST_TOO_LARGE', error: 'Request body too large' });
        }

        const token = req.headers.authorization?.replace('Bearer ', '');
        if (!token) return res.status(401).json({ success: false, code: 'AUTH_REQUIRED', error: 'Auth required' });

        const { user, error: authError } = await getServerUserWithFallback(req, getSupabase());
        if (authError || !user) {
            return res.status(401).json({ success: false, code: 'INVALID_AUTH', error: 'Invalid token' });
        }

        const {
            gameType,
            scenario,
            position,
            stackDepth,
            vsPosition,
            selectedHands,
        } = req.body || {};

        if (!Array.isArray(selectedHands)) {
            return res.status(400).json({
                success: false,
                code: 'INVALID_SELECTED_HANDS',
                error: 'selectedHands must be an array',
            });
        }

        const allHands = getAllHands();
        const validHands = new Set(allHands);
        const hasInvalidHand = selectedHands.some((hand) => typeof hand !== 'string' || !validHands.has(hand));
        const hasDuplicateHand = new Set(selectedHands).size !== selectedHands.length;
        if (selectedHands.length > allHands.length || hasInvalidHand || hasDuplicateHand) {
            return res.status(400).json({
                success: false,
                code: 'INVALID_SELECTED_HANDS',
                error: 'selectedHands must contain unique canonical hand notations',
            });
        }

        const resolved = resolveAuthoredRangeReference({
            gameType,
            scenario,
            position,
            stackDepth,
            vsPosition,
        });
        if (!resolved) {
            return res.status(422).json({
                success: false,
                code: 'UNSUPPORTED_AUTHORED_REFERENCE',
                error: 'No exact authored practice reference exists for the requested spot',
                supported: RANGE_BUILDER_SUPPORTED_SPOT,
            });
        }

        const referenceFrequencies = buildReferenceFrequencies(resolved.spotData, allHands);
        const selected = new Set(selectedHands);
        const matched = [];
        const omitted = [];
        const extra = [];
        const mixed = {};
        const gridDiff = {};

        let totalReferenceCombos = 0;
        let userCombos = 0;
        let overlapCombos = 0;
        let weightedAgreement = 0;
        let totalWeight = 0;

        allHands.forEach((hand) => {
            const referenceFrequency = referenceFrequencies[hand] || 0;
            const userIncluded = selected.has(hand);
            const combos = getCombos(hand);
            totalWeight += combos;

            if (referenceFrequency >= 0.5) totalReferenceCombos += combos;
            if (userIncluded) userCombos += combos;

            if (userIncluded && referenceFrequency >= 0.5) {
                matched.push(hand);
                overlapCombos += combos;
                weightedAgreement += combos;
                gridDiff[hand] = 'match';
            } else if (!userIncluded && referenceFrequency < 0.1) {
                weightedAgreement += combos;
                gridDiff[hand] = 'neutral';
            } else if (userIncluded && referenceFrequency < 0.1) {
                extra.push(hand);
                gridDiff[hand] = 'extra';
            } else if (!userIncluded && referenceFrequency >= 0.5) {
                omitted.push(hand);
                gridDiff[hand] = 'omitted';
            } else if (userIncluded) {
                mixed[hand] = { selected: true, referenceFrequency };
                weightedAgreement += combos * referenceFrequency;
                gridDiff[hand] = 'partial';
            } else {
                mixed[hand] = { selected: false, referenceFrequency };
                weightedAgreement += combos * (1 - referenceFrequency);
                gridDiff[hand] = 'neutral';
            }
        });

        const score = totalWeight > 0 ? Math.round(weightedAgreement / totalWeight * 100) : 0;
        const coverage = totalReferenceCombos > 0
            ? Math.round(overlapCombos / totalReferenceCombos * 1000) / 10
            : 0;

        return res.status(200).json({
            success: true,
            comparison: {
                letter: getLetterGrade(score),
                score,
                coverage,
            },
            reference: resolved.reference,
            provenance: {
                ...RANGE_BUILDER_REFERENCE_PROVENANCE,
                referenceId: resolved.reference.id,
            },
            diff: {
                matched,
                omitted,
                extra,
                mixed,
                gridDiff,
            },
            stats: {
                totalReferenceCombos,
                userCombos,
                overlapCombos,
                totalHands: allHands.length,
                matchedCount: matched.length,
                omittedCount: omitted.length,
                extraCount: extra.length,
                mixedCount: Object.keys(mixed).length,
            },
        });
    } catch (err) {
        try {
            reportApiError(err, req);
        } catch (reportingError) {
            const reportingMessage = reportingError?.message || 'Unknown reporting failure';
            console.warn('[GradeRange] Error reporting failed:', reportingMessage);
        }
        console.warn('[GradeRange] Request failed:', err?.message || err);
        if (!res.headersSent) {
            return res.status(500).json({
                success: false,
                code: 'REFERENCE_COMPARISON_FAILED',
                error: 'Unable to compare this range right now',
            });
        }
    }
}
