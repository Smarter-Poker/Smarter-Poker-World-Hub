import { createClient } from '../../../src/lib/supabaseServerClient';
import { applyRateLimit, LIMITS } from '../../../src/lib/apiRateLimit';
import { getServerUserWithFallback } from '../../../src/lib/serverAuth';
import { UUID_RE, bearerToken, boundedText, normaliseReportReason } from '../../../src/lib/videoRightsContract.mjs';

let serviceClient;
const service = () => serviceClient ||= createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const userClient = token => createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY, { auth: { persistSession: false, autoRefreshToken: false }, global: { headers: { Authorization: `Bearer ${token}` } } });
const DB_REASON = Object.freeze({ copyright_or_rights: 'copyright', incorrect_attribution: 'wrong_attribution', gambling_harm: 'unsafe_gambling', spam_or_scam: 'spam' });

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'private, no-store'); res.setHeader('Vary', 'Authorization');
  if (!applyRateLimit(req, res, LIMITS.write)) return;
  if (req.method !== 'POST') return res.status(405).json({ success: false, error: 'Method not allowed' });
  try {
    const db = service(), token = bearerToken(req);
    const { user, error } = await getServerUserWithFallback(req, db);
    if (error || !user?.id || !token) return res.status(401).json({ success: false, error: 'Authentication required' });
    if (req.body?.ownerId && req.body.ownerId !== user.id) return res.status(409).json({ success: false, error: 'Account changed; retry the request' });
    const operationId = String(req.body?.operationId || ''), reelId = String(req.body?.reelId || '');
    const reason = normaliseReportReason(req.body?.reason), detail = boundedText(req.body?.detail, 1000);
    if (!UUID_RE.test(operationId) || !UUID_RE.test(reelId) || !reason) return res.status(400).json({ success: false, error: 'Valid Reel, reason, and operation identity required' });
    const target = await db.from('social_reels').select('id,source_asset_id,is_public,is_deleted,moderation_state').eq('id', reelId).maybeSingle();
    if (target.error) throw target.error;
    if (!target.data) return res.status(404).json({ success: false, error: 'Reel not found' });
    if (target.data.is_deleted || target.data.moderation_state === 'taken_down') return res.status(410).json({ success: false, error: 'Reel is no longer available' });
    const result = await userClient(token).rpc('fn_submit_video_content_report', { p_operation_id: operationId, p_video_id: target.data.source_asset_id || null, p_reel_id: reelId, p_reason_code: DB_REASON[reason] || reason, p_detail: detail });
    if (result.error) return res.status(409).json({ success: false, error: result.error.message });
    return res.status(200).json({ success: true, ownerId: user.id, receipt: result.data });
  } catch (requestError) {
    console.warn('[reels/report] failed:', requestError?.message || requestError);
    return res.status(503).json({ success: false, error: 'Report service is temporarily unavailable' });
  }
}
