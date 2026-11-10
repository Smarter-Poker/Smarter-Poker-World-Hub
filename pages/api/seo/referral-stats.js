/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  GET / POST /api/seo/referral-stats
 *  First-Party Privacy-Safe Widget, oEmbed, Streamer Bot & Chart Telemetry API
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Separates distinct telemetry categories and prevents spoofing or unbounded
 * memory growth:
 *   - referral_visits        (Human visits carrying a verified external HTTP Referer)
 *   - widget_loads           (1-line JS SDK mounts & iframe embeds; alias: widget_embeds)
 *   - oembed_requests        (CMS oEmbed 1.0 discovery calls; alias: oembed_discoveries)
 *   - command_calls          (Twitch/YouTube/Discord bot queries; alias: streamer_commands)
 *   - research_charts        (Dynamic SVG benchmark chart embeds & downloads)
 *   - calendar_subscriptions (RFC 5545 .ics poker series & freeroll calendar feeds)
 *   - solved_spot_shares     (Calculator & rule permalink shares)
 *   - conversions            (Verified downstream signup or action completions)
 *
 * Anti-Spoofing & Verification Model:
 *   1. An arbitrary `?partner=` query parameter or crawler request NEVER counts as
 *      a verified partner installation or human referral visit.
 *   2. `verified_partner_referrers` (and `active_partner_domains`) only record
 *      external domains backed by an actual HTTP `Referer` or `Origin` header from
 *      a non-crawler `User-Agent`. Unbacked `?partner=` parameters are isolated in
 *      `unverified_partner_params`.
 *   3. Crawler / bot User-Agents are separated from human / browser requests in
 *      `actor_breakdown` (`human_or_browser` vs `crawler_or_bot`).
 *   4. Streamer command calls carrying authentic `Nightbot-Response-Url`,
 *      `Nightbot-Channel`, or `X-StreamElements-Channel` headers are separated
 *      into `verified_platform_bot` vs `unverified_direct_queries`.
 *   5. Strictly bounded maps (`MAX_ITEM_KEYS = 150`, `MAX_PARTNER_KEYS = 100`,
 *      `MAX_RECENT_EVENTS = 50`) and PII stripping prevent memory exhaustion or
 *      sensitive data collection.
 */

const CATEGORY_ALIASES = {
  referral_visits: 'referral_visits',
  widget_loads: 'widget_loads',
  widget_embeds: 'widget_embeds',
  oembed_requests: 'oembed_requests',
  oembed_discoveries: 'oembed_discoveries',
  command_calls: 'command_calls',
  streamer_commands: 'streamer_commands',
  research_charts: 'research_charts',
  calendar_subscriptions: 'calendar_subscriptions',
  solved_spot_shares: 'solved_spot_shares',
  conversions: 'conversions',
};

const MAX_ITEM_KEYS = 150;
const MAX_PARTNER_KEYS = 100;
const MAX_RECENT_EVENTS = 50;

const CRAWLER_UA_REGEX =
  /googlebot|bingbot|slurp|duckduckbot|baiduspider|yandexbot|facebot|facebookexternalhit|twitterbot|discordbot|telegrambot|slackbot|linkedinbot|whatsapp|embedly|pinterest|applebot|semrushbot|ahrefsbot|mj12bot|dotbot|petalbot|bytespider|gptbot|claudebot|perplexitybot|oai-searchbot|curl|wget|python-requests|axios|node-fetch|go-http-client|headlesschrome|lighthouse/i;

function createInitialStore() {
  return {
    started_at: new Date().toISOString(),
    total_events: 0,
    by_category: {
      referral_visits: 0,
      widget_loads: 0,
      widget_embeds: 0,
      oembed_requests: 0,
      oembed_discoveries: 0,
      command_calls: 0,
      streamer_commands: 0,
      research_charts: 0,
      calendar_subscriptions: 0,
      solved_spot_shares: 0,
      conversions: 0,
    },
    actor_breakdown: {
      human_or_browser: 0,
      crawler_or_bot: 0,
    },
    command_verification: {
      verified_platform_bot: 0,
      unverified_direct_queries: 0,
    },
    by_item: {},
    partner_domains: {},
    verified_partner_referrers: {},
    unverified_partner_params: {},
    recent_events: [],
  };
}

function getStore() {
  if (!globalThis.__SMARTER_POKER_SEO_TELEMETRY__) {
    globalThis.__SMARTER_POKER_SEO_TELEMETRY__ = createInitialStore();
  }
  const s = globalThis.__SMARTER_POKER_SEO_TELEMETRY__;
  if (!s.actor_breakdown) s.actor_breakdown = { human_or_browser: 0, crawler_or_bot: 0 };
  if (!s.command_verification) {
    s.command_verification = { verified_platform_bot: 0, unverified_direct_queries: 0 };
  }
  if (!s.verified_partner_referrers) s.verified_partner_referrers = {};
  if (!s.unverified_partner_params) s.unverified_partner_params = {};
  return s;
}

export function sanitizeTelemetryToken(value, maxLen = 64) {
  const raw = String(value || '').trim();
  if (!raw) return '';
  // Strip any email address, query string, or credential-like token
  const withoutQuery = raw.split('?')[0].split('#')[0];
  if (withoutQuery.includes('@')) return 'redacted';
  return withoutQuery
    .toLowerCase()
    .replace(/^https?:\/\//, '')
    .replace(/[^a-z0-9._/-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, maxLen);
}

function extractVerifiedExternalHost(headerValue = '') {
  const raw = String(headerValue || '').trim();
  if (!raw) return '';
  try {
    const parsed = new URL(raw.startsWith('http') ? raw : `https://${raw}`);
    const host = parsed.hostname.toLowerCase().replace(/^www\./, '');
    if (
      !host ||
      host === 'localhost' ||
      host === '127.0.0.1' ||
      host === 'smarter.poker' ||
      host.endsWith('.smarter.poker') ||
      !host.includes('.')
    ) {
      return '';
    }
    return sanitizeTelemetryToken(host, 64);
  } catch {
    return '';
  }
}

export function classifyTelemetryRequest(req, { partner = '' } = {}) {
  const headers = (req && req.headers) || {};
  const ua = String(headers['user-agent'] || '');
  const isCrawler = CRAWLER_UA_REGEX.test(ua);

  const refererHost =
    extractVerifiedExternalHost(headers.referer || headers.referrer || '') ||
    extractVerifiedExternalHost(headers.origin || '');

  const claimedPartner = sanitizeTelemetryToken(partner || '', 64).split('/')[0];
  const isSelfOrLocalClaim =
    !claimedPartner ||
    claimedPartner === 'localhost' ||
    claimedPartner === '127.0.0.1' ||
    claimedPartner === 'smarter.poker' ||
    claimedPartner.endsWith('.smarter.poker');

  const isVerifiedPartnerInstall = Boolean(refererHost && !isCrawler);
  const hasVerifiedBotHeaders = Boolean(
    headers['nightbot-response-url'] ||
      headers['nightbot-channel'] ||
      headers['nightbot-user'] ||
      headers['x-streamelements-channel']
  );

  return {
    isCrawler,
    actorType: isCrawler ? 'crawler_or_bot' : 'human_or_browser',
    verifiedRefererHost: refererHost || null,
    claimedPartnerParam: !isSelfOrLocalClaim ? claimedPartner : null,
    isVerifiedPartnerInstall,
    hasVerifiedBotHeaders,
  };
}

function incrementBoundedMap(mapObj, key, maxKeys) {
  if (!key) return;
  if (Object.prototype.hasOwnProperty.call(mapObj, key)) {
    mapObj[key] += 1;
    return;
  }
  if (Object.keys(mapObj).length < maxKeys) {
    mapObj[key] = 1;
  }
}

export function recordSeoTelemetryEvent({
  category = 'widget_loads',
  item = 'unknown',
  partner = '',
  source = 'api',
  req = null,
} = {}) {
  const store = getStore();
  const normalizedCategory = CATEGORY_ALIASES[category] || 'widget_loads';
  const normalizedItem = sanitizeTelemetryToken(item || 'default', 80) || 'default';
  const normalizedSource = sanitizeTelemetryToken(source || 'api', 32) || 'api';

  const classification = classifyTelemetryRequest(req, { partner });

  store.total_events += 1;
  store.by_category[normalizedCategory] = (store.by_category[normalizedCategory] || 0) + 1;

  // Keep dual aliases synchronized so both legacy and separated consumers agree
  if (normalizedCategory === 'widget_embeds') {
    store.by_category.widget_loads = (store.by_category.widget_loads || 0) + 1;
  } else if (normalizedCategory === 'widget_loads') {
    store.by_category.widget_embeds = (store.by_category.widget_embeds || 0) + 1;
  } else if (normalizedCategory === 'oembed_discoveries') {
    store.by_category.oembed_requests = (store.by_category.oembed_requests || 0) + 1;
  } else if (normalizedCategory === 'oembed_requests') {
    store.by_category.oembed_discoveries = (store.by_category.oembed_discoveries || 0) + 1;
  } else if (normalizedCategory === 'streamer_commands') {
    store.by_category.command_calls = (store.by_category.command_calls || 0) + 1;
  } else if (normalizedCategory === 'command_calls') {
    store.by_category.streamer_commands = (store.by_category.streamer_commands || 0) + 1;
  }

  store.actor_breakdown[classification.actorType] =
    (store.actor_breakdown[classification.actorType] || 0) + 1;

  if (normalizedCategory === 'streamer_commands' || normalizedCategory === 'command_calls') {
    if (classification.hasVerifiedBotHeaders) {
      store.command_verification.verified_platform_bot += 1;
    } else {
      store.command_verification.unverified_direct_queries += 1;
    }
  }

  const itemKey = `${normalizedCategory}:${normalizedItem}`;
  incrementBoundedMap(store.by_item, itemKey, MAX_ITEM_KEYS);

  // Only a real external HTTP Referer from a non-crawler counts as a verified partner installation
  if (classification.isVerifiedPartnerInstall && classification.verifiedRefererHost) {
    incrementBoundedMap(
      store.verified_partner_referrers,
      classification.verifiedRefererHost,
      MAX_PARTNER_KEYS
    );
    incrementBoundedMap(
      store.partner_domains,
      classification.verifiedRefererHost,
      MAX_PARTNER_KEYS
    );
  } else if (classification.claimedPartnerParam) {
    incrementBoundedMap(
      store.unverified_partner_params,
      classification.claimedPartnerParam,
      MAX_PARTNER_KEYS
    );
  }

  const eventRecord = {
    timestamp: new Date().toISOString(),
    category: normalizedCategory,
    item: normalizedItem,
    actor_type: classification.actorType,
    verified_referer: classification.verifiedRefererHost,
    claimed_partner_param: classification.claimedPartnerParam,
    partner_verified: classification.isVerifiedPartnerInstall,
    source: normalizedSource,
  };

  store.recent_events.unshift(eventRecord);
  if (store.recent_events.length > MAX_RECENT_EVENTS) {
    store.recent_events.length = MAX_RECENT_EVENTS;
  }

  return eventRecord;
}

export function getSeoTelemetrySnapshot({ includeRecent = false } = {}) {
  const store = getStore();
  return {
    schema_version: '1.1.0',
    provider_name: 'Smarter.Poker',
    provider_url: 'https://smarter.poker',
    telemetry_endpoint: 'https://smarter.poker/api/seo/referral-stats',
    privacy_and_verification_model:
      'Zero cookies, zero IP logging, and zero PII collection. Separates referral_visits, widget_loads, oembed_requests, command_calls, research_charts, calendar_subscriptions, solved_spot_shares, and conversions. Arbitrary ?partner= query parameters and crawler requests are isolated from verified HTTP Referer partner installations.',
    verified_distribution_surfaces: {
      accepted_external_directories: [
        {
          name: 'Glama.ai MCP Server Directory',
          url: 'https://glama.ai/mcp/servers/Smarter-Poker/smarter-poker-mcp',
          status: 'verified_live',
        },
        {
          name: 'TensorBlock Awesome MCP Servers Directory',
          url: 'https://www.tensorblock.co/mcp/servers/smarter-poker-5bce8c2f',
          status: 'verified_live',
        },
      ],
      archival_identifiers: {
        zenodo_dois: [
          '10.5281/zenodo.24115647',
          '10.5281/zenodo.24115636',
          '10.5281/zenodo.24115447',
          '10.5281/zenodo.24115452',
          '10.5281/zenodo.24115453',
          '10.5281/zenodo.24115454',
        ],
        zenodo_concept_dois: [
          '10.5281/zenodo.24095048',
          '10.5281/zenodo.24095056',
          '10.5281/zenodo.24095559',
          '10.5281/zenodo.24095563',
          '10.5281/zenodo.24095596',
          '10.5281/zenodo.24095601',
        ],
        software_heritage_swhids: [
          'swh:1:snp:ff23640ad24a3a825d320bae8621fd50ba58c16f',
          'swh:1:snp:02b8992833424620305edcfb730b3cf8add15747',
        ],
        github_releases: [
          'https://github.com/Smarter-Poker/smarter-poker-mcp/releases/tag/v1.0.5',
          'https://github.com/Smarter-Poker/smarter-poker-open-datasets/releases/tag/v2026.11.12',
        ],
      },
      surface_counts: {
        embeddable_calculators: 23,
        mcp_tools: 35,
        streamer_chat_commands: 18,
        svg_research_charts: 15,
        ics_calendar_feeds: 11,
        svg_attribution_badges: 8,
      },
    },
    runtime_telemetry: {
      instance_started_at: store.started_at,
      total_events: store.total_events,
      by_category: { ...store.by_category },
      actor_breakdown: { ...store.actor_breakdown },
      command_verification: { ...store.command_verification },
      by_item: { ...store.by_item },
      verified_partner_referrers: { ...store.verified_partner_referrers },
      unverified_partner_params: { ...store.unverified_partner_params },
      active_partner_domains: { ...store.partner_domains },
      recent_events: includeRecent ? store.recent_events.slice(0, 20) : undefined,
    },
  };
}

export default function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, HEAD, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }

  if (req.method !== 'GET' && req.method !== 'POST' && req.method !== 'HEAD') {
    res.setHeader('Allow', 'GET, POST, HEAD, OPTIONS');
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  if (req.method === 'POST' || String(req.query?.event || '').toLowerCase() === 'record') {
    const body = typeof req.body === 'object' && req.body !== null ? req.body : {};
    const category = body.category || req.query?.category || 'widget_loads';
    const item = body.item || req.query?.item || 'odds-calculator';
    const partner = body.partner || req.query?.partner || '';
    const source = body.source || req.query?.source || (req.method === 'POST' ? 'sdk-beacon' : 'query-beacon');

    const recorded = recordSeoTelemetryEvent({ category, item, partner, source, req });
    res.setHeader('Cache-Control', 'no-store');
    return res.status(200).json({
      ok: true,
      recorded,
      totals: getStore().by_category,
    });
  }

  const includeRecent = String(req.query?.include_recent || '') === '1';
  res.setHeader('Cache-Control', 'public, s-maxage=60, stale-while-revalidate=300');
  return res.status(200).json(getSeoTelemetrySnapshot({ includeRecent }));
}
