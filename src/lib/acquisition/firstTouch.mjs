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
  // Only the first path segment: deeper segments can hold an invite code,
  // a username or a club id, none of which belong in attribution.
  const first = typeof pathname === 'string' ? pathname.split('/')[1] || '' : '';
  record.landing_path = /^[A-Za-z0-9_.-]{1,40}$/.test(first) ? `/${first}` : '/';
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

const NEW_ACCOUNT_WINDOW_MS = 10 * 60 * 1000;
const FIRST_SIGN_IN_SKEW_MS = 60 * 1000;

/**
 * Google (OAuth) sign-ups never pass through supabase.auth.signUp, so they
 * cannot carry acquisition metadata at creation. The auth callback calls this
 * with the signed-in user. It returns metadata to write ONLY when this
 * callback is the sign-in that created the account:
 *   - the provider is not email (email accounts carry it from signUp);
 *   - last_sign_in_at is within 60 s of created_at, which GoTrue sets in the
 *     same request that creates an OAuth user and moves on every later
 *     sign-in, so an existing player (even one created minutes ago) fails;
 *   - the account is under 10 minutes old;
 *   - it has no attribution yet, so a repeated callback writes nothing new.
 */
export function attributionForNewAccount(user, win = typeof window !== 'undefined' ? window : undefined, now = Date.now()) {
  if (!user || typeof user !== 'object') return null;
  if (user.user_metadata && user.user_metadata.acquisition_utm_source) return null;
  const provider = (user.app_metadata && user.app_metadata.provider) || '';
  if (!provider || provider === 'email' || provider === 'phone') return null;
  const created = Date.parse(user.created_at || '');
  const signedIn = Date.parse(user.last_sign_in_at || '');
  if (!Number.isFinite(created) || !Number.isFinite(signedIn)) return null;
  if (Math.abs(signedIn - created) > FIRST_SIGN_IN_SKEW_MS) return null;
  if (now - created > NEW_ACCOUNT_WINDOW_MS || created - now > FIRST_SIGN_IN_SKEW_MS) return null;
  const meta = firstTouchMetadata(win, now);
  return meta.acquisition_utm_source ? meta : null;
}
