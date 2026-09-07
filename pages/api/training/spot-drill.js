import { randomInt, randomUUID } from 'crypto';
import { getServerUserWithFallback } from '../../../src/lib/serverAuth';
import { createClient } from '../../../src/lib/supabaseServerClient';
import { applyRateLimit, LIMITS } from '../../../src/lib/apiRateLimit';
import { sanitizeParam, withTiming } from '../../../src/utils/trainingApiUtils';
import { reportApiError } from '../../../src/lib/sentryWrap';
import { v2ToAppMatrix } from '../../../src/utils/v2Matrix';
import { customSolverProvenanceIsComplete } from '../../../src/lib/training/customSolverSpotContract.mjs';
import { parseSolverScenarioHash, SOLVER_POSITIONS } from '../../../src/lib/training/solverRowIdentity.mjs';

/**
 * Solver Spot Study serves answer-revealed reference material only.
 *
 * A historical version sampled the legacy strategy_matrix column, invented
 * distractors, and described Pio chip targets as percentages. This endpoint
 * now fails closed unless one v2 row has a canonical identity and a complete,
 * validated PioSOLVER provenance chain. It never grades or awards anything.
 */

const TRAINING_SOLVER_CONTRACTS = Object.freeze({
    hu_cash: Object.freeze([40, 100, 200]),
    mtt_3max_chipev: Object.freeze([20]),
    mtt_6max_chipev: Object.freeze([10, 20, 40, 100]),
    mtt_6max_icm: Object.freeze([20, 40]),
    mtt_9max_chipev: Object.freeze([20, 40, 80, 100]),
    mtt_9max_icm: Object.freeze([40, 60]),
    mtt_hu_chipev: Object.freeze([40]),
    postflop_complete: Object.freeze([100]),
    spin_3max_chipev: Object.freeze([20, 25]),
    spin_3max_icm: Object.freeze([20, 25]),
    spin_hu_chipev: Object.freeze([10, 20]),
    spin_hu_icm: Object.freeze([10]),
});

const CASH_FAMILIES = Object.freeze(['hu_cash', 'postflop_complete']);
const MTT_FAMILIES = Object.freeze([
    'mtt_3max_chipev',
    'mtt_6max_chipev',
    'mtt_6max_icm',
    'mtt_9max_chipev',
    'mtt_9max_icm',
    'mtt_hu_chipev',
]);
const ALL_FAMILIES = Object.freeze(Object.keys(TRAINING_SOLVER_CONTRACTS));
const POSITION_SET = new Set(SOLVER_POSITIONS);
const CANDIDATE_LIMIT = 12;

const SOLVER_ROW_PROJECTION = [
    'id',
    'scenario_hash',
    'game_type',
    'stack_depth',
    'street',
    'strategy_matrix_v2',
    'solver_version',
    'solver_binary_checksum',
    'machine_id',
    'pipeline_commit',
    'manifest_version',
    'manifest_checksum',
    'source_artifact_checksum',
    'quality_status',
    'audited_at',
].join(', ');

let _supabase = null;
function getSupabase() {
    if (!_supabase) {
        if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
            throw new Error('Solver service is not configured');
        }
        _supabase = createClient(
            process.env.NEXT_PUBLIC_SUPABASE_URL,
            process.env.SUPABASE_SERVICE_ROLE_KEY,
        );
    }
    return _supabase;
}

function addProvenanceFilters(query) {
    return query
        .not('strategy_matrix_v2', 'is', null)
        .eq('quality_status', 'validated')
        .not('solver_version', 'is', null)
        .not('solver_binary_checksum', 'is', null)
        .not('machine_id', 'is', null)
        .not('pipeline_commit', 'is', null)
        .not('manifest_version', 'is', null)
        .not('manifest_checksum', 'is', null)
        .not('source_artifact_checksum', 'is', null)
        .not('audited_at', 'is', null);
}

function familySetForFormat(format) {
    if (format === 'cash') return CASH_FAMILIES;
    if (format === 'mtt') return MTT_FAMILIES;
    return ALL_FAMILIES;
}

function isContractStack(families, stackDepth) {
    return families.some((family) => TRAINING_SOLVER_CONTRACTS[family]?.includes(stackDepth));
}

function formatBbTarget(chips) {
    const bigBlinds = Number(chips) / 100;
    return Number.isInteger(bigBlinds) ? String(bigBlinds) : String(Math.round(bigBlinds * 100) / 100);
}

function actionLabel(action, matrix) {
    if (action === 'f') return 'Fold';
    if (action === 'x') return 'Check';
    if (action === 'c') return Number(matrix?.facing_bet_bb) > 0 ? 'Call' : 'Check';
    if (action === 'allin') return 'All-In';
    const bet = /^b([1-9]\d*)$/.exec(action);
    if (bet) return `Bet To ${formatBbTarget(bet[1])} BB`;
    const raise = /^r([1-9]\d*)$/.exec(action);
    if (raise) return `Raise To ${formatBbTarget(raise[1])} BB`;
    return null;
}

function buildStudySpot(row) {
    if (!customSolverProvenanceIsComplete(row)) return null;
    const parsed = parseSolverScenarioHash(row.scenario_hash);
    if (!parsed.ok) return null;

    const matrix = v2ToAppMatrix(row.strategy_matrix_v2);
    if (!matrix || matrix.node_state_exact !== true) return null;
    const actions = Array.isArray(matrix.actions) ? matrix.actions : [];
    const labels = actions.map((action) => actionLabel(action, matrix));
    if (actions.length < 2 || labels.some((label) => !label)) return null;

    const eligibleHands = Object.keys(matrix.hand_evs || {}).filter((hand) => {
        if (!Number.isFinite(Number(matrix.hand_evs?.[hand]))) return false;
        const values = actions.map((action) => Number(matrix.frequencies?.[action]?.[hand]));
        return values.every((value) => Number.isFinite(value) && value >= 0)
            && values.reduce((sum, value) => sum + value, 0) > 0;
    });
    if (eligibleHands.length === 0) return null;

    const heroHand = eligibleHands[randomInt(eligibleHands.length)];
    const rawValues = actions.map((action) => Math.max(0, Number(matrix.frequencies[action][heroHand])));
    const total = rawValues.reduce((sum, value) => sum + value, 0);
    if (!Number.isFinite(total) || total <= 0) return null;

    let primaryIndex = 0;
    const actionBreakdown = {};
    actions.forEach((action, index) => {
        if (rawValues[index] > rawValues[primaryIndex]) primaryIndex = index;
        const label = labels[index];
        const percentage = (rawValues[index] / total) * 100;
        actionBreakdown[label] = (actionBreakdown[label] || 0) + percentage;
    });
    Object.keys(actionBreakdown).forEach((label) => {
        actionBreakdown[label] = Math.round(actionBreakdown[label] * 10) / 10;
    });

    return {
        id: row.id,
        scenarioHash: row.scenario_hash,
        board: parsed.identity.boardCards,
        street: parsed.identity.street,
        heroPosition: parsed.identity.heroPosition,
        stackDepth: row.stack_depth,
        gameType: row.game_type,
        heroHand,
        handEvBb: Math.round(Number(matrix.hand_evs[heroHand]) * 1000) / 1000,
        gtoAction: labels[primaryIndex],
        gtoFrequency: Math.round((rawValues[primaryIndex] / total) * 1000) / 10,
        actionBreakdown,
        decisionNode: {
            node: matrix.node,
            actorRole: matrix.hero,
            oopPosition: matrix.oop_player,
            ipPosition: matrix.ip_player,
            potBb: matrix.pot_bb,
            facingBetBb: matrix.facing_bet_bb,
            effectiveStackBb: matrix.eff_stack_bb,
        },
        provenance: {
            verified: true,
            source: 'PioSOLVER',
            solverVersion: row.solver_version,
            machineId: row.machine_id,
            pipelineCommit: row.pipeline_commit,
            manifestVersion: row.manifest_version,
            manifestChecksum: row.manifest_checksum,
            sourceArtifactChecksum: row.source_artifact_checksum,
            qualityStatus: row.quality_status,
            auditedAt: row.audited_at,
        },
    };
}

function buildCandidateQuery({ families, position, stackDepth, pivot }) {
    let query = addProvenanceFilters(
        getSupabase()
            .from('solved_spots_gold')
            .select(SOLVER_ROW_PROJECTION)
            .in('game_type', families),
    );
    if (position) query = query.eq('strategy_matrix_v2->>position', position);
    if (stackDepth) query = query.eq('stack_depth', stackDepth);
    if (pivot) query = query.gte('id', pivot);
    return query.order('id', { ascending: true }).limit(CANDIDATE_LIMIT);
}

export default async function handler(req, res) {
    try {
        res.setHeader('Cache-Control', 'private, no-store, max-age=0');
        res.setHeader('Vary', 'Authorization');
        withTiming(res);
        if (!applyRateLimit(req, res, LIMITS.read)) return;
        if (req.method !== 'GET') {
            return res.status(405).json({ success: false, error: 'Method not allowed' });
        }

        const token = req.headers.authorization?.replace('Bearer ', '');
        if (!token) return res.status(401).json({ success: false, error: 'Authentication required' });
        const { user, error: authError } = await getServerUserWithFallback(req, getSupabase());
        if (authError || !user) {
            return res.status(401).json({ success: false, error: 'Authentication required' });
        }

        const format = sanitizeParam(req.query.format || '', 10).toLowerCase();
        const position = sanitizeParam(req.query.position || '', 10).toUpperCase();
        const stackRaw = req.query.stack;
        const stackDepth = stackRaw === undefined || stackRaw === '' ? null : Number(stackRaw);
        const families = familySetForFormat(format);
        if ((format && format !== 'cash' && format !== 'mtt')
            || (position && !POSITION_SET.has(position))
            || (stackDepth !== null
                && (!Number.isSafeInteger(stackDepth)
                    || stackDepth <= 0
                    || !isContractStack(families, stackDepth)))) {
            return res.status(400).json({
                success: false,
                code: 'SOLVER_STUDY_FILTER_INVALID',
                error: 'One or more solver study filters are invalid',
            });
        }

        const pivot = randomUUID();
        let { data, error } = await buildCandidateQuery({ families, position, stackDepth, pivot });
        if (!error && (!Array.isArray(data) || data.length === 0)) {
            ({ data, error } = await buildCandidateQuery({ families, position, stackDepth, pivot: null }));
        }
        if (error) {
            console.warn('[SpotDrill] Audited solver lookup failed:', error.message);
            return res.status(503).json({
                success: false,
                code: 'SOLVER_LOOKUP_UNAVAILABLE',
                error: 'Audited solver lookup is temporarily unavailable',
                retryable: true,
            });
        }

        const candidates = (data || []).map(buildStudySpot).filter(Boolean);
        if (candidates.length === 0) {
            return res.status(404).json({
                success: false,
                code: 'AUDITED_SOLVER_ARTIFACT_NOT_FOUND',
                error: 'No provenance-complete solver artifact exists for these study filters',
                retryable: false,
            });
        }

        return res.status(200).json({
            success: true,
            mode: 'answer_revealed_reference',
            authoritativeTrainingProgress: false,
            spot: candidates[randomInt(candidates.length)],
        });
    } catch (error) {
        let reportFailure = null;
        try { reportApiError(error, req); } catch (reportError) { reportFailure = reportError; }
        if (reportFailure) {
            console.warn('[SpotDrill] Error reporting failed:', reportFailure?.message || reportFailure);
        }
        console.warn('[SpotDrill] Unexpected error:', error?.message || error);
        if (!res.headersSent) {
            return res.status(500).json({ success: false, error: 'Internal server error' });
        }
        return undefined;
    }
}
