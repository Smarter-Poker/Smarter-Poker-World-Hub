import React, { useCallback, useEffect, useRef, useState } from 'react';
import { listenBroadcast } from '../../lib/broadcastSync';
import { num, T } from '../../lib/horsesAdminTokens';
import {
  selectNavigationBadges,
  useStableAdminStore,
} from '../../stores/stableAdminStore';
import KpiTile from './KpiTile';
import styles from '../../../pages/horses/horses.module.css';

const SYNC_CHANNEL = 'horses-admin-sync';

/** A value that has not been read yet, or could not be. Never a fabricated 0. */
const UNKNOWN = 'Unknown';

function isNumber(value) {
  return value !== null && value !== undefined && !Number.isNaN(Number(value));
}

/** The function already rounded every percentage to one decimal; show that decimal. */
function pct(value) {
  return isNumber(value) ? `${Number(value).toFixed(1)}%` : UNKNOWN;
}

/** A ratio the function rounded to three decimals. */
function ratio(value) {
  return isNumber(value) ? Number(value).toLocaleString(undefined, { maximumFractionDigits: 3 }) : UNKNOWN;
}

/** A count, with the console's own thousands separators. */
function count(value) {
  return num(value, UNKNOWN);
}

/**
 * The five Phase 10 metrics, each with the denominator it is measured against.
 * Every number comes from one database function, fn_fleet_content_metrics,
 * which the weekly digest mail reads too, so the page and the mail cannot
 * disagree. Until the response has arrived every value reads Unknown.
 */
function contentTiles(analytics) {
  const feed = analytics?.feed || null;
  const reactions = analytics?.reactions || null;
  const captions = analytics?.captions || null;
  const coverage = analytics?.coverage || null;
  const readiness = analytics?.readiness || null;
  const notReady = readiness?.horses_not_social_ready;
  return [
    {
      label: 'Horse Share Of The Feed',
      value: pct(feed?.horse_share_pct),
      hint: `${count(feed?.horse_posts)} Horse Posts Of ${count(feed?.feed_posts)} Feed Posts. Horses Count In The Denominator With Everyone Else.`,
    },
    {
      label: 'Human Reactions Per Horse Post',
      value: ratio(reactions?.per_horse_post),
      hint: `${count(reactions?.human_likes)} Likes Plus ${count(reactions?.human_comments)} Comments By Humans, Over ${count(reactions?.horse_posts)} Horse Posts Published In The Window.`,
    },
    {
      label: 'Distinct Caption Rate',
      value: pct(captions?.distinct_caption_pct),
      hint: `${count(captions?.distinct_captions)} Distinct First Lines Of ${count(captions?.horse_posts)} Horse Posts With A Caption.`,
    },
    {
      label: 'Fleet Coverage',
      value: pct(coverage?.coverage_pct),
      hint: `${count(coverage?.horses_posted)} Horses Posted Of ${count(coverage?.fleet_size)} The Engine Can Schedule, Which Is ${pct(coverage?.coverage_pct_of_1000)} Of 1,000.`,
    },
    {
      label: 'Horses Not Social Ready',
      value: count(notReady),
      tone: isNumber(notReady) && Number(notReady) > 0 ? 'warn' : undefined,
      hint: 'Rows Returned By fn_horses_not_social_ready. That Function Still Counts Benched Horses With Closed Profiles, So Expect The Benched Count Until It Is Amended.',
    },
  ];
}

export default function StatsPanel({ authFetch, onNavigate }) {
  const badges = useStableAdminStore(selectNavigationBadges);
  const [platform, setPlatform] = useState(null);
  const [platformError, setPlatformError] = useState('');
  const [analytics, setAnalytics] = useState(null);
  const [analyticsError, setAnalyticsError] = useState('');
  const [loading, setLoading] = useState(true);
  const sequence = useRef(0);

  const load = useCallback(async () => {
    const request = ++sequence.current;
    setLoading(true);
    setPlatformError(''); setAnalyticsError('');
    const [platformResult, analyticsResult] = await Promise.allSettled([
      authFetch('/api/horses/club-arena-admin?section=platform'),
      authFetch('/api/horses/analytics?type=summary'),
    ]);
    if (request !== sequence.current) return;
    if (platformResult.status === 'fulfilled') setPlatform(platformResult.value.platform || null);
    else { setPlatform(null); setPlatformError(platformResult.reason?.message || 'Platform Pulse Could Not Be Read'); }
    if (analyticsResult.status === 'fulfilled') setAnalytics(analyticsResult.value.data || null);
    else { setAnalytics(null); setAnalyticsError(analyticsResult.reason?.message || 'Analytics Could Not Be Read'); }
    setLoading(false);
  }, [authFetch]);

  useEffect(() => { load(); return () => { sequence.current += 1; }; }, [load]);
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

  const attention = [
    ['Ledger Drift Rows', badges?.ledgerCritical || 0, 'clubarena', T.danger],
    ['Pending Cashouts', badges?.pendingCashouts || 0, 'clubarena', T.warn],
    ['Open Tickets', badges?.openTickets || 0, 'bugreports', T.warn],
    ['Dead Scrapers', badges?.deadScrapers || badges?.scrapersDead || 0, 'scrapers', T.danger],
  ].filter(([, value]) => Number(value) > 0);
  const tiles = contentTiles(analytics);

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
    <h3 className={styles.sectionTitle}>Content Engine, Last 7 Days</h3>
    {analyticsError ? <div className={styles.errorState} role="alert">Analytics Unavailable: {analyticsError}</div> : null}
    {loading && !analytics ? <div className={styles.loadingSpinner}>Reading The Content Engine</div> : null}
    <div className={styles.kpiGrid}>{tiles.map((tile) => <KpiTile key={tile.label} label={tile.label} value={tile.value} hint={tile.hint} tone={tile.tone} />)}</div>
  </div>;
}
