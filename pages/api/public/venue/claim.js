import { applyRateLimit, LIMITS } from '../../../../src/lib/apiRateLimit';
import { contributionPrivate, contributionBody, contributionSession, contributionAccess, contributionId, contributionUuid, claimPayload, contributionRpc, contributionError } from '../../../../src/lib/poker-near-me/venueContributionsServer';

// Existing URL, one authoritative evidence-review pipeline. No code is sent.
export default async function handler(req, res) {
  contributionPrivate(res);
  if (!['GET', 'POST'].includes(req.method)) { res.setHeader('Allow', 'GET, POST'); return res.status(405).json({ success: false, error: 'Method not allowed' }); }
  if (!applyRateLimit(req, res, req.method === 'GET' ? LIMITS.read : LIMITS.write)) return;
  let operationId;
  try {
    const session = await contributionSession(req, res, { required: req.method === 'POST' });
    if (!session) return;
    if (req.method === 'GET') {
      const access = await contributionAccess(session, contributionId(req.query.venue_id));
      return res.status(200).json({ success: true, venue_id: access.venue_id, is_claimed: access.is_claimed, user_claim: access.claim, is_manager: Object.values(access.permissions || {}).some(Boolean), access });
    }
    const body = contributionBody(req);
    operationId = contributionUuid(body.operation_id);
    const payload = claimPayload({ ...body, role: body.role || 'owner', contact_name: body.contact_name ?? body.claimant_name,
      contact_email: body.contact_email ?? body.claimant_email, contact_phone: body.contact_phone ?? body.claimant_phone });
    const receipt = await contributionRpc(session.client, 'pnm_submit_venue_claim', { p_request_id: operationId, p_venue_id: contributionId(body.venue_id), p_payload: payload }, operationId);
    return res.status(201).json({ success: true, ...receipt, claim_id: receipt.claim?.id, verification_method: 'evidence_review', message: 'Claim submitted for independent review. Management access is not granted until approval.' });
  } catch (error) { if (operationId && !error.code && !error.status) error.operationId = operationId; return contributionError(res, error); }
}
