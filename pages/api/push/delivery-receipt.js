/**
 * POST /api/push/delivery-receipt
 *
 * Called by the SERVICE WORKER after it handles a push that carried a
 * per-device receipt token (reliability escalations; see
 * src/lib/push/device-receipt.js). Body: { id, token, stage } where id is the
 * push_outbox id, token the 64-hex token minted for this device at send time,
 * and stage 'displayed' (showNotification resolved) or 'received' (the worker
 * ran but the OS refused the banner).
 *
 * AUTHENTICATION IS THE TOKEN. A service worker has no access to the
 * localStorage session, so there is no bearer to send. The token is 256 random
 * bits that only ever travelled inside this device's encrypted push payload;
 * only its SHA-256 is stored. A wrong token and an unknown id get the SAME
 * 404, so the route reveals nothing about which outbox ids exist.
 *
 * Responses: 200 { ok, result: 'recorded' | 'duplicate', stage },
 * 400 malformed, 404 not found, 405 wrong method, 503 recording unavailable.
 * The worker never retries on any of them.
 */
import { createClient } from '../../../src/lib/supabaseServerClient';
import { applyRateLimit } from '../../../src/lib/apiRateLimit';
import { createDeliveryReceiptHandler } from '../../../src/lib/push/delivery-receipt-handler';

let _supabase = null;
function getSupabase() {
    if (!_supabase) _supabase = createClient();
    return _supabase;
}

export default createDeliveryReceiptHandler({ getClient: getSupabase, rateLimit: applyRateLimit });
