/**
 * ScraperHealthDashboard — Admin panel for monitoring Bravo + PokerAtlas scrapers
 * 
 * Consumes /api/poker/scraper-health to display:
 *   - Per-source health status (healthy/stale/dead)
 *   - Last scrape timestamps and staleness
 *   - Record counts, venue counts, table/waiting totals
 *   - Visual status indicators with auto-refresh
 * 
 * Designed for the Futuristic Metal UI system.
 */
import React, { useState, useEffect, useCallback } from 'react';

const AUTO_REFRESH_MS = 30000; // Auto-refresh every 30s

const STATUS_COLORS = {
  healthy: { color: '#3fb950', bg: 'rgba(63,185,80,0.08)', border: 'rgba(63,185,80,0.3)', label: 'HEALTHY' },
  stale:   { color: '#f59e0b', bg: 'rgba(245,158,11,0.08)', border: 'rgba(245,158,11,0.3)', label: 'STALE' },
  dead:    { color: '#ef4444', bg: 'rgba(239,68,68,0.08)', border: 'rgba(239,68,68,0.3)', label: 'DEAD' },
  warning: { color: '#f59e0b', bg: 'rgba(245,158,11,0.08)', border: 'rgba(245,158,11,0.3)', label: 'WARNING' },
  critical:{ color: '#ef4444', bg: 'rgba(239,68,68,0.08)', border: 'rgba(239,68,68,0.3)', label: 'CRITICAL' },
  unknown: { color: '#8b949e', bg: 'rgba(139,148,158,0.08)', border: 'rgba(139,148,158,0.3)', label: 'UNKNOWN' },
};

function StatusBadge({ status }) {
  const cfg = STATUS_COLORS[status] || STATUS_COLORS.unknown;
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 5,
      padding: '3px 10px', borderRadius: 6, fontSize: 11, fontWeight: 800,
      color: cfg.color, background: cfg.bg, border: `1px solid ${cfg.border}`,
      letterSpacing: '0.5px', textTransform: 'uppercase',
    }}>
      <span style={{
        width: 7, height: 7, borderRadius: '50%', background: cfg.color,
        boxShadow: `0 0 6px ${cfg.color}`, animation: status === 'healthy' ? 'shd-pulse 2s infinite' : undefined,
      }} />
      {cfg.label}
    </span>
  );
}

function StatCard({ label, value, color = '#e0e8f0', subtext }) {
  return (
    <div style={{
      flex: 1, minWidth: 100, padding: '12px 16px', borderRadius: 10,
      background: 'rgba(13,17,23,0.6)', border: '1px solid rgba(48,54,61,0.4)',
      textAlign: 'center',
    }}>
      <div style={{ fontSize: 22, fontWeight: 800, color, lineHeight: 1.2 }}>{value}</div>
      <div style={{ fontSize: 11, color: 'rgba(200,214,229,0.5)', fontWeight: 600, marginTop: 2, textTransform: 'uppercase', letterSpacing: '0.3px' }}>{label}</div>
      {subtext && <div style={{ fontSize: 10, color: 'rgba(200,214,229,0.35)', marginTop: 2 }}>{subtext}</div>}
    </div>
  );
}

function SourcePanel({ name, data }) {
  if (!data) return null;
  const statusCfg = STATUS_COLORS[data.status] || STATUS_COLORS.unknown;

  return (
    <div style={{
      padding: '16px 20px', borderRadius: 12,
      background: 'rgba(13,17,23,0.7)', border: `1px solid ${statusCfg.border}`,
      marginBottom: 12,
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <div>
          <div style={{ fontSize: 15, fontWeight: 800, color: '#e0e8f0', textTransform: 'uppercase', letterSpacing: '0.5px' }}>{name}</div>
          <div style={{ fontSize: 11, color: 'rgba(200,214,229,0.4)', marginTop: 2 }}>
            Last scrape: {data.last_scrape ? new Date(data.last_scrape).toLocaleTimeString() : 'Never'}
          </div>
        </div>
        <StatusBadge status={data.status} />
      </div>
      
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <StatCard label="Minutes Ago" value={data.minutes_ago ?? '—'} color={statusCfg.color} />
        <StatCard label="Venues" value={data.venues ?? 0} />
        <StatCard label="Records" value={data.records ?? 0} />
        <StatCard label="Tables" value={data.tables_running ?? 0} color="#3fb950" />
        <StatCard label="Waiting" value={data.players_waiting ?? 0} color="#d4a853" />
      </div>
      
      {data.batch_id && (
        <div style={{ fontSize: 10, color: 'rgba(200,214,229,0.25)', marginTop: 8, fontFamily: 'monospace' }}>
          Batch: {data.batch_id}
        </div>
      )}
    </div>
  );
}

export default function ScraperHealthDashboard() {
  const [health, setHealth] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [lastChecked, setLastChecked] = useState(null);
  const [autoRefresh, setAutoRefresh] = useState(true);

  const fetchHealth = useCallback(async () => {
    try {
      const res = await fetch(`/api/poker/scraper-health?_t=${Date.now()}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setHealth(data);
      setError(null);
      setLastChecked(new Date());
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchHealth();
  }, [fetchHealth]);

  useEffect(() => {
    if (!autoRefresh) return;
    const interval = setInterval(fetchHealth, AUTO_REFRESH_MS);
    return () => clearInterval(interval);
  }, [autoRefresh, fetchHealth]);

  const overallStatus = health?.status || 'unknown';
  const overallCfg = STATUS_COLORS[overallStatus] || STATUS_COLORS.unknown;

  return (
    <div style={{
      padding: '20px', maxWidth: 800, margin: '0 auto',
      fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, sans-serif",
    }}>
      <style>{`
        @keyframes shd-pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.4; } }
      `}</style>

      {/* HEADER */}
      <div style={{
        display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20,
        padding: '16px 20px', borderRadius: 12,
        background: `linear-gradient(135deg, ${overallCfg.bg}, rgba(13,17,23,0.8))`,
        border: `1px solid ${overallCfg.border}`,
      }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={overallCfg.color} strokeWidth="2">
              <path d="M22 12h-4l-3 9L9 3l-3 9H2" />
            </svg>
            <span style={{ fontSize: 18, fontWeight: 800, color: '#e0e8f0' }}>Scraper Health</span>
            <StatusBadge status={overallStatus} />
          </div>
          <div style={{ fontSize: 11, color: 'rgba(200,214,229,0.4)' }}>
            {lastChecked ? `Checked: ${lastChecked.toLocaleTimeString()}` : 'Loading...'}
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <button
            onClick={() => setAutoRefresh(!autoRefresh)}
            style={{
              padding: '5px 12px', borderRadius: 6, fontSize: 11, fontWeight: 600,
              cursor: 'pointer', fontFamily: 'inherit',
              background: autoRefresh ? 'rgba(63,185,80,0.12)' : 'rgba(139,148,158,0.08)',
              border: `1px solid ${autoRefresh ? 'rgba(63,185,80,0.3)' : 'rgba(139,148,158,0.2)'}`,
              color: autoRefresh ? '#3fb950' : '#8b949e',
            }}
          >
            {autoRefresh ? 'Auto-Refresh ON' : 'Auto-Refresh OFF'}
          </button>
          <button
            onClick={() => { setLoading(true); fetchHealth(); }}
            style={{
              padding: '5px 12px', borderRadius: 6, fontSize: 11, fontWeight: 700,
              cursor: 'pointer', fontFamily: 'inherit',
              background: 'rgba(88,166,255,0.12)', border: '1px solid rgba(88,166,255,0.3)', color: '#58a6ff',
            }}
          >
            Refresh Now
          </button>
        </div>
      </div>

      {/* ERROR */}
      {error && (
        <div style={{
          padding: '12px 16px', marginBottom: 12, borderRadius: 10,
          background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.3)',
          color: '#ef4444', fontSize: 13, fontWeight: 600,
        }}>
          Error: {error}
        </div>
      )}

      {/* LOADING */}
      {loading && !health && (
        <div style={{ textAlign: 'center', padding: 40, color: 'rgba(200,214,229,0.4)' }}>
          Loading scraper health data...
        </div>
      )}

      {/* SOURCE PANELS */}
      {health && (
        <>
          <SourcePanel name="Real-Time Engine" data={health.scrapers?.bravo} />
          <SourcePanel name="Catalog Engine" data={health.scrapers?.pokeratlas} />

          {/* ISSUES */}
          {health.issues && health.issues.length > 0 && (
            <div style={{
              padding: '14px 18px', borderRadius: 12, marginTop: 8,
              background: 'rgba(239,68,68,0.06)', border: '1px solid rgba(239,68,68,0.2)',
            }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: '#ef4444', marginBottom: 8 }}>Issues Detected</div>
              {health.issues.map((issue, i) => (
                <div key={i} style={{ fontSize: 12, color: 'rgba(239,68,68,0.8)', marginBottom: 3, paddingLeft: 12, position: 'relative' }}>
                  <span style={{ position: 'absolute', left: 0 }}>•</span>
                  {issue}
                </div>
              ))}
            </div>
          )}

          {/* THRESHOLDS INFO */}
          <div style={{
            marginTop: 16, padding: '12px 16px', borderRadius: 10,
            background: 'rgba(13,17,23,0.5)', border: '1px solid rgba(48,54,61,0.3)',
          }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: 'rgba(200,214,229,0.5)', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.5px' }}>Health Thresholds</div>
            <div style={{ display: 'flex', gap: 16, fontSize: 11, color: 'rgba(200,214,229,0.4)' }}>
              <span><span style={{ color: '#3fb950' }}>Healthy</span>: {health.thresholds?.healthy}</span>
              <span><span style={{ color: '#f59e0b' }}>Stale</span>: {health.thresholds?.stale}</span>
              <span><span style={{ color: '#ef4444' }}>Dead</span>: {health.thresholds?.dead}</span>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
