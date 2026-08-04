/**
 * Venue Map — Premium US-Only Leaflet Map with Neon Markers
 * ═══════════════════════════════════════════════════════════
 * - Black mask hides everything outside the continental US
 * - Subtle gold state boundary lines
 * - Glowing venue markers with venue-type coloring
 * - Gradient cluster orbs with size tiers
 * - Futuristic Metal themed popups and controls
 * 
 * Dependencies:
 * - Leaflet (loaded dynamically via script injection)
 * - leaflet.markercluster (loaded dynamically)
 * - Dark tile layer from CartoDB
 * - /public/data/us-states-simplified.json
 * - /public/data/us-mask-outer.json
 */

import React, { useRef, useState, useEffect, useCallback } from 'react';
import { radiusToZoom, escapeHtml, getOpenStatus } from './pnm-utils';
import { openNativeMaps } from '../../utils/openNativeMaps';
import MapPreferenceChooser from './MapPreferenceChooser';

// ─── Constants ───
const VENUE_TYPE_LABELS = {
  casino: 'Casino',
  card_room: 'Poker Club',
  poker_club: 'Poker Club',
  home_game: 'Home Game',
  charity: 'Charity',
  tour_stop: 'Poker Tour',
  poker_tour: 'Poker Tour'
};

// Venue type → marker color
const VENUE_TYPE_COLORS = {
  casino: { fill: '#ffffff', glow: 'rgba(255,255,255,0.6)', badgeBg: 'rgba(255,255,255,0.15)', label: 'White' },
  card_room: { fill: '#22c55e', glow: 'rgba(34,197,94,0.5)', badgeBg: 'rgba(34,197,94,0.15)', label: 'Green' },
  poker_club: { fill: '#22c55e', glow: 'rgba(34,197,94,0.5)', badgeBg: 'rgba(34,197,94,0.15)', label: 'Green' },
  charity: { fill: '#3b82f6', glow: 'rgba(59,130,246,0.5)', badgeBg: 'rgba(59,130,246,0.15)', label: 'Blue' },
  home_game: { fill: '#94a3b8', glow: 'rgba(148,163,184,0.6)', badgeBg: 'rgba(148,163,184,0.15)', label: 'Grey' },
  tour_stop: { fill: '#ef4444', glow: 'rgba(239,68,68,0.5)', badgeBg: 'rgba(239,68,68,0.15)', label: 'Red' },
  poker_tour: { fill: '#ef4444', glow: 'rgba(239,68,68,0.5)', badgeBg: 'rgba(239,68,68,0.15)', label: 'Red' },
};
const DEFAULT_VENUE_COLOR = VENUE_TYPE_COLORS.casino;

const GEOFENCE_RADII = {
  casino: 500,
  card_room: 200,
  poker_club: 200,
  charity: 200,
  tour_stop: 300,
  poker_tour: 300,
};
const DEFAULT_GEOFENCE_RADIUS = 300;

function getGeofenceRadius(venueType) {
  return GEOFENCE_RADII[venueType] || DEFAULT_GEOFENCE_RADIUS;
}

function getTrustLevel(score) {
  if (score >= 4.5) return { label: 'Excellent', color: '#22c55e', bg: 'rgba(34,197,94,0.15)' };
  if (score >= 4.0) return { label: 'Good', color: '#3b82f6', bg: 'rgba(59,130,246,0.15)' };
  if (score >= 3.0) return { label: 'Moderate', color: '#f59e0b', bg: 'rgba(245,158,11,0.15)' };
  return { label: 'Low', color: '#ef4444', bg: 'rgba(239,68,68,0.15)' };
}

// ─── Custom CSS for Leaflet elements ───
const LEAFLET_CUSTOM_CSS = `
/* ═══ LEAFLET CONTAINER — Enable map dragging on touch + mouse ═══ */
.leaflet-container {
  touch-action: none !important;
  -ms-touch-action: none !important;
  cursor: grab !important;
}
.leaflet-container:active {
  cursor: grabbing !important;
}
.leaflet-container.leaflet-touch-drag {
  touch-action: none !important;
}
.leaflet-map-pane,
.leaflet-tile-pane {
  touch-action: none !important;
}
/* ═══ PREMIUM MAP CONTROLS ═══ */
.leaflet-control-zoom {
  border: none !important;
  box-shadow: 0 4px 20px rgba(0,0,0,0.5), 0 0 1px rgba(255,255,255,0.3) !important;
  border-radius: 10px !important;
  overflow: hidden !important;
}
.leaflet-control-zoom a {
  background: rgba(10,10,21,0.92) !important;
  color: #ffffff !important;
  border: none !important;
  border-bottom: 1px solid rgba(255,255,255,0.15) !important;
  width: 36px !important;
  height: 36px !important;
  line-height: 36px !important;
  font-size: 18px !important;
  font-weight: 600 !important;
  transition: all 0.2s ease !important;
}
.leaflet-control-zoom a:hover {
  background: rgba(255,255,255,0.15) !important;
  color: #ffffff !important;
}
.leaflet-control-zoom a:last-child {
  border-bottom: none !important;
}

/* ═══ ATTRIBUTION — Smarter.Poker Branding ═══ */
.leaflet-control-attribution {
  background: linear-gradient(90deg, rgba(10,10,21,0.85), rgba(10,10,21,0.7)) !important;
  color: rgba(255,255,255,0.7) !important;
  font-size: 10px !important;
  padding: 3px 10px !important;
  border-radius: 6px 0 0 0 !important;
  font-weight: 600 !important;
  letter-spacing: 0.3px !important;
  font-family: 'Inter', -apple-system, sans-serif !important;
}
.leaflet-control-attribution a {
  color: #ffffff !important;
  text-decoration: none !important;
}

/* ═══ PREMIUM POPUP ═══ */
.leaflet-popup-content-wrapper {
  background: linear-gradient(145deg, rgba(15,23,42,0.98) 0%, rgba(10,10,21,0.99) 100%) !important;
  border-radius: 14px !important;
  box-shadow: 0 8px 32px rgba(0,0,0,0.6), 0 0 1px rgba(255,255,255,0.4), inset 0 1px 0 rgba(255,255,255,0.05) !important;
  border: 1px solid rgba(255,255,255,0.2) !important;
  padding: 0 !important;
}
.leaflet-popup-content {
  margin: 0 !important;
  font-family: 'Inter', -apple-system, sans-serif !important;
}
.leaflet-popup-tip {
  background: rgba(15,23,42,0.98) !important;
  border: 1px solid rgba(255,255,255,0.15) !important;
  box-shadow: 0 4px 12px rgba(0,0,0,0.4) !important;
}
.leaflet-popup-close-button {
  color: rgba(148,163,184,0.5) !important;
  font-size: 20px !important;
  padding: 6px 10px 0 0 !important;
  transition: color 0.2s !important;
  z-index: 9999 !important;
  pointer-events: auto !important;
}
.leaflet-popup-close-button:hover {
  color: #ffffff !important;
}

/* ═══ MARKER PULSE ANIMATION ═══ */
@keyframes markerPulse {
  0%, 100% { transform: scale(1); opacity: 0.6; }
  50% { transform: scale(1.8); opacity: 0; }
}
@keyframes markerGlow {
  0%, 100% { box-shadow: 0 0 6px var(--marker-glow); }
  50% { box-shadow: 0 0 14px var(--marker-glow), 0 0 24px var(--marker-glow); }
}
@keyframes userPulse {
  0%, 100% { transform: scale(1); opacity: 0.4; }
  50% { transform: scale(2.2); opacity: 0; }
}

/* ═══ VENUE PIN — Remove Leaflet default white border from divIcons ═══ */
.venue-map-marker {
  background: transparent !important;
  border: none !important;
}

/* ═══ VENUE LABEL — Hide at low zoom ═══ */
.venue-labels-hidden .venue-pin-label {
  display: none !important;
}

/* ═══ CLUSTER ICON OVERRIDES ═══ */
.venue-cluster-icon {
  background: transparent !important;
  border: none !important;
}
.marker-cluster-small, .marker-cluster-medium, .marker-cluster-large {
  background: transparent !important;
}
.marker-cluster div {
  background: transparent !important;
}

/* ═══ MAP LEGEND ═══ */
.venue-map-legend {
  position: absolute;
  bottom: 10px;
  left: 10px;
  z-index: 1000;
  background: rgba(10,10,21,0.92);
  backdrop-filter: blur(8px);
  border: 1px solid rgba(255,255,255,0.2);
  border-radius: 10px;
  padding: 10px 14px;
  font-family: 'Inter', -apple-system, sans-serif;
  box-shadow: 0 4px 20px rgba(0,0,0,0.5);
  transition: opacity 0.3s;
  max-height: 180px;
  overflow: visible;
}
.venue-map-legend-title {
  font-size: 10px;
  font-weight: 700;
  color: rgba(255,255,255,0.7);
  letter-spacing: 1px;
  text-transform: uppercase;
  margin-bottom: 6px;
}
.venue-map-legend-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 2px 0;
}
.venue-map-legend-dot {
  width: 10px;
  height: 10px;
  border-radius: 50%;
  flex-shrink: 0;
  border: 1.5px solid rgba(255,255,255,0.5);
}
.venue-map-legend-label {
  font-size: 11px;
  color: rgba(255,255,255,0.7);
  font-weight: 500;
}

/* (The .navigate-nearest-* rules were removed with the never-rendered
   "Navigate to Nearest" button they styled.) */

/* ═══ VENUE COUNT BADGE ═══ */
.map-venue-count-badge {
  position: absolute;
  top: 10px;
  left: 50%;
  transform: translateX(-50%);
  z-index: 1000;
  padding: 5px 14px;
  background: rgba(10,14,25,0.85);
  backdrop-filter: blur(8px);
  -webkit-backdrop-filter: blur(8px);
  border: 1px solid rgba(255,255,255,0.15);
  border-radius: 20px;
  color: rgba(255,255,255,0.8);
  font-size: 11px;
  font-weight: 700;
  font-family: 'Inter', -apple-system, sans-serif;
  letter-spacing: 0.5px;
  box-shadow: 0 2px 12px rgba(0,0,0,0.4);
  pointer-events: none;
}
`;

// ─── Error Boundary ───
export class MapErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }
  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }
  componentDidCatch(error, info) {
    console.warn('Map rendering error:', error, info);
  }
  render() {
    if (this.state.hasError) {
      return (
        <div style={{ padding: 40, textAlign: 'center', color: 'rgba(255,255,255,0.5)' }}>
          <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" style={{ marginBottom: 12 }}>
            <path d="M1 6v16l7-4 8 4 7-4V2l-7 4-8-4-7 4z" />
            <line x1="8" y1="2" x2="8" y2="18" />
            <line x1="16" y1="6" x2="16" y2="22" />
          </svg>
          <p style={{ fontSize: 16, fontWeight: 600, color: '#fff', marginBottom: 8 }}>Map Unavailable</p>
          <p style={{ fontSize: 13 }}>Unable to load the map. This may be caused by an ad blocker or network issue.</p>
          {/* [VM8 FIX] Stack trace hidden in production — was leaking internal file paths and source structure to end users. */}
          {process.env.NODE_ENV === 'development' && (
            <div style={{ fontSize: 11, color: 'red', marginTop: 10, textAlign: 'left', background: '#222', padding: 8 }}>
              <strong>Error:</strong> {this.state.error?.message}<br />
              {this.state.error?.stack}
            </div>
          )}
          <button
            onClick={() => this.setState({ hasError: false, error: null })}
            style={{ marginTop: 16, padding: '10px 20px', background: 'rgba(255,255,255,0.2)', border: '1px solid rgba(255,255,255,0.4)', borderRadius: 8, color: '#ffffff', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}
          >Try Again</button>
        </div>
      );
    }
    return this.props.children;
  }
}

// ─── Helper: Truncate venue name for map label ───
function truncateName(name, maxLen) {
  if (!name) return '';
  // Strip common suffixes to save space
  let short = name.replace(/\s*(Casino|Hotel|Resort|&\s*Casino|&\s*Resort|&\s*Hotel|Poker\s*Room|Card\s*Room|Room)\s*$/i, '');
  if (short.length <= maxLen) return short;
  return short.slice(0, maxLen - 1).trim() + '…';
}

// escapeHtml imported from pnm-utils.js

// ─── Helper: Create venue marker icon (Tour-style round circle with label) ───
function createVenueIcon(L, venue, overrideColor) {
  const colors = overrideColor
    ? { fill: overrideColor, glow: overrideColor + '80' }
    : (VENUE_TYPE_COLORS[venue.venue_type] || DEFAULT_VENUE_COLOR);
  const label = truncateName(venue.name, 22);
  const escapedLabel = escapeHtml(label || '');
  
  const logoUrl = venue?.avatar_url || venue?.logo_url || venue?.profile_photo_url || venue?.cover_photo_url || venue?.image_url || '';
  const fallbackLogo = '/smarter-poker-logo-nobg.png';

  // When logo exists: fill entire circle with the logo (edge-to-edge, no white gap)
  // When no logo: use fallback smarter poker logo edge-to-edge
  const finalLogoUrl = logoUrl || fallbackLogo;
  
  const innerContent = `<img src="${escapeHtml(finalLogoUrl)}" alt="" style="width:100%;height:100%;object-fit:cover;border-radius:50%;background:#fff;" onerror="this.src='${fallbackLogo}';" />`;

  // Name label — dark pill badge underneath (same style as tour pins)
  const labelHtml = escapedLabel
    ? `<div class="venue-pin-label" style="position:absolute;top:110%;left:50%;transform:translateX(-50%);background:rgba(0,0,0,0.85);backdrop-filter:blur(4px);color:#fff;padding:3px 8px;border-radius:12px;font-size:10px;font-weight:800;white-space:nowrap;border:1px solid ${colors.fill}60;box-shadow:0 2px 8px rgba(0,0,0,0.9);text-shadow:0 1px 2px #000;letter-spacing:0.3px;z-index:999;max-width:140px;overflow:hidden;text-overflow:ellipsis;">${escapedLabel}</div>`
    : '';

  // Circle background: white for logos
  const circleBg = '#ffffff';
  const borderColor = colors.fill;

  return L.divIcon({
    className: 'venue-map-marker',
    html: `<div style="position:relative;width:44px;height:44px;">
      <div style="position:absolute;inset:0;border-radius:50%;background:${circleBg};border:2.5px solid ${borderColor};box-shadow:0 0 12px ${colors.fill}80, 0 3px 10px rgba(0,0,0,0.7);overflow:hidden;display:flex;align-items:center;justify-content:center;">
        ${innerContent}
      </div>
      ${labelHtml}
    </div>`,
    iconSize: [44, 44],
    iconAnchor: [22, 22],
    popupAnchor: [0, -24],
  });
}

// ─── Helper: Create cluster icon ───
function createClusterIcon(L, cluster) {
  const count = cluster.getChildCount();
  
  // Size tiers
  let size, fontSize, borderWidth;
  if (count >= 100) {
    size = 58; fontSize = 15; borderWidth = 3;
  } else if (count >= 50) {
    size = 48; fontSize = 14; borderWidth = 2.5;
  } else if (count >= 20) {
    size = 42; fontSize = 13; borderWidth = 2;
  } else if (count >= 10) {
    size = 36; fontSize = 12; borderWidth = 2;
  } else {
    size = 30; fontSize = 11; borderWidth = 2;
  }

  // Color gradient based on count
  let bgGradient, glowColor, textColor;
  if (count >= 100) {
    bgGradient = 'linear-gradient(135deg, #ffffff 0%, #e2e8f0 50%, #8B6914 100%)';
    glowColor = 'rgba(255,255,255,0.5)';
    textColor = '#000';
  } else if (count >= 50) {
    bgGradient = 'linear-gradient(135deg, #f0d48a 0%, #ffffff 50%, #e2e8f0 100%)';
    glowColor = 'rgba(255,255,255,0.4)';
    textColor = '#000';
  } else if (count >= 20) {
    bgGradient = 'linear-gradient(135deg, rgba(255,255,255,0.9) 0%, rgba(184,134,11,0.85) 100%)';
    glowColor = 'rgba(255,255,255,0.35)';
    textColor = '#000';
  } else {
    bgGradient = 'linear-gradient(135deg, rgba(255,255,255,0.75) 0%, rgba(184,134,11,0.7) 100%)';
    glowColor = 'rgba(255,255,255,0.25)';
    textColor = '#1a1a2e';
  }

  return L.divIcon({
    html: `<div style="
      width:${size}px;height:${size}px;border-radius:50%;
      background:${bgGradient};
      border:${borderWidth}px solid #94a3b8;
      display:flex;align-items:center;justify-content:center;
      font-size:${fontSize}px;font-weight:800;color:${textColor};
      box-shadow:0 0 ${size/2}px ${glowColor}, 0 4px 16px rgba(0,0,0,0.5), inset 0 -2px 4px rgba(0,0,0,0.2);
      text-shadow:0 1px 2px rgba(255,255,255,0.3);
      font-family:'Inter',-apple-system,sans-serif;
      letter-spacing:-0.5px;
    ">${count}</div>`,
    className: 'venue-cluster-icon',
    iconSize: [size, size],
  });
}

// ─── Tour Colors for map markers ───
const TOUR_MARKER_COLORS = {
  WSOP: '#c9a227', WPT: '#dc2626', WSOPC: '#c9a227', MSPT: '#3b82f6', RGPS: '#10b981',
  PGT: '#8b5cf6', NAPT: '#f87171', BPO: '#38bdf8', FPN: '#818cf8', LIPS: '#ec4899',
  ROUGHRIDER: '#d97706', PAT: '#22c55e', GCPT: '#06b6d4',
};

// ─── Helper: Create tour logo icon — SINGLE CIRCLE (tour logo only) ───
// One tour circle with colored ring and pulse animation.
// No venue initials circle — removed to keep the map clean.
function createTourLogoIcon(L, venue) {
  const tourColor = TOUR_MARKER_COLORS[venue.tour_code] || '#ffffff';
  const tourLogoUrl = venue.logo_url || '';
  // tour_code comes from external scrapers — escape before it reaches innerHTML
  const tourCode = escapeHtml(String(venue.tour_code || 'TOUR').slice(0, 4));

  // Circle sizing
  const circleSize = 36;
  // Container must be wide enough for the circle + pulse ring overflow (8px each side)
  const totalWidth = circleSize + 16; // 52px — prevents clipping
  const totalHeight = circleSize + 16; // square container
  const circleLeft = (totalWidth - circleSize) / 2; // centered horizontally
  const circleTop = (totalHeight - circleSize) / 2;  // centered vertically

  // ═══ TOUR CIRCLE — colored ring with pulse animation ═══
  const pulseRing = `<div style="position:absolute;top:-4px;left:${circleLeft - 4}px;width:${circleSize + 8}px;height:${circleSize + 8}px;border-radius:50%;border:2px solid ${tourColor};opacity:0.6;animation:markerPulse 2s ease-in-out infinite;z-index:4;"></div>`;

  const tourInner = tourLogoUrl
    ? `<img src="${escapeHtml(tourLogoUrl)}" alt="" style="width:100%;height:100%;object-fit:cover;border-radius:50%;" onerror="this.style.display='none';this.nextElementSibling.style.display='flex';" />
       <div style="display:none;font-size:10px;font-weight:900;color:${tourColor};letter-spacing:0.5px;">${tourCode}</div>`
    : `<div style="font-size:10px;font-weight:900;color:${tourColor};letter-spacing:0.5px;">${tourCode}</div>`;

  // ═══ LABEL PILL ═══
  const tourLabel = escapeHtml(venue.tour_name || venue.tour_code || '');
  const venueLabel = escapeHtml(truncateName(venue.stop_venue || venue.stop_name || '', 22));

  const doublePillHtml = `<div class="venue-pin-label" style="position:absolute;top:100%;left:50%;transform:translateX(-50%);margin-top:4px;background:rgba(0,0,0,0.88);backdrop-filter:blur(6px);color:#fff;padding:3px 10px 4px;border-radius:10px;font-weight:800;white-space:nowrap;border:1px solid ${tourColor}60;box-shadow:0 2px 10px rgba(0,0,0,0.9),0 0 6px ${tourColor}30;text-shadow:0 1px 2px #000;z-index:999;display:flex;flex-direction:column;align-items:center;gap:1px;max-width:180px;">
    <div style="font-size:10px;color:${tourColor};letter-spacing:0.4px;font-weight:900;overflow:hidden;text-overflow:ellipsis;max-width:170px;text-shadow:0 0 6px ${tourColor}40;">${tourLabel}</div>
    ${venueLabel ? `<div style="font-size:8.5px;color:rgba(200,214,229,0.65);font-weight:600;letter-spacing:0.2px;overflow:hidden;text-overflow:ellipsis;max-width:170px;">${venueLabel}</div>` : ''}
  </div>`;

  return L.divIcon({
    className: 'tour-logo-marker',
    html: `<div style="position:relative;width:${totalWidth}px;height:${totalHeight}px;">
      ${pulseRing}
      <div style="position:absolute;top:${circleTop}px;left:${circleLeft}px;width:${circleSize}px;height:${circleSize}px;border-radius:50%;background:#ffffff;border:2.5px solid #ef4444;box-shadow:0 0 14px rgba(239,68,68,0.6), 0 3px 10px rgba(0,0,0,0.7);overflow:hidden;display:flex;align-items:center;justify-content:center;z-index:3;">
        ${tourInner}
      </div>
      ${doublePillHtml}
    </div>`,
    iconSize: [totalWidth, totalHeight],
    iconAnchor: [totalWidth / 2, totalHeight / 2],
    popupAnchor: [0, -(totalHeight / 2)],
  });
}

// ─── Helper: Build tour-specific popup HTML ───
function buildTourPopupHtml(venue) {
  const tourColor = TOUR_MARKER_COLORS[venue.tour_code] || '#ffffff';
  // Poker tours always use red ring — they are poker tour stops, not regular venues
  const ringColor = '#ef4444';
  // tour_code comes from external scrapers — escape before it reaches innerHTML
  const tourCodeInitials = escapeHtml(String(venue.tour_code || '').slice(0, 4));
  const logoHtml = venue.logo_url
    ? `<img src="${escapeHtml(venue.logo_url)}" alt="" style="width:40px;height:40px;border-radius:8px;object-fit:cover;background:rgba(255,255,255,0.08);padding:0px;border:1.5px solid ${tourColor}40;flex-shrink:0;" onerror="this.style.display='none';this.nextElementSibling.style.display='flex';" /><div style="display:none;width:40px;height:40px;border-radius:8px;background:linear-gradient(135deg,${tourColor},${tourColor}66);align-items:center;justify-content:center;font-size:14px;font-weight:900;color:#fff;flex-shrink:0;">${tourCodeInitials}</div>`
    : `<div style="display:flex;width:40px;height:40px;border-radius:8px;background:linear-gradient(135deg,${tourColor},${tourColor}66);align-items:center;justify-content:center;font-size:14px;font-weight:900;color:#fff;flex-shrink:0;">${tourCodeInitials}</div>`;

  const statusBadge = venue.is_running
    ? `<span style="padding:2px 8px;border-radius:4px;background:rgba(34,197,94,0.15);color:#22c55e;font-size:10px;font-weight:700;letter-spacing:0.3px;border:1px solid rgba(34,197,94,0.3);">LIVE NOW</span>`
    : `<span style="padding:2px 8px;border-radius:4px;background:rgba(59,130,246,0.12);color:#60a5fa;font-size:10px;font-weight:700;letter-spacing:0.3px;border:1px solid rgba(59,130,246,0.25);">UPCOMING</span>`;

  return `<div style="min-width:240px;max-width:320px;padding:16px 18px 14px;border-top:3px solid ${ringColor};">
    <div style="display:flex;align-items:center;gap:10px;margin-bottom:10px;">
      ${logoHtml}
      <div>
        <div style="font-size:14px;font-weight:800;color:#fff;letter-spacing:0.3px;">${escapeHtml(venue.tour_name || venue.tour_code)}</div>
        <div style="font-size:11px;color:rgba(148,163,184,0.7);margin-top:2px;">${escapeHtml(venue.city || '')}, ${escapeHtml(venue.state || '')}</div>
      </div>
    </div>
    <div style="display:flex;align-items:center;gap:8px;margin-bottom:10px;flex-wrap:wrap;">
      <span style="padding:3px 10px;border-radius:6px;background:${tourColor}20;color:${tourColor};font-size:11px;font-weight:700;letter-spacing:0.3px;border:1px solid ${tourColor}30;">${escapeHtml(venue.tour_code || '')}</span>
      ${statusBadge}
    </div>
    <div style="font-size:13px;font-weight:600;color:rgba(255,255,255,0.9);margin-bottom:4px;">${escapeHtml(venue.stop_name || venue.name || 'Tour Stop')}</div>
    ${venue.dates ? `<div style="font-size:11px;color:rgba(34,197,94,0.8);font-weight:600;margin-bottom:12px;">Dates: ${escapeHtml(venue.dates)}</div>` : ''}
    ${venue.host_venue_name ? `<div style="margin-bottom:12px;padding:10px;background:rgba(255,255,255,0.04);border-radius:8px;border:1px solid rgba(255,255,255,0.08);">
      <div style="font-size:10px;font-weight:700;color:rgba(148,163,184,0.5);letter-spacing:0.8px;text-transform:uppercase;margin-bottom:8px;">Host Venue</div>
      <div style="display:flex;align-items:center;gap:10px;">
        ${venue.host_venue_logo_url
          ? `<img src="${escapeHtml(venue.host_venue_logo_url)}" alt="" style="width:34px;height:34px;border-radius:8px;object-fit:cover;background:#fff;padding:0px;border:1px solid rgba(255,255,255,0.15);flex-shrink:0;" onerror="this.style.display='none';this.nextElementSibling.style.display='flex';" /><div style="display:none;width:34px;height:34px;border-radius:8px;background:rgba(148,163,184,0.2);align-items:center;justify-content:center;font-size:11px;font-weight:800;color:#94a3b8;flex-shrink:0;">${escapeHtml((venue.host_venue_name||'').split(/\s+/).slice(0,2).map(w=>w[0]||'').join('').toUpperCase()||'V')}</div>`
          : `<div style="display:flex;width:34px;height:34px;border-radius:8px;background:rgba(148,163,184,0.2);align-items:center;justify-content:center;font-size:11px;font-weight:800;color:#94a3b8;flex-shrink:0;">${escapeHtml((venue.host_venue_name||'').split(/\s+/).slice(0,2).map(w=>w[0]||'').join('').toUpperCase()||'V')}</div>`
        }
        <div style="flex:1;min-width:0;">
          <div style="font-size:13px;font-weight:700;color:#fff;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${escapeHtml(venue.host_venue_name)}</div>
        </div>
      </div>
    </div>` : ''}
    <div style="display:flex;gap:8px;flex-wrap:wrap;">
      <button class="fsp-trigger" data-url="/hub/tours/${escapeHtml(venue.tour_code || '')}" data-title="${escapeHtml(venue.tour_name || venue.tour_code)}" style="flex:1;padding:8px 14px;border-radius:8px;background:linear-gradient(135deg,${tourColor},${tourColor}cc);color:#000;text-decoration:none;font-size:12px;font-weight:700;text-align:center;letter-spacing:0.3px;border:none;cursor:pointer;">View Tour</button>
      <button class="directions-trigger" data-addr="${encodeURIComponent((venue.city || '') + ', ' + (venue.state || ''))}" data-lat="${venue.latitude}" data-lng="${venue.longitude}" style="padding:8px 14px;border-radius:8px;background:rgba(255,255,255,0.08);color:rgba(255,255,255,0.8);font-size:12px;font-weight:600;border:1px solid rgba(255,255,255,0.12);text-align:center;cursor:pointer;">Directions</button>
      <button class="viewmap-trigger" data-addr="${encodeURIComponent((venue.tour_name || venue.tour_code || '') + ' ' + (venue.city || '') + ' ' + (venue.state || ''))}" style="padding:8px 10px;border-radius:8px;background:rgba(255,255,255,0.04);color:rgba(148,163,184,0.6);font-size:11px;font-weight:600;border:1px solid rgba(255,255,255,0.08);text-align:center;cursor:pointer;">View on Map</button>
    </div>
  </div>`;
}

// ─── Helper: Build popup HTML ───
function buildPopupHtml(venue) {
  const trust = getTrustLevel(venue.trust_score);
  const colors = VENUE_TYPE_COLORS[venue.venue_type] || DEFAULT_VENUE_COLOR;
  const typeBadge = VENUE_TYPE_LABELS[venue.venue_type] || venue.venue_type || '';
  const detailPath = venue.detailUrl || (venue.is_social_page
    ? '/club/' + encodeURIComponent(venue.social_page_id || '')
    : '/hub/venues/' + encodeURIComponent(venue.id || ''));
  
  const games = (venue.games_offered || []).slice(0, 3).join(', ');
  const hours = venue.is_24_hours ? '24/7' : (venue.hours_of_operation || '');

  // Open status
  const openStatus = getOpenStatus(venue) || {};
  const isCurrentlyOpen = openStatus.open || openStatus.isOpen;
  const openBadge = isCurrentlyOpen
    ? '<span style="padding:2px 8px;border-radius:4px;background:rgba(34,197,94,0.15);color:#22c55e;font-size:10px;font-weight:700;border:1px solid rgba(34,197,94,0.25);">OPEN</span>'
    : openStatus.label === 'Closed'
    ? '<span style="padding:2px 8px;border-radius:4px;background:rgba(239,68,68,0.12);color:#ef4444;font-size:10px;font-weight:700;border:1px solid rgba(239,68,68,0.2);">CLOSED</span>'
    : '';

  // Build venue logo/initials badge
  const logoUrl = venue.logo_url || venue.profile_photo_url || venue.cover_photo_url || venue.image_url || '';
  const initials = escapeHtml((venue.name || '').split(/\s+/).slice(0, 2).map(w => w[0] || '').join('').toUpperCase());
  const logoBadge = logoUrl
    ? `<img src="${escapeHtml(logoUrl)}" alt="" style="width:36px;height:36px;border-radius:8px;object-fit:cover;background:#fff;padding:0px;border:1.5px solid rgba(255,255,255,0.3);flex-shrink:0;" onerror="this.style.display='none';this.nextElementSibling.style.display='flex';" /><div style="display:none;width:36px;height:36px;border-radius:8px;background:linear-gradient(135deg,${colors.fill},rgba(0,0,0,0.3));align-items:center;justify-content:center;font-size:13px;font-weight:800;color:#fff;flex-shrink:0;border:1.5px solid rgba(255,255,255,0.2);">${initials}</div>`
    : `<div style="display:flex;width:36px;height:36px;border-radius:8px;background:linear-gradient(135deg,${colors.fill},rgba(0,0,0,0.3));align-items:center;justify-content:center;font-size:13px;font-weight:800;color:#fff;flex-shrink:0;border:1.5px solid rgba(255,255,255,0.2);">${initials}</div>`;

  // Phone call button
  const safePhone = venue.phone ? String(venue.phone).replace(/[^0-9+\-\\.\() ]/g, '') : '';
  const phoneBtn = safePhone ? `<a href="tel:${safePhone}" class="popup-call-trigger" style="padding:8px 10px;border-radius:8px;background:rgba(34,197,94,0.08);color:rgba(34,197,94,0.8);font-size:11px;font-weight:600;border:1px solid rgba(34,197,94,0.15);text-align:center;cursor:pointer;text-decoration:none;display:flex;align-items:center;gap:4px;"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 16.92v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07 19.5 19.5 0 01-6-6 19.79 19.79 0 01-3.07-8.67A2 2 0 014.11 2h3a2 2 0 012 1.72c.127.96.361 1.903.7 2.81a2 2 0 01-.45 2.11L8.09 9.91a16 16 0 006 6l1.27-1.27a2 2 0 012.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0122 16.92z"/></svg>Call</a>` : '';

  // Address line
  const addrLine = venue.address
    ? `<div style="font-size:10px;color:rgba(148,163,184,0.45);margin-bottom:6px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${escapeHtml(venue.address)}</div>`
    : '';

  // Distance (if computed)
  const distLine = venue._distanceMi != null
    ? `<span style="font-size:10px;color:rgba(148,163,184,0.45);margin-left:auto;">${venue._distanceMi < 1 ? '<1 mi' : venue._distanceMi.toFixed(1) + ' mi'}</span>`
    : '';

  return `<div style="min-width:230px;max-width:320px;padding:16px 18px 14px;">
    <div style="display:flex;align-items:center;gap:10px;margin-bottom:8px;">
      ${logoBadge}
      <div style="flex:1;min-width:0;">
        <div style="font-size:15px;font-weight:700;color:#fff;line-height:1.2;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${escapeHtml(venue.name)}</div>
        <div style="display:flex;align-items:center;gap:6px;margin-top:2px;">
          <span style="font-size:11px;color:rgba(148,163,184,0.7);">${escapeHtml(venue.city || '')}, ${escapeHtml(venue.state || '')}</span>
          ${distLine}
        </div>
      </div>
    </div>
    ${addrLine}
    <div style="display:flex;align-items:center;gap:6px;margin-bottom:8px;flex-wrap:wrap;">
      <span style="padding:3px 10px;border-radius:6px;background:${colors.badgeBg || 'rgba(255,255,255,0.15)'};color:${colors.fill};font-size:11px;font-weight:600;letter-spacing:0.3px;">${typeBadge}</span>
      ${openBadge}
      ${hours ? `<span style="font-size:11px;color:rgba(148,163,184,0.6);">· ${escapeHtml(String(hours))}</span>` : ''}
    </div>
    ${games ? `<div style="font-size:11px;color:rgba(148,163,184,0.6);margin-bottom:8px;">Games: ${escapeHtml(games)}</div>` : ''}
    ${venue._isLive && venue.totalTables > 0 ? `<div style="display:flex;align-items:center;gap:6px;margin-bottom:8px;"><span style="padding:2px 6px;border-radius:4px;background:rgba(239,68,68,0.12);color:#ef4444;font-size:9px;font-weight:800;letter-spacing:0.4px;border:1px solid rgba(239,68,68,0.25);">LIVE DATA</span><span style="font-size:11px;color:#4ade80;font-weight:700;">${venue.totalTables} Tables Running</span></div>` : ''}
    <div style="display:flex;align-items:center;gap:8px;margin-bottom:14px;">
      <div style="padding:4px 10px;border-radius:6px;background:${trust.bg};color:${trust.color};font-size:11px;font-weight:700;">Trust: ${trust.label}</div>
      <div style="font-size:11px;color:rgba(148,163,184,0.5);">${venue.trust_score || '—'}/5</div>
    </div>
    <div style="display:flex;gap:6px;flex-wrap:wrap;">
      <button class="fsp-trigger" data-url="${detailPath}" data-title="${escapeHtml(venue.name) || 'Venue Details'}" style="flex:1;padding:8px 14px;border-radius:8px;background:linear-gradient(135deg,#ffffff,#e2e8f0);color:#000;text-decoration:none;font-size:12px;font-weight:700;text-align:center;transition:transform 0.15s;letter-spacing:0.3px;border:none;cursor:pointer;">View Details</button>
      <button class="directions-trigger" data-addr="${encodeURIComponent((venue.address || '') + ' ' + (venue.name || '') + ' ' + (venue.city || '') + ' ' + (venue.state || ''))}" data-lat="${venue.latitude}" data-lng="${venue.longitude}" style="padding:8px 12px;border-radius:8px;background:rgba(255,255,255,0.08);color:rgba(255,255,255,0.8);font-size:12px;font-weight:600;border:1px solid rgba(255,255,255,0.12);text-align:center;cursor:pointer;transition:all 0.15s;">Directions</button>
      ${phoneBtn}
    </div>
  </div>`;
}

// ─── Main Map Component ───
export default function VenueMap({ venues, userLocation, centerLocation, fullHeight = false, onVenueClick, hideLegend = false, radiusMiles, uniformColor, onOpenIframeModal, disableClustering = false, isFavorited }) {
  const [legendCollapsed, setLegendCollapsed] = useState(false);
  const [visibleCount, setVisibleCount] = useState(0);
  const mapContainerRef = useRef(null);
  const mountedRef = useRef(true);

  // Unconditional unmount handler for background polling safety
  useEffect(() => {
    return () => {
      mountedRef.current = false;
    };
  }, []);
  const mapInstanceRef = useRef(null);
  const clusterGroupRef = useRef(null);
  const tourLayerRef = useRef(null); // ← Tour stops NEVER cluster
  const circlesGroupRef = useRef(null);
  const userMarkerRef = useRef(null);
  const radiusCircleRef = useRef(null);
  const onOpenIframeModalRef = useRef(onOpenIframeModal);
  // WIRING FIX: `onVenueClick` was destructured and never used, so map pin → venue card
  // sync (scroll + highlight, implemented on the page) could never fire. Held in a ref so
  // wiring it does not add a marker-rebuild trigger.
  const onVenueClickRef = useRef(onVenueClick);
  // Content signature of the markers currently drawn — see the marker effect below.
  const renderedSignatureRef = useRef(null);
  const [mapReady, setMapReady] = useState(false);

  // Keep the refs current without triggering re-init
  useEffect(() => { onOpenIframeModalRef.current = onOpenIframeModal; }, [onOpenIframeModal]);
  useEffect(() => { onVenueClickRef.current = onVenueClick; }, [onVenueClick]);

  // Dynamically load Leaflet scripts
  useEffect(() => {
    if (typeof window === 'undefined') return;

    if (window.L && window.L.MarkerClusterGroup) {
      setMapReady(true);
      return;
    }

    const loadScript = (src) => {
      return new Promise((resolve, reject) => {
        const existing = document.querySelector(`script[src="${src}"]`);
        if (existing) {
          // [VM1/VM6 FIX] Check dataset.loaded FIRST before adding listener.
          // Previous order added listener then checked — if already loaded, listener was
          // orphaned (load event never re-fires). Also handles race where script is in DOM
          // but dataset.loaded not yet set by our onload handler (which means it was injected
          // by a different code path). In that case, fall through and add the load listener.
          if (existing.dataset.loaded === 'true') { resolve(); return; }
          existing.addEventListener('load', () => resolve(), { once: true });
          return;
        }

        const script = document.createElement('script');
        script.src = src;
        script.async = false;
        script.onload = () => {
          script.dataset.loaded = 'true';
          resolve();
        };
        script.onerror = reject;
        document.head.appendChild(script);
      });
    };

    const loadLeaflet = async () => {
      try {
        // Load CSS
        if (!document.querySelector('link[href*="leaflet@1.9.4"]')) {
          const leafletCSS = document.createElement('link');
          leafletCSS.rel = 'stylesheet';
          leafletCSS.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
          document.head.appendChild(leafletCSS);
        }
        if (!document.querySelector('link[href*="MarkerCluster"]')) {
          const clusterCSS = document.createElement('link');
          clusterCSS.rel = 'stylesheet';
          clusterCSS.href = 'https://unpkg.com/leaflet.markercluster@1.5.3/dist/MarkerCluster.css';
          document.head.appendChild(clusterCSS);
          const clusterDefaultCSS = document.createElement('link');
          clusterDefaultCSS.rel = 'stylesheet';
          clusterDefaultCSS.href = 'https://unpkg.com/leaflet.markercluster@1.5.3/dist/MarkerCluster.Default.css';
          document.head.appendChild(clusterDefaultCSS);
        }

        await loadScript('https://unpkg.com/leaflet@1.9.4/dist/leaflet.js');
        await new Promise(r => setTimeout(r, 100));
        await loadScript('https://unpkg.com/leaflet.markercluster@1.5.3/dist/leaflet.markercluster.js');

        const checkReady = (attempts = 0) => {
          if (!mountedRef.current) return; // Component unmounted — stop polling
          if (window.L && window.L.MarkerClusterGroup) {
            setMapReady(true);
          } else if (attempts < 50) {
            setTimeout(() => checkReady(attempts + 1), 100);
          } else {
            console.warn('MarkerClusterGroup never loaded after 5s — continuing without clustering');
            if (window.L && mountedRef.current) setMapReady(true);
          }
        };
        checkReady();
      } catch (err) {
        console.warn('Failed to load Leaflet scripts:', err);
      }
    };

    loadLeaflet();
  }, []);

  // Inject custom CSS once
  useEffect(() => {
    if (typeof document === 'undefined') return;
    if (document.querySelector('#venue-map-custom-css')) return;
    const style = document.createElement('style');
    style.id = 'venue-map-custom-css';
    style.textContent = LEAFLET_CUSTOM_CSS;
    document.head.appendChild(style);
  }, []);

  // Initialize map once Leaflet is ready
  useEffect(() => {
    if (!mapReady || !mapContainerRef.current) return;
    
    // Delegate clicks for popup buttons
    const handlePopupClicks = (e) => {
      const trigger = e.target.closest('.fsp-trigger');
      if (trigger) {
        e.preventDefault();
        const url = trigger.getAttribute('data-url');
        const title = trigger.getAttribute('data-title');
        if (onOpenIframeModalRef.current) {
          onOpenIframeModalRef.current(url, title);
        } else {
          window.location.href = url;
        }
        return;
      }
      // Directions button — open native maps app based on device
      const dirTrigger = e.target.closest('.directions-trigger');
      if (dirTrigger) {
        e.preventDefault();
        e.stopPropagation();
        const addr = decodeURIComponent(dirTrigger.getAttribute('data-addr') || '');
        const lat = parseFloat(dirTrigger.getAttribute('data-lat'));
        const lng = parseFloat(dirTrigger.getAttribute('data-lng'));
        openNativeMaps({ address: addr, lat, lng, mode: 'directions' });
        return;
      }
      // View on Map button — open native maps in search mode
      const viewTrigger = e.target.closest('.viewmap-trigger');
      if (viewTrigger) {
        e.preventDefault();
        e.stopPropagation();
        const addr = decodeURIComponent(viewTrigger.getAttribute('data-addr') || '');
        openNativeMaps({ address: addr, mode: 'search' });
      }
    };
    
    // [VM4 FIX] Declare container at effect scope so early-return guard can safely reference it.
    // Previously "container" was only defined inside updateLabelVisibility() at line ~921,
    // so the early-return at line 776-779 threw ReferenceError: container is not defined
    // on every re-render where mapReady changed with an already-initialized map instance.
    const container = mapContainerRef.current;

    // If a map instance somehow already exists on this container (e.g. Strict Mode),
    // we MUST destroy it completely before recreating, otherwise Leaflet throws
    // "Map container is already initialized."
    if (mapInstanceRef.current) {
        mapInstanceRef.current.remove();
        mapInstanceRef.current = null;
    }

    // New mount — add listener for this session
    container.addEventListener('click', handlePopupClicks);

    const L = window.L;
    // Continental US bounds — tight fit
    const usBounds = L.latLngBounds(
      L.latLng(24.396308, -125.0),   // Southwest
      L.latLng(49.384358, -66.93457) // Northeast
    );

    const map = L.map(mapContainerRef.current, {
      zoomControl: true,
      attributionControl: false,  // Disable default Leaflet attribution
      maxBounds: usBounds.pad(0.05),
      maxBoundsViscosity: 1.0,
      minZoom: 4,
      dragging: true,
      tap: true,
      touchZoom: true,
      scrollWheelZoom: !!fullHeight,
      doubleClickZoom: true,
      boxZoom: true,
    });

    // Custom attribution — only "Powered By Smarter.Poker"
    L.control.attribution({ prefix: false })
      .addAttribution('Powered By <a href="https://smarter.poker">Smarter.Poker</a>')
      .addTo(map);

    // Fit to US bounds
    map.fitBounds(usBounds, { padding: [20, 20], maxZoom: 6 });

    // Dark tile layer — NO LABELS (removes 'UNITED STATES' text)
    L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_nolabels/{z}/{x}/{y}{r}.png', {
      attribution: '',
      subdomains: 'abcd',
      maxZoom: 19,
    }).addTo(map);

    mapInstanceRef.current = map;

    // ═══ LOAD US GEOJSON OVERLAYS ═══
    const loadOverlays = async () => {
      try {
        // Load states GeoJSON for boundaries + mask
        const statesResp = await fetch('/data/us-states-simplified.json');
        const statesData = await statesResp.json();

        // 1. INVERSE MASK — Black out everything outside the US
        // Create a single massive polygon covering the world, with ALL US states as holes
        const worldOuter = [
          [90, -180], [90, 180], [-90, 180], [-90, -180], [90, -180]
        ];

        // Collect ALL state polygon rings as holes in one L.polygon call
        const allHoles = [];
        statesData.features.forEach(function(feature) {
          const geom = feature.geometry;
          if (geom.type === 'Polygon') {
            allHoles.push(geom.coordinates[0].map(function(c) { return [c[1], c[0]]; }));
          } else if (geom.type === 'MultiPolygon') {
            geom.coordinates.forEach(function(poly) {
              allHoles.push(poly[0].map(function(c) { return [c[1], c[0]]; }));
            });
          }
        });

        // Single polygon: world outer ring + all US state holes
        L.polygon([worldOuter].concat(allHoles), {
          color: 'transparent',
          fillColor: '#040608',
          fillOpacity: 0.97,
          interactive: false,
          pane: 'overlayPane',
        }).addTo(map);

        // 2. STATE BOUNDARY LINES — Subtle gold outlines
        L.geoJSON(statesData, {
          style: function() {
            return {
              color: 'rgba(255,255,255,0.15)',
              weight: 1,
              fillColor: 'transparent',
              fillOpacity: 0,
              interactive: false,
            };
          },
          pane: 'overlayPane',
        }).addTo(map);

      } catch (err) {
        console.warn('Could not load US overlays:', err);
      }
    };
    loadOverlays();

    // ═══ VENUE MARKERS — Cluster group (populated by separate useEffect) ═══
    // [VM-A1 FIX] Guard: if markercluster CDN failed to load (5s timeout path),
    // L.markerClusterGroup is undefined → crash. Fall back to plain L.layerGroup().
    const clusterGroup = (disableClustering || typeof L.markerClusterGroup !== 'function')
      ? L.layerGroup()
      : L.markerClusterGroup({
      maxClusterRadius: 30,
      iconCreateFunction: function(cluster) {
        return createClusterIcon(L, cluster);
      },
      spiderfyOnMaxZoom: true,
      showCoverageOnHover: false,
      zoomToBoundsOnClick: true,
      disableClusteringAtZoom: 8,
    });
    map.addLayer(clusterGroup);
    clusterGroupRef.current = clusterGroup;

    // ═══ TOUR STOP LAYER — Always-visible, NEVER clustered ═══
    // Tour pins must always be visible as distinct markers regardless of zoom
    const tourLayer = L.layerGroup();
    map.addLayer(tourLayer);
    tourLayerRef.current = tourLayer;

    // Geofence circles at high zoom
    const circlesGroup = L.layerGroup();
    circlesGroup.addTo(map);
    circlesGroupRef.current = circlesGroup;

    // Fresh, empty layers — force the marker effect's signature guard to redraw.
    renderedSignatureRef.current = null;

    function updateCircles() {
      circlesGroup.clearLayers();
      const zoom = map.getZoom();
      if (zoom >= 11) {
        clusterGroup.eachLayer(function(marker) {
          if (marker._venueCircle) {
            circlesGroup.addLayer(marker._venueCircle);
          }
        });
      }
    }

    // ═══ LABEL VISIBILITY BASED ON ZOOM ═══
    // Hide venue name labels when zoomed out to prevent clutter
    function updateLabelVisibility() {
      const zoom = map.getZoom();
      const container = mapContainerRef.current;
      if (!container) return;
      if (zoom >= 8) {
        container.classList.remove('venue-labels-hidden');
      } else {
        container.classList.add('venue-labels-hidden');
      }
    }

    map.on('zoomend', updateCircles);
    map.on('zoomend', updateLabelVisibility);
    // Set initial label visibility
    updateLabelVisibility();

    // ═══ SHOW USER LOCATION PIN IMMEDIATELY IF AVAILABLE ═══
    if (userLocation) {
      const userIcon = L.divIcon({
        className: 'user-location-pin',
        html: '<div style="filter: drop-shadow(0 4px 6px rgba(0,0,0,0.6));">' +
          '<svg width="40" height="40" viewBox="0 0 24 24" fill="#ef4444" stroke="#ffffff" stroke-width="2" stroke-linejoin="round" stroke-linecap="round">' +
          '<path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"></path>' +
          '<circle cx="12" cy="10" r="4" fill="#ffffff" stroke="none"></circle>' +
          '</svg></div>',
        iconSize: [40, 40],
        iconAnchor: [20, 40],
        popupAnchor: [0, -40]
      });

      userMarkerRef.current = L.marker([userLocation.lat, userLocation.lng], { icon: userIcon, zIndexOffset: 1000 })
        .addTo(map)
        .bindPopup('<div style="padding:10px 14px;"><b style="color:#fff;font-size:14px;">You Are Here</b><br/><span style="font-size:11px;color:rgba(148,163,184,0.7);">Your Current Location</span></div>');

      // Do NOT auto-zoom to user location — keep full US overview so users can explore all venues
    }

    return () => {
      container.removeEventListener('click', handlePopupClicks);
      if (mapInstanceRef.current) {
        mapInstanceRef.current.remove();
        mapInstanceRef.current = null;
      }
      clusterGroupRef.current = null;
      circlesGroupRef.current = null;
      tourLayerRef.current = null;
    };
  }, [mapReady]); // eslint-disable-line react-hooks/exhaustive-deps

  // ═══ UPDATE MARKERS when venues prop changes ═══
  useEffect(() => {
    if (!mapReady || !mapInstanceRef.current || !clusterGroupRef.current) return;
    const L = window.L;
    const clusterGroup = clusterGroupRef.current;
    const circlesGroup = circlesGroupRef.current;
    const tourLayer = tourLayerRef.current;

    // PERF FIX: two of this effect's deps change identity on EVERY parent render —
    // `isFavorited` is a bare arrow re-created each render, and `venues` is rebuilt inline
    // by the panels (sort/filter in the render body). Rebuilding every marker on every
    // parent state change re-ran buildPopupHtml for the whole dataset and snapped shut any
    // popup the user had open. Compare a content signature of everything the pins and
    // popups actually display and bail out when nothing meaningful changed.
    const drawnVenues = (venues || []).filter(function(v) { return v && v.latitude && v.longitude && !v.hideOnMap; });
    const signature = [
      drawnVenues.map(function(v) {
        const fav = isFavorited && isFavorited('venue', v.id) ? 1 : 0;
        return [
          v.id || '', v.name || '', v.latitude, v.longitude, v.venue_type || '', v.tour_code || '',
          v.is_running ? 1 : 0, v._isLive ? 1 : 0, v.totalTables || 0, v.logo_url || '',
          v.trust_score || '', v.is_24_hours ? 1 : 0,
          Array.isArray(v.games_offered) ? v.games_offered.length : 0, fav,
        ].join(':');
      }).join('|'),
      uniformColor || '',
      userLocation ? `${userLocation.lat},${userLocation.lng}` : '',
    ].join('#');
    if (signature === renderedSignatureRef.current) return;
    renderedSignatureRef.current = signature;

    // Clear existing markers
    clusterGroup.clearLayers();
    if (circlesGroup) circlesGroup.clearLayers();
    // ← Always clear tour layer too
    if (tourLayer) tourLayer.clearLayers();

    const validVenues = drawnVenues;

    // [VM3 FIX] Compute distances into a local Map — do NOT mutate prop objects in place.
    // Mutating v._distanceMi directly bypasses React change detection since object refs stay identical.
    // (The full nearest-venue sort that used to live here fed a `nearestVenue` state nothing
    // ever read — the "Navigate to Nearest" button was never rendered — so it is gone.)
    const distanceMap = new Map();
    if (userLocation) {
      validVenues.forEach(function(v) {
        const dlat = (v.latitude - userLocation.lat) * 69;
        const dlng = (v.longitude - userLocation.lng) * 69 * Math.cos(userLocation.lat * Math.PI / 180);
        distanceMap.set(v.id, Math.sqrt(dlat * dlat + dlng * dlng));
      });
    }

    // Update visible count
    setVisibleCount(validVenues.length);

    validVenues.forEach(function(venue) {
      // ═══ TOUR STOPS — NEVER clustered, always distinct red/gold pins ═══
      const isTourStop = (venue.venue_type === 'tour_stop' || venue.venue_type === 'poker_tour') && venue.tour_code;
      const venueIcon = isTourStop
        ? createTourLogoIcon(L, venue)
        : createVenueIcon(L, venue, uniformColor || null);

      // Favorited venue pins get a gold pulse ring wrapped around the icon
      const isFav = !isTourStop && isFavorited && isFavorited('venue', venue.id);
      const finalIcon = isFav ? (() => {
        const base = createVenueIcon(L, venue, uniformColor || null);
        const size = base.options?.iconSize?.[0] || 36;
        const favHtml = `<div style="position:relative;width:${size + 10}px;height:${size + 10}px;">
          <div style="position:absolute;top:-1px;left:-1px;width:${size + 2}px;height:${size + 2}px;border-radius:50%;border:2.5px solid #ffffff;opacity:0.85;animation:markerPulse 1.8s ease-in-out infinite;"></div>
          ${base.options.html}
        </div>`;
        return L.divIcon({ ...base.options, html: favHtml, iconSize: [size + 10, size + 10] });
      })() : venueIcon;
      // Pass distance via local data attr — do NOT mutate venue object
      const distMi = distanceMap.get(venue.id) ?? null;
      const venueWithDist = distMi != null ? { ...venue, _distanceMi: distMi } : venue;
      const popupHtml = isTourStop
        ? buildTourPopupHtml(venueWithDist)
        : buildPopupHtml(venueWithDist);

      // UX FIX: tour pins used to be drawn +0.012 lat / -0.008 lng (~1.3km) away from the
      // venue they represent, which put the pin in a different neighbourhood at city zoom
      // and left it visibly detached from its own geofence circle (drawn at true coords).
      // Visual precedence is already guaranteed by the never-clustered tourLayer plus the
      // zIndexOffset below, so tour pins now render at their real position.
      const marker = L.marker([venue.latitude, venue.longitude], { icon: finalIcon, zIndexOffset: isTourStop ? 1000 : isFav ? 500 : 0 })
        .bindPopup(popupHtml, { maxWidth: 320, className: 'venue-popup', closeButton: true });

      if (!isTourStop) {
        const radius = getGeofenceRadius(venue.venue_type);
        const circleColor = uniformColor || (VENUE_TYPE_COLORS[venue.venue_type] || DEFAULT_VENUE_COLOR).fill;
        const circle = L.circle([venue.latitude, venue.longitude], {
          radius: radius,
          color: circleColor,
          weight: 1,
          opacity: 0.35,
          fillColor: circleColor,
          fillOpacity: 0.08,
        });
        marker._venueCircle = circle;
      }

      marker._venueData = venue;

      // Hover preview on desktop only — `mouseover` is synthesised on tap, so on touch it
      // double-fired with the click handler below. A short open delay keeps popups from
      // flickering as the cursor crosses a dense cluster; `mouseout` only cancels a
      // still-pending open. It must NOT close an already-open popup: the popup sits above
      // the pin, so moving the cursor toward it fires `mouseout` and the user could never
      // reach the View Details / Directions buttons inside it. Leaflet popups are
      // autoClose by default, so opening another pin's popup still closes this one.
      const isTouchDevice = typeof window !== 'undefined' && 'ontouchstart' in window;
      if (!isTouchDevice) {
        let hoverTimer = null;
        marker.on('mouseover', function() {
          if (hoverTimer) clearTimeout(hoverTimer);
          hoverTimer = setTimeout(function() { marker.openPopup(); }, 140);
        });
        marker.on('mouseout', function() {
          if (hoverTimer) { clearTimeout(hoverTimer); hoverTimer = null; }
        });
      }

      // Touch preview on mobile — first tap opens popup instead of requiring double tap
      marker.on('click', function(e) {
        if (isTouchDevice) {
          e.originalEvent?.preventDefault?.();
          marker.openPopup();
        }
        // WIRING FIX: notify the page so it can scroll to and highlight the matching card.
        // Tour stops are excluded (they render as tour cards under a different DOM id),
        // matching how the sibling VenueMapPanel wires its own onVenueSelect.
        if (!isTourStop && onVenueClickRef.current) onVenueClickRef.current(venue);
      });

      if (isTourStop) {
        // ← Tour stops go to NON-CLUSTERED layer — always visible, never hidden in a cluster ball
        if (tourLayer) tourLayer.addLayer(marker);
      } else {
        clusterGroup.addLayer(marker);
      }
    });
  // [VM2 FIX] Added isFavorited and userLocation to deps — missing caused:
  //   - Favorites gold ring never appearing after a favorite action
  //   - Distance/nearest venue not recomputing when GPS location resolves
  }, [venues, uniformColor, mapReady, isFavorited, userLocation]); // eslint-disable-line react-hooks/exhaustive-deps

  // Update user location marker
  useEffect(() => {
    if (!mapReady || !mapInstanceRef.current) return;
    const L = window.L;
    const map = mapInstanceRef.current;

    if (userMarkerRef.current) {
      map.removeLayer(userMarkerRef.current);
      userMarkerRef.current = null;
    }

    if (userLocation) {
      const userIcon = L.divIcon({
        className: 'user-location-pin',
        html: '<div style="filter: drop-shadow(0 4px 6px rgba(0,0,0,0.6));">' +
          '<svg width="40" height="40" viewBox="0 0 24 24" fill="#ef4444" stroke="#ffffff" stroke-width="2" stroke-linejoin="round" stroke-linecap="round">' +
          '<path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"></path>' +
          '<circle cx="12" cy="10" r="4" fill="#ffffff" stroke="none"></circle>' +
          '</svg></div>',
        iconSize: [40, 40],
        iconAnchor: [20, 40],
        popupAnchor: [0, -40]
      });

      userMarkerRef.current = L.marker([userLocation.lat, userLocation.lng], { icon: userIcon, zIndexOffset: 1000 })
        .addTo(map)
        .bindPopup('<div style="padding:8px 12px;"><b style="color:#fff;font-size:14px;">Your Location</b></div>');

      // Do NOT auto-zoom — user explores the full map freely
    }
  }, [userLocation, mapReady]);

  // ═══ DYNAMIC RADIUS ZOOM + VISUAL CIRCLE — Adjust map zoom and show radius overlay ═══
  // Uses centerLocation (GPS or city centroid) to zoom appropriately
  useEffect(() => {
    if (!mapReady || !mapInstanceRef.current) return;
    const L = window.L;
    const map = mapInstanceRef.current;
    
    // Remove previous radius circle
    if (radiusCircleRef.current) {
      map.removeLayer(radiusCircleRef.current);
      radiusCircleRef.current = null;
    }
    
    // Determine the center point: prefer explicit centerLocation, fallback to userLocation
    const center = centerLocation || userLocation;
    if (!center) return;
    
    // For "Any" / "all" radius, show full US overview (no circle)
    if (!radiusMiles || radiusMiles === 'any' || radiusMiles === 'Any') {
      const usBounds = L.latLngBounds(
        L.latLng(24.396308, -125.0),
        L.latLng(49.384358, -66.93457)
      );
      map.fitBounds(usBounds, { padding: [20, 20], maxZoom: 6, animate: true, duration: 0.8 });
      return;
    }
    
    const zoom = radiusToZoom(radiusMiles);
    map.setView([center.lat, center.lng], zoom, { animate: true, duration: 0.8 });
    
    // ═══ VISUAL RADIUS CIRCLE OVERLAY ═══
    // Draw a prominent gold circle showing the search boundary
    const radiusMeters = Number(radiusMiles) * 1609.34; // miles → meters
    radiusCircleRef.current = L.circle([center.lat, center.lng], {
      radius: radiusMeters,
      color: '#ffffff',
      weight: 2.5,
      opacity: 0.85,
      fill: false,
      dashArray: '10, 10',
      interactive: false,
    }).addTo(map);
  }, [radiusMiles, centerLocation, userLocation, mapReady]);

  const legendItems = [
    { type: 'casino', label: 'Casino', color: '#ffffff' },
    { type: 'poker_club', label: 'Poker Club', color: '#22c55e' },
    { type: 'tour_stop', label: 'Poker Tour', color: '#ef4444' },
    { type: 'charity', label: 'Charity', color: '#3b82f6' },
    { type: 'home_game', label: 'Home Game', color: '#94a3b8' },
  ];

  return (
    <div style={{ position: 'relative', width: '100%', height: fullHeight ? '100%' : 'auto' }}>
      {/* Premium loading skeleton */}
      {!mapReady && (
        <div style={{
          width: '100%',
          ...(fullHeight ? { height: '100%', minHeight: 400 } : { aspectRatio: '16 / 9', maxHeight: '50vh' }),
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          flexDirection: 'column', gap: 12,
          color: 'rgba(255,255,255,0.6)',
          background: 'linear-gradient(180deg, rgba(10,10,21,0.95) 0%, rgba(6,8,13,1) 100%)',
          borderRadius: fullHeight ? 0 : 12,
          position: 'relative',
          overflow: 'hidden',
        }}>
          {/* Animated gradient sweep */}
          <div style={{
            position: 'absolute', inset: 0,
            background: 'linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.04) 50%, transparent 100%)',
            animation: 'shimmer 2s ease-in-out infinite',
          }} />
          <div style={{
            width: 48, height: 48, border: '3px solid rgba(255,255,255,0.15)',
            borderTopColor: '#ffffff', borderRadius: '50%',
            animation: 'spin 1s linear infinite',
          }} />
          <span style={{ fontFamily: 'Inter, -apple-system, sans-serif', fontSize: 14, fontWeight: 600, letterSpacing: '1px' }}>
            LOADING MAP...
          </span>
          <span style={{ fontSize: 11, color: 'rgba(148,163,184,0.4)' }}>
            {(venues || []).length} Venues Ready
          </span>
          <style>{`@keyframes shimmer { 0% { transform: translateX(-100%); } 100% { transform: translateX(100%); } }`}</style>
        </div>
      )}
      <div
        ref={mapContainerRef}
        style={{
          width: '100%',
          ...(fullHeight
            ? { height: '100%', minHeight: 400 }
            : { aspectRatio: '16 / 9', maxHeight: '50vh', minHeight: 260 }),
          borderRadius: fullHeight ? 0 : 12,
          overflow: 'hidden',
          border: fullHeight ? 'none' : '1px solid rgba(255,255,255,0.15)',
          display: mapReady ? 'block' : 'none',
          boxShadow: fullHeight ? 'none' : '0 4px 24px rgba(0,0,0,0.4)',
        }}
      />
      {/* ═══ VENUE TYPE LEGEND ═══ */}
      {mapReady && !hideLegend && (
        <div className="venue-map-legend" style={{ opacity: legendCollapsed ? 0.5 : 1, cursor: 'pointer' }}
          onClick={(e) => { e.stopPropagation(); setLegendCollapsed(!legendCollapsed); }}>
          <div className="venue-map-legend-title">{legendCollapsed ? '◆ Legend' : 'Venue Types'}</div>
          {!legendCollapsed && legendItems.map(item => (
            <div key={item.type} className="venue-map-legend-item">
              <div className="venue-map-legend-dot" style={{ background: item.color, boxShadow: `0 0 6px ${item.color}55` }} />
              <span className="venue-map-legend-label">{item.label}</span>
            </div>
          ))}
        </div>
      )}
      {/* Map Preference Chooser — gear icon */}
      {mapReady && (
        <MapPreferenceChooser position="top-right" />
      )}

      {/* Visible venue count badge */}
      {mapReady && visibleCount > 0 && (
        <div className="map-venue-count-badge">
          {visibleCount} Venue{visibleCount !== 1 ? 's' : ''}
        </div>
      )}
    </div>
  );
}
