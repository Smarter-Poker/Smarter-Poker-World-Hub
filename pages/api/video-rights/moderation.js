import { createClient } from '../../../src/lib/supabaseServerClient';
import { applyRateLimit, LIMITS } from '../../../src/lib/apiRateLimit';
import { getServerUserWithFallback } from '../../../src/lib/serverAuth';
import { UUID_RE, bearerToken, boundedText } from '../../../src/lib/videoRightsContract.mjs';
const { isVideoAdminProfile } = require('../../../lib/videoAdminAuthorization');

let serviceClient;
const service = () => serviceClient ||= createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'private, no-store'); res.setHeader('Vary', 'Authorization');
  if (!applyRateLimit(req, res, req.method === 'GET' ? LIMITS.read : LIMITS.write)) return;
  if (!['GET', 'POST'].includes(req.method)) return res.status(405).json({ success: false, error: 'Method not allowed' });
  try {
    const db = service();
    const { user, error } = await getServerUserWithFallback(req, db);
    if (error || !user?.id || !bearerToken(req)) return res.status(401).json({ success: false, error: 'Authentication required' });
    const profile = await db.from('profiles').select('is_admin, role').eq('id', user.id).maybeSingle();
    if (profile.error || !isVideoAdminProfile(profile.data)) return res.status(403).json({ success: false, error: 'Admin access required' });
    if (req.method === 'GET') {
      const [claims, submissions, cases, attributionRequests, clips] = await Promise.all([
        db.from('video_creator_source_claims').select('*').order('updated_at', { ascending: false }).limit(200),
        db.from('video_creator_submissions').select('*').order('updated_at', { ascending: false }).limit(200),
        db.from('video_moderation_cases').select('*').order('updated_at', { ascending: false }).limit(200),
        db.from('video_attribution_update_requests').select('*').eq('status', 'pending').order('updated_at', { ascending: false }).limit(200),
        db.from('video_creator_clip_reviews').select('*').order('updated_at', { ascending: false }).limit(200),
      ]);
      const readError = claims.error || submissions.error || cases.error || attributionRequests.error || clips.error;
      if (readError) throw readError;
      const allCases = cases.data || [];
      return res.status(200).json({ success: true, ownerId: user.id, claims: claims.data || [], submissions: submissions.data || [], attribution_requests: attributionRequests.data || [], reports: allCases.filter(row => row.case_kind !== 'rights_takedown'), takedowns: allCases.filter(row => row.case_kind === 'rights_takedown'), clips: clips.data || [] });
    }
    const action = boundedText(req.body?.action, 40), id = String(req.body?.id || ''), version = Number(req.body?.version), reason = boundedText(req.body?.reason, 500);
    if (!UUID_RE.test(id) || !Number.isInteger(version) || version < 1 || !reason) return res.status(400).json({ success: false, error: 'Valid record, version, and decision reason required' });
    let fn, args;
    if (action === 'review_claim') {
      fn = 'fn_review_video_creator_claim'; args = { p_claim_id: id, p_expected_version: version, p_decision: req.body?.decision, p_reason: reason, p_actor_id: user.id };
    } else if (action === 'review_submission') {
      fn = 'fn_review_video_creator_submission'; args = { p_submission_id: id, p_expected_version: version, p_decision: req.body?.decision, p_reason: reason, p_actor_id: user.id };
    } else if (action === 'review_attribution') {
      fn = 'fn_review_video_attribution_update'; args = { p_request_id: id, p_expected_version: version, p_decision: req.body?.decision, p_reason: reason, p_actor_id: user.id };
    } else if (action === 'review_clip') {
      fn = 'fn_review_video_creator_clip'; args = { p_review_id: id, p_expected_version: version, p_decision: req.body?.decision, p_reason: reason, p_actor_id: user.id };
    } else if (action === 'resolve_report') {
      fn = 'fn_review_video_moderation_case'; args = { p_case_id: id, p_expected_version: version, p_decision: req.body?.decision === 'rejected' ? 'rejected' : 'triaged', p_reason: reason, p_actor_id: user.id };
    } else if (action === 'apply_takedown') {
      fn = 'fn_apply_video_takedown'; args = { p_case_id: id, p_expected_version: version, p_actor_id: user.id };
    } else return res.status(400).json({ success: false, error: 'Unsupported moderation action' });
    const result = await db.rpc(fn, args);
    if (result.error) return res.status(409).json({ success: false, error: result.error.message });
    return res.status(200).json({ success: true, receipt: result.data });
  } catch (requestError) {
    console.warn('[video-rights/moderation] failed:', requestError?.message || requestError);
    return res.status(503).json({ success: false, error: 'Video moderation is temporarily unavailable' });
  }
}
