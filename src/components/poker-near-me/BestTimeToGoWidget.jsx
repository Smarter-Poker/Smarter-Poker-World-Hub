/**
 * NOT CURRENTLY MOUNTED. A repo-wide grep finds no import of this component, so it —
 * and the two endpoints only it calls (/api/poker/game-predictions and
 * /api/poker/venue-predictions-batch) — are unreachable from the UI. It is kept intact
 * (rather than deleted) because reviving it means editing the venue detail page,
 * pages/hub/poker-near-me/[pnmTab].js, which is outside this change's file ownership.
 * The live all-zero-heatmap bug below is fixed either way.
 *
 * BestTimeToGoWidget — Intelligence widget for venue detail pages
 * v2.0 — Enhanced with:
 *   - Quiet Hours natural language analysis
 *   - Game-specific ETA predictions (e.g., "Usually opens Omaha Fri 6 PM")
 *   - Mini 7-day activity bar chart
 *   - Semantic confidence bar
 */
import { useState, useEffect, useMemo } from 'react';
import { eventBus, EventType } from '../../engine/EventBus';

const DAY_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function intensityColor(intensity) {
  if (intensity === 0) return 'rgba(255,255,255,0.03)';
  if (intensity < 20) return 'rgba(0, 212, 255, 0.12)';
  if (intensity < 40) return 'rgba(0, 212, 255, 0.25)';
  if (intensity < 60) return 'rgba(0, 212, 255, 0.45)';
  if (intensity < 80) return 'rgba(34, 197, 94, 0.55)';
  return 'rgba(34, 197, 94, 0.8)';
}

function confidenceColor(conf) {
  if (conf >= 80) return '#4ade80';
  if (conf >= 50) return '#00D4FF';
  if (conf >= 30) return '#fbbf24';
  return '#f87171';
}

export default function BestTimeToGoWidget({ venueId, venueName }) {
  const [predictions, setPredictions] = useState(null);
  const [heatmapData, setHeatmapData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [showHeatmap, setShowHeatmap] = useState(false);
  const [selectedGame, setSelectedGame] = useState(null);

  useEffect(() => {
    if (!venueId) return;
    let mounted = true;

    const fetchAllData = () => {
      setLoading(true);
      const gameTypePart = selectedGame ? `&game_type=${encodeURIComponent(selectedGame)}` : '';

      Promise.all([
        fetch(`/api/poker/game-predictions?venue_id=${venueId}`).then(r => r.json()).catch(() => null),
        fetch(`/api/poker/peak-activity?venue=${encodeURIComponent(venueName || '')}${gameTypePart}`).then(r => r.json()).catch(() => null),
        fetch(`/api/poker/venue-predictions-batch?venue_ids=${venueId}`).then(r => r.json()).catch(() => null),
      ]).then(([predData, heatData, batchData]) => {
        if (!mounted) return;
        if (predData?.success) setPredictions(predData);
        if (heatData?.heatmap?.length) setHeatmapData(heatData);
        // Merge batch data into predictions for quiet hours / game ETA
        if (batchData?.success && batchData.predictions?.[venueId]) {
          setPredictions(prev => ({
            ...(prev || {}),
            batchInsights: batchData.predictions[venueId],
          }));
        }
        setLoading(false);
      });
    };

    fetchAllData();

    // Listen for live data mutations via global bus
    const unsub = eventBus.on(EventType.DATA_MUTATED, (e) => {
      if (e?.payload?.entity === 'live_tables') {
        fetchAllData();
      }
    });

    return () => {
      mounted = false;
      if (typeof unsub === 'function') unsub();
    };
  }, [venueId, venueName, selectedGame]);

  const heatmapGrid = useMemo(() => {
    // BUG FIX: `!heatmapData?.heatmap` passes for `heatmap: []` (an empty array is
    // truthy), so the loops below still built a full 7x24 grid of zero-intensity cells,
    // `hasHeatmap` became true, and the widget presented a completely dead heatmap as
    // though the venue genuinely had zero activity every hour of the week.
    // PeakActivityHeatmap.jsx gets this right with `!data?.heatmap?.length`.
    if (!heatmapData?.heatmap?.length) return [];
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

  const batchInsights = predictions?.batchInsights;
  const hasPredictions = predictions?.predictions?.length > 0;
  const hasHeatmap = heatmapGrid.length > 0;
  const hasBatchData = batchInsights?.has_data;

  if (loading) {
    return (
      <div className="bttg-widget">
        <div className="bttg-loading">
          <div className="bttg-spinner" />
          <span>Analyzing Activity Patterns...</span>
        </div>
        <style>{STYLES}</style>
      </div>
    );
  }

  if (!hasPredictions && !hasHeatmap && !hasBatchData) {
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
        {(predictions?.summary?.data_quality || batchInsights?.data_quality) && (
          <span className={`bttg-quality bttg-quality-${(batchInsights?.data_quality || predictions?.summary?.data_quality || '').toLowerCase()}`}>
            {batchInsights?.data_quality || predictions?.summary?.data_quality} Data
          </span>
        )}
      </div>

      {/* Summary badges */}
      <div className="bttg-summary">
        {(predictions?.summary?.best_time || batchInsights?.best_time) && (
          <div className="bttg-badge bttg-badge-peak">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#4ade80" strokeWidth="2">
              <path d="M23 6l-9.5 9.5-5-5L1 18" /><polyline points="17 6 23 6 23 12" />
            </svg>
            <div>
              <span className="bttg-badge-label">Peak Time</span>
              <span className="bttg-badge-value">{batchInsights?.best_time || predictions?.summary?.best_time}</span>
            </div>
          </div>
        )}
        {(activePrediction?.quiet_hour || batchInsights?.quiet_hours) && (
          <div className="bttg-badge bttg-badge-quiet">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#60a5fa" strokeWidth="2">
              <path d="M21 12.79A9 9 0 1111.21 3 7 7 0 0021 12.79z" />
            </svg>
            <div>
              <span className="bttg-badge-label">Quiet Hours</span>
              <span className="bttg-badge-value">{batchInsights?.quiet_hours || activePrediction?.quiet_hour?.label}</span>
            </div>
          </div>
        )}
      </div>

      {/* === Mini 7-Day Activity Bar Chart === */}
      {batchInsights?.day_scores && batchInsights.day_scores.some(s => s > 0) && (
        <div className="bttg-day-chart">
          <span className="bttg-day-chart-title">Weekly Activity</span>
          <div className="bttg-day-bars">
            {batchInsights.day_scores.map((score, idx) => (
              <div key={idx} className="bttg-day-bar-col">
                <div className="bttg-day-bar-track">
                  <div
                    className="bttg-day-bar-fill"
                    style={{
                      height: `${Math.max(score, 4)}%`,
                      background: score >= 70
                        ? 'linear-gradient(180deg, #4ade80, #22c55e)'
                        : score >= 40
                          ? 'linear-gradient(180deg, #00D4FF, #0891b2)'
                          : 'linear-gradient(180deg, rgba(255,255,255,0.25), rgba(255,255,255,0.12))',
                      boxShadow: score >= 70 ? '0 0 6px rgba(34,197,94,0.4)' : 'none',
                    }}
                  />
                </div>
                <span className="bttg-day-bar-label">{DAY_SHORT[idx]}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* === Game-Specific ETA Predictions === */}
      {batchInsights?.game_eta?.length > 0 && (
        <div className="bttg-game-eta-section">
          <span className="bttg-game-eta-title">Game-Specific Predictions</span>
          {batchInsights.game_eta.map((eta, idx) => (
            <div key={idx} className="bttg-game-eta-row">
              <span className="bttg-game-eta-chip">{eta.game}</span>
              <span className="bttg-game-eta-label">{eta.label}</span>
              <div className="bttg-confidence-bar-wrap">
                <div className="bttg-confidence-bar-track">
                  <div
                    className="bttg-confidence-bar-fill"
                    style={{
                      width: `${eta.confidence}%`,
                      background: confidenceColor(eta.confidence),
                    }}
                  />
                </div>
                <span className="bttg-confidence-pct" style={{ color: confidenceColor(eta.confidence) }}>
                  {eta.confidence}%
                </span>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Game-specific prediction tabs */}
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
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#ffffff" strokeWidth="2" style={{ flexShrink: 0, marginTop: 2 }}>
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
              {activePrediction.confidence}% Confidence
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

      <style>{STYLES}</style>
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

  /* === Mini Day Bar Chart === */
  .bttg-day-chart {
    margin-bottom: 16px; padding: 14px; border-radius: 12px;
    background: rgba(0,0,0,0.2); border: 1px solid rgba(255,255,255,0.06);
  }
  .bttg-day-chart-title {
    display: block; font-size: 10px; color: rgba(255,255,255,0.4);
    text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 10px; font-weight: 600;
  }
  .bttg-day-bars {
    display: flex; gap: 6px; align-items: flex-end; height: 60px;
  }
  .bttg-day-bar-col {
    flex: 1; display: flex; flex-direction: column; align-items: center; gap: 4px;
  }
  .bttg-day-bar-track {
    width: 100%; height: 48px; border-radius: 4px;
    background: rgba(255,255,255,0.04); display: flex; align-items: flex-end;
    overflow: hidden; position: relative;
  }
  .bttg-day-bar-fill {
    width: 100%; border-radius: 4px 4px 0 0; transition: height 0.6s ease-out;
    min-height: 2px;
  }
  .bttg-day-bar-label {
    font-size: 10px; color: rgba(255,255,255,0.4); font-weight: 500;
  }

  /* === Game-Specific ETA === */
  .bttg-game-eta-section {
    margin-bottom: 16px; padding: 14px; border-radius: 12px;
    background: rgba(0,0,0,0.2); border: 1px solid rgba(255,255,255,0.06);
  }
  .bttg-game-eta-title {
    display: block; font-size: 10px; color: rgba(255,255,255,0.4);
    text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 10px; font-weight: 600;
  }
  .bttg-game-eta-row {
    display: flex; align-items: center; gap: 8px; margin-bottom: 8px;
    padding: 8px 10px; border-radius: 8px; background: rgba(255,255,255,0.03);
    border: 1px solid rgba(255,255,255,0.05);
  }
  .bttg-game-eta-row:last-child { margin-bottom: 0; }
  .bttg-game-eta-chip {
    padding: 3px 8px; border-radius: 5px; font-size: 11px; font-weight: 700;
    background: rgba(139,92,246,0.15); color: #a78bfa; border: 1px solid rgba(139,92,246,0.25);
    white-space: nowrap; flex-shrink: 0;
  }
  .bttg-game-eta-label {
    font-size: 13px; color: rgba(255,255,255,0.7); flex: 1; min-width: 0;
  }
  .bttg-confidence-bar-wrap {
    display: flex; align-items: center; gap: 6px; flex-shrink: 0;
  }
  .bttg-confidence-bar-track {
    width: 40px; height: 4px; border-radius: 2px; background: rgba(255,255,255,0.08);
    overflow: hidden;
  }
  .bttg-confidence-bar-fill {
    height: 100%; border-radius: 2px; transition: width 0.5s ease;
  }
  .bttg-confidence-pct {
    font-size: 11px; font-weight: 700; min-width: 30px; text-align: right;
  }

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
  .bttg-pred-confidence { background: rgba(255,255,255,0.1); border-color: rgba(255,255,255,0.25); color: #ffffff; }

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
