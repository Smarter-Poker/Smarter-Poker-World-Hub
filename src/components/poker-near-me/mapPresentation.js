import { safeImageUrl } from '../../lib/security/imageHosts.js';
import { escapeHtml, getOpenStatus } from './pnm-utils.js';
import { openNativeMaps } from '../../utils/openNativeMaps.js';
import { cashGameCountLabel, isModeledCashGameData } from '../../lib/poker-near-me/liveCashGameData.js';

export const POKER_VENUE_TYPE_LABELS = Object.freeze({
  casino: 'Casino',
  card_room: 'Poker Club',
  poker_club: 'Poker Club',
  home_game: 'Home Game',
  charity: 'Charity',
  tour_stop: 'Poker Tour',
  poker_tour: 'Poker Tour',
});

export const POKER_VENUE_TYPE_COLORS = Object.freeze({
  casino: { fill: '#aab8c4', glow: 'rgba(170,184,196,0.56)', badgeBg: 'rgba(170,184,196,0.14)' },
  card_room: { fill: '#48c7ff', glow: 'rgba(72,199,255,0.5)', badgeBg: 'rgba(72,199,255,0.14)' },
  poker_club: { fill: '#48c7ff', glow: 'rgba(72,199,255,0.5)', badgeBg: 'rgba(72,199,255,0.14)' },
  charity: { fill: '#7da8c4', glow: 'rgba(125,168,196,0.48)', badgeBg: 'rgba(125,168,196,0.14)' },
  home_game: { fill: '#82909d', glow: 'rgba(130,144,157,0.5)', badgeBg: 'rgba(130,144,157,0.14)' },
  tour_stop: { fill: '#c9a85a', glow: 'rgba(201,168,90,0.5)', badgeBg: 'rgba(201,168,90,0.14)' },
  poker_tour: { fill: '#c9a85a', glow: 'rgba(201,168,90,0.5)', badgeBg: 'rgba(201,168,90,0.14)' },
});

// The legend is generated from the same accents the markers, labels and
// dossiers print, so the key can never drift from what is on the map.
export const POKER_MAP_LEGEND_ITEMS = Object.freeze([
  Object.freeze({ type: 'casino', label: 'Casino', color: POKER_VENUE_TYPE_COLORS.casino.fill }),
  Object.freeze({ type: 'poker_club', label: 'Poker Club', color: POKER_VENUE_TYPE_COLORS.poker_club.fill }),
  Object.freeze({ type: 'tour_stop', label: 'Poker Tour', color: POKER_VENUE_TYPE_COLORS.tour_stop.fill }),
  Object.freeze({ type: 'charity', label: 'Charity', color: POKER_VENUE_TYPE_COLORS.charity.fill }),
  Object.freeze({ type: 'home_game', label: 'Home Game', color: POKER_VENUE_TYPE_COLORS.home_game.fill }),
]);

export const POKER_TOUR_COLORS = Object.freeze({
  WSOP: '#c9a227', WPT: '#dc2626', WSOPC: '#c9a227', MSPT: '#3b82f6', RGPS: '#10b981',
  PGT: '#8b5cf6', NAPT: '#f87171', BPO: '#38bdf8', FPN: '#818cf8', LIPS: '#ec4899',
  ROUGHRIDER: '#d97706', PAT: '#22c55e', GCPT: '#06b6d4',
});

const DEFAULT_LOGO = '/smarter-poker-logo-nobg.webp';
const SIGNATURE_FIELDS = Object.freeze([
  'id', 'name', 'latitude', 'longitude', 'venue_type', 'tour_code', 'tour_name', 'is_running',
  'logo_url', 'avatar_url', 'profile_photo_url', 'cover_photo_url', 'image_url', 'trust_score',
  'hours', 'hours_weekday', 'address', 'city', 'state', 'phone', 'website', 'detailUrl',
  'stop_name', 'stop_venue', 'dates', 'host_venue_name', 'host_venue_logo_url', 'social_page_id',
]);

// Marker signatures gate expensive Leaflet rebuilds. JSON.stringify alone is
// insertion-order sensitive, while String(object) collapses every structured
// value to "[object Object]". Normalize recursively so realtime payloads with
// equivalent key order remain stable and genuine nested changes invalidate the
// popup/icon cache. The cycle guard keeps unexpected client-enriched records
// from taking the whole map down.
function stableSignatureValue(value, seen = new WeakSet()) {
  if (value === undefined) return 'undefined';
  if (value === null || typeof value !== 'object') {
    if (typeof value === 'number' && !Number.isFinite(value)) return JSON.stringify(String(value));
    return JSON.stringify(value);
  }
  if (seen.has(value)) return '"[Circular]"';
  seen.add(value);
  let normalized;
  if (Array.isArray(value)) {
    normalized = `[${value.map((item) => stableSignatureValue(item, seen)).join(',')}]`;
  } else {
    const entries = Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${stableSignatureValue(value[key], seen)}`);
    normalized = `{${entries.join(',')}}`;
  }
  seen.delete(value);
  return normalized;
}

export function pokerVenueTheme(venueType, overrideColor) {
  const safeOverride = typeof overrideColor === 'string' && /^#[0-9a-f]{6}$/i.test(overrideColor.trim())
    ? overrideColor.trim()
    : null;
  if (safeOverride) {
    return { fill: safeOverride, glow: `${safeOverride}80`, badgeBg: `${safeOverride}24` };
  }
  return POKER_VENUE_TYPE_COLORS[venueType] || POKER_VENUE_TYPE_COLORS.casino;
}

export function pokerTourColor(tourCode) {
  return POKER_TOUR_COLORS[String(tourCode || '').toUpperCase()] || '#ef4444';
}

export function isPokerTourStop(venue) {
  return Boolean(
    venue
    && (venue.venue_type === 'tour_stop' || venue.venue_type === 'poker_tour')
    && venue.tour_code,
  );
}

export function truncatePokerMapLabel(name, maxLength = 22) {
  if (!name) return '';
  const short = String(name).replace(/\s*(Casino|Hotel|Resort|&\s*Casino|&\s*Resort|&\s*Hotel|Poker\s*Room|Card\s*Room|Room)\s*$/i, '');
  if (short.length <= maxLength) return short;
  return `${short.slice(0, Math.max(1, maxLength - 1)).trim()}…`;
}

function venueLogo(venue) {
  // These end up inside raw HTML strings for Leaflet divIcons and popups, so
  // they never pass through next/image and are governed by img-src directly.
  return safeImageUrl(venue?.avatar_url) || safeImageUrl(venue?.logo_url)
    || safeImageUrl(venue?.profile_photo_url) || safeImageUrl(venue?.cover_photo_url)
    || safeImageUrl(venue?.image_url) || DEFAULT_LOGO;
}

export function createPokerVenueIcon(L, venue, options = {}) {
  const compact = options.variant === 'compact';
  // Saved rooms keep the exact marker geometry and anchor. The saved state is
  // a painted holder printed beside the machine, never a drawn ring around it.
  const saved = options.saved === true;
  // Leaflet divIcons are the actual pointer target. Keep both density variants
  // at the shared 44px touch floor instead of shrinking compact-map pins.
  const size = 44;
  const labelMax = compact ? 20 : 22;
  const maxWidth = compact ? 120 : 140;
  const labelClass = compact ? 'vmp-pin-label' : 'venue-pin-label';
  const className = compact ? 'vmp-venue-marker' : 'venue-map-marker';
  const theme = pokerVenueTheme(venue?.venue_type, options.overrideColor);
  const label = escapeHtml(truncatePokerMapLabel(venue?.name, labelMax));
  const logo = escapeHtml(venueLogo(venue));
  const labelHtml = label
    ? `<span class="${labelClass} pnm-map-marker-label"><span>${label}</span></span>`
    : '';

  return L.divIcon({
    className,
    html: `<div class="pnm-painted-marker pnm-painted-marker--venue${compact ? ' pnm-painted-marker--compact' : ''}${saved ? ' pnm-painted-marker--saved' : ''}" data-pnm-venue-type="${escapeHtml(venue?.venue_type || 'casino')}"${saved ? ' data-pnm-saved="true"' : ''} style="--pnm-marker-label-width:${maxWidth}px;--pnm-map-accent:${theme.fill};"><span class="pnm-painted-marker__machine"><img class="pnm-painted-marker__image" src="${logo}" alt="" onerror="this.src='${DEFAULT_LOGO}';" /></span>${saved ? '<span class="pnm-painted-marker__saved" aria-hidden="true"></span>' : ''}${labelHtml}</div>`,
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
    popupAnchor: [0, -(size / 2 + 2)],
  });
}

export function createPokerTourIcon(L, venue, options = {}) {
  const compact = options.variant === 'compact';
  const color = pokerTourColor(venue?.tour_code);
  const code = escapeHtml(String(venue?.tour_code || 'TOUR').slice(0, 4));
  const logo = venue?.logo_url ? escapeHtml(venue.logo_url) : '';
  // Preserve the established Leaflet hit geometry. The compact stop reserves
  // the same vertical lane it always used, but now presents one complete
  // painted machine instead of stacking two CSS-built frames.
  const width = compact ? 44 : 52;
  const height = compact ? 74 : 52;
  const tourInner = logo
    ? `<img class="pnm-painted-marker__image" src="${logo}" alt="" onerror="this.style.display='none';this.nextElementSibling.style.display='grid';" /><span class="pnm-painted-tour-marker__code pnm-painted-tour-marker__code--fallback">${code}</span>`
    : `<span class="pnm-painted-tour-marker__code">${code}</span>`;
  const labelClass = compact ? 'vmp-pin-label' : 'venue-pin-label';
  const tourLabel = escapeHtml(venue?.tour_name || venue?.tour_code || 'Poker Tour');
  const stopLabel = escapeHtml(truncatePokerMapLabel(venue?.stop_venue || venue?.stop_name || '', 22));
  const label = `<span class="${labelClass} pnm-map-marker-label pnm-map-marker-label--tour"><span>${tourLabel}${stopLabel ? ` · ${stopLabel}` : ''}</span></span>`;

  return L.divIcon({
    className: compact ? 'vmp-venue-marker' : 'tour-logo-marker',
    html: `<div class="pnm-painted-marker pnm-painted-tour-marker${compact ? ' pnm-painted-marker--compact' : ''}" data-pnm-tour-live="${venue?.is_running ? 'true' : 'false'}" style="--pnm-marker-label-width:${compact ? 160 : 180}px;--pnm-map-accent:${color};"><span class="pnm-painted-marker__machine">${tourInner}</span>${label}</div>`,
    iconSize: [width, height],
    iconAnchor: [width / 2, height / 2],
    popupAnchor: [0, -(height / 2)],
  });
}

export function createPokerClusterIcon(L, cluster, options = {}) {
  const compact = options.variant === 'compact';
  const count = cluster.getChildCount();
  // Cluster digits never drop below 12px, and every clickable density tier
  // preserves the shared 44px touch floor on both map variants.
  const tiers = compact
    ? [[100, 54, 14], [50, 46, 13], [20, 44, 12], [10, 44, 12], [0, 44, 12]]
    : [[100, 58, 15], [50, 48, 14], [20, 44, 13], [10, 44, 12], [0, 44, 12]];
  const [, size, fontSize] = tiers.find(([minimum]) => count >= minimum);
  return L.divIcon({
    html: `<div data-pnm-cluster-count="${count}" aria-hidden="true" class="pnm-painted-cluster${count >= 50 ? ' pnm-painted-cluster--dense' : ''}" style="--pnm-cluster-size:${size}px;--pnm-cluster-font:${fontSize}px;"><span>${count}</span></div>`,
    className: compact ? 'vmp-cluster-icon' : 'venue-cluster-icon',
    iconSize: [size, size],
  });
}

/**
 * Keep Leaflet keyboard targets aligned with the pixels a user can actually
 * see. MarkerCluster can retain icon nodes just outside the clipped map pane,
 * which otherwise lets a fullscreen focus trap tab to an invisible venue.
 * Only nodes Leaflet already made keyboard-enabled are managed here, so a
 * deliberately decorative marker never becomes interactive.
 */
export function syncPokerMapKeyboardTargets(container) {
  if (!container?.querySelectorAll || !container?.getBoundingClientRect) {
    return { visible: 0, hidden: 0 };
  }

  const viewport = container.getBoundingClientRect();
  let visible = 0;
  let hidden = 0;

  container.querySelectorAll('.leaflet-marker-icon[tabindex]').forEach((target) => {
    const countNode = target.querySelector?.('[data-pnm-cluster-count]');
    const count = Number(countNode?.getAttribute?.('data-pnm-cluster-count'));
    if (Number.isFinite(count) && count > 0) {
      const label = `Zoom to ${count} poker locations`;
      if (target.getAttribute('aria-label') !== label) target.setAttribute('aria-label', label);
      if (target.getAttribute('title') !== label) target.setAttribute('title', label);
    }

    const rect = target.getBoundingClientRect();
    const hasArea = rect.right > rect.left && rect.bottom > rect.top;
    const inViewport = hasArea
      && rect.right > viewport.left
      && rect.left < viewport.right
      && rect.bottom > viewport.top
      && rect.top < viewport.bottom;
    const nextTabIndex = inViewport ? 0 : -1;
    if (target.tabIndex !== nextTabIndex) target.tabIndex = nextTabIndex;
    if (inViewport) visible += 1;
    else hidden += 1;
  });

  return { visible, hidden };
}

export function createPokerUserLocationIcon(L) {
  return L.divIcon({
    className: 'user-location-pin',
    html: '<span class="pnm-painted-user-location" aria-hidden="true"></span>',
    iconSize: [40, 40],
    iconAnchor: [20, 40],
    popupAnchor: [0, -40],
  });
}

function venueDetailPath(venue) {
  if (venue?.detailUrl && /^\/(?!\/)/.test(venue.detailUrl)) return venue.detailUrl;
  return venue?.is_social_page
    ? `/club/${encodeURIComponent(venue.social_page_id || '')}`
    : `/hub/venues/${encodeURIComponent(venue?.id || '')}`;
}

function trustLevel(score) {
  if (score >= 4.5) return { label: 'Excellent', color: '#c8ffd2' };
  if (score >= 4) return { label: 'Good', color: '#45adff' };
  if (score >= 3) return { label: 'Moderate', color: '#d6ad52' };
  return { label: 'Unrated', color: '#9aa5b3' };
}

function paintedMapDossier(body, { accent = '#48c7ff', compact = false, kind = 'venue' } = {}) {
  return `<div class="pnm-map-dossier pnm-map-dossier--${kind}${compact ? ' pnm-map-dossier--compact' : ''}" data-pnm-console="painted-panel-v1" style="--pnm-map-accent:${accent};"><span class="pnm-map-dossier__head" aria-hidden="true"></span><div class="pnm-map-dossier__body">${body}</div><span class="pnm-map-dossier__foot" aria-hidden="true"></span></div>`;
}

export function buildPokerVenuePopupHtml(venue, options = {}) {
  const compact = options.variant === 'compact';
  const theme = pokerVenueTheme(venue?.venue_type, options.overrideColor);
  const type = escapeHtml(POKER_VENUE_TYPE_LABELS[venue?.venue_type] || venue?.venue_type || 'Poker Venue');
  const name = escapeHtml(venue?.name || 'Poker venue');
  const city = escapeHtml(venue?.city || '');
  const state = escapeHtml(venue?.state || '');
  const logo = escapeHtml(venueLogo(venue));
  const liveGames = Array.isArray(venue?.live_data?.games) ? venue.live_data.games : [];
  const cashLabel = cashGameCountLabel(venue?.live_data);
  const modeledCash = isModeledCashGameData(venue?.live_data);
  const catalogCash = venue?.live_data?.data_mode === 'catalog';
  const unavailableCash = venue?.live_data?.live_count_known === false && !catalogCash;
  const gameLabels = liveGames.slice(0, 3).map((game) => {
    if (typeof game === 'string') return game;
    if (game?.observation_kind === 'catalog' || game?.live_count_known === false) {
      return `${game?.game || 'Cash game'}: live count unknown`;
    }
    const count = Number(game?.tables_running) || 0;
    return `${game?.game || 'Cash game'}: ${game?.is_simulated ? 'approx. ' : ''}${count}`;
  });
  const open = getOpenStatus(venue);
  const status = open?.open === true ? 'OPEN' : open?.open === false ? 'CLOSED' : '';
  const trust = trustLevel(Number(venue?.trust_score));
  const detailPath = escapeHtml(venueDetailPath(venue));
  const address = encodeURIComponent(`${venue?.address || ''} ${venue?.name || ''} ${venue?.city || ''} ${venue?.state || ''}`.trim());
  const phone = venue?.phone ? String(venue.phone).replace(/[^0-9+\-.() ]/g, '') : '';
  const distance = Number.isFinite(venue?._distanceMi)
    ? `<span class="pnm-map-dossier__distance">${venue._distanceMi < 1 ? '&lt;1 mi' : `${venue._distanceMi.toFixed(1)} mi`}</span>`
    : '';
  const body = `<div class="pnm-map-dossier__identity"><span class="pnm-map-dossier__logo-machine"><img src="${logo}" alt="" onerror="this.src='${DEFAULT_LOGO}';" /></span><div class="pnm-map-dossier__identity-copy"><strong>${name}</strong><span>${city}${city && state ? ', ' : ''}${state}${distance}</span></div></div><div class="pnm-map-dossier__signals"><span class="pnm-map-dossier__signal pnm-map-dossier__signal--type">${type}</span>${status ? `<span class="pnm-map-dossier__signal pnm-map-dossier__signal--${status.toLowerCase()}">${status}</span>` : ''}${cashLabel ? `<span class="pnm-map-dossier__cash" data-cash-truth="${catalogCash || unavailableCash ? 'unavailable' : modeledCash ? 'modeled' : 'observed'}">${escapeHtml(cashLabel)}</span>` : ''}</div>${gameLabels.length ? `<p class="pnm-map-dossier__games">${escapeHtml(gameLabels.join(', '))}</p>` : ''}${compact ? '' : `<p class="pnm-map-dossier__trust" style="--pnm-trust-color:${trust.color};">Trust: ${trust.label}${venue?.trust_score ? ` (${escapeHtml(String(venue.trust_score))}/5)` : ''}</p>`}<div class="pnm-map-dossier__actions"><button class="fsp-trigger pnm-map-dossier__action pnm-map-dossier__action--primary" data-url="${detailPath}" data-title="${name}">View Details</button><button class="directions-trigger pnm-map-dossier__action pnm-map-dossier__action--secondary" data-addr="${address}" data-lat="${Number(venue?.latitude)}" data-lng="${Number(venue?.longitude)}">Directions</button>${!compact && phone ? `<a class="pnm-map-dossier__action pnm-map-dossier__action--call" href="tel:${escapeHtml(phone)}">Call</a>` : ''}</div>`;
  return paintedMapDossier(body, { accent: theme.fill, compact });
}

export function buildPokerTourPopupHtml(venue, options = {}) {
  const compact = options.variant === 'compact';
  const color = pokerTourColor(venue?.tour_code);
  const code = escapeHtml(String(venue?.tour_code || 'TOUR').slice(0, 8));
  const name = escapeHtml(venue?.tour_name || venue?.tour_code || venue?.name || 'Poker Tour');
  const stop = escapeHtml(venue?.stop_name || venue?.name || 'Tour Stop');
  const city = escapeHtml(venue?.city || '');
  const state = escapeHtml(venue?.state || '');
  const logo = venue?.logo_url ? escapeHtml(venue.logo_url) : DEFAULT_LOGO;
  const tourPath = escapeHtml(`/hub/tours/${encodeURIComponent(venue?.tour_code || '')}`);
  const address = encodeURIComponent(`${venue?.city || ''}, ${venue?.state || ''}`);
  const body = `<div class="pnm-map-dossier__identity"><span class="pnm-map-dossier__logo-machine"><img src="${logo}" alt="" onerror="this.src='${DEFAULT_LOGO}';" /></span><div class="pnm-map-dossier__identity-copy"><strong>${name}</strong><span>${city}${city && state ? ', ' : ''}${state}</span></div></div><div class="pnm-map-dossier__signals"><span class="pnm-map-dossier__signal pnm-map-dossier__signal--type">${code}</span><span class="pnm-map-dossier__signal pnm-map-dossier__signal--${venue?.is_running ? 'open' : 'upcoming'}">${venue?.is_running ? 'IN PROGRESS' : 'UPCOMING'}</span></div><p class="pnm-map-dossier__stop">${stop}</p>${venue?.dates ? `<p class="pnm-map-dossier__dates">${escapeHtml(venue.dates)}</p>` : ''}<div class="pnm-map-dossier__actions"><button class="fsp-trigger pnm-map-dossier__action pnm-map-dossier__action--primary" data-url="${tourPath}" data-title="${name}">View Tour</button><button class="directions-trigger pnm-map-dossier__action pnm-map-dossier__action--secondary" data-addr="${address}" data-lat="${Number(venue?.latitude)}" data-lng="${Number(venue?.longitude)}">Directions</button></div>`;
  return paintedMapDossier(body, { accent: color, compact, kind: 'tour' });
}

/** Painted dossier for the viewer's own position (no venue actions). */
export function buildPokerUserLocationPopupHtml({ title = 'Your Location', detail = '' } = {}) {
  const body = `<div class="pnm-map-dossier__identity"><span class="pnm-map-dossier__location-machine" aria-hidden="true"></span><div class="pnm-map-dossier__identity-copy"><strong>${escapeHtml(title)}</strong>${detail ? `<span>${escapeHtml(detail)}</span>` : ''}</div></div>`;
  return paintedMapDossier(body, { compact: true, kind: 'location' });
}

/** Painted dossier for a single venue's own location map (venue profile). */
export function buildPokerVenueLocationPopupHtml(venue) {
  const name = escapeHtml(venue?.name || 'Poker Venue');
  const place = escapeHtml([venue?.city, venue?.state].filter(Boolean).join(', '));
  const logo = escapeHtml(venueLogo(venue));
  const body = `<div class="pnm-map-dossier__identity"><span class="pnm-map-dossier__logo-machine"><img src="${logo}" alt="" onerror="this.src='${DEFAULT_LOGO}';" /></span><div class="pnm-map-dossier__identity-copy"><strong>${name}</strong>${place ? `<span>${place}</span>` : ''}</div></div>`;
  return paintedMapDossier(body, { compact: true, kind: 'venue-location' });
}

export function pokerRouteStopRole(index, total) {
  if (Number(index) === 0) return 'origin';
  if (Number(index) === Number(total) - 1) return 'destination';
  return 'waypoint';
}

function pokerRouteStopTitle(index, total) {
  const role = pokerRouteStopRole(index, total);
  if (role === 'origin') return 'Trip Start';
  if (role === 'destination') return 'Destination';
  return 'Waypoint';
}

/**
 * Road-trip stop marker: the painted marker machine with the live stop number
 * printed inside it. Geometry keeps the 44px touch floor and a centred anchor.
 */
export function createPokerRouteStopIcon(L, stop, index, total) {
  const role = pokerRouteStopRole(index, total);
  const label = escapeHtml(truncatePokerMapLabel(stop?.name, 22));
  const labelHtml = label
    ? `<span class="pnm-map-marker-label pnm-map-marker-label--route"><span>${label}</span></span>`
    : '';
  return L.divIcon({
    className: 'trip-stop-marker pnm-route-stop-marker',
    html: `<div class="pnm-painted-marker pnm-painted-route-stop pnm-painted-route-stop--${role}" data-pnm-route-role="${role}" style="--pnm-marker-label-width:140px;"><span class="pnm-painted-marker__machine"><span class="pnm-painted-route-stop__number">${Number(index) + 1}</span></span>${labelHtml}</div>`,
    iconSize: [44, 44],
    iconAnchor: [22, 22],
    popupAnchor: [0, -24],
  });
}

export function buildPokerRouteStopPopupHtml(stop, index, total) {
  const role = pokerRouteStopRole(index, total);
  const name = escapeHtml(stop?.name || 'Route Stop');
  const body = `<div class="pnm-map-dossier__identity"><span class="pnm-map-dossier__logo-machine pnm-map-dossier__logo-machine--route" aria-hidden="true"><span class="pnm-painted-route-stop__number pnm-painted-route-stop--${role}">${Number(index) + 1}</span></span><div class="pnm-map-dossier__identity-copy"><strong>${name}</strong><span>${pokerRouteStopTitle(index, total)} · Stop ${Number(index) + 1} Of ${Number(total)}</span></div></div>`;
  return paintedMapDossier(body, { compact: true, kind: 'route-stop' });
}

const POPUP_EDGE_GAP = 6;
const POPUP_MARKER_CLEARANCE = 56;

/**
 * Keep an open dossier fully inside the visible map and clear of its controls.
 *
 * Leaflet's autoPan cannot help when the map refuses to move: the national
 * map is fenced by maxBounds, so a pin near the northern border pans back
 * and its dossier was left cut off under the map edge (and, in fullscreen,
 * behind the header). After every open and every settled move this prints the
 * dossier below its pin when there is no room above, nudges it sideways away
 * from a clipped edge or from the zoom rail / preference trigger, and lets the
 * coverage HUD and legend step aside while a dossier would sit under them.
 * Only the popup's own margins and one surface data flag change; the map
 * view, markers and data are untouched. Returns a detach function.
 */
export function attachPokerPopupViewportGuard(map) {
  if (!map || typeof map.on !== 'function' || typeof window === 'undefined') return () => {};
  let current = null;
  let frame = 0;

  const surfaceOf = () => {
    const container = map.getContainer?.();
    return container?.closest?.('.pnm-map-surface') || null;
  };
  const clearCovering = () => {
    const surface = surfaceOf();
    if (surface?.dataset?.pnmPopupCovering) delete surface.dataset.pnmPopupCovering;
  };

  const place = () => {
    frame = 0;
    const element = current?.getElement?.();
    const container = map.getContainer?.();
    if (!element || !container || !current.isOpen?.()) return;
    const previousBelow = Number(element.dataset.pnmPopupBelow || 0);
    const previousSide = Number(element.dataset.pnmPopupSide || 0);
    const bounds = container.getBoundingClientRect();
    const rect = element.getBoundingClientRect();
    if (!rect.height || !bounds.height) return;
    // Natural (unshifted) geometry, so repeated passes never accumulate.
    const naturalTop = rect.top - previousBelow;
    const naturalLeft = rect.left - previousSide;

    let below = 0;
    if (naturalTop < bounds.top + POPUP_EDGE_GAP) {
      below = Math.round(rect.height + POPUP_MARKER_CLEARANCE);
    }
    const top = naturalTop + below;
    const bottom = top + rect.height;

    const surface = surfaceOf();
    let leftLimit = bounds.left + POPUP_EDGE_GAP;
    let rightLimit = bounds.right - POPUP_EDGE_GAP;
    (surface || container).querySelectorAll?.('.leaflet-control-zoom, .map-pref-wrapper').forEach((control) => {
      const box = control.getBoundingClientRect();
      if (!box.width || box.bottom <= top || box.top >= bottom) return;
      if (box.left - bounds.left < bounds.width / 2) leftLimit = Math.max(leftLimit, box.right + POPUP_EDGE_GAP);
      else rightLimit = Math.min(rightLimit, box.left - POPUP_EDGE_GAP);
    });
    let side = 0;
    if (rect.width <= rightLimit - leftLimit) {
      if (naturalLeft < leftLimit) {
        side = Math.round(leftLimit - naturalLeft);
      } else if (naturalLeft + rect.width > rightLimit) {
        side = -Math.round(naturalLeft + rect.width - rightLimit);
      }
    }

    if (below !== previousBelow) {
      element.dataset.pnmPopupBelow = String(below);
      element.style.marginBottom = below ? `${-below}px` : '';
      element.classList.toggle('pnm-popup--below', below > 0);
    }
    if (side !== previousSide) {
      element.dataset.pnmPopupSide = String(side);
      element.style.marginLeft = side ? `${side}px` : '';
    }

    if (surface) {
      const left = naturalLeft + side;
      const right = left + rect.width;
      const covering = Array.from(surface.querySelectorAll(
        '.pnm-map-overlay-stack > *, .pnm-map-stage > .pnm-map-coverage--overlay',
      )).some((hud) => {
        const box = hud.getBoundingClientRect();
        return box.width > 0 && box.height > 0
          && left < box.right && right > box.left && top < box.bottom && bottom > box.top;
      });
      if (covering) surface.dataset.pnmPopupCovering = 'true';
      else if (surface.dataset.pnmPopupCovering) delete surface.dataset.pnmPopupCovering;
    }
  };

  const schedule = () => {
    if (frame) window.cancelAnimationFrame(frame);
    frame = window.requestAnimationFrame(place);
  };
  const handleOpen = (event) => {
    current = event?.popup || null;
    const element = current?.getElement?.();
    if (element) {
      element.dataset.pnmPopupBelow = '0';
      element.dataset.pnmPopupSide = '0';
      element.style.marginBottom = '';
      element.style.marginLeft = '';
      element.classList.remove('pnm-popup--below');
    }
    schedule();
  };
  const handleClose = (event) => {
    if (!event?.popup || event.popup === current) {
      current = null;
      clearCovering();
    }
  };

  map.on('popupopen', handleOpen);
  map.on('popupclose', handleClose);
  map.on('moveend zoomend resize', schedule);
  return () => {
    if (frame) window.cancelAnimationFrame(frame);
    map.off('popupopen', handleOpen);
    map.off('popupclose', handleClose);
    map.off('moveend zoomend resize', schedule);
    clearCovering();
    current = null;
  };
}

export function createPokerPopupClickHandler({ onOpenDetails } = {}) {
  return function handlePokerPopupClick(event) {
    const target = event?.target;
    if (!target || typeof target.closest !== 'function') return;
    const details = target.closest('.fsp-trigger');
    if (details) {
      event.preventDefault();
      const path = details.getAttribute('data-url');
      if (!path || !/^\/(?!\/)/.test(path)) return;
      const title = details.getAttribute('data-title') || 'Poker venue';
      if (typeof onOpenDetails === 'function') onOpenDetails(path, title);
      else window.location.assign(path);
      return;
    }
    const directions = target.closest('.directions-trigger');
    if (directions) {
      event.preventDefault();
      event.stopPropagation();
      openNativeMaps({
        address: decodeURIComponent(directions.getAttribute('data-addr') || ''),
        lat: Number.parseFloat(directions.getAttribute('data-lat')),
        lng: Number.parseFloat(directions.getAttribute('data-lng')),
        mode: 'directions',
      });
      return;
    }
    const viewMap = target.closest('.viewmap-trigger');
    if (viewMap) {
      event.preventDefault();
      event.stopPropagation();
      openNativeMaps({ address: decodeURIComponent(viewMap.getAttribute('data-addr') || ''), mode: 'search' });
    }
  };
}

export function createPokerVenueGeographySignature(venues, { userLocation, radiusMiles } = {}) {
  const coordinates = (venues || [])
    .map((venue) => `${venue?.id || venue?.name || ''}:${venue?.latitude},${venue?.longitude}`)
    .sort()
    .join('|');
  return [coordinates, userLocation ? `${userLocation.lat},${userLocation.lng}` : '', radiusMiles ?? ''].join('#');
}

export function createPokerVenueContentSignature(venues, options = {}) {
  const rows = (venues || []).map((venue) => {
    const values = SIGNATURE_FIELDS.map((field) => stableSignatureValue(venue?.[field]));
    values.push(stableSignatureValue(venue?.games_offered || []));
    values.push(stableSignatureValue(venue?.live_data || {}));
    values.push(options.isFavorited?.('venue', venue?.id) ? 1 : 0);
    return values.join(':');
  }).sort().join('|');
  return [rows, options.overrideColor || '', createPokerVenueGeographySignature(venues, options)].join('##');
}

export const pokerMapPresentationContract = Object.freeze({
  iconVariants: ['primary', 'compact'],
  popupVariants: ['primary', 'compact'],
  sameOriginPopupNavigation: true,
  deterministicMarkerSignatures: true,
});
