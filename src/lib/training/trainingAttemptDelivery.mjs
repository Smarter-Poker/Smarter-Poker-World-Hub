import { createHash } from 'node:crypto';

import { normalizeTrainingDifficultyMode } from './difficultyQuestionContract.mjs';
import {
  prepareTrainingQuestionForDelivery,
  stableTrainingQuestionJson,
  trainingQuestionDigest,
} from './gradingReceipt.mjs';
import {
  normalizeTrainingSessionKind,
  resolveTrainingSessionTarget,
  TrainingSessionAttemptContractError,
} from './sessionAttemptContract.mjs';
import { isTrainingQuestionValid } from './questionContract.mjs';
import { sourceClassificationForQuestion } from './cacheTruthContract.mjs';
import { isVerifiedSolverQuestion } from './solverDecisionEvidence.js';
import { normalizeBoard, normalizeHolding } from './solverPolicyContract.js';
import { runTrainingPersistenceQuery } from './trainingPersistence.mjs';

const CARD_RE = /^[2-9TJQKA][cdhs]$/i;
const BOARD_CARDS_BY_STREET = Object.freeze({
  preflop: 0,
  flop: 3,
  turn: 4,
  river: 5,
});
const INELIGIBLE_AUTHORITY_MARKER_RE = /(?:^|[_\s-])(?:simulated|illustrative|practice(?:[_\s-]?only)?|legacy(?:[_\s-]?unverified)?|unverified|heuristic)(?:$|[_\s-])/i;
const INELIGIBLE_SOURCES = new Set([
  'CACHED_LEGACY',
  'GROK_GTO',
  'LEGACY_STRATEGY_ARCHIVE',
  'LOCAL_POSTFLOP_HEURISTIC',
  'POSTFLOP_ENGINE',
]);
const CURATED_CONCEPT_DISCLOSURE = 'Expert-authored poker concept; no solver-exact frequency or EV is claimed.';
const CHART_DISCLOSURES = new Set([
  'Audited local push/fold chart corpus.',
  'Audited local push/fold chart frequencies; no per-action EV is claimed.',
]);
const EXACT_SOLVER_DISCLOSURE = 'Provenance-sealed PioSOLVER export; frequencies are exact for this recorded node. Per-action EV is not available.';
const DERIVED_SOLVER_DISCLOSURE = 'Audited PioSOLVER artifact; this displayed response is derived from the recorded node and is not labeled solver-exact because the source lacks a complete canonical decision key.';

export class TrainingAttemptDeliveryError extends Error {
  constructor(message, code = 'TRAINING_ATTEMPT_DELIVERY_INVALID', status = 409) {
    super(message);
    this.name = 'TrainingAttemptDeliveryError';
    this.code = code;
    this.status = status;
  }
}

function normalizedLevel(value) {
  return Math.min(12, Math.max(1, Number.parseInt(value, 10) || 1));
}

function normalizeAuthorityValue(value) {
  return String(value ?? '').trim().toUpperCase();
}

function eligibility(eligible, reason) {
  return Object.freeze({ eligible, reason });
}

function hasDisqualifyingAuthorityMarker(question) {
  const scenario = question?.scenario || {};
  const values = [
    question?.source,
    question?.type,
    question?.authority,
    question?.authorityStatus,
    question?.dataQuality,
    question?.provenanceStatus,
    scenario?.authority,
    scenario?.authorityStatus,
    scenario?.dataQuality,
    scenario?.provenanceStatus,
    question?.solverProvenance?.qualityStatus,
  ].filter((value) => value !== undefined && value !== null);
  return values.some((value) => INELIGIBLE_AUTHORITY_MARKER_RE.test(String(value)));
}

function hasExplicitPracticeOrIllustrativeFlag(question) {
  const scenario = question?.scenario || {};
  return [
    question?.practiceOnly,
    question?.isPracticeOnly,
    question?.simulated,
    question?.isSimulated,
    question?.illustrative,
    question?.isIllustrative,
    question?._gradingContext?.practiceOnly,
    scenario?.practiceOnly,
    scenario?.isPracticeOnly,
    scenario?.simulated,
    scenario?.isSimulated,
    scenario?.illustrative,
    scenario?.isIllustrative,
  ].some((value) => value === true);
}

function normalizedCards(value) {
  if (!Array.isArray(value)) return null;
  const cards = value.map((card) => String(card || '').trim());
  return cards.every((card) => CARD_RE.test(card))
    ? cards.map((card) => `${card[0].toUpperCase()}${card[1].toLowerCase()}`)
    : null;
}

function compactBoardCards(value) {
  const compact = String(value ?? '').replace(/[\s,]+/g, '');
  if (!compact) return [];
  if (compact.length % 2 !== 0) return null;
  const cards = [];
  for (let index = 0; index < compact.length; index += 2) {
    const card = compact.slice(index, index + 2);
    if (!CARD_RE.test(card)) return null;
    cards.push(`${card[0].toUpperCase()}${card[1].toLowerCase()}`);
  }
  return cards;
}

function sameCards(left, right) {
  return Array.isArray(left)
    && Array.isArray(right)
    && left.length === right.length
    && left.every((card, index) => card === right[index]);
}

function hasCompletePokerContext(question) {
  const scenario = question?.scenario;
  if (!scenario || typeof scenario !== 'object' || Array.isArray(scenario)) return false;

  const street = String(scenario.street || question?.street || '').trim().toLowerCase();
  const expectedBoardCards = BOARD_CARDS_BY_STREET[street];
  if (expectedBoardCards === undefined) return false;
  if (question?.street && String(question.street).trim().toLowerCase() !== street) return false;

  const heroCards = normalizedCards(question?.heroCards);
  const boardCards = normalizedCards(question?.boardCards);
  if (!heroCards || heroCards.length !== 2) return false;
  if (!boardCards || boardCards.length !== expectedBoardCards) return false;
  const allCards = [...heroCards, ...boardCards].map((card) => card.toLowerCase());
  if (new Set(allCards).size !== allCards.length) return false;

  if (scenario.boardCards !== undefined) {
    const scenarioBoardCards = normalizedCards(scenario.boardCards);
    if (!sameCards(boardCards, scenarioBoardCards)) return false;
  }
  if (scenario.board !== undefined) {
    const scenarioBoardCards = compactBoardCards(scenario.board);
    if (!sameCards(boardCards, scenarioBoardCards)) return false;
  }

  const heroPosition = String(scenario.heroPosition || '').trim().toUpperCase();
  const villainPosition = String(scenario.villainPosition || '').trim().toUpperCase();
  if (!heroPosition || !villainPosition || heroPosition === villainPosition) return false;

  const pot = Number(scenario.pot);
  const heroStack = Number(scenario.heroStack);
  const villainStack = Number(scenario.villainStack);
  return Number.isFinite(pot)
    && pot > 0
    && Number.isFinite(heroStack)
    && heroStack > 0
    && Number.isFinite(villainStack)
    && villainStack > 0;
}

function hasCompleteAuditedSolverProvenance(question) {
  const provenance = question?.solverProvenance;
  return Boolean(
    provenance?.verified === true
    && provenance?.scenarioHash
    && provenance?.solverVersion
    && /^[0-9a-f]{64}$/i.test(String(provenance?.solverBinaryChecksum || ''))
    && ['M1', 'M2'].includes(String(provenance?.machineId || ''))
    && /^[0-9a-f]{40}$/i.test(String(provenance?.pipelineCommit || ''))
    && provenance?.manifestVersion
    && /^[0-9a-f]{64}$/i.test(String(provenance?.manifestChecksum || ''))
    && /^[0-9a-f]{64}$/i.test(String(provenance?.sourceArtifactChecksum || ''))
    && provenance?.qualityStatus === 'validated'
    && provenance?.auditedAt
  );
}

function canonicalPolicyMatchesSolverProvenance(question) {
  const source = question?.solverPolicy?.sourceArtifact;
  const provenance = question?.solverProvenance;
  if (!source || !provenance) return false;
  return source.provenanceComplete === true
    && source.scenarioHash === provenance.scenarioHash
    && source.solverVersion === provenance.solverVersion
    && source.solverBinaryChecksum === provenance.solverBinaryChecksum
    && source.machineId === provenance.machineId
    && source.pipelineCommit === provenance.pipelineCommit
    && String(source.manifestVersion) === String(provenance.manifestVersion)
    && source.manifestChecksum === provenance.manifestChecksum
    && source.sourceArtifactChecksum === provenance.sourceArtifactChecksum
    && source.qualityStatus === provenance.qualityStatus
    && String(source.auditedAt) === String(provenance.auditedAt);
}

function canonicalPolicyActionSetMatchesQuestion(question) {
  const optionIds = (Array.isArray(question?.options) ? question.options : [])
    .map((option) => String(option?.id || '').trim().toLowerCase())
    .filter(Boolean)
    .sort();
  const policyIds = (Array.isArray(question?.solverPolicy?.actions)
    ? question.solverPolicy.actions
    : [])
    .filter((action) => action?.legal !== false)
    .map((action) => String(action?.id || '').trim().toLowerCase())
    .filter(Boolean)
    .sort();
  return optionIds.length >= 2
    && new Set(optionIds).size === optionIds.length
    && JSON.stringify(optionIds) === JSON.stringify(policyIds);
}

function canonicalSolverPolicyMatchesQuestion(question) {
  const policy = question?.solverPolicy;
  const key = policy?.key;
  const scenario = question?.scenario || {};
  const board = normalizeBoard(question?.boardCards || []);
  const holding = normalizeHolding(question?.heroCards || []);
  return policy?.sourceArtifact?.system === 'solved_spots_gold_v2'
    && policy?.sourceArtifact?.provenanceComplete === true
    && canonicalPolicyMatchesSolverProvenance(question)
    && String(policy?.sourceArtifact?.scenarioHash || '') === String(scenario.scenarioHash || '')
    && canonicalPolicyActionSetMatchesQuestion(question)
    && String(policy?.node?.sourceNode || '') === String(scenario.solverNode || '')
    && Number.isFinite(Number(policy?.node?.potBb))
    && Number(policy.node.potBb) === Number(scenario.pot)
    && String(key?.street || '') === String(scenario.street || question?.street || '').toLowerCase()
    && JSON.stringify(key?.board || []) === JSON.stringify(board)
    && JSON.stringify(key?.holding || []) === JSON.stringify(holding)
    && String(key?.positions?.hero || '') === String(scenario.heroPosition || '').toUpperCase()
    && Array.isArray(key?.positions?.villains)
    && key.positions.villains.includes(String(scenario.villainPosition || '').toUpperCase());
}

function canonicalCuratedPolicyMatchesQuestion(question) {
  const policy = question?.solverPolicy;
  return policy?.kind === 'curated'
    && policy?.qualitySeal === 'CURATED'
    && policy?.sourceArtifact?.system === question?.source
    && String(policy?.sourceArtifact?.artifactId || '') === String(question?.id || '')
    && canonicalPolicyActionSetMatchesQuestion(question);
}

function canonicalChartPolicyMatchesQuestion(question) {
  const policy = question?.solverPolicy;
  const scenario = question?.scenario || {};
  return policy?.kind === 'chart'
    && policy?.qualitySeal === 'CHART_AUDITED'
    && policy?.sourceArtifact?.system === 'memory_charts_gold'
    && policy?.sourceArtifact?.provenanceComplete === true
    && policy?.sourceArtifact?.qualityStatus === 'audited_chart'
    && String(policy?.sourceArtifact?.artifactId || '') === String(scenario.chartArtifactId || '')
    && String(policy?.sourceArtifact?.scenarioHash || '') === String(scenario.chartScenarioHash || '')
    && String(policy?.node?.sourceNode || '') === String(scenario.chartSourceNode || '')
    && policy?.fallbackReason === null
    && (policy?.validDomain?.approximatedDimensions || []).length === 0
    && canonicalPolicyActionSetMatchesQuestion(question)
    && policy?.key?.street === 'preflop'
    && Array.isArray(policy?.key?.board)
    && policy.key.board.length === 0
    && JSON.stringify(policy?.key?.holding || []) === JSON.stringify(normalizeHolding(question?.heroCards || []))
    && String(policy?.key?.positions?.hero || '') === String(scenario.heroPosition || '').toUpperCase()
    && Array.isArray(policy?.key?.stackVector)
    && policy.key.stackVector.some((entry) => (
      String(entry?.position || '').toUpperCase() === String(scenario.heroPosition || '').toUpperCase()
      && Number(entry?.stackBb) === Number(scenario.stackDepth)
    ));
}

/**
 * Decide whether one canonical question is strong enough to mint a signed,
 * progress-eligible receipt. Structural question validity is necessary but
 * not sufficient: historical serving code could make an incomplete row look
 * complete by inventing cards, seats, streets, pots, and stacks. Only the
 * explicitly audited content families below may cross this authority boundary.
 */
export function trainingQuestionCampaignEligibility(question) {
  if (!question || typeof question !== 'object' || Array.isArray(question)) {
    return eligibility(false, 'question_missing');
  }
  if (!isTrainingQuestionValid(question)) {
    return eligibility(false, 'question_contract_invalid');
  }
  if (hasExplicitPracticeOrIllustrativeFlag(question)) {
    return eligibility(false, 'practice_or_illustrative');
  }

  const source = normalizeAuthorityValue(question.source);
  const sourceClassification = normalizeAuthorityValue(sourceClassificationForQuestion(question));
  const dataQuality = normalizeAuthorityValue(question.dataQuality);
  if (INELIGIBLE_SOURCES.has(source) || hasDisqualifyingAuthorityMarker(question)) {
    return eligibility(false, 'authority_unverified');
  }
  if (question?.solverProvenance?.verified === false) {
    return eligibility(false, 'solver_provenance_unverified');
  }

  const scenario = question.scenario || {};
  if (scenario.isPsychology === true) {
    return source === 'PSYCHOLOGY_BANK'
      && sourceClassification === 'CURATED'
      && dataQuality === 'CURATED'
      && canonicalCuratedPolicyMatchesQuestion(question)
      ? eligibility(true, 'curated_psychology')
      : eligibility(false, 'psychology_authority_missing');
  }

  if (scenario.isConceptQuestion === true) {
    return source === 'CURATED_SCENARIO'
      && normalizeAuthorityValue(question.dataQuality) === 'CURATED'
      && sourceClassification === 'CURATED'
      && canonicalCuratedPolicyMatchesQuestion(question)
      && String(question.evidenceDisclosure || '') === CURATED_CONCEPT_DISCLOSURE
      ? eligibility(true, 'curated_concept')
      : eligibility(false, 'concept_authority_missing');
  }

  if (source === 'LOCAL_SOLVER_RANGES') {
    // Static local frequencies remain useful for unscored practice, but a
    // historical label cannot promote them into progress-bearing solver data.
    // No audited local-policy system is defined by this contract today.
    return eligibility(false, 'local_range_provenance_missing');
  }

  if (!isVerifiedSolverQuestion(question)) {
    return eligibility(false, 'audited_decision_authority_missing');
  }

  if (source === 'CHART') {
    if (normalizeAuthorityValue(question.type) !== 'CHART'
      || sourceClassification !== 'CHART_AUDITED'
      || dataQuality !== 'CHART_AUDITED'
      || !canonicalChartPolicyMatchesQuestion(question)
      || !CHART_DISCLOSURES.has(String(question.evidenceDisclosure || ''))) {
      return eligibility(false, 'chart_authority_missing');
    }
  } else if (!['SOLVER_EXACT', 'SOLVER_DERIVED_RESPONSE'].includes(sourceClassification)
    || dataQuality !== sourceClassification
    || !hasCompleteAuditedSolverProvenance(question)
    || !canonicalSolverPolicyMatchesQuestion(question)
    || (sourceClassification === 'SOLVER_EXACT'
      ? (question.solverPolicy?.kind !== 'exact'
        || question.solverPolicy?.qualitySeal !== 'SOLVER_EXACT'
        || question.solverPolicy?.fallbackReason !== null
        || question.solverPolicy?.validDomain?.completeKey !== true
        || (question.solverPolicy?.validDomain?.approximatedDimensions || []).length !== 0)
      : (question.solverPolicy?.kind !== 'derived'
        || question.solverPolicy?.qualitySeal !== 'SOLVER_DERIVED_RESPONSE'
        || question.solverPolicy?.fallbackReason !== 'decision_key_incomplete'
        || (question.solverPolicy?.validDomain?.approximatedDimensions || []).length !== 0))
    || (sourceClassification === 'SOLVER_EXACT'
      ? String(question.evidenceDisclosure || '') !== EXACT_SOLVER_DISCLOSURE
      : String(question.evidenceDisclosure || '') !== DERIVED_SOLVER_DISCLOSURE)) {
    return eligibility(false, 'solver_provenance_missing');
  }

  return hasCompletePokerContext(question)
    ? eligibility(true, 'audited_poker_decision')
    : eligibility(false, 'poker_context_incomplete');
}

export function isTrainingQuestionCampaignEligible(question) {
  return trainingQuestionCampaignEligibility(question).eligible;
}

export function trainingAttemptConfigHash(config = {}) {
  return createHash('sha256').update(stableTrainingQuestionJson(config)).digest('hex');
}

export function buildTrainingQuestionSnapshot({ canonicalQuestion, gameId, level }) {
  const sourceQuestionId = String(canonicalQuestion?.id || '').slice(0, 180);
  const safeGameId = String(gameId || '').slice(0, 100);
  const safeLevel = normalizedLevel(level);
  if (!sourceQuestionId || !safeGameId) {
    throw new TrainingAttemptDeliveryError(
      'A canonical question, game, and level are required for a snapshot.',
      'TRAINING_QUESTION_SNAPSHOT_INPUT_INVALID',
      500,
    );
  }
  const contentDigest = trainingQuestionDigest(canonicalQuestion);
  const snapshotKey = createHash('sha256')
    .update(`${safeGameId}\u0000${safeLevel}\u0000${sourceQuestionId}\u0000${contentDigest}`)
    .digest('hex');
  return Object.freeze({
    snapshot_key: snapshotKey,
    source_question_id: sourceQuestionId,
    game_id: safeGameId,
    level: safeLevel,
    content_digest: contentDigest,
    question_data: canonicalQuestion,
  });
}

function unwrapRpcData(result) {
  const data = result?.data;
  if (Array.isArray(data)) return data[0] || null;
  return data || null;
}

/**
 * Persist immutable canonical snapshots, create/resume one server-owned
 * attempt, register its numbered hand slots, and return freshly signed
 * questions reconstructed from the manifest that won any concurrent race.
 */
export async function prepareTrainingAttemptDelivery({
  supabase,
  userId,
  clientSessionId,
  gameId,
  level,
  sessionKind = 'campaign',
  difficultyMode = 'standard',
  requestedHands,
  questions,
  handOrdinalStart = 1,
  parentAttemptId = null,
  config = {},
  requireFullAttempt = false,
}) {
  if (!supabase || !userId || !clientSessionId || !gameId || !Array.isArray(questions)) {
    throw new TrainingAttemptDeliveryError('Training attempt delivery input is incomplete.', undefined, 500);
  }

  const safeLevel = normalizedLevel(level);
  const kind = normalizeTrainingSessionKind(sessionKind);
  const targetHands = resolveTrainingSessionTarget({
    level: safeLevel,
    sessionKind: kind,
    requestedHands,
  });
  const start = Number.parseInt(handOrdinalStart, 10) || 1;
  if (questions.length < 1 || start < 1 || start + questions.length - 1 > targetHands) {
    throw new TrainingAttemptDeliveryError(
      'The delivered question range does not fit the configured attempt.',
      'TRAINING_ATTEMPT_HAND_RANGE_INVALID',
    );
  }
  if (requireFullAttempt && (start !== 1 || questions.length !== targetHands)) {
    throw new TrainingAttemptDeliveryError(
      `This session requires exactly ${targetHands} canonical hands before it can start.`,
      'TRAINING_ATTEMPT_QUESTION_SHORTFALL',
      503,
    );
  }

  if (kind !== 'replay') {
    const rejected = questions
      .map((question, index) => ({ index, result: trainingQuestionCampaignEligibility(question) }))
      .find(({ result }) => !result.eligible);
    if (rejected) {
      throw new TrainingAttemptDeliveryError(
        `Question ${rejected.index + 1} is not eligible for a progress-bearing Training attempt (${rejected.result.reason}).`,
        'TRAINING_ATTEMPT_QUESTION_AUTHORITY_INELIGIBLE',
        422,
      );
    }
  }

  const safeDifficulty = normalizeTrainingDifficultyMode(difficultyMode);
  const configHash = trainingAttemptConfigHash({
    ...config,
    gameId: String(gameId),
    level: safeLevel,
    sessionKind: kind,
    difficultyMode: safeDifficulty,
    targetHands,
  });
  const candidateSnapshots = questions.map((canonicalQuestion) => buildTrainingQuestionSnapshot({
    canonicalQuestion,
    gameId,
    level: safeLevel,
  }));

  await runTrainingPersistenceQuery(
    () => supabase.from('training_question_snapshots').upsert(candidateSnapshots, {
      onConflict: 'snapshot_key',
      ignoreDuplicates: true,
      defaultToNull: false,
    }),
    { label: 'TrainingAttempt:snapshot-write' },
  );

  const startResult = await runTrainingPersistenceQuery(
    () => supabase.rpc('fn_start_training_attempt_v2', {
      p_user_id: userId,
      p_client_nonce: String(clientSessionId).slice(0, 180),
      p_game_id: String(gameId).slice(0, 100),
      p_level: safeLevel,
      p_session_kind: kind,
      p_difficulty: safeDifficulty,
      p_expected_hands: targetHands,
      p_config_hash: configHash,
      p_parent_attempt_id: parentAttemptId || null,
    }),
    { label: 'TrainingAttempt:start' },
  );
  const started = unwrapRpcData(startResult);
  if (!started?.success || !started?.attemptId) {
    throw new TrainingAttemptDeliveryError(
      started?.error || 'The Training attempt could not be created.',
      started?.code || 'TRAINING_ATTEMPT_START_FAILED',
      started?.status || 409,
    );
  }
  const attemptId = String(started.attemptId);
  const handRows = candidateSnapshots.map((snapshot, index) => ({
    attempt_id: attemptId,
    hand_ordinal: start + index,
    snapshot_key: snapshot.snapshot_key,
    scoring_rule: 'initial_decision',
  }));

  await runTrainingPersistenceQuery(
    () => supabase.from('training_attempt_hands').upsert(handRows, {
      onConflict: 'attempt_id,hand_ordinal',
      ignoreDuplicates: true,
      defaultToNull: false,
    }),
    { label: 'TrainingAttempt:hand-register' },
  );
  const manifestResult = await runTrainingPersistenceQuery(
    () => supabase.from('training_attempt_hands')
      .select('hand_ordinal, snapshot_key')
      .eq('attempt_id', attemptId)
      .gte('hand_ordinal', start)
      .lte('hand_ordinal', start + questions.length - 1)
      .order('hand_ordinal', { ascending: true }),
    { label: 'TrainingAttempt:hand-read' },
  );
  const manifestHands = manifestResult.data || [];
  if (manifestHands.length !== questions.length) {
    throw new TrainingAttemptDeliveryError(
      'The Training hand manifest is incomplete.',
      'TRAINING_ATTEMPT_MANIFEST_INCOMPLETE',
      503,
    );
  }
  const snapshotKeys = manifestHands.map((hand) => hand.snapshot_key);
  const snapshotResult = await runTrainingPersistenceQuery(
    () => supabase.from('training_question_snapshots')
      .select('snapshot_key, source_question_id, game_id, level, content_digest, question_data')
      .in('snapshot_key', snapshotKeys),
    { label: 'TrainingAttempt:snapshot-read' },
  );
  const snapshotByKey = new Map((snapshotResult.data || []).map((row) => [row.snapshot_key, row]));
  const manifested = manifestHands.map((hand) => snapshotByKey.get(hand.snapshot_key));
  if (manifested.some((snapshot) => (
    !snapshot
    || String(snapshot.game_id) !== String(gameId)
    || Number(snapshot.level) !== safeLevel
    || trainingQuestionDigest(snapshot.question_data) !== String(snapshot.content_digest)
  ))) {
    throw new TrainingAttemptDeliveryError(
      'The Training question snapshot failed its integrity check.',
      'TRAINING_QUESTION_SNAPSHOT_MISMATCH',
      503,
    );
  }
  if (kind !== 'replay') {
    const rejectedManifest = manifested
      .map((snapshot, index) => ({
        index,
        result: trainingQuestionCampaignEligibility(snapshot.question_data),
      }))
      .find(({ result }) => !result.eligible);
    if (rejectedManifest) {
      throw new TrainingAttemptDeliveryError(
        `The persisted question in hand ${start + rejectedManifest.index} is not eligible for a progress-bearing Training attempt (${rejectedManifest.result.reason}).`,
        'TRAINING_ATTEMPT_MANIFEST_AUTHORITY_INELIGIBLE',
        422,
      );
    }
  }

  const servedQuestions = manifested.map((snapshot, index) => prepareTrainingQuestionForDelivery({
    canonicalQuestion: snapshot.question_data,
    userId,
    gameId,
    level: safeLevel,
    sessionId: clientSessionId,
    attemptId,
    snapshotKey: snapshot.snapshot_key,
    sessionKind: kind,
    sessionTargetHands: targetHands,
    handOrdinal: start + index,
    decisionOrdinal: 1,
    countsTowardCompletion: true,
    practiceOnly: kind === 'replay',
    difficultyMode: safeDifficulty,
  }));

  return Object.freeze({
    attemptId,
    clientSessionId: String(clientSessionId),
    sessionKind: kind,
    targetHands,
    handOrdinalStart: start,
    configHash,
    questions: servedQuestions,
  });
}

export function isTrainingAttemptContractError(error) {
  return error instanceof TrainingAttemptDeliveryError
    || error instanceof TrainingSessionAttemptContractError;
}
