/**
 * Canonical solver-policy contract shared by every server-side policy consumer.
 *
 * This file is intentionally data-source agnostic. It defines one complete
 * decision key and one answer envelope; SolverPolicyService is the only module
 * that translates warehouse rows into this contract.
 */

export const SOLVER_POLICY_CONTRACT_VERSION = 'smarter-poker.solver-policy.v1';
export const SOLVER_POLICY_VERSION = 'solver-policy-service.1.0.1';
export const SOLVER_POLICY_SCHEMA_SHA256 = 'e18b456ed15165e2c0c640b606af12a0003c02be4ee8fe9cb15c54a56117aa9c';

export const POLICY_KIND = Object.freeze({
  EXACT: 'exact',
  AGGREGATED: 'aggregated',
  DERIVED: 'derived',
  CHART: 'chart',
  CURATED: 'curated',
  HEURISTIC: 'heuristic',
  UNAVAILABLE: 'unavailable',
});

export const QUALITY_SEAL = Object.freeze({
  SOLVER_EXACT: 'SOLVER_EXACT',
  SOLVER_AGGREGATED: 'SOLVER_AGGREGATED',
  SOLVER_DERIVED_RESPONSE: 'SOLVER_DERIVED_RESPONSE',
  CHART_AUDITED: 'CHART_AUDITED',
  CURATED: 'CURATED',
  HEURISTIC: 'HEURISTIC',
  LEGACY_UNVERIFIED: 'LEGACY_UNVERIFIED',
  UNAVAILABLE: 'UNAVAILABLE',
});

export const NODE_SEMANTICS = Object.freeze({
  CHECK_OR_BET: 'check_or_bet',
  FACING_WAGER: 'facing_wager',
  PREFLOP_UNOPENED: 'preflop_unopened',
  PREFLOP_FACING_WAGER: 'preflop_facing_wager',
  TERMINAL: 'terminal',
  UNKNOWN: 'unknown',
});

const VALID_STREETS = new Set(['preflop', 'flop', 'turn', 'river']);
const VALID_KINDS = new Set(Object.values(POLICY_KIND));
const VALID_SEALS = new Set(Object.values(QUALITY_SEAL));
const VALID_SEALS_BY_KIND = Object.freeze({
  [POLICY_KIND.EXACT]: new Set([QUALITY_SEAL.SOLVER_EXACT]),
  [POLICY_KIND.AGGREGATED]: new Set([QUALITY_SEAL.SOLVER_AGGREGATED]),
  [POLICY_KIND.DERIVED]: new Set([
    QUALITY_SEAL.SOLVER_DERIVED_RESPONSE,
    QUALITY_SEAL.LEGACY_UNVERIFIED,
  ]),
  [POLICY_KIND.CHART]: new Set([QUALITY_SEAL.CHART_AUDITED]),
  [POLICY_KIND.CURATED]: new Set([QUALITY_SEAL.CURATED]),
  [POLICY_KIND.HEURISTIC]: new Set([QUALITY_SEAL.HEURISTIC]),
  [POLICY_KIND.UNAVAILABLE]: new Set([QUALITY_SEAL.UNAVAILABLE]),
});
const CARD_RE = /^(?:[2-9TJQKA][cdhs])$/i;

const text = (value, fallback = '') => {
  const result = String(value ?? '').trim();
  return result || fallback;
};

const finite = (value) => {
  if (value === null || value === undefined || value === '') return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
};

const lower = (value, fallback = '') => text(value, fallback).toLowerCase();
const upper = (value, fallback = '') => text(value, fallback).toUpperCase();

function card(value) {
  const normalized = text(value);
  if (!CARD_RE.test(normalized)) return null;
  return `${normalized[0].toUpperCase()}${normalized[1].toLowerCase()}`;
}

function cardRank(cardValue) {
  return '23456789TJQKA'.indexOf(cardValue[0]);
}

function cardSuit(cardValue) {
  return 'cdhs'.indexOf(cardValue[1]);
}

function sortCards(cards) {
  return [...cards].sort((a, b) => cardRank(b) - cardRank(a) || cardSuit(a) - cardSuit(b));
}

export function normalizeBoard(values) {
  const cards = (Array.isArray(values) ? values : [])
    .map(card)
    .filter(Boolean);
  if (cards.length <= 3) return sortCards(cards);
  return [...sortCards(cards.slice(0, 3)), ...cards.slice(3)];
}

export function normalizeHolding(values) {
  return sortCards((Array.isArray(values) ? values : []).map(card).filter(Boolean));
}

function normalizePosition(value) {
  return upper(value, 'UNKNOWN').replace(/[^A-Z0-9_+-]/g, '_');
}

function normalizePositions(value = {}) {
  const source = value && typeof value === 'object' ? value : {};
  return {
    hero: normalizePosition(source.hero),
    villains: (Array.isArray(source.villains) ? source.villains : [])
      .map(normalizePosition),
    button: normalizePosition(source.button),
    smallBlind: normalizePosition(source.smallBlind),
    bigBlind: normalizePosition(source.bigBlind),
  };
}

function normalizeStackVector(value) {
  return (Array.isArray(value) ? value : [])
    .map((entry, index) => {
      const source = entry && typeof entry === 'object' ? entry : { stackBb: entry };
      return {
        seat: Number.isInteger(Number(source.seat)) ? Number(source.seat) : index,
        position: normalizePosition(source.position),
        stackChips: finite(source.stackChips),
        stackBb: finite(source.stackBb),
        committedChips: finite(source.committedChips) ?? 0,
        active: source.active !== false,
        allIn: source.allIn === true,
      };
    })
    .sort((a, b) => a.seat - b.seat);
}

function normalizeBlindState(value = {}) {
  const source = value && typeof value === 'object' ? value : {};
  return {
    smallBlind: finite(source.smallBlind),
    bigBlind: finite(source.bigBlind),
    ante: finite(source.ante) ?? 0,
    bigBlindAnte: finite(source.bigBlindAnte) ?? 0,
    straddles: (Array.isArray(source.straddles) ? source.straddles : [])
      .map((entry, index) => ({
        seat: Number.isInteger(Number(entry?.seat)) ? Number(entry.seat) : index,
        amount: finite(entry?.amount ?? entry),
      })),
    complete: source.complete === true,
  };
}

function normalizeRake(value = {}) {
  const source = value && typeof value === 'object' ? value : {};
  return {
    percent: finite(source.percent),
    capChips: finite(source.capChips),
    capBb: finite(source.capBb),
    noFlopNoDrop: source.noFlopNoDrop === true,
    complete: source.complete === true,
  };
}

function normalizeTournamentUtility(value = {}) {
  const source = value && typeof value === 'object' ? value : {};
  return {
    mode: lower(source.mode, 'unknown'),
    model: text(source.model) || null,
    playersRemaining: finite(source.playersRemaining),
    entrants: finite(source.entrants),
    handForHand: source.handForHand === true,
    complete: source.complete === true,
  };
}

function normalizeMoneyVector(value) {
  return (Array.isArray(value) ? value : [])
    .map((entry, index) => {
      if (entry && typeof entry === 'object') {
        return {
          place: Number.isInteger(Number(entry.place)) ? Number(entry.place) : index + 1,
          amount: finite(entry.amount),
          type: lower(entry.type, 'cash'),
        };
      }
      return { place: index + 1, amount: finite(entry), type: 'cash' };
    });
}

function normalizeActionHistory(value) {
  const source = value && typeof value === 'object' && !Array.isArray(value)
    ? value
    : { actions: Array.isArray(value) ? value : [], complete: false };
  return {
    complete: source.complete === true,
    actions: (Array.isArray(source.actions) ? source.actions : []).map((entry, index) => ({
      sequence: Number.isInteger(Number(entry?.sequence)) ? Number(entry.sequence) : index,
      street: VALID_STREETS.has(lower(entry?.street)) ? lower(entry.street) : 'preflop',
      actor: normalizePosition(entry?.actor ?? entry?.position ?? entry?.seat),
      action: lower(entry?.action ?? entry?.code, 'unknown'),
      amountChips: finite(entry?.amountChips ?? entry?.amount),
      amountBb: finite(entry?.amountBb),
      allIn: entry?.allIn === true,
    })),
  };
}

function normalizeLegalActions(value) {
  return (Array.isArray(value) ? value : [])
    .map((entry) => {
      const source = entry && typeof entry === 'object' ? entry : { action: entry };
      const action = lower(source.action ?? source.id ?? source.code, 'unknown');
      return {
        action,
        minChips: finite(source.minChips),
        maxChips: finite(source.maxChips),
        exactChips: finite(source.exactChips),
        allIn: source.allIn === true || /all.?in|jam|push|shove/.test(action),
      };
    })
    .sort((a, b) => a.action.localeCompare(b.action)
      || (a.exactChips ?? a.minChips ?? -1) - (b.exactChips ?? b.minChips ?? -1));
}

function normalizeSidePots(value) {
  const source = value && typeof value === 'object' && !Array.isArray(value)
    ? value
    : { pots: Array.isArray(value) ? value : [], complete: false };
  return {
    complete: source.complete === true,
    pots: (Array.isArray(source.pots) ? source.pots : []).map((entry, index) => ({
      id: text(entry?.id, `pot_${index}`),
      amountChips: finite(entry?.amountChips ?? entry?.amount),
      eligibleSeats: (Array.isArray(entry?.eligibleSeats) ? entry.eligibleSeats : [])
        .map(Number)
        .filter(Number.isInteger)
        .sort((a, b) => a - b),
      heroEligible: entry?.heroEligible === true,
    })),
  };
}

/** Build the complete, explicit identity of one poker decision. */
export function createSolverPolicyKey(input = {}) {
  const street = lower(input.street, 'preflop');
  const tableSize = finite(input.tableSize);
  return {
    contractVersion: SOLVER_POLICY_CONTRACT_VERSION,
    variant: lower(input.variant ?? input.gameVariant, 'unknown'),
    bettingStructure: lower(input.bettingStructure, 'unknown'),
    tableSize: Number.isInteger(tableSize) ? tableSize : null,
    positions: normalizePositions(input.positions),
    stackVector: normalizeStackVector(input.stackVector),
    blinds: normalizeBlindState(input.blinds),
    rake: normalizeRake(input.rake),
    tournamentUtility: normalizeTournamentUtility(input.tournamentUtility),
    payouts: normalizeMoneyVector(input.payouts),
    bounties: normalizeMoneyVector(input.bounties),
    street: VALID_STREETS.has(street) ? street : 'preflop',
    board: normalizeBoard(input.board),
    holding: normalizeHolding(input.holding),
    publicActionHistory: normalizeActionHistory(input.publicActionHistory),
    legalActions: normalizeLegalActions(input.legalActions),
    sidePotEligibility: normalizeSidePots(input.sidePotEligibility),
  };
}

/** Stable JSON with recursively sorted object keys; array order stays meaningful. */
export function stablePolicyJson(value) {
  if (Array.isArray(value)) return `[${value.map(stablePolicyJson).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value).sort().map((key) => (
      `${JSON.stringify(key)}:${stablePolicyJson(value[key])}`
    )).join(',')}}`;
  }
  return JSON.stringify(value);
}

export function policyKeyCompleteness(key) {
  const missing = [];
  if (!solverPolicyKeyShapeIsValid(key)) missing.push('keyShape');
  if (!key || key.contractVersion !== SOLVER_POLICY_CONTRACT_VERSION) missing.push('contractVersion');
  if (!key?.variant || key.variant === 'unknown') missing.push('variant');
  if (!key?.bettingStructure || key.bettingStructure === 'unknown') missing.push('bettingStructure');
  if (!Number.isInteger(key?.tableSize) || key.tableSize < 2) missing.push('tableSize');
  if (!key?.positions?.hero || key.positions.hero === 'UNKNOWN') missing.push('positions.hero');
  if (!key?.positions?.button || key.positions.button === 'UNKNOWN'
    || !key?.positions?.smallBlind || key.positions.smallBlind === 'UNKNOWN'
    || !key?.positions?.bigBlind || key.positions.bigBlind === 'UNKNOWN'
    || !Array.isArray(key?.positions?.villains) || key.positions.villains.length === 0
    || key.positions.villains.some((position) => !position || position === 'UNKNOWN')) {
    missing.push('positions.table');
  }
  if (!Array.isArray(key?.stackVector)
    || key.stackVector.length < 2
    || (Number.isInteger(key?.tableSize) && key.stackVector.length !== key.tableSize)
    || key.stackVector.some((entry) => (
      !(Number.isFinite(entry?.stackChips) || Number.isFinite(entry?.stackBb))
      || entry.stackChips < 0 || entry.stackBb < 0
    ))) missing.push('stackVector');
  if (key?.blinds?.complete !== true || !(key?.blinds?.bigBlind > 0)) missing.push('blinds');
  if (key?.rake?.complete !== true) missing.push('rake');
  if (!VALID_STREETS.has(key?.street)) missing.push('street');
  const boardCount = { preflop: 0, flop: 3, turn: 4, river: 5 }[key?.street];
  if (!Array.isArray(key?.board) || key.board.length !== boardCount) missing.push('board');
  const holdingCount = {
    nlh: 2, short_deck: 2, pineapple: 3, plo4: 4, plo5: 5, plo6: 6, plo8: 4,
  }[key?.variant];
  if (!Array.isArray(key?.holding)
    || !holdingCount
    || key.holding.length !== holdingCount) missing.push('holding');
  const cards = [...(key?.board || []), ...(key?.holding || [])];
  if (new Set(cards).size !== cards.length) missing.push('cardUniqueness');
  if (key?.publicActionHistory?.complete !== true
    || (key?.street !== 'preflop' && key?.publicActionHistory?.actions?.length === 0)) {
    missing.push('publicActionHistory');
  }
  if (!Array.isArray(key?.legalActions) || key.legalActions.length === 0) missing.push('legalActions');
  if (key?.sidePotEligibility?.complete !== true) missing.push('sidePotEligibility');
  if (key?.tournamentUtility?.complete !== true) missing.push('tournamentUtility');
  if (key?.tournamentUtility?.mode !== 'cash') {
    if (!Array.isArray(key?.payouts) || key.payouts.length === 0) missing.push('payouts');
  }
  return { complete: missing.length === 0, missing };
}

export function exactSourceComplete(source) {
  return Boolean(
    source?.provenanceComplete === true
    && source?.system && lower(source.system) !== 'none'
    && !/v1(?!\d)/i.test(text(source.system))
    && text(source?.artifactId)
    && text(source?.scenarioHash)
    && text(source?.solverVersion)
    && /^[0-9a-f]{64}$/i.test(text(source?.solverBinaryChecksum))
    && text(source?.machineId)
    && /^[0-9a-f]{40}$/i.test(text(source?.pipelineCommit))
    && text(source?.manifestVersion)
    && /^[0-9a-f]{64}$/i.test(text(source?.manifestChecksum))
    && /^[0-9a-f]{64}$/i.test(text(source?.sourceArtifactChecksum))
    && lower(source?.qualityStatus) === 'validated'
    && Number.isFinite(Date.parse(text(source?.auditedAt)))
  );
}

function confidenceLevel(score) {
  return score >= 0.9 ? 'high' : score >= 0.6 ? 'medium' : score > 0 ? 'low' : 'none';
}

function confidence(value) {
  const score = Math.max(0, Math.min(1, finite(value?.score ?? value) ?? 0));
  return {
    score,
    // The label is derived from the score. Accepting a caller-supplied label
    // would let a low-confidence policy present itself as high confidence.
    level: confidenceLevel(score),
  };
}

function normalizeDistribution(actions) {
  const total = actions.reduce((sum, action) => sum + Math.max(0, finite(action.frequency) ?? 0), 0);
  if (!(total > 0)) return actions.map((action) => ({ ...action, frequency: 0 }));
  return actions.map((action) => ({
    ...action,
    frequency: Math.max(0, finite(action.frequency) ?? 0) / total,
  }));
}

/** Construct and validate one canonical policy answer. */
export function createSolverPolicyAnswer(input = {}) {
  const kind = VALID_KINDS.has(input.kind) ? input.kind : POLICY_KIND.UNAVAILABLE;
  const key = input.key?.contractVersion === SOLVER_POLICY_CONTRACT_VERSION
    ? input.key
    : createSolverPolicyKey(input.key || {});
  const chipEvMeasuredByAction = input?.chipEv?.measuredByAction === true;
  const utilityEvMeasuredByAction = input?.tournamentUtilityEv?.measuredByAction === true;
  const actions = normalizeDistribution((Array.isArray(input.actions) ? input.actions : []).map((entry) => ({
    id: lower(entry?.id ?? entry?.action, 'unknown'),
    sourceCode: text(entry?.sourceCode ?? entry?.code) || null,
    family: lower(entry?.family ?? entry?.action, 'unknown'),
    label: text(entry?.label ?? entry?.id ?? entry?.action, 'Unknown'),
    frequency: finite(entry?.frequency) ?? 0,
    legal: entry?.legal !== false,
    size: {
      unit: lower(entry?.size?.unit, 'none'),
      chips: finite(entry?.size?.chips),
      bigBlinds: finite(entry?.size?.bigBlinds),
      potFraction: finite(entry?.size?.potFraction),
      exact: entry?.size?.exact === true,
    },
    // Per-action EV is an evidence claim, not optional decoration. Discard it
    // unless the enclosing contract explicitly marks the complete action set
    // as measured.
    chipEvBb: chipEvMeasuredByAction ? finite(entry?.chipEvBb) : null,
    tournamentUtilityEv: utilityEvMeasuredByAction ? finite(entry?.tournamentUtilityEv) : null,
  })));
  if (chipEvMeasuredByAction && actions.some((action) => action.chipEvBb === null)) {
    throw new Error('Measured chip EV requires one finite value for every action');
  }
  if (utilityEvMeasuredByAction && actions.some((action) => action.tournamentUtilityEv === null)) {
    throw new Error('Measured tournament utility EV requires one finite value for every action');
  }
  const distribution = Object.fromEntries(actions.map((action) => [action.id, action.frequency]));
  const qualitySeal = VALID_SEALS.has(input.qualitySeal) ? input.qualitySeal : QUALITY_SEAL.UNAVAILABLE;
  if (!VALID_SEALS_BY_KIND[kind]?.has(qualitySeal)) {
    throw new Error(`Policy kind ${kind} cannot use quality seal ${qualitySeal}`);
  }
  const completeness = policyKeyCompleteness(key);

  if (kind === POLICY_KIND.EXACT && (
    qualitySeal !== QUALITY_SEAL.SOLVER_EXACT
    || !exactSourceComplete(input?.sourceArtifact)
    || !completeness.complete
    || (input?.validDomain?.approximatedDimensions || []).length > 0
    || input.fallbackReason
    || !actions.every(exactActionSizeIsComplete)
    || !actions.every((action) => exactActionUnitsAreConsistent(action, key, input?.node))
    || !actions.every((action) => exactActionIsLegalForKey(action, key))
    || !exactNodeIsConsistent(input?.node, key)
    || !exactDomainIsConsistent(input?.validDomain)
  )) {
    throw new Error(
      'An exact policy requires a complete key, exact legal actions and sizes, exact domain, and provenance-sealed source artifact'
    );
  }
  if (kind !== POLICY_KIND.UNAVAILABLE && actions.length === 0) {
    throw new Error('An available solver policy requires at least one action');
  }

  return {
    contractVersion: SOLVER_POLICY_CONTRACT_VERSION,
    policyVersion: text(input.policyVersion, SOLVER_POLICY_VERSION),
    key,
    kind,
    node: {
      semantics: Object.values(NODE_SEMANTICS).includes(input?.node?.semantics)
        ? input.node.semantics
        : NODE_SEMANTICS.UNKNOWN,
      sourceNode: text(input?.node?.sourceNode) || null,
      actor: normalizePosition(input?.node?.actor),
      potBb: finite(input?.node?.potBb),
      facingBetBb: finite(input?.node?.facingBetBb),
    },
    actions,
    distribution,
    legalSizes: actions
      .filter((action) => action.legal && action.size.unit !== 'none')
      .map((action) => ({ actionId: action.id, ...action.size })),
    chipEv: {
      unit: 'big_blinds',
      policy: finite(input?.chipEv?.policy),
      byAction: Object.fromEntries(actions.map((action) => [action.id, action.chipEvBb])),
      measuredByAction: chipEvMeasuredByAction,
    },
    tournamentUtilityEv: {
      unit: text(input?.tournamentUtilityEv?.unit, 'utility'),
      policy: finite(input?.tournamentUtilityEv?.policy),
      byAction: Object.fromEntries(actions.map((action) => [action.id, action.tournamentUtilityEv])),
      measuredByAction: utilityEvMeasuredByAction,
    },
    sourceArtifact: {
      system: text(input?.sourceArtifact?.system, 'none'),
      artifactId: text(input?.sourceArtifact?.artifactId) || null,
      scenarioHash: text(input?.sourceArtifact?.scenarioHash) || null,
      solverVersion: text(input?.sourceArtifact?.solverVersion) || null,
      solverBinaryChecksum: text(input?.sourceArtifact?.solverBinaryChecksum) || null,
      machineId: text(input?.sourceArtifact?.machineId) || null,
      pipelineCommit: text(input?.sourceArtifact?.pipelineCommit) || null,
      manifestVersion: text(input?.sourceArtifact?.manifestVersion) || null,
      manifestChecksum: text(input?.sourceArtifact?.manifestChecksum) || null,
      sourceArtifactChecksum: text(input?.sourceArtifact?.sourceArtifactChecksum) || null,
      qualityStatus: text(input?.sourceArtifact?.qualityStatus) || null,
      auditedAt: text(input?.sourceArtifact?.auditedAt) || null,
      provenanceComplete: input?.sourceArtifact?.provenanceComplete === true,
    },
    qualitySeal,
    validDomain: {
      completeKey: completeness.complete,
      missingKeyDimensions: completeness.missing,
      exactMatchDimensions: [...new Set(Array.isArray(input?.validDomain?.exactMatchDimensions)
        ? input.validDomain.exactMatchDimensions.map(String)
        : [])].sort(),
      approximatedDimensions: [...new Set(Array.isArray(input?.validDomain?.approximatedDimensions)
        ? input.validDomain.approximatedDimensions.map(String)
        : [])].sort(),
      exclusions: [...new Set(Array.isArray(input?.validDomain?.exclusions)
        ? input.validDomain.exclusions.map(String)
        : [])].sort(),
    },
    confidence: confidence(input.confidence),
    fallbackReason: input.fallbackReason ? text(input.fallbackReason) : null,
    rangeDistribution: input.rangeDistribution && typeof input.rangeDistribution === 'object'
      ? input.rangeDistribution
      : null,
  };
}

export function unavailableSolverPolicy(key, fallbackReason = 'policy_not_available') {
  return createSolverPolicyAnswer({
    key,
    kind: POLICY_KIND.UNAVAILABLE,
    qualitySeal: QUALITY_SEAL.UNAVAILABLE,
    confidence: 0,
    fallbackReason,
    sourceArtifact: { system: 'none', provenanceComplete: false },
    validDomain: { exclusions: [fallbackReason] },
  });
}

const isRecord = (value) => Boolean(value) && typeof value === 'object' && !Array.isArray(value);
const finiteOrNull = (value) => value === null || (typeof value === 'number' && Number.isFinite(value));
const nonNegativeOrNull = (value) => value === null
  || (typeof value === 'number' && Number.isFinite(value) && value >= 0);
const nullableString = (value) => value === null || typeof value === 'string';

function exactActionSizeIsComplete(action) {
  if (!action?.legal || !isRecord(action?.size)) return false;
  const { family, size } = action;
  if (family === 'all_in') {
    if (size.unit !== 'all_in' || size.exact !== true) return false;
    return [size.chips, size.bigBlinds, size.potFraction].every((value) => (
      typeof value === 'number' && Number.isFinite(value) && value >= 0
    ));
  }
  if (family === 'bet' || family === 'raise') {
    if (size.exact !== true || !['chips', 'big_blinds', 'pot_fraction'].includes(size.unit)) {
      return false;
    }
    return [size.chips, size.bigBlinds, size.potFraction].every((value) => (
      typeof value === 'number' && Number.isFinite(value) && value >= 0
    ));
  }
  if (!['fold', 'check', 'call'].includes(family)) return false;
  return size.unit === 'none'
    && size.exact === false
    && size.chips === null
    && size.bigBlinds === null
    && size.potFraction === null;
}

function nearlyEqual(left, right) {
  return Math.abs(left - right) <= 1e-6 * Math.max(1, Math.abs(left), Math.abs(right));
}

/**
 * Exact aggressive actions carry all three sizing units so every consumer can
 * execute the same amount without guessing which stack/pot convention was
 * used by the producer. Reject internally inconsistent unit conversions.
 */
function exactActionUnitsAreConsistent(action, key, node) {
  if (!['bet', 'raise', 'all_in'].includes(action?.family)) return true;
  if (!exactActionSizeIsComplete(action)) return false;
  const bigBlindChips = key?.blinds?.bigBlind;
  const potBb = node?.potBb;
  if (!(typeof bigBlindChips === 'number' && Number.isFinite(bigBlindChips) && bigBlindChips > 0)
    || !(typeof potBb === 'number' && Number.isFinite(potBb) && potBb > 0)) {
    return false;
  }
  return nearlyEqual(action.size.chips / bigBlindChips, action.size.bigBlinds)
    && nearlyEqual(action.size.bigBlinds / potBb, action.size.potFraction);
}

function exactActionIsLegalForKey(action, key) {
  const candidates = Array.isArray(key?.legalActions) ? key.legalActions.filter((entry) => (
    entry?.action === action?.family
    || (action?.family === 'all_in' && entry?.allIn === true)
  )) : [];
  if (candidates.length === 0) return false;
  if (!['bet', 'raise', 'all_in'].includes(action?.family)) return true;
  if (typeof action?.size?.chips !== 'number') return false;
  return candidates.some((entry) => {
    const chips = action.size.chips;
    if (typeof entry.exactChips === 'number') return Math.abs(entry.exactChips - chips) <= 1e-9;
    if (typeof entry.minChips === 'number' && chips < entry.minChips) return false;
    if (typeof entry.maxChips === 'number' && chips > entry.maxChips) return false;
    return true;
  });
}

function exactNodeIsConsistent(node, key) {
  if (!isRecord(node) || node.actor !== key?.positions?.hero
    || !(typeof node.potBb === 'number' && Number.isFinite(node.potBb) && node.potBb > 0)
    || !(typeof node.facingBetBb === 'number'
      && Number.isFinite(node.facingBetBb) && node.facingBetBb >= 0)) return false;
  const facing = node.facingBetBb > 0;
  const expected = key?.street === 'preflop'
    ? (facing ? NODE_SEMANTICS.PREFLOP_FACING_WAGER : NODE_SEMANTICS.PREFLOP_UNOPENED)
    : (facing ? NODE_SEMANTICS.FACING_WAGER : NODE_SEMANTICS.CHECK_OR_BET);
  return node.semantics === expected;
}

function exactDomainIsConsistent(validDomain) {
  return isRecord(validDomain)
    && Array.isArray(validDomain.exactMatchDimensions)
    && validDomain.exactMatchDimensions.length === 1
    && validDomain.exactMatchDimensions[0] === 'all'
    && Array.isArray(validDomain.approximatedDimensions)
    && validDomain.approximatedDimensions.length === 0
    && Array.isArray(validDomain.exclusions)
    && validDomain.exclusions.length === 0;
}

function hasExactKeys(value, keys) {
  if (!isRecord(value)) return false;
  const allowed = new Set(keys);
  return keys.every((key) => Object.prototype.hasOwnProperty.call(value, key))
    && Object.keys(value).every((key) => allowed.has(key));
}

function solverPolicyKeyRelationshipsAreValid(key) {
  const stack = Array.isArray(key?.stackVector) ? key.stackVector : [];
  const seats = new Set(stack.map((entry) => entry?.seat));
  const positions = new Set(stack.map((entry) => entry?.position));
  const bigBlind = key?.blinds?.bigBlind;
  const unitPairIsValid = (chips, bigBlinds) => {
    if (chips === null || bigBlinds === null) return true;
    return typeof bigBlind === 'number' && Number.isFinite(bigBlind) && bigBlind > 0
      && nearlyEqual(chips / bigBlind, bigBlinds);
  };
  if (stack.some((entry) => !unitPairIsValid(entry?.stackChips, entry?.stackBb))) return false;
  if (!unitPairIsValid(key?.rake?.capChips, key?.rake?.capBb)) return false;
  if (typeof key?.rake?.percent === 'number' && key.rake.percent > 100) return false;
  if (typeof key?.blinds?.smallBlind === 'number'
    && typeof bigBlind === 'number' && key.blinds.smallBlind > bigBlind) return false;
  if (key?.tournamentUtility?.playersRemaining !== null
    && !Number.isInteger(key?.tournamentUtility?.playersRemaining)) return false;
  if (key?.tournamentUtility?.entrants !== null
    && !Number.isInteger(key?.tournamentUtility?.entrants)) return false;

  const known = (position) => typeof position === 'string' && position !== 'UNKNOWN';
  if (known(key?.positions?.hero) && !positions.has(key.positions.hero)) return false;
  if ((key?.positions?.villains || []).some((position) => known(position) && !positions.has(position))) {
    return false;
  }
  const uniqueKnownPositions = stack.map((entry) => entry?.position).filter(known);
  if (new Set(uniqueKnownPositions).size !== uniqueKnownPositions.length) return false;

  const straddles = key?.blinds?.straddles || [];
  if (straddles.some((entry) => !seats.has(entry?.seat))
    || new Set(straddles.map((entry) => entry?.seat)).size !== straddles.length) return false;

  const streetIndex = { preflop: 0, flop: 1, turn: 2, river: 3 };
  const history = key?.publicActionHistory?.actions || [];
  let priorStreet = -1;
  for (const action of history) {
    const actionStreet = streetIndex[action?.street];
    if (!Number.isInteger(actionStreet) || actionStreet < priorStreet
      || actionStreet > streetIndex[key?.street]
      || !unitPairIsValid(action?.amountChips, action?.amountBb)) return false;
    priorStreet = actionStreet;
  }

  const pots = key?.sidePotEligibility?.pots || [];
  if (new Set(pots.map((pot) => pot?.id)).size !== pots.length) return false;
  const heroSeats = stack.filter((entry) => entry?.position === key?.positions?.hero)
    .map((entry) => entry.seat);
  for (const pot of pots) {
    if (new Set(pot?.eligibleSeats || []).size !== (pot?.eligibleSeats || []).length
      || (pot?.eligibleSeats || []).some((seat) => !seats.has(seat))) return false;
    if (heroSeats.length === 1
      && pot?.heroEligible !== pot.eligibleSeats.includes(heroSeats[0])) return false;
  }
  for (const vector of [key?.payouts || [], key?.bounties || []]) {
    if (new Set(vector.map((entry) => entry?.place)).size !== vector.length) return false;
  }
  return true;
}

function solverPolicyKeyShapeIsValid(key) {
  if (!hasExactKeys(key, [
    'contractVersion', 'variant', 'bettingStructure', 'tableSize', 'positions',
    'stackVector', 'blinds', 'rake', 'tournamentUtility', 'payouts', 'bounties',
    'street', 'board', 'holding', 'publicActionHistory', 'legalActions',
    'sidePotEligibility',
  ])) return false;
  if (!isRecord(key.positions) || !isRecord(key.blinds) || !isRecord(key.rake)
    || !isRecord(key.tournamentUtility) || !isRecord(key.publicActionHistory)
    || !isRecord(key.sidePotEligibility)) return false;
  const money = (entry) => hasExactKeys(entry, ['place', 'amount', 'type'])
    && Number.isInteger(entry.place) && entry.place >= 1
    && nonNegativeOrNull(entry.amount) && typeof entry.type === 'string';
  const history = (entry) => hasExactKeys(entry, [
    'sequence', 'street', 'actor', 'action', 'amountChips', 'amountBb', 'allIn',
  ]) && Number.isInteger(entry.sequence) && entry.sequence >= 0
    && VALID_STREETS.has(entry.street) && typeof entry.actor === 'string'
    && typeof entry.action === 'string' && nonNegativeOrNull(entry.amountChips)
    && nonNegativeOrNull(entry.amountBb) && typeof entry.allIn === 'boolean';
  const legal = (entry) => {
    if (!hasExactKeys(entry, ['action', 'minChips', 'maxChips', 'exactChips', 'allIn'])
      || typeof entry.action !== 'string' || !nonNegativeOrNull(entry.minChips)
      || !nonNegativeOrNull(entry.maxChips) || !nonNegativeOrNull(entry.exactChips)
      || typeof entry.allIn !== 'boolean') return false;
    if (entry.minChips !== null && entry.maxChips !== null && entry.minChips > entry.maxChips) {
      return false;
    }
    if (entry.exactChips !== null
      && ((entry.minChips !== null && entry.exactChips < entry.minChips)
        || (entry.maxChips !== null && entry.exactChips > entry.maxChips))) return false;
    return true;
  };
  const sidePot = (entry) => hasExactKeys(entry, [
    'id', 'amountChips', 'eligibleSeats', 'heroEligible',
  ]) && typeof entry.id === 'string' && nonNegativeOrNull(entry.amountChips)
    && Array.isArray(entry.eligibleSeats)
    && entry.eligibleSeats.every((seat) => Number.isInteger(seat) && seat >= 0)
    && typeof entry.heroEligible === 'boolean';
  const cards = [...(Array.isArray(key.board) ? key.board : []),
    ...(Array.isArray(key.holding) ? key.holding : [])];
  const historyActions = Array.isArray(key.publicActionHistory.actions)
    ? key.publicActionHistory.actions : [];
  const historyOrdered = historyActions.every((entry, index) => (
    index === 0 || entry?.sequence > historyActions[index - 1]?.sequence
  ));
  const stackSeats = Array.isArray(key.stackVector)
    ? key.stackVector.map((entry) => entry?.seat) : [];
  return key.contractVersion === SOLVER_POLICY_CONTRACT_VERSION
    && typeof key.variant === 'string' && typeof key.bettingStructure === 'string'
    && (key.tableSize === null || (Number.isInteger(key.tableSize) && key.tableSize >= 2))
    && hasExactKeys(key.positions, ['hero', 'villains', 'button', 'smallBlind', 'bigBlind'])
    && typeof key.positions.hero === 'string' && Array.isArray(key.positions.villains)
    && key.positions.villains.every((value) => typeof value === 'string')
    && ['button', 'smallBlind', 'bigBlind'].every((name) => typeof key.positions[name] === 'string')
    && Array.isArray(key.stackVector) && key.stackVector.every((entry) => (
      hasExactKeys(entry, [
        'seat', 'position', 'stackChips', 'stackBb', 'committedChips', 'active', 'allIn',
      ]) && Number.isInteger(entry.seat) && entry.seat >= 0 && typeof entry.position === 'string'
      && nonNegativeOrNull(entry.stackChips) && nonNegativeOrNull(entry.stackBb)
      && Number.isFinite(entry.committedChips) && entry.committedChips >= 0
      && typeof entry.active === 'boolean'
      && typeof entry.allIn === 'boolean'
    )) && new Set(stackSeats).size === stackSeats.length
    && hasExactKeys(key.blinds, [
      'smallBlind', 'bigBlind', 'ante', 'bigBlindAnte', 'straddles', 'complete',
    ]) && nonNegativeOrNull(key.blinds.smallBlind) && nonNegativeOrNull(key.blinds.bigBlind)
    && Number.isFinite(key.blinds.ante) && key.blinds.ante >= 0
    && Number.isFinite(key.blinds.bigBlindAnte) && key.blinds.bigBlindAnte >= 0
    && Array.isArray(key.blinds.straddles) && key.blinds.straddles.every((entry) => (
      hasExactKeys(entry, ['seat', 'amount']) && Number.isInteger(entry.seat) && entry.seat >= 0
      && nonNegativeOrNull(entry.amount)
    )) && typeof key.blinds.complete === 'boolean'
    && hasExactKeys(key.rake, ['percent', 'capChips', 'capBb', 'noFlopNoDrop', 'complete'])
    && nonNegativeOrNull(key.rake.percent) && nonNegativeOrNull(key.rake.capChips)
    && nonNegativeOrNull(key.rake.capBb) && typeof key.rake.noFlopNoDrop === 'boolean'
    && typeof key.rake.complete === 'boolean'
    && hasExactKeys(key.tournamentUtility, [
      'mode', 'model', 'playersRemaining', 'entrants', 'handForHand', 'complete',
    ]) && typeof key.tournamentUtility.mode === 'string'
    && nullableString(key.tournamentUtility.model)
    && nonNegativeOrNull(key.tournamentUtility.playersRemaining)
    && nonNegativeOrNull(key.tournamentUtility.entrants)
    && (key.tournamentUtility.playersRemaining === null
      || key.tournamentUtility.entrants === null
      || key.tournamentUtility.playersRemaining <= key.tournamentUtility.entrants)
    && typeof key.tournamentUtility.handForHand === 'boolean'
    && typeof key.tournamentUtility.complete === 'boolean'
    && Array.isArray(key.payouts) && key.payouts.every(money)
    && Array.isArray(key.bounties) && key.bounties.every(money)
    && VALID_STREETS.has(key.street)
    && Array.isArray(key.board) && key.board.every((value) => CARD_RE.test(value))
    && Array.isArray(key.holding) && key.holding.every((value) => CARD_RE.test(value))
    && new Set(cards).size === cards.length
    && hasExactKeys(key.publicActionHistory, ['complete', 'actions'])
    && typeof key.publicActionHistory.complete === 'boolean'
    && Array.isArray(key.publicActionHistory.actions)
    && key.publicActionHistory.actions.every(history) && historyOrdered
    && Array.isArray(key.legalActions) && key.legalActions.every(legal)
    && hasExactKeys(key.sidePotEligibility, ['complete', 'pots'])
    && typeof key.sidePotEligibility.complete === 'boolean'
    && Array.isArray(key.sidePotEligibility.pots)
    && key.sidePotEligibility.pots.every(sidePot)
    && solverPolicyKeyRelationshipsAreValid(key);
}

function actionShapeIsValid(action) {
  return hasExactKeys(action, [
    'id', 'sourceCode', 'family', 'label', 'frequency', 'legal', 'size',
    'chipEvBb', 'tournamentUtilityEv',
  ]) && typeof action.id === 'string' && action.id.length > 0
    && nullableString(action.sourceCode) && typeof action.family === 'string'
    && action.family.length > 0 && typeof action.label === 'string' && action.label.length > 0
    && Number.isFinite(action.frequency) && action.frequency >= 0 && action.frequency <= 1
    && typeof action.legal === 'boolean'
    && hasExactKeys(action.size, ['unit', 'chips', 'bigBlinds', 'potFraction', 'exact'])
    && ['none', 'unknown', 'chips', 'big_blinds', 'pot_fraction', 'all_in'].includes(action.size.unit)
    && nonNegativeOrNull(action.size.chips) && nonNegativeOrNull(action.size.bigBlinds)
    && nonNegativeOrNull(action.size.potFraction) && typeof action.size.exact === 'boolean'
    && finiteOrNull(action.chipEvBb) && finiteOrNull(action.tournamentUtilityEv);
}

export function validateSolverPolicyAnswer(answer) {
  const errors = [];
  if (!hasExactKeys(answer, [
    'contractVersion', 'policyVersion', 'key', 'kind', 'node', 'actions',
    'distribution', 'legalSizes', 'chipEv', 'tournamentUtilityEv', 'sourceArtifact',
    'qualitySeal', 'validDomain', 'confidence', 'fallbackReason', 'rangeDistribution',
  ])) errors.push('answerShape');
  if (answer?.contractVersion !== SOLVER_POLICY_CONTRACT_VERSION) errors.push('contractVersion');
  if (!answer?.policyVersion || typeof answer.policyVersion !== 'string') errors.push('policyVersion');
  if (!VALID_KINDS.has(answer?.kind)) errors.push('kind');
  if (!VALID_SEALS.has(answer?.qualitySeal)) errors.push('qualitySeal');
  else if (!VALID_SEALS_BY_KIND[answer?.kind]?.has(answer.qualitySeal)) errors.push('kindQualitySeal');
  if (!solverPolicyKeyShapeIsValid(answer?.key)) errors.push('key');
  if (!hasExactKeys(answer?.node, ['semantics', 'sourceNode', 'actor', 'potBb', 'facingBetBb'])
    || !Object.values(NODE_SEMANTICS).includes(answer.node.semantics)
    || !nullableString(answer.node.sourceNode)
    || typeof answer.node.actor !== 'string'
    || !nonNegativeOrNull(answer.node.potBb)
    || !nonNegativeOrNull(answer.node.facingBetBb)) errors.push('node');
  const actionList = Array.isArray(answer?.actions) ? answer.actions : [];
  if (!Array.isArray(answer?.actions)) errors.push('actions');
  else {
    if (answer.kind !== POLICY_KIND.UNAVAILABLE && answer.actions.length === 0) {
      errors.push('actionsEmpty');
    }
    const ids = new Set();
    for (const action of actionList) {
      if (!actionShapeIsValid(action) || ids.has(action.id)) errors.push('action');
      ids.add(action?.id);
      if (Math.abs((answer?.distribution?.[action?.id] ?? -1) - action.frequency) > 1e-9) {
        errors.push('distributionMismatch');
      }
    }
    if (answer?.distribution && Object.entries(answer.distribution).some(([id, value]) => (
      !ids.has(id) || !Number.isFinite(value) || value < 0 || value > 1
    ))) {
      errors.push('distributionExtraAction');
    }
  }
  const actionIds = new Set(actionList.map((action) => action.id));
  if (!isRecord(answer?.distribution)) errors.push('distribution');
  if (!Array.isArray(answer?.legalSizes) || answer.legalSizes.some((entry) => (
    !hasExactKeys(entry, ['actionId', 'unit', 'chips', 'bigBlinds', 'potFraction', 'exact'])
    || !actionIds.has(entry.actionId)
    || !['none', 'unknown', 'chips', 'big_blinds', 'pot_fraction', 'all_in'].includes(entry.unit)
    || !nonNegativeOrNull(entry.chips) || !nonNegativeOrNull(entry.bigBlinds)
    || !nonNegativeOrNull(entry.potFraction) || typeof entry.exact !== 'boolean'
  ))) errors.push('legalSizes');
  else {
    const expectedLegalSizes = actionList
      .filter((action) => action?.legal && action?.size?.unit !== 'none')
      .map((action) => ({ actionId: action.id, ...action.size }));
    if (stablePolicyJson(answer.legalSizes) !== stablePolicyJson(expectedLegalSizes)) {
      errors.push('legalSizesMismatch');
    }
  }
  const evShape = (value, requiredUnit = null, actionField = null) => hasExactKeys(
    value, ['unit', 'policy', 'byAction', 'measuredByAction'],
  ) && typeof value.unit === 'string' && (!requiredUnit || value.unit === requiredUnit)
    && finiteOrNull(value.policy) && isRecord(value.byAction)
    && Object.entries(value.byAction).every(([id, ev]) => actionIds.has(id) && finiteOrNull(ev))
    && [...actionIds].every((id) => Object.prototype.hasOwnProperty.call(value.byAction, id))
    && typeof value.measuredByAction === 'boolean'
    && (!actionField || actionList.every((action) => (
      value.byAction[action.id] === action[actionField]
      && (value.measuredByAction ? Number.isFinite(action[actionField]) : action[actionField] === null)
    )));
  if (!evShape(answer?.chipEv, 'big_blinds', 'chipEvBb')) errors.push('chipEv');
  if (!evShape(answer?.tournamentUtilityEv, null, 'tournamentUtilityEv')) {
    errors.push('tournamentUtilityEv');
  }
  if (!hasExactKeys(answer?.sourceArtifact, [
    'system', 'artifactId', 'scenarioHash', 'solverVersion', 'solverBinaryChecksum',
    'machineId', 'pipelineCommit', 'manifestVersion', 'manifestChecksum',
    'sourceArtifactChecksum', 'qualityStatus', 'auditedAt', 'provenanceComplete',
  ]) || typeof answer.sourceArtifact.system !== 'string'
    || ![
      'artifactId', 'scenarioHash', 'solverVersion', 'solverBinaryChecksum', 'machineId',
      'pipelineCommit', 'manifestVersion', 'manifestChecksum', 'sourceArtifactChecksum',
      'qualityStatus', 'auditedAt',
    ].every((name) => nullableString(answer.sourceArtifact[name]))
    || typeof answer.sourceArtifact.provenanceComplete !== 'boolean') errors.push('sourceArtifact');
  if (!hasExactKeys(answer?.validDomain, [
    'completeKey', 'missingKeyDimensions', 'exactMatchDimensions',
    'approximatedDimensions', 'exclusions',
  ]) || typeof answer.validDomain.completeKey !== 'boolean'
    || !['missingKeyDimensions', 'exactMatchDimensions', 'approximatedDimensions', 'exclusions']
      .every((name) => Array.isArray(answer.validDomain[name])
        && answer.validDomain[name].every((value) => typeof value === 'string'))) errors.push('validDomain');
  else {
    const keyState = policyKeyCompleteness(answer?.key);
    if (answer.validDomain.completeKey !== keyState.complete) errors.push('validDomainCompleteKey');
    if (stablePolicyJson([...(answer.validDomain.missingKeyDimensions || [])].sort())
      !== stablePolicyJson([...keyState.missing].sort())) errors.push('missingKeyDimensionsMismatch');
  }
  if (!hasExactKeys(answer?.confidence, ['score', 'level'])
    || !Number.isFinite(answer.confidence.score) || answer.confidence.score < 0
    || answer.confidence.score > 1
    || !['none', 'low', 'medium', 'high'].includes(answer.confidence.level)) errors.push('confidence');
  else if (answer.confidence.level !== confidenceLevel(answer.confidence.score)) {
    errors.push('confidenceLevelMismatch');
  }
  if (!(answer?.fallbackReason === null || typeof answer?.fallbackReason === 'string')) {
    errors.push('fallbackReason');
  }
  const sum = Array.isArray(answer?.actions)
    ? answer.actions.reduce((total, action) => total + (finite(action.frequency) ?? 0), 0)
    : 0;
  if (answer?.actions?.length > 0 && Math.abs(sum - 1) > 1e-6) errors.push('distributionSum');
  if (answer?.kind === POLICY_KIND.EXACT) {
    if (!exactSourceComplete(answer?.sourceArtifact)) errors.push('exactProvenance');
    if (!policyKeyCompleteness(answer?.key).complete) errors.push('exactKey');
    if (answer?.qualitySeal !== QUALITY_SEAL.SOLVER_EXACT) errors.push('exactSeal');
    if (answer?.validDomain?.approximatedDimensions?.length > 0) errors.push('exactApproximation');
    if (answer?.fallbackReason) errors.push('exactFallback');
    if (!actionList.every(exactActionSizeIsComplete)) errors.push('exactActionSizes');
    if (!actionList.every((action) => exactActionUnitsAreConsistent(
      action, answer?.key, answer?.node,
    ))) errors.push('exactActionUnits');
    if (!actionList.every((action) => exactActionIsLegalForKey(action, answer?.key))) {
      errors.push('exactLegalActions');
    }
    if (!exactNodeIsConsistent(answer?.node, answer?.key)) errors.push('exactNode');
    if (!exactDomainIsConsistent(answer?.validDomain)) errors.push('exactDomain');
  }
  if (answer?.rangeDistribution !== null && !isRecord(answer?.rangeDistribution)) {
    errors.push('rangeDistribution');
  } else if (isRecord(answer?.rangeDistribution)) {
    for (const mix of Object.values(answer.rangeDistribution)) {
      if (!isRecord(mix)) {
        errors.push('rangeDistribution');
        continue;
      }
      const entries = Object.entries(mix);
      const total = entries.reduce((sumValue, [, value]) => sumValue + (finite(value) ?? 0), 0);
      if (entries.some(([id, value]) => !actionIds.has(id)
        || finite(value) === null || value < 0 || value > 1)
        || Math.abs(total - 1) > 1e-6) errors.push('rangeDistribution');
    }
  }
  return { valid: errors.length === 0, errors: [...new Set(errors)] };
}

/** Every consumer gets the same immutable JSON-safe policy envelope. */
export function solverPolicyConsumerEnvelope(answer) {
  const validation = validateSolverPolicyAnswer(answer);
  if (!validation.valid) throw new Error(`Invalid solver policy answer: ${validation.errors.join(', ')}`);
  return JSON.parse(JSON.stringify(answer));
}

/**
 * Build the portable artifact envelope consumed by Club Arena at boot. The
 * policies are validated and cloned before publication so a producer cannot
 * mutate an already-written artifact behind the consumer's back.
 */
export function createSolverPolicyArtifactBundle(policies, options = {}) {
  if (!Array.isArray(policies)) throw new Error('Solver policy artifact policies must be an array');
  const generatedAt = new Date(options.generatedAt ?? Date.now()).toISOString();
  const bundle = {
    contractVersion: SOLVER_POLICY_CONTRACT_VERSION,
    schemaSha256: SOLVER_POLICY_SCHEMA_SHA256,
    policyVersion: text(options.policyVersion, SOLVER_POLICY_VERSION),
    generatedAt,
    sourceArtifact: text(options.sourceArtifact, 'world_hub_solver_policy_service'),
    policies: policies.map(solverPolicyConsumerEnvelope),
  };
  const validation = validateSolverPolicyArtifactBundle(bundle);
  if (!validation.valid) {
    throw new Error(`Invalid solver policy artifact: ${validation.errors.join(', ')}`);
  }
  return bundle;
}

export function validateSolverPolicyArtifactBundle(value) {
  const errors = [];
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return { valid: false, errors: ['artifact'], bundle: null };
  }
  if (!hasExactKeys(value, [
    'contractVersion', 'schemaSha256', 'policyVersion', 'generatedAt',
    'sourceArtifact', 'policies',
  ])) errors.push('artifact.shape');
  if (value.contractVersion !== SOLVER_POLICY_CONTRACT_VERSION) errors.push('artifact.contractVersion');
  if (value.schemaSha256 !== SOLVER_POLICY_SCHEMA_SHA256) errors.push('artifact.schemaSha256');
  if (!text(value.policyVersion)) errors.push('artifact.policyVersion');
  if (!text(value.generatedAt) || !Number.isFinite(Date.parse(value.generatedAt))) {
    errors.push('artifact.generatedAt');
  }
  if (!text(value.sourceArtifact)) errors.push('artifact.sourceArtifact');
  if (!Array.isArray(value.policies)) errors.push('artifact.policies');
  else {
    if (value.policies.length === 0) errors.push('artifact.policies.empty');
    const scenarios = new Set();
    const keys = new Set();
    value.policies.forEach((policy, index) => {
      const result = validateSolverPolicyAnswer(policy);
      result.errors.forEach((error) => errors.push(`artifact.policies.${index}.${error}`));
      const scenario = policy?.sourceArtifact?.scenarioHash;
      const key = policy?.key ? stablePolicyJson(policy.key) : null;
      if (scenario && scenarios.has(scenario)) errors.push(`duplicate_scenario_hash:${scenario}`);
      if (key && keys.has(key)) errors.push(`duplicate_decision_key:${index}`);
      if (scenario) scenarios.add(scenario);
      if (key) keys.add(key);
    });
  }
  return {
    valid: errors.length === 0,
    errors,
    bundle: errors.length === 0 ? JSON.parse(JSON.stringify(value)) : null,
  };
}

export default {
  SOLVER_POLICY_CONTRACT_VERSION,
  SOLVER_POLICY_VERSION,
  SOLVER_POLICY_SCHEMA_SHA256,
  POLICY_KIND,
  QUALITY_SEAL,
  NODE_SEMANTICS,
  createSolverPolicyKey,
  createSolverPolicyAnswer,
  unavailableSolverPolicy,
  stablePolicyJson,
  policyKeyCompleteness,
  exactSourceComplete,
  validateSolverPolicyAnswer,
  solverPolicyConsumerEnvelope,
  createSolverPolicyArtifactBundle,
  validateSolverPolicyArtifactBundle,
};
