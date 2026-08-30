const CUSTOM_TRAINER_KEYS = [
  'gameType',
  'stackDepth',
  'position',
  'villainPosition',
  'actionScenario',
  'street',
  'handClass',
  'boardTexture',
];

/**
 * Session setup preferences (timer, difficulty, feedback, and table count)
 * are not a custom drill definition. Treating any non-null config as custom
 * silently routed catalog games through /custom-train and replaced their
 * subject matter with a generic cash-game spot.
 */
export function isCustomTrainerConfig(config) {
  if (!config || typeof config !== 'object') return false;
  if (config.isCustomTrainer === true || config.configType === 'custom-trainer') return true;
  return CUSTOM_TRAINER_KEYS.some((key) => {
    const value = config[key];
    return value !== undefined && value !== null && value !== '' && value !== 'any';
  });
}
