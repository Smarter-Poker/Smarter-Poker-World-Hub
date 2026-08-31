/**
 * Personal Assistant decision contract.
 *
 * The Sandbox, Training cache adapter, and analysis API all consume this pure
 * module. Unknown input stays unknown: no cards, stacks, pots, positions, or
 * action lines are invented here.
 */

export const SCENARIO_SCHEMA_VERSION = 'pa-decision-v1';
export const NODE_LOCK_MODEL_VERSION = 'pa-node-lock-model-v1';

const CARD_RE = /^[2-9TJQKA][cdhs]$/;
const POSITIONS = new Set(['UTG', 'UTG1', 'UTG2', 'LJ', 'MP', 'HJ', 'CO', 'BTN', 'SB', 'BB']);
const STREETS = ['preflop', 'flop', 'turn', 'river'];
const GAME_TYPES = new Set(['cash', 'tournament']);
const NODE_LOCKS = new Set(['None', 'Overfold', 'CallingStation', 'Maniac']);
const ACTION_RE = /^(?:f|fold|x|check|c|call|r|raise|allin|push|b\d+|bet_\d+|raise_\d+)$/;

function issue(path, code, message) {
  return { path, code, message };
}

export class ScenarioValidationError extends Error {
  constructor(issues) {
    super('The poker scenario is invalid.');
    this.name = 'ScenarioValidationError';
    this.code = 'invalid_scenario';
    this.issues = Array.isArray(issues) ? issues : [];
  }
}

function finiteNumber(value, { min, max, path, issues }) {
  const number = Number(value);
  if (!Number.isFinite(number) || number < min || number > max) {
    issues.push(issue(path, 'invalid_number', `${path} must be between ${min} and ${max}.`));
    return null;
  }
  return +number.toFixed(3);
}

function cardCode(value, path, issues) {
  if (typeof value !== 'string') {
    issues.push(issue(path, 'invalid_card', `${path} must be a two-character card code.`));
    return null;
  }
  const raw = value.trim();
  const card = raw ? `${raw[0]?.toUpperCase() || ''}${raw[1]?.toLowerCase() || ''}` : '';
  if (!CARD_RE.test(card)) {
    issues.push(issue(path, 'invalid_card', `${path} must use a card code such as Ah or 7c.`));
    return null;
  }
  return card;
}

function position(value, path, issues) {
  const normalized = String(value || '').trim().toUpperCase();
  if (!POSITIONS.has(normalized)) {
    issues.push(issue(path, 'invalid_position', `${path} is not a supported table position.`));
    return null;
  }
  return normalized;
}

function normalizeGameType(value, issues) {
  const normalized = String(value || '').trim().toLowerCase();
  if (!GAME_TYPES.has(normalized)) {
    issues.push(issue('gameType', 'invalid_game_type', 'gameType must be cash or tournament.'));
    return null;
  }
  return normalized;
}

function normalizeBoard(rawBoard, issues) {
  const source = rawBoard && typeof rawBoard === 'object' ? rawBoard : {};
  const rawFlop = Array.isArray(source.flop) ? source.flop.filter(value => value != null && value !== '') : [];
  const flop = rawFlop.map((value, index) => cardCode(value, `board.flop[${index}]`, issues)).filter(Boolean);
  const turn = source.turn == null || source.turn === '' ? null : cardCode(source.turn, 'board.turn', issues);
  const river = source.river == null || source.river === '' ? null : cardCode(source.river, 'board.river', issues);

  if (![0, 3].includes(flop.length) || (turn && flop.length !== 3) || (river && (!turn || flop.length !== 3))) {
    issues.push(issue('board', 'invalid_board', 'Board must contain zero cards, a complete flop, a flop and turn, or all five cards.'));
  }
  return { flop, turn, river };
}

function normalizeArchetype(raw) {
  if (!raw || typeof raw !== 'object') return { id: 'gto_neutral', name: 'GTO Neutral' };
  const id = String(raw.id || 'gto_neutral').trim().slice(0, 64) || 'gto_neutral';
  const name = String(raw.name || id.replace(/_/g, ' ')).trim().slice(0, 96);
  return { id, name };
}

function normalizeVillains(rawVillains, issues, topLevelNodeLock) {
  if (!Array.isArray(rawVillains) || rawVillains.length < 1 || rawVillains.length > 5) {
    issues.push(issue('villains', 'invalid_villains', 'Between one and five villain seats are required.'));
    return [];
  }

  return rawVillains.map((raw, index) => {
    const source = raw && typeof raw === 'object' ? raw : {};
    const lockCandidate = index === 0 && topLevelNodeLock ? topLevelNodeLock : source.nodeLock;
    const nodeLock = lockCandidate == null || lockCandidate === '' ? 'None' : String(lockCandidate);
    if (!NODE_LOCKS.has(nodeLock)) {
      issues.push(issue(`villains[${index}].nodeLock`, 'invalid_node_lock', 'Unsupported node-lock profile.'));
    }
    const range = typeof source.range === 'string' ? source.range.trim().slice(0, 500) : '';
    return {
      id: source.id == null ? index : String(source.id).slice(0, 64),
      position: position(source.position, `villains[${index}].position`, issues),
      stack: finiteNumber(source.stack, { min: 1, max: 10000, path: `villains[${index}].stack`, issues }),
      archetype: normalizeArchetype(source.archetype),
      range,
      nodeLock: NODE_LOCKS.has(nodeLock) ? nodeLock : 'None',
    };
  });
}

function normalizeActionId(value, path, issues) {
  const normalized = String(value || '').trim().toLowerCase().replace(/\s+/g, '_');
  if (!ACTION_RE.test(normalized)) {
    issues.push(issue(path, 'invalid_action', `${path} is not a supported poker action.`));
    return null;
  }
  return normalized;
}

export function normalizeActionHistory(rawHistory, { issues = [] } = {}) {
  if (rawHistory == null) return [];
  if (!Array.isArray(rawHistory) || rawHistory.length > 80) {
    issues.push(issue('actionHistory', 'invalid_action_history', 'actionHistory must contain no more than 80 actions.'));
    return [];
  }

  let previousStreet = -1;
  return rawHistory.map((raw, index) => {
    const source = raw && typeof raw === 'object' ? raw : {};
    const street = String(source.street || '').trim().toLowerCase();
    const streetIndex = STREETS.indexOf(street);
    if (streetIndex < 0) issues.push(issue(`actionHistory[${index}].street`, 'invalid_street', 'Action street is invalid.'));
    if (streetIndex >= 0 && streetIndex < previousStreet) {
      issues.push(issue(`actionHistory[${index}].street`, 'street_order', 'Action streets cannot move backwards.'));
    }
    previousStreet = Math.max(previousStreet, streetIndex);

    const action = normalizeActionId(source.action || source.id, `actionHistory[${index}].action`, issues);
    const actorPosition = position(source.position, `actionHistory[${index}].position`, issues);
    return {
      position: actorPosition,
      action,
      label: String(source.label || source.action || '').trim().slice(0, 80),
      street: streetIndex >= 0 ? street : null,
      isHero: source.isHero === true,
      isVillain: source.isVillain === true,
    };
  });
}

function duplicateCardIssues(cards, issues) {
  const seen = new Set();
  for (const [path, card] of cards) {
    if (!card) continue;
    const key = card.toLowerCase();
    if (seen.has(key)) issues.push(issue(path, 'duplicate_card', `${card} appears more than once in the scenario.`));
    seen.add(key);
  }
}

export function validateAndNormalizeScenario(input) {
  const source = input && typeof input === 'object' ? input : {};
  const issues = [];
  const card1 = cardCode(source.heroHand?.card1, 'heroHand.card1', issues);
  const card2 = cardCode(source.heroHand?.card2, 'heroHand.card2', issues);
  if (!card1 || !card2) issues.push(issue('heroHand', 'hero_hand_required', 'Exactly two valid hero cards are required.'));

  const heroPosition = position(source.heroPosition, 'heroPosition', issues);
  const heroStack = finiteNumber(source.heroStack, { min: 1, max: 10000, path: 'heroStack', issues });
  const gameType = normalizeGameType(source.gameType, issues);
  const board = normalizeBoard(source.board, issues);
  const potSize = finiteNumber(source.potSize, { min: 0.01, max: 1000000, path: 'potSize', issues });
  const villains = normalizeVillains(source.villains, issues, source.nodeLock);
  const actionHistory = normalizeActionHistory(source.actionHistory, { issues });

  const bubbleRaw = source.bubbleFactor == null ? 1 : Number(source.bubbleFactor);
  if (!Number.isFinite(bubbleRaw) || bubbleRaw <= 0 || bubbleRaw > 10) {
    issues.push(issue('bubbleFactor', 'invalid_bubble_factor', 'bubbleFactor must be greater than 0 and no more than 10.'));
  }
  const bubbleFactor = Number.isFinite(bubbleRaw) && bubbleRaw > 0 && bubbleRaw <= 10
    ? +bubbleRaw.toFixed(2)
    : 1;
  const exploitMode = source.exploitMode == null ? 'gto' : String(source.exploitMode).trim().toLowerCase();
  if (!['gto', 'exploit'].includes(exploitMode)) {
    issues.push(issue('exploitMode', 'invalid_exploit_mode', 'exploitMode must be gto or exploit.'));
  }
  const betSizing = source.betSizing == null ? 'standard' : String(source.betSizing).trim().toLowerCase();
  if (betSizing !== 'standard') {
    issues.push(issue('betSizing', 'invalid_bet_sizing', 'betSizing must be standard.'));
  }
  let socratic = null;
  if (source.socratic?.userPick != null && source.socratic.userPick !== '') {
    socratic = { userPick: normalizeActionId(source.socratic.userPick, 'socratic.userPick', issues) };
  }

  const occupied = new Set();
  for (const [path, seat] of [['heroPosition', heroPosition], ...villains.map((villain, index) => [`villains[${index}].position`, villain.position])]) {
    if (!seat) continue;
    if (occupied.has(seat)) issues.push(issue(path, 'duplicate_position', `${seat} is assigned to more than one player.`));
    occupied.add(seat);
  }

  duplicateCardIssues([
    ['heroHand.card1', card1], ['heroHand.card2', card2],
    ...board.flop.map((card, index) => [`board.flop[${index}]`, card]),
    ['board.turn', board.turn], ['board.river', board.river],
  ], issues);

  const occupiedPositions = new Set([heroPosition, ...villains.map(villain => villain.position)].filter(Boolean));
  actionHistory.forEach((entry, index) => {
    if (entry.position && !occupiedPositions.has(entry.position)) {
      issues.push(issue(`actionHistory[${index}].position`, 'unknown_actor', 'Action actor is not seated in this scenario.'));
    }
    if (entry.isHero && entry.position !== heroPosition) {
      issues.push(issue(`actionHistory[${index}].isHero`, 'hero_position_mismatch', 'Hero action position does not match heroPosition.'));
    }
  });

  const foldedPositions = new Set();
  const villainPositions = villains.map(villain => villain.position).filter(Boolean);
  actionHistory.forEach((entry, index) => {
    const heroFolded = heroPosition ? foldedPositions.has(heroPosition) : false;
    const everyVillainFolded = villainPositions.length > 0
      && villainPositions.every(seat => foldedPositions.has(seat));
    if (heroFolded || everyVillainFolded) {
      issues.push(issue(`actionHistory[${index}]`, 'terminal_action_followed', 'No action may follow the end of the hand.'));
    }
    if (entry.position && foldedPositions.has(entry.position)) {
      issues.push(issue(`actionHistory[${index}].position`, 'folded_actor', 'A folded player cannot act again.'));
    }
    if (entry.action === 'f' || entry.action === 'fold') foldedPositions.add(entry.position);
  });

  if (issues.length > 0) throw new ScenarioValidationError(issues);

  return {
    schemaVersion: SCENARIO_SCHEMA_VERSION,
    heroHand: { card1, card2 },
    heroPosition,
    heroStack,
    gameType,
    villains,
    board,
    potSize,
    actionHistory,
    betSizing,
    exploitMode: ['gto', 'exploit'].includes(exploitMode) ? exploitMode : 'gto',
    villainArchetype: String(source.villainArchetype || villains[0]?.archetype?.id || 'gto_neutral').slice(0, 64),
    villainRange: String(source.villainRange || villains[0]?.range || '').trim().slice(0, 500),
    bubbleFactor,
    socratic,
  };
}

function canonicalBoard(board) {
  const flop = [...(board?.flop || [])].map(card => String(card).toLowerCase()).sort();
  return [...flop, board?.turn ? String(board.turn).toLowerCase() : null, board?.river ? String(board.river).toLowerCase() : null];
}

function actionIdentity(entry) {
  return [entry.street, entry.position, entry.action, entry.isHero ? 'hero' : entry.isVillain ? 'villain' : 'actor'];
}

export function buildDecisionIdentity(scenario) {
  const source = scenario || {};
  return {
    version: SCENARIO_SCHEMA_VERSION,
    gameType: source.gameType,
    hero: {
      cards: [source.heroHand?.card1, source.heroHand?.card2].filter(Boolean).map(card => String(card).toLowerCase()).sort(),
      position: source.heroPosition,
      stack: Number(source.heroStack),
    },
    board: canonicalBoard(source.board),
    potSize: Number(source.potSize),
    villains: (source.villains || []).map(villain => ({
      position: villain.position,
      stack: Number(villain.stack),
      archetype: villain.archetype?.id || null,
      range: String(villain.range || ''),
      nodeLock: villain.nodeLock || 'None',
    })).sort((a, b) => String(a.position).localeCompare(String(b.position))),
    actionHistory: (source.actionHistory || []).map(actionIdentity),
    exploitMode: source.exploitMode || 'gto',
    villainArchetype: source.villainArchetype || source.villains?.[0]?.archetype?.id || null,
    villainRange: String(source.villainRange || source.villains?.[0]?.range || ''),
    bubbleFactor: Number(source.bubbleFactor || 1),
    betSizing: source.betSizing || 'standard',
    socraticPick: source.socratic?.userPick || null,
  };
}

export function buildDecisionFingerprint(scenario) {
  return JSON.stringify(buildDecisionIdentity(scenario));
}

export function buildDecisionLine(actionHistory) {
  if (!Array.isArray(actionHistory) || actionHistory.length === 0) return 'No prior actions at this decision node.';
  return actionHistory.map(entry => `${entry.street}: ${entry.position} ${entry.label || entry.action}`).join(' -> ');
}

export function activeNodeLocks(villains) {
  return (villains || [])
    .filter(villain => villain?.nodeLock && villain.nodeLock !== 'None')
    .map(villain => ({ position: villain.position, lock: villain.nodeLock }));
}

function actionFamily(action, facingBet) {
  const id = String(action?.id || '').toLowerCase();
  if (id === 'f' || id === 'fold') return 'fold';
  if (id === 'c' || id === 'call') return facingBet ? 'call' : 'check';
  if (id === 'x' || id === 'check') return 'check';
  if (/^(?:b\d+|bet_|r|raise|allin|push)/.test(id)) return 'aggressive';
  return 'passive';
}

const LOCK_MULTIPLIERS = {
  Overfold: { fold: 0.7, call: 0.8, check: 0.8, passive: 0.8, aggressive: 1.65 },
  CallingStation: { fold: 0.8, call: 1.35, check: 1.2, passive: 1.2, aggressive: 0.8 },
  Maniac: { fold: 0.65, call: 1.35, check: 1.45, passive: 1.25, aggressive: 0.75 },
};

/**
 * Deterministic exploit model for a declared villain deviation.
 *
 * This is deliberately not presented as a solver re-solve: the stored matrix
 * does not contain a complete downstream game tree. It changes the actionable
 * frequency mix, removes every stale EV claim, and labels the output as a model
 * approximation until a full tree-backed solve exists.
 */
export function applyNodeLockModel(analysis, locks, { facingBet = false } = {}) {
  const active = (locks || []).filter(lock => LOCK_MULTIPLIERS[lock?.lock]);
  if (!analysis || active.length === 0 || !Array.isArray(analysis.actions) || analysis.actions.length === 0) return analysis;

  const weighted = analysis.actions.map(action => {
    const family = actionFamily(action, facingBet);
    const multiplier = active.reduce((product, lock) => product * (LOCK_MULTIPLIERS[lock.lock][family] || 1), 1);
    return { ...action, _weight: Math.max(0, Number(action.frequency) || 0) * multiplier };
  });
  const total = weighted.reduce((sum, action) => sum + action._weight, 0) || 1;
  const actions = weighted.map(action => {
    const { _weight, ev: _ev, ...safe } = action;
    return { ...safe, frequency: +((_weight / total) * 100).toFixed(1), isOptimal: false };
  }).sort((a, b) => b.frequency - a.frequency || String(a.id).localeCompare(String(b.id)));
  actions[0].isOptimal = true;

  const lockLabel = active.map(lock => `${lock.position} ${lock.lock}`).join(', ');
  return {
    ...analysis,
    actions,
    optimalAction: { ...actions[0] },
    isMixed: actions.filter(action => action.frequency >= 5).length > 1,
    ev: { hero: 0, heroDisplay: '—', max: 0, min: 0, avg: 0, evLoss: 0 },
    rangeHeatmap: null,
    baselineEv: analysis.ev || null,
    baselineActions: analysis.actions,
    nodeLockApplied: true,
    nodeLocks: active,
    nodeLockModelVersion: NODE_LOCK_MODEL_VERSION,
    truthLevel: 'model_approx',
    confidence: 'Low',
    source: 'Modeled Node-Lock Adjustment',
    explanation: `Modeled exploit adjustment for ${lockLabel}. Frequencies are adjusted from the baseline strategy; EV is intentionally unpriced because the stored solver row does not contain a complete downstream tree. ${analysis.explanation || ''}`.trim(),
  };
}
