import React, { useState, useEffect, useRef } from 'react';
import { radiusToZoom, escapeHtml } from './pnm-utils';
import { openNativeMaps } from '../../utils/openNativeMaps';

/**
 * VenueMapPanel — Leaflet map rendering for Poker Near Me venues.
 * 
 * NOW uses logo-based venue pins (Google Maps-style) matching VenueMap.jsx.
 * Each venue shows its logo in a circular pin with the name underneath.
 * Labels only appear at zoom >= 9 to prevent clutter with many venues.
 */

// ─── Venue type → marker color ───
const VENUE_TYPE_COLORS = {
  casino: { fill: '#d4a853', glow: 'rgba(212,168,83,0.6)' },
  card_room: { fill: '#22c55e', glow: 'rgba(34,197,94,0.5)' },
  poker_club: { fill: '#22c55e', glow: 'rgba(34,197,94,0.5)' },
  charity: { fill: '#3b82f6', glow: 'rgba(59,130,246,0.5)' },
  home_game: { fill: '#ffffff', glow: 'rgba(255,255,255,0.5)' },
  tour_stop: { fill: '#ef4444', glow: 'rgba(239,68,68,0.5)' },
  poker_tour: { fill: '#ef4444', glow: 'rgba(239,68,68,0.5)' },
};
const DEFAULT_VENUE_COLOR = VENUE_TYPE_COLORS.casino;

const VENUE_TYPE_LABELS = {
  casino: 'Casino',
  card_room: 'Poker Club',
  poker_club: 'Poker Club',
  home_game: 'Home Game',
  charity: 'Charity',
  tour_stop: 'Poker Tour',
  poker_tour: 'Poker Tour'
};

// ─── Custom CSS for logo pins ───
const LOGO_PIN_CSS = `
/* ═══ VENUE LABEL (Google Maps-style) — VenueMapPanel ═══ */
.vmp-pin-label {
  position: absolute;
  left: 50%;
  top: 100%;
  transform: translateX(-50%);
  margin-top: 2px;
  white-space: nowrap;
  font-family: 'Inter', -apple-system, sans-serif;
  font-size: 10px;
  font-weight: 700;
  color: #fff;
  text-shadow: 0 1px 4px rgba(0,0,0,0.9), 0 0 2px rgba(0,0,0,1), 0 0 8px rgba(0,0,0,0.7);
  letter-spacing: 0.2px;
  pointer-events: none;
  max-width: 120px;
  overflow: hidden;
  text-overflow: ellipsis;
  text-align: center;
  line-height: 1.2;
  transition: opacity 0.3s;
}
/* Hide labels at low zoom — managed via JS class toggle */
.vmp-labels-hidden .vmp-pin-label {
  display: none !important;
}
/* ═══ POPUP — Dark theme ═══ */
.pnm-popup .leaflet-popup-content-wrapper {
  background: rgba(12,18,28,0.97) !important;
  color: #e0e8f0 !important;
  border: 1px solid rgba(212,168,83,0.2) !important;
  backdrop-filter: blur(12px);
  border-radius: 10px !important;
  box-shadow: 0 8px 32px rgba(0,0,0,0.6) !important;
}
.pnm-popup .leaflet-popup-tip {
  background: rgba(12,18,28,0.97) !important;
}
.pnm-popup .leaflet-popup-close-button {
  color: rgba(148,163,184,0.5) !important;
}
/* ═══ VENUE PIN — Remove Leaflet default white border from divIcons ═══ */
.vmp-venue-marker {
  background: transparent !important;
  border: none !important;
}
/* ═══ CLUSTER ICON OVERRIDES ═══ */
.vmp-cluster-icon {
  background: transparent !important;
  border: none !important;
}
.marker-cluster-small, .marker-cluster-medium, .marker-cluster-large {
  background: transparent !important;
}
.marker-cluster div {
  background: transparent !important;
}
`;

// ─── Truncate venue name for label ───
function truncateName(name, maxLen) {
  if (!name) return '';
  let short = name.replace(/\s*(Casino|Hotel|Resort|&\s*Casino|&\s*Resort|&\s*Hotel|Poker\s*Room|Card\s*Room|Room)\s*$/i, '');
  if (short.length <= maxLen) return short;
  return short.slice(0, maxLen - 1).trim() + '…';
}

// ─── Create logo-based venue icon (Tour-style round circle) ───
function createVenueIcon(L, venue) {
  const colors = VENUE_TYPE_COLORS[venue.venue_type] || DEFAULT_VENUE_COLOR;
  const label = truncateName(venue.name, 20);
  const escapedLabel = (label || '').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

  const logoUrl = venue?.logo_url || venue?.logoUrl || venue?.profile_photo_url || venue?.cover_photo_url || venue?.image_url || '';
  const initials = (venue?.name || 'V').split(/\s+/).slice(0, 2).map(w => w[0] || '').join('').toUpperCase();

  // Logo or initials — matches the Poker Tours round-circle style
  const innerContent = logoUrl
    ? `<img src="${logoUrl}" alt="" style="width:30px;height:30px;object-fit:contain;border-radius:50%;" onerror="this.style.display='none';this.nextElementSibling.style.display='flex';" />
       <div style="display:none;font-size:12px;font-weight:900;color:${colors.fill};letter-spacing:0.5px;">${initials}</div>`
    : `<div style="font-size:12px;font-weight:900;color:${colors.fill};letter-spacing:0.5px;">${initials}</div>`;

  // Name label — dark pill badge underneath (same style as tour pins)
  const labelHtml = escapedLabel
    ? `<div class="vmp-pin-label" style="position:absolute;top:110%;left:50%;transform:translateX(-50%);background:rgba(0,0,0,0.85);backdrop-filter:blur(4px);color:#fff;padding:2px 7px;border-radius:12px;font-size:9px;font-weight:800;white-space:nowrap;border:1px solid ${colors.fill}60;box-shadow:0 2px 8px rgba(0,0,0,0.9);text-shadow:0 1px 2px #000;letter-spacing:0.3px;z-index:999;max-width:120px;overflow:hidden;text-overflow:ellipsis;">${escapedLabel}</div>`
    : '';

  return L.divIcon({
    className: 'vmp-venue-marker',
    html: `<div style="position:relative;width:40px;height:40px;">
      <div style="position:absolute;inset:0;border-radius:50%;background:#ffffff;border:2.5px solid ${colors.fill};box-shadow:0 0 12px ${colors.fill}80, 0 3px 10px rgba(0,0,0,0.7);overflow:hidden;display:flex;align-items:center;justify-content:center;">
        ${innerContent}
      </div>
      ${labelHtml}
    </div>`,
    iconSize: [40, 40],
    iconAnchor: [20, 20],
    popupAnchor: [0, -22],
  });
}

// ─── Tour marker colors ───
const TOUR_MARKER_COLORS = {
  WSOP: '#c9a227', WPT: '#dc2626', WSOPC: '#c9a227', MSPT: '#3b82f6', RGPS: '#10b981',
  PGT: '#8b5cf6', NAPT: '#f87171', BPO: '#38bdf8', FPN: '#818cf8', LIPS: '#ec4899',
  ROUGHRIDER: '#d97706', PAT: '#22c55e', GCPT: '#06b6d4',
};

// ─── Create tour-specific icon (red border, tour logo inside) ───
function createTourIcon(L, venue) {
  const tourColor = TOUR_MARKER_COLORS[venue.tour_code] || '#ef4444';
  const logoUrl = venue.logo_url || '';
  const tourCode = (venue.tour_code || 'TOUR').slice(0, 4);
  const isRunning = venue.is_running;
  const pulseRing = isRunning
    ? `<div style="position:absolute;inset:-4px;border-radius:50%;border:2px solid ${tourColor};opacity:0.6;animation:markerPulse 2s ease-in-out infinite;"></div>`
    : '';

  const innerContent = logoUrl
    ? `<img src="${logoUrl}" alt="" style="width:28px;height:28px;object-fit:contain;border-radius:50%;" onerror="this.style.display='none';this.nextElementSibling.style.display='flex';" />
       <div style="display:none;font-size:10px;font-weight:900;color:${tourColor};letter-spacing:0.5px;">${tourCode}</div>`
    : `<div style="font-size:10px;font-weight:900;color:${tourColor};letter-spacing:0.5px;">${tourCode}</div>`;

  const label = venue.tour_name || venue.tour_code || venue.name || '';
  const escapedLabel = (label || '').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

  return L.divIcon({
    className: 'vmp-venue-marker',
    html: `<div style="position:relative;width:38px;height:38px;">
      ${pulseRing}
      <div style="position:absolute;inset:0;border-radius:50%;background:#ffffff;border:2.5px solid ${tourColor};box-shadow:0 0 14px ${tourColor}80, 0 3px 10px rgba(0,0,0,0.7);overflow:hidden;display:flex;align-items:center;justify-content:center;">
        ${innerContent}
      </div>
      <div class="vmp-pin-label" style="position:absolute;top:110%;left:50%;transform:translateX(-50%);background:rgba(0,0,0,0.85);backdrop-filter:blur(4px);color:#fff;padding:2px 7px;border-radius:12px;font-size:9px;font-weight:800;white-space:nowrap;border:1px solid ${tourColor}60;box-shadow:0 2px 8px rgba(0,0,0,0.9);text-shadow:0 1px 2px #000;letter-spacing:0.3px;z-index:999;max-width:120px;overflow:hidden;text-overflow:ellipsis;">${escapedLabel}</div>
    </div>`,
    iconSize: [38, 38],
    iconAnchor: [19, 19],
    popupAnchor: [0, -20],
  });
}

// ─── Build tour popup HTML ───
function buildTourPopupHtml(v) {
  const tourColor = TOUR_MARKER_COLORS[v.tour_code] || '#ef4444';
  const logoHtml = v.logo_url
    ? `<img src="${v.logo_url}" alt="" style="width:36px;height:36px;border-radius:8px;object-fit:contain;background:rgba(255,255,255,0.08);padding:2px;border:1.5px solid ${tourColor}40;flex-shrink:0;" onerror="this.style.display='none';this.nextElementSibling.style.display='flex';" /><div style="display:none;width:36px;height:36px;border-radius:8px;background:linear-gradient(135deg,${tourColor},${tourColor}66);align-items:center;justify-content:center;font-size:13px;font-weight:900;color:#fff;flex-shrink:0;">${(v.tour_code || '').slice(0, 4)}</div>`
    : `<div style="display:flex;width:36px;height:36px;border-radius:8px;background:linear-gradient(135deg,${tourColor},${tourColor}66);align-items:center;justify-content:center;font-size:13px;font-weight:900;color:#fff;flex-shrink:0;">${(v.tour_code || '').slice(0, 4)}</div>`;

  const statusBadge = v.is_running
    ? `<span style="padding:2px 8px;border-radius:4px;background:rgba(34,197,94,0.15);color:#22c55e;font-size:10px;font-weight:700;border:1px solid rgba(34,197,94,0.3);">LIVE NOW</span>`
    : `<span style="padding:2px 8px;border-radius:4px;background:rgba(59,130,246,0.12);color:#60a5fa;font-size:10px;font-weight:700;border:1px solid rgba(59,130,246,0.25);">UPCOMING</span>`;

  return `<div style="min-width:220px;max-width:300px;padding:14px 16px 12px;">
    <div style="display:flex;align-items:center;gap:8px;margin-bottom:8px;">
      ${logoHtml}
      <div>
        <div style="font-size:14px;font-weight:800;color:#fff;letter-spacing:0.3px;">${escapeHtml(v.tour_name || v.tour_code || v.name)}</div>
        <div style="font-size:10px;color:rgba(148,163,184,0.7);margin-top:1px;">${v.city || ''}, ${v.state || ''}</div>
      </div>
    </div>
    <div style="display:flex;align-items:center;gap:6px;margin-bottom:8px;flex-wrap:wrap;">
      <span style="padding:2px 8px;border-radius:4px;background:${tourColor}20;color:${tourColor};font-size:10px;font-weight:700;border:1px solid ${tourColor}30;">${v.tour_code || 'TOUR'}</span>
      ${statusBadge}
    </div>
    ${v.stop_name ? `<div style="font-size:12px;font-weight:600;color:rgba(255,255,255,0.9);margin-bottom:4px;">${escapeHtml(v.stop_name)}</div>` : ''}
    ${v.dates ? `<div style="font-size:11px;color:rgba(34,197,94,0.8);font-weight:600;margin-bottom:10px;">Dates: ${v.dates}</div>` : ''}
    <div style="display:flex;gap:6px;">
      <button class="fsp-trigger" data-url="/hub/tours/${v.tour_code || ''}" data-title="${escapeHtml(v.tour_name || v.tour_code || '')}" style="flex:1;padding:7px 12px;border-radius:6px;background:linear-gradient(135deg,${tourColor},${tourColor}cc);color:#fff;font-size:11px;font-weight:700;text-align:center;border:none;cursor:pointer;">View Tour</button>
      <button class="directions-trigger" data-lat="${v.latitude}" data-lng="${v.longitude}" data-addr="${encodeURIComponent((v.city || '') + ', ' + (v.state || ''))}" style="padding:7px 12px;border-radius:6px;background:rgba(255,255,255,0.08);color:rgba(255,255,255,0.8);font-size:11px;font-weight:600;border:1px solid rgba(255,255,255,0.12);cursor:pointer;">Directions</button>
    </div>
  </div>`;
}

// ─── Create cluster icon ───
function createClusterIcon(L, cluster) {
  const count = cluster.getChildCount();
  let size, fontSize, borderWidth;
  if (count >= 100) { size = 54; fontSize = 14; borderWidth = 3; }
  else if (count >= 50) { size = 46; fontSize = 13; borderWidth = 2.5; }
  else if (count >= 20) { size = 40; fontSize = 12; borderWidth = 2; }
  else if (count >= 10) { size = 34; fontSize = 11; borderWidth = 2; }
  else { size = 28; fontSize = 10; borderWidth = 2; }

  let bgGradient, glowColor, textColor;
  if (count >= 100) {
    bgGradient = 'linear-gradient(135deg, #d4a853 0%, #b8860b 50%, #8B6914 100%)';
    glowColor = 'rgba(212,168,83,0.5)'; textColor = '#000';
  } else if (count >= 50) {
    bgGradient = 'linear-gradient(135deg, #f0d48a 0%, #d4a853 50%, #b8860b 100%)';
    glowColor = 'rgba(212,168,83,0.4)'; textColor = '#000';
  } else if (count >= 20) {
    bgGradient = 'linear-gradient(135deg, rgba(212,168,83,0.9) 0%, rgba(184,134,11,0.85) 100%)';
    glowColor = 'rgba(212,168,83,0.35)'; textColor = '#000';
  } else {
    bgGradient = 'linear-gradient(135deg, rgba(212,168,83,0.75) 0%, rgba(184,134,11,0.7) 100%)';
    glowColor = 'rgba(212,168,83,0.25)'; textColor = '#1a1a2e';
  }

  return L.divIcon({
    html: `<div style="
      width:${size}px;height:${size}px;border-radius:50%;
      background:${bgGradient};
      border:${borderWidth}px solid rgba(255,255,255,0.9);
      display:flex;align-items:center;justify-content:center;
      font-size:${fontSize}px;font-weight:800;color:${textColor};
      box-shadow:0 0 ${size / 2}px ${glowColor}, 0 4px 16px rgba(0,0,0,0.5), inset 0 -2px 4px rgba(0,0,0,0.2);
      text-shadow:0 1px 2px rgba(255,255,255,0.3);
      font-family:'Inter',-apple-system,sans-serif;
      letter-spacing:-0.5px;
    ">${count}</div>`,
    className: 'vmp-cluster-icon',
    iconSize: [size, size],
  });
}

export default function VenueMapPanel({ venues = [], userLocation, onVenueSelect, radiusMiles }) {
  const mapRef = useRef(null);
  const mapInstanceRef = useRef(null);
  const markersLayerRef = useRef(null);
  const userMarkerRef = useRef(null);
  const mountedRef = useRef(true);
  const leafletRef = useRef(null);
  const onVenueSelectRef = useRef(onVenueSelect);
  const popupClickHandlerRef = useRef(null);
  const [mapReady, setMapReady] = useState(false);

  // Keep callback ref current without triggering marker re-render
  useEffect(() => { onVenueSelectRef.current = onVenueSelect; }, [onVenueSelect]);

  // Inject custom CSS once
  useEffect(() => {
    if (typeof document === 'undefined') return;
    if (document.querySelector('#vmp-logo-pin-css')) return;
    const style = document.createElement('style');
    style.id = 'vmp-logo-pin-css';
    style.textContent = LOGO_PIN_CSS;
    document.head.appendChild(style);
  }, []);

  // Phase 1: Initialize the map ONCE
  useEffect(() => {
    mountedRef.current = true;

    if (mapInstanceRef.current) return;
    if (!mapRef.current) return;

    const loadLeaflet = async () => {
      if (!document.querySelector('link[href*="leaflet"]')) {
        const link = document.createElement('link');
        link.rel = 'stylesheet';
        link.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
        document.head.appendChild(link);
      }
      // MarkerCluster CSS
      if (!document.querySelector('link[href*="MarkerCluster"]')) {
        const mcLink = document.createElement('link');
        mcLink.rel = 'stylesheet';
        mcLink.href = 'https://unpkg.com/leaflet.markercluster@1.5.3/dist/MarkerCluster.css';
        document.head.appendChild(mcLink);
        const mcDefault = document.createElement('link');
        mcDefault.rel = 'stylesheet';
        mcDefault.href = 'https://unpkg.com/leaflet.markercluster@1.5.3/dist/MarkerCluster.Default.css';
        document.head.appendChild(mcDefault);
      }

      const L = (await import('leaflet')).default;

      if (!mountedRef.current || !mapRef.current) return;

      leafletRef.current = L;

      const center = userLocation
        ? [userLocation.lat, userLocation.lng]
        : [36.1699, -115.1398]; // Default: Las Vegas

      const map = L.map(mapRef.current, {
        center,
        zoom: userLocation ? 10 : 5,
        zoomControl: true,
        attributionControl: false,
      });

      L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_nolabels/{z}/{x}/{y}{r}.png', {
        maxZoom: 19,
        subdomains: 'abcd',
      }).addTo(map);

      // Custom attribution
      L.control.attribution({ prefix: false })
        .addAttribution('Powered By <a href="https://smarter.poker">Smarter.Poker</a>')
        .addTo(map);

      // Create marker cluster group with logo-pin cluster icons
      let MCG;
      try {
        const mcModule = await import('leaflet.markercluster');
        MCG = mcModule.default || mcModule;
      } catch (e) {
        console.warn('MarkerCluster not available, falling back to layer group');
      }
      markersLayerRef.current = MCG
        ? L.markerClusterGroup({
            maxClusterRadius: 30,
            iconCreateFunction: function (cluster) {
              return createClusterIcon(L, cluster);
            },
            spiderfyOnMaxZoom: true,
            showCoverageOnHover: false,
            zoomToBoundsOnClick: true,
            disableClusteringAtZoom: 9,
          })
        : L.layerGroup();
      markersLayerRef.current.addTo(map);

      // ═══ LABEL VISIBILITY BASED ON ZOOM ═══
      function updateLabelVisibility() {
        const zoom = map.getZoom();
        const container = mapRef.current;
        if (!container) return;
        if (zoom >= 9) {
          container.classList.remove('vmp-labels-hidden');
        } else {
          container.classList.add('vmp-labels-hidden');
        }
      }
      map.on('zoomend', updateLabelVisibility);
      updateLabelVisibility();

      mapInstanceRef.current = map;
      setMapReady(true);

      // ═══ CLICK DELEGATION for popup buttons ═══
      popupClickHandlerRef.current = (e) => {
        // FSP trigger — open in iframe modal or navigate
        const fspTrigger = e.target.closest('.fsp-trigger');
        if (fspTrigger) {
          e.preventDefault();
          const url = fspTrigger.getAttribute('data-url');
          if (url) window.location.href = url;
          return;
        }
        // Directions trigger — open native maps
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
      };
      const container = mapRef.current;
      if (container) container.addEventListener('click', popupClickHandlerRef.current);
    };

    loadLeaflet().catch(err => console.error('Failed to load map:', err));

    return () => {
      mountedRef.current = false;
      const container = mapRef.current;
      if (container && popupClickHandlerRef.current) container.removeEventListener('click', popupClickHandlerRef.current);
      if (mapInstanceRef.current) {
        mapInstanceRef.current.remove();
        mapInstanceRef.current = null;
      }
      markersLayerRef.current = null;
      leafletRef.current = null;
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Phase 2: Update markers whenever venues change — now with logo pins
  useEffect(() => {
    const L = leafletRef.current;
    const map = mapInstanceRef.current;
    const layer = markersLayerRef.current;
    if (!L || !map || !layer) return;

    // Clear existing markers
    layer.clearLayers();
    if (userMarkerRef.current) {
      userMarkerRef.current.remove();
      userMarkerRef.current = null;
    }

    // Add venue markers with logo pins
    const validVenues = venues.filter(v => v.latitude && v.longitude);
    validVenues.forEach(v => {
      const venueIcon = createVenueIcon(L, v);
      const colors = VENUE_TYPE_COLORS[v.venue_type] || DEFAULT_VENUE_COLOR;
      const typeBadge = VENUE_TYPE_LABELS[v.venue_type] || v.venue_type || '';
      const tables = v.totalTables || 0;
      const detailPath = v.is_social_page
        ? '/club/' + v.social_page_id
        : '/hub/venues/' + v.id;

      // Build logo/initials badge
      const logoUrl = v.logo_url || v.logoUrl || v.profile_photo_url || '';
      const initials = (v.name || '').split(/\s+/).slice(0, 2).map(w => w[0] || '').join('').toUpperCase();
      const logoBadge = logoUrl
        ? `<img src="${logoUrl}" alt="" style="width:32px;height:32px;border-radius:8px;object-fit:contain;background:#fff;padding:2px;border:1.5px solid ${colors.fill}40;flex-shrink:0;" onerror="this.style.display='none';this.nextElementSibling.style.display='flex';" /><div style="display:none;width:32px;height:32px;border-radius:8px;background:linear-gradient(135deg,${colors.fill},rgba(0,0,0,0.3));align-items:center;justify-content:center;font-size:12px;font-weight:800;color:#fff;flex-shrink:0;">${initials}</div>`
        : `<div style="display:flex;width:32px;height:32px;border-radius:8px;background:linear-gradient(135deg,${colors.fill},rgba(0,0,0,0.3));align-items:center;justify-content:center;font-size:12px;font-weight:800;color:#fff;flex-shrink:0;">${initials}</div>`;

      // Live games info
      const gamesInfo = Array.isArray(v.games) && v.games.length
        ? `<div style="display:flex;align-items:center;gap:6px;margin-bottom:8px;flex-wrap:wrap;">
            <span style="padding:2px 8px;border-radius:4px;background:rgba(34,197,94,0.15);color:#22c55e;font-size:10px;font-weight:700;border:1px solid rgba(34,197,94,0.3);">LIVE · ${tables} Tables</span>
            <span style="font-size:10px;color:rgba(148,163,184,0.6);">${v.games.length} games</span>
          </div>`
        : '';

      const popupHtml = `<div style="min-width:200px;max-width:300px;padding:14px 16px 12px;">
        <div style="display:flex;align-items:center;gap:8px;margin-bottom:8px;">
          ${logoBadge}
          <div>
            <div style="font-size:14px;font-weight:700;color:#fff;line-height:1.2;">${escapeHtml(v.name)}</div>
            <div style="font-size:10px;color:rgba(148,163,184,0.7);margin-top:1px;">${v.city || ''}, ${v.state || ''}</div>
          </div>
        </div>
        <div style="display:flex;align-items:center;gap:6px;margin-bottom:6px;">
          <span style="padding:2px 8px;border-radius:4px;background:${colors.glow?.replace(/[\d.]+\)$/, '0.15)') || 'rgba(212,168,83,0.15)'};color:${colors.fill};font-size:10px;font-weight:600;">${typeBadge}</span>
        </div>
        ${gamesInfo}
        <div style="display:flex;gap:6px;">
          <button class="fsp-trigger" data-url="${detailPath}" data-title="${escapeHtml(v.name) || 'Venue Details'}" style="flex:1;padding:7px 12px;border-radius:6px;background:linear-gradient(135deg,#d4a853,#b8860b);color:#000;font-size:11px;font-weight:700;text-align:center;border:none;cursor:pointer;">View Details</button>
          <button class="directions-trigger" data-lat="${v.latitude}" data-lng="${v.longitude}" data-addr="${encodeURIComponent((v.address || '') + ' ' + (v.name || '') + ' ' + (v.city || '') + ', ' + (v.state || ''))}" style="padding:7px 12px;border-radius:6px;background:rgba(255,255,255,0.08);color:rgba(255,255,255,0.8);font-size:11px;font-weight:600;border:1px solid rgba(255,255,255,0.12);cursor:pointer;">Directions</button>
        </div>
      </div>`;

      const marker = L.marker([v.latitude, v.longitude], { icon: venueIcon })
        .bindPopup(popupHtml, { className: 'pnm-popup', maxWidth: 300, closeButton: true });

      // Touch preview on mobile
      marker.on('click', function(e) {
        if ('ontouchstart' in window) {
          e.originalEvent?.preventDefault?.();
          marker.openPopup();
        }
      });

      if (onVenueSelectRef.current) {
        marker.on('click', () => onVenueSelectRef.current(v));
      }

      layer.addLayer(marker);
    });

    // Add user location marker
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
    }

    // Fit bounds to show ALL venue markers — auto-expands when search widens
    if (validVenues.length > 0) {
      const bounds = L.latLngBounds(validVenues.map(v => [v.latitude, v.longitude]));
      if (userLocation) bounds.extend([userLocation.lat, userLocation.lng]);
      map.fitBounds(bounds, { padding: [40, 40], maxZoom: 13, animate: true, duration: 0.6 });
    } else if (userLocation) {
      // No venues — just center on user
      const zoom = radiusMiles && radiusMiles !== 'any' && radiusMiles !== 'Any'
        ? radiusToZoom(radiusMiles) : 10;
      map.setView([userLocation.lat, userLocation.lng], zoom, { animate: true, duration: 0.6 });
    }
  }, [venues, userLocation, radiusMiles]);

  // Dynamic radius zoom is now handled by the Phase 2 markers effect above
  // (venues prop changes when radius filter changes, triggering fitBounds)

  return (
    <div style={{ position: 'relative', height: '100%' }}>
      <div
        ref={mapRef}
        style={{
          width: '100%', height: '100%', minHeight: 300, borderRadius: 12, overflow: 'hidden',
          border: '1px solid rgba(212,168,83,0.15)',
          background: '#060810',
        }}
      />
      {!mapReady && (
        <div style={{
          position: 'absolute', inset: 0, display: 'flex', alignItems: 'center',
          justifyContent: 'center', color: 'rgba(212,168,83,0.6)',
          fontSize: 14, borderRadius: 12, fontFamily: 'Inter, -apple-system, sans-serif',
          fontWeight: 600, letterSpacing: '1px',
        }}>
          LOADING MAP...
        </div>
      )}
      <div style={{
        marginTop: 8, fontSize: 12, color: 'rgba(200,214,229,0.4)',
        textAlign: 'center',
      }}>
        {venues.filter(v => v.latitude && v.longitude).length} venues on map
        {userLocation && ' • GPS active'}
      </div>
    </div>
  );
}
