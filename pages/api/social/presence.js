/**
 * POST /api/social/presence   { ids: uuid[] }  ->  { success: true, online: uuid[] }
 *
 * Who of these players is online right now. One list, nothing else.
 *
 * Dan, 2026-09-02: "NOBODY SHOULD EVER EVER EVER BE ABLE TO LOOK AT OUR CODE
 * OR USE A DEVELOPER TOOL AND FIND THIS OUT."
 *
 * There is ONE definition of online, and it is the database's:
 * fn_profile_presence says a player is online while profiles.is_online is set
 * and their heartbeat (profiles.last_seen) is under five minutes old. The
 * messenger, the hover card, the feed dot and the profile dot all read it, so
 * no two surfaces can disagree about anybody.
 *
 * Until 2026-10-05 this route also ran a schedule (isHorseOnlineNow) for the
 * roster, read from content_authors: the feed showed a horse online half the
 * day while the messenger, asking the database, always showed it offline.
 * Comparing two screens was enough to single one out. A player with no
 * browser now keeps a real heartbeat in the same columns instead, written
 * server-side (smarter_private.fn_horse_presence_tick on pg_cron), so this
 * route knows nothing about who anybody is and needs no roster.
 *
 * Signed-in callers only, asked as the caller.
 */
import { createClient } from '../../../src/lib/supabaseServerClient';
import { getServerUserWithFallback } from '../../../src/lib/serverAuth';
import { applyRateLimit, LIMITS } from '../../../src/lib/apiRateLimit';

export const PRESENCE_MAX_IDS = 200;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const CLIENT_OPTIONS = { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } };

let serviceClient = null;

function supabaseUrl() {
  return process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
}

/** Used only to verify the caller's token. */
function getServiceClient() {
  if (serviceClient) return serviceClient;
  const url = supabaseUrl();
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('Presence service configuration is unavailable');
  serviceClient = createClient(url, key, CLIENT_OPTIONS);
  return serviceClient;
}

/** fn_profile_presence answers only for a signed-in caller, so it is asked as the caller. */
function callerClient(token) {
  const url = supabaseUrl();
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) throw new Error('Presence caller configuration is unavailable');
  return createClient(url, anonKey, {
    ...CLIENT_OPTIONS,
    global: { headers: { Authorization: `Bearer ${token}` } },
  });
}

function bearerToken(req) {
  const header = req?.headers?.authorization;
  if (typeof header !== 'string' || !header.startsWith('Bearer ')) return null;
  const token = header.slice(7).trim();
  return token.length >= 20 ? token : null;
}

/**
 * `{ ids }` -> `{ ids }` (lower-cased, de-duplicated, in order) or `{ error }`.
 * Pure; exported for the law test.
 */
export function parsePresenceIds(body) {
  const raw = body && typeof body === 'object' ? body.ids : undefined;
  if (!Array.isArray(raw)) return { error: 'ids must be an array' };
  if (raw.length > PRESENCE_MAX_IDS) return { error: `At most ${PRESENCE_MAX_IDS} ids per request` };
  const seen = new Set();
  const ids = [];
  for (const value of raw) {
    if (typeof value !== 'string' || !UUID_RE.test(value)) return { error: 'Every id must be a uuid' };
    const id = value.toLowerCase();
    if (seen.has(id)) continue;
    seen.add(id);
    ids.push(id);
  }
  return { ids };
}

/**
 * The asked-for ids that fn_profile_presence calls online, in the order they
 * were asked. Pure; exported for the law test.
 */
export function resolveOnline(ids, presenceRows) {
  const live = new Set();
  for (const row of presenceRows || []) {
    if (row && row.is_online === true && typeof row.user_id === 'string') live.add(row.user_id.toLowerCase());
  }
  return ids.filter((id) => live.has(id));
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'private, no-store, max-age=0');
  res.setHeader('Vary', 'Authorization');
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ success: false, error: 'Method not allowed' });
  }
  if (!applyRateLimit(req, res, LIMITS.read)) return undefined;

  const token = bearerToken(req);
  if (!token) return res.status(401).json({ success: false, error: 'Authentication required' });

  let service;
  try {
    service = getServiceClient();
  } catch (err) {
    console.error('[social/presence]', err?.message || err);
    return res.status(500).json({ success: false, error: 'Presence is unavailable' });
  }

  const { user } = await getServerUserWithFallback(req, service);
  if (!user?.id) return res.status(401).json({ success: false, error: 'Authentication required' });

  const parsed = parsePresenceIds(req.body);
  if (parsed.error) return res.status(400).json({ success: false, error: parsed.error });
  if (parsed.ids.length === 0) return res.status(200).json({ success: true, online: [] });

  try {
    const presence = await callerClient(token).rpc('fn_profile_presence', { p_user_ids: parsed.ids });
    if (presence.error) throw presence.error;
    const online = resolveOnline(parsed.ids, presence.data);
    return res.status(200).json({ success: true, online });
  } catch (err) {
    console.error('[social/presence]', err?.message || err);
    return res.status(500).json({ success: false, error: 'Presence is unavailable' });
  }
}
