/**
 * PeakActivityHeatmap — Shows busiest hours per venue
 * Uses venue_live_history to build a 7-day × 24-hour heatmap
 */
import React, { useState, useEffect, useMemo } from 'react';
import { eventBus, EventType } from '../../engine/EventBus';

const DAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const HOUR_LABELS = ['12a','1a','2a','3a','4a','5a','6a','7a','8a','9a','10a','11a',
                     '12p','1p','2p','3p','4p','5p','6p','7p','8p','9p','10p','11p'];

function intensityColor(intensity) {
  if (intensity === 0) return 'rgba(255,255,255,0.03)';
  if (intensity < 20) return 'rgba(0, 212, 255, 0.12)';
  if (intensity < 40) return 'rgba(0, 212, 255, 0.25)';
  if (intensity < 60) return 'rgba(0, 212, 255, 0.45)';
  if (intensity < 80) return 'rgba(34, 197, 94, 0.55)';
  return 'rgba(34, 197, 94, 0.8)';
}

export default function PeakActivityHeatmap({ venueFilter, gameType }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [hoveredCell, setHoveredCell] = useState(null);

  useEffect(() => {
    let mounted = true;
    const controller = new AbortController();

    const fetchHeatmap = () => {
      setLoading(true);
      let url = '/api/poker/peak-activity';
      const params = [];
      if (venueFilter) params.push(`venue=${encodeURIComponent(venueFilter)}`);
      if (gameType) params.push(`game_type=${encodeURIComponent(gameType)}`);
      if (params.length) url += '?' + params.join('&');
      
      fetch(url, { signal: controller.signal })
        .then(r => r.json())
        .then(d => { if (mounted) { setData(d); setLoading(false); } })
        .catch(e => { if (mounted && e.name !== 'AbortError') { setError(e.message); setLoading(false); } });
    };

    fetchHeatmap();

    // Listen for live data mutations via global bus
    const unsub = eventBus.on(EventType.DATA_MUTATED, (e) => {
      if (e?.payload?.entity === 'live_tables') {
        fetchHeatmap();
      }
    });

    return () => {
      mounted = false;
      controller.abort();
      if (typeof unsub === 'function') unsub();
    };
  }, [venueFilter, gameType]);

  const heatmapGrid = useMemo(() => {
    if (!data?.heatmap) return [];
    // Build 7×24 grid
    const grid = [];
    for (let d = 0; d < 7; d++) {
      const row = [];
      for (let h = 0; h < 24; h++) {
        const cell = data.heatmap.find(c => c.day === d && c.hour === h);
        row.push(cell || { day: d, hour: h, avg_tables: 0, intensity: 0 });
      }
      grid.push(row);
    }
    return grid;
  }, [data]);

  if (loading) {
    return (
      <div style={{
        background: 'linear-gradient(135deg, #0d1117 0%, #1a2332 100%)',
        borderRadius: 16, padding: 24, border: '2px solid #3d4f5f',
        position: 'relative', overflow: 'hidden',
        boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.05), inset 0 -1px 0 rgba(0,0,0,0.5), 0 8px 32px rgba(0,0,0,0.6)',
      }}>
        <div style={{ color: '#64748b', textAlign: 'center', padding: 40, fontFamily: 'Rajdhani, Inter, sans-serif', textTransform: 'uppercase', letterSpacing: '0.1em' }}>
          Loading Activity Data...
        </div>
      </div>
    );
  }

  if (error || !data?.heatmap?.length) {
    return (
      <div style={{
        background: 'linear-gradient(135deg, #0d1117 0%, #1a2332 100%)',
        borderRadius: 16, padding: 24, border: '2px solid #3d4f5f',
        position: 'relative', overflow: 'hidden',
        boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.05), inset 0 -1px 0 rgba(0,0,0,0.5), 0 8px 32px rgba(0,0,0,0.6)',
        fontFamily: 'Inter, system-ui, sans-serif',
      }}>
        <h3 style={{ color: '#fff', marginBottom: 8, fontSize: 16, fontFamily: 'Rajdhani, Rajdhani, sans-serif', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Peak Activity Heatmap</h3>
        <div style={{ color: '#64748b', textAlign: 'center', padding: 24 }}>
          {data?.message || 'Not enough data yet. Heatmap populates within 24-48 hours.'}
        </div>
      </div>
    );
  }

  return (
    <div style={{
      background: 'linear-gradient(135deg, #0d1117 0%, #1a2332 100%)',
      borderRadius: 16, padding: 20, border: '2px solid #3d4f5f',
      position: 'relative', overflow: 'hidden',
      boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.05), inset 0 -1px 0 rgba(0,0,0,0.5), 0 8px 32px rgba(0,0,0,0.6)',
      fontFamily: 'Inter, system-ui, sans-serif',
    }}>
      {/* Decorative metal corner bolts */}
      <div style={{ position: 'absolute', top: 8, left: 8, width: 8, height: 8, borderRadius: '50%', background: 'radial-gradient(circle, #5a6a7a 30%, #3a4a5a 70%)', border: '1px solid #1a2a3a', boxShadow: 'inset 0 1px 2px rgba(255,255,255,0.2)' }} />
      <div style={{ position: 'absolute', top: 8, right: 8, width: 8, height: 8, borderRadius: '50%', background: 'radial-gradient(circle, #5a6a7a 30%, #3a4a5a 70%)', border: '1px solid #1a2a3a', boxShadow: 'inset 0 1px 2px rgba(255,255,255,0.2)' }} />
      <div style={{ position: 'absolute', bottom: 8, left: 8, width: 8, height: 8, borderRadius: '50%', background: 'radial-gradient(circle, #5a6a7a 30%, #3a4a5a 70%)', border: '1px solid #1a2a3a', boxShadow: 'inset 0 1px 2px rgba(255,255,255,0.2)' }} />
      <div style={{ position: 'absolute', bottom: 8, right: 8, width: 8, height: 8, borderRadius: '50%', background: 'radial-gradient(circle, #5a6a7a 30%, #3a4a5a 70%)', border: '1px solid #1a2a3a', boxShadow: 'inset 0 1px 2px rgba(255,255,255,0.2)' }} />
      
      {/* Neon line accent */}
      <div style={{ position: 'absolute', top: 0, left: '20%', right: '20%', height: 2, background: 'linear-gradient(90deg, transparent, rgba(0,212,255,0.8), transparent)', boxShadow: '0 2px 10px rgba(0,212,255,0.4)' }} />

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <h3 style={{ color: '#fff', margin: 0, fontSize: 16, fontFamily: 'Rajdhani, Rajdhani, sans-serif', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Peak Activity Heatmap</h3>
        {data.best_time && (
          <div style={{
            background: 'rgba(34,197,94,0.15)', border: '1px solid rgba(34,197,94,0.3)',
            borderRadius: 8, padding: '6px 12px', fontSize: 12, color: '#4ade80',
          }}>
            Best Time: {data.best_time}
          </div>
        )}
      </div>

      {/* Heatmap Grid.
          Mobile phase 3: this used to be a 600px-wide block inside an
          `overflowX: auto` scroller, so on a phone five of the seven days and
          most of the hours were only reachable sideways ("slide to see"). It is
          now a 24-column grid that fits the container at every width. The
          grid is ONE control (a heat map) with 168 read-only cells, so the
          cells are gridcells rather than buttons and the grid carries
          data-allow-small-target, the same sanction the Preflop 13x13 matrix
          records in e2e/mobile-budget.spec.ts. Labels stay at 12px; the hour
          axis shows every third hour so it never overlaps. */}
      <div
        role="grid"
        aria-label="Busiest hours by day"
        data-allow-small-target="true"
        style={{ display: 'grid', gridTemplateColumns: '36px minmax(0, 1fr)', rowGap: 2, columnGap: 4 }}
      >
        {/* Hour labels */}
        <div aria-hidden="true" />
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(8, minmax(0, 1fr))', marginBottom: 2 }}>
          {HOUR_LABELS.filter((_, i) => i % 3 === 0).map((label, i) => (
            <div key={i} style={{ color: '#94a3b8', fontSize: 12, textAlign: 'left', whiteSpace: 'nowrap' }}>{label}</div>
          ))}
        </div>

        {/* Grid rows */}
        {heatmapGrid.map((row, dayIndex) => (
          <React.Fragment key={dayIndex}>
            <div role="rowheader" style={{ color: '#94a3b8', fontSize: 12, textAlign: 'right', paddingRight: 2, alignSelf: 'center' }}>
              {DAY_LABELS[dayIndex]}
            </div>
            <div role="row" style={{ display: 'grid', gridTemplateColumns: 'repeat(24, minmax(0, 1fr))', gap: 1 }}>
              {/* UX/A11Y FIX: each cell used to be a plain <div> with only
                  onMouseEnter/onMouseLeave, so on touch devices (no hover) the
                  "Sun at 7p, Avg: N tables" readout never appeared. Tap, focus and
                  keyboard all set the readout below the grid now. */}
              {row.map((cell, hourIndex) => (
                <div
                  key={hourIndex}
                  role="gridcell"
                  tabIndex={0}
                  aria-selected={hoveredCell === cell ? 'true' : 'false'}
                  aria-label={`${DAY_LABELS[cell.day]} at ${HOUR_LABELS[cell.hour]}: average ${cell.avg_tables} tables`}
                  title={`${DAY_LABELS[cell.day]} at ${HOUR_LABELS[cell.hour]} - Avg: ${cell.avg_tables} tables`}
                  onClick={() => setHoveredCell(cell)}
                  onFocus={() => setHoveredCell(cell)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      setHoveredCell(cell);
                    }
                  }}
                  style={{
                    height: 20, minWidth: 0, borderRadius: 2,
                    background: intensityColor(cell.intensity),
                    outline: hoveredCell === cell ? '2px solid #6ee7ef' : 'none',
                    outlineOffset: -1,
                    cursor: 'pointer',
                  }}
                />
              ))}
            </div>
          </React.Fragment>
        ))}
      </div>

      {/* Tooltip */}
      {hoveredCell && (
        <div style={{
          marginTop: 8, padding: '8px 12px',
          background: 'rgba(0,0,0,0.6)', borderRadius: 8,
          color: '#fff', fontSize: 13, textAlign: 'center',
          border: '1px solid rgba(0,212,255,0.2)',
        }}>
          {DAY_LABELS[hoveredCell.day]} At {HOUR_LABELS[hoveredCell.hour]} - Avg: {hoveredCell.avg_tables} Tables
        </div>
      )}

      {/* Legend */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 12, justifyContent: 'center' }}>
        <span style={{ color: '#94a3b8', fontSize: 12 }}>Less</span>
        {[0, 20, 40, 60, 80].map(i => (
          <div key={i} style={{
            width: 16, height: 16, borderRadius: 3,
            background: intensityColor(i + 10),
          }} />
        ))}
        <span style={{ color: '#94a3b8', fontSize: 12 }}>More</span>
      </div>
    </div>
  );
}
