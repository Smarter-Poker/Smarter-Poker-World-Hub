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

import React, { useRef, useState, useEffect } from 'react';
import { radiusToZoom } from './pnm-utils';

// ─── Constants ───
const VENUE_TYPE_LABELS = {
  casino: 'Casino',
  card_room: 'Card Room',
  poker_club: 'Poker Club',
  home_game: 'Home Game',
  charity: 'Charity Room'
};

// Venue type → marker color
const VENUE_TYPE_COLORS = {
  casino: { fill: '#d4a853', glow: 'rgba(212,168,83,0.6)', label: 'Gold' },
  card_room: { fill: '#00d4ff', glow: 'rgba(0,212,255,0.5)', label: 'Cyan' },
  poker_club: { fill: '#22c55e', glow: 'rgba(34,197,94,0.5)', label: 'Green' },
  charity: { fill: '#a855f7', glow: 'rgba(168,85,247,0.5)', label: 'Purple' },
  home_game: { fill: '#ffffff', glow: 'rgba(255,255,255,0.5)', label: 'White' },
};
const DEFAULT_VENUE_COLOR = VENUE_TYPE_COLORS.casino;

const GEOFENCE_RADII = {
  casino: 500,
  card_room: 300,
  poker_club: 200,
  charity: 200,
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
/* ═══ PREMIUM MAP CONTROLS ═══ */
.leaflet-control-zoom {
  border: none !important;
  box-shadow: 0 4px 20px rgba(0,0,0,0.5), 0 0 1px rgba(212,168,83,0.3) !important;
  border-radius: 10px !important;
  overflow: hidden !important;
}
.leaflet-control-zoom a {
  background: rgba(10,10,21,0.92) !important;
  color: #d4a853 !important;
  border: none !important;
  border-bottom: 1px solid rgba(212,168,83,0.15) !important;
  width: 36px !important;
  height: 36px !important;
  line-height: 36px !important;
  font-size: 18px !important;
  font-weight: 600 !important;
  transition: all 0.2s ease !important;
}
.leaflet-control-zoom a:hover {
  background: rgba(212,168,83,0.15) !important;
  color: #f0d48a !important;
}
.leaflet-control-zoom a:last-child {
  border-bottom: none !important;
}

/* ═══ ATTRIBUTION — Smarter.Poker Branding ═══ */
.leaflet-control-attribution {
  background: linear-gradient(90deg, rgba(10,10,21,0.85), rgba(10,10,21,0.7)) !important;
  color: rgba(212,168,83,0.7) !important;
  font-size: 10px !important;
  padding: 3px 10px !important;
  border-radius: 6px 0 0 0 !important;
  font-weight: 600 !important;
  letter-spacing: 0.3px !important;
  font-family: 'Inter', -apple-system, sans-serif !important;
}
.leaflet-control-attribution a {
  color: #d4a853 !important;
  text-decoration: none !important;
}

/* ═══ PREMIUM POPUP ═══ */
.leaflet-popup-content-wrapper {
  background: linear-gradient(145deg, rgba(15,23,42,0.98) 0%, rgba(10,10,21,0.99) 100%) !important;
  border-radius: 14px !important;
  box-shadow: 0 8px 32px rgba(0,0,0,0.6), 0 0 1px rgba(212,168,83,0.4), inset 0 1px 0 rgba(255,255,255,0.05) !important;
  border: 1px solid rgba(212,168,83,0.2) !important;
  padding: 0 !important;
}
.leaflet-popup-content {
  margin: 0 !important;
  font-family: 'Inter', -apple-system, sans-serif !important;
}
.leaflet-popup-tip {
  background: rgba(15,23,42,0.98) !important;
  border: 1px solid rgba(212,168,83,0.15) !important;
  box-shadow: 0 4px 12px rgba(0,0,0,0.4) !important;
}
.leaflet-popup-close-button {
  color: rgba(148,163,184,0.5) !important;
  font-size: 20px !important;
  padding: 6px 10px 0 0 !important;
  transition: color 0.2s !important;
}
.leaflet-popup-close-button:hover {
  color: #d4a853 !important;
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

/* ═══ VENUE LABEL (Google Maps-style) ═══ */
.venue-pin-label {
  position: absolute;
  left: 50%;
  top: 100%;
  transform: translateX(-50%);
  margin-top: 2px;
  white-space: nowrap;
  font-family: 'Inter', -apple-system, sans-serif;
  font-size: 11px;
  font-weight: 700;
  color: #fff;
  text-shadow: 0 1px 4px rgba(0,0,0,0.9), 0 0 2px rgba(0,0,0,1), 0 0 8px rgba(0,0,0,0.7);
  letter-spacing: 0.2px;
  pointer-events: none;
  max-width: 130px;
  overflow: hidden;
  text-overflow: ellipsis;
  text-align: center;
  line-height: 1.2;
  transition: opacity 0.3s;
}
/* Hide labels at low zoom — managed via JS class toggle */
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
  bottom: 32px;
  left: 10px;
  z-index: 1000;
  background: rgba(10,10,21,0.88);
  backdrop-filter: blur(8px);
  border: 1px solid rgba(212,168,83,0.2);
  border-radius: 10px;
  padding: 10px 14px;
  font-family: 'Inter', -apple-system, sans-serif;
  box-shadow: 0 4px 20px rgba(0,0,0,0.5);
  transition: opacity 0.3s;
}
.venue-map-legend-title {
  font-size: 10px;
  font-weight: 700;
  color: rgba(212,168,83,0.7);
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
    console.error('Map rendering error:', error, info);
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
          <button
            onClick={() => this.setState({ hasError: false, error: null })}
            style={{ marginTop: 16, padding: '10px 20px', background: 'rgba(212,168,83,0.2)', border: '1px solid rgba(212,168,83,0.4)', borderRadius: 8, color: '#d4a853', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}
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

// ─── Helper: Create venue marker icon (Google Maps-style pin with label) ───
function createVenueIcon(L, venue, overrideColor) {
  const colors = overrideColor
    ? { fill: overrideColor, glow: overrideColor + '80' }
    : (VENUE_TYPE_COLORS[venue.venue_type] || DEFAULT_VENUE_COLOR);
  const label = truncateName(venue.name, 20);
  const escapedLabel = (label || '').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  
  const logoUrl = venue?.logo_url || venue?.profile_photo_url || venue?.cover_photo_url || venue?.image_url || '';
  const initials = (venue?.name || 'V').split(/\s+/).slice(0, 2).map(w => w[0] || '').join('').toUpperCase();

  const logoHtml = logoUrl
    ? `<img src="${logoUrl}" alt="" style="width:100%;height:100%;object-fit:cover;background:#fff;" onerror="this.style.display='none';this.nextElementSibling.style.display='flex';" />
       <div style="display:none;width:100%;height:100%;background:#0a0a15;color:${colors.fill};font-size:13px;font-weight:900;align-items:center;justify-content:center;border-radius:50%;">${initials}</div>`
    : `<div style="width:100%;height:100%;background:#0a0a15;color:${colors.fill};font-size:13px;font-weight:900;display:flex;align-items:center;justify-content:center;border-radius:50%;">${initials}</div>`;

  return L.divIcon({
    className: 'venue-map-marker',
    html: `<div style="position:relative;display:flex;flex-direction:column;align-items:center;">
      <div style="position:relative; width:44px; height:44px; filter:drop-shadow(0 4px 6px rgba(0,0,0,0.8)); margin-bottom: 6px;">
         <div style="position:absolute; width:100%; height:100%; background:${colors.fill}; border-radius:50% 50% 50% 0; transform:rotate(-45deg); border: 2.5px solid rgba(255,255,255,1); box-sizing:border-box; box-shadow: inset 0 0 8px rgba(0,0,0,0.4);"></div>
         <div style="position:absolute; top:3px; left:3px; width:38px; height:38px; border-radius:50%; overflow:hidden; background:#0a0a15; display:flex; justify-content:center; align-items:center; z-index:2; border: 1.5px solid ${colors.fill}; box-sizing:border-box;">
            ${logoHtml}
         </div>
      </div>
      ${escapedLabel ? `<div class="venue-pin-label" style="transform:translateY(-2px);">${escapedLabel}</div>` : ''}
    </div>`,
    iconSize: [44, 52],
    iconAnchor: [22, 50],
    popupAnchor: [0, -48],
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
    bgGradient = 'linear-gradient(135deg, #d4a853 0%, #b8860b 50%, #8B6914 100%)';
    glowColor = 'rgba(212,168,83,0.5)';
    textColor = '#000';
  } else if (count >= 50) {
    bgGradient = 'linear-gradient(135deg, #f0d48a 0%, #d4a853 50%, #b8860b 100%)';
    glowColor = 'rgba(212,168,83,0.4)';
    textColor = '#000';
  } else if (count >= 20) {
    bgGradient = 'linear-gradient(135deg, rgba(212,168,83,0.9) 0%, rgba(184,134,11,0.85) 100%)';
    glowColor = 'rgba(212,168,83,0.35)';
    textColor = '#000';
  } else {
    bgGradient = 'linear-gradient(135deg, rgba(212,168,83,0.75) 0%, rgba(184,134,11,0.7) 100%)';
    glowColor = 'rgba(212,168,83,0.25)';
    textColor = '#1a1a2e';
  }

  return L.divIcon({
    html: `<div style="
      width:${size}px;height:${size}px;border-radius:50%;
      background:${bgGradient};
      border:${borderWidth}px solid rgba(255,255,255,0.9);
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

// ─── Helper: Create tour logo icon for map markers ───
function createTourLogoIcon(L, venue) {
  const tourColor = TOUR_MARKER_COLORS[venue.tour_code] || '#d4a853';
  const logoUrl = venue.logo_url;
  const isRunning = venue.is_running;
  const pulseRing = isRunning
    ? `<div style="position:absolute;inset:-4px;border-radius:50%;border:2px solid ${tourColor};opacity:0.6;animation:markerPulse 2s ease-in-out infinite;"></div>`
    : '';

  if (logoUrl) {
    // Logo-based marker — round circle with the tour logo inside
    return L.divIcon({
      className: 'tour-logo-marker',
      html: `<div style="position:relative;width:42px;height:42px;">
        ${pulseRing}
        <div style="position:absolute;inset:0;border-radius:50%;background:#ffffff;border:2.5px solid ${tourColor};box-shadow:0 0 12px ${tourColor}80, 0 3px 10px rgba(0,0,0,0.7);overflow:hidden;display:flex;align-items:center;justify-content:center;">
          <img src="${logoUrl}" alt="" style="width:32px;height:32px;object-fit:contain;border-radius:50%;" onerror="this.style.display='none';this.nextElementSibling.style.display='flex';" />
          <div style="display:none;font-size:10px;font-weight:900;color:${tourColor};letter-spacing:0.5px;">${(venue.tour_code || '').slice(0, 4)}</div>
        </div>
        <div style="position:absolute;top:110%;left:50%;transform:translateX(-50%);background:rgba(0,0,0,0.85);backdrop-filter:blur(4px);color:#fff;padding:3px 8px;border-radius:12px;font-size:10px;font-weight:800;white-space:nowrap;border:1px solid ${tourColor}60;box-shadow:0 2px 8px rgba(0,0,0,0.9);text-shadow:0 1px 2px #000;letter-spacing:0.5px;z-index:999;">${venue.tour_name || venue.tour_code}</div>
      </div>`,
      iconSize: [42, 42],
      iconAnchor: [21, 21],
      popupAnchor: [0, -22],
    });
  }

  // Fallback — text badge marker with tour code
  return L.divIcon({
    className: 'tour-logo-marker',
    html: `<div style="position:relative;width:42px;height:42px;">
      ${pulseRing}
      <div style="position:absolute;inset:0;border-radius:50%;background:linear-gradient(135deg,${tourColor},${tourColor}99);border:2.5px solid #fff;box-shadow:0 0 12px ${tourColor}80, 0 3px 10px rgba(0,0,0,0.7);display:flex;align-items:center;justify-content:center;">
        <span style="font-size:9px;font-weight:900;color:#fff;letter-spacing:0.3px;text-shadow:0 1px 2px rgba(0,0,0,0.5);">${(venue.tour_code || 'TOUR').slice(0, 4)}</span>
      </div>
      <div style="position:absolute;top:110%;left:50%;transform:translateX(-50%);background:rgba(0,0,0,0.85);backdrop-filter:blur(4px);color:#fff;padding:3px 8px;border-radius:12px;font-size:10px;font-weight:800;white-space:nowrap;border:1px solid ${tourColor}60;box-shadow:0 2px 8px rgba(0,0,0,0.9);text-shadow:0 1px 2px #000;letter-spacing:0.5px;z-index:999;">${venue.tour_name || venue.tour_code}</div>
    </div>`,
    iconSize: [42, 42],
    iconAnchor: [21, 21],
    popupAnchor: [0, -22],
  });
}

// ─── Helper: Build tour-specific popup HTML ───
function buildTourPopupHtml(venue) {
  const tourColor = TOUR_MARKER_COLORS[venue.tour_code] || '#d4a853';
  const logoHtml = venue.logo_url
    ? `<img src="${venue.logo_url}" alt="" style="width:40px;height:40px;border-radius:8px;object-fit:contain;background:rgba(255,255,255,0.08);padding:3px;border:1.5px solid ${tourColor}40;flex-shrink:0;" onerror="this.style.display='none';this.nextElementSibling.style.display='flex';" /><div style="display:none;width:40px;height:40px;border-radius:8px;background:linear-gradient(135deg,${tourColor},${tourColor}66);align-items:center;justify-content:center;font-size:14px;font-weight:900;color:#fff;flex-shrink:0;">${(venue.tour_code || '').slice(0, 4)}</div>`
    : `<div style="display:flex;width:40px;height:40px;border-radius:8px;background:linear-gradient(135deg,${tourColor},${tourColor}66);align-items:center;justify-content:center;font-size:14px;font-weight:900;color:#fff;flex-shrink:0;">${(venue.tour_code || '').slice(0, 4)}</div>`;

  const statusBadge = venue.is_running
    ? `<span style="padding:2px 8px;border-radius:4px;background:rgba(34,197,94,0.15);color:#22c55e;font-size:10px;font-weight:700;letter-spacing:0.3px;border:1px solid rgba(34,197,94,0.3);">LIVE NOW</span>`
    : `<span style="padding:2px 8px;border-radius:4px;background:rgba(59,130,246,0.12);color:#60a5fa;font-size:10px;font-weight:700;letter-spacing:0.3px;border:1px solid rgba(59,130,246,0.25);">UPCOMING</span>`;

  return `<div style="min-width:240px;max-width:320px;padding:16px 18px 14px;">
    <div style="display:flex;align-items:center;gap:10px;margin-bottom:10px;">
      ${logoHtml}
      <div>
        <div style="font-size:14px;font-weight:800;color:#fff;letter-spacing:0.3px;">${venue.tour_name || venue.tour_code}</div>
        <div style="font-size:11px;color:rgba(148,163,184,0.7);margin-top:2px;">${venue.city || ''}, ${venue.state || ''}</div>
      </div>
    </div>
    <div style="display:flex;align-items:center;gap:8px;margin-bottom:10px;flex-wrap:wrap;">
      <span style="padding:3px 10px;border-radius:6px;background:${tourColor}20;color:${tourColor};font-size:11px;font-weight:700;letter-spacing:0.3px;border:1px solid ${tourColor}30;">${venue.tour_code}</span>
      ${statusBadge}
    </div>
    <div style="font-size:13px;font-weight:600;color:rgba(255,255,255,0.9);margin-bottom:4px;">${venue.stop_name || venue.name || 'Tour Stop'}</div>
    ${venue.dates ? `<div style="font-size:11px;color:rgba(34,197,94,0.8);font-weight:600;margin-bottom:12px;">📅 ${venue.dates}</div>` : ''}
    <div style="display:flex;gap:8px;flex-wrap:wrap;">
      <button class="fsp-trigger" data-url="/hub/tours/${venue.tour_code}" data-title="${venue.tour_name || venue.tour_code}" style="flex:1;padding:8px 14px;border-radius:8px;background:linear-gradient(135deg,${tourColor},${tourColor}cc);color:#000;text-decoration:none;font-size:12px;font-weight:700;text-align:center;letter-spacing:0.3px;border:none;cursor:pointer;">View Tour</button>
      <a href="https://www.google.com/maps/dir/?api=1&destination=${venue.latitude},${venue.longitude}" target="_blank" rel="noopener" style="padding:8px 14px;border-radius:8px;background:rgba(255,255,255,0.08);color:rgba(255,255,255,0.8);text-decoration:none;font-size:12px;font-weight:600;border:1px solid rgba(255,255,255,0.12);text-align:center;">Directions</a>
    </div>
  </div>`;
}

// ─── Helper: Build popup HTML ───
function buildPopupHtml(venue) {
  const trust = getTrustLevel(venue.trust_score);
  const colors = VENUE_TYPE_COLORS[venue.venue_type] || DEFAULT_VENUE_COLOR;
  const typeBadge = VENUE_TYPE_LABELS[venue.venue_type] || venue.venue_type || '';
  const detailPath = venue.is_social_page
    ? '/club/' + venue.social_page_id
    : '/hub/venues/' + venue.id;
  
  const games = (venue.games_offered || []).slice(0, 3).join(', ');
  const hours = venue.is_24_hours ? '24/7' : (venue.hours_of_operation || '');

  // Build venue logo/initials badge
  const logoUrl = venue.logo_url || venue.profile_photo_url || venue.cover_photo_url || venue.image_url || '';
  const initials = (venue.name || '').split(/\s+/).slice(0, 2).map(w => w[0] || '').join('').toUpperCase();
  const logoBadge = logoUrl
    ? `<img src="${logoUrl}" alt="" style="width:36px;height:36px;border-radius:8px;object-fit:contain;background:#fff;padding:2px;border:1.5px solid rgba(212,168,83,0.3);flex-shrink:0;" onerror="this.style.display='none';this.nextElementSibling.style.display='flex';" /><div style="display:none;width:36px;height:36px;border-radius:8px;background:linear-gradient(135deg,${colors.fill},rgba(0,0,0,0.3));align-items:center;justify-content:center;font-size:13px;font-weight:800;color:#fff;flex-shrink:0;border:1.5px solid rgba(255,255,255,0.2);">${initials}</div>`
    : `<div style="display:flex;width:36px;height:36px;border-radius:8px;background:linear-gradient(135deg,${colors.fill},rgba(0,0,0,0.3));align-items:center;justify-content:center;font-size:13px;font-weight:800;color:#fff;flex-shrink:0;border:1.5px solid rgba(255,255,255,0.2);">${initials}</div>`;

  return `<div style="min-width:230px;max-width:320px;padding:16px 18px 14px;">
    <div style="display:flex;align-items:center;gap:10px;margin-bottom:10px;">
      ${logoBadge}
      <div>
        <div style="font-size:15px;font-weight:700;color:#fff;line-height:1.2;">${venue.name || ''}</div>
        <div style="font-size:11px;color:rgba(148,163,184,0.7);margin-top:2px;">${venue.city || ''}, ${venue.state || ''}</div>
      </div>
    </div>
    <div style="display:flex;align-items:center;gap:6px;margin-bottom:8px;flex-wrap:wrap;">
      <span style="padding:3px 10px;border-radius:6px;background:rgba(${colors.fill === '#d4a853' ? '212,168,83' : colors.fill === '#00d4ff' ? '0,212,255' : colors.fill === '#22c55e' ? '34,197,94' : colors.fill === '#a855f7' ? '168,85,247' : '255,255,255'},0.15);color:${colors.fill};font-size:11px;font-weight:600;letter-spacing:0.3px;">${typeBadge}</span>
      ${hours ? `<span style="font-size:11px;color:rgba(148,163,184,0.6);">· ${hours}</span>` : ''}
    </div>
    ${games ? `<div style="font-size:11px;color:rgba(148,163,184,0.6);margin-bottom:8px;">Games: ${games}</div>` : ''}
    <div style="display:flex;align-items:center;gap:8px;margin-bottom:14px;">
      <div style="padding:4px 10px;border-radius:6px;background:${trust.bg};color:${trust.color};font-size:11px;font-weight:700;">Trust: ${trust.label}</div>
      <div style="font-size:11px;color:rgba(148,163,184,0.5);">${venue.trust_score || '—'}/5</div>
    </div>
    <div style="display:flex;gap:8px;flex-wrap:wrap;">
      <button class="fsp-trigger" data-url="${detailPath}" data-title="${venue.name || 'Venue Details'}" style="flex:1;padding:8px 14px;border-radius:8px;background:linear-gradient(135deg,#d4a853,#b8860b);color:#000;text-decoration:none;font-size:12px;font-weight:700;text-align:center;transition:transform 0.15s;letter-spacing:0.3px;border:none;cursor:pointer;">View Details</button>
      <a href="https://www.google.com/maps/dir/?api=1&destination=${venue.latitude},${venue.longitude}" target="_blank" rel="noopener" style="padding:8px 14px;border-radius:8px;background:rgba(255,255,255,0.08);color:rgba(255,255,255,0.8);text-decoration:none;font-size:12px;font-weight:600;border:1px solid rgba(255,255,255,0.12);text-align:center;transition:all 0.15s;">Directions</a>
    </div>
  </div>`;
}

// ─── Main Map Component ───
export default function VenueMap({ venues, userLocation, centerLocation, fullHeight = false, onVenueClick, hideLegend = false, radiusMiles, uniformColor, onOpenIframeModal, disableClustering = false }) {
  const [legendCollapsed, setLegendCollapsed] = useState(false);
  const mapContainerRef = useRef(null);
  const mapInstanceRef = useRef(null);
  const clusterGroupRef = useRef(null);
  const circlesGroupRef = useRef(null);
  const userMarkerRef = useRef(null);
  const radiusCircleRef = useRef(null);
  const [mapReady, setMapReady] = useState(false);

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
          existing.addEventListener('load', resolve);
          if (existing.dataset.loaded === 'true') resolve();
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
          if (window.L && window.L.MarkerClusterGroup) {
            setMapReady(true);
          } else if (attempts < 50) {
            setTimeout(() => checkReady(attempts + 1), 100);
          } else {
            console.warn('MarkerClusterGroup never loaded after 5s — continuing without clustering');
            if (window.L) setMapReady(true);
          }
        };
        checkReady();
      } catch (err) {
        console.error('Failed to load Leaflet scripts:', err);
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
        if (onOpenIframeModal) {
          onOpenIframeModal(url, title);
        } else {
          window.location.href = url;
        }
      }
    };
    
    // Attach to the container so it catches all popup clicks
    const container = mapContainerRef.current;
    container.addEventListener('click', handlePopupClicks);
    
    if (mapInstanceRef.current) {
        return () => container.removeEventListener('click', handlePopupClicks);
    }

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
              color: 'rgba(212,168,83,0.15)',
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
    const clusterGroup = disableClustering ? L.layerGroup() : L.markerClusterGroup({
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

    // Geofence circles at high zoom
    const circlesGroup = L.layerGroup();
    circlesGroup.addTo(map);
    circlesGroupRef.current = circlesGroup;

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
      if (zoom >= 7) {
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
    };
  }, [mapReady, onOpenIframeModal]); // eslint-disable-line react-hooks/exhaustive-deps

  // ═══ UPDATE MARKERS when venues prop changes ═══
  useEffect(() => {
    if (!mapReady || !mapInstanceRef.current || !clusterGroupRef.current) return;
    const L = window.L;
    const clusterGroup = clusterGroupRef.current;
    const circlesGroup = circlesGroupRef.current;

    // Clear existing markers
    clusterGroup.clearLayers();
    if (circlesGroup) circlesGroup.clearLayers();

    const validVenues = (venues || []).filter(function(v) { return v.latitude && v.longitude; });

    validVenues.forEach(function(venue) {
      // Use tour logo markers for tour stops, standard markers for everything else
      const isTourStop = venue.venue_type === 'tour_stop' && venue.tour_code;
      const venueIcon = isTourStop
        ? createTourLogoIcon(L, venue)
        : createVenueIcon(L, venue.venue_type, uniformColor || null, venue);
      const popupHtml = isTourStop
        ? buildTourPopupHtml(venue)
        : buildPopupHtml(venue);

      const marker = L.marker([venue.latitude, venue.longitude], { icon: venueIcon })
        .bindPopup(popupHtml, { maxWidth: 320, className: 'venue-popup', closeButton: true });

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
      marker._venueData = venue;
      
      // Hover preview integration
      marker.on('mouseover', function() {
        marker.openPopup();
      });

      clusterGroup.addLayer(marker);
    });
  }, [venues, uniformColor, onVenueClick, mapReady]);

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
      color: '#d4a853',
      weight: 2.5,
      opacity: 0.85,
      fillColor: '#d4a853',
      fillOpacity: 0.08,
      dashArray: '10, 10',
      interactive: false,
    }).addTo(map);
  }, [radiusMiles, centerLocation, userLocation, mapReady]);

  // Legend items
  const legendItems = [
    { type: 'casino', label: 'Casino', color: '#d4a853' },
    { type: 'card_room', label: 'Card Room', color: '#00d4ff' },
    { type: 'poker_club', label: 'Poker Club', color: '#22c55e' },
    { type: 'charity', label: 'Charity', color: '#a855f7' },
    { type: 'home_game', label: 'Home Game', color: '#ffffff' },
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
          color: 'rgba(212,168,83,0.6)',
          background: 'linear-gradient(180deg, rgba(10,10,21,0.95) 0%, rgba(6,8,13,1) 100%)',
          borderRadius: fullHeight ? 0 : 12,
          position: 'relative',
          overflow: 'hidden',
        }}>
          {/* Animated gradient sweep */}
          <div style={{
            position: 'absolute', inset: 0,
            background: 'linear-gradient(90deg, transparent 0%, rgba(212,168,83,0.04) 50%, transparent 100%)',
            animation: 'shimmer 2s ease-in-out infinite',
          }} />
          <div style={{
            width: 48, height: 48, border: '3px solid rgba(212,168,83,0.15)',
            borderTopColor: '#d4a853', borderRadius: '50%',
            animation: 'spin 1s linear infinite',
          }} />
          <span style={{ fontFamily: 'Inter, -apple-system, sans-serif', fontSize: 14, fontWeight: 600, letterSpacing: '1px' }}>
            LOADING MAP...
          </span>
          <span style={{ fontSize: 11, color: 'rgba(148,163,184,0.4)' }}>
            {(venues || []).length} venues ready
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
          border: fullHeight ? 'none' : '1px solid rgba(212,168,83,0.15)',
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
    </div>
  );
}
