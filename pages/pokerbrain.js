/**
 * Poker Brain Dashboard -- smarter.poker/pokerbrain
 * Full stats dashboard, session history, hand review, and settings.
 */
import { useState, useEffect, useCallback, useMemo } from 'react';
import dynamic from 'next/dynamic';
import supabase from '../src/lib/supabase';
import BottomNavBar from '../src/components/ui/BottomNavBar';

const getSupabase = () => typeof window !== 'undefined' ? supabase : null;

const SUIT_DISPLAY = {
  s: { glyph: '\u2660', color: '#1a1a2e' },
  h: { glyph: '\u2665', color: '#dc2626' },
  d: { glyph: '\u2666', color: '#2563eb' },
  c: { glyph: '\u2663', color: '#16a34a' },
};

function MiniCard({ rank, suit }) {
  const sd = SUIT_DISPLAY[suit] || SUIT_DISPLAY.s;
  return (
    <span className="inline-flex items-center font-mono font-bold text-sm" style={{ color: sd.color }}>
      {rank}{sd.glyph}
    </span>
  );
}

function StatBox({ label, value, sub }) {
  return (
    <div className="bg-slate-800 rounded-xl p-4 text-center">
      <div className="text-2xl font-black text-white">{value}</div>
      <div className="text-xs text-slate-400 mt-1">{label}</div>
      {sub && <div className="text-[10px] text-slate-500 mt-0.5">{sub}</div>}
    </div>
  );
}

function EquityBar({ value, max = 100 }) {
  const pct = Math.min(100, Math.max(0, (value / max) * 100));
  const color = pct > 60 ? '#10b981' : pct > 40 ? '#f59e0b' : '#ef4444';
  return (
    <div className="w-full h-2 bg-slate-700 rounded-full overflow-hidden">
      <div className="h-full rounded-full transition-all" style={{ width: pct + '%', backgroundColor: color }} />
    </div>
  );
}

// ─── Tab components ───────────────────────────────────────────────
function OverviewTab({ stats, loading }) {
  if (loading) return <div className="text-center text-slate-400 py-12">Loading stats...</div>;
  if (!stats) return <div className="text-center text-slate-500 py-12">No data yet. Start a Poker Brain session to see your stats.</div>;

  return (
    <div className="space-y-6">
      {/* Top stat cards */}
      <div className="grid grid-cols-2 gap-3">
        <StatBox label="Total Hands" value={stats.totalHands || 0} />
        <StatBox label="Sessions" value={stats.totalSessions || 0} />
        <StatBox label="Avg Equity" value={(stats.avgEquity || 0).toFixed(1) + '%'} />
        <StatBox label="Decisions Followed" value={
          stats.decisionsFollowed?.total > 0
            ? Math.round((stats.decisionsFollowed.followed / stats.decisionsFollowed.total) * 100) + '%'
            : '--'
        } sub={stats.decisionsFollowed?.total > 0 ? `${stats.decisionsFollowed.followed} / ${stats.decisionsFollowed.total}` : null} />
      </div>

      {/* Position breakdown */}
      {stats.byPosition && Object.keys(stats.byPosition).length > 0 && (
        <div className="bg-slate-800 rounded-xl p-4">
          <h3 className="text-sm font-bold text-white mb-3">By Position</h3>
          <div className="space-y-2">
            {Object.entries(stats.byPosition).map(([pos, data]) => (
              <div key={pos} className="flex items-center gap-3">
                <span className="text-xs text-slate-400 w-16 uppercase">{pos}</span>
                <div className="flex-1"><EquityBar value={data.avgEquity} /></div>
                <span className="text-xs text-slate-300 w-12 text-right">{data.avgEquity.toFixed(1)}%</span>
                <span className="text-[10px] text-slate-500 w-10 text-right">{data.hands}h</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Street breakdown */}
      {stats.byStreet && Object.keys(stats.byStreet).length > 0 && (
        <div className="bg-slate-800 rounded-xl p-4">
          <h3 className="text-sm font-bold text-white mb-3">By Street</h3>
          <div className="space-y-2">
            {Object.entries(stats.byStreet).map(([street, data]) => (
              <div key={street} className="flex items-center gap-3">
                <span className="text-xs text-slate-400 w-16 capitalize">{street}</span>
                <div className="flex-1"><EquityBar value={data.avgEquity} /></div>
                <span className="text-xs text-slate-300 w-12 text-right">{data.avgEquity.toFixed(1)}%</span>
                <span className="text-[10px] text-slate-500 w-10 text-right">{data.hands}h</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Equity distribution */}
      {stats.equityDistribution && stats.equityDistribution.length > 0 && (
        <div className="bg-slate-800 rounded-xl p-4">
          <h3 className="text-sm font-bold text-white mb-3">Equity Distribution</h3>
          <div className="flex items-end gap-1 h-24">
            {stats.equityDistribution.map((bucket, i) => {
              const max = Math.max(...stats.equityDistribution.map(b => b.count), 1);
              const h = (bucket.count / max) * 100;
              return (
                <div key={i} className="flex-1 flex flex-col items-center gap-1">
                  <div
                    className="w-full rounded-t"
                    style={{
                      height: h + '%',
                      minHeight: bucket.count > 0 ? '4px' : '0',
                      backgroundColor: i < 3 ? '#ef4444' : i < 6 ? '#f59e0b' : '#10b981',
                    }}
                  />
                  <span className="text-[8px] text-slate-500">{bucket.range}</span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Variant breakdown */}
      {stats.byVariant && Object.keys(stats.byVariant).length > 0 && (
        <div className="bg-slate-800 rounded-xl p-4">
          <h3 className="text-sm font-bold text-white mb-3">Variants Played</h3>
          <div className="flex flex-wrap gap-2">
            {Object.entries(stats.byVariant).map(([v, count]) => (
              <span key={v} className="bg-slate-700 text-slate-300 text-xs px-3 py-1 rounded-full">
                {v.toUpperCase()} ({count} sessions)
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function SessionsTab({ userId }) {
  const [sessions, setSessions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [expandedSession, setExpandedSession] = useState(null);
  const [sessionHands, setSessionHands] = useState([]);

  const fetchSessions = useCallback(async (pg) => {
    setLoading(true);
    try {
      const sb = getSupabase();
      if (!sb) return;
      const { data: { session } } = await sb.auth.getSession();
      if (!session?.access_token) return;

      const resp = await fetch(`/api/poker-brain/sessions?page=${pg}&limit=15`, {
        headers: { Authorization: `Bearer ${session.access_token}` }
      });
      const json = await resp.json();
      if (json.sessions) {
        setSessions(json.sessions);
        setTotal(json.total || 0);
      }
    } catch (e) {
      console.error('[PokerBrain] sessions fetch error:', e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchSessions(page); }, [page, fetchSessions]);

  const loadSessionDetail = useCallback(async (id) => {
    if (expandedSession === id) { setExpandedSession(null); return; }
    setExpandedSession(id);
    try {
      const sb = getSupabase();
      const { data: { session } } = await sb.auth.getSession();
      const resp = await fetch(`/api/poker-brain/session/${id}`, {
        headers: { Authorization: `Bearer ${session.access_token}` }
      });
      const json = await resp.json();
      setSessionHands(json.hands || []);
    } catch (e) {
      console.error('[PokerBrain] session detail error:', e);
      setSessionHands([]);
    }
  }, [expandedSession]);

  if (loading) return <div className="text-center text-slate-400 py-12">Loading sessions...</div>;
  if (sessions.length === 0) return <div className="text-center text-slate-500 py-12">No sessions yet.</div>;

  return (
    <div className="space-y-3">
      {sessions.map(s => (
        <div key={s.id} className="bg-slate-800 rounded-xl overflow-hidden">
          <button
            onClick={() => loadSessionDetail(s.id)}
            className="w-full text-left p-4 hover:bg-slate-750 transition-colors"
          >
            <div className="flex items-center justify-between">
              <div>
                <span className="text-sm font-bold text-white">{(s.game_type || 'nlhe').toUpperCase()}</span>
                <span className="text-xs text-slate-400 ml-2">{s.player_count || 6} players</span>
              </div>
              <div className="text-right">
                <div className="text-xs text-slate-400">{new Date(s.started_at).toLocaleDateString()}</div>
                <div className="text-[10px] text-slate-500">{s.hands_played} hands</div>
              </div>
            </div>
          </button>
          {expandedSession === s.id && sessionHands.length > 0 && (
            <div className="border-t border-slate-700 p-3 space-y-2 max-h-64 overflow-y-auto">
              {sessionHands.map((h, i) => (
                <div key={h.id || i} className="flex items-center gap-2 text-xs bg-slate-900 rounded-lg px-3 py-2">
                  <span className="text-slate-500 w-6">#{i + 1}</span>
                  <div className="flex gap-0.5">
                    {(h.hole_cards || []).map((c, ci) => (
                      <MiniCard key={ci} rank={c.rank || c[0]} suit={c.suit || c[1]} />
                    ))}
                  </div>
                  {h.board && h.board.length > 0 && (
                    <>
                      <span className="text-slate-600">|</span>
                      <div className="flex gap-0.5">
                        {h.board.map((c, ci) => (
                          <MiniCard key={ci} rank={c.rank || c[0]} suit={c.suit || c[1]} />
                        ))}
                      </div>
                    </>
                  )}
                  <span className="ml-auto text-slate-400">{h.street || '--'}</span>
                  {h.equity != null && <span className="text-emerald-400">{Math.round(h.equity)}%</span>}
                  {h.action_taken && (
                    <span className={
                      h.action_taken === 'FOLD' ? 'text-red-400' :
                      h.action_taken === 'RAISE' ? 'text-amber-400' :
                      'text-blue-400'
                    }>{h.action_taken}</span>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      ))}

      {/* Pagination */}
      {total > 15 && (
        <div className="flex justify-center gap-2 pt-2">
          <button
            onClick={() => setPage(p => Math.max(1, p - 1))}
            disabled={page === 1}
            className="text-xs px-3 py-1 rounded bg-slate-700 text-white disabled:opacity-30"
          >Prev</button>
          <span className="text-xs text-slate-400 py-1">Page {page} of {Math.ceil(total / 15)}</span>
          <button
            onClick={() => setPage(p => p + 1)}
            disabled={page >= Math.ceil(total / 15)}
            className="text-xs px-3 py-1 rounded bg-slate-700 text-white disabled:opacity-30"
          >Next</button>
        </div>
      )}
    </div>
  );
}

function SettingsTab({ userId }) {
  const [profiles, setProfiles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [migrating, setMigrating] = useState(false);
  const [migrateResult, setMigrateResult] = useState(null);

  const fetchProfiles = useCallback(async () => {
    try {
      const sb = getSupabase();
      const { data: { session } } = await sb.auth.getSession();
      const resp = await fetch('/api/poker-brain/calibration', {
        headers: { Authorization: `Bearer ${session.access_token}` }
      });
      const json = await resp.json();
      setProfiles(json.profiles || []);
    } catch (e) {
      console.error('[PokerBrain] calibration fetch error:', e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchProfiles(); }, [fetchProfiles]);

  const saveCurrentCalibration = useCallback(async () => {
    try {
      const overrides = localStorage.getItem('pokerBrain.layoutOverrides.v1');
      if (!overrides) { alert('No local calibration data found.'); return; }
      const sb = getSupabase();
      const { data: { session } } = await sb.auth.getSession();
      const name = prompt('Name this calibration profile:');
      if (!name) return;
      const device = navigator.userAgent.includes('Mac') ? 'Mac' : navigator.userAgent.includes('Win') ? 'Windows' : 'Device';
      await fetch('/api/poker-brain/calibration', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`
        },
        body: JSON.stringify({ name, device_name: device, overrides })
      });
      fetchProfiles();
    } catch (e) {
      console.error('[PokerBrain] save calibration error:', e);
    }
  }, [fetchProfiles]);

  const loadProfile = useCallback((overrides) => {
    localStorage.setItem('pokerBrain.layoutOverrides.v1', typeof overrides === 'string' ? overrides : JSON.stringify(overrides));
    alert('Calibration profile loaded. Restart Poker Brain to apply.');
  }, []);

  const runMigration = useCallback(async (dryRun) => {
    setMigrating(true);
    setMigrateResult(null);
    try {
      const sb = getSupabase();
      const { data: { session } } = await sb.auth.getSession();
      const resp = await fetch('/api/poker-brain/migrate-equities', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`
        },
        body: JSON.stringify({ dryRun, batchSize: 200 })
      });
      const json = await resp.json();
      setMigrateResult(json);
    } catch (e) {
      setMigrateResult({ error: e.message });
    } finally {
      setMigrating(false);
    }
  }, []);

  return (
    <div className="space-y-6">
      {/* Calibration Profiles */}
      <div className="bg-slate-800 rounded-xl p-4">
        <h3 className="text-sm font-bold text-white mb-3">Calibration Profiles</h3>
        <p className="text-xs text-slate-400 mb-3">
          Save your current calibration to the cloud so you can load it on other devices.
        </p>
        <button
          onClick={saveCurrentCalibration}
          className="text-xs bg-blue-600 hover:bg-blue-500 text-white px-4 py-2 rounded-lg font-bold mb-3"
        >
          Save Current Calibration
        </button>
        {loading ? (
          <div className="text-xs text-slate-500">Loading profiles...</div>
        ) : profiles.length === 0 ? (
          <div className="text-xs text-slate-500">No saved profiles yet.</div>
        ) : (
          <div className="space-y-2">
            {profiles.map(p => (
              <div key={p.id} className="flex items-center justify-between bg-slate-900 rounded-lg px-3 py-2">
                <div>
                  <div className="text-xs text-white font-bold">{p.name}</div>
                  <div className="text-[10px] text-slate-500">{p.device_name} -- {new Date(p.updated_at || p.created_at).toLocaleDateString()}</div>
                </div>
                <button
                  onClick={() => loadProfile(p.overrides)}
                  className="text-[10px] bg-slate-700 hover:bg-slate-600 text-white px-2 py-1 rounded"
                >
                  Load
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Equity Migration */}
      <div className="bg-slate-800 rounded-xl p-4">
        <h3 className="text-sm font-bold text-white mb-3">Equity Recomputation</h3>
        <p className="text-xs text-slate-400 mb-3">
          Recompute equity values for hands stored under older engine versions.
          Run a dry run first to see how many hands need updating.
        </p>
        <div className="flex gap-2">
          <button
            onClick={() => runMigration(true)}
            disabled={migrating}
            className="text-xs bg-slate-700 hover:bg-slate-600 text-white px-3 py-2 rounded-lg font-bold disabled:opacity-40"
          >
            {migrating ? 'Running...' : 'Dry Run'}
          </button>
          <button
            onClick={() => runMigration(false)}
            disabled={migrating}
            className="text-xs bg-amber-600 hover:bg-amber-500 text-white px-3 py-2 rounded-lg font-bold disabled:opacity-40"
          >
            {migrating ? 'Running...' : 'Run Migration'}
          </button>
        </div>
        {migrateResult && (
          <pre className="mt-3 text-[10px] text-slate-300 bg-slate-900 rounded p-2 overflow-x-auto">
            {JSON.stringify(migrateResult, null, 2)}
          </pre>
        )}
      </div>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────
export default function PokerBrainDashboard() {
  const [user, setUser] = useState(null);
  const [activeTab, setActiveTab] = useState('overview');
  const [stats, setStats] = useState(null);
  const [statsLoading, setStatsLoading] = useState(true);
  const [period, setPeriod] = useState('30d');

  useEffect(() => {
    const sb = getSupabase();
    if (!sb) return;
    sb.auth.getUser().then(({ data }) => { if (data?.user) setUser(data.user); });
  }, []);

  const fetchStats = useCallback(async () => {
    setStatsLoading(true);
    try {
      const sb = getSupabase();
      const { data: { session } } = await sb.auth.getSession();
      if (!session?.access_token) return;
      const resp = await fetch(`/api/poker-brain/stats?period=${period}`, {
        headers: { Authorization: `Bearer ${session.access_token}` }
      });
      const json = await resp.json();
      if (!json.error) setStats(json);
    } catch (e) {
      console.error('[PokerBrain] stats fetch error:', e);
    } finally {
      setStatsLoading(false);
    }
  }, [period]);

  useEffect(() => { if (user) fetchStats(); }, [user, fetchStats]);

  const tabs = [
    { id: 'overview', label: 'Overview' },
    { id: 'sessions', label: 'Sessions' },
    { id: 'settings', label: 'Settings' },
  ];

  if (!user) {
    return (
      <div className="min-h-screen bg-slate-950 text-white flex items-center justify-center">
        <div className="text-center">
          <h1 className="text-2xl font-black mb-2">Poker Brain</h1>
          <p className="text-slate-400">Sign in to access your Poker Brain dashboard.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-950 text-white pb-24">
      {/* Header */}
      <div className="sticky top-0 z-30 bg-slate-950/95 backdrop-blur border-b border-slate-800">
        <div className="max-w-lg mx-auto px-4 py-3">
          <div className="flex items-center justify-between mb-3">
            <h1 className="text-lg font-black text-white">Poker Brain</h1>
            <select
              value={period}
              onChange={(e) => setPeriod(e.target.value)}
              className="text-xs bg-slate-800 text-slate-300 border border-slate-700 rounded px-2 py-1"
            >
              <option value="7d">Last 7 days</option>
              <option value="30d">Last 30 days</option>
              <option value="90d">Last 90 days</option>
              <option value="all">All time</option>
            </select>
          </div>
          <div className="flex gap-1">
            {tabs.map(tab => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={
                  'text-xs font-bold px-4 py-2 rounded-lg transition-colors ' +
                  (activeTab === tab.id
                    ? 'bg-blue-600 text-white'
                    : 'bg-slate-800 text-slate-400 hover:bg-slate-700')
                }
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-lg mx-auto px-4 py-4">
        {activeTab === 'overview' && <OverviewTab stats={stats} loading={statsLoading} />}
        {activeTab === 'sessions' && <SessionsTab userId={user.id} />}
        {activeTab === 'settings' && <SettingsTab userId={user.id} />}
      </div>

      <BottomNavBar />
    </div>
  );
}
