import { escapeHtml, getOpenStatus } from './pnm-utils.js';
import { openNativeMaps } from '../../utils/openNativeMaps.js';

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
  casino: { fill: '#ffffff', glow: 'rgba(255,255,255,0.6)', badgeBg: 'rgba(255,255,255,0.15)' },
  card_room: { fill: '#22c55e', glow: 'rgba(34,197,94,0.5)', badgeBg: 'rgba(34,197,94,0.15)' },
  poker_club: { fill: '#22c55e', glow: 'rgba(34,197,94,0.5)', badgeBg: 'rgba(34,197,94,0.15)' },
  charity: { fill: '#3b82f6', glow: 'rgba(59,130,246,0.5)', badgeBg: 'rgba(59,130,246,0.15)' },
  home_game: { fill: '#94a3b8', glow: 'rgba(148,163,184,0.6)', badgeBg: 'rgba(148,163,184,0.15)' },
  tour_stop: { fill: '#ef4444', glow: 'rgba(239,68,68,0.5)', badgeBg: 'rgba(239,68,68,0.15)' },
  poker_tour: { fill: '#ef4444', glow: 'rgba(239,68,68,0.5)', badgeBg: 'rgba(239,68,68,0.15)' },
});

export const POKER_TOUR_COLORS = Object.freeze({
  WSOP: '#c9a227', WPT: '#dc2626', WSOPC: '#c9a227', MSPT: '#3b82f6', RGPS: '#10b981',
  PGT: '#8b5cf6', NAPT: '#f87171', BPO: '#38bdf8', FPN: '#818cf8', LIPS: '#ec4899',
  ROUGHRIDER: '#d97706', PAT: '#22c55e', GCPT: '#06b6d4',
});

const DEFAULT_LOGO = '/smarter-poker-logo-nobg.png';
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
  return venue?.avatar_url || venue?.logo_url || venue?.profile_photo_url
    || venue?.cover_photo_url || venue?.image_url || DEFAULT_LOGO;
}

export function createPokerVenueIcon(L, venue, options = {}) {
  const compact = options.variant === 'compact';
  const size = compact ? 40 : 44;
  const labelMax = compact ? 20 : 22;
  const maxWidth = compact ? 120 : 140;
  const labelClass = compact ? 'vmp-pin-label' : 'venue-pin-label';
  const className = compact ? 'vmp-venue-marker' : 'venue-map-marker';
  const theme = pokerVenueTheme(venue?.venue_type, options.overrideColor);
  const label = escapeHtml(truncatePokerMapLabel(venue?.name, labelMax));
  const logo = escapeHtml(venueLogo(venue));
  const labelHtml = label
    ? `<div class="${labelClass}" style="position:absolute;top:110%;left:50%;transform:translateX(-50%);background:rgba(0,0,0,0.85);backdrop-filter:blur(4px);color:#fff;padding:${compact ? '2px 7px' : '3px 8px'};border-radius:12px;font-size:${compact ? 9 : 10}px;font-weight:800;white-space:nowrap;border:1px solid ${theme.fill}60;box-shadow:0 2px 8px rgba(0,0,0,0.9);text-shadow:0 1px 2px #000;letter-spacing:0.3px;z-index:999;max-width:${maxWidth}px;overflow:hidden;text-overflow:ellipsis;">${label}</div>`
    : '';

  return L.divIcon({
    className,
    html: `<div style="position:relative;width:${size}px;height:${size}px;"><div style="position:absolute;inset:0;border-radius:50%;background:#fff;border:2.5px solid ${theme.fill};box-shadow:0 0 12px ${theme.fill}80,0 3px 10px rgba(0,0,0,0.7);overflow:hidden;display:flex;align-items:center;justify-content:center;"><img src="${logo}" alt="" style="width:100%;height:100%;object-fit:cover;border-radius:50%;background:#fff;" onerror="this.src='${DEFAULT_LOGO}';" /></div>${labelHtml}</div>`,
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
  const circleSize = compact ? 32 : 36;
  const overlap = compact ? 8 : 0;
  const width = compact ? circleSize + 4 : circleSize + 16;
  const height = compact ? (circleSize * 2) - overlap + 4 : circleSize + 16;
  const top = compact ? 0 : 8;
  const left = (width - circleSize) / 2;
  const showPulse = !compact || venue?.is_running;
  const pulse = showPulse
    ? `<div style="position:absolute;top:${top - 4}px;left:${left - 4}px;width:${circleSize + 8}px;height:${circleSize + 8}px;border-radius:50%;border:2px solid ${color};opacity:0.6;animation:markerPulse 2s ease-in-out infinite;z-index:4;"></div>`
    : '';
  const tourInner = logo
    ? `<img src="${logo}" alt="" style="width:100%;height:100%;object-fit:cover;border-radius:50%;" onerror="this.style.display='none';this.nextElementSibling.style.display='flex';" /><div style="display:none;font-size:${compact ? 9 : 10}px;font-weight:900;color:${color};letter-spacing:0.5px;">${code}</div>`
    : `<div style="font-size:${compact ? 9 : 10}px;font-weight:900;color:${color};letter-spacing:0.5px;">${code}</div>`;
  const hostName = venue?.host_venue_name || venue?.stop_venue || '';
  const hostCircle = compact && hostName
    ? `<div style="position:absolute;top:${circleSize - overlap}px;left:${left}px;width:${circleSize}px;height:${circleSize}px;border-radius:50%;background:#fff;border:2.5px solid #94a3b8;box-shadow:0 0 8px rgba(148,163,184,0.5),0 3px 10px rgba(0,0,0,0.7);overflow:hidden;z-index:1;"><img src="${escapeHtml(venue?.host_venue_logo_url || DEFAULT_LOGO)}" alt="" style="width:100%;height:100%;object-fit:cover;border-radius:50%;" onerror="this.src='${DEFAULT_LOGO}';" /></div>`
    : '';
  const labelClass = compact ? 'vmp-pin-label' : 'venue-pin-label';
  const tourLabel = escapeHtml(venue?.tour_name || venue?.tour_code || 'Poker Tour');
  const stopLabel = escapeHtml(truncatePokerMapLabel(venue?.stop_venue || venue?.stop_name || '', 22));
  const label = `<div class="${labelClass}" style="position:absolute;top:100%;left:50%;transform:translateX(-50%);margin-top:4px;background:rgba(0,0,0,0.88);backdrop-filter:blur(6px);color:#fff;padding:3px ${compact ? 8 : 10}px 4px;border-radius:10px;font-weight:800;white-space:nowrap;border:1px solid ${color}60;box-shadow:0 2px 10px rgba(0,0,0,0.9),0 0 6px ${color}30;z-index:999;max-width:${compact ? 160 : 180}px;text-align:center;"><div style="font-size:${compact ? 9 : 10}px;color:${color};font-weight:900;overflow:hidden;text-overflow:ellipsis;">${tourLabel}</div>${stopLabel ? `<div style="font-size:${compact ? 8 : 8.5}px;color:rgba(200,214,229,0.65);font-weight:600;overflow:hidden;text-overflow:ellipsis;">${stopLabel}</div>` : ''}</div>`;

  return L.divIcon({
    className: compact ? 'vmp-venue-marker' : 'tour-logo-marker',
    html: `<div style="position:relative;width:${width}px;height:${height}px;">${pulse}<div style="position:absolute;top:${top}px;left:${left}px;width:${circleSize}px;height:${circleSize}px;border-radius:50%;background:#fff;border:2.5px solid ${compact ? color : '#ef4444'};box-shadow:0 0 14px ${color}80,0 3px 10px rgba(0,0,0,0.7);overflow:hidden;display:flex;align-items:center;justify-content:center;z-index:3;">${tourInner}</div>${hostCircle}${label}</div>`,
    iconSize: [width, height],
    iconAnchor: [width / 2, height / 2],
    popupAnchor: [0, -(height / 2)],
  });
}

export function createPokerClusterIcon(L, cluster, options = {}) {
  const compact = options.variant === 'compact';
  const count = cluster.getChildCount();
  const tiers = compact
    ? [[100, 54, 14, 3], [50, 46, 13, 2.5], [20, 40, 12, 2], [10, 34, 11, 2], [0, 28, 10, 2]]
    : [[100, 58, 15, 3], [50, 48, 14, 2.5], [20, 42, 13, 2], [10, 36, 12, 2], [0, 30, 11, 2]];
  const [, size, fontSize, borderWidth] = tiers.find(([minimum]) => count >= minimum);
  const intense = count >= 50;
  const gradient = count >= 100
    ? 'linear-gradient(135deg,#fff 0%,#e2e8f0 50%,#8b6914 100%)'
    : count >= 50
      ? 'linear-gradient(135deg,#f0d48a 0%,#fff 50%,#e2e8f0 100%)'
      : count >= 20
        ? 'linear-gradient(135deg,rgba(255,255,255,.9),rgba(184,134,11,.85))'
        : 'linear-gradient(135deg,rgba(255,255,255,.75),rgba(184,134,11,.7))';
  return L.divIcon({
    html: `<div style="width:${size}px;height:${size}px;border-radius:50%;background:${gradient};border:${borderWidth}px solid ${compact ? 'rgba(255,255,255,.9)' : '#94a3b8'};display:flex;align-items:center;justify-content:center;font-size:${fontSize}px;font-weight:800;color:${intense ? '#000' : '#1a1a2e'};box-shadow:0 0 ${size / 2}px rgba(255,255,255,.35),0 4px 16px rgba(0,0,0,.5),inset 0 -2px 4px rgba(0,0,0,.2);font-family:Inter,-apple-system,sans-serif;">${count}</div>`,
    className: compact ? 'vmp-cluster-icon' : 'venue-cluster-icon',
    iconSize: [size, size],
  });
}

export function createPokerUserLocationIcon(L) {
  return L.divIcon({
    className: 'user-location-pin',
    html: '<div style="filter:drop-shadow(0 4px 6px rgba(0,0,0,.6));"><svg width="40" height="40" viewBox="0 0 24 24" fill="#ef4444" stroke="#fff" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"></path><circle cx="12" cy="10" r="4" fill="#fff" stroke="none"></circle></svg></div>',
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
  if (score >= 4.5) return { label: 'Excellent', color: '#22c55e' };
  if (score >= 4) return { label: 'Good', color: '#3b82f6' };
  if (score >= 3) return { label: 'Moderate', color: '#f59e0b' };
  return { label: 'Unrated', color: '#94a3b8' };
}

export function buildPokerVenuePopupHtml(venue, options = {}) {
  const compact = options.variant === 'compact';
  const theme = pokerVenueTheme(venue?.venue_type, options.overrideColor);
  const type = escapeHtml(POKER_VENUE_TYPE_LABELS[venue?.venue_type] || venue?.venue_type || 'Poker Venue');
  const name = escapeHtml(venue?.name || 'Poker venue');
  const city = escapeHtml(venue?.city || '');
  const state = escapeHtml(venue?.state || '');
  const logo = escapeHtml(venueLogo(venue));
  const liveTables = Number(venue?.live_data?.tables_running) || 0;
  const liveGames = Array.isArray(venue?.live_data?.games) ? venue.live_data.games : [];
  const open = getOpenStatus(venue);
  const status = open?.open === true ? 'OPEN' : open?.open === false ? 'CLOSED' : '';
  const trust = trustLevel(Number(venue?.trust_score));
  const detailPath = escapeHtml(venueDetailPath(venue));
  const address = encodeURIComponent(`${venue?.address || ''} ${venue?.name || ''} ${venue?.city || ''} ${venue?.state || ''}`.trim());
  const phone = venue?.phone ? String(venue.phone).replace(/[^0-9+\-.() ]/g, '') : '';
  const distance = Number.isFinite(venue?._distanceMi)
    ? `<span style="margin-left:auto;font-size:10px;color:#94a3b8;">${venue._distanceMi < 1 ? '<1 mi' : `${venue._distanceMi.toFixed(1)} mi`}</span>`
    : '';
  return `<div style="min-width:${compact ? 210 : 240}px;max-width:320px;padding:${compact ? '14px 16px 12px' : '16px 18px 14px'};"><div style="display:flex;align-items:center;gap:10px;margin-bottom:8px;"><img src="${logo}" alt="" style="width:${compact ? 32 : 36}px;height:${compact ? 32 : 36}px;border-radius:8px;object-fit:cover;background:#fff;border:1px solid rgba(255,255,255,.25);" onerror="this.src='${DEFAULT_LOGO}';" /><div style="flex:1;min-width:0;"><div style="font-size:${compact ? 14 : 15}px;font-weight:700;color:#fff;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${name}</div><div style="display:flex;gap:6px;font-size:10px;color:#94a3b8;">${city}${city && state ? ', ' : ''}${state}${distance}</div></div></div><div style="display:flex;gap:6px;align-items:center;flex-wrap:wrap;margin-bottom:8px;"><span style="padding:3px 9px;border-radius:6px;background:${theme.badgeBg};color:${theme.fill};font-size:10px;font-weight:700;">${type}</span>${status ? `<span style="padding:3px 8px;border-radius:5px;background:${status === 'OPEN' ? 'rgba(34,197,94,.14)' : 'rgba(239,68,68,.12)'};color:${status === 'OPEN' ? '#22c55e' : '#ef4444'};font-size:10px;font-weight:800;">${status}</span>` : ''}${liveTables > 0 ? `<span style="font-size:10px;color:#4ade80;font-weight:700;">${liveTables} live table${liveTables === 1 ? '' : 's'}</span>` : ''}</div>${liveGames.length ? `<div style="font-size:10px;color:#94a3b8;margin-bottom:8px;">${escapeHtml(liveGames.slice(0, 3).join(', '))}</div>` : ''}${compact ? '' : `<div style="font-size:10px;color:${trust.color};margin-bottom:10px;">Trust: ${trust.label}${venue?.trust_score ? ` (${escapeHtml(String(venue.trust_score))}/5)` : ''}</div>`}<div style="display:flex;gap:6px;flex-wrap:wrap;"><button class="fsp-trigger" data-url="${detailPath}" data-title="${name}" style="flex:1;padding:8px 12px;border-radius:7px;background:#fff;color:#05070b;font-size:11px;font-weight:800;border:none;cursor:pointer;">View Details</button><button class="directions-trigger" data-addr="${address}" data-lat="${Number(venue?.latitude)}" data-lng="${Number(venue?.longitude)}" style="padding:8px 12px;border-radius:7px;background:rgba(255,255,255,.08);color:#fff;font-size:11px;font-weight:700;border:1px solid rgba(255,255,255,.14);cursor:pointer;">Directions</button>${!compact && phone ? `<a href="tel:${escapeHtml(phone)}" style="padding:8px 10px;border-radius:7px;color:#4ade80;border:1px solid rgba(34,197,94,.2);font-size:11px;text-decoration:none;">Call</a>` : ''}</div></div>`;
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
  return `<div style="min-width:${compact ? 220 : 240}px;max-width:320px;padding:${compact ? '14px 16px 12px' : '16px 18px 14px'};border-top:3px solid #ef4444;"><div style="display:flex;align-items:center;gap:10px;margin-bottom:10px;"><img src="${logo}" alt="" style="width:${compact ? 34 : 40}px;height:${compact ? 34 : 40}px;border-radius:8px;object-fit:cover;background:#fff;" onerror="this.src='${DEFAULT_LOGO}';" /><div><div style="font-size:14px;font-weight:800;color:#fff;">${name}</div><div style="font-size:10px;color:#94a3b8;">${city}${city && state ? ', ' : ''}${state}</div></div></div><div style="display:flex;gap:7px;margin-bottom:9px;"><span style="padding:3px 8px;border-radius:5px;background:${color}20;color:${color};font-size:10px;font-weight:800;">${code}</span><span style="padding:3px 8px;border-radius:5px;background:${venue?.is_running ? 'rgba(34,197,94,.14)' : 'rgba(59,130,246,.12)'};color:${venue?.is_running ? '#22c55e' : '#60a5fa'};font-size:10px;font-weight:800;">${venue?.is_running ? 'LIVE NOW' : 'UPCOMING'}</span></div><div style="font-size:12px;color:#fff;margin-bottom:9px;">${stop}</div>${venue?.dates ? `<div style="font-size:10px;color:#4ade80;margin-bottom:10px;">${escapeHtml(venue.dates)}</div>` : ''}<div style="display:flex;gap:6px;"><button class="fsp-trigger" data-url="${tourPath}" data-title="${name}" style="flex:1;padding:8px 12px;border-radius:7px;background:${color};color:#05070b;font-size:11px;font-weight:800;border:none;cursor:pointer;">View Tour</button><button class="directions-trigger" data-addr="${address}" data-lat="${Number(venue?.latitude)}" data-lng="${Number(venue?.longitude)}" style="padding:8px 12px;border-radius:7px;background:rgba(255,255,255,.08);color:#fff;font-size:11px;font-weight:700;border:1px solid rgba(255,255,255,.14);cursor:pointer;">Directions</button></div></div>`;
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
