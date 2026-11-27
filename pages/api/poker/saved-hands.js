/**
 * Saved Hands API — private owner-scoped hand review storage (`public.hand_histories`).
 *
 *   GET    /api/poker/saved-hands                         list caller's saved hands (newest first)
 *   GET    /api/poker/saved-hands?id=<saved-row-id>       read one caller-owned saved hand
 *   GET    /api/poker/saved-hands?sourceHandId=<uuid>     durable readback check for a Club Arena hand
 *   POST   /api/poker/saved-hands                         save a Club Arena hand (`{ source: "club-arena", handId }`)
 *                                                         or an AI-Scan hand (legacy payload)
 *   PATCH  /api/poker/saved-hands                         update private notes, review status, or analysis receipt
 *                                                         with optimistic-concurrency revision check (409 on conflict)
 *   DELETE /api/poker/saved-hands?id=<saved-row-id>       delete one caller-owned saved hand
 */
import { getServiceSupabase } from '../../../src/lib/apiSupabase';
import { getServerUserWithFallback } from '../../../src/lib/serverAuth';
import { applyRateLimit, LIMITS } from '../../../src/lib/apiRateLimit';
import { reportApiError } from '../../../src/lib/apiErrorHandler';
import {
  SAVED_HAND_TABLE_ID,
  validateSavedHand,
  savedHandRow,
} from '../../../src/lib/personal-assistant/savedHands.mjs';
import { executeSavedHandsRequest } from '../../../src/lib/personal-assistant/savedHandsRouteCore.mjs';

export { SAVED_HAND_TABLE_ID, validateSavedHand, savedHandRow };

export default async function handler(req, res) {
  return executeSavedHandsRequest(req, res, {
    getDb: getServiceSupabase,
    getUser: getServerUserWithFallback,
    applyRateLimit,
    limits: LIMITS,
    reportError: reportApiError,
  });
}
