/**
 * First-touch acquisition attribution.
 *
 * LinkedIn and Reddit links carry utm_source / utm_medium / utm_campaign, but
 * until 2026-11-11 nothing on the site recorded them: Vercel Web Analytics is
 * not enabled for hub-vanguard, and PostHog only loads on the sign-up and
 * login pages, by which time the landing URL is gone. So a campaign tag was
 * thrown away on the first click.
 *
 * This keeps the FIRST tagged landing in localStorage (later visits never
 * overwrite it) and hands it to supabase.auth.signUp as user metadata, which
 * persists on auth.users.raw_user_meta_data. Signups by channel are then a
 * plain query, e.g.
 *   select raw_user_meta_data->>'acquisition_utm_source', count(*)
 *   from auth.users group by 1;
 *
 * Only the three campaign tags, the landing path and the capture time are
 * kept. Values are restricted to a short safe alphabet so nothing a link
 * author types can carry markup or personal data into the account record.
 */

export const FIRST_TOUCH_KEY = 'sp_first_touch_v1';
const FIELDS = ['utm_source', 'utm_medium', 'utm_campaign'];
const MAX_AGE_MS = 90 * 24 * 60 * 60 * 1000;

export function cleanTag(value) {
  if (typeof value !== 'string') return null;
  const v = value.trim().toLowerCase().slice(0, 64);
  return /^[a-z0-9][a-z0-9._-]*$/.test(v) ? v : null;
}

/** Parse a location.search string into a first-touch record, or null. */
export function parseFirstTouch(search, pathname, now = Date.now()) {
  let params;
  try {
    params = new URLSearchParams(search || '');
  } catch (_) {
    return null;
  }
  const source = cleanTag(params.get('utm_source'));
  if (!source) return null;
  const record = { utm_source: source };
  for (const f of FIELDS.slice(1)) {
    const v = cleanTag(params.get(f));
    if (v) record[f] = v;
  }
  const path = typeof pathname === 'string' && /^\/[A-Za-z0-9/_.-]{0,120}$/.test(pathname) ? pathname : '/';
  record.landing_path = path;
  record.captured_at = new Date(now).toISOString();
  return record;
}

function readStored(storage, now) {
  try {
    const raw = storage.getItem(FIRST_TOUCH_KEY);
    if (!raw) return null;
    const rec = JSON.parse(raw);
    if (!rec || !cleanTag(rec.utm_source)) return null;
    if (now - Date.parse(rec.captured_at) > MAX_AGE_MS) return null;
    return rec;
  } catch (_) {
    return null;
  }
}

/** Record the first tagged landing. Never overwrites an unexpired record. */
export function recordFirstTouch(win = typeof window !== 'undefined' ? window : undefined, now = Date.now()) {
  try {
    if (!win || !win.localStorage || !win.location) return null;
    const existing = readStored(win.localStorage, now);
    if (existing) return existing;
    const rec = parseFirstTouch(win.location.search, win.location.pathname, now);
    if (rec) win.localStorage.setItem(FIRST_TOUCH_KEY, JSON.stringify(rec));
    return rec;
  } catch (_) {
    return null;
  }
}

/** Metadata keys merged into supabase.auth.signUp options.data. */
export function firstTouchMetadata(win = typeof window !== 'undefined' ? window : undefined, now = Date.now()) {
  try {
    if (!win || !win.localStorage) return {};
    const rec = readStored(win.localStorage, now) || parseFirstTouch(win.location?.search, win.location?.pathname, now);
    if (!rec) return {};
    const out = {};
    for (const f of FIELDS) if (rec[f]) out[`acquisition_${f}`] = rec[f];
    out.acquisition_landing_path = rec.landing_path;
    out.acquisition_captured_at = rec.captured_at;
    return out;
  } catch (_) {
    return {};
  }
}

const NEW_ACCOUNT_WINDOW_MS = 30 * 60 * 1000;

/**
 * Google (OAuth) sign-ups never pass through supabase.auth.signUp, so they
 * cannot carry acquisition metadata at creation. The auth callback calls this
 * with the signed-in user: it returns the metadata to write ONLY for an
 * account created in the last 30 minutes that has none yet, so an existing
 * player signing in from a tagged link is never re-attributed.
 */
export function attributionForNewAccount(user, win = typeof window !== 'undefined' ? window : undefined, now = Date.now()) {
  if (!user || typeof user !== 'object') return null;
  if (user.user_metadata && user.user_metadata.acquisition_utm_source) return null;
  const created = Date.parse(user.created_at || '');
  if (!Number.isFinite(created) || now - created > NEW_ACCOUNT_WINDOW_MS || created - now > 60 * 1000) return null;
  const meta = firstTouchMetadata(win, now);
  return meta.acquisition_utm_source ? meta : null;
}
