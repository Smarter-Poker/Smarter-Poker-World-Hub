// Solver percentages may be disclosed only after the server grades this decision.
// A zero is meaningful only when its action is present in a measured distribution.
export function measuredActionFrequencies(question, verified) {
  if (!verified || !question?.options?.length) return null;
  const percent = question.gtoFrequencies;
  const usePercent = percent && Object.keys(percent).length > 0;
  const source = usePercent ? percent : question.frequencies;
  if (!source) return null;
  const mix = {};
  let sum = 0;
  for (const option of question.options) {
    const id = String(option.id);
    const value = source[id];
    if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value > (usePercent ? 100 : 1)) return null;
    mix[id] = usePercent ? value : +(value * 100).toFixed(6);
    sum += mix[id];
  }
  return sum > 0 && sum <= 101 ? mix : null;
}

export function isAuthoredActionDrill(question) {
  if (question?.source !== 'CURATED_SCENARIO' || question.scenario?.isConceptQuestion !== true) return false;
  if (typeof question.scenario.isActionDrill === 'boolean') return question.scenario.isActionDrill;
  const options = question.options || [];
  return options.length > 0 && options.every(option =>
    /^(fold|call|check|bet|raise|all[- ]in|[234]-bet|limp|cap|complete|(?:small|medium|large|overbet) (?:bet|raise)|overbet)\b/i.test(option.text || option.label));
}

export function trainingActionPrompt(scenario) {
  const variant = scenario.bettingStructure === 'fixed_limit' ? 'Fixed-Limit ' + String(scenario.variant || '').toUpperCase() : String(scenario.variant || '').toUpperCase();
  const street = String(scenario.street || '').toLowerCase();
  const position = String(scenario.heroPosition || '').toUpperCase();
  const context = [variant, position, street].filter(Boolean).join(' · ');
  return context ? context + '. Which action would you take?' : 'Which action would you take?';
}

export function coachingForServedAnswer(question, verified, mix) {
  const correct = question.options?.find(option => String(option.id) === String(question.correctAnswer));
  const answer = correct?.text || question.correctAnswerText || '';
  if (isAuthoredActionDrill(question)) {
    // Old signed snapshots may contain an explanation written for a different
    // sizing and fabricated numerical EV. Only the served key owns the answer.
    const fromModel = question.scenario.bettingStructure !== 'fixed_limit' && !!question.scenario.brainEvaluation;
    const verdict = fromModel ? `The training model recommends ${answer}.` : `The answer for this drill is ${answer}.`;
    const why = fromModel ? question.structuredExplanation?.why : null;
    return {
      correctAnswerText: answer,
      explanation: [verdict, why].filter(Boolean).join(' '),
      structuredExplanation: null,
    };
  }
  if (verified && mix && correct) {
    return {
      correctAnswerText: answer,
      explanation: question.type === 'CHART' || question.sourceClassification === 'CHART_AUDITED'
        ? `The audited chart gives ${answer} a frequency of ${mix[correct.id]}% in this spot.`
        : `The solver uses ${answer} ${mix[correct.id]}% of the time in this spot.`,
      structuredExplanation: question.structuredExplanation || null,
    };
  }
  return {
    correctAnswerText: answer,
    explanation: question.explanation || '',
    structuredExplanation: question.structuredExplanation || null,
  };
}
