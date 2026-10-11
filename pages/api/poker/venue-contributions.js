import { applyRateLimit, LIMITS } from '../../../src/lib/apiRateLimit';
import { contributionPrivate, contributionBody, contributionSession, contributionAccess, contributionId, contributionUuid, claimPayload, correctionPayload, contributionRpc, contributionError, contributionInvalid } from '../../../src/lib/poker-near-me/venueContributionsServer';

export const config = { api: { bodyParser: { sizeLimit: '24kb' } } };

export default async function handler(req, res) {
  contributionPrivate(res);
  if (!['GET', 'POST'].includes(req.method)) { res.setHeader('Allow', 'GET, POST'); return res.status(405).json({ success: false, error: 'Method not allowed' }); }
  if (!applyRateLimit(req, res, req.method === 'GET' ? LIMITS.read : LIMITS.write)) return;
  let operationId;
  try {
    const session = await contributionSession(req, res, { required: req.method === 'POST' || Boolean(req.query.operation_id) });
    if (!session) return;
    if (req.method === 'GET') {
      if (req.query.operation_id) {
        const id = contributionUuid(req.query.operation_id);
        const { data, error } = await session.client.rpc('pnm_contribution_operation', { p_request_id: id });
        if (error) throw error;
        return res.status(200).json({ success: true, operation: data || null });
      }
      const access = await contributionAccess(session, contributionId(req.query.venue_id));
      return res.status(200).json({ success: true, access });
    }
    const body = contributionBody(req);
    operationId = contributionUuid(body.operation_id);
    const venueId = contributionId(body.venue_id);
    if (!['claim', 'correction'].includes(body.kind)) throw contributionInvalid('Invalid contribution kind');
    const input = body.payload || body;
    const payload = body.kind === 'claim' ? claimPayload(input) : correctionPayload(input);
    const receipt = await contributionRpc(session.client, body.kind === 'claim' ? 'pnm_submit_venue_claim' : 'pnm_submit_venue_correction', { p_request_id: operationId, p_venue_id: venueId, p_payload: payload }, operationId);
    return res.status(201).json({ success: true, ...receipt });
  } catch (error) { if (operationId && !error.code && !error.status) error.operationId = operationId; return contributionError(res, error); }
}
