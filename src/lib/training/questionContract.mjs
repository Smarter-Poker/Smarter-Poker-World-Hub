/**
 * Canonical Training Question Contract
 * ====================================
 * Every scored training decision uses four distinct, legal answer choices.
 * The only two-choice exceptions are literal Yes/No questions and Push/Fold
 * charts. This module is deliberately shared by API and client paths so cached
 * rows, live solver output, daily challenges, and difficulty remapping cannot
 * drift into different rules.
 */

const GENERIC_OPTION_RE = /^(?:option|choice|answer)\s*[a-d0-9]+$/i;
// Detect presentation-layer grading labels, not ordinary strategy prose.
// Words such as “best” and “correct” can legitimately occur inside a full
// psychology answer (“hope for the best”, “believe the read was correct”).
// Treating every occurrence as a grading leak rejected hundreds of otherwise
// valid questions. A leak is an explicit prefix/suffix/checkmark annotation.
const LEAK_MARKER_RE = /(?:^[✓✔]|^(?:correct|best|optimal|recommended|gto)\s*[-:—]|\((?:correct|best|optimal|recommended|gto)\)\s*$|[✓✔]\s*$)/i;
const POSITION_LABELS = {
  BTN: 'Button',
  SB: 'Small Blind',
  BB: 'Big Blind',
  UTG: 'Under The Gun',
  HJ: 'Hijack',
  CO: 'Cutoff',
  MP: 'Middle Position',
};

const cleanSpaces = (value) => String(value ?? '').replace(/\s+/g, ' ').trim();

export function positionLabel(value) {
  const raw = cleanSpaces(value);
  return POSITION_LABELS[raw.toUpperCase()] || raw || 'Opponent';
}

export function normalizeScenarioLanguage(value) {
  let text = cleanSpaces(value);
  if (!text) return text;

  text = text
    .replace(/\byour in\b/gi, "you're in")
    .replace(/\bYou opened from\s+([A-Za-z0-9+ -]+?)\s+with\b/gi, 'You raised first in from $1 with')
    .replace(/\bYou opened from\s+([A-Za-z0-9+ -]+?)\s+and face\b/gi, 'You raised from $1 and now face')
    .replace(/\b([A-Za-z0-9+ -]+?)\s+opens and\s+([A-Za-z0-9+ -]+?)\s+calls\b/gi,
      'Action folds to $1, who raises; $2 calls')
    .replace(/\b(?:The\s+)?(Button|BTN|Small Blind|SB|Big Blind|BB|Cutoff|CO|Hijack|HJ|Under The Gun|UTG|Middle Position|MP)\s+opens\b/gi,
      (_, seat) => `Action folds to the ${positionLabel(seat)}, who raises`)
    .replace(/\bCall or fold\?/gi, 'What is your best action?')
    .replace(/\bCheck or raise\?/gi, 'What is your best action?')
    .replace(/\bSqueeze or fold\?/gi, 'What is your best action?')
    .replace(/\bWhat do you do\?/gi, 'What is your best action?')
    .replace(/\bYour action\?/gi, 'What is your best action?')
    .replace(/\s+([,.;!?])/g, '$1')
    .replace(/([.!?])(?=[A-Z])/g, '$1 ');

  return text;
}

function cleanOptionText(value) {
  return cleanSpaces(value)
    .replace(/^[✓✔✕✗]\s*/u, '')
    .replace(/^correct\s*[-:—]\s*/i, '')
    .replace(/\s*\((?:correct|best|optimal|recommended|gto)\)\s*$/i, '')
    .trim();
}

function normalizeOption(option, index) {
  const object = option && typeof option === 'object' ? option : { text: option };
  const text = cleanOptionText(object.text || object.label || object.action || '');
  const safeOption = { ...object };
  delete safeOption.isCorrect;
  delete safeOption.correct;
  delete safeOption.isBest;
  delete safeOption.isOptimal;
  delete safeOption.recommended;
  return {
    ...safeOption,
    id: cleanSpaces(object.id || `option_${index + 1}`),
    text,
  };
}

function inferCorrectAnswer(question, rawOptions) {
  const explicit = cleanSpaces(question?.correctAnswer || question?.correctAnswerId);
  if (explicit) {
    const byId = rawOptions.find((option, index) => cleanSpaces(
      option && typeof option === 'object' ? option.id || `option_${index + 1}` : `option_${index + 1}`
    ) === explicit);
    if (byId) return explicit;
    const byTextIndex = rawOptions.findIndex((option) => cleanOptionText(
      option && typeof option === 'object' ? option.text || option.label || option.action : option
    ).toLowerCase() === cleanOptionText(explicit).toLowerCase());
    if (byTextIndex >= 0) {
      const matched = rawOptions[byTextIndex];
      return cleanSpaces(matched && typeof matched === 'object' ? matched.id || `option_${byTextIndex + 1}` : `option_${byTextIndex + 1}`);
    }
  }
  const markedIndex = rawOptions.findIndex((option) => option && typeof option === 'object'
    && (option.isCorrect === true || option.correct === true || option.isBest === true || option.isOptimal === true));
  if (markedIndex < 0) return explicit;
  const marked = rawOptions[markedIndex];
  return cleanSpaces(marked.id || `option_${markedIndex + 1}`);
}

function optionSignature(option) {
  return cleanOptionText(option?.text)
    .toLowerCase()
    .replace(/all[- ]?in/g, 'allin')
    .replace(/[^a-z0-9%]+/g, ' ')
    .trim();
}

function optionFamily(option) {
  const text = `${option?.id || ''} ${option?.text || ''}`.toLowerCase();
  if (/\byes\b/.test(text)) return 'yes';
  if (/\bno\b/.test(text)) return 'no';
  if (/fold|\bf\b/.test(text)) return 'fold';
  if (/push|shove|jam|all[- ]?in|allin/.test(text)) return 'allin';
  if (/check|\bx\b/.test(text)) return 'check';
  if (/call|\bc\b/.test(text)) return 'call';
  if (/raise|3-bet|4-bet|squeeze/.test(text)) return 'raise';
  if (/bet|overbet/.test(text)) return 'bet';
  return optionSignature(option);
}

export function getDecisionType(question) {
  const options = (question?.options || []).map(normalizeOption);
  if (options.length !== 2) return 'four-choice';
  const families = new Set(options.map(optionFamily));
  const questionText = cleanSpaces(question?.question || question?.text).toLowerCase();

  if (families.has('yes') && families.has('no')) return 'yes-no';
  if (
    families.has('fold') &&
    families.has('allin') &&
    /push\s*(?:or|\/)\s*fold|fold\s*(?:or|\/)\s*push/.test(questionText)
  ) return 'push-fold';
  return 'four-choice';
}

function existingActionSet(options) {
  return new Set(options.map(optionFamily));
}

function suggestedOptions(question, options) {
  const scenario = question?.scenario || {};
  const street = cleanSpaces(scenario.street || question?.street).toLowerCase();
  const spot = cleanSpaces(scenario.spotType || scenario.nodeType || scenario.action || scenario.context).toLowerCase();
  const prompt = cleanSpaces(question?.question || question?.text).toLowerCase();
  const families = existingActionSet(options);
  const isPreflop = street === 'preflop' || options.length === 0 && !scenario.board;
  const facesBet = families.has('fold') && (families.has('call') || /faces|bets|raises|3-bet|4-bet/.test(`${spot} ${prompt}`));

  if (scenario.isPsychology === true) return [];

  if (isPreflop) {
    if (/4bet|4-bet/.test(`${spot} ${prompt}`)) {
      return [
        { id: 'f', text: 'Fold' },
        { id: 'c', text: 'Call' },
        { id: 'r22', text: '4-Bet To 22 BB' },
        { id: 'allin', text: '4-Bet All-In' },
      ];
    }
    if (/squeeze/.test(`${spot} ${prompt}`)) {
      return [
        { id: 'f', text: 'Fold' },
        { id: 'c', text: 'Call' },
        { id: 'r12', text: 'Squeeze To 12 BB' },
        { id: 'allin', text: 'Squeeze All-In' },
      ];
    }
    if (facesBet || /3bet|3-bet|defen|facing/.test(`${spot} ${prompt}`)) {
      return [
        { id: 'f', text: 'Fold' },
        { id: 'c', text: 'Call' },
        { id: 'r9', text: '3-Bet To 9 BB' },
        { id: 'allin', text: '3-Bet All-In' },
      ];
    }
    return [
      { id: 'f', text: 'Fold' },
      { id: 'limp', text: 'Limp' },
      { id: 'r25', text: 'Raise To 2.5 BB' },
      { id: 'allin', text: 'Raise All-In' },
    ];
  }

  if (facesBet) {
    return [
      { id: 'f', text: 'Fold' },
      { id: 'call', text: 'Call' },
      { id: 'r250', text: 'Raise To 2.5x' },
      { id: 'allin', text: 'Raise All-In' },
    ];
  }

  if (families.has('check') || families.has('bet') || /first to act|checks to you/.test(`${spot} ${prompt}`)) {
    return [
      { id: 'x', text: 'Check' },
      { id: 'b33', text: 'Bet 33% Pot' },
      { id: 'b67', text: 'Bet 67% Pot' },
      { id: 'b125', text: 'Bet 125% Pot' },
    ];
  }

  return [
    { id: 'fold', text: 'Fold' },
    { id: 'call', text: 'Call' },
    { id: 'raise', text: 'Raise' },
    { id: 'allin', text: 'All-In' },
  ];
}

function chooseFour(options, correctAnswer) {
  if (options.length <= 4) return options;
  const ranked = [...options].sort((a, b) => {
    const aCorrect = a.id === correctAnswer ? 1 : 0;
    const bCorrect = b.id === correctAnswer ? 1 : 0;
    if (aCorrect !== bCorrect) return bCorrect - aCorrect;
    return (Number(b.frequency) || 0) - (Number(a.frequency) || 0);
  }).slice(0, 4);
  const selected = new Set(ranked.map((option) => option.id));
  return options.filter((option) => selected.has(option.id));
}

export function validateTrainingQuestion(question) {
  const issues = [];
  if (!question || typeof question !== 'object') return { valid: false, issues: ['Question is missing.'] };

  const prompt = cleanSpaces(question.question || question.text);
  const options = (question.options || []).map(normalizeOption);
  const decisionType = getDecisionType({ ...question, options });
  const expected = decisionType === 'four-choice' ? 4 : 2;

  if (!prompt || prompt.length < 12) issues.push('Question prompt is incomplete.');
  if (options.length !== expected) issues.push(`Expected ${expected} answer choices; received ${options.length}.`);
  if (!question.correctAnswer || !options.some((option) => option.id === question.correctAnswer)) {
    issues.push('Correct answer does not map to a served choice.');
  }

  const signatures = new Set();
  for (const option of options) {
    const signature = optionSignature(option);
    if (!signature || GENERIC_OPTION_RE.test(option.text)) issues.push(`Choice "${option.text || 'blank'}" is not meaningful.`);
    if (LEAK_MARKER_RE.test(option.text)) issues.push(`Choice "${option.text}" leaks grading information.`);
    if (signatures.has(signature)) issues.push(`Duplicate choice: "${option.text}".`);
    signatures.add(signature);
  }

  if (/\b(?:button|btn) opens\b/i.test(prompt)) issues.push('Prompt uses ambiguous “Button opens” wording.');
  if (/\byour in\b/i.test(prompt)) issues.push('Prompt uses “your” instead of “you’re.”');

  return { valid: issues.length === 0, issues, decisionType, expectedOptions: expected };
}

export function enforceTrainingQuestionContract(question) {
  if (!question || typeof question !== 'object') return question;

  const rawOptions = Array.isArray(question.options) ? question.options : [];
  const correctAnswer = inferCorrectAnswer(question, rawOptions);
  const rawPrompt = question.question
    || question.text
    || question.prompt
    || question.situation
    || question.scenario?.question
    || '';

  const normalized = {
    ...question,
    question: normalizeScenarioLanguage(rawPrompt),
    correctAnswer,
    scenario: question.scenario && typeof question.scenario === 'object'
      ? {
          ...question.scenario,
          action: normalizeScenarioLanguage(question.scenario.action || ''),
          context: normalizeScenarioLanguage(question.scenario.context || ''),
          description: normalizeScenarioLanguage(question.scenario.description || ''),
        }
      : question.scenario,
  };

  let options = rawOptions
    .map(normalizeOption)
    .filter((option) => option.text && !GENERIC_OPTION_RE.test(option.text));
  const seen = new Set();
  options = options.filter((option) => {
    const signature = optionSignature(option);
    if (!signature || seen.has(signature)) return false;
    seen.add(signature);
    return true;
  });

  // Facing an all-in is legally Call/Fold, but the product contract reserves
  // two-button layouts for Yes/No and Push/Fold. Express the same decision as
  // an unambiguous Yes/No question instead of inventing illegal raise choices.
  const rawContext = cleanSpaces([
    question.question,
    question.scenario?.action,
    question.scenario?.context,
    question.scenario?.description,
  ].filter(Boolean).join(' ')).toLowerCase();
  const actionFamilies = existingActionSet(options);
  if (
    options.length === 2 &&
    actionFamilies.has('call') &&
    actionFamilies.has('fold') &&
    /(?:shove|jam|all[- ]?in)/.test(rawContext)
  ) {
    options = options.map((option) => ({
      ...option,
      text: optionFamily(option) === 'call' ? 'Yes' : 'No',
    }));
    const villain = positionLabel(question.scenario?.villainPosition || 'opponent');
    const hand = cleanSpaces(question.scenario?.heroHand || question.heroHand);
    const stack = Number(question.scenario?.stackDepth || question.scenario?.heroStack || 0);
    normalized.question = `Action folds to the ${villain}, who raises all-in${stack ? ` at ${stack} BB effective` : ''}. ${hand ? `You hold ${hand}. ` : ''}Should you call?`;
  }

  const decisionType = getDecisionType({ ...normalized, options });
  if (decisionType === 'four-choice') {
    for (const candidate of suggestedOptions(normalized, options)) {
      if (options.length >= 4) break;
      const option = normalizeOption(candidate, options.length);
      const signature = optionSignature(option);
      if (!signature || seen.has(signature) || options.some((item) => item.id === option.id)) continue;
      options.push({ ...option, frequency: 0, contractDistractor: true });
      seen.add(signature);
    }
    options = chooseFour(options, correctAnswer);
  } else {
    options = options.slice(0, 2);
  }

  const allowedIds = new Set(options.map((option) => option.id));
  const filterKeyedData = (value) => {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return value;
    return Object.fromEntries(Object.entries(value).filter(([key]) => allowedIds.has(key)));
  };

  normalized.options = options;
  normalized.correctAnswerText = options.find((option) => option.id === correctAnswer)?.text
    || normalized.correctAnswerText;
  normalized.gtoFrequencies = filterKeyedData(normalized.gtoFrequencies);
  normalized.frequencies = filterKeyedData(normalized.frequencies);
  normalized.actionEVs = filterKeyedData(normalized.actionEVs);
  if (normalized.evData?.actionEVs) {
    normalized.evData = {
      ...normalized.evData,
      actionEVs: filterKeyedData(normalized.evData.actionEVs),
    };
  }

  const audit = validateTrainingQuestion(normalized);
  normalized.questionContract = {
    version: 1,
    decisionType: audit.decisionType,
    valid: audit.valid,
    issues: audit.issues,
  };
  return normalized;
}

export function isTrainingQuestionValid(question) {
  return validateTrainingQuestion(question).valid;
}
