import React, { useState, useEffect, useRef } from 'react';

/**
 * VenueMapPanel — Leaflet map rendering for Poker Near Me venues.
 * 
 * CRITICAL FIX (March 2026): The map now properly re-renders markers when
 * the venues prop changes. Previously, the empty deps array `[]` caused
 * the map to only render markers from the INITIAL render — meaning Live Games
 * mode always showed "0 venues on map" since live data arrives asynchronously.
 */
export default function VenueMapPanel({ venues = [], userLocation, onVenueSelect }) {
  const mapRef = useRef(null);
  const mapInstanceRef = useRef(null);
  const markersLayerRef = useRef(null);
  const userMarkerRef = useRef(null);
  const mountedRef = useRef(true);
  const leafletRef = useRef(null);
  const [mapReady, setMapReady] = useState(false);

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

      L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
        maxZoom: 19,
      }).addTo(map);

      // Create a layer group for venue markers (allows clearing on re-render)
      markersLayerRef.current = L.layerGroup().addTo(map);

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

  // Phase 2: Update markers whenever venues change
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

    // Add venue markers
    const validVenues = venues.filter(v => v.latitude && v.longitude);
    validVenues.forEach(v => {
      const safeName = (v.name || '').replace(/'/g, '&#39;').replace(/"/g, '&quot;');
      const tables = v.totalTables || 0;
      const markerColor = tables >= 20 ? '#ef4444' : tables >= 8 ? '#f59e0b' : tables >= 3 ? '#3fb950' : '#6ee7ef';
      const markerRadius = Math.min(5 + Math.sqrt(tables) * 1.5, 14);

      const marker = L.circleMarker([v.latitude, v.longitude], {
        radius: markerRadius,
        fillColor: markerColor,
        fillOpacity: 0.85,
        color: 'rgba(255,255,255,0.3)',
        weight: 1,
      }).addTo(layer);

      const gamesHtml = Array.isArray(v.games) && v.games.length
        ? `<br/><span style="color:#3fb950;font-size:11px;">${tables} tables · ${v.games.length} games</span>`
        : '';

      marker.bindPopup(
        `<div style="font-family:sans-serif;font-size:13px;min-width:160px;">
            <strong>${safeName}</strong><br/>
            <span style="color:#666;">${v.city || ''}, ${v.state || ''}</span>
            ${gamesHtml}
            <br/><a href="/hub/venues/${v.id}" style="color:#6ee7ef;font-size:12px;text-decoration:underline;margin-top:4px;display:inline-block;">View Details</a>
          </div>`,
        { className: 'pnm-popup' }
      );
    });

    // Add user location marker
    if (userLocation) {
      userMarkerRef.current = L.circleMarker([userLocation.lat, userLocation.lng], {
        radius: 10, fillColor: '#22c55e', fillOpacity: 0.9,
        color: '#fff', weight: 2,
      }).addTo(map).bindPopup('You are here');
    }

    // Fit bounds to show all markers
    if (validVenues.length > 0) {
      const bounds = L.latLngBounds(validVenues.map(v => [v.latitude, v.longitude]));
      if (userLocation) bounds.extend([userLocation.lat, userLocation.lng]);
      map.fitBounds(bounds, { padding: [30, 30], maxZoom: 12 });
    }
  }, [venues, userLocation]);

  return (
    <div style={{ position: 'relative' }}>
      <div
        ref={mapRef}
        style={{
          width: '100%', height: 400, borderRadius: 12, overflow: 'hidden',
          border: '1px solid rgba(110,231,239,0.15)',
          background: '#0a1628',
        }}
      />
      {!mapReady && (
        <div style={{
          position: 'absolute', inset: 0, display: 'flex', alignItems: 'center',
          justifyContent: 'center', color: 'rgba(200,214,229,0.5)',
          fontSize: 14, borderRadius: 12,
        }}>
          Loading map...
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
