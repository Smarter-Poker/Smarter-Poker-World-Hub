/**
 * /api/trivia/pvp/history - viewer-scoped settled PvP receipts.
 * Private 503 while TRIVIA_PVP_ENABLED is off; authenticated; bounded and
 * sanitized by the Phase 7 history policy and database function.
 */
import { createPvpRoute } from '../../../../src/lib/trivia/pvpApiHandler';
import { serviceClient } from '../tournament-lifecycle';

export default createPvpRoute('history', { serviceClient });
