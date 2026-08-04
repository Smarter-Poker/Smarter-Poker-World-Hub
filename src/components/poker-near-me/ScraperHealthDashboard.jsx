/**
 * ScraperHealthDashboard — Admin panel for monitoring Bravo + PokerAtlas scrapers
 * 
 * Consumes /api/poker/scraper-health and /api/poker/scraper-metrics to display:
 *   - Per-source health status (healthy/stale/dead)
 *   - Last scrape timestamps and staleness
 *   - Record counts, venue counts, table/waiting totals
 *   - Performance metrics with sparkline visualization
 *   - Visual status indicators with auto-refresh
 * 
 * Designed for the Futuristic Metal UI system.
 */
import React, { useState, useEffect, useCallback } from 'react';
import { supabase } from '../../lib/supabase';
import { busEmit, EventType } from '../../engine/EventBus';
import { getAuthUserId } from '../../lib/authUtils';
const AUTO_REFRESH_MS = 30000;

const STATUS_COLORS = {
  healthy: { color: '#3fb950', bg: 'rgba(63,185,80,0.08)', border: 'rgba(63,185,80,0.3)', label: 'HEALTHY' },
  stale:   { color: '#f59e0b', bg: 'rgba(245,158,11,0.08)', border: 'rgba(245,158,11,0.3)', label: 'STALE' },
  dead:    { color: '#ef4444', bg: 'rgba(239,68,68,0.08)', border: 'rgba(239,68,68,0.3)', label: 'DEAD' },
  warning: { color: '#f59e0b', bg: 'rgba(245,158,11,0.08)', border: 'rgba(245,158,11,0.3)', label: 'WARNING' },
  critical:{ color: '#ef4444', bg: 'rgba(239,68,68,0.08)', border: 'rgba(239,68,68,0.3)', label: 'CRITICAL' },
  anomaly: { color: '#b366ff', bg: 'rgba(179,102,255,0.08)', border: 'rgba(179,102,255,0.3)', label: 'ANOMALY' },
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
        boxShadow: `0 0 6px ${cfg.color}`, animation: (status === 'healthy' || status === 'anomaly') ? 'shd-pulse 2s infinite' : undefined,
      }} />
      {cfg.label}
    </span>
  );
}

function StatCard({ label, value, color = '#e0e8f0' }) {
  return (
    <div style={{
      flex: 1, minWidth: 80, padding: '10px 12px', borderRadius: 10,
      background: 'linear-gradient(160deg, rgba(18,28,45,0.7), rgba(10,16,28,0.85))',
      border: '1.5px solid rgba(148,163,184,0.12)',
      boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.04), 0 2px 8px rgba(0,0,0,0.3)',
      textAlign: 'center',
    }}>
      <div style={{ fontSize: 20, fontWeight: 800, color, lineHeight: 1.2 }}>{value}</div>
      <div style={{ fontSize: 10, color: 'rgba(148,163,184,0.6)', fontWeight: 600, marginTop: 2, textTransform: 'uppercase', letterSpacing: '0.3px' }}>{label}</div>
    </div>
  );
}

function SourcePanel({ name, data }) {
  if (!data) return null;
  const statusCfg = STATUS_COLORS[data.status] || STATUS_COLORS.unknown;
  return (
    <div style={{
      padding: '16px 20px', borderRadius: 12,
      background: 'linear-gradient(160deg, rgba(18,28,45,0.85), rgba(10,16,28,0.92))',
      border: `1.5px solid ${statusCfg.border}`,
      boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.04), 0 4px 16px rgba(0,0,0,0.35)',
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
        <StatCard label="Waiting" value={data.players_waiting ?? 0} color="#ffffff" />
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
  const [autoRefresh, setAutoRefresh] = useState(false); // Disabled by default
  const [metrics, setMetrics] = useState(null);
  const [showMetrics, setShowMetrics] = useState(false);
  const [showAlertHistory, setShowAlertHistory] = useState(false);
  // 'checking' | 'allowed' | 'denied' — this dashboard exposes internal
  // infrastructure state (batch ids, anomaly counts, raw operator alert
  // messages), so it is not rendered for non-admins.
  const [access, setAccess] = useState('checking');

  const fetchHealth = useCallback(async () => {
    try {
      const res = await fetch(`/api/poker/scraper-health?_t=${Date.now()}`);
      // The API deliberately answers 503 WITH a full health payload when the
      // overall status is critical — exactly the case this dashboard exists
      // for. Only treat a response as an error when it carries no payload.
      const data = await res.json().catch(() => null);
      const hasPayload = !!data && (data.status || data.scrapers);
      if (!hasPayload) throw new Error(`HTTP ${res.status}`);
      setHealth(data);
      setError(null);
      setLastChecked(new Date());
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchMetrics = useCallback(async () => {
    try {
      const res = await fetch('/api/poker/scraper-metrics?hours=24');
      if (!res.ok) return;
      const data = await res.json();
      setMetrics(data);
    } catch (_) { console.warn('[App] Handled exception:', _?.message || _); }
  }, []);

  // Admin gate — the pod is registered in POD_FEATURES with no role check, so
  // any anonymous visitor could open ?pod=scraperhealth. Resolve the caller's
  // profiles.is_admin flag before fetching or subscribing to anything.
  useEffect(() => {
    let mounted = true;
    (async () => {
      const uid = getAuthUserId();
      if (!uid) { if (mounted) { setAccess('denied'); setLoading(false); } return; }
      try {
        const { data, error: profErr } = await supabase
          .from('profiles')
          .select('is_admin')
          .eq('id', uid)
          .maybeSingle();
        if (!mounted) return;
        if (profErr || !data?.is_admin) { setAccess('denied'); setLoading(false); return; }
        setAccess('allowed');
      } catch (_) {
        if (mounted) { setAccess('denied'); setLoading(false); }
      }
    })();
    return () => { mounted = false; };
  }, []);

  useEffect(() => {
    if (access !== 'allowed') return;
    fetchHealth();
    fetchMetrics();
  }, [access, fetchHealth, fetchMetrics]);

  // Auto-refresh polling only. Kept separate from the realtime subscription so
  // toggling the button no longer tears down and rebuilds the socket.
  useEffect(() => {
    if (access !== 'allowed' || !autoRefresh) return undefined;
    const interval = setInterval(() => {
      fetchHealth();
      fetchMetrics();
    }, AUTO_REFRESH_MS);
    return () => clearInterval(interval);
  }, [access, autoRefresh, fetchHealth, fetchMetrics]);

  // ── NATIVE REAL-TIME PUSH ENABLED ──
  useEffect(() => {
    if (access !== 'allowed') return undefined;
    let debounceTimer = null;

    const channel = supabase.channel(`scraper-health-monitor-${Date.now()}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'scraper_watchdog_state' },
        () => {
          if (debounceTimer) clearTimeout(debounceTimer);
          debounceTimer = setTimeout(() => {
            // Flatten burst Postgres mutations into 1 reliable fetch
            fetchHealth();
            fetchMetrics();
            // Push event out so other pages on the frontend become instantly aware
            busEmit(EventType.DATA_MUTATED, { entity: 'scraper_health' });
          }, 800);
        }
      )
      .subscribe();

    return () => {
      if (debounceTimer) clearTimeout(debounceTimer);
      supabase.removeChannel(channel);
    };
  }, [access, fetchHealth, fetchMetrics]);

  const overallStatus = health?.status || 'unknown';
  const overallCfg = STATUS_COLORS[overallStatus] || STATUS_COLORS.unknown;

  if (access !== 'allowed') {
    return (
      <div style={{ padding: '20px', maxWidth: 800, margin: '0 auto', fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, sans-serif" }}>
        <div style={{
          padding: '20px 24px', borderRadius: 12, textAlign: 'center',
          background: 'linear-gradient(160deg, rgba(18,28,45,0.85), rgba(10,16,28,0.92))',
          border: '1.5px solid rgba(148,163,184,0.15)', color: 'rgba(200,214,229,0.6)', fontSize: 13,
        }}>
          {access === 'checking'
            ? 'Checking access...'
            : 'Scraper Health is an internal operations view and is restricted to administrators.'}
        </div>
      </div>
    );
  }

  return (
    <div style={{ padding: '20px', maxWidth: 800, margin: '0 auto', fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, sans-serif" }}>
      <style>{`@keyframes shd-pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.4; } }`}</style>

      {/* HEADER */}
      <div style={{
        display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20,
        padding: '16px 20px', borderRadius: 12,
        background: `linear-gradient(135deg, ${overallCfg.bg}, rgba(10,16,28,0.92))`,
        border: `1.5px solid ${overallCfg.border}`,
        boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.06), 0 4px 20px rgba(0,0,0,0.4)',
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
          <button onClick={() => setAutoRefresh(!autoRefresh)} style={{
            padding: '5px 12px', borderRadius: 6, fontSize: 11, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit',
            background: autoRefresh ? 'rgba(63,185,80,0.12)' : 'rgba(139,148,158,0.08)',
            border: `1px solid ${autoRefresh ? 'rgba(63,185,80,0.3)' : 'rgba(139,148,158,0.2)'}`,
            color: autoRefresh ? '#3fb950' : '#8b949e',
          }}>
            {autoRefresh ? 'Auto-Refresh ON' : 'Auto-Refresh OFF'}
          </button>
          <button onClick={() => { setLoading(true); fetchHealth(); fetchMetrics(); }} style={{
            padding: '5px 12px', borderRadius: 6, fontSize: 11, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit',
            background: 'linear-gradient(180deg, rgba(255,255,255,0.12), rgba(200,214,229,0.08))',
            border: '1.5px solid rgba(255,255,255,0.35)', color: '#ffffff',
          }}>
            Refresh Now
          </button>
        </div>
      </div>

      {error && (
        <div style={{ padding: '12px 16px', marginBottom: 12, borderRadius: 10, background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.3)', color: '#ef4444', fontSize: 13, fontWeight: 600 }}>
          Error: {error}
        </div>
      )}

      {loading && !health && (
        <div style={{ textAlign: 'center', padding: 40, color: 'rgba(200,214,229,0.4)' }}>Loading scraper health data...</div>
      )}

      {health && (
        <>
          {/* The real-time (Bravo) source was retired 2026-05-23 and the API no
              longer emits a `bravo` key, so the panel silently vanished. Render
              it only if the API ever reports it again, and state the retirement
              explicitly rather than showing a single unexplained source. */}
          <SourcePanel name="Real-Time Engine" data={health.scrapers?.bravo} />
          <SourcePanel name="Catalog Engine" data={health.scrapers?.pokeratlas} />
          {!health.scrapers?.bravo && (
            <div style={{
              padding: '10px 16px', marginBottom: 12, borderRadius: 10,
              background: 'rgba(139,148,158,0.06)', border: '1px solid rgba(139,148,158,0.2)',
              color: 'rgba(200,214,229,0.5)', fontSize: 12,
            }}>
              Real-Time Engine: retired. Cash-game activity is published from modelled history, so there is no live scrape to monitor.
            </div>
          )}

          {health.issues && health.issues.length > 0 && (
            <div style={{ padding: '14px 18px', borderRadius: 12, marginTop: 8, background: 'rgba(239,68,68,0.06)', border: '1px solid rgba(239,68,68,0.2)' }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: '#ef4444', marginBottom: 8 }}>Issues Detected</div>
              {health.issues.map((issue, i) => (
                <div key={i} style={{ fontSize: 12, color: 'rgba(239,68,68,0.8)', marginBottom: 3, paddingLeft: 12, position: 'relative' }}>
                  <span style={{ position: 'absolute', left: 0 }}>•</span>{issue}
                </div>
              ))}
            </div>
          )}

          {/* PERFORMANCE METRICS TOGGLE */}
          <button onClick={() => setShowMetrics(!showMetrics)} style={{
            marginTop: 16, width: '100%', padding: '10px 16px', borderRadius: 10,
            background: 'linear-gradient(160deg, rgba(18,28,45,0.6), rgba(10,16,28,0.75))',
            border: '1.5px solid rgba(0,212,255,0.15)', cursor: 'pointer',
            display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontFamily: 'inherit',
          }}>
            <span style={{ fontSize: 13, fontWeight: 700, color: '#e0e8f0' }}>Performance Metrics (24h)</span>
            <span style={{ color: '#00d4ff', fontSize: 12 }}>{showMetrics ? 'Hide' : 'Show'}</span>
          </button>

          {showMetrics && metrics && (
            <div style={{ marginTop: 8, padding: '16px 20px', borderRadius: 12, background: 'rgba(13,17,23,0.7)', border: '1px solid rgba(0,212,255,0.1)' }}>
              {/* The metrics API always returns an empty `bravo` bucket, which
                  rendered a "Real-Time Engine" card of 0 cycles / 0 records for
                  a source that no longer exists. Skip buckets with no cycles. */}
              {['bravo', 'pokeratlas'].map(source => {
                const src = metrics[source];
                if (!src) return null;
                const s = src.summary;
                if (source === 'bravo' && !(s?.cycles > 0)) return null;
                const hist = src.history || [];
                const maxDur = Math.max(...hist.map(h => h.duration || 0), 1);
                return (
                  <div key={source} style={{ marginBottom: source === 'bravo' ? 16 : 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 700, color: '#e0e8f0', marginBottom: 8, textTransform: 'uppercase' }}>
                      {source === 'bravo' ? 'Real-Time Engine' : 'Catalog Engine'}
                    </div>
                    <div style={{ display: 'flex', gap: 8, marginBottom: 10, flexWrap: 'wrap' }}>
                      <StatCard label="Cycles" value={s.cycles} color="#00d4ff" />
                      <StatCard label="Avg Duration" value={`${s.avg_duration}s`} color="#ffffff" />
                      <StatCard label="Avg Records" value={s.avg_records} color="#3fb950" />
                      <StatCard label="Total Errors" value={s.total_errors} color={s.total_errors > 0 ? '#ef4444' : '#3fb950'} />
                    </div>
                    {hist.length > 1 && (
                      <div style={{ display: 'flex', gap: 1, alignItems: 'flex-end', height: 30 }}>
                        {hist.slice(-30).map((h, i) => (
                          <div key={i} title={`${new Date(h.time).toLocaleTimeString()}: ${h.duration}s, ${h.records} records`} style={{
                            flex: 1, borderRadius: 2,
                            height: `${Math.max((h.duration / maxDur) * 100, 5)}%`,
                            background: h.errors > 0 ? 'rgba(239,68,68,0.5)' : 'rgba(0,212,255,0.4)',
                            transition: 'height 0.3s ease',
                          }} />
                        ))}
                      </div>
                    )}
                    {hist.length <= 1 && (
                      <div style={{ color: 'rgba(200,214,229,0.3)', fontSize: 11, textAlign: 'center', padding: 8 }}>
                        Collecting performance data...
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {/* WATCHDOG ALERT TIMELINE TOGGLE */}
          <button onClick={() => setShowAlertHistory(!showAlertHistory)} style={{
            marginTop: 12, width: '100%', padding: '10px 16px', borderRadius: 10,
            background: 'linear-gradient(160deg, rgba(18,28,45,0.6), rgba(10,16,28,0.75))',
            border: '1.5px solid rgba(255,255,255,0.15)', cursor: 'pointer',
            display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontFamily: 'inherit',
          }}>
            <span style={{ fontSize: 13, fontWeight: 700, color: '#e0e8f0' }}>Watchdog Alert History</span>
            <span style={{ color: '#ffffff', fontSize: 12 }}>{showAlertHistory ? 'Hide' : 'Show'}</span>
          </button>

          {showAlertHistory && (
            <div style={{ marginTop: 8, padding: '16px 20px', borderRadius: 12, background: 'rgba(13,17,23,0.7)', border: '1px solid rgba(255,255,255,0.1)' }}>
              {(!health.alert_history || health.alert_history.length === 0) ? (
                <div style={{ color: 'rgba(200,214,229,0.4)', fontSize: 12, textAlign: 'center', padding: 10 }}>No recent alerts found.</div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                  {health.alert_history.map(ev => {
                    const isRecovery = ev.type === 'recovery';
                    const color = isRecovery ? '#3fb950' : '#ef4444';
                    return (
                      <div key={ev.id} style={{ display: 'flex', gap: 12, borderLeft: `2px solid ${color}`, paddingLeft: 12 }}>
                        <div style={{ minWidth: 90, color: 'rgba(200,214,229,0.5)', fontSize: 11, paddingTop: 2 }}>
                          {new Date(ev.timestamp).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}
                        </div>
                        <div>
                          <div style={{ color: '#e0e8f0', fontSize: 12, fontWeight: 600, textTransform: 'uppercase', marginBottom: 2 }}>
                            {ev.source} <span style={{ color: color, fontSize: 10, padding: '2px 6px', background: isRecovery ? 'rgba(63,185,80,0.1)' : 'rgba(239,68,68,0.1)', borderRadius: 4, marginLeft: 6 }}>{ev.type}</span>
                          </div>
                          <div style={{ color: 'rgba(200,214,229,0.8)', fontSize: 12, lineHeight: 1.4, whiteSpace: 'pre-wrap' }}>{ev.message}</div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* THRESHOLDS */}
          <div style={{
            marginTop: 16, padding: '12px 16px', borderRadius: 10,
            background: 'linear-gradient(160deg, rgba(18,28,45,0.6), rgba(10,16,28,0.75))',
            border: '1.5px solid rgba(148,163,184,0.1)',
            boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.03), 0 2px 6px rgba(0,0,0,0.25)',
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
