/**
 * /api/horses/hg-gdpr-erase
 *   POST { userId, confirmed: true } - fn_anonymize_hg_user_content
 *
 * Legal / DPO tool. The most irreversible action on the platform, so:
 *   - it asks for the gdpr.erase permission, not merely "admin";
 *   - it carries a DURABLE rate limit (5 per 10 minutes per operator), because
 *     the in-memory limiter is per lambda instance and multiplies by instance
 *     count on Vercel. A DPO working a batch WILL hit it: a 429 here means
 *     "wait out the window and continue", not "the system is broken", and the
 *     erasures already accepted are done. The tab's copy has to say so, since
 *     the limit is not in the Phase 1 contract and an operator mid-batch has no
 *     other way to read a 429;
 *   - `confirmed: true` is required in the body, so an accidental call cannot
 *     erase anyone;
 *   - it writes its own audit row. The RPC's logging goes to
 *     commander_home_audit_log scoped to the groups the target belongs to, so
 *     erasing a user who is in NO Home Games group inserted zero audit rows and
 *     left no record anywhere.
 */
import { withHgOperatorRoute, mapHgRpcError } from '../../../src/lib/horses/hgOperator.js';
import { PERMISSIONS } from '../../../src/lib/horses/permissions.js';
import { badRequest } from '../../../src/lib/horses/apiEnvelope.js';
import { auditOperatorAction } from '../../../src/lib/horses/operatorAudit.js';
import { uuid } from '../../../src/lib/horses/validate.js';

export const spec = {
  name: 'horses.hg-gdpr-erase',
  methods: ['POST'],
  permission: PERMISSIONS.GDPR_ERASE,
  limit: 'write',
  durable: { max: 5, windowSeconds: 600 },
};

export async function handle({ req, op, userDb, body }) {
  const userId = uuid(body.userId);
  if (!userId) throw badRequest('A Valid User Id Is Required', 'invalid_user_id');
  if (body.confirmed !== true) {
    throw badRequest('Confirmation Is Required: This Action Is Irreversible', 'confirmation_required');
  }

  // CRITICAL: p_requested_by MUST match auth.uid(), which is why this call goes
  // through userDb and not the service-role client.
  const { data, error } = await userDb.rpc('fn_anonymize_hg_user_content', {
    p_user_id: userId,
    p_requested_by: op.user.id,
  });
  if (error) {
    // The RPC raises UNAUTHORIZED with errcode 42501. Collapsing that into
    // "Erasure request failed" left the operator unable to tell "you are not
    // allowed to do this" from "the tool is broken". The mapping is the one
    // every hg route shares now (re-verification L-6): 42501 -> 403, an
    // expired JWT -> 401, the rest through mapDbError.
    throw mapHgRpcError(error, 'This User', { requestId: op.requestId, route: 'horses.hg-gdpr-erase' });
  }

  await auditOperatorAction(op, req, {
    action: 'hg.gdpr_erase',
    targetType: 'user',
    targetId: userId,
    details: { counts: data ?? null, confirmed: true },
    after: { counts: data ?? null },
  });

  return { counts: data, user_id: userId };
}

export default withHgOperatorRoute(spec, handle);
