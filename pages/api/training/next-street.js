import { getServerUserWithFallback } from '../../../src/lib/serverAuth';
import { createClient } from '../../../src/lib/supabaseServerClient';
import { deterministicEngine } from '../../../src/engines/DeterministicGTOEngine';
import { applyDeterministicEnginePatches, toHandClass } from '../../../src/engines/deterministicEnginePatches';
import { pioQueryService } from '../../../src/services/PIOQueryService';
import { applyRateLimit, LIMITS } from '../../../src/lib/apiRateLimit';
import { withTiming } from '../../../src/utils/trainingApiUtils';
import { reportApiError } from '../../../src/lib/sentryWrap';
import { enforceTrainingQuestionContract, isTrainingQuestionValid } from '../../../src/lib/training/questionContract.mjs';
import {
  prepareTrainingQuestionForDelivery,
  TrainingGradingReceiptError,
  trainingQuestionDigest,
  verifyTrainingGradingReceipt,
  verifyTrainingGradingReceiptEnvelope,
} from '../../../src/lib/training/gradingReceipt.mjs';
import { buildTrainingQuestionSnapshot } from '../../../src/lib/training/trainingAttemptDelivery.mjs';
import {
  isTrainingPersistenceUnavailable,
  runTrainingPersistenceQuery,
  trainingPersistenceUnavailableBody,
} from '../../../src/lib/training/trainingPersistence.mjs';

applyDeterministicEnginePatches(deterministicEngine);

let _supabase = null;
function getSupabase() {
  if (!_supabase) {
    _supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY,
    );
  }
  return _supabase;
}

const CARD_RE = /^[2-9TJQKA][shdc]$/;
const SUITS = ['s', 'h', 'd', 'c'];
const RANKS = ['2', '3', '4', '5', '6', '7', '8', '9', 'T', 'J', 'Q', 'K', 'A'];
const RANK_VALUES = Object.freeze({
  2: 2, 3: 3, 4: 4, 5: 5, 6: 6, 7: 7, 8: 8, 9: 9,
  T: 10, J: 11, Q: 12, K: 13, A: 14,
});
const POSITIONS = new Set(['UTG', 'UTG+1', 'MP', 'MP+1', 'HJ', 'CO', 'BTN', 'SB', 'BB']);
const SOLVER_PATH_TOKEN_RE = /^(?:c|[br][1-9]\d*|[2-9TJQKA][cdhs])$/;
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

function firstCardSet(...values) {
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

/**
 * Verify that the durable answer is the one canonical solver action allowed
 * to continue this hand. A merely-present predecessor row is insufficient:
 * another answer belongs to another branch of the tree.
 */
export function validatePersistedContinuationDecision(parentQuestion, persistedAnswerId) {
  const scenario = parentQuestion?.scenario || {};
  const canonicalAction = typeof scenario.nextStreetContinuationAction === 'string'
    ? scenario.nextStreetContinuationAction.trim()
    : '';
  const optionIds = new Set(
    (Array.isArray(parentQuestion?.options) ? parentQuestion.options : [])
      .map((option) => String(option?.id || ''))
      .filter(Boolean),
  );

  // The currently certified continuation contract is deliberately narrow:
  // hero is IP at a check/bet node, takes a chip-denominated bet branch, OOP
  // calls, the runout is dealt, then OOP checks to hero. Fold, all-in, call,
  // raise, percentages, prose labels, or an action absent from this exact
  // question are all terminal/off-tree here.
  if (!CONTINUATION_ACTION_RE.test(canonicalAction)
    || scenario.solverActionUnits !== 'chips'
    || scenario.nodeType !== 'hero_bets_or_checks'
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
  return { ok: true, action: canonicalAction };
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
    parentQuestion?.dataQuality === 'SOLVER_EXACT'
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
    && /^\d+(?:\.\d+)?(?: \d+(?:\.\d+)?){3}$/.test(String(solverLineage.rake || ''))
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
    || generated?.dataQuality !== 'SOLVER_EXACT'
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

async function readSnapshot(snapshotKey) {
  const result = await runTrainingPersistenceQuery(
    () => getSupabase().from('training_question_snapshots')
      .select('snapshot_key, source_question_id, game_id, level, content_digest, question_data')
      .eq('snapshot_key', snapshotKey)
      .maybeSingle(),
    { label: 'NextStreet:snapshot-read' },
  );
  return result.data || null;
}

function receiptErrorResponse(res, error) {
  return res.status(error.status || 400).json({
    success: false,
    error: error.message,
    code: error.code,
  });
}

export default async function handler(req, res) {
  try {
    res.setHeader('Cache-Control', 'private, no-store');
    res.setHeader('Vary', 'Authorization');
    withTiming(res);
    if (!applyRateLimit(req, res, LIMITS.write)) return;
    if (req.method !== 'POST') {
      res.setHeader('Allow', 'POST');
      return res.status(405).json({ success: false, error: 'Method not allowed' });
    }
    if (JSON.stringify(req.body || {}).length > 12288) {
      return res.status(413).json({ success: false, error: 'Request body too large' });
    }

    const token = req.headers.authorization?.replace('Bearer ', '');
    if (!token) return res.status(401).json({ success: false, error: 'Authentication required' });
    const { user, error: authError } = await getServerUserWithFallback(req, getSupabase());
    if (authError || !user) return res.status(401).json({ success: false, error: 'Invalid token' });

    const gradingReceipt = req.body?.gradingReceipt || req.body?.receipt;
    let receiptPayload;
    try {
      ({ payload: receiptPayload } = verifyTrainingGradingReceiptEnvelope(gradingReceipt, {
        userId: user.id,
      }));
    } catch (error) {
      if (error instanceof TrainingGradingReceiptError) return receiptErrorResponse(res, error);
      throw error;
    }

    const parentSnapshot = await readSnapshot(receiptPayload.snapshotKey);
    if (!parentSnapshot?.question_data
      || String(parentSnapshot.game_id) !== String(receiptPayload.gameId)
      || Number(parentSnapshot.level) !== Number(receiptPayload.level)
      || trainingQuestionDigest(parentSnapshot.question_data) !== String(parentSnapshot.content_digest)) {
      return res.status(409).json({
        success: false,
        error: 'The signed parent hand is no longer available. Reload the Arena.',
        code: 'TRAINING_QUESTION_REFRESH_REQUIRED',
      });
    }
    try {
      verifyTrainingGradingReceipt(gradingReceipt, {
        userId: user.id,
        gameId: receiptPayload.gameId,
        questionId: receiptPayload.questionId,
        sessionId: receiptPayload.sessionId,
        attemptId: receiptPayload.attemptId,
        snapshotKey: receiptPayload.snapshotKey,
        canonicalQuestion: parentSnapshot.question_data,
      });
    } catch (error) {
      if (error instanceof TrainingGradingReceiptError) return receiptErrorResponse(res, error);
      throw error;
    }

    const precedingResult = await runTrainingPersistenceQuery(
      () => getSupabase().from('training_answers')
        .select('submission_id, attempt_id, hand_ordinal, decision_ordinal, snapshot_key, user_id, answer_id')
        .eq('user_id', user.id)
        .eq('submission_id', receiptPayload.jti)
        .eq('attempt_id', receiptPayload.attemptId)
        .eq('hand_ordinal', receiptPayload.handOrdinal)
        .eq('decision_ordinal', receiptPayload.decisionOrdinal)
        .eq('snapshot_key', receiptPayload.snapshotKey)
        .maybeSingle(),
      { label: 'NextStreet:preceding-answer-read' },
    );
    if (!precedingResult.data) {
      return res.status(409).json({
        success: false,
        error: 'Finish and save the current decision before dealing the next street.',
        code: 'TRAINING_CONTINUATION_PRECEDING_ANSWER_REQUIRED',
      });
    }
    if (Number(receiptPayload.decisionOrdinal) >= 8) {
      return res.status(409).json({
        success: false,
        error: 'This hand has reached its maximum decision depth.',
        code: 'TRAINING_CONTINUATION_DEPTH_EXCEEDED',
      });
    }

    const state = authoritativeHandState(parentSnapshot.question_data);
    if (!state.valid) {
      return res.status(422).json({
        success: false,
        error: 'The canonical hand does not contain an exact legal next-street state.',
        code: 'TRAINING_CONTINUATION_STATE_INVALID',
      });
    }
    const continuationDecision = validatePersistedContinuationDecision(
      parentSnapshot.question_data,
      precedingResult.data.answer_id,
    );
    if (!continuationDecision.ok) {
      return res.status(continuationDecision.status).json({
        success: false,
        error: continuationDecision.error,
        code: continuationDecision.code,
      });
    }
    const gameConfig = pioQueryService.getGameConfig(receiptPayload.gameId);
    if (!gameConfig) {
      return res.status(404).json({ success: false, error: 'Game config not found' });
    }
    const candidateCards = orderDeterministicEducationalCards(state);
    if (candidateCards.length === 0) {
      return res.status(422).json({ success: false, error: 'No legal next-street card is available.' });
    }
    const continuationLineages = candidateCards.map((candidateCard) => {
      const boardCards = [...state.boardCards, candidateCard];
      return buildExactContinuationLineage({
        parentQuestion: parentSnapshot.question_data,
        gameConfig,
        state,
        nextBoard: boardCards,
        continuationAction: continuationDecision.action,
      });
    }).filter(Boolean);
    if (continuationLineages.length !== candidateCards.length) {
      return res.status(422).json({
        success: false,
        error: 'The signed hand does not identify one exact solver continuation lineage.',
        code: 'TRAINING_CONTINUATION_LINEAGE_INVALID',
      });
    }

    deterministicEngine.setSupabaseClient(getSupabase());
    const generated = await deterministicEngine.queryNextStreet({
      gameConfig,
      heroHand: state.heroHand,
      street: state.nextStreet,
      stackDepth: state.stackDepth,
      heroPosition: state.heroPosition,
      villainPosition: state.villainPosition,
      continuationLineages,
    });
    if (!generated) {
      return res.status(404).json({
        success: false,
        error: 'No exact solver continuation exists for this runout.',
        code: 'TRAINING_CONTINUATION_SOLVER_MISS',
      });
    }
    const continuationLineage = continuationLineages.find(
      (candidate) => candidate.childScenarioHash === generated?.scenario?.scenarioHash
        && candidate.childNode === generated?.scenario?.solverNode,
    );
    if (!continuationLineage) {
      return res.status(422).json({
        success: false,
        error: 'The solver returned a child outside the deterministic candidate set.',
        code: 'TRAINING_CONTINUATION_CHILD_IDENTITY_INVALID',
      });
    }
    const nextBoard = continuationLineage.boardCards;
    const newCard = nextBoard.at(-1);

    const exactContinuation = bindExactContinuationQuestion(generated, {
      state,
      nextBoard,
      lineage: continuationLineage,
    });
    if (!exactContinuation) {
      return res.status(422).json({
        success: false,
        error: 'The solver continuation does not match its exact child node and geometry.',
        code: 'TRAINING_CONTINUATION_CHILD_IDENTITY_INVALID',
      });
    }
    const canonicalQuestion = enforceTrainingQuestionContract(exactContinuation);
    if (!canonicalQuestion?.id || !isTrainingQuestionValid(canonicalQuestion)) {
      return res.status(422).json({
        success: false,
        error: 'The next-street question did not pass the Training integrity contract.',
        code: 'TRAINING_CONTINUATION_QUESTION_INVALID',
      });
    }

    const candidateSnapshot = buildTrainingQuestionSnapshot({
      canonicalQuestion,
      gameId: receiptPayload.gameId,
      level: receiptPayload.level,
    });
    await runTrainingPersistenceQuery(
      () => getSupabase().from('training_question_snapshots').upsert(candidateSnapshot, {
        onConflict: 'snapshot_key',
        ignoreDuplicates: true,
        defaultToNull: false,
      }),
      { label: 'NextStreet:snapshot-write' },
    );
    const storedSnapshot = await readSnapshot(candidateSnapshot.snapshot_key);
    if (!storedSnapshot?.question_data
      || trainingQuestionDigest(storedSnapshot.question_data) !== String(storedSnapshot.content_digest)
      || String(storedSnapshot.game_id) !== String(receiptPayload.gameId)
      || Number(storedSnapshot.level) !== Number(receiptPayload.level)) {
      return res.status(503).json(trainingPersistenceUnavailableBody());
    }

    const nextDecisionOrdinal = Number(receiptPayload.decisionOrdinal) + 1;
    const servedQuestion = prepareTrainingQuestionForDelivery({
      canonicalQuestion: storedSnapshot.question_data,
      userId: user.id,
      gameId: receiptPayload.gameId,
      level: receiptPayload.level,
      sessionId: receiptPayload.sessionId,
      attemptId: receiptPayload.attemptId,
      snapshotKey: storedSnapshot.snapshot_key,
      sessionKind: receiptPayload.sessionKind,
      sessionTargetHands: receiptPayload.sessionTargetHands,
      handOrdinal: receiptPayload.handOrdinal,
      decisionOrdinal: nextDecisionOrdinal,
      countsTowardCompletion: false,
      practiceOnly: receiptPayload.practiceOnly,
      difficultyMode: receiptPayload.difficultyMode,
    });

    return res.status(200).json({
      success: true,
      question: servedQuestion,
      newCard,
      boardCards: nextBoard,
      street: state.nextStreet,
      sessionId: receiptPayload.sessionId,
      attemptId: receiptPayload.attemptId,
      handOrdinal: receiptPayload.handOrdinal,
      decisionOrdinal: nextDecisionOrdinal,
    });
  } catch (error) {
    try { reportApiError(error, req); } catch (_) { /* reporting must not mask the response */ }
    console.warn('[NextStreet] Error:', error?.message || error);
    if (isTrainingPersistenceUnavailable(error)) {
      return res.status(503).json(trainingPersistenceUnavailableBody());
    }
    if (!res.headersSent) {
      return res.status(500).json({ success: false, error: 'Internal server error' });
    }
    return undefined;
  }
}
