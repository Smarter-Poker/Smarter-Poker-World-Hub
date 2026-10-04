export const VIDEO_RIGHTS_ACTIONS = Object.freeze({
  submit_claim: 'fn_submit_video_creator_claim',
  submit_submission: 'fn_submit_video_creator_submission',
  request_attribution_update: 'fn_request_video_attribution_update',
  review_clip: 'fn_submit_video_creator_clip_review',
  request_takedown: 'fn_request_video_takedown',
  review_claim: 'fn_review_video_creator_claim',
  review_submission: 'fn_review_video_creator_submission',
  resolve_report: 'fn_review_video_moderation_case',
  apply_takedown: 'fn_apply_video_takedown',
});

export const DISCLOSURE_KINDS = Object.freeze(['organic', 'sponsored', 'promotional', 'generated', 'community']);
export const REPORT_REASONS = Object.freeze(['copyright_or_rights', 'incorrect_attribution', 'unlabeled_promotion', 'unlabeled_generated_media', 'underage_or_safety', 'gambling_harm', 'playback_unavailable', 'inappropriate_content', 'spam_or_scam', 'harassment', 'misinformation', 'other']);
export const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export const YOUTUBE_ID_RE = /^[A-Za-z0-9_-]{11}$/;

export function normaliseReportReason(value) {
  const key = String(value || '').trim().toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');
  if (key === 'spam_scam') return 'spam_or_scam';
  return REPORT_REASONS.includes(key) ? key : null;
}

export function boundedText(value, max = 500) {
  const text = String(value || '').trim();
  return text && text.length <= max ? text : null;
}

export function bearerToken(req) {
  const value = Array.isArray(req?.headers?.authorization) ? req.headers.authorization[0] : req?.headers?.authorization;
  return String(value || '').match(/^Bearer\s+(.+)$/i)?.[1]?.trim() || null;
}
