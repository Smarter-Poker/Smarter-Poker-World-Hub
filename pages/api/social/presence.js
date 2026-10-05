/**
 * POST /api/social/presence   { ids: uuid[] }  ->  { success: true, online: uuid[] }
 *
 * Who of these players is online right now. One list, nothing else.
 *
 * Dan, 2026-09-02: "NOBODY SHOULD EVER EVER EVER BE ABLE TO LOOK AT OUR CODE
 * OR USE A DEVELOPER TOOL AND FIND THIS OUT."
 *
 * The social feed and the profile page used to work this out in the browser:
 * they downloaded every content_authors.profile_id and drew the green dot only
 * for an id on that list whose schedule said "awake". The download was the
 * roster, and a dot only roster members could ever get was a label on every
 * post. Presence is answered here now, for everyone, the same way:
 *
 *   - a player is online when fn_profile_presence says so (is_online with a
 *     heartbeat under five minutes old, the definition the messenger uses);
 *   - a player with no browser keeps a heartbeat through its schedule, so it
 *     is also online while isHorseOnlineNow says it is awake.
 *
 * The response never says which rule matched. It is one `online` list in the
 * order the ids were asked for, and both sources must answer or nobody is
 * online: a half answer (schedule only) would draw the dot on exactly the
 * accounts it must never single out.
 *
 * Signed-in callers only. The roster is read with the service role, which is
 * the only role that will be able to read it.
 */
import { createClient } from '../../../src/lib/supabaseServerClient';
import { getServerUserWithFallback } from '../../../src/lib/serverAuth';
import { applyRateLimit, LIMITS } from '../../../src/lib/apiRateLimit';
import { isHorseOnlineNow } from '../../../src/lib/horsePresence';

export const PRESENCE_MAX_IDS = 200;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const CLIENT_OPTIONS = { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } };

let serviceClient = null;

function supabaseUrl() {
  return process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
}

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
 * The one answer: the asked-for ids that are online by either rule, in the
 * order they were asked. Pure; exported for the law test.
 */
export function resolveOnline(ids, presenceRows, scheduledRows, isScheduledOnline) {
  const live = new Set();
  for (const row of presenceRows || []) {
    if (row && row.is_online === true && typeof row.user_id === 'string') live.add(row.user_id.toLowerCase());
  }
  const scheduled = new Set();
  for (const row of scheduledRows || []) {
    const id = typeof row?.profile_id === 'string' ? row.profile_id.toLowerCase() : null;
    if (id && isScheduledOnline(id)) scheduled.add(id);
  }
  return ids.filter((id) => live.has(id) || scheduled.has(id));
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
    const [presence, scheduled] = await Promise.all([
      callerClient(token).rpc('fn_profile_presence', { p_user_ids: parsed.ids }),
      service
        .from('content_authors')
        .select('profile_id')
        .eq('is_active', true)
        .in('profile_id', parsed.ids),
    ]);
    // Both or nothing. See the header: a schedule-only answer is a label.
    if (presence.error) throw presence.error;
    if (scheduled.error) throw scheduled.error;
    const online = resolveOnline(parsed.ids, presence.data, scheduled.data, isHorseOnlineNow);
    return res.status(200).json({ success: true, online });
  } catch (err) {
    console.error('[social/presence]', err?.message || err);
    return res.status(500).json({ success: false, error: 'Presence is unavailable' });
  }
}
