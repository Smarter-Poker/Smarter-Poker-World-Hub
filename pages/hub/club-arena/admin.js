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
import { apiCall } from '../../../src/lib/club-arena/apiClient';
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

  useEffect(() => {
    async function load() {
      try {
        const [hRes, sRes] = await Promise.all([
          apiCall('/api/club-arena/club-health', { action: 'score', clubId }),
          apiCall('/api/club-arena/audit-trail', { action: 'stats', clubId })
        ]);
        setHealth(hRes);
        setStats(sRes);
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [clubId]);

  if (loading) return <div className={s.loading}>Loading Dashboard...</div>;
  if (!health) return <div className={s.error}>Failed to load health metrics</div>;

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

  if (loading) return <div className={s.loading}>Loading Settlements...</div>;
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
              {data.pendingCommissions.map(c => (
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

  const load = useCallback(async (p) => {
    try {
      setLoading(true);
      const res = await apiCall('/api/club-arena/audit-trail', { action: 'list', clubId, page: p, pageSize: 50 });
      setData(res);
      setPage(res.page);
    } catch (err) {
      alert(err.message);
    } finally {
      setLoading(false);
    }
  }, [clubId]);

  useEffect(() => { load(page); }, [load, page]);

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
          <span style={{ fontSize: '13px', color: '#B0B3B8', marginRight: '8px' }}>Total Logs: {fmt(data.total)}</span>
          <button onClick={() => load(Math.max(1, page - 1))} disabled={page === 1 || loading} className={s.btnGhost}>◀ Prev</button>
          <span style={{ fontSize: '14px', fontWeight: 600 }}>{page} / {data.totalPages || 1}</span>
          <button onClick={() => load(Math.min(data.totalPages, page + 1))} disabled={page >= data.totalPages || loading} className={s.btnGhost}>Next ▶</button>
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

  useEffect(() => {
    async function load() {
      try {
        const res = await apiCall('/api/club-arena/club-branding', { action: 'get', clubId });
        setTheme(res.theme || {});
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [clubId]);

  const handleSave = async () => {
    try {
      setSaving(true);
      await apiCall('/api/club-arena/club-branding', { action: 'save', clubId, theme });
      alert('Club branding updated successfully!');
    } catch (err) {
      alert('Failed to save: ' + err.message);
    } finally {
      setSaving(false);
    }
  };

  const update = (k, v) => setTheme(p => ({ ...p, [k]: v }));

  if (loading) return <div className={s.loading}>Loading Theme Settings...</div>;
  if (!theme) return null;

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
          {saving ? 'Saving...' : 'Save Branding Identity'}
        </button>
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
  
  const [activeTab, setActiveTab] = useState('dashboard'); // dashboard | settlements | audit | branding

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
          if (!['owner', 'admin'].includes(memRole.role)) {
            setError('ACCESS DENIED: Operations center requires Club Owner or Admin privileges.');
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
        <div className={s.container}><div className={s.loading}>Initializing Security Module...</div></div>
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
                <button className={`${s.tab} ${activeTab === 'settlements' ? s.tabActive : ''}`} onClick={() => setActiveTab('settlements')}>💰 Settlements</button>
                <button className={`${s.tab} ${activeTab === 'audit' ? s.tabActive : ''}`} onClick={() => setActiveTab('audit')}>🛡️ Audit Trail</button>
                <button className={`${s.tab} ${activeTab === 'branding' ? s.tabActive : ''}`} onClick={() => setActiveTab('branding')}>🎨 Branding</button>
              </div>

              {/* Tab Content */}
              {activeTab === 'dashboard' && <DashboardTab clubId={clubId} />}
              {activeTab === 'settlements' && <SettlementsTab clubId={clubId} />}
              {activeTab === 'audit' && <AuditLogTab clubId={clubId} />}
              {activeTab === 'branding' && <BrandingTab clubId={clubId} />}
            </>
          )}

        </div>
      </div>
    </HubErrorBoundary>
  );
}
