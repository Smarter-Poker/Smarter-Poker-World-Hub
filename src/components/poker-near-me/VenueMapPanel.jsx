import React, { useState, useEffect, useRef } from 'react';

export default function VenueMapPanel({ venues = [], userLocation, onVenueSelect }) {
  const mapRef = useRef(null);
  const mapInstanceRef = useRef(null);
  const mountedRef = useRef(true);
  const [mapReady, setMapReady] = useState(false);

  useEffect(() => {
    mountedRef.current = true;

    if (mapInstanceRef.current) return; // Already initialized
    if (!mapRef.current) return;

    // Dynamically load Leaflet CSS + JS
    const loadLeaflet = async () => {
      // Add CSS if not already loaded
      if (!document.querySelector('link[href*="leaflet"]')) {
        const link = document.createElement('link');
        link.rel = 'stylesheet';
        link.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
        document.head.appendChild(link);
      }

      // Import Leaflet
      const L = (await import('leaflet')).default;

      // Guard: component may have unmounted during async import
      if (!mountedRef.current || !mapRef.current) return;

      const center = userLocation
        ? [userLocation.lat, userLocation.lng]
        : [36.1699, -115.1398]; // Default: Las Vegas

      const map = L.map(mapRef.current, {
        center,
        zoom: userLocation ? 10 : 5,
        zoomControl: true,
        attributionControl: false,
      });

      // Dark tile layer
      L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
        maxZoom: 19,
      }).addTo(map);

      mapInstanceRef.current = map;

      // Add venue markers — popup only (no auto-navigate on click)
      const validVenues = venues.filter(v => v.latitude && v.longitude);
      validVenues.forEach(v => {
        const safeName = (v.name || '').replace(/'/g, '&#39;').replace(/"/g, '&quot;');
        const marker = L.circleMarker([v.latitude, v.longitude], {
          radius: 7,
          fillColor: v.is_featured ? '#ffd700' : '#6ee7ef',
          fillOpacity: 0.85,
          color: 'rgba(110,231,239,0.4)',
          weight: 1,
        }).addTo(map);

        marker.bindPopup(
          `<div style="font-family:sans-serif;font-size:13px;min-width:160px;">
            <strong>${safeName}</strong><br/>
            <span style="color:#666;">${v.city || ''}, ${v.state || ''}</span>
            ${Array.isArray(v.games_offered) && v.games_offered.length ? `<br/><span style="color:#3b82f6;">${v.games_offered.slice(0, 3).join(', ')}</span>` : ''}
            <br/><a href="/hub/venues/${v.id}" style="color:#6ee7ef;font-size:12px;text-decoration:underline;margin-top:4px;display:inline-block;">View Details</a>
          </div>`,
          { className: 'pnm-popup' }
        );
      });

      // Add user location marker
      if (userLocation) {
        L.circleMarker([userLocation.lat, userLocation.lng], {
          radius: 10, fillColor: '#22c55e', fillOpacity: 0.9,
          color: '#fff', weight: 2,
        }).addTo(map).bindPopup('You are here');
      }

      // Fit bounds to show all markers
      if (validVenues.length > 1) {
        const bounds = L.latLngBounds(validVenues.map(v => [v.latitude, v.longitude]));
        if (userLocation) bounds.extend([userLocation.lat, userLocation.lng]);
        map.fitBounds(bounds, { padding: [30, 30], maxZoom: 12 });
      }

      setMapReady(true);
    };

    loadLeaflet().catch(err => console.error('Failed to load map:', err));

    return () => {
      mountedRef.current = false;
      if (mapInstanceRef.current) {
        mapInstanceRef.current.remove();
        mapInstanceRef.current = null;
      }
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

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
