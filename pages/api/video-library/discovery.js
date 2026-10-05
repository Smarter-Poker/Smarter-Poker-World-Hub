import { createClient } from '../../../src/lib/supabaseServerClient';
import { applyRateLimit, LIMITS } from '../../../src/lib/apiRateLimit';
import { getServerUserWithFallback } from '../../../src/lib/serverAuth';
import { isVideoLibraryVideoAllowed } from '../../../src/lib/videoLibraryAvailability';
import {
  chronologicalVideos,
  learningActions,
  normalizeSeenIds,
  organicAnalyticsEligible,
  rankLearningVideos,
  searchTerms,
} from '../../../src/lib/videoLearningContract.mjs';

const VIDEO_FIELDS = 'youtube_video_id, source_id, source_name, type, title, thumbnail_url, views_text, views_count, duration, published_at, scraped_at, tags, availability_status, embeddable, availability_checked_at, attribution_name, attribution_url, disclosure_kind, sponsor_name, made_for_kids';
const MAX_CANDIDATES = 240;
let client;
const supabase = () => client ||= createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const one = (value) => Array.isArray(value) ? value[0] : value;
const limitOf = (value) => Math.max(1, Math.min(60, Number.parseInt(one(value), 10) || 30));

function video(row) {
  return {
    id: row.youtube_video_id, videoId: row.youtube_video_id, source: row.source_id,
    sourceName: row.attribution_name || row.source_name || row.source_id,
    attributionName: row.attribution_name || row.source_name || row.source_id,
    attributionUrl: row.attribution_url || null,
    disclosureKind: row.disclosure_kind || 'organic', sponsorName: row.sponsor_name || null,
    madeForKids: row.made_for_kids ?? null, type: row.type || 'cash', title: row.title,
    thumbnail: row.thumbnail_url, views: row.views_text, viewsCount: Number(row.views_count || 0),
    duration: row.duration || '', publishedAt: row.published_at, scrapedAt: row.scraped_at,
    tags: Array.isArray(row.tags) ? row.tags : [], availabilityStatus: row.availability_status,
    embeddable: row.embeddable === true, availabilityCheckedAt: row.availability_checked_at,
  };
}

function getBearerToken(req) {
  const header = Array.isArray(req.headers.authorization) ? req.headers.authorization[0] : req.headers.authorization;
  return String(header || '').match(/^Bearer\s+(.+)$/i)?.[1]?.trim() || null;
}

function userClient(token) {
  if (!token) return null;
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: `Bearer ${token}` } },
  });
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'private, no-store');
  res.setHeader('Vary', 'Authorization');
  if (req.method !== 'GET') return res.status(405).json({ success: false, error: 'Method not allowed' });
  if (!applyRateLimit(req, res, LIMITS.read)) return;
  try {
    const db = supabase();
    const { user } = await getServerUserWithFallback(req, db);
    const expectedOwnerId = String(one(req.query.ownerId) || '').trim();
    if (expectedOwnerId && user?.id !== expectedOwnerId) {
      return res.status(409).json({ success: false, error: 'Account changed; retry the request' });
    }
    const ownerDb = userClient(getBearerToken(req));
    const profileResult = user?.id
      ? await db.from('profiles').select('id, is_horse').eq('id', user.id).maybeSingle()
      : { data: null };
    const organicEligible = organicAnalyticsEligible(profileResult.data);
    const mode = one(req.query.mode) === 'chronological' ? 'chronological' : 'recommended';
    const queryText = String(one(req.query.q) || '').trim().slice(0, 120);
    const seenIds = new Set(normalizeSeenIds(one(req.query.seen)));
    const searchQuery = queryText || String(one(req.query.goals) || '').trim().slice(0, 120);
    const searchDb = ownerDb || db;
    const { data: matches, error: searchError } = await searchDb.rpc('search_video_learning', {
      p_query: searchQuery,
      p_query_embedding: null,
      p_limit: Math.min(MAX_CANDIDATES, 50),
    });
    if (searchError) throw searchError;
    const internalIds = (matches || []).map((match) => match.video_id);
    let videos = [];
    if (internalIds.length) {
      const { data: rows, error: catalogError } = await db.from('video_library_videos')
        .select(`id, ${VIDEO_FIELDS}`).in('id', internalIds);
      if (catalogError) throw catalogError;
      const byId = new Map((rows || []).map((row) => [row.id, row]));
      videos = (matches || []).map((match) => {
        const row = byId.get(match.video_id);
        return row ? {
          ...video(row),
          internalVideoId: row.id,
          concepts: String(match.concepts || '').split(/\s+/).filter(Boolean),
          chapters: match.chapters ? [{ title: match.chapters }] : [],
          semanticRank: Number(match.rank || 0),
          semanticDistance: match.semantic_distance == null ? null : Number(match.semantic_distance),
        } : null;
      }).filter(Boolean).filter(isVideoLibraryVideoAllowed);
    }

    let progressById = {};
    let savedIds = new Set();
    if (user?.id && organicEligible && ownerDb) {
      const [progress, saved] = await Promise.all([
        ownerDb.from('video_learning_progress').select('video_id, position_seconds, duration_seconds').limit(500),
        ownerDb.from('video_study_list_items').select('video_id, video_study_lists!inner(user_id)').limit(500),
      ]);
      if (progress.error || saved.error) throw progress.error || saved.error;
      progressById = Object.fromEntries((progress.data || []).map((row) => [row.video_id, {
        progressSeconds: Number(row.position_seconds || 0),
        completion: row.duration_seconds ? Number(row.position_seconds || 0) / Number(row.duration_seconds) : 0,
      }]));
      savedIds = new Set((saved.data || []).map((row) => row.video_id));
    }
    const source = String(one(req.query.source) || '').trim().toUpperCase().slice(0, 48);
    const type = String(one(req.query.type) || '').trim().toLowerCase().slice(0, 32);
    videos = videos.filter((item) => (source && source !== 'ALL' ? item.source === source : true)
      && (type && type !== 'all' ? item.type === type : true));
    const publicProgress = Object.fromEntries(videos.map((item) => [item.id, progressById[item.internalVideoId]]).filter(([, value]) => value));
    const publicSaved = new Set(videos.filter((item) => savedIds.has(item.internalVideoId)).map((item) => item.id));
    const context = { query: queryText, seenIds, savedIds: publicSaved, progressById: publicProgress, learningGoals: searchTerms(one(req.query.goals)) };
    const ordered = mode === 'chronological' ? chronologicalVideos(videos) : rankLearningVideos(videos, context);
    const page = ordered.slice(0, limitOf(req.query.limit)).map((item) => ({
      ...item,
      recommendationReasons: mode === 'chronological' ? ['Newest verified lesson'] : item.recommendationReasons,
      learning: learningActions(item, publicProgress[item.id]),
    }));
    return res.status(200).json({
      success: true,
      data: page,
      ranking: { mode, chronologicalAlternative: true, personalized: Boolean(user?.id && organicEligible) },
      session: { seenAccepted: seenIds.size, nextSeen: normalizeSeenIds([...seenIds, ...page.map((item) => item.id)]) },
      analytics: { organicEligible },
      ownerId: user?.id || null,
      pagination: { limit: page.length, offset: 0, total: ordered.length, nextOffset: page.length, hasMore: false },
    });
  } catch (error) {
    console.warn('[video-library/discovery] failed:', error?.message || error);
    return res.status(503).json({ success: false, error: 'Learning discovery is temporarily unavailable' });
  }
}
