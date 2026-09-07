import { validateSolverPolicyAnswer } from './solverPolicyContract.js';

/**
 * Public provenance vocabulary for every Training question.
 *
 * `engine_type` is a historical routing hint (PIO / CHART / SCENARIO). It is
 * not evidence and must never be rendered as an answer-quality claim. These
 * eight values are the only classifications allowed to cross the API/UI or be
 * persisted in training_question_cache.source_classification.
 */
export const TRAINING_SOURCE_CLASSIFICATION = Object.freeze({
  SOLVER_EXACT: 'SOLVER_EXACT',
  SOLVER_AGGREGATED: 'SOLVER_AGGREGATED',
  SOLVER_DERIVED_RESPONSE: 'SOLVER_DERIVED_RESPONSE',
  CHART_AUDITED: 'CHART_AUDITED',
  MODEL_DISTILLED: 'MODEL_DISTILLED',
  CURATED: 'CURATED',
  HEURISTIC: 'HEURISTIC',
  LEGACY_UNVERIFIED: 'LEGACY_UNVERIFIED',
});

export const TRAINING_SOURCE_CLASSIFICATIONS = Object.freeze(
  Object.values(TRAINING_SOURCE_CLASSIFICATION),
);

const CLASSIFICATION_SET = new Set(TRAINING_SOURCE_CLASSIFICATIONS);
const SOLVER_EVIDENCE_CLASSES = new Set([
  TRAINING_SOURCE_CLASSIFICATION.SOLVER_EXACT,
  TRAINING_SOURCE_CLASSIFICATION.SOLVER_AGGREGATED,
  TRAINING_SOURCE_CLASSIFICATION.SOLVER_DERIVED_RESPONSE,
  TRAINING_SOURCE_CLASSIFICATION.CHART_AUDITED,
]);

const POLICY_SEAL_TO_CLASSIFICATION = Object.freeze({
  SOLVER_EXACT: TRAINING_SOURCE_CLASSIFICATION.SOLVER_EXACT,
  SOLVER_AGGREGATED: TRAINING_SOURCE_CLASSIFICATION.SOLVER_AGGREGATED,
  SOLVER_DERIVED_RESPONSE: TRAINING_SOURCE_CLASSIFICATION.SOLVER_DERIVED_RESPONSE,
  CHART_AUDITED: TRAINING_SOURCE_CLASSIFICATION.CHART_AUDITED,
  CURATED: TRAINING_SOURCE_CLASSIFICATION.CURATED,
  HEURISTIC: TRAINING_SOURCE_CLASSIFICATION.HEURISTIC,
  LEGACY_UNVERIFIED: TRAINING_SOURCE_CLASSIFICATION.LEGACY_UNVERIFIED,
});

const PRESENTATION = Object.freeze({
  SOLVER_EXACT: Object.freeze({
    label: 'EXACT SOLVER',
    title: 'Exact solver node with a complete decision key, exact legal sizes, and sealed source provenance.',
    fg: '#4ade80',
    bg: 'rgba(74,222,128,0.12)',
    border: 'rgba(74,222,128,0.38)',
  }),
  SOLVER_AGGREGATED: Object.freeze({
    label: 'SOLVER AGGREGATE',
    title: 'An aggregate of solver output. It is solver-backed, but it is not one exact decision node.',
    fg: '#6ee7b7',
    bg: 'rgba(110,231,183,0.12)',
    border: 'rgba(110,231,183,0.38)',
  }),
  SOLVER_DERIVED_RESPONSE: Object.freeze({
    label: 'SOLVER DERIVED',
    title: 'Derived from solver output with disclosed approximations. Do not treat it as an exact node.',
    fg: '#67e8f9',
    bg: 'rgba(103,232,249,0.12)',
    border: 'rgba(103,232,249,0.38)',
  }),
  CHART_AUDITED: Object.freeze({
    label: 'AUDITED CHART',
    title: 'Audited chart or range policy. This is not a per-node PioSOLVER result.',
    fg: '#a7f3d0',
    bg: 'rgba(167,243,208,0.12)',
    border: 'rgba(167,243,208,0.38)',
  }),
  MODEL_DISTILLED: Object.freeze({
    label: 'MODEL DISTILLED',
    title: 'A policy distilled from a model and explicitly labeled as such; it is not exact solver output.',
    fg: '#c4b5fd',
    bg: 'rgba(196,181,253,0.12)',
    border: 'rgba(196,181,253,0.38)',
  }),
  CURATED: Object.freeze({
    label: 'CURATED',
    title: 'An authored and reviewed training policy. It is not solver output.',
    fg: '#fcd34d',
    bg: 'rgba(252,211,77,0.12)',
    border: 'rgba(252,211,77,0.38)',
  }),
  HEURISTIC: Object.freeze({
    label: 'HEURISTIC',
    title: 'A deterministic heuristic policy. Treat the recommendation as directional, not solver-exact.',
    fg: '#fb923c',
    bg: 'rgba(251,146,60,0.12)',
    border: 'rgba(251,146,60,0.38)',
  }),
  LEGACY_UNVERIFIED: Object.freeze({
    label: 'LEGACY UNVERIFIED',
    title: 'Legacy strategy data whose original solver provenance cannot be verified.',
    fg: '#fca5a5',
    bg: 'rgba(252,165,165,0.12)',
    border: 'rgba(252,165,165,0.38)',
  }),
});

const upper = (value) => String(value ?? '').trim().toUpperCase();
const finite = (value) => {
  if (value === null || value === undefined || value === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

function hasPositiveDistribution(question) {
  const direct = question?.gtoFrequencies;
  if (direct && typeof direct === 'object' && !Array.isArray(direct)) {
    if (Object.values(direct).some((value) => (finite(value) ?? 0) > 0)) return true;
  }
  return (Array.isArray(question?.options) ? question.options : [])
    .some((option) => (finite(option?.frequency) ?? 0) > 0);
}

function explicitModelDistillation(question) {
  const source = upper(question?.source);
  const quality = upper(question?.dataQuality);
  const declared = upper(question?.sourceClassification);
  return source === 'MODEL_DISTILLED'
    || source === 'DISTILLED_MODEL'
    || quality === 'MODEL_DISTILLED'
    || declared === 'MODEL_DISTILLED';
}

/**
 * A persisted or browser-supplied label is never enough to create solver
 * evidence. Solver labels come only from a structurally valid canonical policy
 * envelope. This is the central fail-closed boundary for both API and UI.
 */
export function classificationFromCanonicalPolicy(policy) {
  const validation = validateSolverPolicyAnswer(policy);
  if (!validation.valid) return TRAINING_SOURCE_CLASSIFICATION.LEGACY_UNVERIFIED;
  return POLICY_SEAL_TO_CLASSIFICATION[policy.qualitySeal]
    || TRAINING_SOURCE_CLASSIFICATION.LEGACY_UNVERIFIED;
}

export function sourceClassificationForQuestion(question) {
  if (!question || typeof question !== 'object') {
    return TRAINING_SOURCE_CLASSIFICATION.LEGACY_UNVERIFIED;
  }

  const policyValidation = validateSolverPolicyAnswer(question.solverPolicy);
  if (policyValidation.valid) {
    const policyClass = POLICY_SEAL_TO_CLASSIFICATION[question.solverPolicy.qualitySeal]
      || TRAINING_SOURCE_CLASSIFICATION.LEGACY_UNVERIFIED;
    // MODEL_DISTILLED intentionally uses the heuristic policy kind today, but
    // retains a distinct public lineage label when its generator says so.
    if (
      policyClass === TRAINING_SOURCE_CLASSIFICATION.HEURISTIC
      && explicitModelDistillation(question)
    ) return TRAINING_SOURCE_CLASSIFICATION.MODEL_DISTILLED;
    return policyClass;
  }

  const source = upper(question.source);
  const type = upper(question.type);
  const quality = upper(question.dataQuality);
  const declared = upper(question.sourceClassification);

  if (explicitModelDistillation(question)) {
    return TRAINING_SOURCE_CLASSIFICATION.MODEL_DISTILLED;
  }
  if (quality === 'SIMULATED' || source === 'POSTFLOP_ENGINE' || source === 'HEURISTIC') {
    return TRAINING_SOURCE_CLASSIFICATION.HEURISTIC;
  }
  // A CHART label plus percentages is not an audit receipt. CHART_AUDITED is
  // reachable only through a structurally valid canonical chart policy above.
  if (
    /CURATED|SCENARIO|PSYCHOLOGY/.test(source)
    || type === 'SCENARIO'
    || declared === TRAINING_SOURCE_CLASSIFICATION.CURATED
  ) return TRAINING_SOURCE_CLASSIFICATION.CURATED;
  if (declared === TRAINING_SOURCE_CLASSIFICATION.HEURISTIC) {
    return TRAINING_SOURCE_CLASSIFICATION.HEURISTIC;
  }

  // Exact, aggregate, derived, and audited-chart labels supplied without the
  // corresponding canonical policy are deliberately ignored.
  return TRAINING_SOURCE_CLASSIFICATION.LEGACY_UNVERIFIED;
}

export function isSolverEvidenceClassification(value) {
  return SOLVER_EVIDENCE_CLASSES.has(upper(value));
}

export function isAuditableTrainingDistribution(question) {
  return hasPositiveDistribution(question)
    && isSolverEvidenceClassification(sourceClassificationForQuestion(question));
}

export function trainingSourcePresentation(valueOrQuestion) {
  const requested = typeof valueOrQuestion === 'string'
    ? upper(valueOrQuestion)
    : sourceClassificationForQuestion(valueOrQuestion);
  const classification = CLASSIFICATION_SET.has(requested)
    ? requested
    : TRAINING_SOURCE_CLASSIFICATION.LEGACY_UNVERIFIED;
  return { classification, ...PRESENTATION[classification] };
}

export function withTrainingSourceClassification(question) {
  if (!question || typeof question !== 'object') return question;
  const sourceClassification = sourceClassificationForQuestion(question);
  return {
    ...question,
    sourceClassification,
    // Keep the historical field truthful during the transition. Older UI
    // builds read dataQuality; giving it the same eight-value taxonomy avoids
    // a chart or curated row lingering as SOLVER_EXACT in stale clients.
    dataQuality: sourceClassification,
  };
}

/**
 * Make all player-facing answer hints a projection of the canonical policy.
 * These fields remain presentation only, but keeping them synchronized avoids
 * contradictory feedback while the grader continues to ignore them.
 */
export function alignQuestionToCanonicalPolicy(question) {
  if (!question || typeof question !== 'object') return question;
  const validation = validateSolverPolicyAnswer(question.solverPolicy);
  if (!validation.valid || question.solverPolicy?.kind === 'unavailable') {
    throw new Error(`Cannot align an invalid canonical policy: ${validation.errors.join(',')}`);
  }
  const options = Array.isArray(question.options) ? question.options : [];
  const optionByPolicyId = new Map(options.map((option) => [
    upper(option?.id),
    option,
  ]));
  const actions = question.solverPolicy.actions || [];
  if (
    options.length < 2
    || optionByPolicyId.size !== options.length
    || actions.length !== options.length
    || actions.some((action) => !optionByPolicyId.has(upper(action.id)))
  ) {
    throw new Error('Question options do not match the canonical policy action set');
  }
  const best = actions.reduce((winner, action) => (
    !winner || action.frequency > winner.frequency ? action : winner
  ), null);
  const bestOption = optionByPolicyId.get(upper(best?.id));
  const gtoFrequencies = Object.fromEntries(actions.map((action) => {
    const option = optionByPolicyId.get(upper(action.id));
    return [String(option.id), +(action.frequency * 100).toFixed(6)];
  }));
  const normalizedOptions = options.map((option) => {
    const action = actions.find((candidate) => upper(candidate.id) === upper(option.id));
    return { ...option, frequency: +(action.frequency * 100).toFixed(6) };
  });
  return withTrainingSourceClassification({
    ...question,
    options: normalizedOptions,
    frequencies: Object.fromEntries(
      Object.entries(gtoFrequencies).map(([id, frequency]) => [id, frequency / 100]),
    ),
    gtoFrequencies,
    correctAnswer: String(bestOption.id),
    correctAnswerText: bestOption.text || bestOption.label || String(bestOption.id),
  });
}

function policyDistribution(policy) {
  if (!policy || typeof policy !== 'object') return {};
  const actionIds = new Set((policy.actions || []).filter((action) => action?.legal !== false)
    .map((action) => upper(action?.id)));
  const normalized = {};
  for (const [id, value] of Object.entries(policy.distribution || {})) {
    const key = upper(id);
    const frequency = finite(value);
    if (!key || !actionIds.has(key) || frequency === null || frequency < 0) continue;
    normalized[key] = frequency * 100;
  }
  return normalized;
}

/**
 * Grade only from the canonical policy artifact persisted by the server.
 * Cached question prose and `correctAnswer` are intentionally not parameters,
 * so changing either can never change the recorded result.
 */
export function gradeCanonicalPolicyDecision(policy, selectedAnswer) {
  const validation = validateSolverPolicyAnswer(policy);
  if (!validation.valid) {
    return { valid: false, errors: validation.errors, reason: 'invalid_canonical_policy' };
  }

  const distribution = policyDistribution(policy);
  const entries = Object.entries(distribution);
  if (entries.length === 0 || !entries.some(([, frequency]) => frequency > 0)) {
    return { valid: false, errors: ['distribution'], reason: 'canonical_policy_has_no_distribution' };
  }

  const selected = upper(selectedAnswer);
  const selectedFrequency = distribution[selected];
  if (!selected || !Number.isFinite(selectedFrequency)) {
    return { valid: false, errors: ['selectedAction'], reason: 'selected_action_not_in_policy' };
  }

  const optimal = entries.reduce((best, [id, frequency]) => (
    !best || frequency > best.frequency ? { id, frequency } : best
  ), null);
  let classification;
  if (selectedFrequency >= optimal.frequency - 1e-9) classification = 'best';
  else if (selectedFrequency >= 20) classification = 'best';
  else if (selectedFrequency >= 5) classification = 'correct';
  else if (selectedFrequency >= 1) classification = 'inaccuracy';
  else {
    const nonZero = entries.filter(([, frequency]) => frequency > 0).length;
    classification = optimal.frequency >= 80 || nonZero <= 1 ? 'blunder' : 'wrong';
  }

  const byAction = policy?.chipEv?.measuredByAction === true
    ? policy.chipEv.byAction || {}
    : {};
  const selectedEvEntry = Object.entries(byAction)
    .find(([id]) => upper(id) === selected);
  const finiteEvs = Object.values(byAction).map(finite).filter((value) => value !== null);
  const selectedEv = finite(selectedEvEntry?.[1]);
  const measuredEVLoss = selectedEv !== null && finiteEvs.length === entries.length
    ? Math.max(0, Math.max(...finiteEvs) - selectedEv)
    : null;
  const sourceClassification = POLICY_SEAL_TO_CLASSIFICATION[policy.qualitySeal]
    || TRAINING_SOURCE_CLASSIFICATION.LEGACY_UNVERIFIED;

  return {
    valid: true,
    sourceClassification,
    solverVerified: isSolverEvidenceClassification(sourceClassification),
    solverSource: policy?.sourceArtifact?.system || null,
    classification,
    isCorrect: classification === 'best' || classification === 'correct',
    selectedFrequency: +selectedFrequency.toFixed(2),
    optimalFrequency: +optimal.frequency.toFixed(2),
    optimalAction: optimal.id.toLowerCase(),
    evLoss: measuredEVLoss === null ? null : +measuredEVLoss.toFixed(3),
    evLossMeasured: measuredEVLoss !== null,
    policyVersion: policy.policyVersion,
    sourceChecksum: policy?.sourceArtifact?.sourceArtifactChecksum || null,
  };
}

export default {
  TRAINING_SOURCE_CLASSIFICATION,
  TRAINING_SOURCE_CLASSIFICATIONS,
  alignQuestionToCanonicalPolicy,
  classificationFromCanonicalPolicy,
  gradeCanonicalPolicyDecision,
  isAuditableTrainingDistribution,
  isSolverEvidenceClassification,
  sourceClassificationForQuestion,
  trainingSourcePresentation,
  withTrainingSourceClassification,
};
