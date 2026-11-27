/**
 * Saved Hands API — private owner-scoped hand review storage (`public.hand_histories`).
 *
 *   GET    /api/poker/saved-hands                                  cursor-paginated list with filters & counts
 *   GET    /api/poker/saved-hands?id=<saved-row-id>                read one caller-owned saved hand
 *   GET    /api/poker/saved-hands?sourceHandId=<uuid>              durable readback check for one Club Arena hand
 *   GET    /api/poker/saved-hands?source=club-arena&handIds=<csv>  batch saved-status lookup (up to 50 UUIDs)
 *   GET    /api/poker/saved-hands?suggested=1                      post-session suggested hands (active-play RTA gated)
 *   GET    /api/poker/saved-hands?analysisGate=1                   explicit active-table RTA gate check (423 Locked)
 *   GET    /api/poker/saved-hands?export=json|text                 portable download of all caller-owned saved hands
 *   POST   /api/poker/saved-hands                                  save Club Arena hand (always allowed for completed hands),
 *                                                                  AI-Scan hand, or `{ action: "check_analysis_gate"|"request_analysis" }`
 *   PATCH  /api/poker/saved-hands                                  update notes, tags, reviewStatus, or analysis receipt
 *                                                                  (optimistic revision check 409; RTA gate 423 on analyzed)
 *   DELETE /api/poker/saved-hands?id=<saved-row-id>                delete one caller-owned saved hand
 */
import { getServiceSupabase } from '../../../src/lib/apiSupabase';
import { getServerUserWithFallback } from '../../../src/lib/serverAuth';
import { applyRateLimit, LIMITS } from '../../../src/lib/apiRateLimit';
import { reportApiError } from '../../../src/lib/apiErrorHandler';
import { checkSandboxAccess } from '../../../src/lib/personal-assistant/contextAuthority';
import { attachPersonalAssistantTiming } from '../../../src/lib/personal-assistant/serverTiming.mjs';
import {
  SAVED_HAND_TABLE_ID,
  validateSavedHand,
  savedHandRow,
} from '../../../src/lib/personal-assistant/savedHands.mjs';
import { executeSavedHandsRequest } from '../../../src/lib/personal-assistant/savedHandsRouteCore.mjs';

export { SAVED_HAND_TABLE_ID, validateSavedHand, savedHandRow };

export const config = {
  api: {
    bodyParser: {
      sizeLimit: '64kb',
    },
  },
};

export default async function handler(req, res) {
  return executeSavedHandsRequest(req, res, {
    getDb: getServiceSupabase,
    getUser: getServerUserWithFallback,
    applyRateLimit,
    limits: LIMITS,
    reportError: reportApiError,
    checkAccess: checkSandboxAccess,
    attachTiming: attachPersonalAssistantTiming,
  });
}
