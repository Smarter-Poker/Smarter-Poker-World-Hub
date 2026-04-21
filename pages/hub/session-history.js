import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import supabase from '../../src/lib/supabase';
import useTrainingBus from '../../src/hooks/useTrainingBus';
import { eventBus } from '../../src/engine/EventBus';
import BottomNavBar from '../../src/components/ui/BottomNavBar';

const getSupabase = () => typeof window !== 'undefined' ? supabase : null;

export default function SessionHistoryPage() {
  useTrainingBus('session-history');
  const [sessions, setSessions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState(null);
  const [dateRange, setDateRange] = useState('all'); // J7: 'week', 'month', 'all'
  const [compareMode, setCompareMode] = useState(false); // L4: comparison toggle
  const [compareIds, setCompareIds] = useState([]); // L4: selected session IDs (max 2)
  const userIdRef = useRef(null);

  // Fetch sessions
  const fetchSessions = useCallback(async () => {
    const sb = getSupabase();
    if (!sb) return;
    try {
      if (!userIdRef.current) {
        const { data: authData } = await sb.auth.getUser();
        const user = authData?.user;
        if (!user) { setLoading(false); return; }
        userIdRef.current = user.id;
      }
      let query = sb.from('poker_session_stats')
        .select('*')
        .eq('user_id', userIdRef.current)
        .order('session_start', { ascending: false })
        .limit(100);

      // J7: Date range filter
      if (dateRange === 'week') {
        const d = new Date(); d.setDate(d.getDate() - 7);
        query = query.gte('session_start', d.toISOString());
      } else if (dateRange === 'month') {
        const d = new Date(); d.setDate(d.getDate() - 30);
        query = query.gte('session_start', d.toISOString());
      }

      const { data } = await query;
      setSessions(data || []);
    } catch (_) {}
    setLoading(false);
  }, [dateRange]);

  useEffect(() => { fetchSessions(); }, [fetchSessions]);

  // J6: EventBus reactivity — auto-refresh when session is saved at the table
  useEffect(() => {
    const handler = (payload) => {
      // I3: Catch all session stat update events including auto-persist from I2
      if (payload === 'session_saved' || payload === 'session_stats' || payload === 'session_stats_updated') {
        fetchSessions();
      }
    };
    const unsub = eventBus.on('DATA_MUTATED', handler);
    return () => {
      if (typeof unsub === 'function') unsub();
      else eventBus.off('DATA_MUTATED', handler);
    };
  }, [fetchSessions]);

  // Totals calculation
  const totals = useMemo(() => {
    if (!sessions.length) return null;
    const totalHands = sessions.reduce((a, s) => a + (s.hands_played || 0), 0);
    const totalWon = sessions.reduce((a, s) => a + (s.hands_won || 0), 0);
    const netPL = sessions.reduce((a, s) => a + ((s.ending_stack || 0) - (s.starting_stack || 0)), 0);
    const bigWin = Math.max(...sessions.map(s => s.biggest_win || 0));
    const bigLoss = Math.max(...sessions.map(s => s.biggest_loss || 0));
    // I6/I12: Aggregate VPIP/PFR/Aggression across all sessions
    const totalVpipCount = sessions.reduce((a, s) => a + (s.vpip_count || 0), 0);
    const totalPfrCount = sessions.reduce((a, s) => a + (s.pfr_count || 0), 0);
    const totalAggBets = sessions.reduce((a, s) => a + (s.aggression_bets || 0), 0);
    const totalAggCalls = sessions.reduce((a, s) => a + (s.aggression_calls || 0), 0);
    const totalDuration = sessions.reduce((a, s) => {
      if (!s.session_start || !s.session_end) return a;
      return a + (new Date(s.session_end) - new Date(s.session_start));
    }, 0);
    const avgSessionMins = sessions.length ? Math.round(totalDuration / sessions.length / 60000) : 0;
    return {
      totalHands, totalWon, netPL, bigWin, bigLoss, avgSessionMins,
      winRate: totalHands ? ((totalWon / totalHands) * 100).toFixed(1) : '0',
      // I6: VPIP/PFR trend data + I12: Career aggregates
      lifetimeVpip: totalHands ? ((totalVpipCount / totalHands) * 100).toFixed(1) : '0',
      lifetimePfr: totalHands ? ((totalPfrCount / totalHands) * 100).toFixed(1) : '0',
      lifetimeAF: totalAggCalls > 0 ? (totalAggBets / totalAggCalls).toFixed(1) : '—',
      totalSessions: sessions.length,
    };
  }, [sessions]);

  // J14: Cumulative P&L data for multi-session graph
  const cumulativePL = useMemo(() => {
    if (sessions.length < 2) return null;
    const chronological = [...sessions].reverse();
    let running = 0;
    return chronological.map(s => {
      running += (s.ending_stack || 0) - (s.starting_stack || 0);
      return { date: s.session_start, pl: running, hands: s.hands_played || 0 };
    });
  }, [sessions]);

  // K8: Streak tracking
  const streak = useMemo(() => {
    if (!sessions.length) return null;
    let count = 0;
    const firstNet = (sessions[0].ending_stack || 0) - (sessions[0].starting_stack || 0);
    const isWinning = firstNet >= 0;
    for (const s of sessions) {
      const net = (s.ending_stack || 0) - (s.starting_stack || 0);
      if ((isWinning && net >= 0) || (!isWinning && net < 0)) count++;
      else break;
    }
    return { count, isWinning, label: isWinning ? `🔥 ${count}W streak` : `❄️ ${count}L streak` };
  }, [sessions]);

  // L6: Win rate grouped by table/stakes
  const stakeBreakdown = useMemo(() => {
    if (sessions.length < 2) return null;
    const groups = {};
    sessions.forEach(s => {
      const key = s.table_id?.slice(0, 8) || 'Unknown';
      if (!groups[key]) groups[key] = { sessions: 0, hands: 0, pl: 0 };
      groups[key].sessions++;
      groups[key].hands += s.hands_played || 0;
      groups[key].pl += (s.ending_stack || 0) - (s.starting_stack || 0);
    });
    return Object.entries(groups)
      .filter(([, v]) => v.sessions >= 2)
      .sort((a, b) => b[1].pl - a[1].pl)
      .slice(0, 5);
  }, [sessions]);

  const formatDate = (d) => {
    if (!d) return '—';
    const dt = new Date(d);
    return dt.toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
  };

  // L4: Comparison data
  const compareData = useMemo(() => {
    if (compareIds.length !== 2) return null;
    const [a, b] = compareIds.map(id => sessions.find(s => s.id === id)).filter(Boolean);
    if (!a || !b) return null;
    const netA = (a.ending_stack || 0) - (a.starting_stack || 0);
    const netB = (b.ending_stack || 0) - (b.starting_stack || 0);
    return [
      { label: 'Date', a: formatDate(a.session_start), b: formatDate(b.session_start) },
      { label: 'Net P&L', a: netA, b: netB, format: v => `${v >= 0 ? '+' : ''}${v.toLocaleString()}`, colorize: true },
      { label: 'Hands', a: a.hands_played || 0, b: b.hands_played || 0, format: v => v.toLocaleString() },
      { label: 'Win Rate', a: a.hands_played ? ((a.hands_won / a.hands_played) * 100).toFixed(0) : 0, b: b.hands_played ? ((b.hands_won / b.hands_played) * 100).toFixed(0) : 0, format: v => `${v}%` },
      { label: 'VPIP%', a: a.vpip_pct || 0, b: b.vpip_pct || 0, format: v => `${v}%` },
      { label: 'PFR%', a: a.pfr_pct || 0, b: b.pfr_pct || 0, format: v => `${v}%` },
    ];
  }, [compareIds, sessions]);

  // J8: CSV export
  const handleExportCSV = useCallback(() => {
    if (!sessions.length) return;
    const headers = ['Date', 'Table', 'Hands Played', 'Hands Won', 'Buy-in', 'Cashout', 'Net P&L', 'Biggest Win', 'Biggest Loss'];
    const rows = sessions.map(s => [
      new Date(s.session_start).toISOString(),
      s.table_id || '',
      s.hands_played || 0,
      s.hands_won || 0,
      s.starting_stack || 0,
      s.ending_stack || 0,
      (s.ending_stack || 0) - (s.starting_stack || 0),
      s.biggest_win || 0,
      s.biggest_loss || 0,
    ]);
    const csv = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `session-history-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }, [sessions]);



  const T = {
    bg: '#0a0a0a', card: '#18191a', border: '#3E4042',
    text: '#E4E6EB', textSec: '#B0B3B8', textDim: '#65676B',
    green: '#4ade80', red: '#ef4444', gold: '#FFD700',
    accent: '#4facfe',
  };

  return (
    <div style={{ minHeight: '100vh', paddingBottom: 70, width: '100%', maxWidth: '100vw', overflowX: 'hidden', boxSizing: 'border-box', background: T.bg, padding: '20px 16px', fontFamily: "'Segoe UI', sans-serif" }}>
      <div style={{ maxWidth: 640, margin: '0 auto' }}>
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <h1 style={{ color: T.text, fontSize: 22, fontWeight: 900, margin: 0 }}>
            📊 Session History
          </h1>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            {/* K8: Streak badge */}
            {streak && streak.count >= 2 && (
              <span style={{
                background: streak.isWinning ? 'rgba(74,222,128,0.12)' : 'rgba(239,68,68,0.12)',
                color: streak.isWinning ? T.green : T.red,
                padding: '4px 10px', borderRadius: 20, fontSize: 10, fontWeight: 800,
                border: `1px solid ${streak.isWinning ? 'rgba(74,222,128,0.25)' : 'rgba(239,68,68,0.25)'}`,
              }}>
                {streak.label}
              </span>
            )}
            {/* J8: Export Button */}
            {sessions.length > 0 && (
              <motion.button
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                onClick={handleExportCSV}
                style={{
                  background: 'rgba(79,172,254,0.12)', border: '1px solid rgba(79,172,254,0.25)',
                  color: T.accent, padding: '6px 14px', borderRadius: 8,
                  fontSize: 11, fontWeight: 700, cursor: 'pointer',
                }}
              >
                📥 Export
              </motion.button>
            )}
          </div>
        </div>

        {/* J7: Date Range Filter */}
        <div style={{ display: 'flex', gap: 6, marginBottom: 16 }}>
          {[
            { id: 'week', label: 'Last 7 Days' },
            { id: 'month', label: 'Last 30 Days' },
            { id: 'all', label: 'All Time' },
          ].map(f => (
            <motion.button
              key={f.id}
              whileHover={{ scale: 1.03 }}
              whileTap={{ scale: 0.97 }}
              onClick={() => { setDateRange(f.id); setLoading(true); }}
              style={{
                flex: 1, padding: '8px 0', borderRadius: 8, fontSize: 11, fontWeight: 700,
                cursor: 'pointer', transition: 'all 0.2s',
                background: dateRange === f.id ? 'rgba(79,172,254,0.15)' : 'rgba(255,255,255,0.04)',
                border: dateRange === f.id ? '1px solid rgba(79,172,254,0.4)' : `1px solid ${T.border}`,
                color: dateRange === f.id ? T.accent : T.textSec,
              }}
            >
              {f.label}
            </motion.button>
          ))}
        </div>

        {/* Summary Cards */}
        {totals && (
          <>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8, marginBottom: 16 }}>
            {[
              { label: 'Net P&L', value: `${totals.netPL >= 0 ? '+' : ''}${totals.netPL.toLocaleString()}`, color: totals.netPL >= 0 ? T.green : T.red },
              { label: 'Hands', value: totals.totalHands.toLocaleString(), color: T.text },
              { label: 'Win %', value: `${totals.winRate}%`, color: T.gold },
              { label: 'Sessions', value: sessions.length, color: T.text },
              { label: 'Best Win', value: `+${totals.bigWin.toLocaleString()}`, color: T.green },
              { label: 'Avg Duration', value: `${totals.avgSessionMins}m`, color: T.textSec },
            ].map((s, i) => (
              <div key={i} style={{
                background: T.card, borderRadius: 10, padding: '10px 12px',
                border: `1px solid ${T.border}`, textAlign: 'center',
              }}>
                <div style={{ fontSize: 16, fontWeight: 800, color: s.color }}>{s.value}</div>
                <div style={{ fontSize: 9, color: T.textDim, marginTop: 2 }}>{s.label}</div>
              </div>
            ))}
          </div>

          {/* I12: Career Stats Row */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8, marginBottom: 16 }}>
            {[
              { label: 'VPIP%', value: `${totals.lifetimeVpip}%`, color: parseFloat(totals.lifetimeVpip) > 30 ? T.gold : T.text },
              { label: 'PFR%', value: `${totals.lifetimePfr}%`, color: parseFloat(totals.lifetimePfr) > 15 ? T.gold : T.text },
              { label: 'Aggression', value: totals.lifetimeAF, color: T.accent },
            ].map((s, i) => (
              <div key={i} style={{
                background: T.card, borderRadius: 10, padding: '10px 12px',
                border: `1px solid ${T.border}`, textAlign: 'center',
              }}>
                <div style={{ fontSize: 16, fontWeight: 800, color: s.color }}>{s.value}</div>
                <div style={{ fontSize: 9, color: T.textDim, marginTop: 2 }}>{s.label}</div>
              </div>
            ))}
          </div>
          </>
        )}

        {/* J14: Cumulative P&L Graph */}
        {cumulativePL && cumulativePL.length > 1 && (() => {
          const vals = cumulativePL.map(p => p.pl);
          const min = Math.min(...vals);
          const max = Math.max(...vals);
          const range = max - min || 1;
          const W = 600, H = 100, PAD = 4;
          const pts = vals.map((v, i) => ({
            x: PAD + (i / (vals.length - 1)) * (W - PAD * 2),
            y: PAD + (1 - (v - min) / range) * (H - PAD * 2),
          }));
          const pathD = pts.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x},${p.y}`).join(' ');
          const areaD = `${pathD} L${pts[pts.length - 1].x},${H} L${PAD},${H} Z`;
          const lastPL = vals[vals.length - 1];
          const color = lastPL >= 0 ? T.green : T.red;
          const zeroY = PAD + (1 - (0 - min) / range) * (H - PAD * 2);
          return (
            <div style={{
              background: T.card, borderRadius: 12, padding: '12px 14px',
              border: `1px solid ${T.border}`, marginBottom: 16,
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                <span style={{ color: T.textSec, fontSize: 11, fontWeight: 700 }}>Cumulative P&L</span>
                <span style={{ color, fontSize: 14, fontWeight: 900 }}>
                  {lastPL >= 0 ? '+' : ''}{lastPL.toLocaleString()}
                </span>
              </div>
              <svg width="100%" height={H} viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none"
                style={{ borderRadius: 8, display: 'block' }}>
                {/* Zero reference line */}
                {min < 0 && max > 0 && (
                  <line x1={PAD} y1={zeroY} x2={W - PAD} y2={zeroY}
                    stroke="rgba(255,255,255,0.08)" strokeWidth={1} strokeDasharray="4,4" />
                )}
                <path d={areaD} fill={`${color}12`} />
                <path d={pathD} fill="none" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
                <circle cx={pts[pts.length - 1].x} cy={pts[pts.length - 1].y} r={3}
                  fill={color} stroke="#fff" strokeWidth={1} />
              </svg>
            </div>
          );
        })()}

        {loading && (
          <div style={{ color: T.textSec, textAlign: 'center', padding: 40 }}>Loading sessions...</div>
        )}

        {!loading && sessions.length === 0 && (
          <div style={{ color: T.textDim, textAlign: 'center', padding: 40 }}>
            No sessions recorded yet. Play some hands to see your history here!
          </div>
        )}

        {/* Session List */}
        <AnimatePresence>
          {sessions.map(s => {
            const net = (s.ending_stack || 0) - (s.starting_stack || 0);
            const isExpanded = expandedId === s.id;
            const plHistory = s.pl_history || [];
            const duration = s.session_start && s.session_end
              ? Math.round((new Date(s.session_end) - new Date(s.session_start)) / 60000) : 0;
            return (
              <motion.div
                key={s.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                onClick={() => setExpandedId(isExpanded ? null : s.id)}
                style={{
                  background: T.card, borderRadius: 12, padding: 14, marginBottom: 8,
                  border: `1px solid ${isExpanded ? (net >= 0 ? T.green : T.red) + '44' : T.border}`,
                  cursor: 'pointer', transition: 'border-color 0.2s',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div>
                    <div style={{ color: T.text, fontSize: 13, fontWeight: 700 }}>
                      {formatDate(s.session_start)}
                    </div>
                    <div style={{ color: T.textDim, fontSize: 10, marginTop: 2 }}>
                      {s.hands_played || 0} hands • {duration > 0 ? `${duration}m` : 'Live'}
                    </div>
                  </div>

                  {/* L10: Inline mini sparkline (visible without expanding) */}
                  {plHistory.length > 2 && (
                    <svg width={60} height={20} viewBox={`0 0 60 20`} style={{ flexShrink: 0, marginRight: 8 }}>
                      {(() => {
                        const min = Math.min(...plHistory);
                        const max = Math.max(...plHistory);
                        const range = max - min || 1;
                        const pts = plHistory.map((v, i) => `${(i / (plHistory.length - 1)) * 60},${20 - ((v - min) / range) * 18 + 1}`);
                        const color = net >= 0 ? T.green : T.red;
                        return <polyline points={pts.join(' ')} fill="none" stroke={color} strokeWidth={1.5} strokeLinecap="round" />;
                      })()}
                    </svg>
                  )}

                  <div style={{ textAlign: 'right' }}>
                    {/* L4: Compare checkbox */}
                    {compareMode && (
                      <div
                        onClick={(e) => {
                          e.stopPropagation();
                          setCompareIds(prev => prev.includes(s.id) ? prev.filter(id => id !== s.id) : prev.length < 2 ? [...prev, s.id] : prev);
                        }}
                        style={{
                          width: 16, height: 16, borderRadius: 4, display: 'inline-block', marginRight: 8,
                          border: `2px solid ${compareIds.includes(s.id) ? T.accent : T.border}`,
                          background: compareIds.includes(s.id) ? T.accent : 'transparent',
                          cursor: 'pointer', verticalAlign: 'middle',
                        }}
                      />
                    )}
                    <div style={{
                      fontSize: 16, fontWeight: 900,
                      color: net >= 0 ? T.green : T.red,
                    }}>
                      {net >= 0 ? '+' : ''}{net.toLocaleString()}
                    </div>
                  </div>
                </div>

                {/* Expanded Details */}
                <AnimatePresence>
                  {isExpanded && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: 'auto', opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      style={{ overflow: 'hidden', marginTop: 10 }}
                    >
                      {/* Mini P&L Chart */}
                      {plHistory.length > 1 && (() => {
                        const min = Math.min(...plHistory);
                        const max = Math.max(...plHistory);
                        const range = max - min || 1;
                        const W = 200, H = 40;
                        const pts = plHistory.map((v, i) => ({
                          x: (i / (plHistory.length - 1)) * W,
                          y: H - ((v - min) / range) * H,
                        }));
                        const pathD = pts.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x},${p.y}`).join(' ');
                        const areaD = `${pathD} L${W},${H} L0,${H} Z`;
                        const color = net >= 0 ? T.green : T.red;
                        return (
                          <svg width="100%" height={H + 4} viewBox={`0 0 ${W} ${H + 4}`} preserveAspectRatio="none"
                            style={{ borderRadius: 6, background: 'rgba(255,255,255,0.02)', marginBottom: 8 }}>
                            <path d={areaD} fill={`${color}15`} />
                            <path d={pathD} fill="none" stroke={color} strokeWidth={1.5} />
                          </svg>
                        );
                      })()}

                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 6 }}>
                        {[
                          { label: 'Buy-in', value: (s.starting_stack || 0).toLocaleString() },
                          { label: 'Cashout', value: (s.ending_stack || 0).toLocaleString() },
                          { label: 'Win Rate', value: s.hands_played ? `${((s.hands_won / s.hands_played) * 100).toFixed(0)}%` : '—' },
                          { label: 'Best Win', value: `+${(s.biggest_win || 0).toLocaleString()}` },
                          { label: 'Worst Loss', value: `-${(s.biggest_loss || 0).toLocaleString()}` },
                          { label: 'Won', value: `${s.hands_won || 0}/${s.hands_played || 0}` },
                        ].map((d, i) => (
                          <div key={i} style={{ textAlign: 'center' }}>
                            <div style={{ color: T.text, fontSize: 11, fontWeight: 700 }}>{d.value}</div>
                            <div style={{ color: T.textDim, fontSize: 8 }}>{d.label}</div>
                          </div>
                        ))}
                      </div>

                      {/* K5: Per-session VPIP/PFR from Supabase columns */}
                      {(s.vpip_pct > 0 || s.pfr_pct > 0 || s.duration_minutes > 0) && (
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 6, marginTop: 8, paddingTop: 8, borderTop: `1px solid ${T.border}` }}>
                          {[
                            { label: 'VPIP%', value: `${s.vpip_pct || 0}%`, color: (s.vpip_pct || 0) > 30 ? T.gold : T.text },
                            { label: 'PFR%', value: `${s.pfr_pct || 0}%`, color: (s.pfr_pct || 0) > 15 ? T.gold : T.text },
                            { label: 'Duration', value: `${s.duration_minutes || 0}m`, color: T.textSec },
                          ].map((d, i) => (
                            <div key={`adv-${i}`} style={{ textAlign: 'center' }}>
                              <div style={{ color: d.color, fontSize: 11, fontWeight: 700 }}>{d.value}</div>
                              <div style={{ color: T.textDim, fontSize: 8 }}>{d.label}</div>
                            </div>
                          ))}
                        </div>
                      )}
                    </motion.div>
                  )}
                </AnimatePresence>
              </motion.div>
            );
          })}
        </AnimatePresence>

        {/* L6: Stake/Table Breakdown */}
        {stakeBreakdown && stakeBreakdown.length > 0 && (
          <div style={{ marginTop: 16, background: T.card, borderRadius: 12, padding: 14, border: `1px solid ${T.border}` }}>
            <div style={{ fontSize: 11, fontWeight: 800, color: T.text, marginBottom: 8 }}>📊 Performance by Table</div>
            {stakeBreakdown.map(([tableId, data]) => (
              <div key={tableId} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '4px 0', borderBottom: `1px solid ${T.border}22` }}>
                <span style={{ color: T.textSec, fontSize: 10, fontFamily: 'monospace' }}>{tableId}</span>
                <span style={{ fontSize: 10, color: T.textDim }}>{data.sessions}s / {data.hands}h</span>
                <span style={{ fontSize: 11, fontWeight: 700, color: data.pl >= 0 ? T.green : T.red }}>{data.pl >= 0 ? '+' : ''}{data.pl.toLocaleString()}</span>
              </div>
            ))}
          </div>
        )}

        {/* L4: Compare button */}
        {sessions.length >= 2 && (
          <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
            <motion.button
              whileTap={{ scale: 0.95 }}
              onClick={() => { setCompareMode(p => !p); setCompareIds([]); }}
              style={{
                flex: 1, padding: '10px 0', borderRadius: 10, fontSize: 11, fontWeight: 700,
                background: compareMode ? 'rgba(79,172,254,0.15)' : 'rgba(255,255,255,0.04)',
                border: compareMode ? '1px solid rgba(79,172,254,0.4)' : `1px solid ${T.border}`,
                color: compareMode ? T.accent : T.textSec, cursor: 'pointer',
              }}
            >
              {compareMode ? '✕ Cancel Compare' : '⚖️ Compare Sessions'}
            </motion.button>
          </div>
        )}

        {/* L4: Comparison overlay */}
        <AnimatePresence>
          {compareData && (
            <motion.div
              initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 20 }}
              style={{
                marginTop: 12, background: T.card, borderRadius: 12, padding: 16,
                border: `1px solid ${T.accent}44`, boxShadow: '0 4px 24px rgba(79,172,254,0.08)',
              }}
            >
              <div style={{ fontSize: 12, fontWeight: 800, color: T.accent, marginBottom: 10, textAlign: 'center' }}>⚖️ Session Comparison</div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr auto 1fr', gap: 4 }}>
                {compareData.map((row, i) => {
                  const fmtA = row.format ? row.format(row.a) : row.a;
                  const fmtB = row.format ? row.format(row.b) : row.b;
                  const colorA = row.colorize ? (row.a >= 0 ? T.green : T.red) : T.text;
                  const colorB = row.colorize ? (row.b >= 0 ? T.green : T.red) : T.text;
                  return [
                    <div key={`a-${i}`} style={{ textAlign: 'right', color: colorA, fontSize: 12, fontWeight: 700 }}>{fmtA}</div>,
                    <div key={`l-${i}`} style={{ textAlign: 'center', color: T.textDim, fontSize: 9, padding: '0 8px', lineHeight: '18px' }}>{row.label}</div>,
                    <div key={`b-${i}`} style={{ color: colorB, fontSize: 12, fontWeight: 700 }}>{fmtB}</div>,
                  ];
                })}
              </div>
              <motion.button
                whileTap={{ scale: 0.95 }}
                onClick={() => { setCompareMode(false); setCompareIds([]); }}
                style={{
                  width: '100%', marginTop: 10, padding: '8px 0', borderRadius: 8, fontSize: 11,
                  fontWeight: 600, background: 'rgba(255,255,255,0.06)', border: `1px solid ${T.border}`,
                  color: T.textSec, cursor: 'pointer',
                }}
              >Done</motion.button>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
      <BottomNavBar />
    </div>
  );
}
