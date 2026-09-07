const DIFFICULTIES = new Set(['beginner', 'standard', 'expert']);
const TIMERS = new Set(['relaxed', 'standard', 'quick', 'blitz']);
const STREETS = new Set(['preflop', 'flop', 'turn', 'river']);
const TABLE_COUNTS = new Set(['1', '2', '4']);
const HAND_SELECTIONS = new Set(['all', 'no-trivial', 'close']);
const ENGINE_DIFFICULTY_BY_PRODUCT = {
  beginner: 'simple',
  standard: 'grouped',
  expert: 'exact',
};

const EXPLICIT_ENGINE_DIFFICULTIES = new Map([
  ['simple', 'simple'],
  ['grouped', 'grouped'],
  ['exact', 'exact'],
  // TrainerConfigModal historically called the exact-sizings option
  // `standard`. Product difficulty also uses that word for the middle tier,
  // so only interpret it as exact when it arrives through difficultyMode.
  ['standard', 'exact'],
]);

const MODE_ALIASES = new Map([
  ['standard', 'standard'],
  ['play', 'standard'],
]);

const SCOPE_ALIASES = new Map([
  ['full', 'full'],
  ['full-hand', 'full'],
  ['hand', 'full'],
  ['spot', 'spot'],
  ['single-spot', 'spot'],
  ['street', 'street'],
  ['single-street', 'street'],
]);

function lower(value) {
  return typeof value === 'string' ? value.trim().toLowerCase() : '';
}

function fromSet(values, value, fallback) {
  const candidate = lower(value);
  return values.has(candidate) ? candidate : fallback;
}

export function normalizeTrainingSessionMode(value, fallback = 'standard') {
  return MODE_ALIASES.get(lower(value)) || MODE_ALIASES.get(lower(fallback)) || 'standard';
}

export function normalizeTrainingSessionScope(value, fallback = 'full') {
  return SCOPE_ALIASES.get(lower(value)) || SCOPE_ALIASES.get(lower(fallback)) || 'full';
}

export function normalizeTrainingTargetStreet(value, fallback = 'flop') {
  return fromSet(STREETS, value, fromSet(STREETS, fallback, 'flop'));
}

export function normalizeTrainingDifficulty(value, fallback = 'standard') {
  return fromSet(DIFFICULTIES, value, fromSet(DIFFICULTIES, fallback, 'standard'));
}

export function normalizeTrainingTimer(value, fallback = 'standard') {
  return fromSet(TIMERS, value, fromSet(TIMERS, fallback, 'standard'));
}

export function normalizeTrainingTableCount(value, fallback = '1') {
  const candidate = String(value ?? '').trim();
  const safeFallback = TABLE_COUNTS.has(String(fallback)) ? String(fallback) : '1';
  return TABLE_COUNTS.has(candidate) ? candidate : safeFallback;
}

export function normalizeTrainingHandSelection(value, fallback = 'all') {
  return fromSet(HAND_SELECTIONS, value, fromSet(HAND_SELECTIONS, fallback, 'all'));
}

/**
 * Canonical boundary between SessionSetup, Hub routing, Arena state, and the
 * question hook. Preserve unrelated custom-trainer keys while making every
 * shared session preference use one vocabulary.
 */
export function normalizeTrainingSessionConfig(input = {}, defaults = {}) {
  const source = input && typeof input === 'object' ? input : {};
  const fallback = defaults && typeof defaults === 'object' ? defaults : {};
  const mode = normalizeTrainingSessionMode(source.mode, fallback.mode);
  const gameMode = normalizeTrainingSessionScope(
    source.gameMode ?? source.scope,
    fallback.gameMode ?? fallback.scope,
  );
  const targetStreet = gameMode === 'street'
    ? normalizeTrainingTargetStreet(
        source.targetStreet ?? source.street,
        fallback.targetStreet ?? fallback.street,
      )
    : null;
  const requestedTables = normalizeTrainingTableCount(source.tables, fallback.tables);
  const difficulty = normalizeTrainingDifficulty(source.difficulty, fallback.difficulty);
  const explicitDifficultyMode = EXPLICIT_ENGINE_DIFFICULTIES.get(lower(source.difficultyMode))
    || EXPLICIT_ENGINE_DIFFICULTIES.get(lower(fallback.difficultyMode))
    || null;

  return {
    ...source,
    difficulty,
    // Custom Trainer chooses the solver action vocabulary directly. Shared
    // Session Setup instead chooses a product tier, which is mapped here.
    difficultyMode: explicitDifficultyMode || ENGINE_DIFFICULTY_BY_PRODUCT[difficulty],
    timer: normalizeTrainingTimer(source.timer, fallback.timer),
    mode,
    // Keep both keys during the saved-preference migration. Consumers use
    // gameMode; scope remains the public setup/routing vocabulary.
    scope: gameMode,
    gameMode,
    targetStreet,
    speed: lower(source.speed) === 'turbo' ? 'turbo' : 'normal',
    // The graded Arena has one signed mode. Legacy pseudo-mode values normalize
    // to `standard`, so they cannot silently alter table count or resurrect a
    // browser-authored question/grading surface.
    tables: requestedTables,
    handSelection: normalizeTrainingHandSelection(
      source.handSelection,
      fallback.handSelection,
    ),
    feedbackRule: 'every',
    autoAdvanceUI: 'off',
    autoAdvance: false,
    autoAdvanceDelayMs: 0,
  };
}

export function withTrainingSessionDifficulty(config, difficulty, defaults = {}) {
  const current = config && typeof config === 'object' ? { ...config } : {};
  // A direct product-tier selection intentionally replaces any previous
  // custom-trainer action grouping.
  delete current.difficultyMode;
  return normalizeTrainingSessionConfig(
    { ...current, difficulty },
    defaults,
  );
}
