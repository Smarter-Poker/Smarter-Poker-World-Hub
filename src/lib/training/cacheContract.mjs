import { filterRowsToDeclaredStreet } from './declaredStreet.js';
import { isVerifiedSolverQuestion } from './solverDecisionEvidence.js';

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

function isSanitizedLegacyArchive(question) {
  return normalize(question?.source) === 'LEGACY_STRATEGY_ARCHIVE'
    && normalize(question?.dataQuality) === 'LEGACY_UNVERIFIED'
    && question?.solverProvenance?.verified === false
    && String(question?.solverProvenance?.source || '').startsWith('solved_spots_gold_legacy')
    && question?.questionContract?.version === 1
    && question?.questionContract?.valid === true
    && String(question?.evidenceDisclosure || '') === 'Legacy strategy archive; writer provenance is unavailable.';
}

function pioContractMatches(row, gameConfig, { allowSanitizedLegacyArchive = false } = {}) {
  const question = row?.question_data || {};
  const scenario = question.scenario || {};
  const engineType = normalize(row?.engine_type);
  const family = String(scenario.gameType || question.gameType || '').trim();
  const stack = Number(scenario.stackDepth ?? question.stackDepth);
  const street = normalize(scenario.street || question.street);
  const source = normalize(question.source);

  // The two declared preflop games use the separately audited local range
  // engine and do not have a solved_spots_gold family hash.
  if (normalize(gameConfig?.pioStreet) === 'PREFLOP') {
    return street === 'PREFLOP'
      && source === 'LOCAL_SOLVER_RANGES'
      && (!Number.isFinite(stack) || stack === Number(gameConfig?.pioStackDepth));
  }

  // Old warehouse-derived cache rows bypass the live matrix sanitizer. The
  // Phase 4 deep audit found entire legacy ICM cells with zero credible hands,
  // so matching family/stack/street is not sufficient proof. An unsealed
  // warehouse cache row must miss cache and pass through the deterministic
  // reader, which re-reads the matrix, validates the chosen hand and EV, and
  // adds an explicit legacy disclosure. Fully provenance-sealed v2 cache rows
  // remain eligible.
  const sourceName = normalize(question.source);
  const warehouseSource = engineType === 'PIO'
    && !['POSTFLOP_ENGINE', 'CURATED_SCENARIO'].includes(sourceName);
  if (warehouseSource && !isVerifiedSolverQuestion(question)) {
    // The serving endpoints always leave this false so a cached legacy row
    // can never bypass a fresh warehouse re-read and matrix sanitizer. The
    // answer endpoint may opt in only for the exact, server-canonicalized
    // archive envelope it wrote immediately before serving that question.
    if (!(allowSanitizedLegacyArchive && isSanitizedLegacyArchive(question))) return false;
  }

  return engineType === 'PIO'
    && family === String(gameConfig?.pioGameType || '').trim()
    && Number.isFinite(stack)
    && stack === Number(gameConfig?.pioStackDepth);
}

/**
 * Reject cache rows that belong to a different engine family before they can
 * bypass the configured solver. This is intentionally fail-closed for chart
 * and psychology games, where a mismatched row changes the lesson itself.
 */
export function filterCachedRowsForGame(rows, gameConfig, options = {}) {
  const streetCompatible = filterRowsToDeclaredStreet(rows, gameConfig);
  const source = normalize(gameConfig?.sourceOfTruth);

  if (source === 'ICMIZER') return streetCompatible.filter(isChartQuestion);
  if (source === 'SCENARIO') return streetCompatible.filter(isScenarioQuestion);

  return streetCompatible.filter((row) => pioContractMatches(row, gameConfig, options));
}
