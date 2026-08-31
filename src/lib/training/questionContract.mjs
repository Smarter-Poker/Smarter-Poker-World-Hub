/**
 * Canonical Training Question Contract
 * ====================================
 * Every scored training decision uses four distinct, legal answer choices.
 * The only two-choice exceptions are literal Yes/No questions and Push/Fold
 * charts. This module is deliberately shared by API and client paths so cached
 * rows, live solver output, daily challenges, and difficulty remapping cannot
 * drift into different rules.
 */

import { heroActsFirstPostflop } from '../../engines/positionOrder.js';

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
  const id = cleanSpaces(option?.id).toLowerCase();
  const label = cleanSpaces(option?.text).toLowerCase();
  if (/\byes\b/.test(label) || id === 'yes') return 'yes';
  if (/\bno\b/.test(label) || id === 'no') return 'no';
  if (/\bfold\b/.test(label) || label === 'f' || id === 'fold') return 'fold';
  if (/\b(?:push|shove|jam|all[- ]?in|allin)\b/.test(label) || /^(?:push|shove|jam|allin)$/.test(id)) return 'allin';
  if (/\bcheck\b/.test(label) || label === 'x' || id === 'check') return 'check';
  if (/\bcall\b/.test(label) || label === 'c' || id === 'call') return 'call';
  if (/\b(?:raise|squeeze)\b|\b[2-9][- ]?bet\b/.test(label) || /^(?:raise|squeeze|[2-9]bet)$/.test(id)) return 'raise';
  if (/\b(?:bet|overbet)\b/.test(label) || /^(?:bet|overbet)$/.test(id)) return 'bet';
  return optionSignature(option);
}

function questionContext(question) {
  return cleanSpaces([
    question?.question,
    question?.text,
    question?.scenario?.action,
    question?.scenario?.context,
    question?.scenario?.description,
  ].filter(Boolean).join(' ')).toLowerCase();
}

function questionStreet(question) {
  return cleanSpaces(question?.scenario?.street || question?.street).toLowerCase();
}

function normalizePostflopActionState(question) {
  const scenario = question?.scenario;
  if (
    !scenario
    || typeof scenario !== 'object'
    || scenario.isPsychology === true
    || scenario.isConceptQuestion === true
  ) return scenario;

  const street = questionStreet(question);
  if (!street || street === 'preflop') return scenario;

  const heroPosition = cleanSpaces(scenario.heroPosition);
  const villainPosition = cleanSpaces(scenario.villainPosition);
  const heroActsFirst = heroActsFirstPostflop(heroPosition, villainPosition);
  const villainChecks = /\b(?:villain|opponent) checks(?: to you)?\b|\bchecks to you\b/i;

  const normalizeField = (value) => {
    const text = normalizeScenarioLanguage(value || '');
    if (!villainChecks.test(text)) return text;
    if (heroActsFirst) {
      return text.replace(villainChecks, 'You are first to act');
    }
    return text.replace(villainChecks, `${positionLabel(villainPosition)} checks to you`);
  };

  return {
    ...scenario,
    action: normalizeField(scenario.action),
    context: normalizeField(scenario.context),
    description: normalizeField(scenario.description),
  };
}

function decisionNode(question) {
  if (
    question?.scenario?.isPsychology === true
    || question?.scenario?.isConceptQuestion === true
  ) return null;
  const street = questionStreet(question);
  if (street === 'preflop') return null;

  const declared = cleanSpaces(
    question?.scenario?.nodeType || question?.scenario?.spotType
  ).toLowerCase().replace(/[\s-]+/g, '_');
  if (declared === 'hero_faces_bet' || declared === 'facing_bet') return 'faces-bet';
  if (
    declared === 'hero_bets_or_checks'
    || declared === 'checked_to_hero'
    || declared === 'first_to_act'
  ) return 'check-or-bet';

  const context = questionContext(question);
  if (/\bchecks? to you\b|\byou are first to act\b/.test(context)) return 'check-or-bet';
  if (
    /\b(?:opponent|villain|button|btn|small blind|sb|big blind|bb|cutoff|co|hijack|hj|under the gun|utg|middle position|mp)\s+(?:bets?|raises?|jams?|shoves?)\b/.test(context)
    || /\byou (?:face|are facing)\b.{0,48}\b(?:bet|raise|jam|shove|all[- ]?in)\b/.test(context)
  ) return 'faces-bet';
  return null;
}

function preflopResponseBetDepth(question) {
  if (questionStreet(question) !== 'preflop') return null;
  const context = questionContext(question);
  const aggressor = '(?:opponent|villain|button|btn|small blind|sb|big blind|bb|cutoff|co|hijack|hj|under the gun|utg|middle position|mp)';

  if (
    new RegExp(`\\b${aggressor}\\s+4[- ]?bets?\\b`).test(context)
    || /\b(?:face|facing|faces)\b.{0,48}\b4[- ]?bet\b/.test(context)
  ) return 5;
  if (
    new RegExp(`\\b${aggressor}\\s+3[- ]?bets?\\b`).test(context)
    || /\b(?:face|facing|faces)\b.{0,48}\b3[- ]?bet\b/.test(context)
  ) return 4;
  if (
    new RegExp(`\\b${aggressor}\\s+(?:opens?|raises?)\\b`).test(context)
    || /\baction folds to\b.{0,64}\bwho raises\b/.test(context)
    || /\b(?:face|facing|faces)\b.{0,48}\b(?:an?\s+)?(?:open|raise)\b/.test(context)
  ) return 3;
  return null;
}

function responseRaiseText(depth, allIn = false) {
  if (allIn) return `${depth}-Bet All-In`;
  const size = depth === 3 ? 9 : depth === 4 ? 22 : 45;
  return `${depth}-Bet To ${size} BB`;
}

function normalizePreflopResponseOptions(question, options) {
  if (question?.scenario?.isConceptQuestion === true) return options;
  const depth = preflopResponseBetDepth(question);
  if (!depth) return options;
  return options.map((option) => {
    const family = optionFamily(option);
    if (family !== 'raise' && family !== 'allin') return option;
    return {
      ...option,
      text: responseRaiseText(depth, family === 'allin'),
    };
  });
}

function optionLegalForNode(option, node) {
  const family = optionFamily(option);
  if (node === 'check-or-bet') {
    return family === 'check' || family === 'bet' || family === 'allin';
  }
  if (node === 'faces-bet') {
    return family === 'fold' || family === 'call' || family === 'raise' || family === 'allin';
  }
  return true;
}

function sizingVocabulary(option) {
  const id = cleanSpaces(option?.id).toLowerCase();
  const text = cleanSpaces(option?.text).toLowerCase();
  if (/^grouped_(?:small|medium|large|overbet)$/.test(id)) return 'band';
  if (/^(?:small|medium|large)\s+(?:bet|raise)\b/.test(text)) return 'band';
  if (/^(?:bet|raise(?:\s+to)?|overbet)\s+\d+(?:\.\d+)?%\s*(?:pot)?$/.test(text)) return 'exact';
  if (/^overbet\b/.test(text)) return 'band';
  return null;
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

  if (scenario.isPsychology === true || scenario.isConceptQuestion === true) return [];

  // The middle difficulty tier teaches sizing bands. If a sparse grouped
  // node has only three choices, fill it with another non-overlapping band.
  // Falling through to the exact-size candidates below produced ambiguous
  // live choices such as “Bet 33% Pot” beside “Small Bet”. Both describe the
  // same action, so the answer list itself hinted at (and obscured) grading.
  const usesSizingBands = options.some((option) => sizingVocabulary(option) === 'band');
  if (usesSizingBands) {
    const usesRaise = options.some((option) => /\braise\b/i.test(option?.text || ''));
    const verb = usesRaise ? 'Raise' : 'Bet';
    return [
      { id: 'grouped_small', text: `Small ${verb} · Up To 40% Pot` },
      { id: 'grouped_medium', text: `Medium ${verb} · 41–80% Pot` },
      { id: 'grouped_large', text: `Large ${verb} · 81–100% Pot` },
      { id: 'grouped_overbet', text: usesRaise ? 'Over-Pot Raise · More Than 100% Pot' : 'Overbet · More Than 100% Pot' },
    ];
  }

  if (isPreflop) {
    const responseDepth = preflopResponseBetDepth(question);
    if (responseDepth === 5) {
      return [
        { id: 'f', text: 'Fold' },
        { id: 'c', text: 'Call' },
        { id: 'r45', text: responseRaiseText(5) },
        { id: 'allin', text: responseRaiseText(5, true) },
      ];
    }
    if (responseDepth === 4) {
      return [
        { id: 'f', text: 'Fold' },
        { id: 'c', text: 'Call' },
        { id: 'r22', text: responseRaiseText(4) },
        { id: 'allin', text: responseRaiseText(4, true) },
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
    if (facesBet || responseDepth === 3 || /defen|facing/.test(`${spot} ${prompt}`)) {
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
  const scenario = question?.scenario || {};
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

  const hasSizingBand = options.some((option) => sizingVocabulary(option) === 'band');
  const hasExactSizing = options.some((option) => sizingVocabulary(option) === 'exact');
  if (hasSizingBand && hasExactSizing) {
    issues.push('Answer choices mix an exact size with an overlapping sizing band.');
  }

  const node = decisionNode(question);
  const illegalOptions = node
    ? options.filter((option) => !optionLegalForNode(option, node))
    : [];
  if (illegalOptions.length > 0) {
    issues.push(
      `${node === 'faces-bet' ? 'Facing a bet' : 'A check-or-bet node'} includes illegal choices: ${illegalOptions.map((option) => `"${option.text}"`).join(', ')}.`
    );
  }

  const correctOption = options.find((option) => option.id === question.correctAnswer);
  if (correctOption?.contractDistractor === true) {
    issues.push('The correct answer was synthesized as a contract distractor.');
  }

  // Curated concept questions may discuss an earlier 3-bet/4-bet in prose
  // while asking about the underlying strategic principle. Their answer
  // choices are concepts, not executable betting actions, so applying the
  // action-depth label check would reject valid curriculum copy.
  const responseDepth = scenario.isConceptQuestion === true
    ? null
    : preflopResponseBetDepth(question);
  if (responseDepth) {
    const staleDepth = responseDepth - 1;
    if (options.some((option) => new RegExp(`\\b${staleDepth}[- ]?Bet\\b`, 'i').test(option.text))) {
      issues.push(`A response to a ${staleDepth}-bet must be labeled as a ${responseDepth}-bet.`);
    }
  }

  if (/\b(?:button|btn) opens\b/i.test(prompt)) issues.push('Prompt uses ambiguous “Button opens” wording.');
  if (/\byour in\b/i.test(prompt)) issues.push('Prompt uses “your” instead of “you’re.”');

  const street = questionStreet(question);
  const heroPosition = cleanSpaces(scenario.heroPosition);
  const villainPosition = cleanSpaces(scenario.villainPosition);
  if (heroPosition && villainPosition && heroPosition.toUpperCase() === villainPosition.toUpperCase()) {
    issues.push('Hero and opponent cannot occupy the same position.');
  }
  if (
    street && street !== 'preflop'
    && heroActsFirstPostflop(heroPosition, villainPosition)
    && /\b(?:villain|opponent) checks\b|\bchecks to you\b/i.test(questionContext(question))
  ) {
    issues.push('Postflop action says the opponent checks before a hero who must act first.');
  }

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

  let normalized = {
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

  normalized = {
    ...normalized,
    scenario: normalizePostflopActionState(normalized),
  };

  let options = rawOptions
    .map(normalizeOption)
    .filter((option) => option.text && !GENERIC_OPTION_RE.test(option.text));

  options = normalizePreflopResponseOptions(normalized, options);

  // Remove impossible distractors when the scenario declares a postflop
  // decision node. Never hide an impossible marked answer: leaving it in
  // place makes validation fail closed so the API rejects the corrupted row.
  const node = decisionNode(normalized);
  if (node) {
    options = options.filter((option) => (
      option.id === correctAnswer || optionLegalForNode(option, node)
    ));
  }

  // Some runtime sources combine exact solver sizes with already-grouped
  // sizing bands. “Bet 33%” and “Small Bet” cannot coexist because both
  // describe the same action. Preserve the vocabulary containing the answer
  // key; for a passive answer, retain whichever vocabulary is represented by
  // more source choices. Four-choice padding then stays within that vocabulary.
  const exactSizingOptions = options.filter((option) => sizingVocabulary(option) === 'exact');
  const bandSizingOptions = options.filter((option) => sizingVocabulary(option) === 'band');
  if (exactSizingOptions.length > 0 && bandSizingOptions.length > 0) {
    const correctKind = sizingVocabulary(options.find((option) => option.id === correctAnswer));
    const preferredKind = correctKind
      || (bandSizingOptions.length > exactSizingOptions.length ? 'band' : 'exact');
    options = options.filter((option) => {
      const kind = sizingVocabulary(option);
      return !kind || kind === preferredKind;
    });
  }
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
