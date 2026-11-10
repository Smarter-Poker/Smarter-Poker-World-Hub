/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  GET / POST /api/seo/referral-stats
 *  First-Party Privacy-Safe Widget, oEmbed, Streamer Bot & Chart Telemetry API
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Tracks aggregate, privacy-safe usage across Smarter.Poker's external
 * distribution surfaces without cookies, IP logging, or personal data:
 *   - widget_embeds          (1-line JS SDK mounts & iframe embeds)
 *   - oembed_discoveries     (CMS oEmbed 1.0 auto-embed discovery requests)
 *   - streamer_commands      (Twitch/YouTube/Discord Nightbot & StreamElements queries)
 *   - research_charts        (Dynamic SVG benchmark chart embeds & downloads)
 *   - calendar_subscriptions (RFC 5545 .ics poker series & freeroll calendar feeds)
 *   - solved_spot_shares     (Calculator & rule permalink shares)
 */

const VALID_CATEGORIES = new Set([
  'widget_embeds',
  'oembed_discoveries',
  'streamer_commands',
  'research_charts',
  'calendar_subscriptions',
  'solved_spot_shares',
]);

function getStore() {
  if (!globalThis.__SMARTER_POKER_SEO_TELEMETRY__) {
    globalThis.__SMARTER_POKER_SEO_TELEMETRY__ = {
      started_at: new Date().toISOString(),
      total_events: 0,
      by_category: {
        widget_embeds: 0,
        oembed_discoveries: 0,
        streamer_commands: 0,
        research_charts: 0,
        calendar_subscriptions: 0,
        solved_spot_shares: 0,
      },
      by_item: {},
      partner_domains: {},
      recent_events: [],
    };
  }
  return globalThis.__SMARTER_POKER_SEO_TELEMETRY__;
}

export function sanitizeTelemetryToken(value, maxLen = 64) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, '')
    .replace(/[^a-z0-9._/-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, maxLen);
}

export function recordSeoTelemetryEvent({
  category = 'widget_embeds',
  item = 'unknown',
  partner = '',
  source = 'api',
} = {}) {
  const store = getStore();
  const normalizedCategory = VALID_CATEGORIES.has(category) ? category : 'widget_embeds';
  const normalizedItem = sanitizeTelemetryToken(item || 'default', 80) || 'default';
  const normalizedPartner = sanitizeTelemetryToken(partner || '', 64);
  const normalizedSource = sanitizeTelemetryToken(source || 'api', 32) || 'api';

  store.total_events += 1;
  store.by_category[normalizedCategory] = (store.by_category[normalizedCategory] || 0) + 1;

  const itemKey = `${normalizedCategory}:${normalizedItem}`;
  store.by_item[itemKey] = (store.by_item[itemKey] || 0) + 1;

  if (normalizedPartner && normalizedPartner !== 'localhost') {
    store.partner_domains[normalizedPartner] = (store.partner_domains[normalizedPartner] || 0) + 1;
  }

  const eventRecord = {
    timestamp: new Date().toISOString(),
    category: normalizedCategory,
    item: normalizedItem,
    partner: normalizedPartner || null,
    source: normalizedSource,
  };

  store.recent_events.unshift(eventRecord);
  if (store.recent_events.length > 50) {
    store.recent_events.length = 50;
  }

  return eventRecord;
}

export function getSeoTelemetrySnapshot() {
  const store = getStore();
  return {
    schema_version: '1.0.0',
    provider_name: 'Smarter.Poker',
    provider_url: 'https://smarter.poker',
    telemetry_endpoint: 'https://smarter.poker/api/seo/referral-stats',
    privacy_model:
      'Zero cookies, zero IP logging, and zero PII collection. Tracks only aggregate widget mounts, oEmbed discovery calls, streamer bot commands, SVG chart renders, and calendar feed subscriptions.',
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
          '10.5281/zenodo.24095049',
          '10.5281/zenodo.24095057',
          '10.5281/zenodo.24095560',
          '10.5281/zenodo.24095564',
          '10.5281/zenodo.24095597',
          '10.5281/zenodo.24095602',
        ],
        software_heritage_swhids: [
          'swh:1:snp:ff23640ad24a3a825d320bae8621fd50ba58c16f',
          'swh:1:snp:02b8992833424620305edcfb730b3cf8add15747',
        ],
        package_registries: [
          'https://www.npmjs.com/package/@smarter-poker/mcp-server',
          'https://pypi.org/project/smarter-poker-eval/',
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
      by_item: { ...store.by_item },
      active_partner_domains: { ...store.partner_domains },
      recent_events: store.recent_events.slice(0, 20),
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
    const category = body.category || req.query?.category || 'widget_embeds';
    const item = body.item || req.query?.item || 'odds-calculator';
    const partner = body.partner || req.query?.partner || '';
    const source = body.source || req.query?.source || (req.method === 'POST' ? 'sdk-beacon' : 'query-beacon');

    const recorded = recordSeoTelemetryEvent({ category, item, partner, source });
    res.setHeader('Cache-Control', 'no-store');
    return res.status(200).json({
      ok: true,
      recorded,
      totals: getStore().by_category,
    });
  }

  res.setHeader('Cache-Control', 'public, s-maxage=60, stale-while-revalidate=300');
  return res.status(200).json(getSeoTelemetrySnapshot());
}
