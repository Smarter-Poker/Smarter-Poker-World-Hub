import { filterRowsToDeclaredStreet } from './declaredStreet.js';

const normalize = (value) => String(value || '').trim().toUpperCase();

function optionFamilies(question) {
  return new Set((question?.options || []).map((option) => {
    const text = normalize(typeof option === 'string' ? option : `${option?.id || ''} ${option?.text || ''}`);
    if (/PUSH|SHOVE|JAM|ALL[- ]?IN/.test(text)) return 'PUSH';
    if (/FOLD/.test(text)) return 'FOLD';
    if (/YES/.test(text)) return 'YES';
    if (/NO/.test(text)) return 'NO';
    return text;
  }));
}

function isChartQuestion(row) {
  const question = row?.question_data || {};
  const engineType = normalize(row?.engine_type);
  const questionType = normalize(question.type);
  const street = normalize(question?.scenario?.street || question.street);
  const board = question.boardCards || question?.scenario?.boardCards || [];
  const families = optionFamilies(question);
  const legalDecision = (families.has('PUSH') && families.has('FOLD'))
    || (families.has('YES') && families.has('NO'));

  return (engineType === 'CHART' || questionType === 'CHART')
    && (!street || street === 'PREFLOP')
    && (!Array.isArray(board) || board.length === 0)
    && legalDecision;
}

function isScenarioQuestion(row) {
  const question = row?.question_data || {};
  return normalize(row?.engine_type) === 'SCENARIO'
    || question?.scenario?.isPsychology === true
    || normalize(question.source) === 'PSYCHOLOGY_BANK';
}

/**
 * Reject cache rows that belong to a different engine family before they can
 * bypass the configured solver. This is intentionally fail-closed for chart
 * and psychology games, where a mismatched row changes the lesson itself.
 */
export function filterCachedRowsForGame(rows, gameConfig) {
  const streetCompatible = filterRowsToDeclaredStreet(rows, gameConfig);
  const source = normalize(gameConfig?.sourceOfTruth);

  if (source === 'ICMIZER') return streetCompatible.filter(isChartQuestion);
  if (source === 'SCENARIO') return streetCompatible.filter(isScenarioQuestion);

  return streetCompatible.filter((row) => {
    const engineType = normalize(row?.engine_type);
    return engineType !== 'CHART' && engineType !== 'SCENARIO';
  });
}
