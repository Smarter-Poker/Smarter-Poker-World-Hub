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
 * - Leaflet + leaflet.markercluster (loaded from pinned npm packages)
 * - Dark tile layer from CartoDB
 * - /public/data/us-states-simplified.json
 * - /public/data/us-mask-outer.json
 */

import React, { useRef, useState, useEffect, useId, useMemo } from 'react';
import { radiusToZoom } from './pnm-utils';
import MapPreferenceChooser from './MapPreferenceChooser';
import MapCoverageReadout from './MapCoverageReadout';
import {
  addPokerMapLayers,
  createPokerMapSession,
  createPokerMarkerLayer,
  loadPokerMapRuntime,
  resetPokerMapRuntime,
} from '../../lib/poker-near-me/mapRuntime';
import { capturePokerNearMeEvent } from '../../lib/poker-near-me/activity';
import { isVenueMapEligible, summarizeVenueIntegrity } from '../../lib/poker-near-me/venueIntegrity';
import {
  buildPokerTourPopupHtml,
  buildPokerVenuePopupHtml,
  createPokerClusterIcon,
  createPokerPopupClickHandler,
  createPokerTourIcon,
  createPokerUserLocationIcon,
  createPokerVenueContentSignature,
  createPokerVenueIcon,
  isPokerTourStop,
  pokerVenueTheme,
} from './mapPresentation';

// ─── Constants ───
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
.venue-map-legend--coverage { bottom: 92px; }
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
@media (prefers-reduced-motion: reduce) {
  .pnm-leaflet-map *, .pnm-leaflet-map *::before, .pnm-leaflet-map *::after {
    animation: none !important;
    transition: none !important;
  }
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
          <p style={{ fontSize: 13 }}>Unable To Load The Map. This May Be Caused By An Ad Blocker Or Network Issue.</p>
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
// ─── Main Map Component ───
export default function VenueMap({ venues, userLocation, centerLocation, fullHeight = false, onVenueClick, hideLegend = false, radiusMiles, uniformColor, onOpenIframeModal, disableClustering = false, clusterTourStops = false, isFavorited }) {
  const normalizedUniformColor = typeof uniformColor === 'string' && /^#[0-9a-f]{6}$/i.test(uniformColor.trim())
    ? uniformColor.trim()
    : null;
  const [legendCollapsed, setLegendCollapsed] = useState(false);
  const [visibleCount, setVisibleCount] = useState(0);
  const [viewportCount, setViewportCount] = useState(0);
  const [zoomLevel, setZoomLevel] = useState(0);
  const [mapLoadMs, setMapLoadMs] = useState(null);
  const mapContainerRef = useRef(null);
  const mountedRef = useRef(true);
  const venuesRef = useRef(venues || []);
  const loadStartedAtRef = useRef(Date.now());
  const telemetrySentRef = useRef(false);
  const integritySummary = useMemo(() => summarizeVenueIntegrity(venues || []), [venues]);
  venuesRef.current = venues || [];

  // Unconditional unmount handler for background polling safety
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);
  const mapInstanceRef = useRef(null);
  const mapSessionRef = useRef(null);
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
  const [mapError, setMapError] = useState('');
  const [mapLoadAttempt, setMapLoadAttempt] = useState(0);
  const [clusteringAvailable, setClusteringAvailable] = useState(false);
  const mapInstructionsId = `pnm-map-instructions-${useId().replace(/:/g, '')}`;

  // Keep the refs current without triggering re-init
  useEffect(() => { onOpenIframeModalRef.current = onOpenIframeModal; }, [onOpenIframeModal]);
  useEffect(() => { onVenueClickRef.current = onVenueClick; }, [onVenueClick]);

  // Load the shared, locally bundled Leaflet runtime once per browser session.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    setMapError('');
    loadPokerMapRuntime()
      .then((runtime) => {
        if (!mountedRef.current) return;
        setClusteringAvailable(runtime.clusteringAvailable);
        setMapReady(true);
      })
      .catch((err) => {
        console.warn('Failed to load local Leaflet runtime:', err);
        if (mountedRef.current) setMapError('The map engine could not be loaded. Venue lists remain available.');
      });
  }, [mapLoadAttempt]);

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
    
    const handlePopupClicks = createPokerPopupClickHandler({
      onOpenDetails: (path, title) => {
        if (onOpenIframeModalRef.current) onOpenIframeModalRef.current(path, title);
        else window.location.assign(path);
      },
    });
    
    // [VM4 FIX] Declare container at effect scope so early-return guard can safely reference it.
    // Previously "container" was only defined inside updateLabelVisibility() at line ~921,
    // so the early-return at line 776-779 threw ReferenceError: container is not defined
    // on every re-render where mapReady changed with an already-initialized map instance.
    const container = mapContainerRef.current;

    // If a map instance somehow already exists on this container (e.g. Strict Mode),
    // we MUST destroy it completely before recreating, otherwise Leaflet throws
    // "Map container is already initialized."
    mapSessionRef.current?.destroy();
    mapSessionRef.current = null;
    mapInstanceRef.current = null;

    // New mount — add listener for this session
    container.addEventListener('click', handlePopupClicks);

    const L = window.L;
    // Continental US bounds — tight fit
    const usBounds = L.latLngBounds(
      L.latLng(24.396308, -125.0),   // Southwest
      L.latLng(49.384358, -66.93457) // Northeast
    );

    const session = createPokerMapSession({
      L,
      container,
      mapOptions: {
        maxBounds: usBounds.pad(0.05),
        maxBoundsViscosity: 1.0,
        minZoom: 4,
        dragging: true,
        tap: true,
        touchZoom: true,
        scrollWheelZoom: !!fullHeight,
        doubleClickZoom: true,
        boxZoom: true,
      },
    });
    const { map } = session;
    mapSessionRef.current = session;

    // Fit to US bounds
    map.fitBounds(usBounds, { padding: [20, 20], maxZoom: 6 });

    mapInstanceRef.current = map;

    // ═══ LOAD US GEOJSON OVERLAYS ═══
    const loadOverlays = async () => {
      try {
        // Load states GeoJSON for boundaries + mask
        const statesResp = await fetch('/data/us-states-simplified.json');
        const statesData = await statesResp.json();
        if (!mountedRef.current || mapSessionRef.current !== session) return;

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
    // If the optional cluster plugin cannot initialize, preserve a functional plain map.
    const { layer: clusterGroup } = createPokerMarkerLayer({
      L,
      map,
      clusteringAvailable,
      disableClustering,
      iconCreateFunction: (cluster) => createPokerClusterIcon(L, cluster),
      disableClusteringAtZoom: 8,
    });
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
    function updateCoverage() {
      const bounds = map.getBounds();
      const count = venuesRef.current.filter(function(venue) {
        if (!isVenueMapEligible(venue)) return false;
        const lat = Number(venue && venue.latitude);
        const lng = Number(venue && venue.longitude);
        return Number.isFinite(lat) && Number.isFinite(lng) && !venue.hideOnMap && bounds.contains([lat, lng]);
      }).length;
      setViewportCount(count);
      setZoomLevel(map.getZoom());
    }
    map.on('moveend', updateCoverage);
    map.on('zoomend', updateCoverage);
    // Set initial label visibility
    updateLabelVisibility();
    updateCoverage();

    // ═══ SHOW USER LOCATION PIN IMMEDIATELY IF AVAILABLE ═══
    if (userLocation) {
      const userIcon = createPokerUserLocationIcon(L);

      userMarkerRef.current = L.marker([userLocation.lat, userLocation.lng], { icon: userIcon, zIndexOffset: 1000 })
        .addTo(map)
        .bindPopup('<div style="padding:10px 14px;"><b style="color:#fff;font-size:14px;">You Are Here</b><br/><span style="font-size:11px;color:rgba(148,163,184,0.7);">Your Current Location</span></div>');

      // Do NOT auto-zoom to user location — keep full US overview so users can explore all venues
    }

    return () => {
      container.removeEventListener('click', handlePopupClicks);
      mapSessionRef.current?.destroy();
      mapSessionRef.current = null;
      mapInstanceRef.current = null;
      clusterGroupRef.current = null;
      circlesGroupRef.current = null;
      tourLayerRef.current = null;
      userMarkerRef.current = null;
      radiusCircleRef.current = null;
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
    // parent state change rebuilt popup HTML for the whole dataset and snapped shut any
    // popup the user had open. Compare a content signature of everything the pins and
    // popups actually display and bail out when nothing meaningful changed.
    const drawnVenues = (venues || []).filter(function(v) { return v && isVenueMapEligible(v) && !v.hideOnMap; });
    const signature = createPokerVenueContentSignature(drawnVenues, {
      userLocation,
      overrideColor: normalizedUniformColor,
      isFavorited,
    });
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

    const clusteredMarkers = [];
    const tourMarkers = [];
    validVenues.forEach(function(venue) {
      // ═══ TOUR STOPS — NEVER clustered, always distinct red/gold pins ═══
      const isTourStop = isPokerTourStop(venue);
      const venueIcon = isTourStop
        ? createPokerTourIcon(L, venue)
        : createPokerVenueIcon(L, venue, { overrideColor: normalizedUniformColor });

      // Favorited venue pins get a gold pulse ring wrapped around the icon
      const isFav = !isTourStop && isFavorited && isFavorited('venue', venue.id);
      const finalIcon = isFav ? (() => {
        const base = createPokerVenueIcon(L, venue, { overrideColor: normalizedUniformColor });
        const size = base.options?.iconSize?.[0] || 36;
        const favHtml = `<div style="position:relative;width:${size + 10}px;height:${size + 10}px;">
          <div style="position:absolute;top:-1px;left:-1px;width:${size + 2}px;height:${size + 2}px;border-radius:50%;border:2.5px solid #ffffff;opacity:0.85;animation:markerPulse 1.8s ease-in-out infinite;"></div>
          ${base.options.html}
        </div>`;
        // ANCHOR NOTE: the wrapper grows to size+10 but its CONTENT does not move —
        // the pulse ring is absolutely positioned at (-1,-1) and the base icon markup
        // sits in normal flow at (0,0), so the visible circle's centre stays at
        // (size/2, size/2) inside the larger box. base.options.iconAnchor is exactly
        // that point, so it must be carried through unchanged; recentring the anchor
        // on the padded box would draw every favourited pin 5px up-left of its real
        // coordinates (detached from its own geofence circle).
        const favSize = size + 10;
        return L.divIcon({
          ...base.options,
          html: favHtml,
          iconSize: [favSize, favSize],
        });
      })() : venueIcon;
      // Pass distance via local data attr — do NOT mutate venue object
      const distMi = distanceMap.get(venue.id) ?? null;
      const venueWithDist = distMi != null ? { ...venue, _distanceMi: distMi } : venue;
      const popupHtml = isTourStop
        ? buildPokerTourPopupHtml(venueWithDist)
        : buildPokerVenuePopupHtml(venueWithDist, { overrideColor: normalizedUniformColor });

      // UX FIX: tour pins used to be drawn +0.012 lat / -0.008 lng (~1.3km) away from the
      // venue they represent, which put the pin in a different neighbourhood at city zoom
      // and left it visibly detached from its own geofence circle (drawn at true coords).
      // Visual precedence is already guaranteed by the never-clustered tourLayer plus the
      // zIndexOffset below, so tour pins now render at their real position.
      const marker = L.marker([venue.latitude, venue.longitude], {
        icon: finalIcon,
        zIndexOffset: isTourStop ? 1000 : isFav ? 500 : 0,
        keyboard: true,
        title: venue.name || 'Poker venue',
        alt: `${venue.name || 'Poker venue'} map marker`,
      })
        .bindPopup(popupHtml, { maxWidth: 320, className: 'venue-popup', closeButton: true });

      if (!isTourStop) {
        const radius = getGeofenceRadius(venue.venue_type);
        const circleColor = pokerVenueTheme(venue.venue_type, normalizedUniformColor).fill;
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

      if (isTourStop && !clusterTourStops) {
        // Live tour maps keep priority tour pins visible. Dense national series
        // directories can opt into clustering without changing marker identity.
        tourMarkers.push(marker);
      } else {
        clusteredMarkers.push(marker);
      }
    });
    addPokerMapLayers(clusterGroup, clusteredMarkers);
    addPokerMapLayers(tourLayer, tourMarkers);
    const bounds = mapInstanceRef.current.getBounds();
    setViewportCount(validVenues.filter(function(venue) {
      return bounds.contains([Number(venue.latitude), Number(venue.longitude)]);
    }).length);
    setZoomLevel(mapInstanceRef.current.getZoom());
    if (!telemetrySentRef.current) {
      telemetrySentRef.current = true;
      const duration = Math.max(0, Date.now() - loadStartedAtRef.current);
      setMapLoadMs(duration);
      capturePokerNearMeEvent('map_runtime_ready', {
        route: typeof window !== 'undefined' ? window.location.pathname : undefined,
        surface: 'venue_map',
        result_count: validVenues.length,
        duration_ms: duration,
        clustering: disableClustering ? 'disabled' : clusteringAvailable ? 'available' : 'fallback',
        runtime_source: 'local',
        zoom_level: mapInstanceRef.current.getZoom(),
        verified_count: integritySummary.verified,
        approximate_count: integritySummary.approximate,
        held_count: integritySummary.held,
      });
    }
  // [VM2 FIX] Added isFavorited and userLocation to deps — missing caused:
  //   - Favorites gold ring never appearing after a favorite action
  //   - Distance/nearest venue not recomputing when GPS location resolves
  }, [venues, normalizedUniformColor, mapReady, isFavorited, userLocation, clusterTourStops, integritySummary]); // eslint-disable-line react-hooks/exhaustive-deps

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
      const userIcon = createPokerUserLocationIcon(L);

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
      {!mapReady && !mapError && (
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
      {mapError && (
        <div role="alert" style={{ minHeight: 260, padding: 32, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 12, textAlign: 'center', color: '#e2e8f0', background: '#060810', border: '1px solid rgba(239,68,68,0.35)', borderRadius: fullHeight ? 0 : 12 }}>
          <strong>Map Unavailable</strong>
          <span style={{ color: 'rgba(226,232,240,0.7)', fontSize: 13 }}>{mapError}</span>
          <button type="button" onClick={() => { resetPokerMapRuntime(); setMapReady(false); setMapLoadAttempt(value => value + 1); }} style={{ minWidth: 120, minHeight: 44, padding: '10px 18px', color: '#fff', background: 'rgba(255,255,255,0.1)', border: '1px solid rgba(255,255,255,0.3)', borderRadius: 8, cursor: 'pointer' }}>Try Map Again</button>
        </div>
      )}
      <div
        ref={mapContainerRef}
        className="pnm-leaflet-map"
        role="region"
        aria-label="Interactive poker venue map"
        aria-describedby={mapInstructionsId}
        aria-busy={!mapReady}
        data-map-ready={mapReady ? 'true' : 'false'}
        data-map-marker-count={visibleCount}
        data-map-visible-count={viewportCount}
        data-map-zoom={Math.round(zoomLevel)}
        data-map-load-ms={mapLoadMs == null ? '' : mapLoadMs}
        data-map-clustering={disableClustering ? 'disabled' : clusteringAvailable ? 'available' : 'fallback'}
        data-map-style-source="local"
        data-map-foundation="shared-v2"
        data-map-integrity-held={integritySummary.held}
        tabIndex={0}
        style={{
          width: '100%',
          ...(fullHeight
            ? { height: '100%', minHeight: 400 }
            : { aspectRatio: '16 / 9', maxHeight: '50vh', minHeight: 260 }),
          borderRadius: fullHeight ? 0 : 12,
          overflow: 'hidden',
          border: fullHeight ? 'none' : '1px solid rgba(255,255,255,0.15)',
          display: mapReady && !mapError ? 'block' : 'none',
          boxShadow: fullHeight ? 'none' : '0 4px 24px rgba(0,0,0,0.4)',
        }}
      />
      <p id={mapInstructionsId} className="sr-only">
        Interactive Poker Venue Map. Use Arrow Keys To Pan, Plus And Minus To Zoom, And Tab To Move Between Venue Markers.
      </p>
      {/* ═══ VENUE TYPE LEGEND ═══ */}
      {mapReady && !hideLegend && (
        // A11Y: the legend is the collapse/expand control, so it needs a role, a tab
        // stop and keyboard activation. Kept as a div (not a button) so the existing
        // .venue-map-legend layout and its block-level children stay valid.
        <div className="venue-map-legend venue-map-legend--coverage" style={{ opacity: legendCollapsed ? 0.5 : 1, cursor: 'pointer' }}
          role="button"
          tabIndex={0}
          aria-expanded={!legendCollapsed}
          aria-label="Toggle venue type legend"
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ' || e.key === 'Spacebar') {
              e.preventDefault();
              e.stopPropagation();
              setLegendCollapsed(!legendCollapsed);
            }
          }}
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

      <MapCoverageReadout
        total={visibleCount}
        visible={viewportCount}
        zoom={zoomLevel}
        ready={mapReady}
        clustering={!disableClustering && clusteringAvailable && visibleCount >= 20}
        gps={!!userLocation}
        verified={integritySummary.verified}
        approximate={integritySummary.approximate}
        held={integritySummary.held}
      />
    </div>
  );
}
