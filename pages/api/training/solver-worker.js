import { TextDecoder } from 'node:util';

import { applyRateLimit } from '../../../src/lib/apiRateLimit';
import { reportApiError } from '../../../src/lib/sentryWrap';
import { createClient } from '../../../src/lib/supabaseServerClient';
import { parseSolverScenarioHash, SOLVER_POSITIONS } from '../../../src/lib/training/solverRowIdentity.mjs';
import {
    decodeSolverWorkerSecret,
    SOLVER_WORKER_MAX_BODY_BYTES,
    solverWorkerEnvelopeIsValid,
    verifySolverWorkerRequest,
} from '../../../src/lib/training/solverWorkerAuth.mjs';

export const config = { api: { bodyParser: false } };

const WORKER_IDS = new Set(['M1', 'M2']);
const POSITION_SET = new Set(SOLVER_POSITIONS);
const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const HEX_64 = /^[0-9a-f]{64}$/;
const ISO_UTC = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?Z$/;
const MAX_ROW_STATES = 75;
const MAX_ROW_STATE_RESULTS = MAX_ROW_STATES * 2;
const MAX_BOARD_PAGE = 500;
const DB_OPERATION_TIMEOUT_MS = 12_000;
const WORKER_RATE_LIMIT = Object.freeze({ max: 120, windowSeconds: 60 });
const TRAINING_SOLVER_CONTRACTS = Object.freeze({
    hu_cash: Object.freeze([40, 100, 200]),
    mtt_3max_chipev: Object.freeze([20]),
    mtt_6max_chipev: Object.freeze([10, 20, 40, 100]),
    mtt_9max_chipev: Object.freeze([20, 40, 80, 100]),
    mtt_hu_chipev: Object.freeze([40]),
    postflop_complete: Object.freeze([100]),
    spin_3max_chipev: Object.freeze([20, 25]),
    spin_hu_chipev: Object.freeze([10, 20]),
});
const ARTIFACT_KEYS = Object.freeze([
    'audited_at',
    'game_type',
    'id',
    'machine_id',
    'manifest_checksum',
    'manifest_version',
    'pipeline_commit',
    'quality_status',
    'scenario_hash',
    'solved_v2_at',
    'solver_binary_checksum',
    'solver_version',
    'source_artifact_checksum',
    'stack_depth',
    'strategy_matrix_v2',
    'street',
]);
let _supabase = null;
function getSupabase() {
    if (!_supabase) {
        const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
        const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
        if (!url || !key) throw new Error('Solver worker gateway is not configured');
        _supabase = createClient(url, key);
    }
    return _supabase;
}

function firstHeader(req, name) {
    const value = req.headers?.[name];
    return Array.isArray(value) ? value[0] : String(value || '');
}

class RequestBodyError extends Error {
    constructor(message, status = 400) {
        super(message);
        this.status = status;
    }
}

async function readRawBody(req) {
    const declaredLength = Number(firstHeader(req, 'content-length') || 0);
    if (Number.isFinite(declaredLength) && declaredLength > SOLVER_WORKER_MAX_BODY_BYTES) {
        throw new RequestBodyError('Request body is too large', 413);
    }
    // bodyParser is disabled because the HMAC must cover the exact wire bytes.
    // Accept a Buffer only to make server harnesses deterministic; a parsed
    // object is never re-serialized and therefore can never be authenticated.
    if (Buffer.isBuffer(req.body)) {
        if (req.body.length > SOLVER_WORKER_MAX_BODY_BYTES) {
            throw new RequestBodyError('Request body is too large', 413);
        }
        return req.body;
    }
    if (req.body !== undefined && req.body !== null) {
        throw new RequestBodyError('Raw JSON request body required');
    }
    const chunks = [];
    let bytes = 0;
    for await (const chunk of req) {
        const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
        bytes += buffer.length;
        if (bytes > SOLVER_WORKER_MAX_BODY_BYTES) {
            throw new RequestBodyError('Request body is too large', 413);
        }
        chunks.push(buffer);
    }
    return Buffer.concat(chunks);
}

function exactKeys(value, keys) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
    const actual = Object.keys(value);
    return actual.length === keys.length
        && keys.every((key) => Object.prototype.hasOwnProperty.call(value, key));
}

function exactContract(gameType, stackDepth) {
    return TRAINING_SOLVER_CONTRACTS[gameType]?.includes(stackDepth) === true;
}

function artifactPayloadIsValid(payload, worker) {
    const artifact = payload?.artifact;
    if (!exactKeys(payload, ['artifact']) || !exactKeys(artifact, ARTIFACT_KEYS)) return false;
    const parsed = parseSolverScenarioHash(artifact.scenario_hash);
    return UUID_V4.test(artifact.id)
        && parsed.ok
        && parsed.identity.gameType === artifact.game_type
        && parsed.identity.stackDepth === artifact.stack_depth
        && parsed.identity.street === artifact.street
        && exactContract(artifact.game_type, artifact.stack_depth)
        && !String(artifact.game_type).endsWith('_icm')
        && artifact.quality_status === 'validated'
        && artifact.machine_id === worker.machine_id
        && artifact.solver_version === worker.solver_version
        && artifact.solver_binary_checksum === worker.solver_binary_checksum
        && artifact.pipeline_commit === worker.pipeline_commit
        && String(artifact.manifest_version) === worker.manifest_version
        && artifact.manifest_checksum === worker.manifest_checksum
        && HEX_64.test(artifact.source_artifact_checksum)
        && ISO_UTC.test(artifact.solved_v2_at)
        && artifact.audited_at === artifact.solved_v2_at
        && artifact.strategy_matrix_v2
        && typeof artifact.strategy_matrix_v2 === 'object'
        && !Array.isArray(artifact.strategy_matrix_v2);
}

function rowStatesPayloadIsValid(payload) {
    if (!exactKeys(payload, ['scenario_hashes'])
        || !Array.isArray(payload.scenario_hashes)
        || payload.scenario_hashes.length < 1
        || payload.scenario_hashes.length > MAX_ROW_STATES
        || new Set(payload.scenario_hashes).size !== payload.scenario_hashes.length) return false;
    return payload.scenario_hashes.every((hash) => (
        typeof hash === 'string'
        && hash.length <= 512
        && parseSolverScenarioHash(hash).ok
    ));
}

function boardPagePayloadIsValid(payload) {
    if (!exactKeys(payload, [
        'after_scenario', 'game_type', 'limit', 'position', 'stack_depth', 'street',
    ])) return false;
    const prefix = `${payload.game_type}_${payload.position}_${payload.stack_depth}bb_`;
    return exactContract(payload.game_type, payload.stack_depth)
        && payload.street === 'flop'
        && POSITION_SET.has(payload.position)
        && Number.isSafeInteger(payload.limit)
        && payload.limit >= 1
        && payload.limit <= MAX_BOARD_PAGE
        && (payload.after_scenario === null
            || (typeof payload.after_scenario === 'string'
                && payload.after_scenario.startsWith(prefix)
                && parseSolverScenarioHash(payload.after_scenario).ok));
}

function heartbeatPayloadIsValid(payload) {
    if (!exactKeys(payload, ['bad', 'board', 'note', 'phase', 'rows_written', 'spots_done'])) {
        return false;
    }
    return typeof payload.phase === 'string' && payload.phase.length <= 160
        && typeof payload.board === 'string' && payload.board.length <= 10
        && typeof payload.note === 'string' && payload.note.length <= 500
        && ['spots_done', 'rows_written', 'bad'].every((field) => (
            Number.isSafeInteger(payload[field]) && payload[field] >= 0
        ));
}

function operationPayloadIsValid(operation, payload, worker) {
    if (operation === 'ingest_artifact') return artifactPayloadIsValid(payload, worker);
    if (operation === 'row_states') return rowStatesPayloadIsValid(payload);
    if (operation === 'board_page') return boardPagePayloadIsValid(payload);
    if (operation === 'heartbeat') return heartbeatPayloadIsValid(payload);
    return false;
}

function rpcIdentity(worker, nonce, signedAt, bodySha256) {
    return {
        p_machine_id: worker.machine_id,
        p_solver_version: worker.solver_version,
        p_solver_binary_checksum: worker.solver_binary_checksum,
        p_pipeline_commit: worker.pipeline_commit,
        p_manifest_version: worker.manifest_version,
        p_manifest_checksum: worker.manifest_checksum,
        p_nonce: nonce,
        p_signed_at: signedAt,
        p_body_sha256: bodySha256,
    };
}

async function executeBoundedDatabaseOperation(query) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), DB_OPERATION_TIMEOUT_MS);
    try {
        if (typeof query?.abortSignal !== 'function') {
            throw new Error('Solver worker database request does not support cancellation');
        }
        return await query.abortSignal(controller.signal);
    } finally {
        clearTimeout(timeout);
    }
}

async function enforceDurableWorkerRateLimit(supabase, res, workerId) {
    const { data, error } = await executeBoundedDatabaseOperation(supabase.rpc(
        'check_rate_limit_strict',
        {
            p_key: `training:solver-worker:${workerId}`,
            p_limit: WORKER_RATE_LIMIT.max,
            p_window_seconds: WORKER_RATE_LIMIT.windowSeconds,
        },
    ));
    if (error) throw error;
    if (data !== true) {
        res.setHeader('Retry-After', String(WORKER_RATE_LIMIT.windowSeconds));
        res.status(429).json({
            success: false,
            error: 'Too many requests',
            retryAfter: WORKER_RATE_LIMIT.windowSeconds,
        });
        return false;
    }
    return true;
}

async function claimRequest(supabase, envelope, identity) {
    const query = supabase.rpc('training_claim_solver_worker_request_v1', {
        ...rpcIdentity(envelope.worker, identity.nonce, identity.signedAt, identity.bodySha256),
        p_operation: envelope.operation,
    });
    const { data, error } = await executeBoundedDatabaseOperation(query);
    if (error) throw error;
    return data === true;
}

async function ingestArtifact(supabase, envelope, identity) {
    const artifact = envelope.payload.artifact;
    const query = supabase.rpc('training_ingest_solver_artifact_v1', {
        ...rpcIdentity(envelope.worker, identity.nonce, identity.signedAt, identity.bodySha256),
        p_artifact: artifact,
    });
    const { data, error } = await executeBoundedDatabaseOperation(query);
    if (error) throw error;
    const result = Array.isArray(data) ? data[0] : data;
    if (!result || result.artifact_id !== artifact.id
        || result.scenario_hash !== artifact.scenario_hash
        || result.source_artifact_checksum !== artifact.source_artifact_checksum) {
        throw new Error('Solver artifact ingestion returned an invalid receipt');
    }
    return result;
}

async function rowStates(supabase, payload, worker) {
    const query = supabase.rpc('training_solver_worker_row_states_v2', {
        p_machine_id: worker.machine_id,
        p_solver_version: worker.solver_version,
        p_solver_binary_checksum: worker.solver_binary_checksum,
        p_pipeline_commit: worker.pipeline_commit,
        p_manifest_version: worker.manifest_version,
        p_manifest_checksum: worker.manifest_checksum,
        p_scenario_hashes: payload.scenario_hashes,
    });
    const { data, error } = await executeBoundedDatabaseOperation(query);
    if (error) throw error;
    const requested = new Set(payload.scenario_hashes);
    if (!Array.isArray(data) || data.length > MAX_ROW_STATE_RESULTS
        || data.some((row) => {
            const parsed = parseSolverScenarioHash(row?.scenario_hash);
            const persistedNode = row?.node;
            const persistedPosition = row?.hero_position;
            const admissionMode = row?.admission_mode;
            const targetRole = row?.canary_target_role;
            const authorizedNode = row?.authorized_node;
            const authorizedPosition = row?.authorized_hero_position;
            return !UUID_V4.test(String(row?.id || ''))
                || !requested.has(row?.scenario_hash)
                || !parsed.ok
                || parsed.identity.gameType !== row?.game_type
                || parsed.identity.stackDepth !== row?.stack_depth
                || parsed.identity.street !== row?.street
                || typeof row?.admitted !== 'boolean'
                || !Object.prototype.hasOwnProperty.call(row, 'node')
                || !Object.prototype.hasOwnProperty.call(row, 'hero_position')
                || !Object.prototype.hasOwnProperty.call(row, 'admission_mode')
                || !Object.prototype.hasOwnProperty.call(row, 'partition_count')
                || !Object.prototype.hasOwnProperty.call(row, 'partition_index')
                || !Object.prototype.hasOwnProperty.call(row, 'canary_target_role')
                || !Object.prototype.hasOwnProperty.call(row, 'authorized_node')
                || !Object.prototype.hasOwnProperty.call(row, 'authorized_hero_position')
                || typeof row?.canary_authorized !== 'boolean'
                || (persistedNode !== null
                    && (typeof persistedNode !== 'string'
                        || persistedNode.length < 3
                        || persistedNode.length > 4096))
                || (persistedPosition !== null && !POSITION_SET.has(persistedPosition))
                || (row.admitted
                    && (persistedNode === null || persistedPosition === null))
                || ![null, 'held', 'backlog', 'bounded_canary'].includes(admissionMode)
                || (row.partition_count !== null
                    && (!Number.isSafeInteger(row.partition_count)
                        || row.partition_count < 1))
                || (row.partition_index !== null
                    && (!Number.isSafeInteger(row.partition_index)
                        || row.partition_index < 0))
                || ![null, 'parent', 'child'].includes(targetRole)
                || (authorizedNode !== null
                    && (typeof authorizedNode !== 'string'
                        || authorizedNode.length < 3
                        || authorizedNode.length > 4096))
                || (authorizedPosition !== null
                    && !POSITION_SET.has(authorizedPosition))
                || (row.canary_authorized && (
                    admissionMode !== 'bounded_canary'
                    || row.partition_count !== 2
                    || row.partition_index !== (worker.machine_id === 'M1' ? 0 : 1)
                    || targetRole === null
                    || authorizedNode === null
                    || authorizedPosition === null
                ));
        })) {
        throw new Error('Solver row-state query returned an invalid result');
    }
    return data;
}

async function boardPage(supabase, payload) {
    const prefix = `${payload.game_type}_${payload.position}_${payload.stack_depth}bb_`;
    // The worker must use this bounded RPC even while a temporary read-only
    // service grant exists for protected migration-first rollback. It enforces
    // the exact family/street/prefix/keyset contract against the required
    // physical btree in one database statement and permits no raw writes.
    const query = supabase.rpc('training_solver_worker_board_page_v1', {
        p_game_type: payload.game_type,
        p_stack_depth: payload.stack_depth,
        p_street: payload.street,
        p_position: payload.position,
        p_after_scenario: payload.after_scenario,
        p_limit: payload.limit,
    });
    const { data, error } = await executeBoundedDatabaseOperation(query);
    if (error) throw error;
    if (!Array.isArray(data) || data.length > payload.limit
        || data.some((row, index) => (
            typeof row?.scenario_hash !== 'string'
            || !row.scenario_hash.startsWith(prefix)
            || (index > 0 && row.scenario_hash <= data[index - 1].scenario_hash)
        ))) throw new Error('Solver board-page query returned an invalid result');
    return data.map((row) => row.scenario_hash);
}

async function heartbeat(supabase, workerId, payload) {
    const query = supabase.from('solver_status').upsert({
        machine_id: workerId,
        phase: payload.phase,
        board: payload.board,
        spots_done: payload.spots_done,
        rows_written: payload.rows_written,
        bad: payload.bad,
        note: payload.note,
        updated_at: new Date().toISOString(),
    }, { onConflict: 'machine_id' });
    const { error } = await executeBoundedDatabaseOperation(query);
    if (error) throw error;
}

export default async function handler(req, res) {
    try {
        res.setHeader('Cache-Control', 'private, no-store, max-age=0');
        if (!applyRateLimit(req, res, { max: 180, windowMs: 60_000, scope: ':solver-worker' })) {
            return;
        }
        if (req.method !== 'POST') {
            return res.status(405).json({ success: false, error: 'Method not allowed' });
        }
        if (firstHeader(req, 'content-encoding')
            && firstHeader(req, 'content-encoding').toLowerCase() !== 'identity') {
            return res.status(415).json({ success: false, error: 'Content encoding is not supported' });
        }
        if (!/^application\/json(?:\s*;\s*charset=(?:utf-8|"utf-8"))?$/i
            .test(firstHeader(req, 'content-type').trim())) {
            return res.status(415).json({ success: false, error: 'JSON content type required' });
        }

        const workerId = firstHeader(req, 'x-sp-solver-worker').toUpperCase();
        const timestamp = firstHeader(req, 'x-sp-solver-timestamp');
        const nonce = firstHeader(req, 'x-sp-solver-nonce').toLowerCase();
        const bodySha256 = firstHeader(req, 'x-sp-solver-content-sha256').toLowerCase();
        const signature = firstHeader(req, 'x-sp-solver-signature').toLowerCase();
        if (!WORKER_IDS.has(workerId)) {
            return res.status(401).json({ success: false, error: 'Invalid solver worker request' });
        }
        const secret = decodeSolverWorkerSecret(workerId);
        if (!secret) {
            return res.status(503).json({ success: false, error: 'Solver worker gateway is unavailable' });
        }
        const rawBody = await readRawBody(req);
        if (!verifySolverWorkerRequest({
            workerId,
            timestamp,
            nonce,
            bodySha256,
            signature,
            rawBody,
            secret,
        })) {
            return res.status(401).json({ success: false, error: 'Invalid solver worker request' });
        }

        let envelope;
        try {
            envelope = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(rawBody));
        } catch {
            return res.status(400).json({ success: false, error: 'Invalid JSON request body' });
        }
        if (!solverWorkerEnvelopeIsValid(envelope, workerId)
            || !operationPayloadIsValid(envelope.operation, envelope.payload, envelope.worker)) {
            return res.status(400).json({ success: false, error: 'Invalid solver worker payload' });
        }

        const supabase = getSupabase();
        if (!await enforceDurableWorkerRateLimit(supabase, res, workerId)) return;
        const identity = {
            nonce,
            signedAt: new Date(Number(timestamp) * 1000).toISOString(),
            bodySha256,
        };

        if (envelope.operation === 'ingest_artifact') {
            const receipt = await ingestArtifact(supabase, envelope, identity);
            return res.status(200).json({ success: true, operation: envelope.operation, receipt });
        }
        if (!await claimRequest(supabase, envelope, identity)) {
            return res.status(409).json({ success: false, error: 'Solver worker nonce already consumed' });
        }
        if (envelope.operation === 'row_states') {
            const rows = await rowStates(supabase, envelope.payload, envelope.worker);
            return res.status(200).json({ success: true, operation: envelope.operation, rows });
        }
        if (envelope.operation === 'board_page') {
            const scenarioHashes = await boardPage(supabase, envelope.payload);
            return res.status(200).json({
                success: true,
                operation: envelope.operation,
                scenario_hashes: scenarioHashes,
            });
        }
        await heartbeat(supabase, workerId, envelope.payload);
        return res.status(200).json({ success: true, operation: envelope.operation });
    } catch (error) {
        if (error instanceof RequestBodyError) {
            return res.status(error.status).json({ success: false, error: error.message });
        }
        try { reportApiError(error, req); } catch { /* reporting must not replace the response */ }
        console.warn('[SolverWorker] Request failed:', error?.message || error);
        if (!res.headersSent) {
            return res.status(503).json({ success: false, error: 'Solver worker request unavailable' });
        }
        return undefined;
    }
}
