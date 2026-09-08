import {
  NODE_SEMANTICS,
  POLICY_KIND,
  QUALITY_SEAL,
  createSolverPolicyAnswer,
  createSolverPolicyKey,
} from '../../src/lib/training/solverPolicyContract.js';
import { alignQuestionToCanonicalPolicy } from '../../src/lib/training/cacheTruthContract.mjs';

const BOARD_COUNTS = Object.freeze({ preflop: 0, flop: 3, turn: 4, river: 5 });
const SUITS = ['s', 'h', 'd', 'c'];

function cardsOf(value) {
  if (Array.isArray(value)) return value;
  return String(value || '').match(/[2-9TJQKA][shdc]/gi) || [];
}

function holdingOf(question, board) {
  if (Array.isArray(question?.heroCards) && question.heroCards.length === 2) {
    return question.heroCards;
  }
  const notation = String(question?.heroHand || question?.scenario?.heroHand || 'AKo').toUpperCase();
  const match = notation.match(/^([2-9TJQKA])([2-9TJQKA])([SO])?$/);
  const ranks = match ? [match[1], match[2]] : ['A', 'K'];
  const used = new Set(board.map((card) => String(card).toLowerCase()));
  const suited = match?.[3] === 'S';
  for (const firstSuit of SUITS) {
    for (const secondSuit of SUITS) {
      if (ranks[0] === ranks[1] && firstSuit === secondSuit) continue;
      if (suited && firstSuit !== secondSuit) continue;
      if (!suited && ranks[0] !== ranks[1] && firstSuit === secondSuit) continue;
      const cards = [`${ranks[0]}${firstSuit}`, `${ranks[1]}${secondSuit}`];
      if (cards.every((card) => !used.has(card.toLowerCase()))) return cards;
    }
  }
  throw new Error('No collision-free fixture holding is available');
}

function facesWager(question) {
  const node = String(question?.scenario?.nodeType || question?.scenario?.spotType || '').toLowerCase();
  if (/faces?_bet|facing_(?:bet|raise)|defen[cs]e|vs_(?:bet|raise)|3bet|4bet/.test(node)) return true;
  const copy = (question?.options || []).map((option) => `${option?.id || ''} ${option?.text || ''}`.toLowerCase()).join(' ');
  return /\bfold\b|\bcall\b|\braise\b/.test(copy) && !/\bcheck\b/.test(copy);
}

function familyOf(option, facing) {
  const value = `${option?.id || ''} ${option?.text || ''}`.toLowerCase();
  if (/all.?in|\bpush\b|\bjam\b/.test(value)) return 'all_in';
  if (/\bfold\b/.test(value)) return 'fold';
  if (/\bcheck\b/.test(value) || /^(?:x|check)\b/.test(value)) return 'check';
  if (/\bcall\b/.test(value) || (facing && /^(?:c)\b/.test(value))) return 'call';
  if (/\braise\b/.test(value) || /^r\d*/.test(String(option?.id || '').toLowerCase())) return 'raise';
  return 'bet';
}

function actionOf(option, frequency, facing, potBb, actionEvs, measuredActionEv) {
  const family = familyOf(option, facing);
  const aggressive = ['bet', 'raise', 'all_in'].includes(family);
  const percent = Number((String(option?.text || option?.id || '').match(/(\d+(?:\.\d+)?)%/) || [])[1]);
  const potFraction = Number.isFinite(percent) ? percent / 100 : (family === 'all_in' ? 2 : 0.5);
  const bigBlinds = aggressive ? potBb * potFraction : null;
  return {
    id: String(option.id).toLowerCase(),
    family,
    label: option.text || String(option.id),
    frequency: Number(frequency) || 0,
    ...(aggressive ? {
      size: {
        unit: family === 'all_in' ? 'all_in' : 'big_blinds',
        chips: bigBlinds,
        bigBlinds,
        potFraction,
        exact: true,
      },
    } : {}),
    ...(measuredActionEv ? { chipEvBb: Number(actionEvs?.[option.id]) } : {}),
  };
}

export function sealCanonicalTrainingQuestion(rawQuestion, {
  policyChecksum = 'e'.repeat(64),
  measuredActionEv = false,
} = {}) {
  const question = structuredClone(rawQuestion);
  const scenario = question.scenario || {};
  const street = String(scenario.street || question.street || 'flop').toLowerCase();
  const board = cardsOf(
    question.boardCards?.length ? question.boardCards
      : scenario.boardCards?.length ? scenario.boardCards
        : scenario.board,
  )
    .slice(0, BOARD_COUNTS[street] ?? 3);
  const holding = holdingOf(question, board);
  const hero = String(scenario.heroPosition || 'BTN').toUpperCase();
  const villain = String(scenario.villainPosition || (hero === 'BB' ? 'BTN' : 'BB')).toUpperCase();
  const button = hero === 'BB' ? villain : hero;
  const stackBb = Number(scenario.stackDepth ?? scenario.effectiveStack) || 100;
  const villainStackBb = Number(scenario.villainStack) || stackBb;
  const potBb = Number(scenario.potSize ?? scenario.pot) || (street === 'preflop' ? 1.5 : 6);
  const facing = facesWager(question);
  let options = Array.isArray(question.options) ? question.options : [];
  if (options.length === 1) {
    const firstFamily = familyOf(options[0], facing);
    const alternate = firstFamily === 'check'
      ? { id: 'fixture_bet', text: 'Bet 50%' }
      : firstFamily === 'bet'
        ? { id: 'fixture_check', text: 'Check' }
        : { id: 'fixture_fold', text: 'Fold' };
    options = [...options, alternate];
    question.options = options;
    question.gtoFrequencies = {
      ...(question.gtoFrequencies || question.frequencies || {}),
      [alternate.id]: 0,
    };
  }
  if (options.length < 2) throw new Error('Canonical fixture questions require at least two options');
  const frequencies = question.gtoFrequencies || question.frequencies || {};
  const actionEvs = question?.evData?.actionEVs || {};
  const actions = options.map((option) => actionOf(
    option,
    frequencies[option.id],
    facing,
    potBb,
    actionEvs,
    measuredActionEv,
  ));
  if (measuredActionEv && actions.some((action) => !Number.isFinite(action.chipEvBb))) {
    throw new Error('Measured fixture EV requires one value for every action');
  }
  const key = createSolverPolicyKey({
    variant: 'nlh',
    bettingStructure: 'no_limit',
    tableSize: 2,
    positions: { hero, villains: [villain], button, smallBlind: button, bigBlind: hero === 'BB' ? hero : villain },
    stackVector: [
      { seat: 0, position: hero, stackBb, active: true },
      { seat: 1, position: villain, stackBb: villainStackBb, active: true },
    ],
    blinds: { smallBlind: 0.5, bigBlind: 1, ante: 0, straddles: [], complete: true },
    rake: { percent: 5, capBb: 2, complete: true },
    tournamentUtility: { mode: 'cash', complete: true },
    payouts: [],
    bounties: [],
    street,
    board,
    holding,
    publicActionHistory: {
      complete: true,
      actions: street === 'preflop' ? [] : [{
        sequence: 0,
        street: 'preflop',
        actor: button,
        action: 'small_blind',
        amountChips: 0.5,
        amountBb: 0.5,
      }],
    },
    legalActions: actions.map((action) => ({
      action: action.family,
      exactChips: ['bet', 'raise', 'all_in'].includes(action.family) ? action.size.chips : 0,
      allIn: action.family === 'all_in',
    })),
    sidePotEligibility: {
      complete: true,
      pots: [{ id: 'main', amountChips: potBb, eligibleSeats: [0, 1], heroEligible: true }],
    },
  });
  const provenance = question.solverProvenance || {};
  const policy = createSolverPolicyAnswer({
    key,
    kind: POLICY_KIND.EXACT,
    node: {
      semantics: street === 'preflop'
        ? (facing ? NODE_SEMANTICS.PREFLOP_FACING_WAGER : NODE_SEMANTICS.PREFLOP_UNOPENED)
        : (facing ? NODE_SEMANTICS.FACING_WAGER : NODE_SEMANTICS.CHECK_OR_BET),
      sourceNode: 'canonical-test-fixture',
      actor: hero,
      potBb,
      facingBetBb: facing ? Math.min(1, potBb) : 0,
    },
    actions,
    chipEv: {
      policy: Number.isFinite(Number(question?.evData?.heroHandEV))
        ? Number(question.evData.heroHandEV)
        : null,
      measuredByAction: measuredActionEv,
    },
    sourceArtifact: {
      system: question.source || provenance.source || 'PioSOLVER',
      artifactId: provenance.artifactId || 'canonical-test-fixture',
      scenarioHash: provenance.scenarioHash || scenario.scenarioHash || 'canonical-test-fixture',
      solverVersion: provenance.solverVersion || 'PioSOLVER 3.0',
      solverBinaryChecksum: provenance.solverBinaryChecksum || 'a'.repeat(64),
      machineId: provenance.machineId || 'test-runner',
      pipelineCommit: provenance.pipelineCommit || 'b'.repeat(40),
      manifestVersion: provenance.manifestVersion || 'canonical-test-fixture.1',
      manifestChecksum: provenance.manifestChecksum || 'c'.repeat(64),
      sourceArtifactChecksum: provenance.sourceArtifactChecksum || 'd'.repeat(64),
      qualityStatus: 'validated',
      auditedAt: provenance.auditedAt || '2026-09-07T00:00:00.000Z',
      provenanceComplete: true,
    },
    qualitySeal: QUALITY_SEAL.SOLVER_EXACT,
    validDomain: { exactMatchDimensions: ['all'], approximatedDimensions: [], exclusions: [] },
    confidence: 1,
  });
  const sealed = alignQuestionToCanonicalPolicy({
    ...question,
    heroCards: holding,
    boardCards: board,
    solverPolicy: policy,
  });
  return { ...sealed, policyChecksum };
}

export function canonicalCacheRowFixture(rawQuestion, {
  id = 'canonical-row',
  questionId = id,
  gameId = 'cash-fixture',
  policyChecksum = 'e'.repeat(64),
  measuredActionEv = false,
} = {}) {
  const question = rawQuestion?.solverPolicy
    ? { ...structuredClone(rawQuestion), policyChecksum }
    : sealCanonicalTrainingQuestion(rawQuestion, { policyChecksum, measuredActionEv });
  return {
    id,
    question_id: questionId,
    game_id: gameId,
    question_data: question,
    canonical_policy: question.solverPolicy,
    source_classification: 'SOLVER_EXACT',
    quality_status: 'active',
    policy_version: question.solverPolicy.policyVersion,
    policy_checksum: policyChecksum,
  };
}
