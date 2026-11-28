/**
 * Zero-PII Organic SEO & Conversion Funnel Signup Attribution Summary.
 *
 * Classifies Supabase Auth signup metadata (`raw_user_meta_data` or `user_metadata`)
 * into six acquisition channels, separates OAuth (`google`, `facebook`) from `email`,
 * and aggregates top landing pages and unlock gates strictly as aggregate counts.
 *
 * Privacy guarantee: emails, names, user IDs, phone numbers, invite codes, and
 * arbitrary untrusted strings are NEVER emitted in the returned summary.
 */

export const ATTRIBUTION_CHANNELS = Object.freeze([
  'organic_google',
  'organic_bing',
  'organic_ai',
  'referral',
  'paid_or_utm',
  'direct',
]);

const AI_ENGINE_ALIASES = Object.freeze({
  chatgpt: 'chatgpt',
  'chatgpt.com': 'chatgpt',
  openai: 'chatgpt',
  perplexity: 'perplexity',
  'perplexity.ai': 'perplexity',
  claude: 'claude',
  'claude.ai': 'claude',
  anthropic: 'claude',
  gemini: 'gemini',
  'gemini.google.com': 'gemini',
  bard: 'gemini',
  copilot: 'copilot',
  'copilot.microsoft.com': 'copilot',
  grok: 'grok',
  'grok.com': 'grok',
  xai: 'grok',
  meta_ai: 'meta_ai',
  'meta-ai': 'meta_ai',
  'meta.ai': 'meta_ai',
  you: 'you',
  'you.com': 'you',
  youcom: 'you',
  phind: 'phind',
  'phind.com': 'phind',
  kagi: 'kagi',
  'kagi.com': 'kagi',
  deepseek: 'deepseek',
  'deepseek.com': 'deepseek',
  mistral: 'mistral',
  'mistral.ai': 'mistral',
  ai_search: 'other_ai',
});

const AI_HOST_RULES = Object.freeze([
  { engine: 'chatgpt', hosts: ['chatgpt.com', 'chat.openai.com'] },
  { engine: 'perplexity', hosts: ['perplexity.ai', 'labs.perplexity.ai'] },
  { engine: 'claude', hosts: ['claude.ai'] },
  { engine: 'gemini', hosts: ['gemini.google.com', 'bard.google.com', 'aistudio.google.com'] },
  { engine: 'copilot', hosts: ['copilot.microsoft.com', 'edgeservices.bing.com'] },
  { engine: 'grok', hosts: ['grok.com', 'x.ai'] },
  { engine: 'meta_ai', hosts: ['meta.ai'] },
  { engine: 'you', hosts: ['you.com'] },
  { engine: 'phind', hosts: ['phind.com'] },
  { engine: 'kagi', hosts: ['kagi.com'] },
  { engine: 'deepseek', hosts: ['chat.deepseek.com', 'deepseek.com'] },
  { engine: 'mistral', hosts: ['chat.mistral.ai', 'mistral.ai'] },
]);

const PAID_MEDIUMS = new Set([
  'cpc',
  'ppc',
  'paid',
  'paid_search',
  'paid_social',
  'display',
  'banner',
  'cpm',
  'ad',
  'ads',
  'sponsored',
  'affiliate',
]);

const OTHER_ORGANIC_SEARCH_SOURCES = new Set([
  'duckduckgo',
  'yahoo',
  'brave',
  'ecosia',
]);

const GOOGLE_HOST_RE = /^(?:(?:m|encrypted|search)\.)?google\.[a-z]{2,3}(?:\.[a-z]{2})?$/;
const BING_HOST_RE = /^(?:(?:www|m|cn)\.)?bing\.com$/;
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
  'poker-series',
  'freerolls',
]);
const SEO_HUB_PREFIXES = new Set(['series', 'venues', 'poker-near-me', 'poker-series', 'poker-tours']);
const SAFE_SEGMENT_RE = /^[A-Za-z0-9_.-]{1,64}$/;
const SAFE_FIRST_SEGMENT_RE = /^[A-Za-z0-9_.-]{1,40}$/;
const SAFE_UNLOCK_KEY_RE = /^[a-z0-9][a-z0-9._:-]{0,63}$/;
const UUID_LIKE_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function cleanLower(value) {
  if (typeof value !== 'string') return '';
  return value.trim().toLowerCase();
}

function hostMatches(host, domain) {
  return host === domain || host.endsWith(`.${domain}`);
}

function parseReferrerHost(referrer) {
  if (typeof referrer !== 'string' || !referrer.trim()) return '';
  const trimmed = referrer.trim();
  if (/^android-app:\/\/com\.google\.android\.googlequicksearchbox(?:\/|$)/i.test(trimmed)) {
    return 'google.com';
  }
  try {
    return new URL(trimmed).hostname.toLowerCase().replace(/^www\./, '');
  } catch {
    return '';
  }
}

function detectAiEngineFromHost(host) {
  if (!host) return null;
  for (const rule of AI_HOST_RULES) {
    if (rule.hosts.some((domain) => hostMatches(host, domain))) {
      return rule.engine;
    }
  }
  return null;
}

function extractUserMeta(user) {
  if (!user || typeof user !== 'object') return {};
  const rawMeta =
    user.raw_user_meta_data && typeof user.raw_user_meta_data === 'object'
      ? user.raw_user_meta_data
      : null;
  const userMeta =
    user.user_metadata && typeof user.user_metadata === 'object'
      ? user.user_metadata
      : null;
  if (rawMeta && userMeta) {
    return { ...userMeta, ...rawMeta };
  }
  return rawMeta || userMeta || {};
}

function extractAppMeta(user) {
  if (!user || typeof user !== 'object') return {};
  const rawApp =
    user.raw_app_meta_data && typeof user.raw_app_meta_data === 'object'
      ? user.raw_app_meta_data
      : null;
  const appMeta =
    user.app_metadata && typeof user.app_metadata === 'object'
      ? user.app_metadata
      : null;
  if (rawApp && appMeta) {
    return { ...appMeta, ...rawApp };
  }
  return rawApp || appMeta || {};
}

export function sanitizeAttributionLandingPath(rawPath) {
  if (typeof rawPath !== 'string') return null;
  const stripped = rawPath.trim().split(/[?#]/)[0];
  if (!stripped || !stripped.startsWith('/')) return null;
  if (stripped.includes('@') || stripped.includes('..')) return null;
  const segments = stripped.split('/').filter(Boolean);
  if (segments.length === 0) return '/';
  const first = segments[0];
  if (UUID_LIKE_RE.test(first)) return null;
  const isSeoSingle = SEO_SINGLE_PREFIXES.has(first);
  const isSeoHub = first === 'hub' && segments.length >= 2 && SEO_HUB_PREFIXES.has(segments[1]);
  if (isSeoSingle || isSeoHub) {
    const kept = [];
    for (const seg of segments.slice(0, 3)) {
      if (!SAFE_SEGMENT_RE.test(seg) || seg === '.' || seg === '..' || UUID_LIKE_RE.test(seg)) break;
      kept.push(seg);
    }
    return kept.length > 0 ? `/${kept.join('/')}` : '/';
  }
  if (!SAFE_FIRST_SEGMENT_RE.test(first) || first === '.' || first === '..') return null;
  return `/${first}`;
}

export function sanitizeAttributionUnlockKey(rawKey) {
  if (typeof rawKey !== 'string') return null;
  const cleaned = rawKey.trim().toLowerCase();
  if (!cleaned || cleaned.includes('@') || UUID_LIKE_RE.test(cleaned)) return null;
  return SAFE_UNLOCK_KEY_RE.test(cleaned) ? cleaned : null;
}

/**
 * Classify a single user's metadata into one of the 6 canonical channels:
 *   organic_google | organic_bing | organic_ai | referral | paid_or_utm | direct
 */
export function classifySignupChannel(meta = {}) {
  const m = meta && typeof meta === 'object' ? meta : {};
  const utmSource = cleanLower(m.acquisition_utm_source || m.utm_source || '');
  const utmMedium = cleanLower(m.acquisition_utm_medium || m.utm_medium || '');
  const utmCampaign = cleanLower(m.acquisition_utm_campaign || m.utm_campaign || '');
  const signupSource = cleanLower(m.signup_source || '');
  const aiEngineTag = cleanLower(m.acquisition_ai_engine || m.ai_engine || '');
  const referrerHost = parseReferrerHost(m.acquisition_referrer || m.referrer || '');
  const hasPlayerReferral = Boolean(
    cleanLower(String(m.referral_player_number || '')) ||
      cleanLower(String(m.referred_by || '')) ||
      cleanLower(String(m.club_invite_code || '')),
  );

  // Explicit paid/ad mediums always classify as paid_or_utm even if source is google/bing.
  if (utmMedium && PAID_MEDIUMS.has(utmMedium)) {
    return { channel: 'paid_or_utm', aiEngine: null };
  }

  // AI search / answer-engine referrals take precedence over generic Google/Bing matching.
  const mappedAiSource = AI_ENGINE_ALIASES[utmSource] || AI_ENGINE_ALIASES[aiEngineTag] || null;
  const hostAiEngine = detectAiEngineFromHost(referrerHost);
  if (
    utmMedium === 'ai_referral' ||
    utmMedium === 'ai' ||
    utmMedium === 'geo' ||
    mappedAiSource ||
    hostAiEngine
  ) {
    return {
      channel: 'organic_ai',
      aiEngine: mappedAiSource || hostAiEngine || 'other_ai',
    };
  }

  // Organic Google search.
  const isGoogleSource = utmSource === 'google' || GOOGLE_HOST_RE.test(utmSource);
  if (isGoogleSource && (!utmMedium || utmMedium === 'organic' || utmMedium === 'seo')) {
    return { channel: 'organic_google', aiEngine: null };
  }
  if (!utmSource && GOOGLE_HOST_RE.test(referrerHost)) {
    return { channel: 'organic_google', aiEngine: null };
  }

  // Organic Bing search.
  const isBingSource = utmSource === 'bing' || BING_HOST_RE.test(utmSource);
  if (isBingSource && (!utmMedium || utmMedium === 'organic' || utmMedium === 'seo')) {
    return { channel: 'organic_bing', aiEngine: null };
  }
  if (!utmSource && BING_HOST_RE.test(referrerHost)) {
    return { channel: 'organic_bing', aiEngine: null };
  }

  // Non-Google/Bing organic search or explicit referral medium.
  if (utmMedium === 'referral') {
    return { channel: 'referral', aiEngine: null };
  }
  if (utmMedium === 'organic' && OTHER_ORGANIC_SEARCH_SOURCES.has(utmSource)) {
    return { channel: 'referral', aiEngine: null };
  }

  // Explicit UTM campaign tags (social, newsletter, reddit, linkedin, etc.).
  if (utmSource || utmMedium || utmCampaign) {
    return { channel: 'paid_or_utm', aiEngine: null };
  }

  // Player / club referrals or external non-smarter.poker web referrals.
  if (
    hasPlayerReferral ||
    signupSource === 'referral' ||
    (referrerHost && !hostMatches(referrerHost, 'smarter.poker'))
  ) {
    return { channel: 'referral', aiEngine: null };
  }

  return { channel: 'direct', aiEngine: null };
}

function resolveAuthProvider(user) {
  const appMeta = extractAppMeta(user);
  const directProvider = cleanLower(appMeta.provider || '');
  if (directProvider) return directProvider;

  if (Array.isArray(appMeta.providers) && appMeta.providers.length > 0) {
    const first = cleanLower(appMeta.providers[0]);
    if (first) return first;
  }

  if (Array.isArray(user?.identities) && user.identities.length > 0) {
    const firstIdentity = cleanLower(user.identities[0]?.provider || '');
    if (firstIdentity) return firstIdentity;
  }

  return 'email';
}

function topEntries(countsMap, keyName, limit = 10) {
  return [...countsMap.entries()]
    .sort((a, b) => (b[1] !== a[1] ? b[1] - a[1] : a[0].localeCompare(b[0])))
    .slice(0, limit)
    .map(([label, count]) => ({ [keyName]: label, count }));
}

/**
 * Pure, zero-PII signup attribution aggregator.
 * Accepts an array of Supabase Auth users (either `user_metadata` or `raw_user_meta_data`).
 */
export function summarizeSignupAttribution(users, options = {}) {
  const list = Array.isArray(users) ? users : [];
  const topLimit =
    Number.isInteger(options.topLimit) && options.topLimit > 0 ? options.topLimit : 10;

  const channels = {
    organic_google: 0,
    organic_bing: 0,
    organic_ai: 0,
    referral: 0,
    paid_or_utm: 0,
    direct: 0,
  };

  const providers = {
    google: 0,
    facebook: 0,
    email: 0,
    other: 0,
    oauth_total: 0,
  };

  const aiEngines = {};
  const landingCounts = new Map();
  const unlockCounts = new Map();

  let totalSignups = 0;

  for (const user of list) {
    if (!user || typeof user !== 'object') continue;
    totalSignups += 1;

    const meta = extractUserMeta(user);
    const { channel, aiEngine } = classifySignupChannel(meta);
    channels[channel] = (channels[channel] || 0) + 1;

    if (aiEngine) {
      aiEngines[aiEngine] = (aiEngines[aiEngine] || 0) + 1;
    }

    const provider = resolveAuthProvider(user);
    if (provider === 'google') {
      providers.google += 1;
      providers.oauth_total += 1;
    } else if (provider === 'facebook') {
      providers.facebook += 1;
      providers.oauth_total += 1;
    } else if (provider === 'email') {
      providers.email += 1;
    } else {
      providers.other += 1;
      if (provider !== 'phone') {
        providers.oauth_total += 1;
      }
    }

    const landingPath = sanitizeAttributionLandingPath(
      meta.acquisition_landing_path || meta.landing_path || '',
    );
    if (landingPath) {
      landingCounts.set(landingPath, (landingCounts.get(landingPath) || 0) + 1);
    }

    const unlockKey = sanitizeAttributionUnlockKey(
      meta.unlock_key || meta.acquisition_unlock_key || meta.seo_unlock_key || '',
    );
    if (unlockKey) {
      unlockCounts.set(unlockKey, (unlockCounts.get(unlockKey) || 0) + 1);
    }
  }

  return {
    totalSignups,
    channels,
    providers,
    aiEngines,
    landingPages: topEntries(landingCounts, 'path', topLimit),
    unlockKeys: topEntries(unlockCounts, 'key', topLimit),
  };
}

function isSyntheticProbeUser(user) {
  const email = cleanLower(user?.email || '');
  if (email.endsWith('.invalid')) return true;
  const meta = extractUserMeta(user);
  return meta.is_signup_probe === true || meta.synthetic_probe === true;
}

/**
 * Bounded, read-only loader for recent 24h and 7d signup attribution via
 * Supabase Auth Admin API. Wrapped in strict timeout + try/catch so it can
 * never slow down or break /api/health/signup or /admin/signup-health.
 */
export async function loadRecentSignupAttribution(sb, options = {}) {
  const windowDays =
    Number.isInteger(options.windowDays) && options.windowDays > 0 ? options.windowDays : 7;
  const maxPages =
    Number.isInteger(options.maxPages) && options.maxPages > 0 ? options.maxPages : 5;
  const perPage =
    Number.isInteger(options.perPage) && options.perPage > 0 ? options.perPage : 1000;
  const timeoutMs =
    Number.isInteger(options.timeoutMs) && options.timeoutMs > 0 ? options.timeoutMs : 1800;
  const now = Number.isFinite(options.now) ? options.now : Date.now();

  const empty = summarizeSignupAttribution([]);
  const fallback = (available = false, truncated = false) => ({
    available,
    truncated,
    window_days: windowDays,
    ...empty,
    last_24h: empty,
    last_7d: empty,
  });

  if (!sb?.auth?.admin?.listUsers) {
    return fallback(false, false);
  }

  const cutoff7d = now - windowDays * 24 * 60 * 60 * 1000;
  const cutoff24h = now - 24 * 60 * 60 * 1000;
  const startedAt = Date.now();

  const runFetch = async () => {
    const users7d = [];
    const users24h = [];
    let truncated = false;

    for (let page = 1; page <= maxPages; page += 1) {
      if (Date.now() - startedAt >= timeoutMs) {
        truncated = true;
        break;
      }
      const { data, error } = await sb.auth.admin.listUsers({ page, perPage });
      if (error) {
        return fallback(false, false);
      }
      const pageUsers = Array.isArray(data?.users) ? data.users : [];
      for (const user of pageUsers) {
        if (!user || isSyntheticProbeUser(user)) continue;
        const createdMs = Date.parse(user.created_at || '');
        if (!Number.isFinite(createdMs)) continue;
        if (createdMs >= cutoff7d && createdMs <= now + 60_000) {
          users7d.push(user);
          if (createdMs >= cutoff24h) {
            users24h.push(user);
          }
        }
      }
      if (pageUsers.length < perPage) {
        break;
      }
      // If GoTrue returns newest-first (DESC) and we've already crossed the 7-day cutoff, stop early.
      const firstMs = Date.parse(pageUsers[0]?.created_at || '');
      const lastMs = Date.parse(pageUsers[pageUsers.length - 1]?.created_at || '');
      if (Number.isFinite(firstMs) && Number.isFinite(lastMs) && firstMs >= lastMs && lastMs < cutoff7d) {
        break;
      }
      if (page === maxPages) {
        truncated = true;
      }
    }

    const summary7d = summarizeSignupAttribution(users7d);
    const summary24h = summarizeSignupAttribution(users24h);
    return {
      available: true,
      truncated,
      window_days: windowDays,
      ...summary7d,
      last_24h: summary24h,
      last_7d: summary7d,
    };
  };

  let timerId = null;
  try {
    const timeoutPromise = new Promise((resolve) => {
      timerId = setTimeout(() => resolve(fallback(false, true)), timeoutMs);
    });
    return await Promise.race([runFetch(), timeoutPromise]);
  } catch {
    return fallback(false, false);
  } finally {
    if (timerId !== null) clearTimeout(timerId);
  }
}
