/**
 * /api/trivia/pvp/quote - authenticated Phase 7 pre-commit economics.
 * The database reads the active immutable rules version and player balance;
 * the browser never calculates rake or possible return.
 */
import { createPvpRoute } from '../../../../src/lib/trivia/pvpApiHandler';
import { serviceClient } from '../tournament-lifecycle';

export default createPvpRoute('quote', { serviceClient });
