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
export const FIRST_LANDING_KEY = 'sp_first_landing_v1';
export const UNLOCK_INTENT_KEY = 'sp_unlock_intent_v1';
const FIELDS = ['utm_source', 'utm_medium', 'utm_campaign'];
const MAX_AGE_MS = 90 * 24 * 60 * 60 * 1000;
const UNLOCK_INTENT_MAX_AGE_MS = 60 * 60 * 1000;

const SEO_SINGLE_PREFIXES = new Set([
  'tools',
  'learn',
  'features',
  'poker-rooms',
  'games',
  'research',
  'compare',
  'rules',
  'glossary',
]);
const SEO_HUB_PREFIXES = new Set(['series', 'venues', 'poker-near-me']);
const PUBLIC_LANDING_SINGLE_PREFIXES = new Set([
  ...SEO_SINGLE_PREFIXES,
  'poker-series',
  'weekend-tournaments',
  'press',
  'facts',
  'authors',
]);
const PUBLIC_LANDING_HUB_PREFIXES = new Set([
  ...SEO_HUB_PREFIXES,
  'wire',
  'magazine',
  'news',
  'article',
  'tours',
  'poker-tools',
  'training',
  'video-library',
]);
const SAFE_SEGMENT_RE = /^[A-Za-z0-9_.-]{1,64}$/;
const SAFE_FIRST_SEGMENT_RE = /^[A-Za-z0-9_.-]{1,40}$/;
const GOOGLE_HOST_RE = /^(?:(?:m|encrypted|search)\.)?google\.[a-z]{2,3}(?:\.[a-z]{2})?$/;
const ANDROID_GOOGLE_APP_RE = /^android-app:\/\/com\.google\.android\.googlequicksearchbox(?:\/|$)/i;

const AI_REFERRER_RULES = [
  { source: 'chatgpt', hosts: ['chatgpt.com', 'chat.openai.com'] },
  { source: 'perplexity', hosts: ['perplexity.ai'] },
  { source: 'claude', hosts: ['claude.ai'] },
  { source: 'gemini', hosts: ['gemini.google.com'] },
  { source: 'copilot', hosts: ['copilot.microsoft.com'] },
];

const SEARCH_REFERRER_RULES = [
  { source: 'bing', hosts: ['bing.com'] },
  { source: 'duckduckgo', hosts: ['duckduckgo.com'] },
  { source: 'yahoo', hosts: ['search.yahoo.com'] },
  { source: 'brave', hosts: ['search.brave.com'] },
  { source: 'ecosia', hosts: ['ecosia.org'] },
];

function hostMatches(host, domain) {
  return host === domain || host.endsWith(`.${domain}`);
}

function classifyReferrer(referrer) {
  if (typeof referrer !== 'string') return null;
  const trimmed = referrer.trim();
  if (!trimmed) return null;

  if (ANDROID_GOOGLE_APP_RE.test(trimmed)) {
    return { utm_source: 'google', utm_medium: 'organic' };
  }

  let host;
  try {
    host = new URL(trimmed).hostname.toLowerCase().replace(/^www\./, '');
  } catch (_) {
    return null;
  }
  if (!host || hostMatches(host, 'smarter.poker')) return null;

  for (const rule of AI_REFERRER_RULES) {
    if (rule.hosts.some((d) => hostMatches(host, d))) {
      return { utm_source: rule.source, utm_medium: 'ai_referral' };
    }
  }

  if (GOOGLE_HOST_RE.test(host)) {
    return { utm_source: 'google', utm_medium: 'organic' };
  }

  for (const rule of SEARCH_REFERRER_RULES) {
    if (rule.hosts.some((d) => hostMatches(host, d))) {
      return { utm_source: rule.source, utm_medium: 'organic' };
    }
  }

  return null;
}

function isSafeSegment(seg, re = SAFE_SEGMENT_RE) {
  return typeof seg === 'string' && seg !== '.' && seg !== '..' && re.test(seg);
}

function isPublicLandingPath(pathname) {
  if (typeof pathname !== 'string') return false;
  const rawSegments = pathname.split('/').filter(Boolean);
  if (rawSegments.length === 0) return false;
  const first = rawSegments[0];
  if (PUBLIC_LANDING_SINGLE_PREFIXES.has(first)) return true;
  if (first === 'hub' && rawSegments.length >= 2 && PUBLIC_LANDING_HUB_PREFIXES.has(rawSegments[1])) {
    return true;
  }
  return false;
}

function sanitizeLandingPath(pathname) {
  if (typeof pathname !== 'string') return '/';
  const rawSegments = pathname.split('/').filter(Boolean);
  if (rawSegments.length === 0) return '/';
  const first = rawSegments[0];
  const isSeoSingle = PUBLIC_LANDING_SINGLE_PREFIXES.has(first);
  const isSeoHub = first === 'hub' && rawSegments.length >= 2 && PUBLIC_LANDING_HUB_PREFIXES.has(rawSegments[1]);
  if (isSeoSingle || isSeoHub) {
    const kept = [];
    for (const seg of rawSegments.slice(0, 3)) {
      if (!isSafeSegment(seg, SAFE_SEGMENT_RE)) break;
      kept.push(seg);
    }
    return kept.length > 0 ? `/${kept.join('/')}` : '/';
  }
  return isSafeSegment(first, SAFE_FIRST_SEGMENT_RE) ? `/${first}` : '/';
}

export function cleanTag(value) {
  if (typeof value !== 'string') return null;
  const v = value.trim().toLowerCase().slice(0, 64);
  return /^[a-z0-9][a-z0-9._-]*$/.test(v) ? v : null;
}

/** Parse a location.search string (or organic/AI referrer) into a first-touch record, or null. */
export function parseFirstTouch(search, pathname, now = Date.now(), referrer = '') {
  let params;
  try {
    params = new URLSearchParams(search || '');
  } catch (_) {
    return null;
  }
  const source = cleanTag(params.get('utm_source'));
  let record;
  if (source) {
    record = { utm_source: source };
    for (const f of FIELDS.slice(1)) {
      const v = cleanTag(params.get(f));
      if (v) record[f] = v;
    }
  } else {
    const inferred = classifyReferrer(referrer);
    if (!inferred) return null;
    record = { utm_source: inferred.utm_source, utm_medium: inferred.utm_medium };
    const campaign = cleanTag(params.get('utm_campaign'));
    if (campaign) record.utm_campaign = campaign;
  }
  // Keep public SEO slugs (up to 3 clean segments) while restricting private
  // paths like /hub/club-arena/invite/* to a single segment so invite codes,
  // usernames and club ids are never stored in attribution.
  record.landing_path = sanitizeLandingPath(pathname);
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

function readStoredLanding(storage, now) {
  try {
    const raw = storage.getItem(FIRST_LANDING_KEY);
    if (!raw) return null;
    const rec = JSON.parse(raw);
    if (!rec || typeof rec.landing_path !== 'string' || !rec.landing_path.startsWith('/')) return null;
    const captured = Date.parse(rec.captured_at || '');
    if (!Number.isFinite(captured) || now - captured > MAX_AGE_MS) return null;
    const safePath = sanitizeLandingPath(rec.landing_path);
    return safePath && safePath !== '/' ? { landing_path: safePath, captured_at: rec.captured_at } : null;
  } catch (_) {
    return null;
  }
}

/** Record recent SEO unlock intent (1-hour TTL, clean tag sanitization). */
export function recordUnlockIntent(
  { unlockKey = '', source = '', experimentVariant = '', aiEngine = '' } = {},
  win = typeof window !== 'undefined' ? window : undefined,
  now = Date.now(),
) {
  try {
    if (!win || !win.localStorage) return null;
    const rec = {};
    const cleanUnlock = cleanTag(unlockKey);
    const cleanSource = cleanTag(source);
    const cleanVariant = cleanTag(experimentVariant);
    const cleanAi = cleanTag(aiEngine);
    if (cleanUnlock) rec.unlock_key = cleanUnlock;
    if (cleanSource) rec.seo_source = cleanSource;
    if (cleanVariant) rec.experiment_variant = cleanVariant;
    if (cleanAi) rec.acquisition_ai_engine = cleanAi;
    if (Object.keys(rec).length === 0) return null;
    rec.captured_at = new Date(now).toISOString();
    win.localStorage.setItem(UNLOCK_INTENT_KEY, JSON.stringify(rec));
    return rec;
  } catch (_) {
    return null;
  }
}

/** Read unexpired SEO unlock intent (1-hour TTL). */
export function readUnlockIntent(
  win = typeof window !== 'undefined' ? window : undefined,
  now = Date.now(),
) {
  try {
    if (!win || !win.localStorage) return null;
    const raw = win.localStorage.getItem(UNLOCK_INTENT_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return null;
    const captured = Date.parse(parsed.captured_at || '');
    if (!Number.isFinite(captured) || now - captured > UNLOCK_INTENT_MAX_AGE_MS || captured - now > FIRST_SIGN_IN_SKEW_MS) {
      return null;
    }
    const out = {};
    const unlockKey = cleanTag(parsed.unlock_key);
    const seoSource = cleanTag(parsed.seo_source);
    const experimentVariant = cleanTag(parsed.experiment_variant);
    const aiEngine = cleanTag(parsed.acquisition_ai_engine);
    if (unlockKey) out.unlock_key = unlockKey;
    if (seoSource) out.seo_source = seoSource;
    if (experimentVariant) out.experiment_variant = experimentVariant;
    if (aiEngine) out.acquisition_ai_engine = aiEngine;
    return Object.keys(out).length > 0 ? out : null;
  } catch (_) {
    return null;
  }
}

/** Record the first tagged or organic/AI landing. Never overwrites an unexpired record. */
export function recordFirstTouch(win = typeof window !== 'undefined' ? window : undefined, now = Date.now()) {
  try {
    if (!win || !win.localStorage || !win.location) return null;
    // Always capture the first sanitized public SEO landing path even when utm_source
    // and document.referrer are empty (iOS Safari, Google App, dark-social landings).
    if (!readStoredLanding(win.localStorage, now) && isPublicLandingPath(win.location.pathname)) {
      const landingPath = sanitizeLandingPath(win.location.pathname);
      if (landingPath && landingPath !== '/') {
        win.localStorage.setItem(
          FIRST_LANDING_KEY,
          JSON.stringify({ landing_path: landingPath, captured_at: new Date(now).toISOString() }),
        );
      }
    }
    const existing = readStored(win.localStorage, now);
    if (existing) return existing;
    const rec = parseFirstTouch(win.location.search, win.location.pathname, now, win.document?.referrer);
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
    const rec =
      readStored(win.localStorage, now) ||
      parseFirstTouch(win.location?.search, win.location?.pathname, now, win.document?.referrer);
    const landing = readStoredLanding(win.localStorage, now);
    const unlock = readUnlockIntent(win, now);
    const out = {};
    if (rec) {
      for (const f of FIELDS) if (rec[f]) out[`acquisition_${f}`] = rec[f];
      out.acquisition_landing_path = rec.landing_path;
      out.acquisition_captured_at = rec.captured_at;
    } else if (landing?.landing_path) {
      out.acquisition_landing_path = landing.landing_path;
    }
    if (unlock) {
      if (unlock.unlock_key) out.unlock_key = unlock.unlock_key;
      if (unlock.seo_source) out.seo_source = unlock.seo_source;
      if (unlock.experiment_variant) out.experiment_variant = unlock.experiment_variant;
      if (unlock.acquisition_ai_engine) out.acquisition_ai_engine = unlock.acquisition_ai_engine;
    }
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
const ATTRIBUTION_PAYLOAD_KEYS = [
  'acquisition_utm_source',
  'acquisition_landing_path',
  'unlock_key',
  'seo_source',
  'experiment_variant',
  'acquisition_ai_engine',
];

/** Return true when metadata contains at least one non-empty attribution signal. */
export function hasAttributionPayload(meta) {
  if (!meta || typeof meta !== 'object' || Array.isArray(meta)) return false;
  for (const key of ATTRIBUTION_PAYLOAD_KEYS) {
    const value = meta[key];
    if (typeof value === 'string' && value.trim().length > 0) return true;
  }
  return false;
}

function newNonce(win) {
  const bytes = new Uint8Array(16);
  const c = (win && win.crypto) || globalThis.crypto;
  if (!c || typeof c.getRandomValues !== 'function') return null;
  c.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Called by the sign-up and login pages immediately before
 * supabase.auth.signInWithOAuth. When this browser holds any attribution signal
 * (UTM/referrer, dark-social landing path, or recent unlock intent), it stores
 * a single-use random nonce and returns it; the page appends it to the OAuth
 * redirectTo as `attr`. Returns null when there is no attribution to bind.
 */
export function beginOAuthAttribution(win = typeof window !== 'undefined' ? window : undefined, now = Date.now()) {
  try {
    if (!win || !win.localStorage) return null;
    if (!hasAttributionPayload(firstTouchMetadata(win, now))) return null;
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
  if (user.user_metadata && (user.user_metadata.acquisition_utm_source || user.user_metadata.acquisition_landing_path)) return null;
  const provider = (user.app_metadata && user.app_metadata.provider) || '';
  if (!provider || provider === 'email' || provider === 'phone') return null;
  const created = Date.parse(user.created_at || '');
  const signedIn = Date.parse(user.last_sign_in_at || '');
  if (!Number.isFinite(created) || !Number.isFinite(signedIn)) return null;
  if (Math.abs(signedIn - created) > FIRST_SIGN_IN_SKEW_MS) return null;
  if (created + FIRST_SIGN_IN_SKEW_MS < started) return null;
  if (now - created > NEW_ACCOUNT_WINDOW_MS || created - now > FIRST_SIGN_IN_SKEW_MS) return null;
  const meta = firstTouchMetadata(win, now);
  return hasAttributionPayload(meta) ? meta : null;
}
