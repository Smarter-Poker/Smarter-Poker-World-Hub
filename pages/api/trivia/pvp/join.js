/**
 * /api/trivia/pvp/join - Phase 5 server-owned PvP (see src/lib/trivia/pvpApiHandler.js).
 * Private 503 while TRIVIA_PVP_ENABLED is off; authenticated; sanitized DTO only.
 */
import { createPvpRoute } from '../../../../src/lib/trivia/pvpApiHandler';
import { serviceClient } from '../tournament-lifecycle';

export default createPvpRoute('join', { serviceClient });
