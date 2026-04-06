import React, { useState, useEffect, useRef } from 'react';
import { radiusToZoom } from './pnm-utils';

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
  card_room: { fill: '#00d4ff', glow: 'rgba(0,212,255,0.5)' },
  poker_club: { fill: '#22c55e', glow: 'rgba(34,197,94,0.5)' },
  charity: { fill: '#a855f7', glow: 'rgba(168,85,247,0.5)' },
  home_game: { fill: '#ffffff', glow: 'rgba(255,255,255,0.5)' },
};
const DEFAULT_VENUE_COLOR = VENUE_TYPE_COLORS.casino;

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
  const [mapReady, setMapReady] = useState(false);

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
    };

    loadLeaflet().catch(err => console.error('Failed to load map:', err));

    return () => {
      mountedRef.current = false;
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
      const safeName = (v.name || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/'/g, '&#39;').replace(/"/g, '&quot;');
      const tables = v.totalTables || 0;
      const gamesHtml = Array.isArray(v.games) && v.games.length
        ? `<br/><span style="color:#3fb950;font-size:11px;">${tables} tables · ${v.games.length} games</span>`
        : '';

      const detailPath = v.is_social_page
        ? '/club/' + v.social_page_id
        : '/hub/venues/' + v.id;

      const marker = L.marker([v.latitude, v.longitude], { icon: venueIcon })
        .bindPopup(
          `<div style="font-family:'Inter',-apple-system,sans-serif;font-size:13px;min-width:180px;padding:12px 14px;">
            <strong style="color:#fff;font-size:14px;">${safeName}</strong><br/>
            <span style="color:rgba(148,163,184,0.7);font-size:11px;">${v.city || ''}, ${v.state || ''}</span>
            ${gamesHtml}
            <br/><a href="${detailPath}" style="color:#d4a853;font-size:12px;text-decoration:underline;margin-top:6px;display:inline-block;font-weight:600;">View Details</a>
          </div>`,
          { className: 'pnm-popup', maxWidth: 280 }
        );

      if (onVenueSelect) {
        marker.on('click', () => onVenueSelect(v));
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

    // Fit bounds to show relevant area
    if (userLocation && radiusMiles && radiusMiles !== 'any' && radiusMiles !== 'Any') {
      const zoom = radiusToZoom(radiusMiles);
      map.setView([userLocation.lat, userLocation.lng], zoom, { animate: true, duration: 0.6 });
    } else if (validVenues.length > 0) {
      const bounds = L.latLngBounds(validVenues.map(v => [v.latitude, v.longitude]));
      if (userLocation) bounds.extend([userLocation.lat, userLocation.lng]);
      map.fitBounds(bounds, { padding: [30, 30], maxZoom: 12 });
    }
  }, [venues, userLocation, onVenueSelect, radiusMiles]);

  // ═══ DYNAMIC RADIUS ZOOM — Adjust zoom when radius filter changes ═══
  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map || !mapReady) return;
    if (!userLocation || !radiusMiles || radiusMiles === 'any' || radiusMiles === 'Any') return;

    const zoom = radiusToZoom(radiusMiles);
    map.setView([userLocation.lat, userLocation.lng], zoom, { animate: true, duration: 0.6 });
  }, [radiusMiles, userLocation, mapReady]);

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
