import { applyRateLimit, LIMITS } from '../../../src/lib/apiRateLimit';
import { contributionPrivate, contributionBody, contributionSession, contributionId, contributionUuid, contributionRpc, contributionReviewReplay, contributionError, contributionInvalid, reviewPayload } from '../../../src/lib/poker-near-me/venueContributionsServer';
import { assessVenueLocation } from '../../../src/lib/poker-near-me/venueIntegrityServer';

export const config = { api: { bodyParser: { sizeLimit: '24kb' } } };

export default async function handler(req, res) {
  contributionPrivate(res);
  if (!['GET', 'POST'].includes(req.method)) { res.setHeader('Allow', 'GET, POST'); return res.status(405).json({ success: false, error: 'Method not allowed' }); }
  if (!applyRateLimit(req, res, req.method === 'GET' ? LIMITS.read : LIMITS.write)) return;
  let operationId;
  try {
    // Queue contact/proof data is privileged too, not merely the review write.
    const session = await contributionSession(req, res, { staff: true, mfa: true });
    if (!session) return;
    if (req.method === 'GET') {
      const offset = req.query.offset == null ? 0 : Number(req.query.offset);
      if (!Number.isSafeInteger(offset) || offset < 0 || offset > 100000) throw contributionInvalid('Invalid queue offset');
      const status = req.query.status || 'pending';
      const venueId = req.query.venue_id == null ? null : contributionId(req.query.venue_id);
      if (!['pending', 'approved', 'rejected', 'revoked', 'applied', 'all'].includes(status)) throw contributionInvalid('Invalid queue status');
      const read = async (table, statuses) => {
        let query = session.service.from(table).select('*').order('created_at', { ascending: false }).order('id', { ascending: false }).range(offset, offset + 50);
        if (venueId !== null) query = query.eq('venue_id', venueId);
        if (status !== 'all') query = query.in('status', statuses);
        const { data, error } = await query;
        if (error) throw error;
        return data || [];
      };
      const [claims, corrections] = await Promise.all([read('venue_claims', status === 'pending' ? ['pending', 'under_review'] : [status]), read('pnm_venue_corrections', [status])]);
      // Verification codes are never review evidence and never leave the server.
      const safeClaims = claims.slice(0, 50).map(({ verification_code, verification_attempts, ...claim }) => ({ ...claim,
        contact_name: claim.claimant_name, contact_email: claim.claimant_email, contact_phone: claim.claimant_phone,
        notes: claim.claimant_notes, source_url: claim.submitted_source_url }));
      return res.status(200).json({ success: true, claims: safeClaims, corrections: corrections.slice(0, 50), offset, has_more: claims.length > 50 || corrections.length > 50, next_offset: offset + 50 });
    }
    const body = contributionBody(req);
    operationId = contributionUuid(body.operation_id);
    if (!['claim', 'correction'].includes(body.kind)) throw contributionInvalid('Invalid review kind');
    const id = contributionUuid(body.id, 'id');
    const payload = reviewPayload(body.payload || body, body.kind);
    const original = await contributionReviewReplay(session, operationId, body.kind, id, payload);
    if (original) return res.status(200).json({ success: true, ...original });
    if (body.kind === 'correction' && payload.action === 'apply') {
      const { data: correction, error: correctionError } = await session.service.from('pnm_venue_corrections').select('id,venue_id,category,proposal').eq('id', id).maybeSingle();
      if (correctionError) throw correctionError;
      if (!correction) throw Object.assign(new Error('Correction not found'), { code: 'P0002' });
      if (correction.category === 'location') {
        const { data: venue, error: venueError } = await session.service.from('poker_venues').select('id,name,venue_type,address,city,state,latitude,longitude,lat,lng').eq('id', correction.venue_id).maybeSingle();
        if (venueError) throw venueError;
        if (!venue) throw Object.assign(new Error('Venue not found'), { code: 'P0002' });
        const proposal = correction.proposal;
        if (!proposal || !['latitude', 'longitude'].every(field => typeof proposal[field] === 'number' && Number.isFinite(proposal[field]))) throw contributionInvalid('Location correction requires numeric latitude and longitude');
        const resolved = { address: proposal.address ?? venue.address, city: proposal.city ?? venue.city, state: proposal.state ?? venue.state,
          latitude: proposal.latitude, longitude: proposal.longitude };
        const assessment = assessVenueLocation({ ...venue, ...resolved, lat: resolved.latitude, lng: resolved.longitude });
        if (!['verified', 'border'].includes(assessment.status)) throw Object.assign(new Error('Correction conflicts with the published state boundary'), { status: 422 });
        payload.resolved_location = { ...resolved, integrity_status: assessment.status, integrity_reason: assessment.reason };
      }
    }
    const receipt = await contributionRpc(session.service, body.kind === 'claim' ? 'pnm_review_venue_claim' : 'pnm_review_venue_correction', {
      p_request_id: operationId, p_actor_id: session.user.id,
      ...(body.kind === 'claim' ? { p_claim_id: id } : { p_correction_id: id }), p_payload: payload,
    }, operationId);
    return res.status(200).json({ success: true, ...receipt });
  } catch (error) { if (operationId && !error.code && !error.status) error.operationId = operationId; return contributionError(res, error); }
}
