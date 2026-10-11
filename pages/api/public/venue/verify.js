import { applyRateLimit, LIMITS } from '../../../../src/lib/apiRateLimit';
import { contributionPrivate, contributionBody, contributionSession, contributionUuid, contributionError } from '../../../../src/lib/poker-near-me/venueContributionsServer';

// Legacy codes are not ownership evidence. Only qualified staff can approve.
export default async function handler(req, res) {
  contributionPrivate(res);
  if (req.method !== 'POST') { res.setHeader('Allow', 'POST'); return res.status(405).json({ success: false, error: 'Method not allowed' }); }
  if (!applyRateLimit(req, res, LIMITS.write)) return;
  try {
    const session = await contributionSession(req, res);
    if (!session) return;
    const id = contributionUuid(contributionBody(req).claim_id, 'claim_id');
    const { data: claim, error } = await session.client.from('venue_claims').select('id,venue_id,status,created_at,updated_at').eq('id', id).eq('user_id', session.user.id).maybeSingle();
    if (error) throw error;
    if (!claim) return res.status(404).json({ success: false, error: 'Claim not found' });
    return res.status(200).json({ success: true, claim_id: claim.id, venue_id: claim.venue_id, status: claim.status,
      verification_method: 'evidence_review', message: 'Ownership is checked through independent evidence review. No verification code is sent or accepted.' });
  } catch (error) { return contributionError(res, error); }
}
