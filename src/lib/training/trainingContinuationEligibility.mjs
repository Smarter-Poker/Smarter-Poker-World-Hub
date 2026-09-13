import { toHandClass } from '../../engines/deterministicEnginePatches.js';
import { enforceTrainingQuestionContract, isTrainingQuestionValid } from './questionContract.mjs';
import { sourceClassificationForQuestion } from './cacheTruthContract.mjs';
import { normalizeBoard, normalizeHolding } from './solverPolicyContract.js';
import { applyDifficultyToQuestion } from './difficultyQuestionContract.mjs';
import { isExactPioRake } from '../../utils/v2Matrix.js';
import {
  isTrainingAttestationContinuationPrecommit,
  selectPublicAttestationContinuationAnswer,
} from './trainingAttestationContinuationContract.mjs';

const CARD_RE = /^[2-9TJQKA][shdc]$/;
const SUITS = ['s', 'h', 'd', 'c'];
const RANKS = ['2', '3', '4', '5', '6', '7', '8', '9', 'T', 'J', 'Q', 'K', 'A'];
const RANK_VALUES = Object.freeze({
  2: 2, 3: 3, 4: 4, 5: 5, 6: 6, 7: 7, 8: 8, 9: 9,
  T: 10, J: 11, Q: 12, K: 13, A: 14,
});
const POSITIONS = new Set(['UTG', 'UTG+1', 'MP', 'MP+1', 'HJ', 'CO', 'BTN', 'SB', 'BB']);
const SOLVER_PATH_TOKEN_RE = /^(?:c|b[1-9]\d*|[2-9TJQKA][cdhs])$/;
const CONTINUATION_ACTION_RE = /^b[1-9]\d*$/;
const SHA256_RE = /^[0-9a-f]{64}$/i;
const GIT_SHA_RE = /^[0-9a-f]{40}$/i;
const STREET_BOARD_COUNTS = Object.freeze({ flop: 3, turn: 4, river: 5 });

function parseCards(value) {
  const normalize = (card) => {
    const token = String(card || '').trim();
    return token.length === 2 ? `${token[0].toUpperCase()}${token[1].toLowerCase()}` : token;
  };
  if (Array.isArray(value)) return value.map(normalize).filter(Boolean);
  const compact = String(value || '').replace(/[\s,]+/g, '');
  return (compact.match(/[2-9TJQKA][shdc]/gi) || []).map(normalize);
}

export function firstCardSet(...values) {
  for (const value of values) {
    const cards = parseCards(value);
    if (cards.length > 0) return cards;
  }
  return [];
}

export function authoritativeHandState(question) {
  const scenario = question?.scenario || {};
  const currentStreet = String(scenario.street || question?.street || '').toLowerCase();
  const nextStreet = currentStreet === 'flop' ? 'turn' : currentStreet === 'turn' ? 'river' : null;
  const boardCards = firstCardSet(
    scenario.boardCards, scenario.board, question?.boardCards, question?.board,
  );
  const heroCards = firstCardSet(question?.heroCards, scenario.heroCards, question?.cards);
  const heroHand = toHandClass(heroCards) || toHandClass(question?.heroHand || scenario.heroHand);
  const heroPosition = String(scenario.heroPosition || scenario.position || '').toUpperCase();
  const villainPosition = String(scenario.villainPosition || '').toUpperCase();
  const pot = Number(scenario.pot ?? scenario.potSize);
  // `solverStackDepth` identifies the immutable tree family. `stackDepth`
  // becomes the exact effective stack at a child node, so it must never be
  // recycled as the next warehouse lookup's root-stack identity.
  const stackDepth = Number(
    scenario.solverStackDepth
    ?? question?.solverStackDepth
    ?? scenario.stackDepth
    ?? question?.stackDepth,
  );
  const effectiveStackDepth = Number(
    scenario.stackDepth ?? scenario.heroStack ?? question?.stackDepth,
  );
  const expectedBoardCount = currentStreet === 'flop' ? 3 : currentStreet === 'turn' ? 4 : 0;
  const normalizedCards = [...heroCards, ...boardCards].map((card) => card.toLowerCase());
  const valid = Boolean(
    nextStreet
    && boardCards.length === expectedBoardCount
    && heroCards.length === 2
    && [...boardCards, ...heroCards].every((card) => CARD_RE.test(card))
    && new Set(normalizedCards).size === normalizedCards.length
    && heroHand
    && POSITIONS.has(heroPosition)
    && POSITIONS.has(villainPosition)
    && heroPosition !== villainPosition
    && Number.isFinite(pot)
    && pot > 0
    && Number.isFinite(stackDepth)
    && Number.isSafeInteger(stackDepth)
    && stackDepth > 0
    && Number.isFinite(effectiveStackDepth)
    && effectiveStackDepth > 0
    && effectiveStackDepth <= stackDepth
  );
  return {
    valid,
    currentStreet,
    nextStreet,
    boardCards,
    heroCards,
    heroHand,
    heroPosition,
    villainPosition,
    pot,
    stackDepth,
    effectiveStackDepth,
  };
}

function parseContinuationNode(node) {
  if (typeof node !== 'string' || !node.startsWith('r:0')) return null;
  const tokens = node.split(':');
  if (tokens.length < 2 || tokens.some((token) => token === '')) return null;
  let actor = 'OOP';
  const runoutCards = [];
  for (const token of tokens.slice(2)) {
    if (!SOLVER_PATH_TOKEN_RE.test(token)) return null;
    if (CARD_RE.test(token)) {
      if (runoutCards.includes(token)) return null;
      runoutCards.push(token);
      actor = 'OOP';
    } else {
      actor = actor === 'OOP' ? 'IP' : 'OOP';
    }
  }
  return { node, actor, runoutCards };
}

function canonicalSolverScenarioHash({ street, gameType, heroPosition, stackDepth, boardCards }) {
  const family = String(gameType || '');
  const normalizedStreet = String(street || '').toLowerCase();
  const expectedBoardCount = STREET_BOARD_COUNTS[normalizedStreet];
  if (!/^[a-z0-9]+(?:_[a-z0-9]+)*$/.test(family)
    || !['flop', 'turn', 'river'].includes(normalizedStreet)
    || !POSITIONS.has(heroPosition)
    || !Number.isSafeInteger(stackDepth)
    || stackDepth <= 0
    || !Array.isArray(boardCards)
    || boardCards.length !== expectedBoardCount
    || boardCards.some((card) => !CARD_RE.test(card))
    || new Set(boardCards.map((card) => card.toLowerCase())).size !== boardCards.length) return null;
  const prefix = normalizedStreet === 'flop' ? '' : `${normalizedStreet}_`;
  return `${prefix}${family}_${heroPosition}_${stackDepth}bb_${boardCards.join('')}`;
}

function canonicalContinuationPolicyMatchesQuestion(question) {
  const policy = question?.solverPolicy;
  const provenance = question?.solverProvenance;
  const scenario = question?.scenario || {};
  const classification = sourceClassificationForQuestion(question);
  const optionIds = (Array.isArray(question?.options) ? question.options : [])
    .map((option) => String(option?.id || '').trim().toLowerCase())
    .filter(Boolean)
    .sort();
  const policyIds = (Array.isArray(policy?.actions) ? policy.actions : [])
    .filter((action) => action?.legal !== false)
    .map((action) => String(action?.id || '').trim().toLowerCase())
    .filter(Boolean)
    .sort();
  const exactAuthority = classification === 'SOLVER_EXACT'
    && policy?.kind === 'exact'
    && policy?.qualitySeal === 'SOLVER_EXACT'
    && policy?.fallbackReason === null
    && policy?.validDomain?.completeKey === true
    && (policy?.validDomain?.approximatedDimensions || []).length === 0;
  // The present v2 warehouse proves an exact row/node/runout identity but it
  // does not carry a complete checksummed canonical decision key. Preserve
  // that distinction: the continuation lookup is exact while its answer
  // authority remains explicitly solver-derived.
  const derivedAuthority = classification === 'SOLVER_DERIVED_RESPONSE'
    && policy?.kind === 'derived'
    && policy?.qualitySeal === 'SOLVER_DERIVED_RESPONSE'
    && policy?.fallbackReason === 'decision_key_incomplete'
    && policy?.validDomain?.completeKey === false
    && (policy?.validDomain?.approximatedDimensions || []).length === 0;
  const source = policy?.sourceArtifact;
  const key = policy?.key;
  const scenarioPot = Number(scenario.pot);
  return Boolean(
    (exactAuthority || derivedAuthority)
    && question?.dataQuality === classification
    && source?.system === 'solved_spots_gold_v2'
    && source?.provenanceComplete === true
    && provenance?.verified === true
    && provenance?.source === 'PioSOLVER'
    && source?.scenarioHash === scenario.scenarioHash
    && source?.scenarioHash === provenance.scenarioHash
    && source?.solverVersion === provenance.solverVersion
    && source?.solverBinaryChecksum === provenance.solverBinaryChecksum
    && source?.machineId === provenance.machineId
    && source?.pipelineCommit === provenance.pipelineCommit
    && String(source?.manifestVersion) === String(provenance.manifestVersion)
    && source?.manifestChecksum === provenance.manifestChecksum
    && source?.sourceArtifactChecksum === provenance.sourceArtifactChecksum
    && source?.qualityStatus === provenance.qualityStatus
    && String(source?.auditedAt) === String(provenance.auditedAt)
    && String(policy?.node?.sourceNode || '') === String(scenario.solverNode || '')
    && Number.isFinite(scenarioPot)
    && Number(policy?.node?.potBb) === scenarioPot
    && String(key?.street || '') === String(scenario.street || question?.street || '').toLowerCase()
    && JSON.stringify(key?.board || []) === JSON.stringify(normalizeBoard(question?.boardCards || []))
    && JSON.stringify(key?.holding || []) === JSON.stringify(normalizeHolding(question?.heroCards || []))
    && String(key?.positions?.hero || '') === String(scenario.heroPosition || '').toUpperCase()
    && Array.isArray(key?.positions?.villains)
    && key.positions.villains.includes(String(scenario.villainPosition || '').toUpperCase())
    && optionIds.length >= 2
    && new Set(optionIds).size === optionIds.length
    && JSON.stringify(optionIds) === JSON.stringify(policyIds)
  );
}

/**
 * Verify that the durable answer is the one canonical solver action allowed
 * to continue this hand. A merely-present predecessor row is insufficient:
 * another answer belongs to another branch of the tree.
 */
export function validatePersistedContinuationDecision(parentQuestion, persistedAnswerId) {
  const scenario = parentQuestion?.scenario || {};
  const sourceAction = typeof scenario.nextStreetContinuationAction === 'string'
    ? scenario.nextStreetContinuationAction.trim()
    : '';
  const optionIds = new Set(
    (Array.isArray(parentQuestion?.options) ? parentQuestion.options : [])
      .map((option) => String(option?.id || ''))
      .filter(Boolean),
  );
  const matchingPolicyActions = (Array.isArray(parentQuestion?.solverPolicy?.actions)
    ? parentQuestion.solverPolicy.actions
    : [])
    .filter((action) => (
      action?.legal !== false
      && String(action?.sourceCode || '').trim() === sourceAction
    ));
  const canonicalAction = matchingPolicyActions.length === 1
    ? String(matchingPolicyActions[0]?.id || '').trim()
    : '';

  // The currently certified continuation contract is deliberately narrow:
  // hero is IP at a check/bet node, takes a chip-denominated bet branch, OOP
  // calls, the runout is dealt, then OOP checks to hero. Fold, all-in, call,
  // raise, percentages, prose labels, or an action absent from this exact
  // question are all terminal/off-tree here.
  if (!canonicalContinuationPolicyMatchesQuestion(parentQuestion)
    || !CONTINUATION_ACTION_RE.test(sourceAction)
    || scenario.solverActionUnits !== 'chips'
    || scenario.nodeType !== 'hero_bets_or_checks'
    || matchingPolicyActions[0]?.family !== 'bet'
    || matchingPolicyActions[0]?.size?.exact !== true
    || !Number.isFinite(Number(matchingPolicyActions[0]?.size?.chips))
    || Number(matchingPolicyActions[0].size.chips) <= 0
    || !optionIds.has(canonicalAction)) {
    return {
      ok: false,
      status: 422,
      code: 'TRAINING_CONTINUATION_ACTION_INVALID',
      error: 'The canonical hand has no exact non-terminal solver continuation action.',
    };
  }
  if (typeof persistedAnswerId !== 'string' || persistedAnswerId !== canonicalAction) {
    return {
      ok: false,
      status: 409,
      code: 'TRAINING_CONTINUATION_ACTION_MISMATCH',
      error: 'The saved decision does not match the canonical continuation branch.',
    };
  }
  return { ok: true, action: sourceAction, answerId: canonicalAction };
}

/**
 * Resolve a persisted public answer back to the one canonical solver action
 * that owns the certified continuation branch. Grouped sizing bands are valid
 * only when their immutable member list contains exactly one such action.
 */
export function validatePersistedContinuationDecisionForDifficulty(
  parentQuestion,
  persistedAnswerId,
  difficultyMode,
) {
  const servedQuestion = applyDifficultyToQuestion(parentQuestion, difficultyMode);
  const selectedAnswer = String(persistedAnswerId || '').trim();
  const selectedOption = (Array.isArray(servedQuestion?.options) ? servedQuestion.options : [])
    .find((option) => String(option?.id || '').trim() === selectedAnswer);
  if (!selectedOption) {
    return validatePersistedContinuationDecision(parentQuestion, selectedAnswer);
  }
  const mappedMembers = servedQuestion?._difficultyMembers?.[selectedAnswer];
  const candidateAnswerIds = Array.isArray(mappedMembers)
    ? [...new Set(mappedMembers.map((member) => String(member || '').trim()).filter(Boolean))]
    : [selectedAnswer];
  const matchingDecisions = candidateAnswerIds
    .map((candidateAnswerId) => validatePersistedContinuationDecision(
      parentQuestion,
      candidateAnswerId,
    ))
    .filter((decision) => decision.ok);
  if (matchingDecisions.length !== 1) {
    return {
      ok: false,
      status: 409,
      code: 'TRAINING_CONTINUATION_ACTION_MISMATCH',
      error: 'The saved decision does not uniquely contain the canonical continuation branch.',
    };
  }
  return {
    ...matchingDecisions[0],
    publicAnswerId: selectedAnswer,
  };
}

/** Construct the one exact child row/node that may follow the signed parent. */
export function buildExactContinuationLineage({
  parentQuestion,
  gameConfig,
  state,
  nextBoard,
  continuationAction,
}) {
  const scenario = parentQuestion?.scenario || {};
  const provenance = parentQuestion?.solverProvenance || {};
  const solverLineage = scenario.solverLineage || {};
  const gameType = String(gameConfig?.pioGameType || '');
  const currentBoard = Array.isArray(state?.boardCards) ? state.boardCards : [];
  const exactNextBoard = Array.isArray(nextBoard)
    && nextBoard.length === currentBoard.length + 1
    && currentBoard.every((card, index) => card === nextBoard[index])
    && CARD_RE.test(nextBoard.at(-1))
    && !currentBoard.includes(nextBoard.at(-1));
  const parentScenarioHash = canonicalSolverScenarioHash({
    street: state?.currentStreet,
    gameType,
    heroPosition: state?.heroPosition,
    stackDepth: state?.stackDepth,
    boardCards: state?.boardCards,
  });
  const childScenarioHash = canonicalSolverScenarioHash({
    street: state?.nextStreet,
    gameType,
    heroPosition: state?.heroPosition,
    stackDepth: state?.stackDepth,
    boardCards: nextBoard,
  });
  const parentNode = parseContinuationNode(scenario.solverNode);
  const exposedRunout = parentNode?.runoutCards || [];
  const parentRunoutMatches = exposedRunout.length <= Math.max(0, (state?.boardCards?.length || 0) - 3)
    && exposedRunout.every(
      (card, index) => card === state.boardCards[state.boardCards.length - exposedRunout.length + index],
    );
  const exactRelease = Boolean(
    canonicalContinuationPolicyMatchesQuestion(parentQuestion)
    && SHA256_RE.test(String(parentQuestion?.policyChecksum || ''))
    && provenance.verified === true
    && provenance.source === 'PioSOLVER'
    && provenance.qualityStatus === 'validated'
    && provenance.scenarioHash === parentScenarioHash
    && scenario.scenarioHash === parentScenarioHash
    && provenance.solverVersion
    && SHA256_RE.test(String(provenance.solverBinaryChecksum || ''))
    && ['M1', 'M2'].includes(String(provenance.machineId || ''))
    && GIT_SHA_RE.test(String(provenance.pipelineCommit || ''))
    && provenance.manifestVersion
    && SHA256_RE.test(String(provenance.manifestChecksum || ''))
    && SHA256_RE.test(String(provenance.sourceArtifactChecksum || ''))
    && provenance.auditedAt
    && Number.isFinite(Number(solverLineage.rootPotBb))
    && Number(solverLineage.rootPotBb) > 0
    && Number.isFinite(Number(solverLineage.effectiveStackBb))
    && Number(solverLineage.effectiveStackBb) > 0
    && Number(solverLineage.effectiveStackBb) <= state.stackDepth
    && isExactPioRake(solverLineage.rake)
    && /^[a-z0-9]+(?:_[a-z0-9]+)*$/.test(String(solverLineage.treeGeometry || ''))
    && solverLineage.ipPosition === state.heroPosition
    && solverLineage.oopPosition === state.villainPosition
  );
  if (!parentScenarioHash
    || !childScenarioHash
    || !exactNextBoard
    || Number(gameConfig?.pioStackDepth) !== state?.stackDepth
    || !parentNode
    || parentNode.actor !== 'IP'
    || !parentRunoutMatches
    || !CONTINUATION_ACTION_RE.test(String(continuationAction || ''))
    || continuationAction !== scenario.nextStreetContinuationAction
    || !exactRelease) return null;

  const newCard = nextBoard?.at(-1);
  const childNode = `${parentNode.node}:${continuationAction}:c:${newCard}:c`;
  const parsedChildNode = parseContinuationNode(childNode);
  if (!parsedChildNode
    || parsedChildNode.actor !== 'IP'
    || parsedChildNode.runoutCards.length !== exposedRunout.length + 1
    || parsedChildNode.runoutCards.at(-1) !== newCard) return null;

  return {
    parentScenarioHash,
    parentNode: parentNode.node,
    continuationAction,
    childScenarioHash,
    childNode,
    childStreet: state.nextStreet,
    gameType,
    boardCards: [...nextBoard],
    heroPosition: state.heroPosition,
    villainPosition: state.villainPosition,
    solverStackDepth: state.stackDepth,
    release: {
      solverVersion: provenance.solverVersion,
      solverBinaryChecksum: provenance.solverBinaryChecksum,
      pipelineCommit: provenance.pipelineCommit,
      manifestVersion: provenance.manifestVersion,
      manifestChecksum: provenance.manifestChecksum,
      rootPotBb: Number(solverLineage.rootPotBb),
      effectiveStackBb: Number(solverLineage.effectiveStackBb),
      rake: solverLineage.rake,
      treeGeometry: solverLineage.treeGeometry,
      oopPosition: solverLineage.oopPosition,
      ipPosition: solverLineage.ipPosition,
    },
  };
}

/**
 * Attach public hand metadata without transplanting the parent's pre-action
 * pot or stack. Both values must already come from the exact child v2 row.
 */
export function bindExactContinuationQuestion(generated, { state, nextBoard, lineage }) {
  const scenario = generated?.scenario || {};
  const provenance = generated?.solverProvenance || {};
  const childPot = Number(scenario.pot);
  const childStack = Number(scenario.stackDepth);
  const solverStackDepth = Number(scenario.solverStackDepth);
  const solverLineage = scenario.solverLineage || {};
  const canonicalBoard = parseCards(scenario.boardCards || scenario.board);
  if (!generated
    || scenario.scenarioHash !== lineage?.childScenarioHash
    || scenario.solverNode !== lineage?.childNode
    || String(scenario.street || '').toLowerCase() !== lineage?.childStreet
    || scenario.heroPosition !== lineage?.heroPosition
    || scenario.villainPosition !== lineage?.villainPosition
    || !canonicalContinuationPolicyMatchesQuestion(generated)
    || provenance.verified !== true
    || provenance.source !== 'PioSOLVER'
    || provenance.qualityStatus !== 'validated'
    || provenance.scenarioHash !== lineage?.childScenarioHash
    || provenance.solverVersion !== lineage?.release?.solverVersion
    || provenance.solverBinaryChecksum !== lineage?.release?.solverBinaryChecksum
    || provenance.pipelineCommit !== lineage?.release?.pipelineCommit
    || String(provenance.manifestVersion) !== String(lineage?.release?.manifestVersion)
    || provenance.manifestChecksum !== lineage?.release?.manifestChecksum
    || !SHA256_RE.test(String(provenance.sourceArtifactChecksum || ''))
    || !['M1', 'M2'].includes(String(provenance.machineId || ''))
    || !provenance.auditedAt
    || Number(solverLineage.rootPotBb) !== Number(lineage?.release?.rootPotBb)
    || Number(solverLineage.effectiveStackBb) !== Number(lineage?.release?.effectiveStackBb)
    || solverLineage.rake !== lineage?.release?.rake
    || solverLineage.treeGeometry !== lineage?.release?.treeGeometry
    || solverLineage.oopPosition !== lineage?.release?.oopPosition
    || solverLineage.ipPosition !== lineage?.release?.ipPosition
    || canonicalBoard.join('') !== nextBoard.join('')
    || !Number.isFinite(childPot)
    || childPot <= 0
    || !Number.isFinite(childStack)
    || childStack <= 0
    || childStack > lineage.solverStackDepth
    || solverStackDepth !== lineage.solverStackDepth) return null;

  return {
    ...generated,
    scenario: {
      ...scenario,
      board: nextBoard.join(' '),
      boardCards: [...nextBoard],
      street: lineage.childStreet,
      heroCards: [...state.heroCards],
      heroHand: state.heroHand,
      heroPosition: lineage.heroPosition,
      villainPosition: lineage.villainPosition,
      isMultiStreet: true,
    },
    heroCards: [...state.heroCards],
    heroHand: state.heroHand,
    boardCards: [...nextBoard],
  };
}

/**
 * Re-prove a persisted parent/child snapshot pair without generating or
 * writing anything. This uses the same strict branch, release, runout, node,
 * geometry, and provenance contract as the live next-street resolver.
 */
export function validateStrictTrainingContinuationSnapshotPair({
  parentQuestion,
  childQuestion,
  persistedAnswerId,
  difficultyMode = 'exact',
  gameConfig,
}) {
  const parentSourceClassification = sourceClassificationForQuestion(parentQuestion);
  if (!['SOLVER_EXACT', 'SOLVER_DERIVED_RESPONSE'].includes(parentSourceClassification)) {
    return continuationFailure(
      422,
      'TRAINING_CONTINUATION_PARENT_NOT_EXACT',
      'The persisted parent has no provenance-complete solver lineage.',
    );
  }
  const state = authoritativeHandState(parentQuestion);
  if (!state.valid || !gameConfig) {
    return continuationFailure(
      422,
      'TRAINING_CONTINUATION_STATE_INVALID',
      'The persisted continuation state is incomplete.',
    );
  }
  const continuationDecision = validatePersistedContinuationDecisionForDifficulty(
    parentQuestion,
    persistedAnswerId,
    difficultyMode,
  );
  if (!continuationDecision.ok) return continuationDecision;
  const nextBoard = firstCardSet(
    childQuestion?.scenario?.boardCards,
    childQuestion?.scenario?.board,
    childQuestion?.boardCards,
    childQuestion?.board,
  );
  const lineage = buildExactContinuationLineage({
    parentQuestion,
    gameConfig,
    state,
    nextBoard,
    continuationAction: continuationDecision.action,
  });
  const boundChild = lineage
    ? bindExactContinuationQuestion(childQuestion, { state, nextBoard, lineage })
    : null;
  const childSourceClassification = sourceClassificationForQuestion(childQuestion);
  if (!boundChild
    || !['SOLVER_EXACT', 'SOLVER_DERIVED_RESPONSE'].includes(childSourceClassification)) {
    return continuationFailure(
      422,
      'TRAINING_CONTINUATION_CHILD_NOT_EXACT',
      'The persisted child does not match the exact solver continuation lineage.',
    );
  }
  return Object.freeze({
    ok: true,
    parentSourceClassification,
    childSourceClassification,
    exactWarehouseLineage: true,
  });
}

function deterministicCardOrderValue(seedText, card, weight) {
  const text = `${seedText}:${card}`;
  let hash = 2166136261;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  // Exponential-race ordering gives weighted sampling without replacement.
  // It is deterministic, so retries inspect candidates in the same order.
  const unit = (Number(hash >>> 0) + 1) / 4294967297;
  return -Math.log(unit) / weight;
}

export function orderDeterministicEducationalCards(state) {
  const deadCards = new Set([...state.heroCards, ...state.boardCards].map((card) => card.toLowerCase()));
  const available = RANKS.flatMap((rank) => SUITS.map((suit) => `${rank}${suit}`))
    .filter((card) => !deadCards.has(card.toLowerCase()));
  const suitCounts = {};
  const boardRanks = new Set();
  const boardRankValues = state.boardCards.map((card) => {
    const suit = card.at(-1).toLowerCase();
    suitCounts[suit] = (suitCounts[suit] || 0) + 1;
    const rank = card[0].toUpperCase();
    boardRanks.add(rank);
    return RANK_VALUES[rank] || 0;
  });
  const maxBoardRank = Math.max(...boardRankValues);
  const seedText = `${state.heroCards.join('')}_${state.boardCards.join('')}_${state.nextStreet}`;
  return available.map((card) => {
    const rank = card[0].toUpperCase();
    const suit = card.at(-1).toLowerCase();
    const rankValue = RANK_VALUES[rank] || 0;
    let weight = 1;
    if (suitCounts[suit] === 2) weight += 0.8;
    if (suitCounts[suit] === 3) weight += 0.3;
    if (rankValue > maxBoardRank) weight += 0.5;
    if (boardRanks.has(rank)) weight += 0.6;
    if (boardRankValues.filter((value) => Math.abs(value - rankValue) <= 2 && value !== rankValue).length >= 2) {
      weight += 0.4;
    }
    return { card, order: deterministicCardOrderValue(seedText, card, weight) };
  }).sort((left, right) => left.order - right.order || left.card.localeCompare(right.card))
    .map(({ card }) => card);
}

function continuationFailure(status, code, error) {
  return Object.freeze({ ok: false, status, code, error });
}

/**
 * Apply the public rule to a canonical parent and retain it only when that
 * public answer selects the parent's one exact continuation branch. This is a
 * private server-side filter; callers must never serialize its result.
 */
export function selectPublicAttestationContinuationAnswerForStrictParent(
  parentQuestion,
  precommit,
  difficultyMode,
) {
  const sourceClassification = sourceClassificationForQuestion(parentQuestion);
  if (!isTrainingAttestationContinuationPrecommit(precommit)
    || !['SOLVER_EXACT', 'SOLVER_DERIVED_RESPONSE'].includes(sourceClassification)) return null;
  const servedQuestion = applyDifficultyToQuestion(parentQuestion, difficultyMode);
  const publicAnswer = selectPublicAttestationContinuationAnswer(
    servedQuestion,
    precommit.selectionRule,
  );
  if (!publicAnswer) return null;
  return validatePersistedContinuationDecisionForDifficulty(
    parentQuestion,
    publicAnswer,
    difficultyMode,
  ).ok
    ? publicAnswer
    : null;
}

/**
 * Resolve exactly the same immutable parent/action/runout/child contract used
 * by next-street without persisting the child. Callers may use this as a
 * fail-closed preflight; no cache, attempt, event, or answer write occurs here.
 */
export async function resolveStrictTrainingContinuation({
  parentQuestion,
  persistedAnswerId,
  gameConfig,
  queryNextStreet,
  requireProvenanceCompleteParent = false,
  difficultyMode = 'exact',
}) {
  if (
    requireProvenanceCompleteParent
    && !['SOLVER_EXACT', 'SOLVER_DERIVED_RESPONSE'].includes(
      sourceClassificationForQuestion(parentQuestion),
    )
  ) {
    return continuationFailure(
      422,
      'TRAINING_CONTINUATION_PARENT_NOT_EXACT',
      'The parent has no provenance-complete solver lineage.',
    );
  }

  const state = authoritativeHandState(parentQuestion);
  if (!state.valid) {
    return continuationFailure(
      422,
      'TRAINING_CONTINUATION_STATE_INVALID',
      'The canonical hand does not contain an exact legal next-street state.',
    );
  }
  const continuationDecision = validatePersistedContinuationDecisionForDifficulty(
    parentQuestion,
    persistedAnswerId,
    difficultyMode,
  );
  if (!continuationDecision.ok) return continuationDecision;
  if (!gameConfig) {
    return continuationFailure(404, 'TRAINING_CONTINUATION_GAME_CONFIG_MISSING', 'Game config not found');
  }
  const candidateCards = orderDeterministicEducationalCards(state);
  if (candidateCards.length === 0) {
    return continuationFailure(
      422,
      'TRAINING_CONTINUATION_RUNOUT_UNAVAILABLE',
      'No legal next-street card is available.',
    );
  }
  const continuationLineages = candidateCards.map((candidateCard) => {
    const boardCards = [...state.boardCards, candidateCard];
    return buildExactContinuationLineage({
      parentQuestion,
      gameConfig,
      state,
      nextBoard: boardCards,
      continuationAction: continuationDecision.action,
    });
  }).filter(Boolean);
  if (continuationLineages.length !== candidateCards.length) {
    return continuationFailure(
      422,
      'TRAINING_CONTINUATION_LINEAGE_INVALID',
      'The signed hand does not identify one exact solver continuation lineage.',
    );
  }
  if (typeof queryNextStreet !== 'function') {
    return continuationFailure(
      503,
      'TRAINING_CONTINUATION_RESOLVER_UNAVAILABLE',
      'The exact continuation resolver is unavailable.',
    );
  }

  const generated = await queryNextStreet({
    gameConfig,
    heroHand: state.heroHand,
    street: state.nextStreet,
    stackDepth: state.stackDepth,
    heroPosition: state.heroPosition,
    villainPosition: state.villainPosition,
    continuationLineages,
  });
  if (!generated) {
    return continuationFailure(
      404,
      'TRAINING_CONTINUATION_SOLVER_MISS',
      'No exact solver continuation exists for this runout.',
    );
  }
  const lineage = continuationLineages.find(
    (candidate) => candidate.childScenarioHash === generated?.scenario?.scenarioHash
      && candidate.childNode === generated?.scenario?.solverNode,
  );
  if (!lineage) {
    return continuationFailure(
      422,
      'TRAINING_CONTINUATION_CHILD_IDENTITY_INVALID',
      'The solver returned a child outside the deterministic candidate set.',
    );
  }
  const nextBoard = lineage.boardCards;
  const exactContinuation = bindExactContinuationQuestion(generated, {
    state,
    nextBoard,
    lineage,
  });
  if (!exactContinuation) {
    return continuationFailure(
      422,
      'TRAINING_CONTINUATION_CHILD_IDENTITY_INVALID',
      'The solver continuation does not match its exact child node and geometry.',
    );
  }
  const canonicalQuestion = enforceTrainingQuestionContract(exactContinuation);
  if (!canonicalQuestion?.id || !isTrainingQuestionValid(canonicalQuestion)) {
    return continuationFailure(
      422,
      'TRAINING_CONTINUATION_QUESTION_INVALID',
      'The next-street question did not pass the Training integrity contract.',
    );
  }
  return Object.freeze({
    ok: true,
    state,
    nextBoard,
    lineage,
    canonicalQuestion,
    answerId: continuationDecision.answerId,
  });
}

/**
 * Build an exact 20-parent attestation cohort. The qualifying parent and its
 * hidden continuation action never cross this boundary; callers receive only
 * the selected parent objects and the already-public precommit descriptor.
 */
export async function selectTrainingAttestationContinuationCohort({
  questionPairs,
  targetHands,
  difficultyMode,
  gameConfig,
  precommit,
  queryNextStreet,
}) {
  if (
    !isTrainingAttestationContinuationPrecommit(precommit)
    || targetHands !== 20
    || !Array.isArray(questionPairs)
    || questionPairs.length < targetHands
  ) return null;

  let qualifyingPair = null;
  for (const pair of questionPairs) {
    const canonicalQuestion = pair?.row?.question_data;
    const publicAnswer = selectPublicAttestationContinuationAnswerForStrictParent(
      canonicalQuestion,
      precommit,
      difficultyMode,
    );
    if (!publicAnswer) continue;
    let resolution;
    try {
      resolution = await resolveStrictTrainingContinuation({
        parentQuestion: canonicalQuestion,
        persistedAnswerId: publicAnswer,
        gameConfig,
        queryNextStreet,
        requireProvenanceCompleteParent: true,
        difficultyMode,
      });
    } catch {
      resolution = null;
    }
    if (resolution?.ok) {
      qualifyingPair = pair;
      break;
    }
  }
  if (!qualifyingPair) return null;

  const selected = questionPairs.slice(0, targetHands);
  if (!selected.includes(qualifyingPair)) {
    selected[targetHands - 1] = qualifyingPair;
  }
  // The public order is independently randomized after inclusion so neither a
  // replacement slot nor array position discloses the qualifying parent.
  const randomized = [...selected];
  for (let index = randomized.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1));
    [randomized[index], randomized[swapIndex]] = [randomized[swapIndex], randomized[index]];
  }
  return Object.freeze({
    questionPairs: Object.freeze(randomized),
    publicContract: precommit,
  });
}
