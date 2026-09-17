/**
 * POST /api/push/rotate — authenticated, atomic WebPush rotation.
 * Body: { oldEndpoint, oldKeys: { p256dh, auth }, endpoint, keys: { p256dh, auth } }
 *
 * Old endpoint/key possession alone does not identify the initiating account.
 * Sessionless worker calls receive 401 before source lookup or any writes.
 * Foreground authenticated enrollment remains recovery. Restoring automatic
 * background rotation requires a client-held account binding capability; it is
 * not supplied by this row-version CAS. An accepted provider push cannot be
 * recalled by rotation, and device display/acknowledgment remain separate.
 */
import { createClient } from '../../../src/lib/supabaseServerClient';
import { getServerUserWithFallback } from '../../../src/lib/serverAuth';
import { applyRateLimit } from '../../../src/lib/apiRateLimit';
import { validatePushEndpoint, validatePushKeys, samePushService } from '../../../src/lib/push/push-endpoint';
import { createPushRotationHandler } from '../../../src/lib/push/subscription-rotation.mjs';

let database = null;
function getDatabase() {
    if (!database) database = createClient();
    return database;
}
export default createPushRotationHandler({
    getDatabase, getUser: getServerUserWithFallback, rateLimit: applyRateLimit,
    validateEndpoint: validatePushEndpoint, validateKeys: validatePushKeys, sameService: samePushService,
});
