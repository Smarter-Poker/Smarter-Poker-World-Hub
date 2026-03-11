import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { createClient } from '../../src/lib/supabase';
import useTrainingBus from '../../src/hooks/useTrainingBus';
import eventBus from '../../src/lib/eventBus';

const getSupabase = () => typeof window !== 'undefined' ? createClient() : null;

export default function SessionHistoryPage() {
  useTrainingBus('session-history');
  const [sessions, setSessions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState(null);
  const [dateRange, setDateRange] = useState('all'); // J7: 'week', 'month', 'all'
  const userIdRef = useRef(null);

  // Fetch sessions
  const fetchSessions = useCallback(async () => {
    const sb = getSupabase();
    if (!sb) return;
    try {
      if (!userIdRef.current) {
        const { data: { user } } = await sb.auth.getUser();
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
      if (payload === 'session_saved' || payload === 'session_stats') {
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
    const totalDuration = sessions.reduce((a, s) => {
      if (!s.session_start || !s.session_end) return a;
      return a + (new Date(s.session_end) - new Date(s.session_start));
    }, 0);
    const avgSessionMins = sessions.length ? Math.round(totalDuration / sessions.length / 60000) : 0;
    return {
      totalHands, totalWon, netPL, bigWin, bigLoss, avgSessionMins,
      winRate: totalHands ? ((totalWon / totalHands) * 100).toFixed(1) : '0',
    };
  }, [sessions]);

  // J14: Cumulative P&L data for multi-session graph
  const cumulativePL = useMemo(() => {
    if (sessions.length < 2) return null;
    // Sessions are in descending order — reverse for chronological
    const chronological = [...sessions].reverse();
    let running = 0;
    return chronological.map(s => {
      running += (s.ending_stack || 0) - (s.starting_stack || 0);
      return { date: s.session_start, pl: running, hands: s.hands_played || 0 };
    });
  }, [sessions]);

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

  const formatDate = (d) => {
    if (!d) return '—';
    const dt = new Date(d);
    return dt.toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
  };

  const T = {
    bg: '#0a0a0a', card: '#18191a', border: '#3E4042',
    text: '#E4E6EB', textSec: '#B0B3B8', textDim: '#65676B',
    green: '#4ade80', red: '#ef4444', gold: '#FFD700',
    accent: '#4facfe',
  };

  return (
    <div style={{ minHeight: '100vh', background: T.bg, padding: '20px 16px', fontFamily: "'Segoe UI', sans-serif" }}>
      <div style={{ maxWidth: 640, margin: '0 auto' }}>
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <h1 style={{ color: T.text, fontSize: 22, fontWeight: 900, margin: 0 }}>
            📊 Session History
          </h1>
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
              📥 Export CSV
            </motion.button>
          )}
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
                  <div style={{ textAlign: 'right' }}>
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
                    </motion.div>
                  )}
                </AnimatePresence>
              </motion.div>
            );
          })}
        </AnimatePresence>
      </div>
    </div>
  );
}
