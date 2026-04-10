/**
 * Poker Brain Dashboard -- smarter.poker/pokerbrain
 * Full stats dashboard, session history, hand review, and settings.
 */
import { useState, useEffect, useCallback, useMemo } from 'react';
import dynamic from 'next/dynamic';
import supabase from '../src/lib/supabase';
import BottomNavBar from '../src/components/ui/BottomNavBar';
import { analyzeSession, analyzeHand } from '../src/lib/poker-brain/session-audit';

// Lazy-load the HUD launcher — it uses getDisplayMedia (browser-only)
const PokerBrainLaunchButton = dynamic(
  () => import('../src/components/poker-brain/LaunchButton'),
  { ssr: false }
);

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

// ─── Session Audit Display ────────────────────────────────────────
function SessionAuditPanel({ hands }) {
  const audit = useMemo(() => {
    if (!hands || hands.length === 0) return null;
    // Transform DB hand rows into the format session-audit expects
    const mapped = hands.map(h => ({
      handId: h.id,
      streetDecisions: h.street_decisions || {},
      position: h.position || 'unknown',
      gameType: h.game_type || 'nlhe',
      bigBlind: h.big_blind || 0,
      holeCards: h.hole_cards || [],
      finalBoard: h.board || [],
    }));
    return analyzeSession(mapped);
  }, [hands]);

  if (!audit || audit.handsAnalyzed === 0) {
    return (
      <div className="bg-slate-900/60 rounded-lg p-3 text-xs text-slate-500">
        No decision data available for audit. Play with Poker Brain active to record per-street decisions.
      </div>
    );
  }

  const gradeColor = {
    A: '#10b981', B: '#34d399', C: '#f59e0b', D: '#f97316', F: '#ef4444',
  };

  return (
    <div className="space-y-3">
      {/* Grade + Score */}
      <div className="bg-slate-900 rounded-lg p-4 flex items-center gap-4">
        <div className="text-center">
          <div className="text-4xl font-black" style={{ color: gradeColor[audit.grade] || '#94a3b8' }}>
            {audit.grade}
          </div>
          <div className="text-[10px] text-slate-500">Session Grade</div>
        </div>
        <div className="flex-1 space-y-1">
          <div className="flex justify-between text-xs">
            <span className="text-slate-400">Score</span>
            <span className="text-white font-bold">{audit.overallScore}/100</span>
          </div>
          <div className="w-full h-2 bg-slate-700 rounded-full overflow-hidden">
            <div
              className="h-full rounded-full"
              style={{
                width: audit.overallScore + '%',
                backgroundColor: gradeColor[audit.grade] || '#94a3b8',
              }}
            />
          </div>
          <div className="text-[10px] text-slate-500">
            {audit.handsAnalyzed} of {audit.totalHands} hands analyzed
          </div>
        </div>
      </div>

      {/* Leaks */}
      {audit.leaks.length > 0 && (
        <div className="bg-slate-900 rounded-lg p-3">
          <h4 className="text-xs font-bold text-red-400 mb-2">Identified Leaks</h4>
          <div className="space-y-2">
            {audit.leaks.map((leak, i) => (
              <div key={i} className="bg-slate-800 rounded-lg p-2">
                <div className="flex items-center gap-2 mb-1">
                  <span className={
                    'text-[10px] font-bold px-1.5 py-0.5 rounded ' +
                    (leak.severity === 'high' ? 'bg-red-900 text-red-300' : 'bg-amber-900 text-amber-300')
                  }>
                    {leak.severity.toUpperCase()}
                  </span>
                  <span className="text-xs text-slate-300 font-bold">{leak.type.replace(/-/g, ' ')}</span>
                </div>
                <p className="text-[11px] text-slate-400">{leak.description}</p>
                <p className="text-[10px] text-blue-400 mt-1">Fix: {leak.fix}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Street Breakdown */}
      {Object.keys(audit.streetBreakdown).length > 0 && (
        <div className="bg-slate-900 rounded-lg p-3">
          <h4 className="text-xs font-bold text-slate-300 mb-2">Street Scores</h4>
          <div className="grid grid-cols-4 gap-2">
            {['preflop', 'flop', 'turn', 'river'].map(street => {
              const data = audit.streetBreakdown[street];
              if (!data) return null;
              const c = data.avgScore >= 70 ? '#10b981' : data.avgScore >= 50 ? '#f59e0b' : '#ef4444';
              return (
                <div key={street} className="text-center bg-slate-800 rounded-lg p-2">
                  <div className="text-lg font-black" style={{ color: c }}>{data.avgScore}</div>
                  <div className="text-[9px] text-slate-500 capitalize">{street}</div>
                  <div className="text-[8px] text-slate-600">{data.hands}h</div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Position Breakdown */}
      {Object.keys(audit.positionBreakdown).length > 0 && (
        <div className="bg-slate-900 rounded-lg p-3">
          <h4 className="text-xs font-bold text-slate-300 mb-2">Position Scores</h4>
          <div className="flex flex-wrap gap-2">
            {Object.entries(audit.positionBreakdown).map(([pos, data]) => {
              const c = data.avgScore >= 70 ? '#10b981' : data.avgScore >= 50 ? '#f59e0b' : '#ef4444';
              return (
                <div key={pos} className="bg-slate-800 rounded-lg px-3 py-2 text-center">
                  <div className="text-sm font-black" style={{ color: c }}>{data.avgScore}</div>
                  <div className="text-[9px] text-slate-500 uppercase">{pos}</div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Recommendations */}
      {audit.recommendations.length > 0 && (
        <div className="bg-slate-900 rounded-lg p-3">
          <h4 className="text-xs font-bold text-blue-400 mb-2">Recommendations</h4>
          <div className="space-y-1">
            {audit.recommendations.map((rec, i) => (
              <p key={i} className="text-[11px] text-slate-400">- {rec}</p>
            ))}
          </div>
        </div>
      )}

      {/* Worst Hands Review */}
      {audit.handReviews.filter(r => r.score !== null && r.score < 50).length > 0 && (
        <div className="bg-slate-900 rounded-lg p-3">
          <h4 className="text-xs font-bold text-amber-400 mb-2">Hands to Review (Lowest Scored)</h4>
          <div className="space-y-1.5 max-h-48 overflow-y-auto">
            {audit.handReviews.filter(r => r.score !== null && r.score < 50).slice(0, 10).map((review, i) => (
              <div key={i} className="flex items-center gap-2 bg-slate-800 rounded-lg px-2 py-1.5 text-[11px]">
                <span className="font-black w-8" style={{ color: gradeColor[review.grade] || '#94a3b8' }}>
                  {review.grade}
                </span>
                <span className="text-slate-500 w-6">{review.score}</span>
                <div className="flex gap-0.5">
                  {(review.holeCards || []).map((c, ci) => (
                    <MiniCard key={ci} rank={c.rank || c[0]} suit={c.suit || c[1]} />
                  ))}
                </div>
                <span className="text-slate-500 uppercase text-[9px]">{review.position}</span>
                {review.mistakes.length > 0 && (
                  <span className="text-red-400 text-[9px] ml-auto">
                    {review.mistakes.map(m => m.street).join(', ')}
                  </span>
                )}
              </div>
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
            <div className="border-t border-slate-700 p-3 space-y-3">
              {/* Session Audit Analysis */}
              <SessionAuditPanel hands={sessionHands} />

              {/* Raw Hand List */}
              <details className="bg-slate-900 rounded-lg">
                <summary className="text-xs text-slate-400 font-bold px-3 py-2 cursor-pointer hover:text-white">
                  All Hands ({sessionHands.length})
                </summary>
                <div className="space-y-1 px-3 pb-3 max-h-64 overflow-y-auto">
                  {sessionHands.map((h, i) => (
                    <div key={h.id || i} className="flex items-center gap-2 text-xs bg-slate-800 rounded-lg px-3 py-2">
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
                      {/* Per-street decision audit inline */}
                      {h.street_decisions && Object.keys(h.street_decisions).length > 0 && (
                        <div className="flex gap-1 ml-1">
                          {Object.entries(h.street_decisions).map(([st, dec]) => {
                            if (!dec) return null;
                            const scoreColor = dec.confidence >= 80 ? '#10b981' : dec.confidence >= 50 ? '#f59e0b' : '#ef4444';
                            return (
                              <span
                                key={st}
                                className="text-[8px] px-1 rounded"
                                style={{ backgroundColor: scoreColor + '20', color: scoreColor }}
                                title={`${st}: ${dec.action} (equity ${Math.round(dec.equity || 0)}%, conf ${Math.round(dec.confidence || 0)}%)`}
                              >
                                {st[0].toUpperCase()}:{dec.action?.[0] || '?'}
                              </span>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </details>
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

// ─── Audit Tab: analyze recent sessions in bulk ──────────────────
function AuditTab({ userId }) {
  const [loading, setLoading] = useState(true);
  const [auditData, setAuditData] = useState(null);

  const runAudit = useCallback(async () => {
    setLoading(true);
    try {
      const sb = getSupabase();
      if (!sb) return;
      const { data: { session } } = await sb.auth.getSession();
      if (!session?.access_token) return;

      // Fetch last 5 sessions with hands
      const sessResp = await fetch('/api/poker-brain/sessions?page=1&limit=5', {
        headers: { Authorization: `Bearer ${session.access_token}` }
      });
      const sessJson = await sessResp.json();
      const sessions = sessJson.sessions || [];

      // Fetch hands for each session
      const sessionAudits = [];
      for (const s of sessions) {
        try {
          const handResp = await fetch(`/api/poker-brain/session/${s.id}`, {
            headers: { Authorization: `Bearer ${session.access_token}` }
          });
          const handJson = await handResp.json();
          const hands = (handJson.hands || []).map(h => ({
            handId: h.id,
            streetDecisions: h.street_decisions || {},
            position: h.position || 'unknown',
            gameType: h.game_type || s.game_type || 'nlhe',
            bigBlind: h.big_blind || 0,
            holeCards: h.hole_cards || [],
            finalBoard: h.board || [],
          }));

          const audit = analyzeSession(hands);
          sessionAudits.push({
            session: s,
            audit,
            handsCount: hands.length,
          });
        } catch (_e) { /* skip session */ }
      }

      // Aggregate across all sessions
      const allHands = sessionAudits.flatMap(sa =>
        sa.audit.handReviews.filter(r => r.score !== null)
      );
      const overallScore = allHands.length > 0
        ? Math.round(allHands.reduce((sum, r) => sum + r.score, 0) / allHands.length)
        : 0;

      // Aggregate leaks across sessions
      const leakMap = {};
      for (const sa of sessionAudits) {
        for (const leak of sa.audit.leaks) {
          if (!leakMap[leak.type]) {
            leakMap[leak.type] = { ...leak, sessions: 1 };
          } else {
            leakMap[leak.type].sessions += 1;
            if (leak.severity === 'high') leakMap[leak.type].severity = 'high';
          }
        }
      }

      setAuditData({
        sessionAudits,
        overallScore,
        totalHands: allHands.length,
        aggregateLeaks: Object.values(leakMap).sort((a, b) => (b.sessions - a.sessions)),
      });
    } catch (e) {
      console.error('[PokerBrain] audit error:', e);
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => { runAudit(); }, [runAudit]);

  if (loading) return <div className="text-center text-slate-400 py-12">Running session audit...</div>;
  if (!auditData || auditData.sessionAudits.length === 0) {
    return <div className="text-center text-slate-500 py-12">No sessions with decision data found. Play with Poker Brain to generate audit data.</div>;
  }

  const gradeColor = {
    A: '#10b981', B: '#34d399', C: '#f59e0b', D: '#f97316', F: '#ef4444',
  };
  let overallGrade;
  if (auditData.overallScore >= 85) overallGrade = 'A';
  else if (auditData.overallScore >= 70) overallGrade = 'B';
  else if (auditData.overallScore >= 55) overallGrade = 'C';
  else if (auditData.overallScore >= 40) overallGrade = 'D';
  else overallGrade = 'F';

  return (
    <div className="space-y-4">
      {/* Overall Score */}
      <div className="bg-slate-800 rounded-xl p-5 flex items-center gap-5">
        <div className="text-center">
          <div className="text-5xl font-black" style={{ color: gradeColor[overallGrade] }}>{overallGrade}</div>
          <div className="text-[10px] text-slate-500 mt-1">Overall</div>
        </div>
        <div className="flex-1">
          <div className="text-lg font-bold text-white">{auditData.overallScore}/100</div>
          <div className="text-xs text-slate-400">Across {auditData.totalHands} hands in {auditData.sessionAudits.length} sessions</div>
          <div className="w-full h-3 bg-slate-700 rounded-full overflow-hidden mt-2">
            <div className="h-full rounded-full" style={{ width: auditData.overallScore + '%', backgroundColor: gradeColor[overallGrade] }} />
          </div>
        </div>
      </div>

      {/* Persistent Leaks */}
      {auditData.aggregateLeaks.length > 0 && (
        <div className="bg-slate-800 rounded-xl p-4">
          <h3 className="text-sm font-bold text-red-400 mb-3">Recurring Leaks</h3>
          <div className="space-y-2">
            {auditData.aggregateLeaks.map((leak, i) => (
              <div key={i} className="bg-slate-900 rounded-lg p-3">
                <div className="flex items-center gap-2 mb-1">
                  <span className={
                    'text-[10px] font-bold px-1.5 py-0.5 rounded ' +
                    (leak.severity === 'high' ? 'bg-red-900 text-red-300' : 'bg-amber-900 text-amber-300')
                  }>
                    {leak.severity.toUpperCase()}
                  </span>
                  <span className="text-xs text-white font-bold">{leak.type.replace(/-/g, ' ')}</span>
                  <span className="text-[10px] text-slate-500 ml-auto">
                    {leak.sessions} session{leak.sessions > 1 ? 's' : ''}
                  </span>
                </div>
                <p className="text-[11px] text-slate-400">{leak.description}</p>
                <p className="text-[10px] text-blue-400 mt-1">Fix: {leak.fix}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Per-Session Grades */}
      <div className="bg-slate-800 rounded-xl p-4">
        <h3 className="text-sm font-bold text-white mb-3">Session Grades</h3>
        <div className="space-y-2">
          {auditData.sessionAudits.map((sa, i) => (
            <div key={i} className="flex items-center gap-3 bg-slate-900 rounded-lg px-3 py-2">
              <span className="text-xl font-black w-8 text-center" style={{ color: gradeColor[sa.audit.grade] || '#94a3b8' }}>
                {sa.audit.grade}
              </span>
              <div className="flex-1">
                <div className="text-xs text-white font-bold">
                  {(sa.session.game_type || 'nlhe').toUpperCase()} -- {sa.audit.overallScore}/100
                </div>
                <div className="text-[10px] text-slate-500">
                  {new Date(sa.session.started_at).toLocaleDateString()} -- {sa.handsCount} hands -- {sa.audit.leaks.length} leak{sa.audit.leaks.length !== 1 ? 's' : ''}
                </div>
              </div>
            </div>
          ))}
        </div>
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
    { id: 'audit', label: 'Audit' },
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

      {/* Launch HUD Button */}
      <div className="max-w-lg mx-auto px-4 pt-4 flex justify-center">
        <PokerBrainLaunchButton label="Launch Poker Brain HUD" />
      </div>

      {/* Content */}
      <div className="max-w-lg mx-auto px-4 py-4">
        {activeTab === 'overview' && <OverviewTab stats={stats} loading={statsLoading} />}
        {activeTab === 'sessions' && <SessionsTab userId={user.id} />}
        {activeTab === 'audit' && <AuditTab userId={user.id} />}
        {activeTab === 'settings' && <SettingsTab userId={user.id} />}
      </div>

      <BottomNavBar />
    </div>
  );
}
