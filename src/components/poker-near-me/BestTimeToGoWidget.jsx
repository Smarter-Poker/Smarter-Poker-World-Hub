/**
 * BestTimeToGoWidget — Compact intelligence widget for venue detail pages
 * Shows peak hours, quiet hours, game-specific predictions, and a mini heatmap.
 */
import { useState, useEffect, useMemo } from 'react';

const DAY_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function intensityColor(intensity) {
  if (intensity === 0) return 'rgba(255,255,255,0.03)';
  if (intensity < 20) return 'rgba(0, 212, 255, 0.12)';
  if (intensity < 40) return 'rgba(0, 212, 255, 0.25)';
  if (intensity < 60) return 'rgba(0, 212, 255, 0.45)';
  if (intensity < 80) return 'rgba(34, 197, 94, 0.55)';
  return 'rgba(34, 197, 94, 0.8)';
}

export default function BestTimeToGoWidget({ venueId, venueName }) {
  const [predictions, setPredictions] = useState(null);
  const [heatmapData, setHeatmapData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [showHeatmap, setShowHeatmap] = useState(false);
  const [selectedGame, setSelectedGame] = useState(null);

  useEffect(() => {
    if (!venueId) return;
    setLoading(true);

    Promise.all([
      fetch(`/api/poker/game-predictions?venue_id=${venueId}`).then(r => r.json()).catch(() => null),
      fetch(`/api/poker/peak-activity?venue=${encodeURIComponent(venueName || '')}`).then(r => r.json()).catch(() => null),
    ]).then(([predData, heatData]) => {
      if (predData?.success) setPredictions(predData);
      if (heatData?.heatmap) setHeatmapData(heatData);
      setLoading(false);
    });
  }, [venueId, venueName]);

  const heatmapGrid = useMemo(() => {
    if (!heatmapData?.heatmap) return [];
    const grid = [];
    for (let d = 0; d < 7; d++) {
      const row = [];
      for (let h = 0; h < 24; h++) {
        const cell = heatmapData.heatmap.find(c => c.day === d && c.hour === h);
        row.push(cell || { day: d, hour: h, avg_tables: 0, intensity: 0 });
      }
      grid.push(row);
    }
    return grid;
  }, [heatmapData]);

  const hasPredictions = predictions?.predictions?.length > 0;
  const hasHeatmap = heatmapGrid.length > 0;

  if (loading) {
    return (
      <div className="bttg-widget">
        <div className="bttg-loading">
          <div className="bttg-spinner" />
          <span>Analyzing activity patterns...</span>
        </div>
        <style jsx>{STYLES}</style>
      </div>
    );
  }

  if (!hasPredictions && !hasHeatmap) {
    return null; // No data — don't render widget at all
  }

  const activePrediction = selectedGame
    ? predictions?.predictions?.find(p => p.game_type === selectedGame)
    : predictions?.predictions?.[0];

  return (
    <div className="bttg-widget">
      {/* Header */}
      <div className="bttg-header">
        <div className="bttg-title-row">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#00D4FF" strokeWidth="2">
            <circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" />
          </svg>
          <h3>Best Time to Go</h3>
        </div>
        {predictions?.summary?.data_quality && (
          <span className={`bttg-quality bttg-quality-${predictions.summary.data_quality.toLowerCase()}`}>
            {predictions.summary.data_quality} Data
          </span>
        )}
      </div>

      {/* Summary badges */}
      {predictions?.summary && (
        <div className="bttg-summary">
          {predictions.summary.best_time && (
            <div className="bttg-badge bttg-badge-peak">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#4ade80" strokeWidth="2">
                <path d="M23 6l-9.5 9.5-5-5L1 18" /><polyline points="17 6 23 6 23 12" />
              </svg>
              <div>
                <span className="bttg-badge-label">Peak Time</span>
                <span className="bttg-badge-value">{predictions.summary.best_time}</span>
              </div>
            </div>
          )}
          {activePrediction?.quiet_hour && (
            <div className="bttg-badge bttg-badge-quiet">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#60a5fa" strokeWidth="2">
                <path d="M21 12.79A9 9 0 1111.21 3 7 7 0 0021 12.79z" />
              </svg>
              <div>
                <span className="bttg-badge-label">Quiet Hour</span>
                <span className="bttg-badge-value">{activePrediction.quiet_hour.label}</span>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Game-specific predictions */}
      {hasPredictions && predictions.predictions.length > 1 && (
        <div className="bttg-game-tabs">
          {predictions.predictions.slice(0, 5).map(p => (
            <button
              key={p.game_type}
              className={`bttg-game-tab ${selectedGame === p.game_type || (!selectedGame && p === predictions.predictions[0]) ? 'active' : ''}`}
              onClick={() => setSelectedGame(p.game_type)}
            >
              {p.game_type}
            </button>
          ))}
        </div>
      )}

      {/* Active prediction detail */}
      {activePrediction && (
        <div className="bttg-prediction">
          <p className="bttg-prediction-text">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#d4a853" strokeWidth="2" style={{ flexShrink: 0, marginTop: 2 }}>
              <circle cx="12" cy="12" r="10" /><line x1="12" y1="16" x2="12" y2="12" /><line x1="12" y1="8" x2="12.01" y2="8" />
            </svg>
            {activePrediction.prediction}
          </p>
          <div className="bttg-pred-meta">
            {activePrediction.typical_open_range && (
              <span className="bttg-pred-tag">Active: {activePrediction.typical_open_range}</span>
            )}
            {activePrediction.peak_days?.length > 0 && (
              <span className="bttg-pred-tag">Peak: {activePrediction.peak_days.join(', ')}</span>
            )}
            <span className="bttg-pred-tag bttg-pred-confidence">
              {activePrediction.confidence}% confidence
            </span>
          </div>
        </div>
      )}

      {/* Mini heatmap toggle */}
      {hasHeatmap && (
        <>
          <button className="bttg-heatmap-toggle" onClick={() => setShowHeatmap(!showHeatmap)}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
              <line x1="3" y1="9" x2="21" y2="9" /><line x1="3" y1="15" x2="21" y2="15" />
              <line x1="9" y1="3" x2="9" y2="21" /><line x1="15" y1="3" x2="15" y2="21" />
            </svg>
            {showHeatmap ? 'Hide' : 'Show'} Activity Heatmap
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"
              style={{ transform: showHeatmap ? 'rotate(180deg)' : 'rotate(0deg)', transition: 'transform 0.2s' }}>
              <polyline points="6 9 12 15 18 9" />
            </svg>
          </button>

          {showHeatmap && (
            <div className="bttg-heatmap">
              {heatmapGrid.map((row, dayIndex) => (
                <div key={dayIndex} className="bttg-hm-row">
                  <span className="bttg-hm-day">{DAY_SHORT[dayIndex]}</span>
                  <div className="bttg-hm-cells">
                    {row.map((cell, hourIndex) => (
                      <div
                        key={hourIndex}
                        className="bttg-hm-cell"
                        style={{ background: intensityColor(cell.intensity) }}
                        title={`${DAY_SHORT[dayIndex]} ${hourIndex}:00 — ${cell.avg_tables} avg tables`}
                      />
                    ))}
                  </div>
                </div>
              ))}
              <div className="bttg-hm-legend">
                <span>Less</span>
                {[0, 20, 40, 60, 80].map(i => (
                  <div key={i} className="bttg-hm-legend-box" style={{ background: intensityColor(i + 10) }} />
                ))}
                <span>More</span>
              </div>
            </div>
          )}
        </>
      )}

      <style jsx>{STYLES}</style>
    </div>
  );
}

const STYLES = `
  .bttg-widget {
    background: linear-gradient(135deg, rgba(15,23,42,0.95), rgba(30,41,59,0.9));
    border: 1px solid rgba(0,212,255,0.15);
    border-radius: 16px;
    padding: 20px;
    margin: 16px 0;
  }
  .bttg-loading {
    display: flex; flex-direction: column; align-items: center; gap: 10px; padding: 20px;
  }
  .bttg-spinner {
    width: 24px; height: 24px; border: 3px solid rgba(255,255,255,0.1);
    border-top-color: #00D4FF; border-radius: 50%;
    animation: bttg-spin 0.8s linear infinite;
  }
  .bttg-loading span { color: rgba(255,255,255,0.4); font-size: 13px; }
  @keyframes bttg-spin { to { transform: rotate(360deg); } }

  .bttg-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px; }
  .bttg-title-row { display: flex; align-items: center; gap: 8px; }
  .bttg-title-row h3 { margin: 0; font-size: 16px; font-weight: 700; color: #fff; }
  .bttg-quality {
    font-size: 11px; font-weight: 600; padding: 4px 10px; border-radius: 6px;
    text-transform: uppercase; letter-spacing: 0.3px;
  }
  .bttg-quality-excellent { background: rgba(34,197,94,0.15); color: #4ade80; border: 1px solid rgba(34,197,94,0.3); }
  .bttg-quality-good { background: rgba(59,130,246,0.15); color: #60a5fa; border: 1px solid rgba(59,130,246,0.3); }
  .bttg-quality-limited { background: rgba(245,158,11,0.15); color: #fbbf24; border: 1px solid rgba(245,158,11,0.3); }

  .bttg-summary { display: flex; gap: 12px; margin-bottom: 16px; flex-wrap: wrap; }
  .bttg-badge {
    display: flex; align-items: center; gap: 10px; flex: 1; min-width: 140px;
    padding: 12px; border-radius: 12px; border: 1px solid rgba(255,255,255,0.08);
    background: rgba(255,255,255,0.03);
  }
  .bttg-badge-label { display: block; font-size: 10px; color: rgba(255,255,255,0.4); text-transform: uppercase; letter-spacing: 0.5px; }
  .bttg-badge-value { display: block; font-size: 14px; font-weight: 700; color: #fff; margin-top: 2px; }

  .bttg-game-tabs { display: flex; gap: 6px; margin-bottom: 12px; overflow-x: auto; padding-bottom: 4px; }
  .bttg-game-tab {
    padding: 6px 14px; border-radius: 8px; font-size: 12px; font-weight: 600;
    background: rgba(255,255,255,0.06); border: 1px solid rgba(255,255,255,0.1);
    color: rgba(255,255,255,0.6); cursor: pointer; white-space: nowrap;
    transition: all 0.2s;
  }
  .bttg-game-tab.active {
    background: rgba(0,212,255,0.12); border-color: rgba(0,212,255,0.3); color: #00D4FF;
  }

  .bttg-prediction {
    background: rgba(0,0,0,0.2); border: 1px solid rgba(255,255,255,0.06);
    border-radius: 12px; padding: 14px; margin-bottom: 12px;
  }
  .bttg-prediction-text {
    display: flex; gap: 8px; margin: 0 0 10px;
    font-size: 14px; color: rgba(255,255,255,0.8); line-height: 1.5;
  }
  .bttg-pred-meta { display: flex; gap: 6px; flex-wrap: wrap; }
  .bttg-pred-tag {
    padding: 4px 10px; border-radius: 6px; font-size: 11px; font-weight: 500;
    background: rgba(255,255,255,0.06); color: rgba(255,255,255,0.5);
    border: 1px solid rgba(255,255,255,0.08);
  }
  .bttg-pred-confidence { background: rgba(212,168,83,0.1); border-color: rgba(212,168,83,0.25); color: #d4a853; }

  .bttg-heatmap-toggle {
    display: flex; align-items: center; gap: 8px; width: 100%;
    padding: 10px 14px; border-radius: 10px; font-size: 13px; font-weight: 500;
    background: rgba(255,255,255,0.04); border: 1px solid rgba(255,255,255,0.08);
    color: rgba(255,255,255,0.6); cursor: pointer; transition: all 0.2s;
  }
  .bttg-heatmap-toggle:hover { background: rgba(255,255,255,0.08); }

  .bttg-heatmap { margin-top: 12px; overflow-x: auto; }
  .bttg-hm-row { display: flex; align-items: center; margin-bottom: 2px; }
  .bttg-hm-day { width: 32px; font-size: 10px; color: rgba(255,255,255,0.4); text-align: right; padding-right: 4px; flex-shrink: 0; }
  .bttg-hm-cells { display: flex; flex: 1; gap: 1px; }
  .bttg-hm-cell { flex: 1; height: 16px; border-radius: 2px; cursor: pointer; transition: transform 0.15s; min-width: 8px; }
  .bttg-hm-cell:hover { transform: scale(1.4); z-index: 10; position: relative; }

  .bttg-hm-legend {
    display: flex; align-items: center; gap: 4px; justify-content: center; margin-top: 8px;
    font-size: 10px; color: rgba(255,255,255,0.4);
  }
  .bttg-hm-legend-box { width: 14px; height: 14px; border-radius: 2px; }
`;
