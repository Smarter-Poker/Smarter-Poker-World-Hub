import React, { useCallback, useEffect, useRef, useState } from 'react';
import { T, num } from '../../lib/horsesAdminTokens';
import pageStyles from '../../../pages/horses/horses.module.css';
import panelStyles from './legacyPanels.module.css';

const styles = { ...pageStyles, ...panelStyles };

export default function ScrapersPanel({ authFetch, onHealthChange }) {
  const [health, setHealth] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [lastFetch, setLastFetch] = useState(null);
  const sequence = useRef(0);

  const load = useCallback(async () => {
    const seq = ++sequence.current;
    setLoading(true); setError('');
    try {
      const data = await authFetch('/api/admin/scraper-health');
      if (seq !== sequence.current) return;
      setHealth(data); setLastFetch(new Date());
      onHealthChange?.(data);
    } catch (cause) {
      if (seq === sequence.current) setError(cause?.message || 'Scraper Health Could Not Be Read');
    } finally { if (seq === sequence.current) setLoading(false); }
  }, [authFetch, onHealthChange]);

  useEffect(() => {
    load();
    const tick = () => { if (!document.hidden) load(); };
    const interval = window.setInterval(tick, 60000);
    const onVisible = () => { if (!document.hidden) load(); };
    document.addEventListener('visibilitychange', onVisible);
    return () => { sequence.current += 1; window.clearInterval(interval); document.removeEventListener('visibilitychange', onVisible); };
  }, [load]);

  return <div className={styles.statsView}>
    <div className={styles.panelHeading}><div><h2>Scraper Health</h2><p>Status Of The Data Collection Daemons. Auto-Refreshes Every 60 Seconds.{lastFetch ? ` Last Fetched ${lastFetch.toLocaleTimeString()}.` : ''}</p></div><button className={styles.actionBtn} onClick={load} disabled={loading}>{loading ? 'Loading' : 'Refresh'}</button></div>
    {error ? <div className={styles.errorState} role="alert"><div>Scraper Health Unavailable: {error}</div><button className={styles.actionBtn} onClick={load}>Retry</button></div>
      : loading && !health ? <div className={styles.loadingSpinner}>Loading Scraper Status</div>
      : !health ? <div className={styles.emptyState}>No Scraper Data Available.</div>
      : <>
        {health.notice ? <div className={styles.warnBanner}>{health.notice}</div> : null}
        {health.summary ? <div className={styles.kpiGrid}>{[
          ['Healthy', health.summary.healthyCount, T.accent], ['Warning', health.summary.warningCount, T.warn],
          ['Dead', health.summary.deadCount, T.danger], ['Not Instrumented', health.summary.notInstrumentedCount, T.muted],
          ['Disabled', health.summary.disabledCount, T.muted], ['Supabase Data', health.summary.dataFresh ? 'Fresh' : 'Stale', health.summary.dataFresh ? T.accent : T.danger],
        ].map(([label, value, color]) => <div key={label} className={styles.kpi}><div className={styles.kpiValue} style={{ color }}>{typeof value === 'string' ? value : num(value)}</div><div className={styles.kpiLabel}>{label}</div></div>)}</div> : null}
        {(health.daemons || []).length === 0 ? <div className={styles.emptyState}>No Daemons Registered.</div> : <div className={styles.cardGrid}>{health.daemons.map((daemon) => {
          const color = { healthy: T.accent, warning: T.warn, dead: T.danger, unknown: T.muted, not_instrumented: T.muted, disabled: T.muted }[daemon.status] || T.muted;
          const label = { healthy: 'Healthy', warning: 'Warning', dead: 'Dead', unknown: 'Unknown', not_instrumented: 'Not Instrumented', disabled: 'Disabled' }[daemon.status] || daemon.status || 'Unknown';
          const hb = daemon.heartbeat;
          return <article key={daemon.id} className={styles.card} style={{ borderLeft: `4px solid ${color}` }}><div className={styles.cardTitleRow}><div><strong>{daemon.label}</strong><div className={styles.mutedText}>{daemon.type ? `${daemon.type} - ` : ''}Interval {daemon.interval || 'Unknown'}</div></div><span style={{ color }}>{label}</span></div>{daemon.statusReason ? <p className={styles.mutedText}>{daemon.statusReason}</p> : null}{hb ? <dl className={styles.detailGrid}>{[
            ['Status', hb.daemonStatus], ['PID', hb.pid], ['Cycle', hb.cycle === undefined ? undefined : `#${hb.cycle}`], ['Records Saved', hb.recordsSaved === undefined ? undefined : num(hb.recordsSaved)], ['Venues', hb.venuesWithData], ['Progress', hb.progress], ['Errors', hb.errors], ['Last Duration', hb.durationSeconds === undefined ? undefined : `${Math.round(hb.durationSeconds)}s`], ['Heartbeat Age', hb.staleMinutes === undefined ? undefined : `${hb.staleMinutes}m Ago`],
          ].filter(([, value]) => value !== undefined && value !== null).map(([key, value]) => <React.Fragment key={key}><dt>{key}</dt><dd>{value}</dd></React.Fragment>)}</dl> : <p className={styles.mutedText}>No Heartbeat Published. This Daemon May Be Interval-Based Or Not Running.</p>}{daemon.database?.staleMinutes != null ? <p className={styles.mutedText}>Database Data Age: <strong style={{ color: daemon.database.staleMinutes > 25 ? T.danger : T.accent }}>{daemon.database.staleMinutes}m</strong></p> : null}</article>;
        })}</div>}
      </>}
  </div>;
}
