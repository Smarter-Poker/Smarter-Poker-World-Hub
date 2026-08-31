import { useState, useEffect, useRef, useId, useMemo } from 'react';
import { radiusToZoom } from './pnm-utils';
import {
  addPokerMapLayers,
  createPokerMapSession,
  createPokerMarkerLayer,
  loadPokerMapRuntime,
  resetPokerMapRuntime,
} from '../../lib/poker-near-me/mapRuntime';
import { appendPokerMapBounds, isVenueWithinPokerMapBounds, pokerMapBoundsFromLeaflet } from '../../lib/poker-near-me/mapBounds';
import { capturePokerNearMeEvent } from '../../lib/poker-near-me/activity';
import { isVenueMapEligible, summarizeVenueIntegrity } from '../../lib/poker-near-me/venueIntegrity';
import MapCoverageReadout from './MapCoverageReadout';
import {
  buildPokerTourPopupHtml,
  buildPokerVenuePopupHtml,
  createPokerClusterIcon,
  createPokerPopupClickHandler,
  createPokerTourIcon,
  createPokerUserLocationIcon,
  createPokerVenueContentSignature,
  createPokerVenueGeographySignature,
  createPokerVenueIcon,
  isPokerTourStop,
} from './mapPresentation';

/**
 * VenueMapPanel — Leaflet map rendering for Poker Near Me venues.
 * 
 * NOW uses logo-based venue pins (Google Maps-style) matching VenueMap.jsx.
 * Each venue shows its logo in a circular pin with the name underneath.
 * Labels only appear at zoom >= 9 to prevent clutter with many venues.
 */

// ─── Custom CSS for logo pins ───
const LOGO_PIN_CSS = `
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
/* Ensure map panes don't block interaction */
.leaflet-map-pane,
.leaflet-tile-pane {
  touch-action: none !important;
}
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
  border: 1px solid rgba(255,255,255,0.2) !important;
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

export default function VenueMapPanel({ venues = [], userLocation, onVenueSelect, radiusMiles, enableViewportSearch = false, viewportState }) {
  const [viewportVenues, setViewportVenues] = useState(null);
  const activeVenues = viewportVenues || venues;
  const mapRef = useRef(null);
  const mapInstanceRef = useRef(null);
  const mapSessionRef = useRef(null);
  const markersLayerRef = useRef(null);
  const userMarkerRef = useRef(null);
  const mountedRef = useRef(true);
  const leafletRef = useRef(null);
  const onVenueSelectRef = useRef(onVenueSelect);
  const popupClickHandlerRef = useRef(null);
  const activeVenuesRef = useRef(activeVenues);
  const baseVenuesRef = useRef(venues);
  const viewportAbortRef = useRef(null);
  const viewportBoundsRef = useRef(null);
  const loadStartedAtRef = useRef(Date.now());
  const telemetrySentRef = useRef(false);
  activeVenuesRef.current = activeVenues;
  baseVenuesRef.current = venues;
  // Signature of the rendered venue set — lets us skip a full marker rebuild + fitBounds
  // when the parent re-renders with a new array holding the same venues.
  const renderedSignatureRef = useRef(null);
  // Geography-only signature — gates fitBounds independently of pin/popup content refreshes
  const fittedGeoSignatureRef = useRef(null);
  const [mapReady, setMapReady] = useState(false);
  const [mapError, setMapError] = useState('');
  const [mapLoadAttempt, setMapLoadAttempt] = useState(0);
  const [clusteringAvailable, setClusteringAvailable] = useState(false);
  const [viewportCount, setViewportCount] = useState(0);
  const [zoomLevel, setZoomLevel] = useState(userLocation ? 10 : 5);
  const [mapLoadMs, setMapLoadMs] = useState(null);
  const [areaSearchAvailable, setAreaSearchAvailable] = useState(false);
  const [areaSearchBusy, setAreaSearchBusy] = useState(false);
  const [areaSearchError, setAreaSearchError] = useState('');
  const mapInstructionsId = `pnm-panel-map-instructions-${useId().replace(/:/g, '')}`;
  const integritySummary = useMemo(() => summarizeVenueIntegrity(activeVenues), [activeVenues]);
  const mappedVenueCount = integritySummary.mapped;
  const baseGeoSignature = venues
    .map(v => `${v.id || v.name || ''}:${v.latitude || ''},${v.longitude || ''}`)
    .sort()
    .join('|');

  useEffect(() => {
    setViewportVenues(null);
    setAreaSearchAvailable(false);
    setAreaSearchError('');
  }, [baseGeoSignature, viewportState]);

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
    setMapError('');

    if (mapInstanceRef.current) return;
    if (!mapRef.current) return;

    const loadLeaflet = async () => {
      const runtime = await loadPokerMapRuntime();
      const { L } = runtime;

      if (!mountedRef.current || !mapRef.current) return;

      leafletRef.current = L;
      setClusteringAvailable(runtime.clusteringAvailable);

      const center = userLocation
        ? [userLocation.lat, userLocation.lng]
        : [36.1699, -115.1398]; // Default: Las Vegas

      const session = createPokerMapSession({
        L,
        container: mapRef.current,
        mapOptions: {
          center,
          zoom: userLocation ? 10 : 5,
          dragging: true,
          tap: true,
          touchZoom: true,
          scrollWheelZoom: true,
          doubleClickZoom: true,
          boxZoom: true,
        },
      });
      const { map } = session;
      mapSessionRef.current = session;

      // Create a density-aware cluster group. The shared runtime falls back to
      // a plain layer if the optional clustering plugin cannot initialize.
      markersLayerRef.current = createPokerMarkerLayer({
        L,
        map,
        clusteringAvailable: runtime.clusteringAvailable,
        iconCreateFunction: (cluster) => createPokerClusterIcon(L, cluster, { variant: 'compact' }),
        disableClusteringAtZoom: 9,
      }).layer;

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

      function updateCoverage() {
        const bounds = map.getBounds();
        viewportBoundsRef.current = pokerMapBoundsFromLeaflet(bounds);
        const inFrame = activeVenuesRef.current.filter((venue) => {
          if (!isVenueMapEligible(venue)) return false;
          const lat = Number(venue?.latitude);
          const lng = Number(venue?.longitude);
          return Number.isFinite(lat) && Number.isFinite(lng) && bounds.contains([lat, lng]);
        }).length;
        setViewportCount(inFrame);
        setZoomLevel(map.getZoom());
      }
      map.on('moveend', updateCoverage);
      map.on('zoomend', updateCoverage);
      map.on('dragend', () => {
        updateCoverage();
        if (enableViewportSearch) setAreaSearchAvailable(true);
      });
      updateCoverage();

      mapInstanceRef.current = map;
      setMapReady(true);

      // ═══ CLICK DELEGATION for popup buttons ═══
      popupClickHandlerRef.current = createPokerPopupClickHandler();
      const container = mapRef.current;
      if (container) container.addEventListener('click', popupClickHandlerRef.current);
    };

    loadLeaflet().catch(err => {
      console.warn('Failed to load map:', err);
      if (mountedRef.current) setMapError('The map engine could not be loaded. Venue lists remain available.');
    });

    return () => {
      mountedRef.current = false;
      viewportAbortRef.current?.abort();
      const container = mapRef.current;
      if (container && popupClickHandlerRef.current) container.removeEventListener('click', popupClickHandlerRef.current);
      mapSessionRef.current?.destroy();
      mapSessionRef.current = null;
      mapInstanceRef.current = null;
      markersLayerRef.current = null;
      leafletRef.current = null;
    };
  }, [mapLoadAttempt]); // eslint-disable-line react-hooks/exhaustive-deps

  // Phase 2: Update markers whenever venues change — now with logo pins
  // `mapReady` is a dependency because Leaflet loads via async dynamic import: without it,
  // venues already present when init finishes would never be drawn.
  useEffect(() => {
    if (!mapReady) return;
    const L = leafletRef.current;
    const map = mapInstanceRef.current;
    const layer = markersLayerRef.current;
    if (!L || !map || !layer) return;

    const validVenues = activeVenues.filter(isVenueMapEligible);

    // Parents recompute the venues array inline on every render, so identity changes alone
    // must not rebuild markers or re-fit bounds — that would yank the viewport out from
    // under a user who is panning/zooming. Compare a stable content signature instead.
    // BUG FIX: the signature used to track only id + coordinates, so a venue going live,
    // a tour stop flipping to is_running, a logo landing after enrichment or a table count
    // changing left the pin and popup stale until something moved. Every field the pins
    // and popups render is part of the signature now.
    // The GEOGRAPHY signature still gates fitBounds on its own, so refreshing pin content
    // (a room going live, a logo landing) never yanks the viewport of a user who is panning.
    const geoSignature = createPokerVenueGeographySignature(validVenues, { userLocation, radiusMiles });
    const signature = createPokerVenueContentSignature(validVenues, { userLocation, radiusMiles });
    if (signature === renderedSignatureRef.current) return;
    renderedSignatureRef.current = signature;
    const geoChanged = geoSignature !== fittedGeoSignatureRef.current;
    fittedGeoSignatureRef.current = geoSignature;

    // Clear existing markers
    layer.clearLayers();
    if (userMarkerRef.current) {
      userMarkerRef.current.remove();
      userMarkerRef.current = null;
    }

    // Build markers first, then add them in bulk so MarkerCluster can yield
    // between chunks on dense national result sets.
    const venueMarkers = [];
    validVenues.forEach(v => {
      // ═══ TOUR STOPS — distinct red pin + tour popup ═══
      const isTourStop = isPokerTourStop(v);
      const venueIcon = isTourStop
        ? createPokerTourIcon(L, v, { variant: 'compact' })
        : createPokerVenueIcon(L, v, { variant: 'compact' });
      const popupHtml = isTourStop
        ? buildPokerTourPopupHtml(v, { variant: 'compact' })
        : buildPokerVenuePopupHtml(v, { variant: 'compact' });

      // Tour pins render at exact venue coordinates — tour takes visual precedence
      const lat = v.latitude;
      const lng = v.longitude;

      const marker = L.marker([lat, lng], {
        icon: venueIcon,
        zIndexOffset: isTourStop ? 500 : 0,
        keyboard: true,
        title: v.name || 'Poker venue',
        alt: `${v.name || 'Poker venue'} map marker`,
      })
        .bindPopup(popupHtml, { className: 'pnm-popup', maxWidth: 300, closeButton: true });

      // Touch preview on mobile
      marker.on('click', function(e) {
        if ('ontouchstart' in window) {
          e.originalEvent?.preventDefault?.();
          marker.openPopup();
        }
      });

      if (!isTourStop && onVenueSelectRef.current) {
        marker.on('click', () => onVenueSelectRef.current(v));
      }

      venueMarkers.push(marker);
    });
    addPokerMapLayers(layer, venueMarkers);
    const currentBounds = map.getBounds();
    viewportBoundsRef.current = pokerMapBoundsFromLeaflet(currentBounds);
    setViewportCount(validVenues.filter((venue) => currentBounds.contains([Number(venue.latitude), Number(venue.longitude)])).length);
    setZoomLevel(map.getZoom());
    if (!telemetrySentRef.current) {
      telemetrySentRef.current = true;
      const duration = Math.max(0, Date.now() - loadStartedAtRef.current);
      setMapLoadMs(duration);
      capturePokerNearMeEvent('map_runtime_ready', {
        route: typeof window !== 'undefined' ? window.location.pathname : undefined,
        surface: 'venue_map_panel',
        result_count: validVenues.length,
        duration_ms: duration,
        clustering: clusteringAvailable ? 'available' : 'fallback',
        runtime_source: 'local',
        zoom_level: map.getZoom(),
        verified_count: integritySummary.verified,
        approximate_count: integritySummary.approximate,
        held_count: integritySummary.held,
      });
    }

    // Add user location marker
    if (userLocation) {
      const userIcon = createPokerUserLocationIcon(L);

      userMarkerRef.current = L.marker([userLocation.lat, userLocation.lng], {
        icon: userIcon,
        zIndexOffset: 1000,
        keyboard: true,
        title: 'Your location',
        alt: 'Your location map marker',
      })
        .addTo(map)
        .bindPopup('<div style="padding:8px 12px;"><b style="color:#fff;font-size:14px;">Your Location</b></div>');
    }

    // Fit bounds to show ALL venue markers — auto-expands when search widens.
    // Only when the geography actually changed (see geoSignature above).
    if (!geoChanged) return;
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
  }, [activeVenues, userLocation, radiusMiles, mapReady, clusteringAvailable, integritySummary]);

  // Dynamic radius zoom is now handled by the Phase 2 markers effect above
  // (venues prop changes when radius filter changes, triggering fitBounds)

  async function searchCurrentMapArea() {
    const bounds = viewportBoundsRef.current;
    if (!enableViewportSearch || !bounds || areaSearchBusy) return;
    viewportAbortRef.current?.abort();
    const controller = new AbortController();
    viewportAbortRef.current = controller;
    setAreaSearchBusy(true);
    setAreaSearchError('');
    try {
      const params = appendPokerMapBounds(new URLSearchParams({ limit: '1000', offset: '0' }), bounds);
      const normalizedState = String(viewportState || '').toUpperCase();
      if (/^[A-Z]{2}$/.test(normalizedState)) params.set('state', normalizedState);
      const response = await fetch(`/api/poker/venues?${params.toString()}`, {
        signal: controller.signal,
        headers: { Accept: 'application/json' },
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok || payload?.success === false || !Array.isArray(payload?.data)) {
        throw new Error(payload?.error || `Area search returned ${response.status}`);
      }

      // API venue results do not always include page-specific tour pins. Preserve
      // only priority tour stops that genuinely fall inside the selected bounds.
      const priorityPins = baseVenuesRef.current.filter((venue) =>
        ['tour_stop', 'poker_tour'].includes(venue?.venue_type) && isVenueWithinPokerMapBounds(venue, bounds));
      const seen = new Set();
      const merged = [...payload.data, ...priorityPins].filter((venue) => {
        const key = `${venue?.venue_type || 'venue'}:${venue?.id || venue?.name || ''}`;
        if (!venue || seen.has(key)) return false;
        seen.add(key);
        return true;
      });
      const mergedIntegrity = summarizeVenueIntegrity(merged);
      setViewportVenues(merged);
      setAreaSearchAvailable(false);
      capturePokerNearMeEvent('map_area_searched', {
        route: typeof window !== 'undefined' ? window.location.pathname : undefined,
        surface: 'venue_map_panel',
        result_count: merged.length,
        visible_count: merged.length,
        zoom_level: mapInstanceRef.current?.getZoom(),
        clustering: clusteringAvailable ? 'available' : 'fallback',
        source: 'viewport_api',
        verified_count: mergedIntegrity.verified,
        approximate_count: mergedIntegrity.approximate,
        held_count: mergedIntegrity.held,
      });
    } catch (error) {
      if (error?.name !== 'AbortError') setAreaSearchError('Area search unavailable · try again');
    } finally {
      if (viewportAbortRef.current === controller) {
        viewportAbortRef.current = null;
        setAreaSearchBusy(false);
      }
    }
  }

  function resetMapArea() {
    viewportAbortRef.current?.abort();
    viewportAbortRef.current = null;
    fittedGeoSignatureRef.current = null;
    setViewportVenues(null);
    setAreaSearchAvailable(false);
    setAreaSearchBusy(false);
    setAreaSearchError('');
  }

  return (
    <div style={{ position: 'relative', height: '100%' }}>
      <p id={mapInstructionsId} className="sr-only">
        Interactive poker venue map. Use arrow keys to pan, plus and minus to zoom, and Tab to move between venue markers.
      </p>
      <div
        ref={mapRef}
        className="pnm-leaflet-map"
        role="region"
        aria-label="Poker venues map"
        aria-describedby={mapInstructionsId}
        aria-busy={!mapReady}
        data-map-ready={mapReady ? 'true' : 'false'}
        data-map-marker-count={mappedVenueCount}
        data-map-visible-count={viewportCount}
        data-map-zoom={Math.round(zoomLevel)}
        data-map-load-ms={mapLoadMs == null ? '' : mapLoadMs}
        data-map-clustering={clusteringAvailable ? 'available' : 'fallback'}
        data-map-style-source="local"
        data-map-foundation="shared-v2"
        data-map-integrity-held={integritySummary.held}
        tabIndex={0}
        style={{
          width: '100%', height: '100%', minHeight: 300, borderRadius: 12, overflow: 'hidden',
          border: '1px solid rgba(255,255,255,0.15)',
          background: '#060810',
        }}
      />
      {!mapReady && !mapError && (
        <div style={{
          position: 'absolute', inset: 0, display: 'flex', alignItems: 'center',
          justifyContent: 'center', color: 'rgba(255,255,255,0.6)',
          fontSize: 14, borderRadius: 12, fontFamily: 'Inter, -apple-system, sans-serif',
          fontWeight: 600, letterSpacing: '1px',
        }}>
          LOADING MAP...
        </div>
      )}
      {mapError && (
        <div role="alert" style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 12, padding: 24, textAlign: 'center', color: '#e2e8f0', background: '#060810', border: '1px solid rgba(239,68,68,0.35)', borderRadius: 12 }}>
          <strong>Map unavailable</strong>
          <span style={{ color: 'rgba(226,232,240,0.7)', fontSize: 13 }}>{mapError}</span>
          <button type="button" onClick={() => { resetPokerMapRuntime(); setMapReady(false); setMapLoadAttempt(value => value + 1); }} style={{ minWidth: 120, minHeight: 44, padding: '10px 18px', color: '#fff', background: 'rgba(255,255,255,0.1)', border: '1px solid rgba(255,255,255,0.3)', borderRadius: 8, cursor: 'pointer' }}>Try map again</button>
        </div>
      )}
      <MapCoverageReadout
        total={mappedVenueCount}
        visible={viewportCount}
        zoom={zoomLevel}
        ready={mapReady}
        clustering={clusteringAvailable && mappedVenueCount >= 20}
        gps={!!userLocation}
        busy={areaSearchBusy}
        error={areaSearchError}
        areaSearchAvailable={enableViewportSearch && mapReady && (!viewportVenues || areaSearchAvailable)}
        areaScoped={!!viewportVenues}
        onSearchArea={searchCurrentMapArea}
        onReset={resetMapArea}
        verified={integritySummary.verified}
        approximate={integritySummary.approximate}
        held={integritySummary.held}
      />
    </div>
  );
}
