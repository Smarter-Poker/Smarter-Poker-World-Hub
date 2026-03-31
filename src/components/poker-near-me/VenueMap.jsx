/**
 * Venue Map — Leaflet-based interactive map with marker clustering
 * Extracted from poker-near-me.js for bundle splitting
 * 
 * Dependencies:
 * - Leaflet (loaded dynamically via script injection — no Node dep)
 * - leaflet.markercluster (loaded dynamically)
 * - Dark tile layer from CartoDB
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
  if (score >= 4.5) return { label: 'High', color: '#22c55e' };
  if (score >= 4.0) return { label: 'Good', color: '#3b82f6' };
  if (score >= 3.0) return { label: 'Moderate', color: '#f59e0b' };
  return { label: 'Low', color: '#ef4444' };
}

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

// ─── Main Map Component ───
export default function VenueMap({ venues, userLocation, fullHeight = false }) {
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

  // Initialize map once Leaflet is ready
  useEffect(() => {
    if (!mapReady || !mapContainerRef.current) return;
    if (mapInstanceRef.current) return;

    const L = window.L;
    // Continental US bounds — SW corner to NE corner
    const usBounds = L.latLngBounds(
      L.latLng(24.396308, -125.0), // Southwest (southern tip of FL / western CA)
      L.latLng(49.384358, -66.93457) // Northeast (northern ME / WA border)
    );

    const map = L.map(mapContainerRef.current, {
      zoomControl: true,
      attributionControl: true,
      maxBounds: usBounds.pad(0.25), // Allow slight pan beyond border
      maxBoundsViscosity: 0.85,
      minZoom: 4,
    });

    // Fit to US bounds smoothly
    map.fitBounds(usBounds, { padding: [20, 20], maxZoom: 6 });

    L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OSM</a> &copy; <a href="https://carto.com/">CARTO</a>',
      subdomains: 'abcd',
      maxZoom: 19,
    }).addTo(map);

    mapInstanceRef.current = map;

    const goldIcon = L.divIcon({
      className: 'venue-map-marker',
      html: '<div style="width:14px;height:14px;border-radius:50%;background:#d4a853;border:2px solid #fff;box-shadow:0 0 8px rgba(212,168,83,0.6);"></div>',
      iconSize: [18, 18],
      iconAnchor: [9, 9],
      popupAnchor: [0, -12],
    });

    const clusterGroup = L.markerClusterGroup({
      maxClusterRadius: 50,
      iconCreateFunction: function (cluster) {
        const count = cluster.getChildCount();
        let size = 36;
        if (count > 50) size = 48;
        else if (count > 20) size = 42;
        return L.divIcon({
          html: '<div style="width:' + size + 'px;height:' + size + 'px;border-radius:50%;background:rgba(212,168,83,0.85);border:2px solid #fff;display:flex;align-items:center;justify-content:center;font-size:13px;font-weight:700;color:#000;box-shadow:0 2px 10px rgba(0,0,0,0.4);">' + count + '</div>',
          className: 'venue-cluster-icon',
          iconSize: [size, size],
        });
      },
    });

    const validVenues = (venues || []).filter(function (v) { return v.latitude && v.longitude; });

    validVenues.forEach(function (venue) {
      const trust = getTrustLevel(venue.trust_score);
      const typeBadge = VENUE_TYPE_LABELS[venue.venue_type] || venue.venue_type || '';

      const detailPath = venue.is_social_page
        ? '/club/' + venue.social_page_id
        : '/hub/venues/' + venue.id;

      const popupHtml = '<div style="font-family:Inter,-apple-system,sans-serif;min-width:200px;max-width:280px;background:#0f172a;padding:12px;border-radius:10px;">' +
        '<div style="font-size:15px;font-weight:700;color:#fff;margin-bottom:4px;">' + (venue.name || '') + '</div>' +
        '<div style="display:flex;align-items:center;gap:6px;margin-bottom:6px;">' +
        '<span style="padding:2px 8px;border-radius:4px;background:rgba(99,102,241,0.2);color:#818cf8;font-size:11px;font-weight:600;">' + typeBadge + '</span>' +
        '<span style="font-size:12px;color:rgba(255,255,255,0.5);">' + (venue.city || '') + ', ' + (venue.state || '') + '</span>' +
        '</div>' +
        '<div style="font-size:12px;color:' + trust.color + ';font-weight:600;margin-bottom:8px;">Trust: ' + trust.label + ' (' + (venue.trust_score || '-') + '/5)</div>' +
        '<div style="display:flex;gap:6px;flex-wrap:wrap;">' +
        '<a href="' + detailPath + '" style="padding:6px 12px;border-radius:6px;background:#d4a853;color:#000;text-decoration:none;font-size:12px;font-weight:600;">View Details</a>' +
        '<a href="' + detailPath + '?action=checkin" style="padding:6px 12px;border-radius:6px;background:rgba(37,99,235,0.8);color:#fff;text-decoration:none;font-size:12px;font-weight:600;">Check In</a>' +
        '<a href="' + detailPath + '?action=review" style="padding:6px 12px;border-radius:6px;background:rgba(255,255,255,0.1);color:#fff;text-decoration:none;font-size:12px;font-weight:600;border:1px solid rgba(255,255,255,0.2);">Review</a>' +
        '</div>' +
        '</div>';

      const marker = L.marker([venue.latitude, venue.longitude], { icon: goldIcon })
        .bindPopup(popupHtml, { maxWidth: 300, className: 'venue-popup' });

      const radius = getGeofenceRadius(venue.venue_type);
      const circle = L.circle([venue.latitude, venue.longitude], {
        radius: radius,
        color: '#d4a853',
        weight: 1,
        opacity: 0.35,
        fillColor: '#d4a853',
        fillOpacity: 0.08,
      });

      marker._venueCircle = circle;
      marker._venueData = venue;
      clusterGroup.addLayer(marker);
    });

    map.addLayer(clusterGroup);

    const circlesGroup = L.layerGroup();
    circlesGroup.addTo(map);

    function updateCircles() {
      circlesGroup.clearLayers();
      const zoom = map.getZoom();
      if (zoom >= 11) {
        clusterGroup.eachLayer(function (marker) {
          if (marker._venueCircle) {
            circlesGroup.addLayer(marker._venueCircle);
          }
        });
      }
    }

    map.on('zoomend', updateCircles);
    updateCircles();

    if (userLocation) {
      map.setView([userLocation.lat, userLocation.lng], 12);
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
        html: '<div style="position:relative;width:18px;height:18px;">' +
          '<div style="position:absolute;inset:0;border-radius:50%;background:rgba(59,130,246,0.3);animation:userPulse 2s ease-in-out infinite;"></div>' +
          '<div style="position:absolute;top:4px;left:4px;width:10px;height:10px;border-radius:50%;background:#3b82f6;border:2px solid #fff;box-shadow:0 0 6px rgba(59,130,246,0.8);"></div>' +
          '</div>',
        iconSize: [18, 18],
        iconAnchor: [9, 9],
      });

      userMarkerRef.current = L.marker([userLocation.lat, userLocation.lng], { icon: userIcon, zIndexOffset: 1000 })
        .addTo(map)
        .bindPopup('<b style="color:#1a1a2e;">Your Location</b>');

      map.setView([userLocation.lat, userLocation.lng], Math.max(map.getZoom(), 12));
    }
  }, [userLocation, mapReady]);

  return (
    <div style={{ position: 'relative', width: '100%', height: fullHeight ? '100%' : 'auto' }}>
      {!mapReady && (
        <div style={{
          width: '100%',
          ...(fullHeight ? { height: '100%', minHeight: 400 } : { aspectRatio: '16 / 9', maxHeight: '50vh' }),
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          flexDirection: 'column', gap: 12,
          color: 'rgba(255,255,255,0.5)',
        }}>
          <div style={{
            width: 40, height: 40, border: '3px solid rgba(255,255,255,0.1)',
            borderTopColor: '#d4a853', borderRadius: '50%',
            animation: 'spin 1s linear infinite',
          }} />
          <span>Loading Map...</span>
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
          border: fullHeight ? 'none' : '1px solid rgba(255,255,255,0.1)',
          display: mapReady ? 'block' : 'none',
        }}
      />
    </div>
  );
}
