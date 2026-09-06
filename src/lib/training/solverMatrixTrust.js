/**
 * Solver matrix trust boundary.
 *
 * `solved_spots_gold.strategy_matrix` is the legacy V1 payload. Its compact
 * `f` channel was measured as EV/regret data in the live corpus, not a Fold
 * probability. Any policy surface that translates that channel into a poker
 * action teaches a fabricated strategy. V1 rows carrying `f` therefore fail
 * closed as a whole; dropping only that channel would manufacture a
 * conditional distribution from incomplete data.
 *
 * `strategy_matrix_v2` is different: it is validated by the strict 1,326-combo
 * bridge, and `f` is a legitimate action code there. Selection must remain
 * source-aware so a corrupt V2 payload can never fall back to V1.
 */

import { v2ToAppMatrix } from '../../utils/v2Matrix.js';

const UNTRUSTED_V1_FOLD_CODES = new Set(['f', 'fold']);
const TRUSTED_V2_BRIDGES = new WeakSet();
const V2_BRIDGE_CACHE = new WeakMap();

function actionCode(action) {
    if (typeof action === 'string') return action.trim().toLowerCase();
    if (!action || typeof action !== 'object') return '';
    const value = action.code ?? action.id ?? action.action;
    return typeof value === 'string' ? value.trim().toLowerCase() : '';
}

/** True when a legacy V1 matrix exposes a channel that could be mislabeled Fold. */
export function hasUntrustedLegacyFoldChannel(matrix) {
    if (!matrix || typeof matrix !== 'object' || Array.isArray(matrix)) return false;

    const actions = Array.isArray(matrix.actions) ? matrix.actions : [];
    if (actions.some((action) => UNTRUSTED_V1_FOLD_CODES.has(actionCode(action)))) {
        return true;
    }

    const frequencies = matrix.frequencies;
    if (!frequencies || typeof frequencies !== 'object' || Array.isArray(frequencies)) {
        return false;
    }
    return Object.keys(frequencies).some((key) => (
        UNTRUSTED_V1_FOLD_CODES.has(String(key).trim().toLowerCase())
    ));
}

/** Return a legacy matrix only when it cannot reinterpret V1 `f` as Fold. */
export function selectTrustedLegacySolverMatrix(matrix) {
    if (!matrix || typeof matrix !== 'object' || Array.isArray(matrix)) return null;
    if (TRUSTED_V2_BRIDGES.has(matrix)) return matrix;
    return hasUntrustedLegacyFoldChannel(matrix) ? null : matrix;
}

/** Preserve process-local V2 trust when a caller makes a constrained copy. */
export function inheritSolverMatrixTrust(source, target) {
    if (source && target && TRUSTED_V2_BRIDGES.has(source)) {
        TRUSTED_V2_BRIDGES.add(target);
    }
    return target;
}

/**
 * Select one matrix from a solved_spots_gold row.
 *
 * A present V2 artifact is authoritative: bridge success returns its validated
 * application shape; bridge failure returns null and never falls back to V1.
 */
export function selectTrustedSolverMatrix(row) {
    if (!row || typeof row !== 'object' || Array.isArray(row)) return null;
    if (row.strategy_matrix_v2 !== null && row.strategy_matrix_v2 !== undefined) {
        const source = row.strategy_matrix_v2;
        if (source && typeof source === 'object' && V2_BRIDGE_CACHE.has(source)) {
            return V2_BRIDGE_CACHE.get(source);
        }
        const bridged = v2ToAppMatrix(source);
        if (bridged) TRUSTED_V2_BRIDGES.add(bridged);
        if (source && typeof source === 'object') V2_BRIDGE_CACHE.set(source, bridged);
        return bridged;
    }
    return selectTrustedLegacySolverMatrix(row.strategy_matrix);
}
