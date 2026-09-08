const TEXT_FIELDS = [
  'user_id',
  'game_id',
  'question_id',
  'answer_id',
  'hero_position',
  'villain_position',
  'street',
  'classification',
  'spot_type',
  'submission_id',
  'solver_source',
];

const NUMBER_FIELDS = [
  'level',
  'ev_loss',
  'selected_frequency',
  'optimal_frequency',
];

const BOOLEAN_FIELDS = [
  'is_correct',
  'solver_verified',
  'ev_loss_measured',
];

function canonicalJson(value) {
  if (Array.isArray(value)) return value.map(canonicalJson);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(
    Object.keys(value)
      .filter((key) => value[key] !== undefined)
      .sort()
      .map((key) => [key, canonicalJson(value[key])]),
  );
}

const textValue = (value) => (value === null || value === undefined ? null : String(value));
const numberValue = (value) => (
  value === null || value === undefined || value === '' ? null : Number(value)
);
const booleanValue = (value) => value === true || value === 'true' || value === 1 || value === '1';

/**
 * Decide whether a unique-submission retry is the exact same immutable
 * answer. answered_at and the generated row id are receipts, not caller
 * bindings, so they are intentionally excluded.
 */
export function trainingAnswerBindingMatches(existing, expected) {
  if (!existing || !expected) return false;
  if (TEXT_FIELDS.some((field) => textValue(existing[field]) !== textValue(expected[field]))) {
    return false;
  }
  if (NUMBER_FIELDS.some((field) => numberValue(existing[field]) !== numberValue(expected[field]))) {
    return false;
  }
  if (BOOLEAN_FIELDS.some((field) => booleanValue(existing[field]) !== booleanValue(expected[field]))) {
    return false;
  }
  return JSON.stringify(canonicalJson(existing.evidence_metadata || {}))
    === JSON.stringify(canonicalJson(expected.evidence_metadata || {}));
}

export const TRAINING_ANSWER_BINDING_COLUMNS = [
  ...TEXT_FIELDS,
  ...NUMBER_FIELDS,
  ...BOOLEAN_FIELDS,
  'evidence_metadata',
].join(',');

export default {
  TRAINING_ANSWER_BINDING_COLUMNS,
  trainingAnswerBindingMatches,
};
