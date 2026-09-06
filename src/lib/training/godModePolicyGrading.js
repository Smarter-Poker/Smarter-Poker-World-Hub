/**
 * Pure grading helpers for the God Mode compatibility route.
 *
 * Canonical action ids and source codes are both accepted. Ambiguous generic
 * actions fail closed instead of silently selecting the first bet size.
 */

const finite = (value) => {
  if (value === null || value === undefined || value === '') return null;
  const raw = String(value).trim();
  const parsed = raw.endsWith('%') ? Number(raw.slice(0, -1)) : Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

const normalize = (value) => String(value ?? '').trim().toLowerCase();

function requestedFamily(value) {
  const action = normalize(value);
  if (['allin', 'all_in', 'all-in', 'jam', 'push', 'shove'].includes(action)) return 'all_in';
  if (['fold', 'f'].includes(action)) return 'fold';
  if (['check', 'x', 'k'].includes(action)) return 'check';
  if (['call'].includes(action)) return 'call';
  if (action === 'bet' || action.startsWith('bet_') || /^b\d/.test(action)) return 'bet';
  if (action === 'raise' || action.startsWith('raise_') || /^r\d/.test(action)) return 'raise';
  return action;
}

function sizingDistance(action, userSizing) {
  const raw = finite(userSizing);
  if (raw === null) return null;
  const text = String(userSizing).trim();
  const candidates = [];
  if (Number.isFinite(action?.size?.potFraction)) {
    const requestedFraction = text.endsWith('%') || raw > 3 ? raw / 100 : raw;
    candidates.push(Math.abs(action.size.potFraction - requestedFraction));
  }
  if (Number.isFinite(action?.size?.bigBlinds)) {
    candidates.push(Math.abs(action.size.bigBlinds - raw) / Math.max(1, action.size.bigBlinds));
  }
  if (Number.isFinite(action?.size?.chips)) {
    candidates.push(Math.abs(action.size.chips - raw) / Math.max(1, action.size.chips));
  }
  return candidates.length > 0 ? Math.min(...candidates) : null;
}

export function findMatchingPolicyAction(userAction, userSizing, actions = []) {
  const requested = normalize(userAction);
  if (!requested) return null;
  const direct = actions.filter((action) => (
    normalize(action?.id) === requested || normalize(action?.sourceCode) === requested
  ));
  if (direct.length === 1) return direct[0];
  if (direct.length > 1) return null;

  const family = requestedFamily(requested);
  let familyMatches = actions.filter((action) => normalize(action?.family) === family);
  // Compatibility for old controls that called every aggressive wager a bet
  // or raise. This is safe only when the resulting candidate is unambiguous.
  if (familyMatches.length === 0 && (family === 'bet' || family === 'raise')) {
    familyMatches = actions.filter((action) => ['bet', 'raise'].includes(normalize(action?.family)));
  }
  if (familyMatches.length === 1) return familyMatches[0];
  if (familyMatches.length === 0 || finite(userSizing) === null) return null;

  const ranked = familyMatches
    .map((action) => ({ action, distance: sizingDistance(action, userSizing) }))
    .filter((entry) => entry.distance !== null)
    .sort((a, b) => a.distance - b.distance || normalize(a.action.id).localeCompare(normalize(b.action.id)));
  if (ranked.length === 0) return null;
  if (ranked.length > 1 && Math.abs(ranked[0].distance - ranked[1].distance) < 1e-12) return null;
  return ranked[0].action;
}

function actionName(action) {
  return String(action?.label || action?.id || 'Unknown').trim();
}

export function gradeSolverPolicyAction({
  userAction,
  userSizing,
  policy,
  indifferenceThreshold = 0.4,
  maxChipPenalty = 25,
}) {
  const actions = Array.isArray(policy?.actions) ? policy.actions : [];
  const selected = findMatchingPolicyAction(userAction, userSizing, actions);
  const fullyMeasured = policy?.chipEv?.measuredByAction === true
    && actions.length > 0
    && actions.every((action) => Number.isFinite(action.chipEvBb));
  const ranked = [...actions].sort(fullyMeasured
    ? (a, b) => b.chipEvBb - a.chipEvBb || a.id.localeCompare(b.id)
    : (a, b) => b.frequency - a.frequency || a.id.localeCompare(b.id));
  const best = ranked[0] || null;
  const userFrequency = selected ? Number(selected.frequency) || 0 : 0;
  const isIndifferent = Boolean(selected) && userFrequency >= indifferenceThreshold;
  const isCorrect = Boolean(selected && best) && (selected.id === best.id || isIndifferent);
  const evMeasured = fullyMeasured && Boolean(selected && best);
  const evLoss = evMeasured ? Math.max(0, best.chipEvBb - selected.chipEvBb) : null;
  const chipPenalty = !isCorrect && evLoss !== null
    ? Math.min(maxChipPenalty, Math.max(1, Math.ceil(evLoss)))
    : 0;
  const evidence = policy?.kind === 'exact' ? 'Exact solver policy'
    : policy?.kind === 'heuristic' ? 'Modeled fallback' : 'Canonical policy';
  const feedback = isCorrect
    ? `${evidence}: this action carries ${(userFrequency * 100).toFixed(0)}% frequency.`
    : selected
      ? `${evidence}: ${actionName(best)} has the highest supported weight (${((best?.frequency || 0) * 100).toFixed(0)}%).${evLoss !== null ? ` EV loss: ${evLoss.toFixed(1)} BB.` : ' Per-action EV is not available.'}`
      : `${evidence}: the submitted action does not identify one legal policy action. No arbitrary size was graded.`;

  return {
    isCorrect,
    isIndifferent,
    evLoss,
    chipPenalty,
    feedback,
    gtoAction: best?.id || null,
    gtoFrequency: best?.frequency || 0,
    userEv: evMeasured ? selected.chipEvBb : null,
    maxEv: fullyMeasured && best ? best.chipEvBb : null,
  };
}

export default { findMatchingPolicyAction, gradeSolverPolicyAction };
