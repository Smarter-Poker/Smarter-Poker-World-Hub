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
export const OAUTH_INTENT_KEY = 'sp_oauth_attribution_intent_v1';
const OAUTH_INTENT_MAX_AGE_MS = 60 * 60 * 1000;
const NONCE_RE = /^[a-f0-9]{32}$/;

function newNonce(win) {
  const bytes = new Uint8Array(16);
  const c = (win && win.crypto) || globalThis.crypto;
  if (!c || typeof c.getRandomValues !== 'function') return null;
  c.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Called by the sign-up and login pages immediately before
 * supabase.auth.signInWithOAuth. When this browser holds a first touch, it
 * stores a single-use random nonce and returns it; the page appends it to the
 * OAuth redirectTo as `attr`. Returns null when there is no campaign to bind.
 */
export function beginOAuthAttribution(win = typeof window !== 'undefined' ? window : undefined, now = Date.now()) {
  try {
    if (!win || !win.localStorage) return null;
    if (!firstTouchMetadata(win, now).acquisition_utm_source) return null;
    const nonce = newNonce(win);
    if (!nonce) return null;
    win.localStorage.setItem(OAUTH_INTENT_KEY, JSON.stringify({ nonce, started_at: new Date(now).toISOString() }));
    return nonce;
  } catch (_) {
    return null;
  }
}

/** Append the attribution nonce to an OAuth redirect URL. */
export function withAttributionNonce(url, nonce) {
  if (!nonce || !NONCE_RE.test(nonce)) return url;
  return `${url}${url.includes('?') ? '&' : '?'}attr=${nonce}`;
}

function consumeIntent(win) {
  try {
    const raw = win.localStorage.getItem(OAUTH_INTENT_KEY);
    win.localStorage.removeItem(OAUTH_INTENT_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch (_) {
    return null;
  }
}

/**
 * Google (OAuth) sign-ups never pass through supabase.auth.signUp, so the auth
 * callback writes their attribution. It returns metadata ONLY when:
 *   - FLOW BINDING (exact): the callback URL carries `attr` equal to the
 *     single-use nonce this browser stored when it started this OAuth flow,
 *     within the last hour. The stored nonce is consumed on the first callback,
 *     so a retry, another tab, another browser, an ordinary login started
 *     elsewhere, or an older flow can never attach the campaign.
 *   - NEW ACCOUNT (timing heuristic): the provider is not email, and
 *     last_sign_in_at is within 60 s of created_at with the account under
 *     10 minutes old, which is how GoTrue stamps the sign-in that creates an
 *     OAuth user; every later sign-in moves last_sign_in_at.
 *   - No attribution is recorded yet.
 * Limits are documented in AGENTS.md: the newness test is a heuristic, and the
 * campaign itself is the browser's first tagged landing (first-touch model).
 */
export function attributionForNewAccount(user, win = typeof window !== 'undefined' ? window : undefined, now = Date.now(), urlNonce = null) {
  if (!win || !win.localStorage) return null;
  const intent = consumeIntent(win);
  if (!user || typeof user !== 'object') return null;
  if (typeof urlNonce !== 'string' || !NONCE_RE.test(urlNonce)) return null;
  if (!intent || intent.nonce !== urlNonce) return null;
  const started = Date.parse(intent.started_at || '');
  if (!Number.isFinite(started) || now - started > OAUTH_INTENT_MAX_AGE_MS || started - now > FIRST_SIGN_IN_SKEW_MS) return null;
  if (user.user_metadata && user.user_metadata.acquisition_utm_source) return null;
  const provider = (user.app_metadata && user.app_metadata.provider) || '';
  if (!provider || provider === 'email' || provider === 'phone') return null;
  const created = Date.parse(user.created_at || '');
  const signedIn = Date.parse(user.last_sign_in_at || '');
  if (!Number.isFinite(created) || !Number.isFinite(signedIn)) return null;
  if (Math.abs(signedIn - created) > FIRST_SIGN_IN_SKEW_MS) return null;
  if (created + FIRST_SIGN_IN_SKEW_MS < started) return null;
  if (now - created > NEW_ACCOUNT_WINDOW_MS || created - now > FIRST_SIGN_IN_SKEW_MS) return null;
  const meta = firstTouchMetadata(win, now);
  return meta.acquisition_utm_source ? meta : null;
}
