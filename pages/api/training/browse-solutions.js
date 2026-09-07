import { getServerUserWithFallback } from '../../../src/lib/serverAuth';
import { createClient } from '../../../src/lib/supabaseServerClient';
import { applyRateLimit, LIMITS } from '../../../src/lib/apiRateLimit';
import { getAllHands, sanitizeParam, VALID_STREETS, withTiming } from '../../../src/utils/trainingApiUtils';
import { reportApiError } from '../../../src/lib/sentryWrap';
import { v2ToAppMatrix } from '../../../src/utils/v2Matrix';
import { customSolverProvenanceIsComplete } from '../../../src/lib/training/customSolverSpotContract.mjs';
import { parseSolverScenarioHash, SOLVER_POSITIONS } from '../../../src/lib/training/solverRowIdentity.mjs';

/**
 * Browse only provenance-complete PioSOLVER v2 artifacts.
 *
 * The historical implementation silently fell back to `strategy_matrix` and
 * displayed unaudited rows as GTO truth. It also derived a made-up equity
 * percentage from hand EV. Both behaviours are forbidden: a row is visible
 * only when its relational identity, embedded v2 identity, source artifact,
 * machine, pipeline, manifest, quality status, and solve geometry all pass.
 */

const TRAINING_SOLVER_CONTRACTS = new Map(Object.entries({
    hu_cash: [40, 100, 200],
    mtt_3max_chipev: [20],
    mtt_6max_chipev: [10, 20, 40, 100],
    mtt_6max_icm: [20, 40],
    mtt_9max_chipev: [20, 40, 80, 100],
    mtt_9max_icm: [40, 60],
    mtt_hu_chipev: [40],
    postflop_complete: [100],
    spin_3max_chipev: [20, 25],
    spin_3max_icm: [20, 25],
    spin_hu_chipev: [10, 20],
    spin_hu_icm: [10],
}).map(([family, stacks]) => [family, new Set(stacks)]));
const POSITION_SET = new Set(SOLVER_POSITIONS);
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

function verifiedIdentity(row) {
    if (!customSolverProvenanceIsComplete(row)) return null;
    const parsed = parseSolverScenarioHash(row.scenario_hash);
    return parsed.ok ? parsed.identity : null;
}

function listSpot(row) {
    const identity = verifiedIdentity(row);
    if (!identity) return null;
    const v2 = row.strategy_matrix_v2;
    return {
        id: row.id,
        scenarioHash: row.scenario_hash,
        gameType: row.game_type,
        stackDepth: row.stack_depth,
        street: row.street,
        board: identity.boardCards,
        heroPosition: identity.heroPosition,
        actorRole: v2.hero,
        node: v2.node,
        source: 'PioSOLVER',
        auditedAt: row.audited_at,
    };
}

function buildGridData(matrix) {
    const actions = Array.isArray(matrix?.actions) ? matrix.actions : [];
    const frequencies = matrix?.frequencies || {};
    const gridData = {};

    for (const hand of getAllHands()) {
        const values = actions.map((action) => Number(frequencies[action]?.[hand]));
        if (values.some((value) => !Number.isFinite(value) || value < 0)) {
            gridData[hand] = null;
            continue;
        }
        const total = values.reduce((sum, value) => sum + value, 0);
        if (total <= 0) {
            gridData[hand] = null;
            continue;
        }
        gridData[hand] = {};
        actions.forEach((action, index) => {
            gridData[hand][action] = Math.round((values[index] / total) * 1000) / 10;
        });
    }

    return gridData;
}

function fullSpot(row) {
    const summary = listSpot(row);
    if (!summary) return null;
    const matrix = v2ToAppMatrix(row.strategy_matrix_v2);
    if (!matrix) return null;
    const actions = Array.isArray(matrix.actions) ? matrix.actions : [];
    if (actions.length < 2) return null;
    const gridData = buildGridData(matrix);
    const handCount = Object.values(gridData).filter(Boolean).length;
    if (handCount === 0) return null;

    return {
        ...summary,
        actions,
        gridData,
        handEVs: matrix.hand_evs || {},
        rawFrequencies: matrix.frequencies || {},
        handCount,
        decisionNode: {
            node: matrix.node,
            actorRole: matrix.hero,
            oopPosition: matrix.oop_player,
            ipPosition: matrix.ip_player,
            potBb: matrix.pot_bb,
            effectiveStackBb: matrix.eff_stack_bb,
        },
        provenance: {
            verified: true,
            source: 'PioSOLVER',
            solverVersion: row.solver_version,
            machineId: row.machine_id,
            pipelineCommit: row.pipeline_commit,
            manifestVersion: row.manifest_version,
            qualityStatus: row.quality_status,
            auditedAt: row.audited_at,
        },
    };
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

async function requireUser(req) {
    const token = req.headers.authorization?.replace('Bearer ', '');
    if (!token) return null;
    const { user, error } = await getServerUserWithFallback(req, getSupabase());
    return error ? null : user;
}

export default async function handler(req, res) {
    res.setHeader('Cache-Control', 'private, no-store, max-age=0');
    res.setHeader('Vary', 'Authorization');

    try {
        withTiming(res);
        if (!applyRateLimit(req, res, LIMITS.read)) return;
        if (req.method !== 'GET') {
            return res.status(405).json({ success: false, error: 'Method not allowed' });
        }

        const user = await requireUser(req);
        if (!user) return res.status(401).json({ success: false, error: 'Authentication required' });

        const spotId = req.query.spotId ? sanitizeParam(req.query.spotId, 180) : null;
        const scenarioHash = req.query.scenarioHash ? sanitizeParam(req.query.scenarioHash, 200) : null;

        if (spotId || scenarioHash) {
            if (scenarioHash && !parseSolverScenarioHash(scenarioHash).ok) {
                return res.status(400).json({
                    success: false,
                    code: 'SOLVER_SCENARIO_IDENTITY_INVALID',
                    error: 'scenarioHash is not a canonical solver identity',
                });
            }

            let query = addProvenanceFilters(
                getSupabase().from('solved_spots_gold').select(SOLVER_ROW_PROJECTION),
            );
            query = spotId
                ? query.eq('id', spotId)
                : query.eq('scenario_hash', scenarioHash);
            const { data, error } = await query.limit(3);
            if (error) {
                console.warn('[BrowseSolutions] Exact lookup failed:', error.message);
                return res.status(503).json({
                    success: false,
                    code: 'SOLVER_LOOKUP_UNAVAILABLE',
                    error: 'Audited solver lookup is temporarily unavailable',
                    retryable: true,
                });
            }

            const matches = (data || []).map(fullSpot).filter(Boolean);
            if (matches.length > 1) {
                return res.status(503).json({
                    success: false,
                    code: 'SOLVER_IDENTITY_AMBIGUOUS',
                    error: 'Multiple audited artifacts claim this solver identity',
                });
            }
            if (matches.length === 0) {
                return res.status(404).json({
                    success: false,
                    code: 'AUDITED_SOLVER_ARTIFACT_NOT_FOUND',
                    error: 'No provenance-complete solver artifact exists for this exact identity',
                });
            }
            return res.status(200).json({ success: true, spot: matches[0] });
        }

        const gameType = sanitizeParam(req.query.gameType || 'hu_cash', 40);
        const stackDepth = Number(req.query.stackDepth || 100);
        const street = sanitizeParam(req.query.street || 'flop', 10);
        const position = req.query.position ? sanitizeParam(req.query.position, 10).toUpperCase() : null;
        const page = Math.max(1, Number.parseInt(req.query.page, 10) || 1);
        const limit = Math.min(50, Math.max(1, Number.parseInt(req.query.limit, 10) || 20));

        if (!TRAINING_SOLVER_CONTRACTS.has(gameType)
            || !Number.isSafeInteger(stackDepth)
            || stackDepth <= 0
            || stackDepth > 1000
            || !TRAINING_SOLVER_CONTRACTS.get(gameType)?.has(stackDepth)
            || !VALID_STREETS.includes(street)
            || (position && !POSITION_SET.has(position))) {
            return res.status(400).json({
                success: false,
                code: 'SOLVER_BROWSE_FILTER_INVALID',
                error: 'One or more solver browse filters are invalid',
            });
        }

        const offset = (page - 1) * limit;
        let query = addProvenanceFilters(
            getSupabase()
                .from('solved_spots_gold')
                .select(SOLVER_ROW_PROJECTION)
                .eq('game_type', gameType)
                .eq('stack_depth', stackDepth)
                .eq('street', street),
        );
        if (position) query = query.eq('strategy_matrix_v2->>position', position);
        const { data, error } = await query
            .order('scenario_hash', { ascending: true })
            .range(offset, offset + limit);

        if (error) {
            console.warn('[BrowseSolutions] Catalog lookup failed:', error.message);
            return res.status(503).json({
                success: false,
                code: 'SOLVER_LOOKUP_UNAVAILABLE',
                error: 'Audited solver catalog is temporarily unavailable',
                retryable: true,
            });
        }

        const queried = data || [];
        const hasMore = queried.length > limit;
        const spots = queried.slice(0, limit).map(listSpot).filter(Boolean);
        return res.status(200).json({
            success: true,
            spots,
            page,
            limit,
            returnedCount: spots.length,
            hasMore,
            total: null,
            totalIsExact: false,
            totalPages: hasMore ? page + 1 : page,
            authority: 'provenance_complete_piosolver_v2_only',
        });
    } catch (error) {
        try { reportApiError(error, req); } catch (reportError) {
            console.warn('[BrowseSolutions] Error reporting failed:', reportError?.message || reportError);
        }
        console.warn('[BrowseSolutions] Unhandled error:', error?.message || error);
        if (!res.headersSent) {
            return res.status(503).json({
                success: false,
                code: 'SOLVER_LOOKUP_UNAVAILABLE',
                error: 'Audited solver lookup is temporarily unavailable',
                retryable: true,
            });
        }
        return undefined;
    }
}
