import { capture } from '../analytics.js';

const RECENT_KEY = 'pnm_recent_places_v1';
const RECENT_LIMIT = 8;
const ALLOWED_KINDS = new Set(['venue', 'home_game', 'location']);
const PERFORMANCE_ROUTE_PREFIXES = Object.freeze([
  '/hub/poker-near-me',
  '/hub/venues',
  '/hub/home-games',
  '/hub/poker-series',
  '/hub/series',
  '/hub/daily-tournaments',
  '/hub/events-calendar',
  '/hub/poker-tours',
  '/hub/tours',
]);

function isBrowser() {
  return typeof window !== 'undefined';
}

function safeHref(value) {
  const href = String(value || '');
  return href.startsWith('/hub/') && !href.includes('://') ? href.slice(0, 240) : null;
}

function safeText(value, max = 120) {
  return String(value || '').replace(/\s+/g, ' ').trim().slice(0, max);
}

export function readRecentPokerPlaces() {
  if (!isBrowser()) return [];
  try {
    const parsed = JSON.parse(window.localStorage.getItem(RECENT_KEY) || '[]');
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((item) => item && safeHref(item.href) && item.title).slice(0, RECENT_LIMIT);
  } catch (_) {
    return [];
  }
}

export function rememberPokerPlace(place) {
  if (!isBrowser()) return;
  const href = safeHref(place?.href);
  const title = safeText(place?.title);
  if (!href || !title) return;

  const item = {
    href,
    title,
    subtitle: safeText(place?.subtitle, 100),
    kind: ALLOWED_KINDS.has(place?.kind) ? place.kind : 'venue',
    viewedAt: Date.now(),
  };

  try {
    const next = [item, ...readRecentPokerPlaces().filter((entry) => entry.href !== href)].slice(0, RECENT_LIMIT);
    window.localStorage.setItem(RECENT_KEY, JSON.stringify(next));
    window.dispatchEvent(new CustomEvent('pnm:recent-places-updated', { detail: { href } }));
  } catch (_) {
    // Storage is an enhancement. A private-mode quota error must not block the route.
  }
}

export function capturePokerNearMeEvent(event, properties = {}) {
  const safeProperties = {
    route: safeHref(properties.route) || undefined,
    surface: safeText(properties.surface, 60) || undefined,
    source: safeText(properties.source, 60) || undefined,
    route_family: safeText(properties.route_family, 40) || undefined,
    venue_type: safeText(properties.venue_type, 40) || undefined,
    state: safeText(properties.state, 30) || undefined,
    city: safeText(properties.city, 80) || undefined,
    result_count: Number.isFinite(Number(properties.result_count)) ? Number(properties.result_count) : undefined,
    metric_name: safeText(properties.metric_name, 24) || undefined,
    metric_id: safeText(properties.metric_id, 80) || undefined,
    metric_label: safeText(properties.metric_label, 40) || undefined,
    metric_rating: safeText(properties.metric_rating, 24) || undefined,
    metric_value: Number.isFinite(Number(properties.metric_value)) ? Number(properties.metric_value) : undefined,
  };
  capture(`pnm_${safeText(event, 60).replace(/[^a-z0-9_]+/gi, '_').toLowerCase()}`, safeProperties);
}

export function isPokerNearMePerformanceRoute(pathname) {
  const path = safeHref(pathname);
  return !!path && PERFORMANCE_ROUTE_PREFIXES.some((prefix) => path === prefix || path.startsWith(`${prefix}/`));
}

function rateMetric(name, value) {
  const thresholds = {
    CLS: [0.1, 0.25],
    FCP: [1800, 3000],
    INP: [200, 500],
    LCP: [2500, 4000],
    TTFB: [800, 1800],
  };
  const limits = thresholds[name];
  if (!limits || !Number.isFinite(Number(value))) return 'unrated';
  if (Number(value) <= limits[0]) return 'good';
  if (Number(value) <= limits[1]) return 'needs-improvement';
  return 'poor';
}

export function capturePokerNearMeVital(metric, pathname) {
  if (!metric || !isPokerNearMePerformanceRoute(pathname)) return;
  capturePokerNearMeEvent('web_vital', {
    route: pathname,
    route_family: 'poker_near_me',
    metric_name: metric.name,
    metric_id: metric.id,
    metric_label: metric.label,
    metric_rating: metric.rating || rateMetric(metric.name, metric.value),
    metric_value: metric.name === 'CLS'
      ? Math.round(Number(metric.value || 0) * 10000) / 10000
      : Math.round(Number(metric.value || 0)),
  });
}

export const pokerNearMeActivityKeys = Object.freeze({ RECENT_KEY, RECENT_LIMIT, PERFORMANCE_ROUTE_PREFIXES });
