import { createClient } from '../../../src/lib/supabaseServerClient';
import { applyRateLimit, LIMITS } from '../../../src/lib/apiRateLimit';
import { getServerUserWithFallback } from '../../../src/lib/serverAuth';

let client;
const supabase = () => client ||= createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const validUuid = (value) => UUID_RE.test(String(value || ''));
const YOUTUBE_ID_RE = /^[A-Za-z0-9_-]{11}$/;

function getBearerToken(req) {
  const header = Array.isArray(req.headers.authorization) ? req.headers.authorization[0] : req.headers.authorization;
  return String(header || '').match(/^Bearer\s+(.+)$/i)?.[1]?.trim() || null;
}

function userClient(token) {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: `Bearer ${token}` } },
  });
}

const boundedNumber = (value, max) => {
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 && number <= max ? number : null;
};

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'private, no-store');
  res.setHeader('Vary', 'Authorization');
  const limit = req.method === 'GET' ? LIMITS.read : LIMITS.write;
  if (!applyRateLimit(req, res, limit)) return;
  if (!['GET', 'POST', 'DELETE'].includes(req.method)) return res.status(405).json({ success: false, error: 'Method not allowed' });
  try {
    const db = supabase();
    const { user, error: authError } = await getServerUserWithFallback(req, db);
    if (authError || !user?.id) return res.status(401).json({ success: false, error: 'Authentication required' });
    const token = getBearerToken(req);
    if (!token) return res.status(401).json({ success: false, error: 'Authentication required' });
    const ownerDb = userClient(token);
    const expectedOwnerId = String(req.method === 'GET' ? req.query.ownerId : req.body?.ownerId || '').trim();
    if (expectedOwnerId && expectedOwnerId !== user.id) {
      return res.status(409).json({ success: false, error: 'Account changed; retry the request' });
    }
    if (req.method === 'GET') {
      const [lists, progress] = await Promise.all([
        ownerDb.from('video_study_lists').select('id, name, description, created_at, updated_at, items:video_study_list_items(video_id,note,start_seconds,added_at)').order('updated_at', { ascending: false }).limit(50),
        ownerDb.from('video_learning_progress').select('video_id, position_seconds, duration_seconds, percent_complete, completed_at, last_chapter_key, last_watched_at').order('last_watched_at', { ascending: false }).limit(500),
      ]);
      if (lists.error || progress.error) throw lists.error || progress.error;
      const learningIds = [...new Set([
        ...(lists.data || []).flatMap(list => (list.items || []).map(item => item.video_id)),
        ...(progress.data || []).map(item => item.video_id),
      ].filter(validUuid))];
      let publicIds = new Map();
      if (learningIds.length) {
        const { data: videos, error: videosError } = await db.from('video_library_videos')
          .select('id,youtube_video_id').in('id', learningIds);
        if (videosError) throw videosError;
        const publicCandidates = (videos || []).map(video => video.youtube_video_id).filter(Boolean);
        if (publicCandidates.length) {
          const { data: eligibleVideos, error: eligibilityError } = await db.from('video_library_public_catalog')
            .select('youtube_video_id').in('youtube_video_id', publicCandidates);
          if (eligibilityError) throw eligibilityError;
          const eligibleIds = new Set((eligibleVideos || []).map(video => video.youtube_video_id));
          publicIds = new Map((videos || []).filter(video => eligibleIds.has(video.youtube_video_id))
            .map(video => [video.id, video.youtube_video_id]));
        }
      }
      const publicLists = (lists.data || []).map(list => ({
        ...list,
        items: (list.items || []).flatMap(item => {
          const videoId = publicIds.get(item.video_id);
          return videoId ? [{ ...item, videoId }] : [];
        }),
      }));
      const publicProgress = (progress.data || []).flatMap(item => {
        const videoId = publicIds.get(item.video_id);
        return videoId ? [{ ...item, videoId }] : [];
      });
      return res.status(200).json({ success: true, ownerId: user.id, data: { lists: publicLists, progress: publicProgress } });
    }
    const action = String(req.body?.action || (req.method === 'DELETE' ? 'remove-item' : 'save-item'));
    if (req.method === 'POST' && action === 'create-list') {
      const name = String(req.body?.name || '').trim().slice(0, 80);
      if (!name) return res.status(400).json({ success: false, error: 'Study list name is required' });
      const { data, error } = await ownerDb.from('video_study_lists').insert({
        user_id: user.id, name, description: String(req.body?.description || '').trim().slice(0, 500) || null,
      }).select('id, name, description, created_at, updated_at').maybeSingle();
      if (error) throw error;
      return res.status(201).json({ success: true, data });
    }
    const requestedVideoId = String(req.body?.videoId || '');
    let videoId = requestedVideoId;
    if (!validUuid(videoId) && YOUTUBE_ID_RE.test(requestedVideoId)) {
      const { data: resolved, error: resolveError } = await db.from('video_library_videos')
        .select('id').eq('youtube_video_id', requestedVideoId).maybeSingle();
      if (resolveError) throw resolveError;
      videoId = String(resolved?.id || '');
    }
    if (!validUuid(videoId)) return res.status(400).json({ success: false, error: 'Invalid or unavailable video id' });
    const { data: eligible, error: eligibilityError } = await db.rpc('fn_is_video_library_asset_eligible', { p_asset_id: videoId });
    if (eligibilityError) throw eligibilityError;
    if (eligible !== true) return res.status(410).json({ success: false, error: 'Video is no longer available' });
    if (req.method === 'POST' && action === 'reel-save') {
      const reelId = String(req.body?.reelId || '');
      if (!validUuid(reelId) || typeof req.body?.saved !== 'boolean') {
        return res.status(400).json({ success: false, error: 'Invalid Reel study request' });
      }
      const { data, error } = await ownerDb.rpc('set_video_learning_reel_saved', {
        p_video_id: videoId,
        p_reel_id: reelId,
        p_saved: req.body.saved,
      });
      if (error) throw error;
      return res.status(200).json({ success: true, ownerId: user.id, saved: data === true });
    }
    if (req.method === 'POST' && action === 'progress') {
      const position = boundedNumber(req.body?.positionSeconds, 86_400);
      const duration = boundedNumber(req.body?.durationSeconds, 86_400);
      if (position === null || !duration || position > duration + 5) return res.status(400).json({ success: false, error: 'Invalid progress payload' });
      const { data, error } = await ownerDb.rpc('upsert_video_learning_progress', {
        p_video_id: videoId,
        p_position_seconds: position,
        p_duration_seconds: duration,
        p_chapter_key: String(req.body?.chapterKey || '').trim().slice(0, 160) || null,
      });
      if (error) throw error;
      return res.status(200).json({ success: true, data });
    }
    let listId = String(req.body?.listId || '');
    if (!listId) {
      const existing = await ownerDb.from('video_study_lists').select('id')
        .eq('name', 'Study Queue').maybeSingle();
      if (existing.error) throw existing.error;
      listId = String(existing.data?.id || '');
      if (!listId && req.method === 'POST') {
        const created = await ownerDb.from('video_study_lists').upsert({
          user_id: user.id,
          name: 'Study Queue',
          description: 'Lessons saved from Video Library and Reels.',
        }, { onConflict: 'user_id,name', ignoreDuplicates: true }).select('id').maybeSingle();
        if (created.error) throw created.error;
        listId = String(created.data?.id || '');
        if (!listId) {
          const raced = await ownerDb.from('video_study_lists').select('id').eq('name', 'Study Queue').maybeSingle();
          if (raced.error) throw raced.error;
          listId = String(raced.data?.id || '');
        }
      }
      if (!listId && req.method === 'DELETE') {
        return res.status(200).json({ success: true, removed: false });
      }
    }
    if (!validUuid(listId)) return res.status(400).json({ success: false, error: 'Invalid study list id' });
    if (req.method === 'DELETE') {
      const { error } = await ownerDb.from('video_study_list_items').delete().eq('list_id', listId).eq('video_id', videoId);
      if (error) throw error;
      return res.status(200).json({ success: true, removed: true });
    }
    const startSeconds = boundedNumber(req.body?.startSeconds, 86_400);
    const { error } = await ownerDb.from('video_study_list_items').upsert({
      list_id: listId, video_id: videoId,
      note: String(req.body?.note || '').trim().slice(0, 1000) || null,
      start_seconds: startSeconds,
    }, { onConflict: 'list_id,video_id' });
    if (error) throw error;
    return res.status(200).json({ success: true, saved: true });
  } catch (error) {
    console.warn('[video-library/study-list] failed:', error?.message || error);
    return res.status(503).json({ success: false, error: 'Study list is temporarily unavailable' });
  }
}
