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
import { isSolverRowIdentityValid } from '../lib/training/solverRowIdentity.mjs';
import {
    hasUntrustedLegacyFoldChannel,
    inheritSolverMatrixTrust,
    selectTrustedLegacySolverMatrix,
    selectTrustedSolverMatrix,
} from '../lib/training/solverMatrixTrust';

const CONTINUATION_QUERY_CHUNK_SIZE = 12;
const MAX_CONTINUATION_RUNOUTS = 47;
const CONTINUATION_BOARD_CARD_RE = /^[2-9TJQKA][cdhs]$/;

function exactContinuationScenarioHash(street, gameType, heroPosition, stackDepth, boardCards) {
    const prefix = street === 'flop' ? '' : `${street}_`;
    return `${prefix}${gameType}_${heroPosition}_${stackDepth}bb_${boardCards.join('')}`;
}

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

/** Validate and bridge strategy_matrix_v2. Mutates the private server row. */
export function prepareSolverScenarioRow(row) {
    if (row && row.strategy_matrix_v2) {
        if (!isSolverRowIdentityValid(row)) {
            row.strategy_matrix = null;
            row.__invalidV2 = true;
            return null;
        }
        const m = selectTrustedSolverMatrix(row);
        // A present v2 payload is the rebuilt pipeline's authoritative
        // export. If it fails the strict bridge, reject the row outright;
        // falling back to v1 would conceal a damaged v2 solve.
        row.strategy_matrix = m;
        if (m) SANITIZED_MATRICES.add(m);
        else row.__invalidV2 = true;
    }
    return row?.__invalidV2 ? null : row;
}

function provenanceIsComplete(row) {
    const v2 = row?.strategy_matrix_v2;
    const rootPotBb = Number(v2?.pot_bb);
    const effectiveStackBb = Number(v2?.eff_stack_bb);
    return Boolean(
        v2
        && isSolverRowIdentityValid(row)
        && Number.isFinite(rootPotBb)
        && rootPotBb > 0
        && Number.isFinite(effectiveStackBb)
        && effectiveStackBb > 0
        && effectiveStackBb <= Number(row?.stack_depth)
        && /^\d+(?:\.\d+)?(?: \d+(?:\.\d+)?){3}$/.test(String(v2?.rake || ''))
        && /^[a-z0-9]+(?:_[a-z0-9]+)*$/.test(String(v2?.tree_geometry || ''))
        && v2?.solver === 'PioSOLVER'
        && row?.quality_status === 'validated'
        && row?.solver_version
        && /^[0-9a-f]{64}$/i.test(String(row?.solver_binary_checksum || ''))
        && ['M1', 'M2'].includes(String(row?.machine_id || ''))
        && /^[0-9a-f]{40}$/i.test(String(row?.pipeline_commit || ''))
        && row?.manifest_version
        && /^[0-9a-f]{64}$/i.test(String(row?.manifest_checksum || ''))
        && /^[0-9a-f]{64}$/i.test(String(row?.source_artifact_checksum || ''))
        && row?.audited_at
    );
}

function rowMatchesContinuationLineage(row, lineage) {
    const v2 = row?.strategy_matrix_v2 || {};
    const release = lineage?.release || {};
    return Boolean(
        lineage
        && provenanceIsComplete(row)
        && row.scenario_hash === lineage.childScenarioHash
        && row.street === lineage.childStreet
        && row.game_type === lineage.gameType
        && row.stack_depth === lineage.solverStackDepth
        && v2.node === lineage.childNode
        && (Array.isArray(v2.board) ? v2.board.join('') : v2.board) === lineage.boardCards.join('')
        && v2.position === lineage.heroPosition
        && v2.oop_player === lineage.villainPosition
        && v2.ip_player === lineage.heroPosition
        && Number(v2.pot_bb) === Number(release.rootPotBb)
        && Number(v2.eff_stack_bb) === Number(release.effectiveStackBb)
        && v2.rake === release.rake
        && v2.tree_geometry === release.treeGeometry
        && row.solver_version === release.solverVersion
        && row.solver_binary_checksum === release.solverBinaryChecksum
        && row.pipeline_commit === release.pipelineCommit
        && String(row.manifest_version) === String(release.manifestVersion)
        && row.manifest_checksum === release.manifestChecksum
    );
}

/**
 * Return usable candidates in deterministic runout order. Missing, damaged,
 * or duplicate rows for an earlier card do not make a later exact card
 * unreachable; only a unique identity-preserving child is eligible.
 */
export function orderedExactContinuationCandidates(rows, lineages) {
    if (!Array.isArray(rows) || !Array.isArray(lineages)) return [];
    const candidates = [];
    for (const lineage of lineages) {
        const exactRows = rows.filter((row) => rowMatchesContinuationLineage(row, lineage));
        if (exactRows.length === 1) candidates.push({ lineage, row: exactRows[0] });
    }
    return candidates;
}

function stampSolverProvenance(question, row) {
    if (!question || !row) return question;
    const verified = provenanceIsComplete(row);
    const authoredContext = row?.strategy_matrix_v2?.training_context;
    const authoredActionScenario = ['SRP', '3BP', '4BP'].includes(
        String(authoredContext?.action_scenario || '').toUpperCase(),
    ) ? String(authoredContext.action_scenario).toUpperCase() : null;
    const authoredSpotType = ['cbet', 'checkraise', 'facing_bet', 'probe', 'donk'].includes(
        String(authoredContext?.spot_type || '').toLowerCase(),
    ) ? String(authoredContext.spot_type).toLowerCase() : null;
    const exactFacingBet = question?.scenario?.nodeType === 'hero_faces_bet'
        && Number(question?.scenario?.villainBet) > 0;
    question.scenario = {
        ...(question.scenario || {}),
        // Custom-filter labels may only come from fields inside the checksummed
        // v2 artifact. Facing-bet is the one exception that can be derived
        // exactly from the reconstructed node and wager geometry. Never use
        // the legacy scenario-hash prose inference for a solver-exact filter.
        solverSelectionContext: {
            actionScenario: authoredActionScenario,
            spotType: authoredSpotType || (exactFacingBet ? 'facing_bet' : null),
            source: authoredActionScenario || authoredSpotType
                ? 'strategy_matrix_v2.training_context'
                : exactFacingBet ? 'reconstructed_solver_node' : null,
        },
        // Parent/child linkage must bind to one tree, not merely to a hash
        // whose relational columns happen to match. Scenario hashes omit the
        // root pot, effective stack, rake, and tree template.
        solverLineage: verified ? {
            rootPotBb: Number(row.strategy_matrix_v2.pot_bb),
            effectiveStackBb: Number(row.strategy_matrix_v2.eff_stack_bb),
            rake: row.strategy_matrix_v2.rake,
            treeGeometry: row.strategy_matrix_v2.tree_geometry,
            oopPosition: row.strategy_matrix_v2.oop_player,
            ipPosition: row.strategy_matrix_v2.ip_player,
        } : null,
    };
    question.dataQuality = verified ? 'SOLVER_EXACT' : 'LEGACY_UNVERIFIED';
    question.solverProvenance = {
        verified,
        source: verified ? 'PioSOLVER' : 'solved_spots_gold_legacy',
        scenarioHash: row.scenario_hash || null,
        solverVersion: row.solver_version || null,
        solverBinaryChecksum: row.solver_binary_checksum || null,
        machineId: row.machine_id || null,
        pipelineCommit: row.pipeline_commit || null,
        manifestVersion: row.manifest_version || null,
        manifestChecksum: row.manifest_checksum || null,
        sourceArtifactChecksum: row.source_artifact_checksum || null,
        qualityStatus: row.quality_status || null,
        auditedAt: row.audited_at || null,
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
        question.explanation = `Verified ${row.solver_version} export for ${row.scenario_hash}. Recorded action frequencies: ${mix}.`;
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
    // The legacy V1 `f` channel stores EV/regret data, not Fold frequency.
    // Only a matrix carrying the process-local trust mark from the validated
    // V2 bridge may expose it as an action.
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
        // Force the core builder to consume the exact one-hand trusted copy,
        // rather than reconstructing the unpruned V2 source payload.
        strategy_matrix_v2: null,
        strategy_matrix: prunedMatrix,
    };
}

export function applyDeterministicEnginePatches(engine) {
    if (!engine || engine.__auditPatches20260719) return engine;
    engine.__auditPatches20260719 = true;

    const originalBuild = engine.buildQuestionFromScenario.bind(engine);

    // ●● PATCH 1+2: street-null guard + v2 preference + matrix sanitization ●●
    engine.fetchSolverPool = async function patchedFetchSolverPool(
        gameConfig, level, limit = 25, targetStreet = null, routingParams = {}
    ) {
        try {
            const street = targetStreet || this.getStreetForLevel(level);
            const { stackDepths, spotTypes } = routingParams || {};
            const effectiveStackDepths = (stackDepths && stackDepths.length > 0)
                ? stackDepths
                : [gameConfig.pioStackDepth];
            const fetchLimit = Math.min(limit * 4, 500);

            let allData = [];
            for (const depth of effectiveStackDepths) {
                const run = () => {
                    let q = this.db
                        .from('solved_spots_gold')
                        .select('id, scenario_hash, street, stack_depth, game_type, strategy_matrix_v2, solver_version, solver_binary_checksum, machine_id, pipeline_commit, manifest_version, manifest_checksum, source_artifact_checksum, quality_status, audited_at')
                        .eq('game_type', gameConfig.pioGameType)
                        .eq('stack_depth', depth)
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
                    if (street) q = q.eq('street', street); // FIX: never .eq('street', null)
                    return q.limit(Math.ceil(fetchLimit / effectiveStackDepths.length));
                };
                const { data, error } = await run();
                if (!error && data && data.length > 0) allData = allData.concat(data);
            }

            if (allData.length === 0) return null;

            if (spotTypes && spotTypes.length > 0) {
                // (^|_) anchors: \b never matches inside underscore-delimited
                // scenario hashes ('_' is a word character), so the \b versions
                // silently matched nothing.
                const spotTypePatterns = {
                    'rfi': /(^|_)(rfi|open|raise_first)(_|$)/i,
                    'vs3bet': /(^|_)(vs_?3bet|facing_?3bet|3bet_def|3b)(_|$)/i,
                    'bb_defense': /(^|_)(bb_def|bb_vs|big_blind)(_|$)/i,
                    'cold_call': /(^|_)(cold_call|flat|overcall)(_|$)/i,
                    '4bet': /(^|_)(4bet|four_bet|4b)(_|$)/i,
                    'squeeze': /(^|_)(squeeze|sqz)(_|$)/i,
                    'cbet': /(^|_)(cbet|c_?bet|flop_bet)(_|$)/i,
                    'turn_barrel': /(^|_)(barrel|turn_bet|double_barrel)(_|$)/i,
                    'river_bluff': /(^|_)(river|bluff|triple_barrel)(_|$)/i,
                    'check_raise': /(^|_)(check_?raise|xr)(_|$)/i,
                    'turn_probe': /(^|_)(probe|turn_lead)(_|$)/i,
                    'river_value': /(^|_)(river_value|thin_value|value_bet)(_|$)/i,
                };
                const patterns = spotTypes.map(st => spotTypePatterns[st]).filter(Boolean);
                if (patterns.length > 0) {
                    const filtered = allData.filter(row =>
                        patterns.some(p => p.test((row.scenario_hash || '').toLowerCase()))
                    );
                    // A requested subject is a content contract, not a ranking
                    // hint. Falling through to the full pool taught unrelated
                    // spots under the requested game's title.
                    if (filtered.length === 0) return null;
                    allData = filtered;
                }
            }

            // Prefer rebuilt v2 data, then sanitize; drop rows with no credible hands
            allData = allData.map(row => prepareSolverScenarioRow(row)).filter(Boolean);
            allData.forEach(row => sanitizeStrategyMatrix(row.strategy_matrix));
            allData = allData.filter(row => {
                const f = row.strategy_matrix?.frequencies || {};
                return (row.strategy_matrix?.actions || []).some(
                    a => f[a] && Object.keys(f[a]).length > 0
                );
            });
            if (allData.length === 0) return null;

            const shuffled = [...allData];
            for (let i = shuffled.length - 1; i > 0; i--) {
                const j = Math.floor(Math.random() * (i + 1));
                [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
            }
            return shuffled.slice(0, limit);
        } catch (err) {
            console.warn('[EnginePatches] fetchSolverPool error:', err.message);
            return null;
        }
    };

    // ●● PATCH 3: sanitize + answer-class balance + forcedHand support ●●
    engine.buildQuestionFromScenario = function patchedBuild(
        scenario, gameConfig, level, questionIndex, forcedHand = null
    ) {
        try {
            // Callers such as Custom Training already own a bounded, exact
            // warehouse query and therefore hand rows directly to the
            // builder instead of going through fetchSolverPool().  The v2
            // bridge must live at both boundaries or those callers silently
            // read the legacy payload while the standard trainer reads v2.
            prepareSolverScenarioRow(scenario);
            if (scenario?.__invalidV2) return null;
            if (scenario?.strategy_matrix) sanitizeStrategyMatrix(scenario.strategy_matrix);

            if (forcedHand) {
                const handClass = toHandClass(forcedHand);
                if (!handClass || !matrixHasHand(scenario?.strategy_matrix, handClass)) return null;
                const prunedScenario = pruneScenarioToHand(scenario, handClass);
                return stampSolverProvenance(
                    originalBuild(prunedScenario, gameConfig, level, questionIndex),
                    scenario,
                );
            }

            // Alternate the preferred answer class across questionIndex so no
            // single action dominates the answer key (bounded retries — each
            // offset re-seeds the internal hand pick).
            const preferAggressive = questionIndex % 2 === 1;
            let first = null;
            for (const offset of [0, 131, 263, 397]) {
                const q = originalBuild(scenario, gameConfig, level, questionIndex + offset);
                if (!q) continue;
                if (!first) first = q;
                if (isAggressiveAction(q.correctAnswer) === preferAggressive) {
                    return stampSolverProvenance(q, scenario);
                }
            }
            return stampSolverProvenance(first, scenario);
        } catch (err) {
            console.warn('[EnginePatches] buildQuestionFromScenario error:', err.message);
            return null;
        }
    };

    // ●● PATCH 4: exact multi-street parent/action/child lineage ●●
    engine.queryNextStreet = async function patchedQueryNextStreet(
        {
            gameConfig,
            heroHand: rawHeroHand,
            street,
            stackDepth,
            heroPosition,
            villainPosition,
            continuationLineages,
        }
    ) {
        if (!gameConfig || !Array.isArray(continuationLineages)
            || continuationLineages.length === 0
            || continuationLineages.length > MAX_CONTINUATION_RUNOUTS) return null;
        const heroHand = toHandClass(rawHeroHand);
        try {
            const requestedHero = String(heroPosition || '').toUpperCase();
            const requestedVillain = String(villainPosition || '').toUpperCase();
            const requestedStack = Number(stackDepth);
            const release = continuationLineages[0]?.release || {};
            const firstLineage = continuationLineages[0] || {};
            const expectedBoardCount = street === 'turn' ? 4 : street === 'river' ? 5 : 0;
            const expectedParentStreet = street === 'turn' ? 'flop' : 'turn';
            const sameRelease = (candidateRelease) => Boolean(
                candidateRelease?.solverVersion === release.solverVersion
                && candidateRelease?.solverBinaryChecksum === release.solverBinaryChecksum
                && candidateRelease?.pipelineCommit === release.pipelineCommit
                && String(candidateRelease?.manifestVersion) === String(release.manifestVersion)
                && candidateRelease?.manifestChecksum === release.manifestChecksum
                && Number(candidateRelease?.rootPotBb) === Number(release.rootPotBb)
                && Number(candidateRelease?.effectiveStackBb) === Number(release.effectiveStackBb)
                && candidateRelease?.rake === release.rake
                && candidateRelease?.treeGeometry === release.treeGeometry
                && candidateRelease?.ipPosition === release.ipPosition
                && candidateRelease?.oopPosition === release.oopPosition
            );
            const exactCommonContract = Boolean(
                heroHand
                && ['turn', 'river'].includes(String(street || '').toLowerCase())
                && requestedHero
                && requestedVillain
                && requestedHero !== requestedVillain
                && Number.isSafeInteger(requestedStack)
                && requestedStack > 0
                && requestedStack === Number(gameConfig.pioStackDepth)
                && release.solverVersion
                && /^[0-9a-f]{64}$/i.test(String(release.solverBinaryChecksum || ''))
                && /^[0-9a-f]{40}$/i.test(String(release.pipelineCommit || ''))
                && release.manifestVersion
                && /^[0-9a-f]{64}$/i.test(String(release.manifestChecksum || ''))
                && Number.isFinite(Number(release.rootPotBb))
                && Number(release.rootPotBb) > 0
                && Number.isFinite(Number(release.effectiveStackBb))
                && Number(release.effectiveStackBb) > 0
                && Number(release.effectiveStackBb) <= requestedStack
                && /^\d+(?:\.\d+)?(?: \d+(?:\.\d+)?){3}$/.test(String(release.rake || ''))
                && /^[a-z0-9]+(?:_[a-z0-9]+)*$/.test(String(release.treeGeometry || ''))
                && release.ipPosition === requestedHero
                && release.oopPosition === requestedVillain
            );
            const exactCandidateContract = exactCommonContract && continuationLineages.every((lineage) => {
                const candidateCards = Array.isArray(lineage?.boardCards) ? lineage.boardCards : [];
                const parentBoard = candidateCards.slice(0, -1);
                return lineage?.gameType === gameConfig.pioGameType
                    && lineage?.childStreet === street
                    && candidateCards.length === expectedBoardCount
                    && candidateCards.every((card) => CONTINUATION_BOARD_CARD_RE.test(card))
                    && new Set(candidateCards).size === candidateCards.length
                    && lineage?.heroPosition === requestedHero
                    && lineage?.villainPosition === requestedVillain
                    && lineage?.solverStackDepth === requestedStack
                    && lineage?.parentScenarioHash === firstLineage.parentScenarioHash
                    && lineage?.parentNode === firstLineage.parentNode
                    && lineage?.continuationAction === firstLineage.continuationAction
                    && lineage?.parentScenarioHash === exactContinuationScenarioHash(
                        expectedParentStreet,
                        gameConfig.pioGameType,
                        requestedHero,
                        requestedStack,
                        parentBoard,
                    )
                    && typeof lineage?.parentNode === 'string'
                    && /^b[1-9]\d*$/.test(String(lineage?.continuationAction || ''))
                    && lineage?.childScenarioHash === exactContinuationScenarioHash(
                        street,
                        gameConfig.pioGameType,
                        requestedHero,
                        requestedStack,
                        candidateCards,
                    )
                    && typeof lineage?.childNode === 'string'
                    && lineage.childNode === `${lineage.parentNode}:${lineage.continuationAction}:c:${lineage.boardCards.at(-1)}:c`
                    && sameRelease(lineage.release);
            });
            const uniqueCandidateIdentities = new Set(
                continuationLineages.map(({ childScenarioHash, childNode }) => `${childScenarioHash}\u0000${childNode}`),
            );
            if (!exactCandidateContract
                || uniqueCandidateIdentities.size !== continuationLineages.length) return null;

            const data = [];
            for (let start = 0; start < continuationLineages.length; start += CONTINUATION_QUERY_CHUNK_SIZE) {
                const lineageChunk = continuationLineages.slice(
                    start,
                    start + CONTINUATION_QUERY_CHUNK_SIZE,
                );
                const result = await this.db
                    .from('solved_spots_gold')
                    .select('id, scenario_hash, street, stack_depth, game_type, strategy_matrix_v2, solver_version, solver_binary_checksum, machine_id, pipeline_commit, manifest_version, manifest_checksum, source_artifact_checksum, quality_status, audited_at')
                    .in('scenario_hash', lineageChunk.map(({ childScenarioHash }) => childScenarioHash))
                    .eq('game_type', gameConfig.pioGameType)
                    .eq('stack_depth', requestedStack)
                    .eq('street', street)
                    .in('strategy_matrix_v2->>node', lineageChunk.map(({ childNode }) => childNode))
                    .in('strategy_matrix_v2->>board', lineageChunk.map(({ boardCards }) => boardCards.join('')))
                    .eq('strategy_matrix_v2->>position', requestedHero)
                    .eq('strategy_matrix_v2->>pot_bb', String(release.rootPotBb))
                    .eq('strategy_matrix_v2->>eff_stack_bb', String(release.effectiveStackBb))
                    .eq('strategy_matrix_v2->>rake', release.rake)
                    .eq('strategy_matrix_v2->>tree_geometry', release.treeGeometry)
                    .eq('strategy_matrix_v2->>oop_player', release.oopPosition)
                    .eq('strategy_matrix_v2->>ip_player', release.ipPosition)
                    .not('strategy_matrix_v2', 'is', null)
                    .eq('quality_status', 'validated')
                    .eq('solver_version', release.solverVersion)
                    .eq('solver_binary_checksum', release.solverBinaryChecksum)
                    .eq('pipeline_commit', release.pipelineCommit)
                    .eq('manifest_version', release.manifestVersion)
                    .eq('manifest_checksum', release.manifestChecksum)
                    .not('machine_id', 'is', null)
                    .not('source_artifact_checksum', 'is', null)
                    .not('audited_at', 'is', null)
                    .limit(100);
                if (result.error || !Array.isArray(result.data)) return null;
                data.push(...result.data);
            }

            const orderedCandidates = orderedExactContinuationCandidates(data, continuationLineages);
            for (const { row: scenario, lineage } of orderedCandidates) {
                if (!prepareSolverScenarioRow(scenario)) continue;
                const matrix = scenario.strategy_matrix || {};
                const solvedHero = String(matrix.position || '').toUpperCase();
                const solvedVillain = solvedHero === String(matrix.oop_player || '').toUpperCase()
                    ? String(matrix.ip_player || '').toUpperCase()
                    : solvedHero === String(matrix.ip_player || '').toUpperCase()
                        ? String(matrix.oop_player || '').toUpperCase()
                        : '';
                const childPot = Number(matrix.pot_bb);
                const childEffectiveStack = Number(matrix.eff_stack_bb);
                if (solvedHero !== requestedHero
                    || solvedVillain !== requestedVillain
                    || !Number.isFinite(childPot)
                    || childPot <= 0
                    || !Number.isFinite(childEffectiveStack)
                    || childEffectiveStack <= 0
                    || childEffectiveStack > requestedStack) continue;
                const question = this.buildQuestionFromScenario(
                    scenario,
                    gameConfig,
                    5,
                    0,
                    heroHand,
                );
                if (!question) continue;
                question.scenario = {
                    ...(question.scenario || {}),
                    pot: childPot,
                    stackDepth: childEffectiveStack,
                    heroStack: childEffectiveStack,
                    villainStack: childEffectiveStack,
                    solverStackDepth: requestedStack,
                    continuationParentScenarioHash: lineage.parentScenarioHash,
                    continuationParentNode: lineage.parentNode,
                    continuationParentAction: lineage.continuationAction,
                };
                question.stackDepth = childEffectiveStack;
                question.solverStackDepth = requestedStack;
                question.estimatedPot = childPot;
                return question;
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
