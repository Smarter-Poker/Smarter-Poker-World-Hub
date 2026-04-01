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
  home_game: { fill: '#f59e0b', glow: 'rgba(245,158,11,0.5)', label: 'Amber' },
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

// ─── Helper: Create venue marker icon ───
function createVenueIcon(L, venueType) {
  const colors = VENUE_TYPE_COLORS[venueType] || DEFAULT_VENUE_COLOR;
  return L.divIcon({
    className: 'venue-map-marker',
    html: `<div style="position:relative;width:22px;height:22px;">
      <div style="position:absolute;inset:0;border-radius:50%;background:${colors.glow};animation:markerPulse 3s ease-in-out infinite;"></div>
      <div style="position:absolute;top:3px;left:3px;width:16px;height:16px;border-radius:50%;background:${colors.fill};border:2px solid rgba(255,255,255,0.85);box-shadow:0 0 10px ${colors.glow};--marker-glow:${colors.glow};animation:markerGlow 3s ease-in-out infinite;"></div>
    </div>`,
    iconSize: [22, 22],
    iconAnchor: [11, 11],
    popupAnchor: [0, -14],
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
  const logoUrl = venue.logo_url || venue.image_url || '';
  const initials = (venue.name || '').split(/\s+/).slice(0, 2).map(w => w[0] || '').join('').toUpperCase();
  const logoBadge = logoUrl
    ? `<img src="${logoUrl}" alt="" style="width:36px;height:36px;border-radius:8px;object-fit:cover;border:1.5px solid rgba(212,168,83,0.3);flex-shrink:0;" onerror="this.style.display='none';this.nextElementSibling.style.display='flex';" /><div style="display:none;width:36px;height:36px;border-radius:8px;background:linear-gradient(135deg,${colors.fill},rgba(0,0,0,0.3));align-items:center;justify-content:center;font-size:13px;font-weight:800;color:#fff;flex-shrink:0;border:1.5px solid rgba(255,255,255,0.2);">${initials}</div>`
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
      <span style="padding:3px 10px;border-radius:6px;background:rgba(${colors.fill === '#d4a853' ? '212,168,83' : colors.fill === '#00d4ff' ? '0,212,255' : colors.fill === '#22c55e' ? '34,197,94' : colors.fill === '#a855f7' ? '168,85,247' : '245,158,11'},0.15);color:${colors.fill};font-size:11px;font-weight:600;letter-spacing:0.3px;">${typeBadge}</span>
      ${hours ? `<span style="font-size:11px;color:rgba(148,163,184,0.6);">· ${hours}</span>` : ''}
    </div>
    ${games ? `<div style="font-size:11px;color:rgba(148,163,184,0.6);margin-bottom:8px;">Games: ${games}</div>` : ''}
    <div style="display:flex;align-items:center;gap:8px;margin-bottom:14px;">
      <div style="padding:4px 10px;border-radius:6px;background:${trust.bg};color:${trust.color};font-size:11px;font-weight:700;">Trust: ${trust.label}</div>
      <div style="font-size:11px;color:rgba(148,163,184,0.5);">${venue.trust_score || '—'}/5</div>
    </div>
    <div style="display:flex;gap:8px;flex-wrap:wrap;">
      <a href="${detailPath}" style="flex:1;padding:8px 14px;border-radius:8px;background:linear-gradient(135deg,#d4a853,#b8860b);color:#000;text-decoration:none;font-size:12px;font-weight:700;text-align:center;transition:transform 0.15s;letter-spacing:0.3px;">View Details</a>
      <a href="https://www.google.com/maps/dir/?api=1&destination=${venue.latitude},${venue.longitude}" target="_blank" rel="noopener" style="padding:8px 14px;border-radius:8px;background:rgba(255,255,255,0.08);color:rgba(255,255,255,0.8);text-decoration:none;font-size:12px;font-weight:600;border:1px solid rgba(255,255,255,0.12);text-align:center;transition:all 0.15s;">Directions</a>
    </div>
  </div>`;
}

// ─── Main Map Component ───
export default function VenueMap({ venues, userLocation, fullHeight = false, onVenueClick }) {
  const [legendCollapsed, setLegendCollapsed] = useState(false);
  const mapContainerRef = useRef(null);
  const mapInstanceRef = useRef(null);
  const userMarkerRef = useRef(null);
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

        const checkReady = () => {
          if (window.L && window.L.MarkerClusterGroup) {
            setMapReady(true);
          } else {
            setTimeout(checkReady, 100);
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
    if (mapInstanceRef.current) return;

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

    // ═══ VENUE MARKERS — Lower cluster radius for more individual pins ═══
    const clusterGroup = L.markerClusterGroup({
      maxClusterRadius: 30,
      iconCreateFunction: function(cluster) {
        return createClusterIcon(L, cluster);
      },
      spiderfyOnMaxZoom: true,
      showCoverageOnHover: false,
      zoomToBoundsOnClick: true,
      disableClusteringAtZoom: 10,
    });

    const validVenues = (venues || []).filter(function(v) { return v.latitude && v.longitude; });

    validVenues.forEach(function(venue) {
      const venueIcon = createVenueIcon(L, venue.venue_type);
      const popupHtml = buildPopupHtml(venue);

      const marker = L.marker([venue.latitude, venue.longitude], { icon: venueIcon })
        .bindPopup(popupHtml, { maxWidth: 320, className: 'venue-popup', closeButton: true });

      const radius = getGeofenceRadius(venue.venue_type);
      const venueColors = VENUE_TYPE_COLORS[venue.venue_type] || DEFAULT_VENUE_COLOR;
      const circle = L.circle([venue.latitude, venue.longitude], {
        radius: radius,
        color: venueColors.fill,
        weight: 1,
        opacity: 0.35,
        fillColor: venueColors.fill,
        fillOpacity: 0.08,
      });

      marker._venueCircle = circle;
      marker._venueData = venue;
      // Fire onVenueClick callback when marker popup opens
      marker.on('popupopen', function() {
        if (onVenueClick && venue.id) {
          onVenueClick(venue);
        }
      });

      clusterGroup.addLayer(marker);
    });

    map.addLayer(clusterGroup);

    // Geofence circles at high zoom
    const circlesGroup = L.layerGroup();
    circlesGroup.addTo(map);

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

    map.on('zoomend', updateCircles);
    updateCircles();

    // ═══ SHOW USER LOCATION PIN IMMEDIATELY IF AVAILABLE ═══
    if (userLocation) {
      const userIcon = L.divIcon({
        className: 'user-location-dot',
        html: '<div style="position:relative;width:28px;height:28px;">' +
          '<div style="position:absolute;inset:0;border-radius:50%;background:rgba(59,130,246,0.3);animation:userPulse 2s ease-in-out infinite;"></div>' +
          '<div style="position:absolute;top:4px;left:4px;width:20px;height:20px;border-radius:50%;background:#3b82f6;border:3px solid #fff;box-shadow:0 0 16px rgba(59,130,246,0.9), 0 0 32px rgba(59,130,246,0.4);"></div>' +
          '</div>',
        iconSize: [28, 28],
        iconAnchor: [14, 14],
      });

      userMarkerRef.current = L.marker([userLocation.lat, userLocation.lng], { icon: userIcon, zIndexOffset: 1000 })
        .addTo(map)
        .bindPopup('<div style="padding:10px 14px;"><b style="color:#fff;font-size:14px;">You Are Here</b><br/><span style="font-size:11px;color:rgba(148,163,184,0.7);">Your Current Location</span></div>');

      map.setView([userLocation.lat, userLocation.lng], 8);
    }

    return () => {
      map.remove();
      mapInstanceRef.current = null;
    };
  }, [mapReady]); // eslint-disable-line react-hooks/exhaustive-deps

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
        className: 'user-location-dot',
        html: '<div style="position:relative;width:24px;height:24px;">' +
          '<div style="position:absolute;inset:0;border-radius:50%;background:rgba(59,130,246,0.3);animation:userPulse 2s ease-in-out infinite;"></div>' +
          '<div style="position:absolute;top:5px;left:5px;width:14px;height:14px;border-radius:50%;background:#3b82f6;border:3px solid #fff;box-shadow:0 0 12px rgba(59,130,246,0.8);"></div>' +
          '</div>',
        iconSize: [24, 24],
        iconAnchor: [12, 12],
      });

      userMarkerRef.current = L.marker([userLocation.lat, userLocation.lng], { icon: userIcon, zIndexOffset: 1000 })
        .addTo(map)
        .bindPopup('<div style="padding:8px 12px;"><b style="color:#fff;font-size:14px;">Your Location</b></div>');

      map.setView([userLocation.lat, userLocation.lng], Math.max(map.getZoom(), 12));
    }
  }, [userLocation, mapReady]);

  // Legend items
  const legendItems = [
    { type: 'casino', label: 'Casino', color: '#d4a853' },
    { type: 'card_room', label: 'Card Room', color: '#00d4ff' },
    { type: 'poker_club', label: 'Poker Club', color: '#22c55e' },
    { type: 'charity', label: 'Charity', color: '#a855f7' },
    { type: 'home_game', label: 'Home Game', color: '#f59e0b' },
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
      {mapReady && (
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
