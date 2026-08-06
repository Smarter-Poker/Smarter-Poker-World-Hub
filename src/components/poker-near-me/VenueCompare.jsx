/**
 * VenueCompare.jsx — Side-by-side venue comparison panel
 * Allows users to compare 2-3 venues across key metrics.
 */
import React, { useState, useMemo, useEffect } from 'react';
import { haversineMiles } from './pnm-utils';

const COMPARE_FIELDS = [
  { key: 'name', label: 'Venue' },
  { key: 'city_state', label: 'Location' },
  { key: 'distance', label: 'Distance' },
  { key: 'live_games', label: 'Live Games' },
  { key: 'waiting_list', label: 'Waitlist' },
  { key: 'trust_score', label: 'Trust Score' },
  { key: 'tables_count', label: 'Total Tables' },
  { key: 'venue_type', label: 'Type' },
  { key: 'games_offered', label: 'Games' },
  { key: 'hours', label: 'Hours' },
  { key: 'phone', label: 'Phone' },
];

function getFieldValue(venue, field, userLocation, liveDataMap = {}, liveLoading = false) {
  // Multi-key live data lookup: bravo_slug → normalized name
  const findLive = (v) => {
    if (v.bravo_slug && liveDataMap[v.bravo_slug]) return liveDataMap[v.bravo_slug];
    if (v.slug && liveDataMap[v.slug]) return liveDataMap[v.slug];
    if (v.name) {
      const normalized = v.name.toLowerCase().replace(/[^a-z0-9]/g, '');
      if (liveDataMap['_name:' + normalized]) return liveDataMap['_name:' + normalized];
    }
    return null;
  };

  switch (field) {
    case 'name': return venue.name || 'Unknown';
    case 'city_state': return `${venue.city || ''}${venue.state ? `, ${venue.state}` : ''}`;
    case 'distance':
      if (!userLocation || !venue.latitude || !venue.longitude) return '—';
      const d = haversineMiles(userLocation.lat, userLocation.lng, parseFloat(venue.latitude), parseFloat(venue.longitude));
      return d < 1 ? `${(d * 5280).toFixed(0)} ft` : `${d.toFixed(1)} mi`;
    case 'live_games': {
      const live = findLive(venue);
      // UX FIX: while the live-tables fetch is in flight this used to render the same
      // em-dash as "this venue has no live data".
      if (liveLoading) return <span style={{ color: 'rgba(200,214,229,0.35)' }}>Loading...</span>;
      if (!live || live.length === 0) return <span style={{ color: 'rgba(200,214,229,0.3)' }}>—</span>;
      const active = live.reduce((sum, g) => sum + (parseInt(g.tables_running) || 0), 0);
      return active > 0 ? <span style={{ color: '#3fb950', fontWeight: 700 }}>{active} Running</span> : <span style={{ color: 'rgba(200,214,229,0.5)' }}>0</span>;
    }
    case 'waiting_list': {
      const live = findLive(venue);
      if (liveLoading) return <span style={{ color: 'rgba(200,214,229,0.35)' }}>Loading...</span>;
      if (!live || live.length === 0) return <span style={{ color: 'rgba(200,214,229,0.3)' }}>—</span>;
      const wait = live.reduce((sum, g) => sum + (parseInt(g.players_waiting) || 0), 0);
      return wait > 0 ? <span style={{ color: '#f59e0b', fontWeight: 700 }}>{wait} Waiting</span> : <span style={{ color: 'rgba(200,214,229,0.5)' }}>0</span>;
    }
    // BUG FIX: trust_score is recalculate_venue_trust_score()'s AVG(rating) on the
    // 1-5 review scale (LiveGamesFeed/VenueCard both render it as "/5"). Rendering
    // it as "/100" made a top venue read "4.8/100".
    case 'trust_score': return venue.trust_score ? `${Number(venue.trust_score).toFixed(1)}/5` : '—';
    // SCHEMA FIX: neither `tables_count` nor `total_tables` exists on poker_venues — the
    // column is `poker_tables` — so the "Total Tables" row was always an em-dash.
    case 'tables_count': return venue.poker_tables ?? venue.tables_count ?? venue.total_tables ?? '—';
    case 'venue_type': return (venue.venue_type || 'casino').replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
    case 'games_offered':
      return (venue.games_offered || []).join(', ') || '—';
    // BUG FIX: hours_of_operation is not a column any migration or the venues API
    // select defines — the row was always '—'. The real fields are hours_weekday /
    // hours_weekend (see pages/api/poker/venues.js select list).
    case 'hours': {
      const weekday = venue.hours_weekday || venue.hours || venue.hours_of_operation;
      const weekend = venue.hours_weekend;
      if (!weekday && !weekend) return '—';
      if (weekday && weekend && weekday !== weekend) return `Wkdy ${weekday} / Wknd ${weekend}`;
      return weekday || weekend;
    }
    case 'phone': return venue.phone || '—';
    default: return '—';
  }
}

export default function VenueCompare({ venues = [], userLocation, onClose }) {
  const [selectedIds, setSelectedIds] = useState([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [liveData, setLiveData] = useState({});
  const [liveLoading, setLiveLoading] = useState(true);
  // BUG FIX: the picker used to unmount as soon as 2 venues were selected, so the
  // advertised 2-3 venue comparison was capped at 2 and '+ Add Venue' dead-clicked
  // (its onClick was `setSelectedIds(prev => prev)` — a no-op).
  const [showPicker, setShowPicker] = useState(false);

  useEffect(() => {
    let mounted = true;
    fetch('/api/poker/live-tables')
      .then(res => res.json())
      .then(data => {
        if (!mounted) return;
        if (data.venues) {
          // Build multi-key lookup: by bravo_slug, venue_name (lowered), and normalized name
          const map = {};
          data.venues.forEach(v => {
            const games = (v.games || []).map(g => ({
              tables_running: g.tables_running || 0,
              players_waiting: g.players_waiting || 0,
              game_name: g.game || g.game_name || 'Unknown',
            }));
            // Key by bravo_slug
            if (v.bravo_slug) map[v.bravo_slug] = games;
            // findLive() also probes liveDataMap[venue.slug] (catalog venues carry a
            // `slug` column). /api/poker/live-tables publishes `bravo_slug` only, so
            // this extra key is a forward-compatible no-op today — the name key below
            // is what actually resolves a catalog venue to its live row.
            if (v.slug && !map[v.slug]) map[v.slug] = games;
            // Key by venue_name (lowered) for fuzzy match
            if (v.venue_name) {
              const normalized = v.venue_name.toLowerCase().replace(/[^a-z0-9]/g, '');
              map['_name:' + normalized] = games;
            }
          });
          setLiveData(map);
        }
        setLiveLoading(false);
      })
      .catch(err => {
        console.warn('Failed to load live data for compare:', err);
        if (mounted) setLiveLoading(false);
      });
    return () => { mounted = false; };
  }, []);

  const selectedVenues = useMemo(() =>
    selectedIds.map(id => venues.find(v => String(v.id) === String(id))).filter(Boolean),
    [selectedIds, venues]
  );

  const filteredVenues = useMemo(() => {
    if (!searchTerm) return venues.slice(0, 20);
    const lower = searchTerm.toLowerCase();
    return venues.filter(v =>
      (v.name || '').toLowerCase().includes(lower) ||
      (v.city || '').toLowerCase().includes(lower) ||
      (v.state || '').toLowerCase().includes(lower)
    ).slice(0, 20);
  }, [venues, searchTerm]);

  const toggleVenue = (id) => {
    const key = String(id);
    setSelectedIds(prev => {
      if (prev.includes(key)) return prev.filter(x => x !== key);
      if (prev.length >= 3) return prev; // Max 3
      return [...prev, key];
    });
    // Adding the 3rd venue closes the picker again. Kept outside the updater so
    // React StrictMode's double-invoked updater can't fire this twice.
    if (!selectedIds.includes(key) && selectedIds.length + 1 >= 3) setShowPicker(false);
  };

  return (
    <div>
      {/* STUB FIX: `onClose` was destructured from props and then never used anywhere —
          there was no close control and no Escape handler, so a caller that passed it had
          no way for the user to dismiss the panel. Rendered only when a caller supplies
          it (the current lobby call site does not). */}
      {onClose && (
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 8 }}>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close comparison"
            style={{
              padding: '4px 10px', borderRadius: 8, fontSize: 11, fontWeight: 600,
              border: '1.5px solid rgba(148,163,184,0.2)', background: 'transparent',
              color: 'rgba(148,163,184,0.7)', cursor: 'pointer', fontFamily: 'inherit',
            }}
          >
            Close
          </button>
        </div>
      )}

      {/* Selection area */}
      {(selectedVenues.length < 2 || showPicker) && (
        <div style={{ marginBottom: 16 }}>
          <div style={{ fontSize: 13, color: 'rgba(200,214,229,0.6)', marginBottom: 8, fontWeight: 600 }}>
            {selectedVenues.length >= 2
              ? 'Pick a third venue to compare'
              : `Select ${selectedVenues.length === 0 ? '2-3' : `${2 - selectedVenues.length} more`} venues to compare`}
          </div>
          <input
            type="text"
            placeholder="Search venues..."
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
            style={{
              width: '100%', padding: '8px 14px', borderRadius: 8,
              border: '1.5px solid rgba(148,163,184,0.15)', background: 'linear-gradient(180deg, rgba(20,30,48,0.95), rgba(12,18,30,0.98))',
              color: '#e2e8f0', fontSize: 13, fontFamily: 'inherit', outline: 'none',
              marginBottom: 8, boxSizing: 'border-box',
              boxShadow: 'inset 0 2px 6px rgba(0,0,0,0.4), inset 0 -1px 0 rgba(148,163,184,0.08)',
            }}
          />
          <div style={{ display: 'grid', gap: 6, maxHeight: 200, overflowY: 'auto' }}>
            {filteredVenues.map(v => {
              const isSelected = selectedIds.includes(String(v.id));
              return (
                <button
                  key={v.id}
                  onClick={() => toggleVenue(v.id)}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 8,
                    padding: '8px 12px', borderRadius: 8,
                    border: isSelected ? '1.5px solid rgba(255,255,255,0.5)' : '1.5px solid rgba(148,163,184,0.12)',
                    background: isSelected ? 'rgba(255,255,255,0.1)' : 'linear-gradient(160deg, rgba(18,28,45,0.7), rgba(10,16,28,0.85))',
                    color: isSelected ? '#ffffff' : '#e2e8f0',
                    fontSize: 12, fontWeight: isSelected ? 700 : 400,
                    cursor: selectedIds.length >= 3 && !isSelected ? 'not-allowed' : 'pointer',
                    fontFamily: 'inherit', textAlign: 'left', width: '100%',
                    transition: 'all 0.2s',
                    opacity: selectedIds.length >= 3 && !isSelected ? 0.4 : 1,
                  }}
                >
                  <div style={{
                    width: 18, height: 18, borderRadius: 4, flexShrink: 0,
                    border: isSelected ? '2px solid #ffffff' : '2px solid rgba(148,163,184,0.2)',
                    background: isSelected ? 'rgba(255,255,255,0.2)' : 'transparent',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                  }}>
                    {isSelected && (
                      <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#ffffff" strokeWidth="3">
                        <polyline points="20 6 9 17 4 12" />
                      </svg>
                    )}
                  </div>
                  <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {v.name}
                  </span>
                  <span style={{ fontSize: 10, color: 'rgba(200,214,229,0.35)', flexShrink: 0 }}>
                    {v.city}{v.state ? `, ${v.state}` : ''}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Selected chips */}
      {selectedVenues.length > 0 && (
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 12 }}>
          {selectedVenues.map(v => (
            <span key={v.id} style={{
              display: 'inline-flex', alignItems: 'center', gap: 6,
              padding: '4px 10px', borderRadius: 8,
              background: 'rgba(255,255,255,0.12)', border: '1px solid rgba(255,255,255,0.3)',
              color: '#ffffff', fontSize: 11, fontWeight: 600,
            }}>
              {v.name}
              <button onClick={() => toggleVenue(v.id)} style={{
                background: 'none', border: 'none', color: '#ffffff', cursor: 'pointer',
                padding: 0, fontSize: 14, lineHeight: 1, fontFamily: 'inherit',
              }}>×</button>
            </span>
          ))}
          {selectedVenues.length < 3 && (
            <button onClick={() => setShowPicker(v => !v)} style={{
              padding: '4px 10px', borderRadius: 8, fontSize: 11, fontWeight: 600,
              border: '1.5px dashed rgba(148,163,184,0.2)', background: 'transparent',
              color: 'rgba(148,163,184,0.5)', cursor: 'pointer', fontFamily: 'inherit',
            }}>{showPicker && selectedVenues.length >= 2 ? 'Done' : '+ Add Venue'}</button>
          )}
        </div>
      )}

      {/* Comparison table */}
      {selectedVenues.length >= 2 && (
        <div style={{ overflowX: 'auto', borderRadius: 12, border: '1.5px solid rgba(148,163,184,0.12)', background: 'linear-gradient(160deg, rgba(18,28,45,0.7), rgba(10,16,28,0.85))', boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.04), 0 4px 16px rgba(0,0,0,0.35)' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
            <thead>
              <tr>
                <th style={{ padding: '10px 14px', textAlign: 'left', color: 'rgba(148,163,184,0.6)', fontWeight: 600, borderBottom: '1px solid rgba(148,163,184,0.08)', fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Metric</th>
                {selectedVenues.map(v => (
                  <th key={v.id} style={{ padding: '10px 14px', textAlign: 'center', color: '#ffffff', fontWeight: 700, borderBottom: '1px solid rgba(148,163,184,0.08)', fontSize: 13, minWidth: 120 }}>
                    {v.name?.length > 18 ? v.name.slice(0, 18) + '…' : v.name}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {COMPARE_FIELDS.slice(1).map((field, i) => (
                <tr key={field.key} style={{ background: i % 2 === 0 ? 'rgba(13,17,23,0.3)' : 'transparent' }}>
                  <td style={{ padding: '8px 14px', color: 'rgba(148,163,184,0.7)', fontWeight: 600, borderBottom: '1px solid rgba(148,163,184,0.05)', whiteSpace: 'nowrap' }}>
                    {field.label}
                  </td>
                  {selectedVenues.map(v => (
                    <td key={v.id} style={{ padding: '8px 14px', textAlign: 'center', color: '#e2e8f0', borderBottom: '1px solid rgba(148,163,184,0.05)' }}>
                      {getFieldValue(v, field.key, userLocation, liveData, liveLoading)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Empty state */}
      {selectedVenues.length === 0 && filteredVenues.length === 0 && (
        <div style={{ textAlign: 'center', padding: 30, color: 'rgba(200,214,229,0.4)' }}>
          <p style={{ fontSize: 14, fontWeight: 600 }}>No venues found</p>
          <p style={{ fontSize: 12 }}>Try a different search term.</p>
        </div>
      )}
    </div>
  );
}
