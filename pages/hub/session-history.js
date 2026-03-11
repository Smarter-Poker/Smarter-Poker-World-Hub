import { useState, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { createClient } from '../../src/lib/supabase';
import { useTrainingBus } from '../../src/hooks/useTrainingBus';

const getSupabase = () => typeof window !== 'undefined' ? createClient() : null;

export default function SessionHistoryPage() {
  if (useTrainingBus) useTrainingBus('session-history');
  const [sessions, setSessions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState(null);

  useEffect(() => {
    const sb = getSupabase();
    if (!sb) return;
    (async () => {
      try {
        const { data: { user } } = await sb.auth.getUser();
        if (!user) { setLoading(false); return; }
        const { data } = await sb.from('poker_session_stats')
          .select('*')
          .eq('user_id', user.id)
          .order('session_start', { ascending: false })
          .limit(50);
        setSessions(data || []);
      } catch (_) {}
      setLoading(false);
    })();
  }, []);

  const totals = useMemo(() => {
    if (!sessions.length) return null;
    const totalHands = sessions.reduce((a, s) => a + (s.hands_played || 0), 0);
    const totalWon = sessions.reduce((a, s) => a + (s.hands_won || 0), 0);
    const netPL = sessions.reduce((a, s) => a + ((s.ending_stack || 0) - (s.starting_stack || 0)), 0);
    const bigWin = Math.max(...sessions.map(s => s.biggest_win || 0));
    const bigLoss = Math.max(...sessions.map(s => s.biggest_loss || 0));
    return { totalHands, totalWon, netPL, bigWin, bigLoss, winRate: totalHands ? ((totalWon / totalHands) * 100).toFixed(1) : '0' };
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
  };

  return (
    <div style={{ minHeight: '100vh', background: T.bg, padding: '20px 16px', fontFamily: "'Segoe UI', sans-serif" }}>
      <div style={{ maxWidth: 600, margin: '0 auto' }}>
        <h1 style={{ color: T.text, fontSize: 22, fontWeight: 900, marginBottom: 20 }}>
          📊 Session History
        </h1>

        {/* Summary Cards */}
        {totals && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8, marginBottom: 20 }}>
            {[
              { label: 'Net P&L', value: `${totals.netPL >= 0 ? '+' : ''}${totals.netPL.toLocaleString()}`, color: totals.netPL >= 0 ? T.green : T.red },
              { label: 'Hands', value: totals.totalHands.toLocaleString(), color: T.text },
              { label: 'Win %', value: `${totals.winRate}%`, color: T.gold },
              { label: 'Sessions', value: sessions.length, color: T.text },
              { label: 'Best Win', value: `+${totals.bigWin.toLocaleString()}`, color: T.green },
              { label: 'Worst Loss', value: `-${totals.bigLoss.toLocaleString()}`, color: T.red },
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
                      {s.hands_played || 0} hands • {s.table_id?.slice(0, 8) || 'Table'}
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
