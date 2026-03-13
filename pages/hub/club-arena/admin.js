/* ═══════════════════════════════════════════════════════════════
   Club Arena Admin & Operations — Native Hub Page (replaces iframe)
   Dashboard (Health), Settlements, Audit Log, Branding
   ═══════════════════════════════════════════════════════════════ */
import { useState, useEffect, useCallback } from 'react';
import SEOHead from '../../../src/components/seo/SEOHead';
import UniversalHeader from '../../../src/components/ui/UniversalHeader';
import HubErrorBoundary from '../../../src/components/ui/HubErrorBoundary';
import Link from 'next/link';
import { useRouter } from 'next/router';
import useTrainingBus from '../../../src/hooks/useTrainingBus';
import { apiCall, apiGet } from '../../../src/lib/club-arena/apiClient';
import s from '../../../src/styles/UnionDashboard.module.css';

// ── Helpers ─────────────────────────────────────────────────
const fmt = (n) => Number(n || 0).toLocaleString();
const fmtChips = (n) => {
  const v = Number(n || 0);
  if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}M`;
  if (v >= 1_000) return `${(v / 1_000).toFixed(1)}K`;
  return fmt(v);
};
const formatDate = (ts) => {
  if (!ts) return '';
  const d = new Date(ts);
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
};
const toTitleCase = (str) => str.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());

// ── Shared UI Components ────────────────────────────────────
function Meter({ label, score, color, detail }) {
  return (
    <div style={{ marginBottom: '16px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px', marginBottom: '8px' }}>
        <span style={{ color: '#E4E6EB', fontWeight: 600 }}>{label}</span>
        <span style={{ color: '#B0B3B8' }}>{detail} (Score: {score})</span>
      </div>
      <div style={{ width: '100%', height: '8px', background: '#3A3B3C', borderRadius: '4px', overflow: 'hidden' }}>
        <div style={{ width: `${Math.max(0, Math.min(100, score))}%`, height: '100%', background: color, borderRadius: '4px' }} />
      </div>
    </div>
  );
}

// ── Tabs ────────────────────────────────────────────────────
function DashboardTab({ clubId }) {
  const [health, setHealth] = useState(null);
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      setLoadError(null);
      const [hRes, sRes] = await Promise.all([
        apiCall('/api/club-arena/club-health', { action: 'score', clubId }),
        apiCall('/api/club-arena/audit-trail', { action: 'stats', clubId })
      ]);
      setHealth(hRes);
      setStats(sRes);
    } catch (err) {
      console.error(err);
      setLoadError(err.message || 'Failed to load dashboard');
    } finally {
      setLoading(false);
    }
  }, [clubId]);

  useEffect(() => { load(); }, [load]);

  if (loading) return (
    <div style={{ animation: 'fadeIn 0.2s ease-out' }}>
      <div style={{ display: 'flex', gap: '24px', flexWrap: 'wrap' }}>
        <div style={{ flex: '1 1 300px' }}><div className="ca-skeleton" style={{ height: '240px' }} /></div>
        <div style={{ flex: '2 1 400px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
          {[1,2,3,4,5].map(i => <div key={i} className="ca-skeleton" style={{ height: '40px' }} />)}
        </div>
      </div>
      <div className="ca-skeleton" style={{ height: '160px', marginTop: '24px' }} />
    </div>
  );
  if (loadError || !health) return (
    <div className={s.error} style={{ textAlign: 'center', padding: '40px' }}>
      <div style={{ fontSize: '32px', marginBottom: '12px' }}>⚠️</div>
      <div style={{ marginBottom: '16px' }}>{loadError || 'Failed to load health metrics'}</div>
      <button onClick={load} className={s.btnPrimary} style={{ padding: '8px 24px' }}>↻ Retry</button>
    </div>
  );

  const colorMap = { green: '#31A24C', yellow: '#F5A623', red: '#FA383E' };
  const hColor = colorMap[health.color] || '#31A24C';
  const bd = health.breakdown || {};

  return (
    <div style={{ animation: 'fadeIn 0.2s ease-out' }}>
      <div style={{ display: 'flex', gap: '24px', flexWrap: 'wrap' }}>
        {/* Main Health Score */}
        <div style={{ flex: '1 1 300px', background: '#242526', padding: '24px', borderRadius: '12px', border: `1px solid ${hColor}44`, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
          <h3 style={{ margin: '0 0 16px', color: '#B0B3B8', fontSize: '14px', textTransform: 'uppercase' }}>Overall Club Health</h3>
          <div style={{ position: 'relative', width: '160px', height: '160px', display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: '50%', border: `8px solid ${hColor}`, boxShadow: `0 0 30px ${hColor}33` }}>
            <span style={{ fontSize: '48px', fontWeight: 800, color: hColor }}>{health.healthScore}</span>
          </div>
          <div style={{ marginTop: '16px', fontSize: '16px', fontWeight: 700, color: hColor, textTransform: 'uppercase' }}>
            {health.status} {health.trend === 'improving' ? '↗️' : health.trend === 'declining' ? '↘️' : '➡️'}
          </div>
        </div>

        {/* Breakdown Meters */}
        <div style={{ flex: '2 1 400px', background: '#242526', padding: '24px', borderRadius: '12px', border: '1px solid #3A3B3C' }}>
          <h3 style={{ margin: '0 0 24px', fontSize: '16px' }}>Health Metrics Breakdown</h3>
          {bd.activePlayers && <Meter label="Active Players (40%)" score={bd.activePlayers.score} color="#31A24C" detail={`${bd.activePlayers.active} / ${bd.activePlayers.total}`} />}
          {bd.rakeTrend && <Meter label="Rake Trend (20%)" score={bd.rakeTrend.score} color="#F5A623" detail={`This week: ${fmtChips(bd.rakeTrend.thisWeek)}`} />}
          {bd.agentEngagement && <Meter label="Agent Engagement (15%)" score={bd.agentEngagement.score} color="#4599FF" detail={`${bd.agentEngagement.active} / ${bd.agentEngagement.total} active`} />}
          {bd.playerAcquisition && <Meter label="Player Acquisition (15%)" score={bd.playerAcquisition.score} color="#a855f7" detail={`${bd.playerAcquisition.newThisMonth} new this month`} />}
          {bd.cashoutVelocity && <Meter label="Cashout Velocity (10%)" score={bd.cashoutVelocity.score} color="#E4E6EB" detail={`${bd.cashoutVelocity.cashouts} outs vs ${bd.cashoutVelocity.buyins} ins`} />}
        </div>
      </div>

      {/* Aggregate Volume Stats */}
      {stats && (
        <div style={{ background: '#242526', padding: '24px', borderRadius: '12px', border: '1px solid #3A3B3C', marginTop: '24px' }}>
          <h3 style={{ margin: '0 0 20px', fontSize: '16px', display: 'flex', justifyContent: 'space-between' }}>
            <span>Recent Activity Volume</span>
            <span style={{ color: '#31A24C', fontSize: '18px' }}>Total Vol: {fmtChips(stats.totalVolume)}</span>
          </h3>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: '16px' }}>
            {Object.entries(stats.byActionType || {}).map(([type, data]) => (
              <div key={type} style={{ background: '#18191A', padding: '16px', borderRadius: '8px', border: '1px solid #3E4042' }}>
                <div style={{ fontSize: '12px', color: '#B0B3B8', marginBottom: '8px', textTransform: 'uppercase' }}>{toTitleCase(type)}</div>
                <div style={{ fontSize: '20px', fontWeight: 700, color: '#E4E6EB', marginBottom: '4px' }}>{fmtChips(data.volume)}</div>
                <div style={{ fontSize: '12px', color: '#65676B' }}>{fmt(data.count)} transactions</div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function SettlementsTab({ clubId }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState(false);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      const res = await apiCall('/api/club-arena/settle-period', { action: 'status', clubId });
      setData(res);
    } catch (err) {
      alert(err.message);
    } finally {
      setLoading(false);
    }
  }, [clubId]);

  useEffect(() => { load(); }, [load]);

  const doAction = async (actionName, extras={}) => {
    if (!confirm(`Are you sure you want to ${actionName} this settlement period?`)) return;
    try {
      setProcessing(true);
      await apiCall('/api/club-arena/settle-period', { action: actionName, clubId, ...extras });
      load();
    } catch(err) {
      alert(err.message);
    } finally {
      setProcessing(false);
    }
  };

  if (loading) return (
    <div style={{ animation: 'fadeIn 0.2s ease-out' }}>
      <div className="ca-skeleton" style={{ height: '140px', marginBottom: '24px' }} />
      <div className="ca-skeleton" style={{ height: '200px' }} />
    </div>
  );
  if (!data) return null;

  const cp = data.currentPeriod;

  return (
    <div style={{ animation: 'fadeIn 0.2s ease-out' }}>
      {/* Current Period Control */}
      <div style={{ background: '#242526', padding: '24px', borderRadius: '12px', border: '1px solid #3A3B3C', marginBottom: '24px' }}>
        <h3 style={{ margin: '0 0 16px', fontSize: '18px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span>Current Settlement Period</span>
          {cp?.status === 'open' && <span style={{ fontSize: '12px', background: 'rgba(49,162,76,0.15)', color: '#31A24C', padding: '4px 8px', borderRadius: '4px' }}>OPEN</span>}
          {cp?.status === 'closed' && <span style={{ fontSize: '12px', background: '#3A3B3C', color: '#E4E6EB', padding: '4px 8px', borderRadius: '4px' }}>CLOSED</span>}
          {!cp && <span style={{ fontSize: '12px', color: '#F5A623' }}>NO PERIOD</span>}
        </h3>
        
        {cp ? (
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '16px' }}>
            <div>
              <div style={{ fontSize: '14px', color: '#B0B3B8' }}>Period #{cp.period_number} • Year {cp.year}</div>
              <div style={{ fontSize: '15px', color: '#E4E6EB', marginTop: '4px', fontWeight: 600 }}>
                {formatDate(cp.start_at)} — {cp.status === 'open' ? 'Now' : formatDate(cp.end_at)}
              </div>
            </div>
            
            <div style={{ display: 'flex', gap: '12px' }}>
              {cp.status === 'open' ? (
                <button onClick={() => doAction('close', { periodId: cp.id })} disabled={processing} className={s.btnPrimary} style={{ background: '#FA383E' }}>
                  {processing ? 'Processing...' : 'Close Period & Calculate Commissions'}
                </button>
              ) : (
                <button onClick={() => doAction('open')} disabled={processing} className={s.btnPrimary} style={{ background: '#31A24C' }}>
                  {processing ? 'Processing...' : 'Open New Period'}
                </button>
              )}
            </div>
          </div>
        ) : (
          <div>
            <div style={{ color: '#B0B3B8', marginBottom: '16px' }}>No active period found. Start a new tracking period for your agents.</div>
            <button onClick={() => doAction('open')} disabled={processing} className={s.btnPrimary} style={{ background: '#31A24C' }}>
              Start Period #1
            </button>
          </div>
        )}
      </div>

      {/* Pending Commissions */}
      <h3 style={{ margin: '0 0 16px', fontSize: '18px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        Pending Commissions Payloads
        {(data.pendingCommissions || []).length > 0 && (
          <button onClick={() => doAction('pay_all', { periodId: cp?.id })} disabled={processing} className={s.btnGhost} style={{ border: '1px solid #31A24C', color: '#31A24C' }}>
            Mark All as Paid
          </button>
        )}
      </h3>

      {(data.pendingCommissions || []).length === 0 ? (
        <div className={s.emptyState} style={{ padding: '32px' }}><span className={s.emptyIcon}>💸</span><span className={s.emptyText}>No pending commissions to pay.</span></div>
      ) : (
        <div className={s.tableScroll}>
          <table className={s.dataTable}>
            <thead>
              <tr>
                <th>Agent User ID</th>
                <th style={{ textAlign: 'right' }}>Total Rake Gen</th>
                <th style={{ textAlign: 'center' }}>Fee %</th>
                <th style={{ textAlign: 'right' }}>Payout</th>
                <th style={{ textAlign: 'center' }}>Action</th>
              </tr>
            </thead>
            <tbody>
              {(data.pendingCommissions || []).map(c => (
                <tr key={c.id}>
                  <td style={{ fontFamily: 'monospace', color: '#4599FF' }}>{c.user_id.substring(0,8)}...</td>
                  <td style={{ textAlign: 'right', color: '#B0B3B8' }}>{fmtChips(c.total_rake_generated)}</td>
                  <td style={{ textAlign: 'center' }}>{c.fee_percent}%</td>
                  <td style={{ textAlign: 'right', fontWeight: 700, color: '#F7C52A' }}>{fmtChips(c.amount)}</td>
                  <td style={{ textAlign: 'center' }}>
                    <button onClick={() => doAction('pay', { commissionId: c.id })} disabled={processing} style={{ background: '#31A24C', color: '#fff', border: 'none', padding: '4px 12px', borderRadius: '4px', cursor: 'pointer', fontSize: '12px', fontWeight: 600 }}>
                      Mark Paid
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function AuditLogTab({ clubId }) {
  const [data, setData] = useState({ logs: [], total: 0, page: 1, totalPages: 1 });
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [loadError, setLoadError] = useState(null);

  const load = useCallback(async (p) => {
    try {
      setLoading(true);
      setLoadError(null);
      const res = await apiCall('/api/club-arena/audit-trail', { action: 'list', clubId, page: p, pageSize: 50 });
      setData(res);
    } catch (err) {
      setLoadError(err.message);
    } finally {
      setLoading(false);
    }
  }, [clubId]);

  const exportCSV = async () => {
    try {
      const res = await apiCall('/api/club-arena/audit-trail', { action: 'export', clubId });
      if (res.csv) {
        const blob = new Blob([res.csv], { type: 'text/csv' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a'); a.href = url; a.download = `audit-log-${clubId.substring(0,8)}.csv`; a.click();
        URL.revokeObjectURL(url);
      }
    } catch (err) { alert('Export failed: ' + err.message); }
  };

  if (loading) return (
    <div style={{ animation: 'fadeIn 0.2s ease-out' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
        <div className={`${s.skeleton} ${s.skeletonText}`} style={{ width: '180px' }} />
        <div className={`${s.skeleton} ${s.skeletonText}`} style={{ width: '100px' }} />
      </div>
      {[1,2,3,4,5].map(i => <div key={i} className={`${s.skeleton} ${s.skeletonCard}`} />)}
    </div>
  );

  if (loadError) return (
    <div className={s.error} style={{ textAlign: 'center', padding: '40px' }}>
      <div style={{ marginBottom: '16px' }}>{loadError}</div>
      <button onClick={() => load(page)} className={s.btnPrimary} style={{ padding: '8px 24px' }}>↻ Retry</button>
    </div>
  );

  // Color coding by action type
  const typeColor = (t) => {
    if (t.includes('buyin') || t.includes('distribution')) return '#31A24C'; // inward
    if (t.includes('cashout') || t.includes('withdraw')) return '#FA383E'; // outward
    if (t.includes('fee') || t.includes('rake')) return '#F7C52A'; // system
    return '#E4E6EB';
  };

  return (
    <div style={{ animation: 'fadeIn 0.2s ease-out' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
        <h3 style={{ margin: 0, fontSize: '18px' }}>Security Audit Trail</h3>
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
          <button onClick={exportCSV} className={s.btnGhost} title="Export audit log as CSV">📥 Export</button>
          <span style={{ fontSize: '13px', color: '#B0B3B8', marginRight: '8px' }}>Total Logs: {fmt(data.total)}</span>
          <button onClick={() => setPage(Math.max(1, page - 1))} disabled={page === 1 || loading} className={s.btnGhost}>◀ Prev</button>
          <span style={{ fontSize: '14px', fontWeight: 600 }}>{page} / {data.totalPages || 1}</span>
          <button onClick={() => setPage(Math.min(data.totalPages, page + 1))} disabled={page >= data.totalPages || loading} className={s.btnGhost}>Next ▶</button>
        </div>
      </div>

      <div className={s.tableScroll}>
        <table className={s.dataTable}>
          <thead>
            <tr>
              <th>Timestamp</th>
              <th>Action Type</th>
              <th>User</th>
              <th>Target</th>
              <th style={{ textAlign: 'right' }}>Amount</th>
              <th>IP Address</th>
            </tr>
          </thead>
          <tbody>
            {(data.logs || []).map(l => (
              <tr key={l.id}>
                <td style={{ color: '#B0B3B8', fontSize: '12px' }}>{formatDate(l.created_at)}</td>
                <td style={{ color: typeColor(l.action_type), fontWeight: 600 }}>{toTitleCase(l.action_type)}</td>
                <td style={{ fontWeight: 500 }}>{l.userName}</td>
                <td style={{ color: '#94A3B8' }}>{l.targetUserName || '-'}</td>
                <td style={{ textAlign: 'right', fontWeight: 700, color: l.amount > 0 ? '#31A24C' : l.amount < 0 ? '#FA383E' : '#E4E6EB' }}>
                  {l.amount ? fmtChips(l.amount) : '-'}
                </td>
                <td style={{ fontFamily: 'monospace', fontSize: '11px', color: '#65676B' }}>{l.ip_address || '-'}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {loading && <div style={{ textAlign: 'center', padding: '20px', color: '#B0B3B8' }}>Loading more records...</div>}
      </div>
    </div>
  );
}

function BrandingTab({ clubId }) {
  const [theme, setTheme] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [loadError, setLoadError] = useState(null);
  const [saveSuccess, setSaveSuccess] = useState(false);

  const loadBranding = useCallback(async () => {
    try {
      setLoading(true);
      setLoadError(null);
      const res = await apiCall('/api/club-arena/club-branding', { action: 'get', clubId });
      setTheme(res.theme || {});
    } catch (err) {
      setLoadError(err.message || 'Failed to load branding');
    } finally {
      setLoading(false);
    }
  }, [clubId]);

  useEffect(() => { loadBranding(); }, [loadBranding]);

  const handleSave = async () => {
    try {
      setSaving(true);
      setSaveSuccess(false);
      await apiCall('/api/club-arena/club-branding', { action: 'save', clubId, theme });
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 3000);
    } catch (err) {
      alert('Failed to save: ' + err.message);
    } finally {
      setSaving(false);
    }
  };

  const update = (k, v) => setTheme(p => ({ ...p, [k]: v }));

  if (loading) return (
    <div style={{ animation: 'fadeIn 0.2s ease-out', maxWidth: '600px', margin: '0 auto' }}>
      <div className="ca-skeleton" style={{ height: '320px', borderRadius: '12px' }} />
    </div>
  );
  if (loadError || !theme) return (
    <div className={s.error} style={{ textAlign: 'center', padding: '40px' }}>
      <div style={{ fontSize: '32px', marginBottom: '12px' }}>🎨</div>
      <div style={{ marginBottom: '16px' }}>{loadError || 'Failed to load theme settings'}</div>
      <button onClick={loadBranding} className={s.btnPrimary} style={{ padding: '8px 24px' }}>↻ Retry</button>
    </div>
  );

  return (
    <div style={{ animation: 'fadeIn 0.2s ease-out', maxWidth: '600px', margin: '0 auto' }}>
      <div style={{ background: '#242526', padding: '32px', borderRadius: '12px', border: '1px solid #3A3B3C' }}>
        <h3 style={{ margin: '0 0 24px', fontSize: '20px', borderBottom: '1px solid #3E4042', paddingBottom: '12px' }}>Visual Identity</h3>
        
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '24px', marginBottom: '24px' }}>
          <div>
            <label style={{ display: 'block', fontSize: '13px', color: '#B0B3B8', marginBottom: '8px' }}>Primary Color</label>
            <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
              <input type="color" value={theme.primaryColor || '#2374E1'} onChange={e => update('primaryColor', e.target.value)} style={{ width: '40px', height: '40px', padding: '0', border: 'none', background: 'none', cursor: 'pointer' }} />
              <div style={{ fontFamily: 'monospace', background: '#18191A', padding: '8px', borderRadius: '6px', border: '1px solid #3E4042', flex: 1 }}>{theme.primaryColor || '#2374E1'}</div>
            </div>
          </div>
          <div>
            <label style={{ display: 'block', fontSize: '13px', color: '#B0B3B8', marginBottom: '8px' }}>Accent Color</label>
            <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
              <input type="color" value={theme.accentColor || '#31A24C'} onChange={e => update('accentColor', e.target.value)} style={{ width: '40px', height: '40px', padding: '0', border: 'none', background: 'none', cursor: 'pointer' }} />
              <div style={{ fontFamily: 'monospace', background: '#18191A', padding: '8px', borderRadius: '6px', border: '1px solid #3E4042', flex: 1 }}>{theme.accentColor || '#31A24C'}</div>
            </div>
          </div>
        </div>

        <h3 style={{ margin: '0 0 24px', fontSize: '20px', borderBottom: '1px solid #3E4042', paddingBottom: '12px', marginTop: '32px' }}>Table Defaults</h3>
        
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '24px', marginBottom: '32px' }}>
          <div>
            <label style={{ display: 'block', fontSize: '13px', color: '#B0B3B8', marginBottom: '8px' }}>Table Felt Style</label>
            <select value={theme.tableFelt || 'default'} onChange={e => update('tableFelt', e.target.value)} className={s.inputBox} style={{ width: '100%' }}>
              <option value="default">Default</option>
              <option value="green">Classic Green</option>
              <option value="blue">Royal Blue</option>
              <option value="red">Casino Red</option>
              <option value="purple">Vegas Purple</option>
              <option value="futuristic">Futuristic Dark</option>
            </select>
          </div>
          <div>
            <label style={{ display: 'block', fontSize: '13px', color: '#B0B3B8', marginBottom: '8px' }}>Chip Style</label>
            <select value={theme.chipStyle || 'default'} onChange={e => update('chipStyle', e.target.value)} className={s.inputBox} style={{ width: '100%' }}>
              <option value="default">Standard</option>
              <option value="classic">Retro Edge Spot</option>
              <option value="modern">Modern Minimal</option>
              <option value="neon">Neon Wireframe</option>
            </select>
          </div>
        </div>

        <button onClick={handleSave} disabled={saving} className={s.btnPrimary} style={{ width: '100%', padding: '14px', fontSize: '16px' }}>
          {saving ? 'Saving...' : saveSuccess ? '✅ Saved!' : 'Save Branding Identity'}
        </button>

        {/* Ownership Transfer */}
        <div style={{ marginTop: '32px', paddingTop: '24px', borderTop: '1px solid #3E4042' }}>
          <h4 style={{ margin: '0 0 12px', fontSize: '15px', color: '#FA383E' }}>⚠️ Danger Zone — Transfer Ownership</h4>
          <p style={{ fontSize: '12px', color: '#B0B3B8', marginBottom: '12px' }}>Transfer complete ownership of this club to another member. This action is irreversible — you will be demoted to admin.</p>
          <div style={{ display: 'flex', gap: '8px' }}>
            <input id="ownershipTarget" placeholder="New owner's User ID (UUID)" style={{ flex: 1, padding: '10px 12px', background: '#18191A', border: '1px solid #3A3B3C', borderRadius: '8px', color: '#E4E6EB', fontSize: '13px' }} />
            <button className={s.btnGhost} style={{ color: '#FA383E', borderColor: '#FA383E' }} onClick={async () => {
              const target = document.getElementById('ownershipTarget')?.value;
              if (!target) return alert('Enter the new owner\'s User ID');
              if (!confirm(`⚠️ IRREVERSIBLE: Transfer ownership to ${target.substring(0,8)}...? You will be demoted to admin.`)) return;
              if (!confirm('Are you absolutely sure? This cannot be undone.')) return;
              try {
                await apiCall('/api/club-arena/manage-agent', { clubId, action: 'transfer_ownership', targetUserId: target });
                alert('Ownership transferred successfully. Page will reload.');
                window.location.reload();
              } catch (err) { alert('Transfer failed: ' + err.message); }
            }}>🔑 Transfer</button>
          </div>
        </div>
      </div>
    </div>
  );
}

function SettlementHistoryTab({ clubId }) {
  const [periods, setPeriods] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      setLoadError(null);
      const res = await apiCall('/api/club-arena/settlement-history', { action: 'list', clubId, limit: 50 });
      setPeriods(res.periods || []);
    } catch (err) {
      setLoadError(err.message);
    } finally {
      setLoading(false);
    }
  }, [clubId]);

  useEffect(() => { load(); }, [load]);

  if (loading) return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
      {[1,2,3].map(i => <div key={i} className="ca-skeleton" style={{ height: '80px' }} />)}
    </div>
  );
  if (loadError) return (
    <div className={s.error} style={{ textAlign: 'center', padding: '40px' }}>
      <div style={{ marginBottom: '16px' }}>{loadError}</div>
      <button onClick={load} className={s.btnPrimary} style={{ padding: '8px 24px' }}>↻ Retry</button>
    </div>
  );

  return (
    <div style={{ animation: 'fadeIn 0.2s ease-out' }}>
      <h3 style={{ margin: '0 0 16px', fontSize: '18px' }}>📖 Settlement History</h3>
      {periods.length === 0 ? (
        <div className={s.emptyState} style={{ padding: '40px' }}>
          <span className={s.emptyIcon}>💰</span>
          <span className={s.emptyText}>No settlement history yet. Close your first period to see records here.</span>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          {periods.map(p => (
            <div key={p.id} style={{ background: '#242526', padding: '16px 20px', borderRadius: '12px', border: '1px solid #3A3B3C' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                <div style={{ fontWeight: 700, fontSize: '15px' }}>Period #{p.period_number} — Year {p.year}</div>
                <span style={{ fontSize: '11px', fontWeight: 700, padding: '3px 8px', borderRadius: '4px', background: p.status === 'open' ? 'rgba(49,162,76,0.15)' : '#3A3B3C', color: p.status === 'open' ? '#31A24C' : '#B0B3B8' }}>{p.status?.toUpperCase()}</span>
              </div>
              <div style={{ display: 'flex', gap: '24px', fontSize: '13px', color: '#B0B3B8', flexWrap: 'wrap' }}>
                <span>📅 {formatDate(p.start_at)} — {p.status === 'open' ? 'Now' : formatDate(p.end_at)}</span>
                {p.total_rake_collected != null && <span style={{ color: '#F7C52A', fontWeight: 600 }}>💰 Rake: {fmtChips(p.total_rake_collected)}</span>}
                {p.totalCommissions != null && <span style={{ color: '#31A24C', fontWeight: 600 }}>💸 Commissions: {fmtChips(p.totalCommissions)}</span>}
                {p.paidCount != null && <span>👥 {p.paidCount} paid / {p.pendingCount || 0} pending</span>}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Recommendations Tab ─────────────────────────────────────
function RecommendationsTab({ clubId }) {
  const [recs, setRecs] = useState([]);
  const [insights, setInsights] = useState(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      setLoadError(null);
      const res = await apiGet(`/api/club-arena/smart-recommendations?clubId=${clubId}`);
      setRecs(res.recommendations || []);
      setInsights(res.insights || null);
    } catch (err) {
      setLoadError(err.message);
    } finally {
      setLoading(false);
    }
  }, [clubId]);

  useEffect(() => { load(); }, [load]);

  const typeStyles = {
    success: { bg: 'rgba(49,162,76,0.1)', border: '#31A24C' },
    warning: { bg: 'rgba(245,166,35,0.1)', border: '#F5A623' },
    info:    { bg: 'rgba(69,153,255,0.1)', border: '#4599FF' },
  };

  if (loading) return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
      {[1,2,3].map(i => <div key={i} className={s.shimmerLine} style={{ height: '80px', borderRadius: '8px' }} />)}
    </div>
  );
  if (loadError) return (
    <div className={s.error} style={{ textAlign: 'center', padding: '40px' }}>
      <div style={{ marginBottom: '16px' }}>{loadError}</div>
      <button onClick={load} className={s.btnPrimary} style={{ padding: '8px 24px' }}>↻ Retry</button>
    </div>
  );

  return (
    <div style={{ animation: 'fadeIn 0.2s ease-out' }}>
      <h3 style={{ margin: '0 0 16px', fontSize: '18px' }}>🤖 Smart Recommendations</h3>

      {/* Insights Panel */}
      {insights && (
        <div className={s.statsGrid} style={{ marginBottom: '20px' }}>
          <div className={s.statCard}><div className={s.statValueGreen}>{fmt(insights.activeTables)}</div><div className={s.statLabel}>Active Tables</div></div>
          <div className={s.statCard}><div className={s.statValueBlue}>{fmt(insights.totalSeated)}</div><div className={s.statLabel}>Players Seated</div></div>
          <div className={s.statCard}><div className={s.statValue}>{fmt(insights.totalMembers)}</div><div className={s.statLabel}>Total Members</div></div>
          <div className={s.statCard}><div className={s.statValueGold}>{fmtChips(insights.avgChipBalance)}</div><div className={s.statLabel}>Avg Balance</div></div>
          <div className={s.statCard}><div className={s.statValueBlue}>{insights.peakHour}:00</div><div className={s.statLabel}>Peak Hour</div></div>
        </div>
      )}

      {/* Recommendation Cards */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
        {recs.map((rec, i) => {
          const st = typeStyles[rec.type] || typeStyles.info;
          return (
            <div key={i} style={{ background: st.bg, borderLeft: `4px solid ${st.border}`, borderRadius: '8px', padding: '16px 20px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '6px' }}>
                <div style={{ fontSize: '16px', fontWeight: 700, color: '#E4E6EB' }}>
                  {rec.icon} {rec.title}
                </div>
                <span style={{ fontSize: '11px', fontWeight: 600, color: '#B0B3B8', background: '#3A3B3C', padding: '2px 8px', borderRadius: '12px' }}>
                  P{rec.priority || 3}
                </span>
              </div>
              <div style={{ fontSize: '14px', color: '#B0B3B8', lineHeight: 1.5 }}>{rec.desc}</div>
            </div>
          );
        })}
      </div>

      <button onClick={load} className={s.btnGhost} style={{ marginTop: '16px' }}>↻ Re-analyze</button>
    </div>
  );
}

// ── Announcements Tab ───────────────────────────────────
function AnnouncementsTab({ clubId }) {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(null);
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      const res = await apiGet(`/api/club-arena/announcements?clubId=${clubId}`);
      setItems(res.announcements || []);
    } catch (err) { console.warn('[Announcements]', err.message); }
    finally { setLoading(false); }
  }, [clubId]);

  useEffect(() => { load(); }, [load]);

  const handleSave = async () => {
    if (!title.trim()) return;
    setSaving(true);
    try {
      if (editing) {
        await apiCall('/api/club-arena/announcements', { action: 'update', clubId, announcementId: editing.id, title, content });
      } else {
        await apiCall('/api/club-arena/announcements', { action: 'create', clubId, title, content });
      }
      setTitle(''); setContent(''); setEditing(null);
      load();
    } catch (err) { alert(err.message); }
    finally { setSaving(false); }
  };

  const handleDelete = async (id) => {
    if (!confirm('Delete this announcement?')) return;
    await apiCall('/api/club-arena/announcements', { action: 'delete', clubId, announcementId: id });
    load();
  };

  const handlePin = async (item) => {
    await apiCall('/api/club-arena/announcements', { action: 'update', clubId, announcementId: item.id, pinned: !item.pinned });
    load();
  };

  if (loading) return <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>{[1,2,3].map(i => <div key={i} className={s.shimmerLine} style={{ height: '60px', borderRadius: '8px' }} />)}</div>;

  return (
    <div style={{ animation: 'fadeIn 0.2s ease-out' }}>
      <h3 style={{ margin: '0 0 16px', fontSize: '18px' }}>📢 Announcements</h3>

      {/* Create / Edit Form */}
      <div style={{ background: '#242526', border: '1px solid #3A3B3C', borderRadius: '10px', padding: '16px', marginBottom: '16px' }}>
        <div style={{ fontSize: '14px', fontWeight: 600, marginBottom: '8px', color: '#E4E6EB' }}>{editing ? '✏️ Edit Announcement' : '➕ New Announcement'}</div>
        <input value={title} onChange={e => setTitle(e.target.value)} placeholder="Title" style={{ width: '100%', padding: '8px 12px', background: '#18191A', border: '1px solid #3A3B3C', borderRadius: '8px', color: '#E4E6EB', fontSize: '14px', marginBottom: '8px' }} />
        <textarea value={content} onChange={e => setContent(e.target.value)} placeholder="Content (optional)" rows={3} style={{ width: '100%', padding: '8px 12px', background: '#18191A', border: '1px solid #3A3B3C', borderRadius: '8px', color: '#E4E6EB', fontSize: '13px', resize: 'vertical' }} />
        <div style={{ display: 'flex', gap: '8px', marginTop: '8px', justifyContent: 'flex-end' }}>
          {editing && <button onClick={() => { setEditing(null); setTitle(''); setContent(''); }} className={s.btnGhost}>Cancel</button>}
          <button onClick={handleSave} className={s.btnPrimary} disabled={saving || !title.trim()}>{saving ? 'Saving...' : editing ? 'Update' : 'Publish'}</button>
        </div>
      </div>

      {/* List */}
      {items.length === 0 ? (
        <div className={s.emptyState}><span className={s.emptyIcon}>📢</span><span className={s.emptyText}>No announcements yet. Create one above.</span></div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {items.map(a => (
            <div key={a.id} style={{ background: a.pinned ? 'rgba(69,153,255,0.06)' : '#242526', border: `1px solid ${a.pinned ? 'rgba(69,153,255,0.25)' : '#3A3B3C'}`, borderRadius: '10px', padding: '14px 16px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 700, fontSize: '14px', color: '#E4E6EB' }}>{a.pinned ? '📌 ' : ''}{a.title}</div>
                  {a.content && <div style={{ fontSize: '13px', color: '#B0B3B8', marginTop: '4px', lineHeight: 1.4 }}>{a.content.substring(0, 300)}</div>}
                  <div style={{ fontSize: '11px', color: '#6B7280', marginTop: '6px' }}>{new Date(a.created_at).toLocaleDateString()}</div>
                </div>
                <div style={{ display: 'flex', gap: '4px', flexShrink: 0, marginLeft: '12px' }}>
                  <button onClick={() => handlePin(a)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '14px', padding: '4px' }} title={a.pinned ? 'Unpin' : 'Pin'}>{a.pinned ? '📌' : '📌'}</button>
                  <button onClick={() => { setEditing(a); setTitle(a.title); setContent(a.content || ''); }} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '14px', padding: '4px' }} title="Edit">✏️</button>
                  <button onClick={() => handleDelete(a.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '14px', padding: '4px' }} title="Delete">🗑️</button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Table Templates Tab ──────────────────────────────────
function TemplatesTab({ clubId }) {
  const [templates, setTemplates] = useState([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      const res = await apiCall('/api/club-arena/table-templates', { action: 'list', clubId });
      setTemplates(res.templates || []);
    } catch (err) { console.warn('[Templates]', err.message); }
    finally { setLoading(false); }
  }, [clubId]);

  useEffect(() => { load(); }, [load]);

  const handleDelete = async (id) => {
    if (!confirm('Delete this template?')) return;
    await apiCall('/api/club-arena/table-templates', { action: 'delete', clubId, templateId: id });
    load();
  };

  const toggleSchedule = async (tmpl) => {
    await apiCall('/api/club-arena/table-templates', { action: 'schedule', clubId, templateId: tmpl.id, scheduleEnabled: !tmpl.schedule_enabled });
    load();
  };

  const GAME_LABELS = { nlh: 'NLH', plo4: 'PLO4', plo5: 'PLO5', flh: 'FLH', nlh_bomb: 'Bomb Pot', nlh_6plus: '6+', sdh: 'Short Deck' };

  if (loading) return <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>{[1,2,3].map(i => <div key={i} className={s.shimmerLine} style={{ height: '70px', borderRadius: '8px' }} />)}</div>;

  return (
    <div style={{ animation: 'fadeIn 0.2s ease-out' }}>
      <h3 style={{ margin: '0 0 16px', fontSize: '18px' }}>📋 Table Templates</h3>

      {templates.length === 0 ? (
        <div className={s.emptyState}><span className={s.emptyIcon}>📋</span><span className={s.emptyText}>No saved templates. Create a table and save its config as a template.</span></div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          {templates.map(t => (
            <div key={t.id} style={{ background: '#242526', border: '1px solid #3A3B3C', borderRadius: '10px', padding: '14px 18px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                <div style={{ fontWeight: 700, fontSize: '15px', color: '#E4E6EB' }}>{t.name}</div>
                <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                  <span style={{ fontSize: '11px', color: '#B0B3B8', background: '#3A3B3C', padding: '2px 8px', borderRadius: '12px' }}>Used {t.use_count || 0}x</span>
                  <button onClick={() => toggleSchedule(t)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '14px', padding: '4px' }} title={t.schedule_enabled ? 'Disable schedule' : 'Enable schedule'}>{t.schedule_enabled ? '⏰' : '🕔'}</button>
                  <button onClick={() => handleDelete(t.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '14px', padding: '4px', color: '#FA383E' }} title="Delete">🗑️</button>
                </div>
              </div>
              <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                <span style={{ fontSize: '12px', background: '#3A3B3C', padding: '2px 8px', borderRadius: '8px', color: '#B0B3B8' }}>{GAME_LABELS[t.game_variant] || t.game_variant || 'NLH'}</span>
                <span style={{ fontSize: '12px', background: 'rgba(247,197,42,0.1)', padding: '2px 8px', borderRadius: '8px', color: '#F7C52A', fontWeight: 600 }}>{fmtChips(t.small_blind)}/{fmtChips(t.big_blind)}</span>
                <span style={{ fontSize: '12px', background: '#3A3B3C', padding: '2px 8px', borderRadius: '8px', color: '#B0B3B8' }}>{t.max_players} seats</span>
                <span style={{ fontSize: '12px', background: '#3A3B3C', padding: '2px 8px', borderRadius: '8px', color: '#B0B3B8' }}>Buy: {fmtChips(t.min_buy_in)}–{fmtChips(t.max_buy_in)}</span>
                {t.schedule_enabled && <span style={{ fontSize: '12px', background: 'rgba(49,162,76,0.1)', padding: '2px 8px', borderRadius: '8px', color: '#31A24C' }}>⏰ Scheduled</span>}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Club Analytics Tab ──────────────────────────────────
function AnalyticsTab({ clubId }) {
  const [analytics, setAnalytics] = useState(null);
  const [rakeReport, setRakeReport] = useState(null);
  const [period, setPeriod] = useState('7d');
  const [loading, setLoading] = useState(true);

  const load = useCallback(async (p) => {
    try {
      setLoading(true);
      const [dashRes, rakeRes] = await Promise.all([
        apiGet(`/api/club-arena/club-analytics?clubId=${clubId}`),
        apiGet(`/api/club-arena/club-analytics?clubId=${clubId}&action=rake_report&period=${p || period}`),
      ]);
      setAnalytics(dashRes.analytics || null);
      setRakeReport(rakeRes || null);
    } catch (err) { console.warn('[Analytics]', err.message); }
    finally { setLoading(false); }
  }, [clubId, period]);

  useEffect(() => { load(period); }, [period]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleExport = () => {
    window.open(`/api/club-arena/club-analytics?clubId=${clubId}&action=csv&period=${period}`, '_blank');
  };

  if (loading) return <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>{[1,2,3].map(i => <div key={i} className={s.shimmerLine} style={{ height: '70px', borderRadius: '8px' }} />)}</div>;

  const maxRake = rakeReport?.days ? Math.max(...rakeReport.days.map(d => d.rake), 1) : 1;

  return (
    <div style={{ animation: 'fadeIn 0.2s ease-out' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
        <h3 style={{ margin: 0, fontSize: '18px' }}>📊 Club Analytics</h3>
        <div style={{ display: 'flex', gap: '6px' }}>
          {['7d', '14d', '30d', '90d'].map(p => (
            <button key={p} onClick={() => setPeriod(p)} className={period === p ? s.btnPrimary : s.btnGhost} style={{ padding: '4px 12px', fontSize: '12px' }}>{p}</button>
          ))}
          <button onClick={handleExport} className={s.btnGhost} style={{ padding: '4px 12px', fontSize: '12px' }}>📄 CSV</button>
        </div>
      </div>

      {/* Dashboard Snapshot */}
      {analytics && (
        <div className={s.statsGrid} style={{ marginBottom: '20px' }}>
          <div className={s.statCard}><div className={s.statValueGreen}>{fmt(analytics.activeTables)}</div><div className={s.statLabel}>Active Tables</div></div>
          <div className={s.statCard}><div className={s.statValueBlue}>{fmt(analytics.seatedNow)}</div><div className={s.statLabel}>Seated Now</div></div>
          <div className={s.statCard}><div className={s.statValue}>{fmt(analytics.uniquePlayers24h)}</div><div className={s.statLabel}>Unique 24h</div></div>
          <div className={s.statCard}><div className={s.statValue}>{fmt(analytics.totalMembers)}</div><div className={s.statLabel}>Total Members</div></div>
          <div className={s.statCard}>
            <div className={s.statValueGold}>{fmtChips(analytics.todayRake)}</div>
            <div className={s.statLabel}>Today Rake</div>
            {analytics.rakeChange !== 0 && <div style={{ fontSize: '11px', color: analytics.rakeChange > 0 ? '#31A24C' : '#FA383E', marginTop: '2px' }}>{analytics.rakeChange > 0 ? '▲' : '▼'} {Math.abs(analytics.rakeChange)}% vs yesterday</div>}
          </div>
        </div>
      )}

      {/* 7-Day Sparkline Bar Chart */}
      {analytics?.sparkline && (
        <div className={s.section} style={{ marginBottom: '16px' }}>
          <div className={s.sectionTitle}>7-Day Rake Trend</div>
          <div style={{ display: 'flex', alignItems: 'flex-end', gap: '4px', height: '80px', padding: '8px 0' }}>
            {analytics.sparkline.map((val, i) => {
              const h = Math.max(4, (val / Math.max(...analytics.sparkline, 1)) * 70);
              const dayLabels = ['6d', '5d', '4d', '3d', '2d', '1d', 'Today'];
              return (
                <div key={i} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px' }}>
                  <div style={{ width: '100%', maxWidth: '32px', height: `${h}px`, background: i === 6 ? '#F7C52A' : '#4599FF', borderRadius: '4px 4px 0 0', transition: 'height 0.3s' }} title={`${fmtChips(val)} rake`} />
                  <span style={{ fontSize: '9px', color: '#6B7280' }}>{dayLabels[i]}</span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Rake Report Period Breakdown */}
      {rakeReport?.summary && (
        <div className={s.section}>
          <div className={s.sectionTitle}>Rake Report ({rakeReport.period})</div>
          <div className={s.statsGrid} style={{ marginBottom: '12px' }}>
            <div className={s.statCard}><div className={s.statValueGold}>{fmtChips(rakeReport.summary.totalRake)}</div><div className={s.statLabel}>Total Rake</div></div>
            <div className={s.statCard}><div className={s.statValueBlue}>{fmtChips(rakeReport.summary.avgDaily)}</div><div className={s.statLabel}>Avg Daily</div></div>
            <div className={s.statCard}><div className={s.statValueGreen}>{fmtChips(rakeReport.summary.peakAmount)}</div><div className={s.statLabel}>Peak ({rakeReport.summary.peakDay?.split('-').slice(1).join('/')})</div></div>
          </div>

          {/* Daily Bars */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', maxHeight: '300px', overflowY: 'auto' }}>
            {(rakeReport.days || []).map(d => (
              <div key={d.date} style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span style={{ fontSize: '11px', color: '#6B7280', width: '50px', flexShrink: 0 }}>{d.date.split('-').slice(1).join('/')}</span>
                <div style={{ flex: 1, height: '16px', background: '#3A3B3C', borderRadius: '3px', overflow: 'hidden' }}>
                  <div style={{ width: `${(d.rake / maxRake) * 100}%`, height: '100%', background: 'linear-gradient(90deg, #4599FF, #31A24C)', borderRadius: '3px' }} />
                </div>
                <span style={{ fontSize: '11px', color: '#B0B3B8', width: '60px', textAlign: 'right', flexShrink: 0 }}>{fmtChips(d.rake)}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Hierarchy Tree Tab ──────────────────────────────────────
function HierarchyTreeTab({ clubId }) {
  const [tree, setTree] = useState(null);
  const [loading, setLoading] = useState(true);
  const [expandedNodes, setExpandedNodes] = useState(new Set());
  const [stats, setStats] = useState({ total: 0, active: 0 });

  useEffect(() => {
    if (!clubId) return;
    (async () => {
      try {
        const data = await apiCall('/api/club-arena/agent-analytics', { clubId, action: 'hierarchy_tree' });
        setTree(data.tree || []);
        setStats({ total: data.totalAgents || 0, active: data.activeAgents || 0 });
      } catch (e) { console.error('Hierarchy load error:', e); }
      setLoading(false);
    })();
  }, [clubId]);

  const toggleExpand = (id) => {
    setExpandedNodes(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const expandAll = () => {
    const ids = new Set();
    const walk = (nodes) => { for (const n of nodes) { if (n.children?.length) { ids.add(n.id); walk(n.children); } } };
    walk(tree || []);
    setExpandedNodes(ids);
  };

  const roleColors = { super_agent: '#F7C52A', agent: '#4599FF', sub_agent: '#C084FC' };
  const roleLabels = { super_agent: '⭐ SUPER', agent: '👤 AGENT', sub_agent: '📎 SUB' };

  function TreeNode({ node, depth = 0 }) {
    const hasChildren = node.children?.length > 0;
    const isExpanded = expandedNodes.has(node.id);
    return (
      <div className={s.treeNode} style={{ paddingLeft: depth > 0 ? '24px' : '0' }}>
        <div className={s.treeNodeCard} onClick={() => hasChildren && toggleExpand(node.id)}>
          <div className={s.treeNodeAvatar}>
            {node.avatar ? <img src={node.avatar} alt="" /> : '👤'}
          </div>
          <div className={s.treeNodeInfo}>
            <div className={s.treeNodeName}>{node.name}</div>
            <div className={s.treeNodeMeta}>
              <span className={s.treeRoleBadge} style={{ background: `${roleColors[node.role] || '#4599FF'}22`, color: roleColors[node.role] || '#4599FF' }}>
                {roleLabels[node.role] || node.role}
              </span>
              <span>💰 {((node.commissionRate || 0) * 100).toFixed(0)}%</span>
              <span>👥 {node.playerCount}</span>
              {node.weeklyRake > 0 && <span>📊 {fmtChips(node.weeklyRake)} rake</span>}
              {node.status === 'suspended' && <span style={{ color: '#E41E3F' }}>⛔ suspended</span>}
            </div>
          </div>
          {hasChildren && (
            <button className={s.treeExpand} onClick={(e) => { e.stopPropagation(); toggleExpand(node.id); }}>
              {isExpanded ? '▾' : '▸'} {node.children.length}
            </button>
          )}
        </div>
        {hasChildren && isExpanded && (
          <div className={s.treeChildren}>
            {node.children.map(child => <TreeNode key={child.id} node={child} depth={depth + 1} />)}
          </div>
        )}
      </div>
    );
  }

  if (loading) return (
    <div className={s.section}>
      <div className={`${s.skeleton} ${s.skeletonCard}`} />
      <div className={`${s.skeleton} ${s.skeletonCard}`} />
      <div className={`${s.skeleton} ${s.skeletonCard}`} />
    </div>
  );

  return (
    <div>
      <div className={s.section}>
        <div className={s.sectionTitle} style={{ justifyContent: 'space-between' }}>
          <span>🌳 Agent Hierarchy ({stats.active} active / {stats.total} total)</span>
          <div style={{ display: 'flex', gap: '6px' }}>
            <button className={`${s.btnGhost} ${s.btnSmall}`} onClick={expandAll}>Expand All</button>
            <button className={`${s.btnGhost} ${s.btnSmall}`} onClick={() => setExpandedNodes(new Set())}>Collapse All</button>
          </div>
        </div>

        {(!tree || tree.length === 0) ? (
          <div className={s.emptyState}>
            <span className={s.emptyIcon}>🌱</span>
            <div className={s.emptyText}>No agents in this club yet</div>
            <button className={s.emptyCTA} onClick={() => window.location.href = `/hub/club-arena/players?club=${clubId}`}>
              ➕ Promote Your First Agent
            </button>
          </div>
        ) : (
          <div className={s.treeContainer}>
            {tree.map(node => <TreeNode key={node.id} node={node} />)}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Main Page Component ─────────────────────────────────────
export default function ClubArenaAdminPage() {
  useTrainingBus('club-arena-admin');
  const router = useRouter();

  const [clubId, setClubId] = useState(null);
  const [role, setRole] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  
  const [activeTab, setActiveTab] = useState('dashboard'); // dashboard | settlements | history | audit | branding

  useEffect(() => {
    let cancelled = false;
    let authSub = null;

    const init = async (session) => {
      if (cancelled) return;
      
      const qClub = router.query.club || router.query.clubId;
      const { supabase } = await import('../../../src/lib/supabase');
      let targetClub = qClub;
      
      // Auto-discover club if none in URL
      if (!targetClub) {
        // Find club where user is owner/admin
        const { data: mems } = await supabase.from('club_members').select('club_id, role').eq('user_id', session.user.id).in('role', ['owner', 'admin', 'manager']);
        if (mems && mems.length > 0) targetClub = mems[0].club_id;
      }
      
      if (targetClub && !cancelled) {
        setClubId(targetClub);
        // Verify role
        const { data: memRole } = await supabase.from('club_members').select('role').eq('club_id', targetClub).eq('user_id', session.user.id).maybeSingle();
        if (memRole) {
          setRole(memRole.role);
          if (!['owner', 'admin', 'manager'].includes(memRole.role)) {
            setError('ACCESS DENIED: Operations center requires Club Owner, Admin, or Manager privileges.');
          }
        } else {
          setError('ACCESS DENIED: Not a member of this club.');
        }
      } else if (!cancelled) {
        setError('No club found or selected.');
      }
      setLoading(false);
    };

    (async () => {
      const { supabase } = await import('../../../src/lib/supabase');
      const { data: { session } } = await supabase.auth.getSession();
      if (session) { await init(session); return; }

      const timeout = setTimeout(() => { if (!cancelled) { setError('login_required'); setLoading(false); } }, 3000);
      const { data: { subscription } } = supabase.auth.onAuthStateChange(async (_event, sess) => {
        clearTimeout(timeout);
        if (sess && !cancelled) await init(sess);
        else if (!cancelled) { setError('login_required'); setLoading(false); }
        subscription?.unsubscribe();
      });
      authSub = subscription;
    })();

    return () => { cancelled = true; authSub?.unsubscribe?.(); };
  }, [router.query.club, router.query.clubId]);

  if (loading) {
    return (
      <HubErrorBoundary name="Admin">
        <SEOHead title="Admin & Operations | Smarter.Poker" />
        <UniversalHeader />
        <div className={s.container}>
          <div className={s.inner} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            <div className="ca-skeleton" style={{ height: '48px' }} />
            <div style={{ display: 'flex', gap: '16px' }}>
              {[1,2,3,4].map(i => <div key={i} className="ca-skeleton" style={{ height: '36px', flex: 1 }} />)}
            </div>
            <div className="ca-skeleton" style={{ height: '300px' }} />
          </div>
        </div>
      </HubErrorBoundary>
    );
  }

  return (
    <HubErrorBoundary name="Admin">
      <SEOHead title="Admin & Operations | Smarter.Poker" />
      <UniversalHeader />

      <div className={s.container}>
        <div className={s.inner}>
          
          {error === 'login_required' ? (
            <div className={s.error} style={{ textAlign: 'center', padding: '40px 20px' }}>
              <div style={{ fontSize: '48px', marginBottom: '12px' }}>🔒</div>
              <div style={{ fontSize: '18px', fontWeight: 600, marginBottom: '8px' }}>Authentication Required</div>
              <button onClick={() => window.location.href = '/auth/login'} className={s.btnPrimary}>Log In</button>
            </div>
          ) : error ? (
            <div className={s.error} style={{ background: 'rgba(250,56,62,0.1)', border: '1px solid #FA383E', color: '#FA383E', padding: '24px', textAlign: 'center', borderRadius: '12px' }}>
              <div style={{ fontSize: '32px', marginBottom: '12px' }}>🛡️</div>
              <div style={{ fontWeight: 700, fontSize: '16px' }}>{error}</div>
            </div>
          ) : (
            <>
              {/* Header */}
              <div className={s.pageHeader}>
                <div className={s.pageTitle}>⚙️ Admin & Operations</div>
                <div className={s.headerActions}>
                  <Link href="/hub/club-arena/lobby" style={{ textDecoration: 'none' }}>
                    <button className={s.btnGhost}>🏠 Lobby</button>
                  </Link>
                </div>
              </div>

              {/* TABS */}
              <div className={s.tabs} style={{ paddingBottom: '16px', marginBottom: '24px', borderBottom: '1px solid #3A3B3C' }}>
                <button className={`${s.tab} ${activeTab === 'dashboard' ? s.tabActive : ''}`} onClick={() => setActiveTab('dashboard')}>🩺 Health</button>
                <button className={`${s.tab} ${activeTab === 'hierarchy' ? s.tabActive : ''}`} onClick={() => setActiveTab('hierarchy')}>🌳 Hierarchy</button>
                {['owner', 'admin'].includes(role) && (
                  <button className={`${s.tab} ${activeTab === 'settlements' ? s.tabActive : ''}`} onClick={() => setActiveTab('settlements')}>💰 Settlements</button>
                )}
                <button className={`${s.tab} ${activeTab === 'history' ? s.tabActive : ''}`} onClick={() => setActiveTab('history')}>📖 History</button>
                {['owner', 'admin'].includes(role) && (
                  <button className={`${s.tab} ${activeTab === 'audit' ? s.tabActive : ''}`} onClick={() => setActiveTab('audit')}>🛡️ Audit Trail</button>
                )}
                {role === 'owner' && (
                  <button className={`${s.tab} ${activeTab === 'branding' ? s.tabActive : ''}`} onClick={() => setActiveTab('branding')}>🎨 Branding</button>
                )}
                {['owner', 'admin'].includes(role) && (
                  <button className={`${s.tab} ${activeTab === 'recommendations' ? s.tabActive : ''}`} onClick={() => setActiveTab('recommendations')}>🤖 Recs</button>
                )}
                {['owner', 'admin'].includes(role) && (
                  <button className={`${s.tab} ${activeTab === 'announcements' ? s.tabActive : ''}`} onClick={() => setActiveTab('announcements')}>📢 Announce</button>
                )}
                {['owner', 'admin'].includes(role) && (
                  <button className={`${s.tab} ${activeTab === 'templates' ? s.tabActive : ''}`} onClick={() => setActiveTab('templates')}>📋 Templates</button>
                )}
                {['owner', 'admin'].includes(role) && (
                  <button className={`${s.tab} ${activeTab === 'analytics' ? s.tabActive : ''}`} onClick={() => setActiveTab('analytics')}>📊 Analytics</button>
                )}
              </div>

              {/* Tab Content */}
              {activeTab === 'dashboard' && <DashboardTab clubId={clubId} />}
              {activeTab === 'hierarchy' && <HierarchyTreeTab clubId={clubId} />}
              {activeTab === 'settlements' && <SettlementsTab clubId={clubId} />}
              {activeTab === 'history' && <SettlementHistoryTab clubId={clubId} />}
              {activeTab === 'audit' && <AuditLogTab clubId={clubId} />}
              {activeTab === 'branding' && <BrandingTab clubId={clubId} />}
              {activeTab === 'recommendations' && <RecommendationsTab clubId={clubId} />}
              {activeTab === 'announcements' && <AnnouncementsTab clubId={clubId} />}
              {activeTab === 'templates' && <TemplatesTab clubId={clubId} />}
              {activeTab === 'analytics' && <AnalyticsTab clubId={clubId} />}
            </>
          )}

        </div>
      </div>
    </HubErrorBoundary>
  );
}
