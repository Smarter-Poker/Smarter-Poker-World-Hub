/**
 * pnmSections: the stacked-section map for Poker Near Me (mobile phase 3).
 *
 * The discovery page no longer has tabs that hide content. Every primary
 * surface and every sub-surface renders in document order under its own
 * heading, and the old tab rows are anchor jump lists: a tap scrolls the
 * section into view (offset by the sticky header) and the URL still updates
 * through pushDiscoverySurface so deep links and Back/Forward keep working.
 *
 * Section element ids are `pnm-section-<key>`. Route slugs (the last path
 * segment of /hub/poker-near-me/<slug>) map onto a section key here so
 * arriving on /hub/poker-near-me/events scrolls to the events section after
 * paint.
 */

export const PRIMARY_SECTIONS = [
  { key: 'venues', label: 'Venues', heading: 'Rooms And Venues' },
  { key: 'events', label: 'Events', heading: 'Events And Tournaments' },
  { key: 'live', label: 'Live', heading: 'Cash Games Near Me', live: true },
  { key: 'map', label: 'Map', heading: 'Poker Room Map' },
  { key: 'saved', label: 'Saved', heading: 'Saved Poker Places' },
  { key: 'more', label: 'More', heading: 'Discovery Tools' },
];

export const EVENT_SECTIONS = [
  { key: 'daily', label: 'Daily Tournaments', heading: 'Daily Tournaments' },
  { key: 'tours', label: 'Tours', heading: 'Poker Tours' },
  { key: 'series', label: 'Series', heading: 'Poker Series' },
  { key: 'calendar', label: 'Calendar', heading: 'Events Calendar' },
];

export const MORE_SECTIONS = [
  { key: 'roadtrip', label: 'Road Trip', heading: 'Road Trip Planner' },
  { key: 'social', label: 'Social', heading: 'Social Feed' },
  { key: 'alerts', label: 'Alerts', heading: 'Game Alerts' },
  { key: 'nearmenow', label: 'Near Me Now', heading: 'Near Me Now' },
  { key: 'tripcost', label: 'Trip Cost', heading: 'Trip Cost Calculator' },
];

export const sectionId = (key) => `pnm-section-${key}`;

/** Route slug (last path segment) -> section key. */
export const SLUG_TO_SECTION = {
  venues: 'venues',
  events: 'events',
  tours: 'tours',
  series: 'series',
  daily: 'daily',
  'daily-tournaments': 'daily',
  calendar: 'calendar',
  'events-calendar': 'calendar',
  live: 'live',
  'live-games': 'live',
  map: 'map',
  saved: 'saved',
  more: 'more',
  roadtrip: 'roadtrip',
  alerts: 'alerts',
};

export function sectionForSlug(slug) {
  if (!slug) return null;
  const key = Array.isArray(slug) ? slug[0] : slug;
  return SLUG_TO_SECTION[String(key).toLowerCase()] || null;
}

function headerOffsetPx() {
  if (typeof window === 'undefined' || typeof document === 'undefined') return 56;
  try {
    const raw = getComputedStyle(document.documentElement).getPropertyValue('--sp-header-height');
    const parsed = parseFloat(raw);
    if (Number.isFinite(parsed) && parsed > 0) return parsed;
  } catch (_) {
    // Fall through to the token default.
  }
  return 56;
}

/**
 * How far, in CSS px, a section's top sits from the place scrollToSection
 * would put it (just under the header). Null when the section is not mounted.
 */
export function sectionAnchorDelta(key, { extraOffset = 0 } = {}) {
  if (typeof document === 'undefined') return null;
  const el = document.getElementById(sectionId(key));
  if (!el) return null;
  return el.getBoundingClientRect().top - headerOffsetPx() - extraOffset;
}

/**
 * Did something other than the page's own deep-link anchor hold move the
 * document? The hold remembers the scroll position it last produced
 * (`heldY`). Three things can change the picture while it waits:
 *
 * - late content above the section pushes the section down, but the scroll
 *   position does not move (the hold must correct this);
 * - browser scroll anchoring moves the scroll position, but keeps the
 *   section where it was (also fine);
 * - the visitor, the scrollbar, find-in-page, an anchor link, assistive
 *   technology or any script scrolls the document: the position AND the
 *   section both move. Only this is a foreign scroll, and the hold must stop
 *   at once instead of dragging the document back.
 *
 * The hold used to stop only on wheel, touchstart, pointerdown and keydown,
 * so every other scroll was dragged back to the section within about 200ms
 * for up to 6.4 seconds (seen on /hub/poker-near-me/series in the 2026-11-26
 * WebKit and Chromium probe: a scroll to y = 10073 was back at y = 341).
 */
export function isForeignScroll({ heldY, scrollY, anchorDelta, viewportHeight = 0 }) {
  if (!Number.isFinite(heldY) || !Number.isFinite(scrollY)) return false;
  if (Math.abs(scrollY - heldY) <= 2) return false;
  if (anchorDelta === null || anchorDelta === undefined || !Number.isFinite(anchorDelta)) return true;
  const tolerance = Math.max(64, (Number(viewportHeight) || 0) * 0.25);
  return Math.abs(anchorDelta) > tolerance;
}

/**
 * Scroll a section's top under the sticky header. Uses scrollIntoView with
 * `block: 'start'` (the standard) and then corrects for the header and the
 * anchor row by the published --sp-header-height. Returns true when the
 * section exists.
 */
export function scrollToSection(key, { behavior = 'smooth', extraOffset = 0 } = {}) {
  if (typeof document === 'undefined') return false;
  const el = document.getElementById(sectionId(key));
  if (!el) return false;
  const prefersReduced =
    typeof window !== 'undefined' &&
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const mode = prefersReduced ? 'auto' : behavior;
  const top = el.getBoundingClientRect().top + (window.scrollY || window.pageYOffset || 0);
  const target = Math.max(0, top - headerOffsetPx() - extraOffset);
  try {
    window.scrollTo({ top: target, behavior: mode });
  } catch (_) {
    try {
      el.scrollIntoView({ block: 'start' });
    } catch (__) {
      // Nothing more to do in a browser this old.
    }
  }
  return true;
}
