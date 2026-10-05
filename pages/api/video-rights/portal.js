import { createClient } from '../../../src/lib/supabaseServerClient';
import { applyRateLimit, LIMITS } from '../../../src/lib/apiRateLimit';
import { getServerUserWithFallback } from '../../../src/lib/serverAuth';
import { VIDEO_RIGHTS_ACTIONS, UUID_RE, bearerToken, boundedText } from '../../../src/lib/videoRightsContract.mjs';

let adminClient;
const admin = () => adminClient ||= createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const userClient = token => createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY, { auth: { persistSession: false, autoRefreshToken: false }, global: { headers: { Authorization: `Bearer ${token}` } } });

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'private, no-store'); res.setHeader('Vary', 'Authorization');
  if (!applyRateLimit(req, res, req.method === 'GET' ? LIMITS.read : LIMITS.write)) return;
  if (!['GET', 'POST'].includes(req.method)) return res.status(405).json({ success: false, error: 'Method not allowed' });
  try {
    const service = admin();
    const { user, error } = await getServerUserWithFallback(req, service);
    const token = bearerToken(req);
    if (error || !user?.id || !token) return res.status(401).json({ success: false, error: 'Authentication required' });
    const expectedOwnerId = String(req.method === 'GET' ? req.query.ownerId : req.body?.ownerId || '').trim();
    if (expectedOwnerId && expectedOwnerId !== user.id) return res.status(409).json({ success: false, error: 'Account changed; retry the request' });
    const db = userClient(token);
    if (req.method === 'GET') {
      const [claims, submissions, cases, attributions, attributionRequests, clipDecisions] = await Promise.all([
        db.from('video_creator_source_claims').select('*').order('updated_at', { ascending: false }).limit(100),
        db.from('video_creator_submissions').select('*').order('updated_at', { ascending: false }).limit(100),
        db.from('video_moderation_cases').select('*').order('updated_at', { ascending: false }).limit(100),
        db.from('video_attribution_records').select('*').order('updated_at', { ascending: false }).limit(100),
        db.from('video_attribution_update_requests').select('*').order('updated_at', { ascending: false }).limit(100),
        db.from('video_creator_clip_reviews').select('*').order('updated_at', { ascending: false }).limit(100),
      ]);
      const readError = claims.error || submissions.error || cases.error || attributions.error || attributionRequests.error || clipDecisions.error;
      if (readError) throw readError;
      const ownedVideoIds = [...new Set((submissions.data || []).filter(row => row.status === 'approved' && UUID_RE.test(row.video_id || '')).map(row => row.video_id))];
      let candidates = [];
      if (ownedVideoIds.length) {
        const candidateResult = await service.from('video_reel_candidates').select('id,video_id,status,selection_kind,playback_mode,clip_start_seconds,clip_end_seconds,embed_url,selection_reason,topic,version,created_at,updated_at').in('video_id', ownedVideoIds).eq('status', 'proposed').order('updated_at', { ascending: false }).limit(100);
        if (candidateResult.error) throw candidateResult.error;
        const decisions = new Map((clipDecisions.data || []).map(row => [row.candidate_id, row]));
        candidates = (candidateResult.data || []).map(row => ({ ...row, creator_review: decisions.get(row.id) || null }));
      }
      return res.status(200).json({ success: true, ownerId: user.id, claims: claims.data || [], submissions: submissions.data || [], cases: cases.data || [], attributions: attributions.data || [], attribution_requests: attributionRequests.data || [], clip_reviews: candidates });
    }
    const action = boundedText(req.body?.action, 40), fn = VIDEO_RIGHTS_ACTIONS[action];
    if (!['submit_claim', 'reserve_upload', 'submit_submission', 'request_attribution_update', 'review_clip', 'request_takedown'].includes(action) || (action !== 'reserve_upload' && !fn)) return res.status(400).json({ success: false, error: 'Unsupported creator action' });
    const operationId = String(req.body?.operationId || '');
    if (!UUID_RE.test(operationId)) return res.status(400).json({ success: false, error: 'Valid operation identity required' });
    if (action === 'reserve_upload') {
      const videoId = String(req.body?.videoId || req.body?.video_id || ''), sourceClaimId = String(req.body?.sourceClaimId || req.body?.source_claim_id || '');
      const mimeType = String(req.body?.mimeType || req.body?.mime_type || ''), byteSize = Number(req.body?.byteSize || req.body?.byte_size);
      if (!UUID_RE.test(videoId) || !UUID_RE.test(sourceClaimId) || !['video/mp4', 'video/quicktime', 'video/webm'].includes(mimeType) || !Number.isInteger(byteSize) || byteSize < 1024 || byteSize > 500000000) return res.status(400).json({ success: false, error: 'Approved source, existing video, and a supported file up to 500 MB are required' });
      const [video, claim] = await Promise.all([
        service.from('video_library_videos').select('id,source_id').eq('id', videoId).maybeSingle(),
        service.from('video_creator_source_claims').select('id,content_source_id').eq('id', sourceClaimId).eq('claimant_user_id', user.id).in('status', ['verified', 'approved']).maybeSingle(),
      ]);
      if (video.error || claim.error) throw video.error || claim.error;
      if (!video.data?.id || !claim.data?.id || String(video.data.source_id) !== String(claim.data.content_source_id)) return res.status(403).json({ success: false, error: 'The approved source claim does not own this library video' });
      let reservation = await service.from('video_source_upload_tickets').select('*').eq('operation_id', operationId).maybeSingle();
      if (reservation.error) throw reservation.error;
      if (reservation.data && (reservation.data.actor_id !== user.id || reservation.data.video_id !== videoId || reservation.data.mime_type !== mimeType || Number(reservation.data.byte_size) !== byteSize)) return res.status(409).json({ success: false, error: 'Upload operation replay does not match its original file' });
      if (!reservation.data) {
        const path = `${videoId}/${crypto.randomUUID()}.source`;
        reservation = await service.from('video_source_upload_tickets').insert({ operation_id: operationId, video_id: videoId, storage_path: path, actor_id: user.id, byte_size: byteSize, mime_type: mimeType }).select('*').maybeSingle();
        if (reservation.error) return res.status(409).json({ success: false, error: 'Source upload reservation could not be created' });
      }
      const signed = await service.storage.from('video-source-masters').createSignedUploadUrl(reservation.data.storage_path);
      if (signed.error) return res.status(503).json({ success: false, error: 'Source upload authorization is temporarily unavailable' });
      return res.status(200).json({ success: true, ownerId: user.id, uploadTicketId: reservation.data.id, bucket: 'video-source-masters', path: reservation.data.storage_path, token: signed.data.token, signedUrl: signed.data.signedUrl });
    }
    const args = action === 'submit_claim' ? {
      p_operation_id: operationId, p_content_source_id: req.body?.contentSourceId || req.body?.content_source_id, p_provider_channel_id: boundedText(req.body?.providerChannelId || req.body?.provider_channel_id, 160), p_evidence_kind: boundedText(req.body?.evidenceKind || req.body?.evidence_kind, 40), p_evidence_reference: boundedText(req.body?.evidenceReference || req.body?.evidence_reference, 500), p_evidence_sha256: boundedText(req.body?.evidenceSha256 || req.body?.evidence_sha256, 64),
    } : action === 'submit_submission' ? {
      p_operation_id: operationId, p_source_claim_id: req.body?.sourceClaimId || req.body?.source_claim_id || null, p_video_id: req.body?.videoId || req.body?.video_id || null, p_youtube_video_id: boundedText(req.body?.youtubeVideoId || req.body?.youtube_video_id, 11), p_upload_ticket_id: req.body?.uploadTicketId || req.body?.upload_ticket_id || null, p_title: boundedText(req.body?.title, 240), p_attribution_name: boundedText(req.body?.attributionName || req.body?.attribution_name, 160), p_attribution_url: boundedText(req.body?.attributionUrl || req.body?.attribution_url, 500), p_disclosure_kind: boundedText(req.body?.disclosureKind || req.body?.disclosure_kind, 32), p_sponsor_name: boundedText(req.body?.sponsorName || req.body?.sponsor_name, 160), p_rights_status: boundedText(req.body?.rightsStatus || req.body?.rights_status, 32), p_permitted_uses: req.body?.permittedUses || req.body?.permitted_uses || [], p_territories: req.body?.territories || [], p_valid_until: req.body?.validUntil || req.body?.valid_until || null,
    } : action === 'request_attribution_update' ? {
      p_operation_id: operationId, p_attribution_record_id: req.body?.attributionRecordId || req.body?.attribution_record_id, p_creator_name: boundedText(req.body?.creatorName || req.body?.attribution_name, 160), p_attribution_url: boundedText(req.body?.attributionUrl || req.body?.attribution_url, 500),
    } : action === 'review_clip' ? {
      p_operation_id: operationId, p_candidate_id: req.body?.candidateId || req.body?.candidate_id, p_expected_version: Number(req.body?.version), p_decision: boundedText(req.body?.decision, 16), p_reason: boundedText(req.body?.reason, 500),
    } : {
      p_operation_id: operationId, p_video_id: req.body?.videoId || req.body?.video_id || null, p_reel_id: req.body?.reelId || req.body?.reel_id || null, p_reason_code: boundedText(req.body?.reasonCode || req.body?.reason, 64), p_detail: boundedText(req.body?.details, 1000),
    };
    if (action === 'request_takedown' && !args.p_video_id && !args.p_reel_id) {
      const targetId = String(req.body?.targetId || req.body?.target_id || '');
      if (!UUID_RE.test(targetId)) return res.status(400).json({ success: false, error: 'Valid Reel or video id required' });
      const reel = await service.from('social_reels').select('id').eq('id', targetId).maybeSingle();
      if (reel.data?.id) args.p_reel_id = reel.data.id;
      else {
        const video = await service.from('video_library_videos').select('id').eq('id', targetId).maybeSingle();
        if (!video.data?.id) return res.status(404).json({ success: false, error: 'Rights target not found' });
        args.p_video_id = video.data.id;
      }
    }
    const uuidFields = Object.entries(args).filter(([key, value]) => key !== 'p_operation_id' && key.endsWith('_id') && value != null);
    if (uuidFields.some(([, value]) => !UUID_RE.test(String(value)))) return res.status(400).json({ success: false, error: 'A valid record identity is required' });
    if (action === 'review_clip' && (!Number.isInteger(args.p_expected_version) || args.p_expected_version < 1 || !['approved', 'rejected'].includes(args.p_decision) || (args.p_decision === 'rejected' && !args.p_reason))) return res.status(400).json({ success: false, error: 'A current clip version and valid decision are required' });
    if (action === 'request_attribution_update' && (!args.p_creator_name || !/^https:\/\//i.test(args.p_attribution_url || ''))) return res.status(400).json({ success: false, error: 'Creator name and HTTPS attribution URL are required' });
    if (Object.values(args).some(value => value === undefined)) return res.status(400).json({ success: false, error: 'Required fields are missing' });
    const result = await db.rpc(fn, args);
    if (result.error) return res.status(400).json({ success: false, error: result.error.message });
    return res.status(200).json({ success: true, ownerId: user.id, receipt: result.data });
  } catch (requestError) {
    console.warn('[video-rights/portal] failed:', requestError?.message || requestError);
    return res.status(503).json({ success: false, error: 'Creator rights service is temporarily unavailable' });
  }
}
