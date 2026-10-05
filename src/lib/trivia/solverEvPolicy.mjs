/**
 * Trivia solver-EV provenance contract.
 *
 * A numeric value is not EV evidence by itself. Trivia may persist and reveal
 * EV only when the deterministic seeder read a V2 PioSOLVER artifact that is
 * still admitted by both the solver catalog and the active provenance
 * authority. Legacy V1 `hand_evs` values are intentionally outside this
 * contract because their units and meaning are not trustworthy enough to
 * label as big blinds.
 */

export const TRIVIA_SOLVER_EV_CONTRACT = 'trivia-solver-ev/1';
export const TRIVIA_SOLVER_EV_UNIT = 'bb';
export const TRIVIA_SOLVER_EV_SOURCE = 'solved_spots_gold.strategy_matrix_v2.hand_evs_bb';
export const TRIVIA_SOLVER_EV_AGGREGATION = 'live_combo_class_mean';
export const TRIVIA_SOLVER_EV_AUTHORITY = 'training_solver_provenance_authority';
export const TRIVIA_SOLVER_EV_CATALOG = 'training_solver_artifact_catalog';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SHA256_RE = /^[0-9a-f]{64}$/;
const SHA1_RE = /^[0-9a-f]{40}$/;

function record(value) {
    return value && typeof value === 'object' && !Array.isArray(value) ? value : null;
}

function exactText(value, max) {
    if (typeof value !== 'string' || value !== value.trim() || value.length < 1 || value.length > max) {
        return null;
    }
    return value;
}

function exactDigest(value, pattern) {
    const digest = exactText(value, pattern === SHA1_RE ? 40 : 64);
    return digest && pattern.test(digest) && !/^0+$/.test(digest) ? digest : null;
}

function isoTimestamp(value) {
    const date = value instanceof Date ? value : new Date(value);
    return Number.isFinite(date.getTime()) ? date.toISOString() : null;
}

function finiteEv(value) {
    const number = typeof value === 'number' ? value : Number.NaN;
    return Number.isFinite(number) && number >= -1_000_000 && number <= 1_000_000
        ? number
        : null;
}

function canonicalProvenance(raw) {
    const provenance = record(raw);
    if (!provenance
        || provenance.authority !== TRIVIA_SOLVER_EV_AUTHORITY
        || provenance.catalog !== TRIVIA_SOLVER_EV_CATALOG
        || provenance.solver !== 'PioSOLVER'
        || !UUID_RE.test(String(provenance.artifact_id || ''))
        || !exactText(provenance.scenario_hash, 512)
        || !exactText(provenance.solver_version, 120)
        || !exactDigest(provenance.solver_binary_checksum, SHA256_RE)
        || !exactDigest(provenance.pipeline_commit, SHA1_RE)
        || !exactText(provenance.manifest_version, 160)
        || !exactDigest(provenance.manifest_checksum, SHA256_RE)
        || !exactDigest(provenance.source_artifact_checksum, SHA256_RE)
        || !exactDigest(provenance.source_combo_order_sha256, SHA256_RE)
        || !exactDigest(provenance.training_game_contracts_sha256, SHA256_RE)) {
        return null;
    }
    const auditedAt = isoTimestamp(provenance.audited_at);
    if (!auditedAt) return null;
    return Object.freeze({
        authority: TRIVIA_SOLVER_EV_AUTHORITY,
        catalog: TRIVIA_SOLVER_EV_CATALOG,
        artifact_id: String(provenance.artifact_id).toLowerCase(),
        scenario_hash: provenance.scenario_hash,
        solver: 'PioSOLVER',
        solver_version: provenance.solver_version,
        solver_binary_checksum: provenance.solver_binary_checksum,
        pipeline_commit: provenance.pipeline_commit,
        manifest_version: provenance.manifest_version,
        manifest_checksum: provenance.manifest_checksum,
        source_artifact_checksum: provenance.source_artifact_checksum,
        source_combo_order_sha256: provenance.source_combo_order_sha256,
        training_game_contracts_sha256: provenance.training_game_contracts_sha256,
        audited_at: auditedAt,
    });
}

/**
 * Build persisted EV metadata from a row proven active by the seeder's exact
 * catalog/authority join and the already-validated V2 bridge.
 */
export function createAuthoritativeTriviaSolverEv({ row, matrix, heroHand }) {
    const sourceRow = record(row);
    const bridged = record(matrix);
    const v2 = record(sourceRow?.strategy_matrix_v2);
    if (!sourceRow
        || sourceRow.solver_provenance_active !== true
        || sourceRow.quality_status !== 'validated'
        || !v2
        || bridged?.source !== 'pio_v2'
        || v2.solver !== 'PioSOLVER'
        || typeof heroHand !== 'string'
        || !Object.prototype.hasOwnProperty.call(record(bridged.hand_evs) || {}, heroHand)) {
        return null;
    }

    const value = finiteEv(bridged.hand_evs[heroHand]);
    if (value == null) return null;
    const provenance = canonicalProvenance({
        authority: TRIVIA_SOLVER_EV_AUTHORITY,
        catalog: TRIVIA_SOLVER_EV_CATALOG,
        artifact_id: sourceRow.id,
        scenario_hash: sourceRow.scenario_hash,
        solver: v2.solver,
        solver_version: sourceRow.solver_version,
        solver_binary_checksum: sourceRow.solver_binary_checksum,
        pipeline_commit: sourceRow.pipeline_commit,
        manifest_version: sourceRow.manifest_version,
        manifest_checksum: sourceRow.manifest_checksum,
        source_artifact_checksum: sourceRow.source_artifact_checksum,
        source_combo_order_sha256: v2.source_combo_order_sha256,
        training_game_contracts_sha256: v2.training_game_contracts_sha256,
        audited_at: sourceRow.audited_at,
    });
    if (!provenance) return null;

    return Object.freeze({
        contract: TRIVIA_SOLVER_EV_CONTRACT,
        value,
        unit: TRIVIA_SOLVER_EV_UNIT,
        source: TRIVIA_SOLVER_EV_SOURCE,
        aggregation: TRIVIA_SOLVER_EV_AGGREGATION,
        provenance,
    });
}

/**
 * Revalidate persisted metadata at every server/browser projection boundary.
 * Bare numbers, implicit units, V1 data and incomplete provenance fail closed.
 */
export function sanitizeAuthoritativeTriviaSolverEv(raw) {
    const ev = record(raw);
    if (!ev
        || ev.contract !== TRIVIA_SOLVER_EV_CONTRACT
        || ev.unit !== TRIVIA_SOLVER_EV_UNIT
        || ev.source !== TRIVIA_SOLVER_EV_SOURCE
        || ev.aggregation !== TRIVIA_SOLVER_EV_AGGREGATION) {
        return null;
    }
    const value = finiteEv(ev.value);
    const provenance = canonicalProvenance(ev.provenance);
    if (value == null || !provenance) return null;
    return Object.freeze({
        contract: TRIVIA_SOLVER_EV_CONTRACT,
        value,
        unit: TRIVIA_SOLVER_EV_UNIT,
        source: TRIVIA_SOLVER_EV_SOURCE,
        aggregation: TRIVIA_SOLVER_EV_AGGREGATION,
        provenance,
    });
}
