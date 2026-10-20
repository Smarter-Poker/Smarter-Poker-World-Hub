/**
 * GET /api/live/broadcasters?ids=<uuid>,<uuid>,...
 *
 * The broadcaster name and picture shown on /hub/lives, for every visitor.
 *
 * WHY THIS EXISTS (2026-10-20). /hub/lives embedded the broadcaster from
 * public.profiles in its live_streams and scheduled_lives reads. A signed-out
 * visitor reads as `anon`, and anon may SELECT only bio and player_tags on
 * profiles, so every one of those reads failed with 42501 "permission denied
 * for table profiles". The page ignored the error and showed "No Lives Yet"
 * while 11 recordings sat in the table. The profiles grants are deliberate:
 * private columns must not be harvestable, so the fix is not a wider grant.
 *
 * WHAT THIS RETURNS. For each requested id that is the broadcaster of a stream
 * any visitor can already see (a live stream, a posted recording, or an
 * upcoming scheduled live), only id, username, display_name and avatar_url,
 * the same display-safe fields /api/profile/public serves. An id that has no
 * public stream is not looked up at all, so this cannot be used to read
 * arbitrary accounts, and a banned, deleted, disabled or suspended profile is
 * left out as it is on the public profile page.
 */
import { createClient } from '../../../src/lib/supabaseServerClient';
import { applyRateLimit, LIMITS } from '../../../src/lib/apiRateLimit';
import { reportApiError } from '../../../src/lib/apiErrorHandler';

export const BROADCASTER_FIELDS = Object.freeze(['id', 'username', 'display_name', 'avatar_url']);
export const MAX_BROADCASTER_IDS = 60;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const INELIGIBLE_STATUSES = new Set(['banned', 'deleted', 'disabled', 'suspended']);
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

let _supabase = null;
function getSupabase() {
  if (_supabase) return _supabase;
  if (!SUPABASE_URL || !SERVICE_ROLE_KEY) return null;
  _supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);
  return _supabase;
}

/** Distinct lower-case UUIDs from `?ids=`, or null when the input is unusable. */
export function parseBroadcasterIds(value) {
  if (Array.isArray(value) || typeof value !== 'string') return null;
  const ids = [...new Set(value.split(',').map((part) => part.trim().toLowerCase()).filter(Boolean))];
  if (ids.length === 0 || ids.length > MAX_BROADCASTER_IDS) return null;
  if (!ids.every((id) => UUID.test(id))) return null;
  return ids;
}

export function isBroadcasterEligible(row) {
  if (!row?.id) return false;
  const status = typeof row.status === 'string' ? row.status.trim().toLowerCase() : '';
  return !INELIGIBLE_STATUSES.has(status);
}

export function broadcasterSnapshot(row) {
  return Object.fromEntries(BROADCASTER_FIELDS.map((field) => [field, row?.[field] ?? null]));
}

/** The requested ids that broadcast something a visitor can already see. */
async function publicBroadcasterIds(db, ids) {
  const [live, recorded, scheduled] = await Promise.all([
    db.from('live_streams').select('broadcaster_id').in('broadcaster_id', ids).eq('status', 'live'),
    db
      .from('live_streams')
      .select('broadcaster_id')
      .in('broadcaster_id', ids)
      .eq('status', 'ended')
      .eq('is_posted', true)
      .not('video_url', 'is', null),
    db
      .from('scheduled_lives')
      .select('broadcaster_id')
      .in('broadcaster_id', ids)
      .gte('scheduled_at', new Date(Date.now() - 24 * 3600000).toISOString()),
  ]);
  const failed = live.error || recorded.error || scheduled.error;
  if (failed) throw failed;
  const visible = new Set();
  for (const result of [live, recorded, scheduled]) {
    for (const row of result.data || []) {
      if (row?.broadcaster_id) visible.add(String(row.broadcaster_id).toLowerCase());
    }
  }
  return ids.filter((id) => visible.has(id));
}

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ success: false, error: 'Method not allowed' });
  }
  if (!applyRateLimit(req, res, LIMITS.read)) return;

  const ids = parseBroadcasterIds(req.query?.ids);
  if (!ids) {
    res.setHeader('Cache-Control', 'private, no-store, max-age=0');
    return res.status(400).json({ success: false, error: 'Valid broadcaster ids required' });
  }

  try {
    const db = getSupabase();
    if (!db) {
      res.setHeader('Cache-Control', 'private, no-store, max-age=0');
      return res.status(503).json({ success: false, error: 'Broadcasters temporarily unavailable' });
    }

    const visibleIds = await publicBroadcasterIds(db, ids);
    const broadcasters = {};
    if (visibleIds.length > 0) {
      const { data, error } = await db
        .from('profiles')
        .select([...BROADCASTER_FIELDS, 'status'].join(', '))
        .in('id', visibleIds);
      if (error) throw error;
      for (const row of data || []) {
        if (isBroadcasterEligible(row)) broadcasters[String(row.id).toLowerCase()] = broadcasterSnapshot(row);
      }
    }

    // Names and pictures change rarely; a short shared cache keeps a busy
    // lobby from turning every realtime refresh into a database read.
    res.setHeader('Cache-Control', 'public, s-maxage=60, stale-while-revalidate=300');
    return res.status(200).json({ success: true, broadcasters });
  } catch (error) {
    try {
      reportApiError(error, req);
    } catch (_reportError) {}
    res.setHeader('Cache-Control', 'private, no-store, max-age=0');
    return res.status(503).json({ success: false, error: 'Broadcasters temporarily unavailable' });
  }
}
