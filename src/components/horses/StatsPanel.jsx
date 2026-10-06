import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { listenBroadcast } from '../../lib/broadcastSync';
import { num, T } from '../../lib/horsesAdminTokens';
import {
  selectNavigationBadges,
  useStableAdminStore,
} from '../../stores/stableAdminStore';
import styles from '../../../pages/horses/horses.module.css';

const SYNC_CHANNEL = 'horses-admin-sync';
const ROSTER_PAGE_SIZE = 1000;

async function readRoster(authFetch) {
  const rows = [];
  for (let offset = 0; offset <= 100000; offset += ROSTER_PAGE_SIZE) {
    const body = await authFetch(`/api/horses/roster?limit=${ROSTER_PAGE_SIZE}&offset=${offset}`);
    if (!Array.isArray(body?.rows)) throw new Error('Roster Response Was Malformed');
    rows.push(...body.rows);
    if (!body.hasMore || body.rows.length === 0) break;
  }
  return rows;
}

export default function StatsPanel({ authFetch, onNavigate }) {
  const badges = useStableAdminStore(selectNavigationBadges);
  const [platform, setPlatform] = useState(null);
  const [platformError, setPlatformError] = useState('');
  const [analytics, setAnalytics] = useState(null);
  const [analyticsError, setAnalyticsError] = useState('');
  const [personas, setPersonas] = useState([]);
  const [pipelineRuns, setPipelineRuns] = useState([]);
  const [contentError, setContentError] = useState('');
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    setPlatformError(''); setAnalyticsError(''); setContentError('');
    const [platformResult, analyticsResult, rosterResult, runsResult] = await Promise.allSettled([
      authFetch('/api/horses/club-arena-admin?section=platform'),
      authFetch('/api/horses/analytics?type=summary'),
      readRoster(authFetch),
      // pipeline_runs is not readable from a browser: the operator route reads it.
      authFetch('/api/horses/stable-admin', { method: 'POST', body: JSON.stringify({ action: 'pipeline_runs' }) }),
    ]);
    if (platformResult.status === 'fulfilled') setPlatform(platformResult.value.platform || null);
    else { setPlatform(null); setPlatformError(platformResult.reason?.message || 'Platform Pulse Could Not Be Read'); }
    if (analyticsResult.status === 'fulfilled') setAnalytics(analyticsResult.value.data || null);
    else { setAnalytics(null); setAnalyticsError(analyticsResult.reason?.message || 'Analytics Could Not Be Read'); }
    if (rosterResult.status === 'fulfilled') setPersonas(rosterResult.value);
    else { setPersonas([]); setContentError(rosterResult.reason?.message || 'Roster Counts Could Not Be Read'); }
    if (runsResult.status === 'fulfilled' && Array.isArray(runsResult.value?.runs)) setPipelineRuns(runsResult.value.runs);
    else {
      setPipelineRuns([]);
      setContentError((current) => current || runsResult.value?.error?.message || runsResult.reason?.message || 'Pipeline Counts Could Not Be Read');
    }
    setLoading(false);
  }, [authFetch]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    let timer = null;
    const refresh = () => {
      if (timer) return;
      timer = setTimeout(() => { timer = null; load(); }, 2000);
    };
    const stopBroadcast = listenBroadcast(SYNC_CHANNEL, (message) => {
      if (message?.type === 'sync_update') refresh();
    });
    window.addEventListener('horses-updated', refresh);
    window.addEventListener('horses-settings-updated', refresh);
    return () => {
      if (timer) clearTimeout(timer);
      stopBroadcast();
      window.removeEventListener('horses-updated', refresh);
      window.removeEventListener('horses-settings-updated', refresh);
    };
  }, [load]);

  const horses = useMemo(() => personas.filter((row) => row.profile_id), [personas]);
  const socialOnly = personas.length - horses.length;
  const activeAuthors = analytics?.activeHorses ?? horses.filter((row) => row.is_active).length;
  const attention = [
    ['Ledger Drift Rows', badges?.ledgerCritical || 0, 'clubarena', T.danger],
    ['Pending Cashouts', badges?.pendingCashouts || 0, 'clubarena', T.warn],
    ['Open Tickets', badges?.openTickets || 0, 'bugreports', T.warn],
    ['Dead Scrapers', badges?.deadScrapers || badges?.scrapersDead || 0, 'scrapers', T.danger],
  ].filter(([, value]) => Number(value) > 0);
  const distribution = Object.entries(analytics?.sourceDistribution || {});
  const peak = Math.max(1, ...distribution.map(([, value]) => Number(value) || 0));

  return <div className={styles.statsView}>
    <div className={styles.panelHeading}><div><h2>Platform Statistics</h2><p>Live Platform Activity And Seven-Day Content Evidence.</p></div><button type="button" className={styles.actionBtn} onClick={load} disabled={loading}>{loading ? 'Refreshing' : 'Refresh'}</button></div>
    <h3 className={styles.sectionTitle}>Live Now</h3>
    {platformError ? <div className={styles.errorState} role="alert">Platform Pulse Unavailable: {platformError}</div> : null}
    {loading && !platform ? <div className={styles.loadingSpinner}>Reading The Platform</div> : platform ? <div className={styles.kpiGrid}>{[
      ['Live Tables', platform.liveTables, T.accent], ['Players Seated', platform.seatedNow],
      ['Hands (Last Hour)', platform.hands1h, T.accent], ['Hands (24h)', platform.hands24h],
      ['Tables Waiting', platform.waitingTables], ['Live Tournaments', platform.liveTournaments],
      ['Signups (24h)', platform.signups24h], ['Signups (7d)', platform.signups7d],
    ].map(([label, value, color]) => <div className={styles.kpi} key={label}><div className={styles.kpiValue} style={color ? { color } : undefined}>{num(value)}</div><div className={styles.kpiLabel}>{label}{label === 'Hands (24h)' && platform.handsTrendPct != null ? <span style={{ marginLeft: 6, color: platform.handsTrendPct >= 0 ? T.accent : T.warn }}>{platform.handsTrendPct >= 0 ? '+' : ''}{platform.handsTrendPct}%</span> : null}</div></div>)}</div> : null}
    {attention.length ? <><h3 className={styles.sectionTitle}>Needs Attention</h3><div className={styles.kpiGrid}>{attention.map(([label, value, tab, color]) => <button type="button" key={label} className={`${styles.kpi} ${styles.kpiAction}`} onClick={() => onNavigate?.(tab)}><div className={styles.kpiValue} style={{ color }}>{num(value)}</div><div className={styles.kpiLabel}>{label}</div></button>)}</div></> : null}
    <h3 className={styles.sectionTitle}>Content Engine</h3>
    {analyticsError ? <div className={styles.errorState} role="alert">Analytics Unavailable: {analyticsError}</div> : null}
    {contentError ? <div className={styles.errorState} role="alert">Content Counts Unavailable: {contentError}</div> : null}
    {!loading || analytics || personas.length ? <><div className={styles.statsOverview}>{[
      ['Total Authors (Every Persona Row)', personas.length],
      ['Of Those, Horses With A Poker Profile', horses.length],
      ['Of Those, Social Only (No Poker Profile)', socialOnly],
      ['Active Authors (7d)', activeAuthors],
      ['Pipeline Runs', pipelineRuns.length],
      ['Posts Created (7d)', analytics?.totalPosts],
    ].map(([label, value]) => <div className={styles.statCardLarge} key={label}><span className={styles.statNumber}>{num(value)}</span><span className={styles.statLabel}>{label}</span></div>)}</div><section className={styles.contentBreakdown}><h3>Content Source Breakdown (Last 7 Days)</h3><div className={styles.breakdownGrid}>{distribution.length ? distribution.map(([source, count]) => <div className={styles.breakdownItem} key={source}><div className={styles.breakdownBar} style={{ width: `${Math.min(((Number(count) || 0) / peak) * 100, 100)}%`, backgroundColor: T.accent }} /><span className={styles.breakdownLabel}>{source}</span><span className={styles.breakdownCount}>{num(count)}</span></div>) : <p className={styles.noData}>No Data For The Last 7 Days.</p>}</div></section></> : <div className={styles.loadingSpinner}>Loading Analytics</div>}
  </div>;
}
