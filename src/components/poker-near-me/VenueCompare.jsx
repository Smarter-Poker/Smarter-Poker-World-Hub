/**
 * VenueCompare.jsx — Side-by-side venue comparison panel
 * Allows users to compare 2-3 venues across key metrics.
 */
import React, { useState, useMemo, useEffect } from 'react';
import ResponsiveTable from '../ui/ResponsiveTable';
import { haversineMiles } from './pnm-utils';
import {
  buildLiveCashGameIndex,
  cashGameCountLabel,
  findLiveCashGameEntry,
  isModeledCashGameData,
} from '../../lib/poker-near-me/liveCashGameData';

const COMPARE_FIELDS = [
  { key: 'name', label: 'Venue' },
  { key: 'city_state', label: 'Location' },
  { key: 'distance', label: 'Distance' },
  { key: 'live_games', label: 'Cash Game Tables' },
  { key: 'waiting_list', label: 'Waitlist' },
  { key: 'trust_score', label: 'Trust Score' },
  { key: 'tables_count', label: 'Total Tables' },
  { key: 'venue_type', label: 'Type' },
  { key: 'games_offered', label: 'Games' },
  { key: 'hours', label: 'Hours' },
  { key: 'phone', label: 'Phone' },
];

// Provenance of a published cash-game count, in cashGameCountLabel's order.
// Only an observed live count prints in the green live ink.
function cashGameMode(live) {
  if (!live) return 'none';
  if (live.data_mode === 'catalog') return 'catalog';
  if (live.live_count_known === false) return 'unavailable';
  if (isModeledCashGameData(live)) return 'estimated';
  if (live.data_mode === 'mixed') return 'mixed';
  if (live.data_mode === 'live') return 'live';
  return 'reported';
}

function getFieldValue(venue, field, userLocation, liveDataMap = {}, liveLoading = false) {
  const findLive = (v) => findLiveCashGameEntry(v, liveDataMap);

  switch (field) {
    case 'name': return venue.name || 'Unknown';
    case 'city_state': return `${venue.city || ''}${venue.state ? `, ${venue.state}` : ''}`;
    case 'distance':
      if (!userLocation || !venue.latitude || !venue.longitude) return '-';
      const d = haversineMiles(userLocation.lat, userLocation.lng, parseFloat(venue.latitude), parseFloat(venue.longitude));
      return d < 1 ? `${(d * 5280).toFixed(0)} ft` : `${d.toFixed(1)} mi`;
    case 'live_games': {
      const live = findLive(venue);
      // UX FIX: while the live-tables fetch is in flight this used to render the same
      // em-dash as "this venue has no live data".
      if (liveLoading) return <span className="pnm-venue-compare__muted">Loading...</span>;
      if (!live || !Array.isArray(live.games) || live.games.length === 0) return <span className="pnm-venue-compare__muted">-</span>;
      return <span className="pnm-venue-compare__provenance" data-mode={cashGameMode(live)}>{cashGameCountLabel(live)}</span>;
    }
    case 'waiting_list': {
      const live = findLive(venue);
      if (liveLoading) return <span className="pnm-venue-compare__muted">Loading...</span>;
      if (!live || !Array.isArray(live.games) || live.games.length === 0) return <span className="pnm-venue-compare__muted">-</span>;
      if (live.live_count_known === false || live.data_mode === 'catalog') {
        return <span className="pnm-venue-compare__muted">Unknown</span>;
      }
      const wait = Number(live.players_waiting) || 0;
      const suffix = isModeledCashGameData(live) ? ' Estimated' : ' Waiting';
      return wait > 0
        ? <span className="pnm-venue-compare__provenance" data-mode={isModeledCashGameData(live) ? 'estimated' : 'reported'}>{wait}{suffix}</span>
        : <span className="pnm-venue-compare__muted">0</span>;
    }
    // BUG FIX: trust_score is recalculate_venue_trust_score()'s AVG(rating) on the
    // 1-5 review scale (LiveGamesFeed/VenueCard both render it as "/5"). Rendering
    // it as "/100" made a top venue read "4.8/100".
    case 'trust_score': return venue.trust_score ? `${Number(venue.trust_score).toFixed(1)}/5` : '-';
    // SCHEMA FIX: neither `tables_count` nor `total_tables` exists on poker_venues — the
    // column is `poker_tables` — so the "Total Tables" row was always an em-dash.
    case 'tables_count': return venue.poker_tables ?? venue.tables_count ?? venue.total_tables ?? '-';
    case 'venue_type': return (venue.venue_type || 'casino').replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
    case 'games_offered':
      return (venue.games_offered || []).join(', ') || '-';
    // BUG FIX: hours_of_operation is not a column any migration or the venues API
    // select defines — the row was always '—'. The real fields are hours_weekday /
    // hours_weekend (see pages/api/poker/venues.js select list).
    case 'hours': {
      const weekday = venue.hours_weekday || venue.hours || venue.hours_of_operation;
      const weekend = venue.hours_weekend;
      if (!weekday && !weekend) return '-';
      if (weekday && weekend && weekday !== weekend) return `Wkdy ${weekday} / Wknd ${weekend}`;
      return weekday || weekend;
    }
    case 'phone': return venue.phone || '-';
    default: return '-';
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
          setLiveData(buildLiveCashGameIndex(data));
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

  const atLimit = selectedIds.length >= 3;

  return (
    <div className="pnm-venue-compare">
      {/* STUB FIX: `onClose` was destructured from props and then never used anywhere —
          there was no close control and no Escape handler, so a caller that passed it had
          no way for the user to dismiss the panel. Rendered only when a caller supplies
          it (the current lobby call site does not). */}
      {onClose && (
        <div className="pnm-venue-compare__bar">
          <button
            type="button"
            className="pnm-venue-compare__text-action"
            onClick={onClose}
            aria-label="Close Comparison"
          >
            Close
          </button>
        </div>
      )}

      {/* Selection area */}
      {(selectedVenues.length < 2 || showPicker) && (
        <div className="pnm-venue-compare__picker">
          <p className="pnm-venue-compare__hint">
            {selectedVenues.length >= 2
              ? 'Pick A Third Venue To Compare'
              : `Select ${selectedVenues.length === 0 ? '2-3' : `${2 - selectedVenues.length} More`} Venues To Compare`}
          </p>
          {/* The field prints into the painted search well at its own ratio. */}
          <label className="pnm-venue-compare__search">
            <span className="pnm-venue-compare__sr">Search Venues</span>
            <input
              type="text"
              placeholder="Search Venues..."
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
            />
          </label>
          <div className="pnm-venue-compare__list" role="group" aria-label="Venues">
            {filteredVenues.map(v => {
              const isSelected = selectedIds.includes(String(v.id));
              const blocked = atLimit && !isSelected;
              return (
                <button
                  key={v.id}
                  onClick={() => toggleVenue(v.id)}
                  type="button"
                  className="pnm-venue-compare__option"
                  aria-pressed={isSelected}
                  aria-disabled={blocked || undefined}
                  data-selected={isSelected ? 'true' : 'false'}
                >
                  <span className="pnm-venue-compare__option-name">{v.name}</span>
                  <span className="pnm-venue-compare__option-meta">
                    {isSelected ? 'Selected' : `${v.city || ''}${v.state ? `, ${v.state}` : ''}`}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Selected venues, printed as rows with their own remove control */}
      {selectedVenues.length > 0 && (
        <div className="pnm-venue-compare__selected">
          {selectedVenues.map(v => (
            <div key={v.id} className="pnm-venue-compare__selected-row">
              <span className="pnm-venue-compare__selected-name">{v.name}</span>
              <button
                type="button"
                className="pnm-venue-compare__text-action pnm-venue-compare__text-action--remove"
                aria-label={`Remove ${v.name}`}
                onClick={() => toggleVenue(v.id)}
              >
                Remove
              </button>
            </div>
          ))}
          {selectedVenues.length < 3 && (
            <button type="button" className="pnm-venue-compare__text-action" onClick={() => setShowPicker(v => !v)}>
              {showPicker && selectedVenues.length >= 2 ? 'Done' : 'Add Venue'}
            </button>
          )}
        </div>
      )}

      {/* Comparison table.
          Mobile phase 3: a ResponsiveTable (a real table above 768px, one
          labelled card per metric at or below it) replaces the sideways
          `overflowX: auto` table, which was "slide to see" on every phone.
          Printed straight onto the host panel's glass: no second frame. */}
      {selectedVenues.length >= 2 && (
        <div className="pnm-venue-compare__table">
          <ResponsiveTable
            caption="Venue Comparison"
            keyField="key"
            columns={[
              { key: 'label', label: 'Metric', align: 'left' },
              ...selectedVenues.map((v) => ({
                key: `venue-${v.id}`,
                label: v.name,
                align: 'center',
                render: (row) => getFieldValue(v, row.key, userLocation, liveData, liveLoading),
              })),
            ]}
            rows={COMPARE_FIELDS.slice(1).map((field) => ({ key: field.key, label: field.label }))}
          />
        </div>
      )}

      {/* Empty state */}
      {selectedVenues.length === 0 && filteredVenues.length === 0 && (
        <div className="pnm-venue-compare__empty" role="status">
          <p className="pnm-venue-compare__empty-title">No Venues Found</p>
          <p className="pnm-venue-compare__empty-copy">Try A Different Search Term.</p>
        </div>
      )}
    </div>
  );
}
