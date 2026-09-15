/**
 * PeakActivityHeatmap — Shows busiest hours per venue
 * Uses venue_live_history to build a 7-day × 24-hour heatmap
 */
import React, { useState, useEffect, useMemo } from 'react';
import { eventBus, EventType } from '../../engine/EventBus';
import { PokerNearMeConsoleIcon, PokerNearMePanelShell } from './PokerNearMeConsole';

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
        .then(r => {
          if (!r.ok) throw new Error(`HTTP ${r.status}`);
          return r;
        })
        .then(r => r.json())
        .then(d => { if (mounted) { setData(d); setError(null); setLoading(false); } })
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
    if (!data?.heatmap?.length) return [];
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
      <PokerNearMePanelShell
        as="section"
        className="peak-activity-heatmap pnm-console-tool"
        bodyClassName="pnm-console-tool__body"
        aria-label="Verified activity patterns"
        aria-busy="true"
      >
        <div className="pah-state" role="status">
          <PokerNearMeConsoleIcon name="globe" className="pnm-console-tool__state-icon" />
          <span>Loading Activity Data...</span>
        </div>
      </PokerNearMePanelShell>
    );
  }

  if (error || !data?.heatmap?.length) {
    return (
      <PokerNearMePanelShell
        as="section"
        className="peak-activity-heatmap pnm-console-tool"
        bodyClassName="pnm-console-tool__body"
        aria-labelledby="pnm-peak-activity-title"
      >
        <div className="pah-header">
          <PokerNearMeConsoleIcon name="globe" className="pnm-console-tool__header-icon" />
          <h3 id="pnm-peak-activity-title">Verified Activity Patterns</h3>
        </div>
        <div className="pah-state" role="status">
          {data?.message || 'Not enough data yet. Heatmap populates within 24-48 hours.'}
        </div>
      </PokerNearMePanelShell>
    );
  }

  return (
    <PokerNearMePanelShell
      as="section"
      className="peak-activity-heatmap pnm-console-tool"
      bodyClassName="pnm-console-tool__body"
      aria-labelledby="pnm-peak-activity-title"
    >
      <div className="pah-header">
        <PokerNearMeConsoleIcon name="globe" className="pnm-console-tool__header-icon" />
        <div className="pah-heading">
          <h3 id="pnm-peak-activity-title">Verified Activity Patterns</h3>
          <div className="pah-observed-days">
            Positive Observed Tables Across {data.observed_days || 0} Days
          </div>
        </div>
        {data.best_time && data.data_mode === 'observed_history' && (
          <div className="pah-best-time">
            Historical Peak: {data.best_time}
          </div>
        )}
      </div>

      <div
        role="grid"
        aria-label="Busiest hours by day"
        data-allow-small-target="true"
        className="pah-grid"
      >
        <div aria-hidden="true" />
        <div className="pah-hour-axis" aria-hidden="true">
          {HOUR_LABELS.filter((_, i) => i % 3 === 0).map((label, i) => (
            <div key={i} className="pah-hour-label">{label}</div>
          ))}
        </div>

        {heatmapGrid.map((row, dayIndex) => (
          <React.Fragment key={dayIndex}>
            <div role="rowheader" className="pah-day-label">
              {DAY_LABELS[dayIndex]}
            </div>
            <div role="row" className="pah-grid-row">
              {row.map((cell, hourIndex) => (
                <div
                  key={hourIndex}
                  role="gridcell"
                  tabIndex={0}
                  aria-selected={hoveredCell === cell ? 'true' : 'false'}
                  aria-label={DAY_LABELS[cell.day] + ' at ' + HOUR_LABELS[cell.hour] + ': average ' + cell.avg_tables + ' tables'}
                  title={DAY_LABELS[cell.day] + ' at ' + HOUR_LABELS[cell.hour] + ' - Avg: ' + cell.avg_tables + ' tables'}
                  onClick={() => setHoveredCell(cell)}
                  onFocus={() => setHoveredCell(cell)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' || event.key === ' ') {
                      event.preventDefault();
                      setHoveredCell(cell);
                    }
                  }}
                  className={'pah-cell' + (hoveredCell === cell ? ' is-selected' : '')}
                  style={{ backgroundColor: intensityColor(cell.intensity) }}
                />
              ))}
            </div>
          </React.Fragment>
        ))}
      </div>

      {hoveredCell && (
        <div className="pah-readout" role="status">
          {DAY_LABELS[hoveredCell.day]} At {HOUR_LABELS[hoveredCell.hour]} - Avg: {hoveredCell.avg_tables} Tables
        </div>
      )}

      <div className="pah-legend" aria-label="Activity intensity from less to more">
        <span>Less</span>
        {[0, 20, 40, 60, 80].map((intensity) => (
          <span
            key={intensity}
            className="pah-legend-mark"
            style={{ backgroundColor: intensityColor(intensity + 10) }}
            aria-hidden="true"
          />
        ))}
        <span>More</span>
      </div>
    </PokerNearMePanelShell>
  );
}
