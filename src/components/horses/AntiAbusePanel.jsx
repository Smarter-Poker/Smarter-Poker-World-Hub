import React, { useCallback, useEffect, useRef, useState } from 'react';
import { T, num, when } from '../../lib/horsesAdminTokens';
import DataTable from './DataTable';
import pageStyles from '../../../pages/horses/horses.module.css';
import panelStyles from './legacyPanels.module.css';

const styles = { ...pageStyles, ...panelStyles };
const EMPTY = {
  abuse: { stats: {}, topIPs: [] },
  economy: { sourceBreakdown: {}, topHolders: [] },
  alerts: [],
  pages: { abuse: { rows: [] }, audit: { rows: [] } },
};

function sourceRows(value) {
  if (Array.isArray(value)) return value;
  return Object.entries(value || {}).map(([source, amount]) => ({ source, amount }));
}

export default function AntiAbusePanel({ authFetch }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const sequence = useRef(0);

  const load = useCallback(async () => {
    const seq = ++sequence.current;
    setLoading(true);
    setError('');
    try {
      const next = await authFetch('/api/horses/anti-abuse?section=all');
      if (seq === sequence.current) setData(next);
    } catch (cause) {
      if (seq === sequence.current) {
        setData(EMPTY);
        setError(cause?.message || 'Anti-Abuse Data Could Not Be Read');
      }
    } finally {
      if (seq === sequence.current) setLoading(false);
    }
  }, [authFetch]);

  useEffect(() => {
    load();
    return () => { sequence.current += 1; };
  }, [load]);

  const abuseRows = data?.pages?.abuse?.rows || data?.abuse?.log || [];
  const auditRows = data?.pages?.audit?.rows || data?.audit || [];
  const stats = data?.abuse?.stats || {};
  const topIPs = data?.abuse?.topIPs || [];
  const alerts = data?.alerts || [];
  const sources = sourceRows(data?.economy?.sourceBreakdown);

  return <div className={styles.statsView}>
    <div className={styles.panelHeading}>
      <div><h2>Anti-Abuse Intelligence</h2><p>Signup, Account, Alert And Diamond-Economy Evidence.</p></div>
      <button className={styles.actionBtn} onClick={load} disabled={loading}>{loading ? 'Loading' : 'Refresh'}</button>
    </div>
    {error ? <div className={styles.errorState} role="alert">Anti-Abuse Data Unavailable: {error}</div> : null}
    {loading && !data ? <div className={styles.loadingSpinner}>Loading Anti-Abuse Data</div> : <>
      <div className={styles.kpiGrid}>{[
        ['Total Signups', stats.totalSignups, T.info],
        ['Blocked Or Flagged', stats.blocked, T.danger],
        ['Deleted Accounts', stats.deletedAccounts, T.warn],
        ['Disposable Emails', stats.disposable, T.warn],
        ['Alerts, 24 Hours', alerts.length, T.danger],
      ].map(([label, value, color]) => <div className={styles.kpi} key={label}><div className={styles.kpiValue} style={{ color }}>{num(value)}</div><div className={styles.kpiLabel}>{label}</div></div>)}</div>
      {(data?.failedSources || []).length ? <div className={styles.warnBanner} role="alert">This View Is Incomplete. An Empty Panel Below Does Not Mean Nothing Was Found. These Sources Could Not Be Read: {data.failedSources.map((item) => typeof item === 'string' ? item : `${item.source || 'Unknown Source'} (${item.error || item.message || 'Read Failed'})`).join('; ')}.</div> : null}
      {stats.disposableScope ? <div className={styles.warnBanner}>Disposable-Email Count Is Scoped To {stats.disposableScope}.</div> : null}
      <DataTable caption="Recent Signup Abuse Evidence" rows={abuseRows} empty="No Signup Abuse Rows Were Returned." columns={[
        { key: 'ip', header: 'IP', render: (row) => row.ip_address || 'Unknown' },
        { key: 'signups', header: 'Signups', render: (row) => num(row.signup_count) },
        { key: 'deleted', header: 'Deleted', render: (row) => num(row.deleted_account_count) },
        { key: 'email', header: 'Email Evidence', render: (row) => row.raw_email || (row.email_hash ? `${row.email_hash.slice(0, 12)}...` : 'Unknown') },
        { key: 'welcome', header: 'Welcome', render: (row) => row.welcome_package_granted ? 'Granted' : 'No' },
        { key: 'flags', header: 'Flags', render: (row) => (row.abuse_flags || []).map((flag) => flag.reason || 'Flagged').join(', ') || '-' },
        { key: 'last', header: 'Last Signup', render: (row) => when(row.last_signup_at, true) },
      ]} />
      <DataTable caption="Highest-Volume Signup IPs" rows={topIPs} empty="No High-Volume IP Rows Were Returned." columns={[
        { key: 'ip', header: 'IP', render: (row) => row.ip_address || row.ip || 'Unknown' },
        { key: 'count', header: 'Signups', render: (row) => num(row.signup_count ?? row.count) },
        { key: 'deleted', header: 'Deleted', render: (row) => num(row.deleted_account_count ?? row.deleted) },
        { key: 'last', header: 'Last Seen', render: (row) => when(row.last_signup_at || row.last_seen_at, true) },
      ]} />
      <DataTable caption="Active Abuse Alerts" rows={alerts} empty="No Active Abuse Alerts Were Returned." columns={[
        { key: 'time', header: 'Time', render: (row) => when(row.at || row.created_at || row.detected_at || row.last_signup_at, true) },
        { key: 'type', header: 'Type', render: (row) => row.type || row.alert_type || row.reason || 'Abuse Signal' },
        { key: 'subject', header: 'Subject', render: (row) => row.email || row.raw_email || row.username || row.ip_address || row.ip || row.user_id || '-' },
        { key: 'detail', header: 'Evidence', render: (row) => row.message || row.details || row.description || `IP ${row.ip || row.ip_address || 'Unknown'} - Deletions ${num(row.deletions, '0')}` },
      ]} />
      <section className={styles.contentBreakdown}>
        <h3>Diamond Economy, {data?.economy?.windowLabel || 'Defined Window'}</h3>
        <div className={styles.kpiGrid}>
          <div className={styles.kpi}><div className={styles.kpiValue}>{num(data?.economy?.totalGranted)}</div><div className={styles.kpiLabel}>Granted</div></div>
          <div className={styles.kpi}><div className={styles.kpiValue}>{num(data?.economy?.totalSpent)}</div><div className={styles.kpiLabel}>Spent</div></div>
        </div>
        {data?.economy?.truncated ? <div className={styles.warnBanner}>The Economy Source Reached Its Safety Cap. These Are Windowed, Capped Figures.</div> : null}
      </section>
      <DataTable caption="Diamond Source Breakdown" rows={sources} empty="No Diamond Source Rows Were Returned." columns={[
        { key: 'source', header: 'Source', render: (row) => row.source || row.name || 'Unknown' },
        { key: 'amount', header: 'Diamonds', render: (row) => num(row.amount ?? row.total ?? row.value) },
      ]} />
      <DataTable caption="Top Diamond Holders" rows={data?.economy?.topHolders || []} empty="No Holder Rows Were Returned." columns={[
        { key: 'username', header: 'Username', render: (row) => row.username || '-' },
        { key: 'diamonds', header: 'Diamonds', render: (row) => num(row.diamonds) },
        { key: 'vip', header: 'VIP', render: (row) => row.is_vip ? row.vip_tier || 'VIP' : '-' },
        { key: 'phone', header: 'Phone', render: (row) => row.phone_verified ? 'Verified' : 'No' },
      ]} />
      <DataTable caption="Admin Audit Evidence" rows={auditRows} empty="No Audit Rows Were Returned." columns={[
        { key: 'time', header: 'Time', render: (row) => when(row.created_at, true) },
        { key: 'action', header: 'Action' },
        { key: 'target', header: 'Target', render: (row) => `${row.target_type || '-'} ${row.target_id ? String(row.target_id).slice(0, 8) : ''}` },
        { key: 'ip', header: 'IP', render: (row) => row.ip_address || '-' },
      ]} />
    </>}
  </div>;
}
