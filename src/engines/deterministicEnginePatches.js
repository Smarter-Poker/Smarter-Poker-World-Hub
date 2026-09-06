/**
 * DETERMINISTIC ENGINE AUDIT PATCHES — 2026-07-19 (v2 reader flip 2026-07-24)
 * ●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●
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
 *    boards rejected rather than transplanting a strategy from a different
 *    runout.
 * ●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●
 */

import { enforceSolverClaimHonesty } from '../lib/training/solverDecisionEvidence';
import {
    hasUntrustedLegacyFoldChannel,
    inheritSolverMatrixTrust,
    selectTrustedLegacySolverMatrix,
    selectTrustedSolverMatrix,
} from '../lib/training/solverMatrixTrust';

// ●● Hand-class normalization ("AhKs" / ["Ah","Ks"] → "AKs"/"AKo"/"AA") ●●●●
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
// Never trust a JSON field such as `__sanitized` as proof that warehouse data
// passed this process's validator. A legacy artifact can contain arbitrary
// keys. WeakSet membership can only be granted by the live validator/bridge.
const SANITIZED_MATRICES = new WeakSet();

/** Prefer strategy_matrix_v2 (rebuilt PioSOLVER data) when present. Mutates row. */
function preferV2(row) {
    if (row
        && row.strategy_matrix_v2 !== null
        && row.strategy_matrix_v2 !== undefined) {
        const m = selectTrustedSolverMatrix(row);
        // A present v2 payload is the rebuilt pipeline's authoritative
        // export. If it fails the strict bridge, reject the row outright;
        // falling back to v1 would conceal a damaged v2 solve.
        row.strategy_matrix = m;
        if (m) SANITIZED_MATRICES.add(m);
        else row.__invalidV2 = true;
    }
    return row;
}

function stampSolverProvenance(question, row) {
    if (!question || !row) return question;
    const policy = question.solverPolicy;
    const artifact = policy?.sourceArtifact || {};
    // Provenance alone does not make an answer exact. The canonical adapter
    // also requires a complete decision key and an exact state match.
    const verified = policy?.kind === 'exact' && policy?.qualitySeal === 'SOLVER_EXACT';
    question.dataQuality = verified ? 'SOLVER_EXACT' : 'LEGACY_UNVERIFIED';
    question.solverProvenance = {
        verified,
        source: verified ? 'PioSOLVER' : (artifact.system || 'solved_spots_gold_legacy'),
        scenarioHash: artifact.scenarioHash || row.scenario_hash || null,
        solverVersion: artifact.solverVersion || null,
        solverBinaryChecksum: artifact.solverBinaryChecksum || null,
        machineId: artifact.machineId || null,
        pipelineCommit: artifact.pipelineCommit || null,
        manifestVersion: artifact.manifestVersion || null,
        manifestChecksum: artifact.manifestChecksum || null,
        sourceArtifactChecksum: artifact.sourceArtifactChecksum || null,
        qualityStatus: artifact.qualityStatus || null,
        auditedAt: artifact.auditedAt || null,
    };
    if (verified) {
        const mix = (question.options || [])
            .map((option) => {
                const frequency = Number(question?.gtoFrequencies?.[option?.id]);
                return Number.isFinite(frequency)
                    ? `${option.text} ${Math.round(frequency)}%`
                    : null;
            })
            .filter(Boolean)
            .join(', ');
        question.explanation = `Verified ${artifact.solverVersion} export for ${artifact.scenarioHash}. Recorded action frequencies: ${mix}.`;
        question.evidenceDisclosure = 'Provenance-sealed PioSOLVER export; frequencies are exact for this recorded node. Per-action EV is not available.';
    }
    return enforceSolverClaimHonesty(question);
}

/**
 * Sanitize a strategy_matrix IN PLACE (idempotent):
 * for every hand, keep it only if its in-range action values form a credible
 * probability distribution; renormalize; delete non-credible hands entirely.
 */
export function sanitizeStrategyMatrix(matrix) {
    if (!matrix) return matrix;
    // V1 `f` is an EV/regret channel, not a Fold probability. Quarantine the
    // entire legacy matrix rather than renormalizing the remaining channels
    // into a strategy the solver never exported. Check this before the
    // idempotence shortcut so a previously sanitized legacy object cannot be
    // mutated later to smuggle an `f` channel past the boundary. Valid V2
    // matrices carry a process-local trust mark and pass this check.
    if (hasUntrustedLegacyFoldChannel(matrix)
        && !selectTrustedLegacySolverMatrix(matrix)) {
        matrix.actions = [];
        matrix.frequencies = {};
        SANITIZED_MATRICES.add(matrix);
        return matrix;
    }
    if (SANITIZED_MATRICES.has(matrix)) return matrix;
    const actions = matrix.actions || [];
    const frequencies = matrix.frequencies || {};
    if (actions.length === 0) { SANITIZED_MATRICES.add(matrix); return matrix; }

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
        // A near-100% action is only credible when the same hand has no
        // scale-corrupted value on another action. Otherwise dropping the
        // corrupt entry would manufacture a pure strategy that the solver
        // never exported.
        const isPure = !corrupted && maxVal >= 0.98 && (sum - maxVal) <= 0.02;

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

    SANITIZED_MATRICES.add(matrix);
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
    const prunedMatrix = inheritSolverMatrixTrust(matrix, {
        ...matrix,
        frequencies: pruned,
    });
    return {
        ...scenario,
        // The pruned application matrix already came through the V2 bridge.
        // Remove the source payload so the core builder consumes this exact
        // one-hand copy instead of rebuilding the unpruned matrix.
        strategy_matrix_v2: null,
        strategy_matrix: prunedMatrix,
    };
}

export function applyDeterministicEnginePatches(engine) {
    if (!engine || engine.__auditPatches20260719) return engine;
    engine.__auditPatches20260719 = true;

    const originalFetchSolverPool = engine.fetchSolverPool.bind(engine);
    const originalBuild = engine.buildQuestionFromScenario.bind(engine);

    // PATCH 1+2: the base engine now obtains normalized records exclusively
    // through SolverPolicyService. Keep this wrapper as the historical patch
    // seam, but do not create a second warehouse query or interpreter here.
    engine.fetchSolverPool = async function patchedFetchSolverPool(
        gameConfig, level, limit = 25, targetStreet = null, routingParams = {}
    ) {
        return originalFetchSolverPool(gameConfig, level, limit, targetStreet, routingParams);
    };

    // PATCH 3: sanitize, balance answer classes, support forced hands, and
    // attach the same canonical policy envelope returned by every consumer.
    engine.buildQuestionFromScenario = function patchedBuild(
        scenario, gameConfig, level, questionIndex, forcedHand = null
    ) {
        const finalize = (question) => {
            if (!question) return null;
            question.solverPolicy = this.solverPolicyService.consumerEnvelope(
                this.solverPolicyService.answerForEngineQuestion(scenario, question),
                'get-question',
            );
            return stampSolverProvenance(question, scenario);
        };
        try {
            preferV2(scenario);
            if (scenario?.strategy_matrix) sanitizeStrategyMatrix(scenario.strategy_matrix);

            if (forcedHand) {
                const handClass = toHandClass(forcedHand);
                if (!handClass || !matrixHasHand(scenario?.strategy_matrix, handClass)) return null;
                const prunedScenario = pruneScenarioToHand(scenario, handClass);
                return finalize(originalBuild(prunedScenario, gameConfig, level, questionIndex));
            }

            const preferAggressive = questionIndex % 2 === 1;
            let first = null;
            for (const offset of [0, 131, 263, 397]) {
                const q = originalBuild(scenario, gameConfig, level, questionIndex + offset);
                if (!q) continue;
                if (!first) first = q;
                if (isAggressiveAction(q.correctAnswer) === preferAggressive) return finalize(q);
            }
            return finalize(first);
        } catch (err) {
            console.warn('[EnginePatches] buildQuestionFromScenario error:', err.message);
            return null;
        }
    };

    // PATCH 4: multi-street lookup keeps exact board, position, pot, and hand
    // integrity while using the canonical service rather than a route-local
    // warehouse reader. Similar textures are never treated as the same node.
    engine.queryNextStreet = async function patchedQueryNextStreet(
        { gameConfig, heroHand: rawHeroHand, boardCards, street, pot, stackDepth, heroPosition, villainPosition }
    ) {
        if (!gameConfig || !boardCards || boardCards.length < 3) return null;
        // Similar textures are never treated as the same node. The recorded
        // scenario hash must end with the complete requested runout.
        const heroHand = toHandClass(rawHeroHand);
        try {
            const boardStr = boardCards.map(card => String(card).toLowerCase()).join('');
            const { records } = await this.solverPolicyService.listSolvedRecords({
                gameType: gameConfig.pioGameType,
                stackDepth: gameConfig.pioStackDepth,
                street,
                scenarioHashLike: `%${boardStr}`,
                limit: 25,
            });
            for (const record of records) {
                if (!String(record.metadata.scenario_hash || '').toLowerCase().endsWith(boardStr)) continue;
                const matrix = record.matrix || {};
                const solvedHero = String(matrix.position || '').toUpperCase();
                const solvedVillain = solvedHero === String(matrix.oop_player || '').toUpperCase()
                    ? String(matrix.ip_player || '').toUpperCase()
                    : solvedHero === String(matrix.ip_player || '').toUpperCase()
                        ? String(matrix.oop_player || '').toUpperCase()
                        : '';
                const requestedHero = String(heroPosition || '').toUpperCase();
                const requestedVillain = String(villainPosition || '').toUpperCase();
                const requestedPot = Number(pot);
                if (!requestedHero || !requestedVillain
                    || solvedHero !== requestedHero || solvedVillain !== requestedVillain
                    || !Number.isFinite(requestedPot)
                    || Math.abs(Number(matrix.pot_bb) - requestedPot) > 0.05) continue;
                const scenario = this.solverPolicyService.asEngineScenario(record);
                const question = this.buildQuestionFromScenario(
                    scenario, gameConfig, 5, 0, heroHand || null
                );
                if (question) {
                    this._applyNextStreetOverrides(question, {
                        pot, heroPosition, villainPosition, stackDepth,
                    });
                    return question;
                }
            }
            return null;
        } catch (err) {
            console.warn('[EnginePatches] queryNextStreet error:', err.message);
            return null;
        }
    };

    return engine;
}

export default applyDeterministicEnginePatches;
