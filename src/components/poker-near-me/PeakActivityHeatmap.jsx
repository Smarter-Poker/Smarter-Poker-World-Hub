/**
 * PeakActivityHeatmap — Shows busiest hours per venue
 * Uses venue_live_history to build a 7-day × 24-hour heatmap
 */
import { useState, useEffect, useMemo } from 'react';

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
    setLoading(true);
    let url = '/api/poker/peak-activity';
    const params = [];
    if (venueFilter) params.push(`venue=${encodeURIComponent(venueFilter)}`);
    if (gameType) params.push(`game_type=${encodeURIComponent(gameType)}`);
    if (params.length) url += '?' + params.join('&');
    
    fetch(url)
      .then(r => r.json())
      .then(d => { setData(d); setLoading(false); })
      .catch(e => { setError(e.message); setLoading(false); });
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
        background: 'linear-gradient(135deg, rgba(15,23,42,0.95), rgba(30,41,59,0.9))',
        borderRadius: 16, padding: 24, border: '1px solid rgba(0,212,255,0.15)',
      }}>
        <div style={{ color: '#64748b', textAlign: 'center', padding: 40 }}>
          Loading activity data...
        </div>
      </div>
    );
  }

  if (error || !data?.heatmap?.length) {
    return (
      <div style={{
        background: 'linear-gradient(135deg, rgba(15,23,42,0.95), rgba(30,41,59,0.9))',
        borderRadius: 16, padding: 24, border: '1px solid rgba(0,212,255,0.15)',
      }}>
        <h3 style={{ color: '#fff', marginBottom: 8, fontSize: 16 }}>Peak Activity Heatmap</h3>
        <div style={{ color: '#64748b', textAlign: 'center', padding: 24 }}>
          {data?.message || 'Not enough data yet. Heatmap populates within 24-48 hours.'}
        </div>
      </div>
    );
  }

  return (
    <div style={{
      background: 'linear-gradient(135deg, rgba(15,23,42,0.95), rgba(30,41,59,0.9))',
      borderRadius: 16, padding: 20, border: '1px solid rgba(0,212,255,0.15)',
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <h3 style={{ color: '#fff', margin: 0, fontSize: 16 }}>Peak Activity Heatmap</h3>
        {data.best_time && (
          <div style={{
            background: 'rgba(34,197,94,0.15)', border: '1px solid rgba(34,197,94,0.3)',
            borderRadius: 8, padding: '6px 12px', fontSize: 12, color: '#4ade80',
          }}>
            Best Time: {data.best_time}
          </div>
        )}
      </div>

      {/* Heatmap Grid */}
      <div style={{ overflowX: 'auto' }}>
        <div style={{ minWidth: 600 }}>
          {/* Hour labels */}
          <div style={{ display: 'flex', marginLeft: 40, marginBottom: 4 }}>
            {HOUR_LABELS.filter((_, i) => i % 3 === 0).map((label, i) => (
              <div key={i} style={{
                flex: '0 0 calc(100% / 8)', color: '#64748b', fontSize: 10, textAlign: 'center',
              }}>{label}</div>
            ))}
          </div>

          {/* Grid rows */}
          {heatmapGrid.map((row, dayIndex) => (
            <div key={dayIndex} style={{ display: 'flex', alignItems: 'center', marginBottom: 2 }}>
              <div style={{ width: 36, color: '#94a3b8', fontSize: 12, textAlign: 'right', paddingRight: 4 }}>
                {DAY_LABELS[dayIndex]}
              </div>
              <div style={{ display: 'flex', flex: 1, gap: 1 }}>
                {row.map((cell, hourIndex) => (
                  <div
                    key={hourIndex}
                    onMouseEnter={() => setHoveredCell(cell)}
                    onMouseLeave={() => setHoveredCell(null)}
                    style={{
                      flex: 1, height: 20, borderRadius: 3,
                      background: intensityColor(cell.intensity),
                      cursor: 'pointer',
                      transition: 'all 0.15s ease',
                      transform: hoveredCell === cell ? 'scale(1.3)' : 'scale(1)',
                      zIndex: hoveredCell === cell ? 10 : 1,
                      position: 'relative',
                    }}
                  />
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Tooltip */}
      {hoveredCell && (
        <div style={{
          marginTop: 8, padding: '8px 12px',
          background: 'rgba(0,0,0,0.6)', borderRadius: 8,
          color: '#fff', fontSize: 13, textAlign: 'center',
          border: '1px solid rgba(0,212,255,0.2)',
        }}>
          {DAY_LABELS[hoveredCell.day]} at {HOUR_LABELS[hoveredCell.hour]} — Avg: {hoveredCell.avg_tables} tables
        </div>
      )}

      {/* Legend */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 12, justifyContent: 'center' }}>
        <span style={{ color: '#64748b', fontSize: 11 }}>Less</span>
        {[0, 20, 40, 60, 80].map(i => (
          <div key={i} style={{
            width: 16, height: 16, borderRadius: 3,
            background: intensityColor(i + 10),
          }} />
        ))}
        <span style={{ color: '#64748b', fontSize: 11 }}>More</span>
      </div>
    </div>
  );
}
