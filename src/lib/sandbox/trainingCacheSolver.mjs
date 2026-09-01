/**
 * Adapter between the canonical Training Arena question cache and the Virtual
 * Sandbox analysis response. Keeping this mapping in one pure module makes the
 * two products agree on the same hand, action ids, frequencies, and solver EVs.
 */

const VERIFIED_SOURCES = new Set([
  'DETERMINISTIC_SOLVER',
  'PIO_DATABASE',
  'PIO',
  'CHART',
  'local_solver_ranges',
]);

const ACTION_LABELS = {
  c: 'Check', x: 'Check', f: 'Fold', call: 'Call',
  b: 'Bet', b16: 'Bet 16%', b25: 'Bet 25%', b33: 'Bet 33%',
  b45: 'Bet 45%', b50: 'Bet 50%', b66: 'Bet 66%', b75: 'Bet 75%',
  b100: 'Bet Pot', b150: 'Overbet 150%', b200: 'Overbet 200%',
  allin: 'All-In', push: 'Push All-In', r: 'Raise',
};

const ACTION_COLORS = {
  Fold: '#ef4444', Check: '#6b7280', Call: '#f59e0b',
  Bet: '#3b82f6', Raise: '#22c55e', 'All-In': '#ec4899', Push: '#ec4899',
};

function finite(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function actionLabel(id, text, facingBet) {
  if (text && String(text).trim()) return String(text).trim();
  const key = String(id || '').toLowerCase();
  if (key === 'c' && facingBet) return 'Call';
  if (ACTION_LABELS[key]) return ACTION_LABELS[key];
  const bet = key.match(/^b(\d+)$/);
  if (bet) return `Bet ${bet[1]}%`;
  const raise = key.match(/^r(\d+)$/);
  if (raise) return `Raise ${raise[1]}%`;
  return String(id || 'Unknown').toUpperCase();
}

function actionColor(label) {
  const key = Object.keys(ACTION_COLORS).find(prefix => String(label || '').startsWith(prefix));
  return key ? ACTION_COLORS[key] : '#3b82f6';
}

function percent(value, scale) {
  const number = finite(value) ?? 0;
  return Math.max(0, Math.min(100, scale === 100 ? number * 100 : number));
}

export function canonicalBoard(value) {
  const cards = Array.isArray(value)
    ? value
    : String(value || '').match(/[2-9TJQKA][shdc]/gi) || [];
  const normalized = cards.map(card => String(card).toLowerCase());
  // Flop card order has no poker meaning; turn and river order does.
  return [...normalized.slice(0, 3).sort(), ...normalized.slice(3)].join('');
}

export function isCanonicalTrainingQuestion(question) {
  if (!question || typeof question !== 'object') return false;
  if (!VERIFIED_SOURCES.has(String(question.source || ''))) return false;
  if (String(question.dataQuality || '').toUpperCase() === 'SIMULATED') return false;
  const frequencies = question.gtoFrequencies;
  return !!frequencies && typeof frequencies === 'object'
    && Object.values(frequencies).some(value => (finite(value) ?? 0) > 0);
}

function facesBetState(question) {
  const scenario = question?.scenario || {};
  const node = String(scenario.nodeType || scenario.spotType || '').toLowerCase();
  if (/faces?_bet|facing_(bet|raise)|defen[cs]e|vs_(bet|raise)|3bet|4bet/.test(node)) return true;
  if (/bets?_or_checks?|first_to_act|checked_to|open_action/.test(node)) return false;
  const options = Array.isArray(question?.options) ? question.options : [];
  const tokens = options.map(option => `${option?.id ?? option} ${option?.text ?? ''}`.toLowerCase()).join(' ');
  if (/\bfold\b|\bcall\b|\braise\b/.test(tokens)) return true;
  if (/\bcheck\b|\bbet\b/.test(tokens)) return false;
  return null;
}

function comparableActions(actions) {
  if (!Array.isArray(actions)) return null;
  return actions.map(action => [
    String(action?.street || '').toLowerCase(),
    String(action?.position || '').toUpperCase(),
    String(action?.action || action?.id || '').toLowerCase(),
  ]);
}

function sameNumber(left, right, tolerance = 0.001) {
  const a = finite(left);
  const b = finite(right);
  return a !== null && b !== null && Math.abs(a - b) <= tolerance;
}

/**
 * A matching hand and board proves only that the cached matrix is relevant.
 * Solver verification requires every decision-defining field to be present and
 * equal. Missing cache metadata downgrades to an approximation; it never
 * inherits trust from a coincidental board match.
 */
export function assessDecisionContext(question, requested) {
  if (!requested || typeof requested !== 'object') {
    return { verified: false, mismatches: ['missing_requested_context'] };
  }
  const scenario = question?.scenario || {};
  const villain = requested.villains?.[0] || {};
  const questionActions = comparableActions(scenario.actionHistory);
  const requestedActions = comparableActions(requested.actionHistory) || [];
  const mismatches = [];

  const requireString = (value, expected, missingCode, mismatchCode, transform = value2 => String(value2)) => {
    if (value == null || value === '') mismatches.push(missingCode);
    else if (transform(value) !== transform(expected)) mismatches.push(mismatchCode);
  };

  requireString(scenario.gameType ?? question.game_type, requested.gameType, 'missing_game_type', 'game_type_mismatch', value => String(value || '').toLowerCase());
  requireString(scenario.villainPosition, villain.position, 'missing_villain_position', 'villain_position_mismatch', value => String(value || '').toUpperCase());
  if (finite(scenario.stackDepth ?? scenario.effectiveStack) === null) mismatches.push('missing_hero_stack');
  else if (!sameNumber(scenario.stackDepth ?? scenario.effectiveStack, requested.heroStack)) mismatches.push('hero_stack_mismatch');
  if (finite(scenario.villainStack) === null) mismatches.push('missing_villain_stack');
  else if (!sameNumber(scenario.villainStack, villain.stack)) mismatches.push('villain_stack_mismatch');
  if (finite(scenario.potSize ?? scenario.pot) === null) mismatches.push('missing_pot_size');
  else if (!sameNumber(scenario.potSize ?? scenario.pot, requested.potSize)) mismatches.push('pot_size_mismatch');
  if (finite(scenario.numberOfOpponents ?? scenario.numOpponents) === null) mismatches.push('missing_opponent_count');
  else if (!sameNumber(scenario.numberOfOpponents ?? scenario.numOpponents, requested.villains?.length)) mismatches.push('opponent_count_mismatch');

  if ((requested.villains || []).length > 1) {
    const cachedVillains = Array.isArray(scenario.villains) ? scenario.villains : null;
    if (!cachedVillains) mismatches.push('missing_multiway_context');
    else {
      const compactVillain = seat => [
        String(seat?.position || '').toUpperCase(),
        finite(seat?.stack),
        String(seat?.range || '').replace(/\s+/g, '').toUpperCase(),
      ];
      if (JSON.stringify(cachedVillains.map(compactVillain).sort()) !== JSON.stringify(requested.villains.map(compactVillain).sort())) {
        mismatches.push('multiway_context_mismatch');
      }
    }
  }

  if (questionActions === null) mismatches.push('missing_action_history');
  else if (JSON.stringify(questionActions) !== JSON.stringify(requestedActions)) mismatches.push('action_history_mismatch');

  if (requested.villainRange) {
    requireString(scenario.villainRange, requested.villainRange, 'missing_villain_range', 'villain_range_mismatch', value => String(value || '').replace(/\s+/g, '').toUpperCase());
  }
  if (requested.gameType !== 'cash' && Number(requested.bubbleFactor || 1) !== 1) {
    if (finite(scenario.bubbleFactor) === null) mismatches.push('missing_bubble_factor');
    else if (!sameNumber(scenario.bubbleFactor, requested.bubbleFactor)) mismatches.push('bubble_factor_mismatch');
  }
  if ((requested.villains || []).some(seat => seat?.nodeLock && seat.nodeLock !== 'None')) mismatches.push('node_lock_requires_resolve');
  if (requested.exploitMode && requested.exploitMode !== 'gto') mismatches.push('exploit_mode_requires_resolve');

  return { verified: mismatches.length === 0, mismatches };
}

/**
 * Deterministically choose the closest compatible cached question. A different
 * hero hand is never allowed: a solver range for another hand is not evidence
 * for the requested hand.
 */
export function chooseTrainingCacheMatch(rows, context = {}) {
  const wantedHand = String(context.heroNotation || '').toLowerCase();
  const wantedPosition = String(context.heroPosition || '').toLowerCase();
  const wantedStreet = String(context.street || '').toLowerCase();
  const wantedBoard = canonicalBoard(context.boardCards || []);
  const wantedFlop = wantedBoard.slice(0, 6);
  const wantedStack = finite(context.heroStack);

  const candidates = (rows || []).reduce((list, row) => {
    const question = row?.question_data;
    const scenario = question?.scenario || {};
    if (!isCanonicalTrainingQuestion(question)) return list;
    const hand = String(question.heroHand || scenario.heroHand || '').toLowerCase();
    if (!wantedHand || hand !== wantedHand) return list;
    if (wantedStreet && String(scenario.street || '').toLowerCase() !== wantedStreet) return list;
    if (wantedPosition && String(scenario.heroPosition || '').toLowerCase() !== wantedPosition) return list;
    const facesBet = facesBetState(question);
    if (context.facingBet === true && facesBet !== true) return list;
    if (context.facingBet === false && facesBet === true) return list;

    const board = canonicalBoard(question.boardCards || scenario.board || []);
    let matchTier = 3;
    if (board === wantedBoard) matchTier = 1;
    else if (wantedFlop && board.slice(0, 6) === wantedFlop) matchTier = 2;
    else if (wantedBoard || board) return list;

    const stack = finite(scenario.stackDepth ?? scenario.effectiveStack);
    const stackDelta = wantedStack !== null && stack !== null ? Math.abs(wantedStack - stack) : 999;
    const contextAssessment = assessDecisionContext(question, context.decisionContext);
    list.push({
      row,
      question,
      matchTier,
      stackDelta,
      contextVerified: matchTier === 1 && contextAssessment.verified,
      contextMismatches: contextAssessment.mismatches,
    });
    return list;
  }, []);

  candidates.sort((a, b) => (
    a.matchTier - b.matchTier
    || a.stackDelta - b.stackDelta
    || String(a.row.question_id || a.row.id || '').localeCompare(String(b.row.question_id || b.row.id || ''))
  ));
  return candidates[0] || null;
}

/** Map one verified Training Arena question onto the Sandbox result contract. */
export function mapTrainingQuestionToAnalysis(question, { facingBet = false } = {}) {
  if (!isCanonicalTrainingQuestion(question)) return null;
  const frequencies = question.gtoFrequencies || {};
  const frequencyValues = Object.values(frequencies).map(finite).filter(value => value !== null);
  const scale = frequencyValues.length > 0 && Math.max(...frequencyValues) <= 1 ? 100 : 1;
  const options = Array.isArray(question.options) ? question.options : [];
  const optionById = new Map(options.map(option => [String(option?.id ?? option), option]));
  const ids = [...new Set([...Object.keys(frequencies), ...optionById.keys()])];
  const actionEVs = question.evData?.actionEVs && typeof question.evData.actionEVs === 'object'
    ? question.evData.actionEVs
    : {};

  const actions = ids.map(id => {
    const option = optionById.get(id);
    const label = actionLabel(id, option?.text, facingBet);
    const entry = {
      id,
      label,
      frequency: +percent(frequencies[id] ?? option?.frequency, scale).toFixed(1),
      color: actionColor(label),
      isOptimal: false,
    };
    const ev = finite(actionEVs[id]);
    if (ev !== null) entry.ev = +ev.toFixed(3);
    return entry;
  }).filter(action => action.frequency > 0 || Object.prototype.hasOwnProperty.call(frequencies, action.id));

  if (actions.length === 0) return null;
  actions.sort((a, b) => b.frequency - a.frequency || a.id.localeCompare(b.id));
  actions[0].isOptimal = true;
  const total = actions.reduce((sum, action) => sum + action.frequency, 0);
  if (total > 0 && Math.abs(total - 100) > 0.01) {
    actions.forEach(action => { action.frequency = +(action.frequency / total * 100).toFixed(1); });
  }

  const priced = actions.map(action => action.ev).filter(value => typeof value === 'number');
  const heroEV = finite(question.evData?.heroHandEV ?? question.evData?.heroEV);
  const displayEV = heroEV === null ? 0 : heroEV;
  // Canonical cache generations do not all use the same unit for `optimalEV`:
  // older rows may store a normalized 0..1 quality score there while the
  // per-action values are measured in BB. Never compare those unlike units.
  // When action EVs exist they are the internally consistent pricing source;
  // `optimalEV` is only a fallback for rows without per-action pricing.
  const maxEV = priced.length
    ? Math.max(...priced)
    : finite(question.evData?.optimalEV) ?? displayEV;
  const minEV = priced.length ? Math.min(...priced) : displayEV;
  const avgEV = priced.length ? priced.reduce((sum, value) => sum + value, 0) / priced.length : displayEV;

  return {
    heroHand: question.heroHand || question.scenario?.heroHand || null,
    actions,
    optimalAction: { ...actions[0] },
    isMixed: actions.filter(action => action.frequency >= 5).length > 1,
    ev: {
      hero: +displayEV.toFixed(3),
      heroDisplay: heroEV === null ? 'Not Available' : `${heroEV >= 0 ? '+' : ''}${heroEV.toFixed(2)} BB`,
      max: +maxEV.toFixed(3),
      min: +minEV.toFixed(3),
      avg: +avgEV.toFixed(3),
      evLoss: heroEV === null ? 0 : +Math.max(0, maxEV - heroEV).toFixed(3),
    },
    explanation: question.explanation || null,
  };
}

export default {
  canonicalBoard,
  isCanonicalTrainingQuestion,
  chooseTrainingCacheMatch,
  mapTrainingQuestionToAnalysis,
};
