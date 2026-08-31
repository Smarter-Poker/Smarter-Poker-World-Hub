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
const ARCHETYPE_NAMES = {
  nit: 'Nit', tag: 'TAG', lag: 'LAG', fish: 'Fish',
  calling_station: 'Calling Station', maniac: 'Maniac', gto_neutral: 'GTO Neutral',
};
const ARCHETYPE_ALIASES = {
  tight_passive: 'nit', loose_passive: 'calling_station', tight_aggressive: 'tag',
  loose_aggressive: 'lag', over_bluffer: 'maniac', under_bluffer: 'nit',
  fit_or_fold: 'fish', icm_scared: 'nit', icm_pressure: 'lag',
};

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

function normalizeArchetype(raw, path, issues) {
  const requested = String(raw?.id || 'gto_neutral').trim().toLowerCase();
  const id = ARCHETYPE_NAMES[requested] ? requested : ARCHETYPE_ALIASES[requested];
  if (!id) {
    issues.push(issue(path, 'invalid_archetype', 'Villain archetype is not supported.'));
    return { id: 'gto_neutral', name: ARCHETYPE_NAMES.gto_neutral };
  }
  // Display names are server-owned. A client-supplied name must never become
  // prompt instructions or persisted analysis copy.
  return { id, name: ARCHETYPE_NAMES[id] };
}

function normalizeRange(value, path, issues) {
  const source = String(value || '').trim();
  if (!source) return '';
  if (source.length > 500) {
    issues.push(issue(path, 'range_too_long', 'Poker range notation must be no more than 500 characters.'));
    return '';
  }
  const combo = '[2-9TJQKA]{2}[so]?';
  const tokenRe = new RegExp(`^(?:${combo}\\+?|${combo}-${combo})$`, 'i');
  const tokens = source.split(/[,;\n]+/).map(token => token.trim().replace(/10/gi, 'T')).filter(Boolean);
  if (tokens.length === 0 || tokens.some(token => !tokenRe.test(token))) {
    issues.push(issue(path, 'invalid_range', 'Poker range must use notation such as AA, AKs, AKo, 22+, or A5s-A2s.'));
    return '';
  }
  return tokens.join(',');
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
    const range = normalizeRange(source.range, `villains[${index}].range`, issues);
    return {
      id: source.id == null ? index : String(source.id).slice(0, 64),
      position: position(source.position, `villains[${index}].position`, issues),
      stack: finiteNumber(source.stack, { min: 1, max: 10000, path: `villains[${index}].stack`, issues }),
      archetype: normalizeArchetype(source.archetype, `villains[${index}].archetype`, issues),
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
  const sized = normalized.match(/^(?:b|bet_|raise_)(\d+)$/);
  if (sized && (Number(sized[1]) < 1 || Number(sized[1]) > 1000)) {
    issues.push(issue(path, 'invalid_action_size', `${path} sizing must be between 1% and 1000%.`));
    return null;
  }
  return normalized;
}

function canonicalActionLabel(action) {
  if (action === 'f' || action === 'fold') return 'Fold';
  if (action === 'x' || action === 'check') return 'Check';
  if (action === 'c') return 'Check/Call';
  if (action === 'call') return 'Call';
  if (action === 'r' || action === 'raise') return 'Raise';
  if (action === 'allin' || action === 'push') return 'All-In';
  const sized = String(action || '').match(/^(b|bet_|raise_)(\d+)$/);
  if (sized) return `${sized[1] === 'raise_' ? 'Raise' : 'Bet'} ${sized[2]}%`;
  return 'Action';
}

function actionKind(action, hasOutstandingWager) {
  if (action === 'f' || action === 'fold') return 'fold';
  if (action === 'x' || action === 'check') return 'check';
  if (action === 'c') return hasOutstandingWager ? 'call' : 'check';
  if (action === 'call') return 'call';
  if (action === 'r' || action === 'raise' || String(action || '').startsWith('raise_')) return 'raise';
  if (action === 'allin' || action === 'push') return 'allin';
  if (/^(?:b\d+|bet_\d+)$/.test(String(action || ''))) return 'bet';
  return 'unknown';
}

function analyzeActionLine(scenario, issues = null) {
  const entries = scenario?.actionHistory || [];
  const heroPosition = scenario?.heroPosition;
  const availableStreet = scenario?.board?.river ? 3 : scenario?.board?.turn ? 2 : scenario?.board?.flop?.length === 3 ? 1 : 0;
  const allSeats = [heroPosition, ...(scenario?.villains || []).map(villain => villain.position)].filter(Boolean);
  const folded = new Set();
  let street = null;
  let pending = new Set();
  let checked = new Set();
  let closed = false;
  let hadActions = false;

  const report = (path, code, message) => { if (issues) issues.push(issue(path, code, message)); };
  const activeSeats = () => allSeats.filter(seat => !folded.has(seat));

  entries.forEach((entry, index) => {
    const streetIndex = STREETS.indexOf(entry.street);
    if (streetIndex > availableStreet) {
      report(`actionHistory[${index}].street`, 'street_not_dealt', 'An action cannot occur on a street that has not been dealt.');
    }
    if (entry.street !== street) {
      if (street !== null && hadActions && !closed) {
        report(`actionHistory[${index}].street`, 'street_advanced_before_close', 'The previous betting round is still open.');
      }
      street = entry.street;
      pending = new Set();
      checked = new Set();
      closed = false;
      hadActions = false;
    }

    const path = `actionHistory[${index}]`;
    const actor = entry.position;
    const hasOutstandingWager = pending.size > 0;
    const kind = actionKind(entry.action, hasOutstandingWager);
    const activeBefore = activeSeats();

    if (closed) report(path, 'round_closed', 'No action may follow a closed betting round on the same street.');
    if (actor && folded.has(actor)) report(`${path}.position`, 'folded_actor', 'A folded player cannot act again.');

    if (hasOutstandingWager) {
      if (actor && !pending.has(actor)) report(`${path}.position`, 'actor_not_pending', 'This player has no action pending.');
      if (kind === 'check') report(`${path}.action`, 'check_facing_wager', 'A player facing a wager cannot check.');
      if (kind === 'bet') report(`${path}.action`, 'bet_facing_wager', 'A player facing a wager must raise rather than bet.');

      if (kind === 'fold') {
        folded.add(actor);
        pending.delete(actor);
      } else if (kind === 'call') {
        pending.delete(actor);
      } else if (kind === 'raise' || kind === 'allin') {
        pending = new Set(activeBefore.filter(seat => seat !== actor));
      }
      if ((kind === 'fold' || kind === 'call') && pending.size === 0) closed = true;
    } else {
      const preflop = entry.street === 'preflop';
      if (!preflop && kind === 'call') report(`${path}.action`, 'call_without_wager', 'A postflop call requires an outstanding wager.');
      if (!preflop && kind === 'fold') report(`${path}.action`, 'fold_without_wager', 'A postflop fold requires an outstanding wager.');
      if (!preflop && kind === 'raise') report(`${path}.action`, 'raise_without_wager', 'An unopened postflop pot must be bet rather than raised.');

      if (kind === 'fold') folded.add(actor);
      else if (kind === 'bet' || kind === 'raise' || kind === 'allin') {
        pending = new Set(activeBefore.filter(seat => seat !== actor));
      } else if (kind === 'check' || (preflop && kind === 'call')) {
        checked.add(actor);
        if (activeBefore.length > 0 && activeBefore.every(seat => checked.has(seat))) closed = true;
      }
    }

    if (activeSeats().length <= 1) closed = true;
    hadActions = true;
  });

  return { street, pending, closed, heroFacingWager: !closed && pending.has(heroPosition) };
}

export function isHeroFacingWager(scenario) {
  return analyzeActionLine(scenario).heroFacingWager;
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
      // Labels are presentation only and therefore server-owned. Accepting a
      // caller's prose here would feed arbitrary instructions into the model
      // through buildDecisionLine().
      label: canonicalActionLabel(action),
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
  const villainArchetype = normalizeArchetype(
    { id: source.villainArchetype || villains[0]?.archetype?.id || 'gto_neutral' },
    'villainArchetype', issues,
  ).id;
  const villainRange = normalizeRange(source.villainRange || villains[0]?.range || '', 'villainRange', issues);

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
    if (entry.isHero && entry.isVillain) {
      issues.push(issue(`actionHistory[${index}]`, 'conflicting_actor_role', 'An action cannot belong to both hero and villain.'));
    }
    if (entry.isVillain && entry.position === heroPosition) {
      issues.push(issue(`actionHistory[${index}].isVillain`, 'villain_position_mismatch', 'Villain action position cannot match heroPosition.'));
    }
  });

  analyzeActionLine({ heroPosition, villains, board, actionHistory }, issues);

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
    villainArchetype,
    villainRange,
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
    nodeLockApplied: true,
    nodeLocks: active,
    nodeLockModelVersion: NODE_LOCK_MODEL_VERSION,
    truthLevel: 'model_approx',
    confidence: 'Low',
    source: 'Modeled Node-Lock Adjustment',
    explanation: `Modeled exploit adjustment for ${lockLabel}. Frequencies are adjusted from the baseline strategy; EV is intentionally unpriced because the stored solver row does not contain a complete downstream tree. ${analysis.explanation || ''}`.trim(),
  };
}
