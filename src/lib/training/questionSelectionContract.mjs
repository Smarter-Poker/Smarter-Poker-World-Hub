const GAME_MODES = new Set(['full', 'spot', 'street']);
const HAND_SELECTIONS = new Set(['all', 'no-trivial', 'close']);

export function normalizeTrainingGameMode(value) {
  const candidate = String(value || '').trim().toLowerCase();
  return GAME_MODES.has(candidate) ? candidate : 'full';
}

export function normalizeTrainingHandSelection(value) {
  const candidate = String(value || '').trim().toLowerCase();
  return HAND_SELECTIONS.has(candidate) ? candidate : 'all';
}

function sortedFrequencies(question) {
  const frequencies = question?.gtoFrequencies;
  if (!frequencies || typeof frequencies !== 'object' || Array.isArray(frequencies)) return [];
  return Object.values(frequencies)
    .map((value) => Number(value))
    .filter(Number.isFinite)
    .sort((left, right) => right - left);
}

/**
 * Apply the immutable drill selection before a question is placed into an
 * attempt manifest. A browser may display a signed manifest, but it may not
 * discard rows and silently redefine how many hands constitute completion.
 */
export function trainingQuestionMatchesSelection(question, {
  gameMode = 'full',
  targetStreet = null,
  handSelection = 'all',
} = {}) {
  const normalizedGameMode = normalizeTrainingGameMode(gameMode);
  const normalizedHandSelection = normalizeTrainingHandSelection(handSelection);
  if (normalizedGameMode === 'street') {
    const expectedStreet = String(targetStreet || '').trim().toLowerCase();
    if (!expectedStreet) return false;
    if (String(question?.scenario?.street || '').trim().toLowerCase() !== expectedStreet) return false;
  }

  if (normalizedHandSelection === 'all') return true;
  const frequencies = sortedFrequencies(question);
  if (normalizedHandSelection === 'no-trivial') {
    return frequencies.length < 2 || frequencies[0] < 95;
  }
  return frequencies.length >= 2 && (frequencies[0] - frequencies[1]) <= 20;
}

export function filterTrainingQuestionsForAttempt(questions, selection = {}) {
  if (!Array.isArray(questions)) return [];
  return questions.filter((question) => trainingQuestionMatchesSelection(question, selection));
}

export const trainingQuestionSelectionContract = Object.freeze({
  gameModes: Object.freeze([...GAME_MODES]),
  handSelections: Object.freeze([...HAND_SELECTIONS]),
});
