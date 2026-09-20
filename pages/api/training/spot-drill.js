import { createHash, randomInt, randomUUID } from 'node:crypto';
import { getServerUserWithFallback } from '../../../src/lib/serverAuth';
import { createClient } from '../../../src/lib/supabaseServerClient';
import { applyDurableRateLimit, applyRateLimit, LIMITS } from '../../../src/lib/apiRateLimit';
import { sanitizeParam, withTiming } from '../../../src/utils/trainingApiUtils';
import { reportApiError } from '../../../src/lib/apiErrorHandler';
import { v2ToAppMatrix } from '../../../src/utils/v2Matrix';
import { customSolverProvenanceIsComplete } from '../../../src/lib/training/customSolverSpotContract.mjs';
import { parseSolverScenarioHash, SOLVER_POSITIONS } from '../../../src/lib/training/solverRowIdentity.mjs';
import { deterministicEngine } from '../../../src/engines/DeterministicGTOEngine';
import { applyDeterministicEnginePatches } from '../../../src/engines/deterministicEnginePatches';
import {
    buildTrainingCacheRow,
    persistCanonicalTrainingQuestions,
} from '../../../src/lib/training/cacheTruthPersistence.mjs';
import { trainingPersistenceUnavailableBody } from '../../../src/lib/training/trainingPersistence.mjs';

applyDeterministicEnginePatches(deterministicEngine);

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
const isIcmFamily = (family) => String(family || '').trim().toLowerCase().endsWith('_icm');
const SERVABLE_MTT_FAMILIES = Object.freeze(MTT_FAMILIES.filter((family) => !isIcmFamily(family)));
const SERVABLE_FAMILIES = Object.freeze(ALL_FAMILIES.filter((family) => !isIcmFamily(family)));
const POSITION_SET = new Set(SOLVER_POSITIONS);
const CANDIDATE_LIMIT = 12;
const MAX_CANDIDATE_PAGES = 32;
const LOOKUP_DEADLINE_MS = 2500;
const PREAUTH_RATE_LIMIT = Object.freeze({ max: 24, windowSeconds: 60 });
const USER_RATE_LIMIT = Object.freeze({ max: 12, windowSeconds: 60 });
const REFERENCE_STUDY_CONTRACT_VERSION = 'smarter-poker.answer-revealed-solver-study.v1';
const SOLVER_CANDIDATE_RPC = 'training_solver_spot_candidates_v1';
const RANKS = '23456789TJQKA';
const SUITS = 'cdhs';
const COMBO_ORDER = 'card=rank*4+suit; combo=b*(b-1)/2+a; 2c2d=0..AhAs=1325';
const SOURCE_COMBO_ORDER_SCHEMA = 'piosolver.show_hand_order.v1';
const HEX_64 = /^[0-9a-f]{64}$/;
const CANONICAL_PIO_RAKE = /^(?:0|1|0\.\d*[1-9]) (?:0|[1-9]\d*)$/;

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

function durableRequestFingerprint(req) {
    const headerValue = (name) => {
        const value = req.headers?.[name];
        return Array.isArray(value) ? value[0] : value;
    };
    const realIp = String(headerValue('x-real-ip') || '').trim();
    const forwarded = String(headerValue('x-forwarded-for') || '');
    const forwardedParts = forwarded.split(',').map((part) => part.trim()).filter(Boolean);
    const peer = String(req.socket?.remoteAddress || '').trim();
    const address = (realIp || forwardedParts.at(-1) || peer || 'unknown').slice(0, 128);
    return createHash('sha256').update(address).digest('hex');
}

function familySetForFormat(format) {
    if (format === 'cash') return CASH_FAMILIES;
    if (format === 'mtt') return SERVABLE_MTT_FAMILIES;
    return SERVABLE_FAMILIES;
}

function isContractStack(families, stackDepth) {
    return families.some((family) => TRAINING_SOLVER_CONTRACTS[family]?.includes(stackDepth));
}

function rowMatchesTrainingSolverContract(row) {
    const family = String(row?.game_type || '');
    const stackDepth = Number(row?.stack_depth);
    return Number.isSafeInteger(stackDepth)
        && TRAINING_SOLVER_CONTRACTS[family]?.includes(stackDepth) === true;
}

function exactContractPairs(families, stackDepth) {
    return families.flatMap((family) => (TRAINING_SOLVER_CONTRACTS[family] || [])
        .filter((depth) => !stackDepth || depth === stackDepth)
        .map((depth) => ({ game_type: family, stack_depth: depth })));
}

function solverDecisionNodeIsLegal(v2, street, board) {
    const expectedBoardCount = street === 'flop' ? 3 : street === 'turn' ? 4 : 5;
    const node = typeof v2?.node === 'string' ? v2.node : '';
    const tokens = node.split(':');
    const effectiveStackChips = Number(v2?.eff_stack_bb) * 100;
    const convergence = v2?.convergence;
    const accuracyFraction = Number(convergence?.accuracy_fraction);
    const startingPotChips = Number(convergence?.starting_pot_chips);
    const achievedChips = Number(convergence?.achieved_exploitability_chips);
    const achievedFraction = Number(convergence?.achieved_exploitability_fraction);
    const exploitabilityPct = Number(v2?.exploitability_pct);
    const rake = String(v2?.rake || '');
    if (node.length === 0 || node.length > 4096
        || tokens.length < 2 || tokens.length > 64
        || tokens[0] !== 'r' || tokens[1] !== '0'
        || tokens.some((token) => !token)
        || !Array.isArray(board) || board.length !== expectedBoardCount
        || new Set(board).size !== board.length
        || !Number.isFinite(effectiveStackChips) || effectiveStackChips <= 0
        || v2?.combo_order !== COMBO_ORDER
        || v2?.range_combo_order !== COMBO_ORDER
        || v2?.source_combo_order_schema !== SOURCE_COMBO_ORDER_SCHEMA
        || !HEX_64.test(String(v2?.source_combo_order_sha256 || ''))
        || /^0{64}$/.test(v2.source_combo_order_sha256)
        || !HEX_64.test(String(v2?.oop_range_checksum || ''))
        || /^0{64}$/.test(v2.oop_range_checksum)
        || !HEX_64.test(String(v2?.ip_range_checksum || ''))
        || /^0{64}$/.test(v2.ip_range_checksum)
        || !HEX_64.test(String(v2?.training_game_contracts_sha256 || ''))
        || /^0{64}$/.test(v2.training_game_contracts_sha256)
        || !CANONICAL_PIO_RAKE.test(rake)
        || Number(rake.split(' ')[0]) < 0 || Number(rake.split(' ')[0]) > 1
        || convergence?.schema !== 'piosolver.calc-results.v1'
        || convergence?.source_command !== 'calc_results'
        || ![accuracyFraction, startingPotChips, achievedChips,
            achievedFraction, exploitabilityPct].every(Number.isFinite)
        || accuracyFraction <= 0 || accuracyFraction > 0.01
        || startingPotChips <= 0
        || Math.abs(startingPotChips - (Number(v2?.pot_bb) * 100)) > 0.000001
        || achievedChips < 0 || achievedFraction < 0
        || Math.abs(achievedFraction - (achievedChips / startingPotChips)) > 1e-9
        || achievedFraction > accuracyFraction + 1e-9
        || Math.abs(exploitabilityPct - (achievedFraction * 100)) > 1e-7) return false;

    const contributions = [0, 0];
    const runout = [];
    let actor = 0;
    let roundState = 'open';
    let lastFullRaiseSize = 0;
    let streetBaseline = 0;
    let wagerIsAllIn = false;
    let raiseReopened = true;

    for (const token of tokens.slice(2)) {
        if (/^[2-9TJQKA][cdhs]$/.test(token)) {
            if (roundState !== 'closed' || wagerIsAllIn || runout.includes(token)) return false;
            runout.push(token);
            // Pio targets remain cumulative across streets. Keep the matched
            // contribution as the new baseline, while resetting street-local
            // action/minimum-raise state and the actor to OOP.
            streetBaseline = Math.max(...contributions);
            actor = 0;
            roundState = 'open';
            lastFullRaiseSize = 0;
            wagerIsAllIn = false;
            raiseReopened = true;
            continue;
        }
        if (token === 'c') {
            if (roundState === 'closed' || roundState === 'all_in_terminal') return false;
            contributions[actor] = Math.max(...contributions);
            if (roundState === 'open') roundState = 'checked';
            else if (roundState === 'checked') roundState = 'closed';
            else if (roundState === 'facing_wager') {
                roundState = wagerIsAllIn ? 'all_in_terminal' : 'closed';
            } else return false;
            actor = 1 - actor;
            continue;
        }
        const wager = /^b([1-9]\d*)$/.exec(token);
        if (!wager || roundState === 'closed' || roundState === 'all_in_terminal') return false;
        if (roundState === 'facing_wager' && !raiseReopened) return false;
        const target = Number(wager[1]);
        if (!Number.isSafeInteger(target)
            || target <= Math.max(...contributions)
            || target > effectiveStackChips) return false;
        const raiseSize = target - Math.max(...contributions);
        if (roundState !== 'facing_wager'
            && raiseSize < 100
            && target !== effectiveStackChips) return false;
        if (roundState === 'facing_wager'
            && raiseSize < lastFullRaiseSize
            && target !== effectiveStackChips) return false;
        contributions[actor] = target;
        actor = 1 - actor;
        roundState = 'facing_wager';
        wagerIsAllIn = target === effectiveStackChips;
        raiseReopened = !wagerIsAllIn || lastFullRaiseSize === 0 || raiseSize >= lastFullRaiseSize;
        if (!wagerIsAllIn || raiseSize >= lastFullRaiseSize) lastFullRaiseSize = raiseSize;
    }

    if (roundState === 'closed' || roundState === 'all_in_terminal'
        || (actor === 0 ? 'OOP' : 'IP') !== v2.hero
        // Pio may load a complete turn/river board at the solve root. In that
        // case the node has no runout tokens. If a continuation tree exposes
        // runout cards, require the complete trailing suffix for this row.
        || (runout.length !== 0 && runout.length !== expectedBoardCount - 3)
        || runout.some((card, index) => card !== board[board.length - runout.length + index])) {
        return false;
    }

    const actions = Array.isArray(v2.actions) ? v2.actions : [];
    if (actions.length < 2 || actions.length > 16) return false;
    const codes = new Set();
    const targets = new Set();
    for (const action of actions) {
        if (!action || typeof action !== 'object' || Array.isArray(action)) return false;
        const code = String(action.code || '');
        if (!/^(c|f|b[1-9]\d*)$/.test(code)
            || !String(action.key || '').trim()
            || codes.has(code)) return false;
        codes.add(code);
        const wager = /^b([1-9]\d*)$/.exec(code);
        if (wager) {
            const target = Number(wager[1]);
            if ((roundState === 'facing_wager' && !raiseReopened)
                || !Number.isSafeInteger(target)
                || target !== Number(action.size_chips)
                || action.size_semantics !== 'cumulative_postflop_contribution_target'
                || target <= Math.max(...contributions)
                || target > effectiveStackChips
                || (roundState !== 'facing_wager'
                    && target - contributions[actor] < 100
                    && target !== effectiveStackChips)
                || (roundState === 'facing_wager'
                    && target - Math.max(...contributions) < lastFullRaiseSize
                    && target !== effectiveStackChips)
                || target <= streetBaseline
                || targets.has(target)
                || action.key !== `${roundState === 'facing_wager' ? 'raise' : 'bet'}_chips_${target}`) return false;
            targets.add(target);
        } else if (Number(action.size_pct) !== 0
            || (code === 'f' && (roundState !== 'facing_wager' || action.key !== 'fold'))
            || (code === 'c'
                && action.key !== (roundState === 'facing_wager' ? 'call' : 'check'))) return false;
    }
    return codes.has('c') && (roundState !== 'facing_wager' || codes.has('f'));
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
    if (bet) {
        const rawTargetChips = Number(bet[1]);
        if (Math.abs(rawTargetChips - (Number(matrix?.eff_stack_bb) * 100)) <= 1e-9) return 'All-In';
        const streetTargetChips = rawTargetChips - Number(matrix?.street_baseline_chips || 0);
        if (!(streetTargetChips > 0)) return null;
        const verb = Number(matrix?.facing_bet_bb) > 0 ? 'Raise' : 'Bet';
        if (verb === 'Raise') {
            // Contract marker: `${verb} To ${formatBbTarget(streetTargetChips)} BB`.
            return `Raise To ${formatBbTarget(streetTargetChips)} BB`;
        }
        return `Bet ${formatBbTarget(streetTargetChips)} BB`;
    }
    return null;
}

function hasCompleteSealedIcmInputs(row) {
    if (!isIcmFamily(row?.game_type)) return true;

    /*
     * solved_spots_gold does not currently persist the ICM objective, payout
     * vector, remaining field, complete stack vector, or an input seal that
     * binds those values to the solver artifact. A family suffix is not a
     * substitute for those inputs. Keep every _icm artifact fail-closed until
     * the warehouse schema and projection carry that complete sealed contract.
     */
    return false;
}

function cardFromIndex(index) {
    const rank = RANKS[Math.floor(index / SUITS.length)];
    const suit = SUITS[index % SUITS.length];
    return rank && suit ? `${rank}${suit}` : null;
}

function cardsToHoldingClass(cards) {
    if (!Array.isArray(cards) || cards.length !== 2) return null;
    const parsed = cards.map((card) => ({
        rank: String(card || '')[0]?.toUpperCase(),
        suit: String(card || '')[1]?.toLowerCase(),
    }));
    if (parsed.some((card) => !RANKS.includes(card.rank) || !SUITS.includes(card.suit))) return null;
    const [first, second] = parsed;
    const high = RANKS.indexOf(first.rank) >= RANKS.indexOf(second.rank) ? first : second;
    const low = high === first ? second : first;
    if (high.rank === low.rank) return `${high.rank}${low.rank}`;
    return `${high.rank}${low.rank}${high.suit === low.suit ? 's' : 'o'}`;
}

/**
 * Select one legal physical two-card holding from the 1,326-combo artifact.
 * Spot Study must never display a 169-class label (for example AKs) as if it
 * were a real card pair, and its frequencies/EV must come from that exact
 * combo rather than an aggregate class.
 */
function selectExactHolding(v2, board) {
    const actionCodes = (Array.isArray(v2?.actions) && v2.actions.length > 0)
        ? v2.actions.map((action) => (typeof action === 'string' ? action : action?.code))
        : Object.keys(v2?.frequencies || {});
    const evs = v2?.hand_evs_bb;
    if (actionCodes.length < 2
        || actionCodes.some((code) => !code || !Array.isArray(v2?.frequencies?.[code])
            || v2.frequencies[code].length !== 1326)
        || !Array.isArray(evs)
        || evs.length !== 1326) return null;

    const deadCards = new Set((Array.isArray(board) ? board : []).map(String));
    const candidates = [];
    for (let highIndex = 1; highIndex < 52; highIndex += 1) {
        for (let lowIndex = 0; lowIndex < highIndex; lowIndex += 1) {
            const comboIndex = (highIndex * (highIndex - 1)) / 2 + lowIndex;
            const heroCards = [cardFromIndex(lowIndex), cardFromIndex(highIndex)].sort(
                (left, right) => RANKS.indexOf(right[0]) - RANKS.indexOf(left[0])
                    || SUITS.indexOf(left[1]) - SUITS.indexOf(right[1]),
            );
            const frequencies = actionCodes.map((code) => Number(v2.frequencies[code][comboIndex]));
            const total = frequencies.reduce((sum, value) => sum + value, 0);
            if (frequencies.some((value) => !Number.isFinite(value) || value < 0 || value > 1)) {
                return null;
            }
            if (heroCards.some((card) => !card || deadCards.has(card))) {
                if (total !== 0) return null;
                continue;
            }
            if (!Number.isFinite(total)
                || total <= 0.001
                || Math.abs(total - 1) > 0.00001
                || !Number.isFinite(Number(evs[comboIndex]))) continue;
            candidates.push({
                comboIndex,
                heroCards,
                heroHand: cardsToHoldingClass(heroCards),
                frequencies,
                total,
                handEvBb: Number(evs[comboIndex]),
            });
        }
    }
    return candidates.length > 0 ? candidates[randomInt(candidates.length)] : null;
}

function buildStudySpot(row) {
    if (!rowMatchesTrainingSolverContract(row)) return null;
    if (!customSolverProvenanceIsComplete(row)) return null;
    if (!hasCompleteSealedIcmInputs(row)) return null;
    const parsed = parseSolverScenarioHash(row.scenario_hash);
    if (!parsed.ok) return null;
    if (!solverDecisionNodeIsLegal(
        row.strategy_matrix_v2,
        parsed.identity.street,
        parsed.identity.boardCards,
    )) return null;

    const matrix = v2ToAppMatrix(row.strategy_matrix_v2);
    if (!matrix || matrix.node_state_exact !== true) return null;
    const actions = Array.isArray(matrix.actions) ? matrix.actions : [];
    const labels = actions.map((action) => actionLabel(action, matrix));
    if (actions.length < 2 || labels.some((label) => !label)) return null;

    const exactHolding = selectExactHolding(row.strategy_matrix_v2, parsed.identity.boardCards);
    if (!exactHolding?.heroHand) return null;
    const rawValues = exactHolding.frequencies;
    const total = exactHolding.total;

    let primaryIndex = 0;
    const actionBreakdown = {};
    const sourceActions = [];
    actions.forEach((action, index) => {
        if (rawValues[index] > rawValues[primaryIndex]) primaryIndex = index;
        const label = labels[index];
        const percentage = (rawValues[index] / total) * 100;
        actionBreakdown[label] = (actionBreakdown[label] || 0) + percentage;
        const target = /^b([1-9]\d*)$/.exec(action);
        const solverTargetChips = target ? Number(target[1]) : null;
        const solverTargetBigBlinds = target ? solverTargetChips / 100 : null;
        const targetChips = target
            ? solverTargetChips - Number(matrix.street_baseline_chips || 0)
            : null;
        const incrementChips = target
            ? solverTargetChips - Number(matrix.actor_contribution_chips || 0)
            : null;
        const targetBigBlinds = target
            ? targetChips / 100
            : null;
        const incrementBigBlinds = target
            ? incrementChips / 100
            : null;
        sourceActions.push({
            sourceCode: action,
            label,
            frequency: Math.round(percentage * 10) / 10,
            targetBigBlinds,
            incrementBigBlinds,
            solverTargetBigBlinds,
            solverTargetChips,
        });
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
        heroHand: exactHolding.heroHand,
        heroCards: exactHolding.heroCards,
        comboIndex: exactHolding.comboIndex,
        handEvBb: Math.round(exactHolding.handEvBb * 1000) / 1000,
        gtoAction: labels[primaryIndex],
        gtoFrequency: Math.round((rawValues[primaryIndex] / total) * 1000) / 10,
        actionBreakdown,
        sourceActions,
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
            scenarioHash: row.scenario_hash,
            solverVersion: row.solver_version,
            solverBinaryChecksum: row.solver_binary_checksum,
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

function studyGameType(gameType) {
    const family = String(gameType || '');
    if (family.startsWith('spin_')) return 'sng';
    if (family.startsWith('mtt_')) return 'tournament';
    return 'cash';
}

function buildReferenceActions(studySpot, answer) {
    const bySourceCode = new Map((studySpot.sourceActions || []).map((action) => [
        String(action.sourceCode || '').toLowerCase(),
        action,
    ]));
    const actions = (answer.actions || []).map((action) => {
        const sourceCode = String(action.sourceCode || '').toLowerCase();
        const source = bySourceCode.get(sourceCode);
        if (!source || !sourceCode || !Number.isFinite(Number(action.frequency))) return null;
        return {
            id: String(action.id || '').toLowerCase(),
            sourceCode,
            label: source.label,
            frequency: Math.round(Number(action.frequency) * 1000) / 10,
            targetBigBlinds: source.targetBigBlinds,
            incrementBigBlinds: source.incrementBigBlinds,
            solverTargetBigBlinds: source.solverTargetBigBlinds,
            solverTargetChips: source.solverTargetChips,
        };
    });
    return actions.every(Boolean) ? actions : null;
}

function referenceStudyQuestionIsValid(question, answer, referenceActions) {
    const options = Array.isArray(question?.options) ? question.options : [];
    const policyActions = Array.isArray(answer?.actions) ? answer.actions : [];
    if (question?.referenceStudyContract?.version !== REFERENCE_STUDY_CONTRACT_VERSION
        || question.referenceStudyContract.answerRevealed !== true
        || question.referenceStudyContract.authoritativeTrainingProgress !== false
        || question.authoritativeTrainingProgress !== false
        || options.length < 2
        || options.length !== policyActions.length
        || options.length !== referenceActions?.length) return false;

    const optionIds = options.map((option) => String(option?.id || '').toLowerCase());
    const policyIds = policyActions.map((action) => String(action?.id || '').toLowerCase());
    const sourceCodes = referenceActions.map((action) => action.sourceCode);
    if (optionIds.some((id) => !id)
        || new Set(optionIds).size !== optionIds.length
        || new Set(policyIds).size !== policyIds.length
        || new Set(sourceCodes).size !== sourceCodes.length
        || [...optionIds].sort().join('|') !== [...policyIds].sort().join('|')
        || options.some((option) => !String(option?.text || '').trim())) return false;

    const bestFrequency = Math.max(...policyActions.map((action) => Number(action.frequency)));
    const correct = policyActions.find(
        (action) => String(action.id).toLowerCase() === String(question.correctAnswer).toLowerCase(),
    );
    return Number.isFinite(bestFrequency)
        && bestFrequency > 0
        && policyActions.every((action) => Number.isFinite(Number(action.frequency))
            && Number(action.frequency) >= 0)
        && Boolean(correct)
        && Math.abs(Number(correct.frequency) - bestFrequency) <= 1e-9;
}

function buildCanonicalStudyQuestion(row, studySpot, answer) {
    if (answer.kind === 'unavailable' || !Array.isArray(answer.actions) || answer.actions.length < 2) {
        return null;
    }
    if (!Array.isArray(studySpot.heroCards)
        || studySpot.heroCards.length !== 2
        || JSON.stringify(answer.key?.holding || []) !== JSON.stringify(studySpot.heroCards)) {
        return null;
    }
    const best = answer.actions.reduce(
        (current, action) => (!current || action.frequency > current.frequency ? action : current),
        null,
    );
    const questionId = `spot:${createHash('sha256').update(JSON.stringify({
        artifactId: answer.sourceArtifact?.artifactId || row.id,
        sourceArtifactChecksum: answer.sourceArtifact?.sourceArtifactChecksum,
        manifestChecksum: answer.sourceArtifact?.manifestChecksum,
        scenarioHash: row.scenario_hash,
        holding: studySpot.heroCards,
        policyVersion: answer.policyVersion,
    })).digest('hex')}`;
    const referenceActions = buildReferenceActions(studySpot, answer);
    if (!referenceActions) return null;
    const bestReference = referenceActions.find((action) => action.id === String(best.id).toLowerCase());
    if (!bestReference) return null;
    const question = {
        id: questionId,
        type: 'PIO',
        source: 'DETERMINISTIC_SOLVER',
        dataQuality: answer.qualitySeal,
        authority: 'answer_revealed_reference',
        authoritativeTrainingProgress: false,
        referenceStudyContract: {
            version: REFERENCE_STUDY_CONTRACT_VERSION,
            answerRevealed: true,
            authoritativeTrainingProgress: false,
        },
        question: 'What does the audited solver policy show for this recorded decision node?',
        heroHand: studySpot.heroHand,
        heroCards: studySpot.heroCards,
        boardCards: studySpot.board,
        scenario: {
            scenarioHash: studySpot.scenarioHash,
            board: studySpot.board.join(' '),
            street: studySpot.street,
            heroPosition: studySpot.heroPosition,
            stackDepth: studySpot.stackDepth,
            heroStack: studySpot.decisionNode?.effectiveStackBb || studySpot.stackDepth,
            pot: studySpot.decisionNode?.potBb,
            nodeType: answer.node?.semantics,
        },
        options: referenceActions.map((action) => ({
            id: action.id,
            text: action.label,
            sourceCode: action.sourceCode,
        })),
        correctAnswer: best.id,
        correctAnswerText: bestReference.label,
        gtoFrequencies: Object.fromEntries(
            answer.actions.map((action) => [action.id, Math.round(action.frequency * 10000) / 100]),
        ),
        explanation: 'This answer-revealed study spot shows the persisted canonical policy for the audited solver artifact.',
        solverProvenance: studySpot.provenance,
        solverPolicy: answer,
    };
    if (!referenceStudyQuestionIsValid(question, answer, referenceActions)) return null;

    try {
        const cacheRow = buildTrainingCacheRow({
            question,
            questionId,
            gameId: 'spot-trainer',
            questionKind: 'PIO',
            gameType: studyGameType(studySpot.gameType),
            level: 1,
        });
        return {
            question: cacheRow.question_data,
            answer,
            best,
            bestReference,
            referenceActions,
        };
    } catch {
        return null;
    }
}

function buildCatalogQuery({
    families,
    position,
    stackDepth,
    lowerInclusive = null,
    lowerExclusive = null,
    upperExclusive = null,
}) {
    return getSupabase().rpc(SOLVER_CANDIDATE_RPC, {
        p_family_stacks: exactContractPairs(families, stackDepth),
        p_position: position || null,
        p_lower_inclusive: lowerInclusive,
        p_lower_exclusive: lowerExclusive,
        p_upper_exclusive: upperExclusive,
        p_limit: CANDIDATE_LIMIT,
    });
}

function pageCursorIsStrict(rows, {
    lowerInclusive = null,
    lowerExclusive = null,
    upperExclusive = null,
} = {}) {
    let previous = lowerExclusive;
    for (const row of rows) {
        const id = typeof row?.id === 'string' ? row.id : '';
        if (!id
            || (previous && id <= previous)
            || (lowerInclusive && id < lowerInclusive)
            || (upperExclusive && id >= upperExclusive)) {
            return false;
        }
        previous = id;
    }
    return true;
}

async function executeBoundedQuery(query, deadlineAt) {
    const controller = new AbortController();
    const timeout = setTimeout(
        () => controller.abort(),
        Math.max(1, deadlineAt - Date.now()),
    );
    try {
        if (typeof query?.abortSignal !== 'function') {
            throw new Error('Audited solver lookup does not support request cancellation');
        }
        return await query.abortSignal(controller.signal);
    } finally {
        clearTimeout(timeout);
    }
}

async function findCanonicalStudyCandidate({
    families,
    position,
    stackDepth,
    pivot,
    deadlineAt,
}) {
    const segments = [
        { lowerInclusive: pivot, upperExclusive: null },
        { lowerInclusive: null, upperExclusive: pivot },
    ];
    let pagesRead = 0;

    for (const segment of segments) {
        let cursor = null;
        let firstPage = true;

        while (true) {
            if (Date.now() >= deadlineAt) {
                return { kind: 'incomplete', reason: 'deadline', pagesRead };
            }
            if (pagesRead >= MAX_CANDIDATE_PAGES) {
                return { kind: 'incomplete', reason: 'page_budget', pagesRead };
            }

            const bounds = {
                lowerInclusive: firstPage ? segment.lowerInclusive : null,
                lowerExclusive: cursor,
                upperExclusive: segment.upperExclusive,
            };
            let page;
            try {
                const query = buildCatalogQuery({
                    families,
                    position,
                    stackDepth,
                    ...bounds,
                });
                page = await executeBoundedQuery(query, deadlineAt);
            } catch (error) {
                if (error?.name === 'AbortError' || Date.now() >= deadlineAt) {
                    return {
                        kind: 'incomplete',
                        reason: 'deadline',
                        pagesRead: pagesRead + 1,
                    };
                }
                return { kind: 'database_error', error, pagesRead: pagesRead + 1 };
            }
            pagesRead += 1;

            if (Date.now() >= deadlineAt) {
                return { kind: 'incomplete', reason: 'deadline', pagesRead };
            }
            const { data, error } = page || {};
            if (error) return { kind: 'database_error', error, pagesRead };
            if (!Array.isArray(data)) {
                return {
                    kind: 'database_error',
                    error: new Error('Audited solver lookup returned a malformed page'),
                    pagesRead,
                };
            }
            const solverRows = data;
            if (solverRows.length === 0) break;
            if (!pageCursorIsStrict(solverRows, bounds)) {
                return { kind: 'cursor_error', pagesRead };
            }
            for (const row of solverRows) {
                // AbortSignal only bounds network I/O. Each row can also do a
                // 1,326-combo matrix conversion and holding/policy pass, so
                // enforce the same wall-clock budget inside the CPU loop.
                if (Date.now() >= deadlineAt) {
                    return { kind: 'incomplete', reason: 'deadline', pagesRead };
                }
                if (!rowMatchesTrainingSolverContract(row)) continue;
                const spot = buildStudySpot(row);
                if (!spot) continue;
                if (Date.now() >= deadlineAt) {
                    return { kind: 'incomplete', reason: 'deadline', pagesRead };
                }
                const policy = deterministicEngine.canonicalPolicyForValidatedSolvedRow(
                    row,
                    spot.heroCards,
                );
                if (!policy) continue;
                if (Date.now() >= deadlineAt) {
                    return { kind: 'incomplete', reason: 'deadline', pagesRead };
                }
                const canonical = buildCanonicalStudyQuestion(row, spot, policy);
                if (canonical) {
                    return {
                        kind: 'candidate',
                        row,
                        spot,
                        canonical,
                        pagesRead,
                    };
                }
            }

            cursor = solverRows[solverRows.length - 1].id;
            firstPage = false;
            if (solverRows.length < CANDIDATE_LIMIT) break;
        }
    }

    return { kind: 'exhausted', pagesRead };
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

        const authorization = req.headers.authorization;
        const token = typeof authorization === 'string' && authorization.startsWith('Bearer ')
            ? authorization.slice(7).trim()
            : '';
        if (!token) return res.status(401).json({ success: false, error: 'Authentication required' });

        // The process-local limiter is only a burst shield. A forged Bearer
        // token must not buy an unbounded auth + solver lookup on each Vercel
        // instance, so consult the shared database bucket before authentication
        // and fail closed if that authority is unavailable.
        const supabase = getSupabase();
        if (!await applyDurableRateLimit(supabase, res, {
            key: `training:spot-study:preauth:${durableRequestFingerprint(req)}`,
            ...PREAUTH_RATE_LIMIT,
        })) return;

        const { user, error: authError } = await getServerUserWithFallback(req, supabase);
        if (authError || !user) {
            return res.status(401).json({ success: false, error: 'Authentication required' });
        }
        if (!await applyDurableRateLimit(supabase, res, {
            key: `training:spot-study:user:${user.id}`,
            ...USER_RATE_LIMIT,
        })) return;

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
        deterministicEngine.setSupabaseClient(getSupabase());
        const lookup = await findCanonicalStudyCandidate({
            families,
            position,
            stackDepth,
            pivot,
            deadlineAt: Date.now() + LOOKUP_DEADLINE_MS,
        });
        if (lookup.kind === 'database_error') {
            console.warn('[SpotDrill] Audited solver lookup failed:', lookup.error?.message);
            return res.status(503).json({
                success: false,
                code: 'SOLVER_LOOKUP_UNAVAILABLE',
                error: 'Audited solver lookup is temporarily unavailable',
                retryable: true,
            });
        }
        if (lookup.kind === 'cursor_error' || lookup.kind === 'incomplete') {
            return res.status(503).json({
                success: false,
                code: 'SOLVER_LOOKUP_INCOMPLETE',
                error: lookup.kind === 'cursor_error'
                    ? 'Audited solver lookup returned a non-advancing cursor'
                    : lookup.reason === 'deadline'
                        ? 'Audited solver lookup reached its wall-clock deadline before exhaustion'
                        : 'Audited solver lookup reached its bounded work budget before exhaustion',
                retryable: true,
            });
        }
        if (lookup.kind === 'exhausted') {
            return res.status(404).json({
                success: false,
                code: 'AUDITED_SOLVER_ARTIFACT_NOT_FOUND',
                error: 'No provenance-complete solver artifact exists for these study filters',
                retryable: false,
            });
        }
        const selected = lookup;
        const { canonical } = selected;

        let persistedQuestion;
        try {
            [persistedQuestion] = await persistCanonicalTrainingQuestions(getSupabase(), {
                questions: [canonical.question],
                gameId: 'spot-trainer',
                questionKind: 'PIO',
                gameType: studyGameType(selected.spot.gameType),
                level: 1,
                userId: user.id,
                requestId: randomUUID(),
                label: 'SpotDrill:canonicalize',
            });
        } catch (canonicalizeError) {
            console.warn('[SpotDrill] Refusing to serve an uncanonicalized study spot:', canonicalizeError?.message || canonicalizeError);
            return res.status(503).json(trainingPersistenceUnavailableBody());
        }

        const actionBreakdown = Object.fromEntries(canonical.referenceActions.map((action) => [
            action.label,
            action.frequency,
        ]));
        const publicSpot = { ...selected.spot };
        delete publicSpot.sourceActions;
        delete publicSpot.comboIndex;

        return res.status(200).json({
            success: true,
            mode: 'answer_revealed_reference',
            authoritativeTrainingProgress: false,
            spot: {
                ...publicSpot,
                id: persistedQuestion.id,
                gtoAction: canonical.bestReference.label,
                gtoSourceCode: canonical.bestReference.sourceCode,
                gtoFrequency: canonical.bestReference.frequency,
                actionBreakdown,
                actions: canonical.referenceActions,
                policyChecksum: persistedQuestion.policyChecksum,
                sourceClassification: persistedQuestion.sourceClassification,
            },
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
