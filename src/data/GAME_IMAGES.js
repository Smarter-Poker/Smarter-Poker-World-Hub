/**
 * One bespoke #SmarterCasinoRealism render for every training game.
 *
 * The asset filename intentionally matches the canonical game id. Keeping the
 * contract this small prevents future catalog additions from quietly falling
 * back to duplicated artwork: a missing render now remains visible in audits.
 */

import { TRAINING_LIBRARY } from './TRAINING_LIBRARY';

export const TRAINING_ART_ROOT = '/images/training/casino-realism';

export const GAME_IMAGES = Object.freeze(
    Object.fromEntries(
        TRAINING_LIBRARY.map(({ id }) => [id, `${TRAINING_ART_ROOT}/${id}.webp`])
    )
);

export const getGameImage = (gameId) => (
    GAME_IMAGES[gameId] || `${TRAINING_ART_ROOT}/quiz-gauntlet.webp`
);

export default GAME_IMAGES;
