import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { createClient } from '../../src/lib/supabase';
import useTrainingBus from '../../src/hooks/useTrainingBus';
import { eventBus } from '../../src/engine/EventBus';

const getSupabase = () => typeof window !== 'undefined' ? createClient() : null;

export default function HandHistoryPage() {
  useTrainingBus('hand-history');
  const [hands, setHands] = useState([]);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState(null);
  const [filterTable, setFilterTable] = useState('all');
  const userIdRef = useRef(null);

  // Fetch hand histories
  const fetchHands = useCallback(async () => {
    const sb = getSupabase();
    if (!sb) return;
    try {
      if (!userIdRef.current) {
        const { data: { user } } = await sb.auth.getUser();
        if (!user) { setLoading(false); return; }
        userIdRef.current = user.id;
      }
      let query = sb.from('hand_histories')
        .select('*')
        .eq('user_id', userIdRef.current)
        .order('created_at', { ascending: false })
        .limit(200);

      if (filterTable !== 'all') {
        query = query.eq('table_id', filterTable);
      }

      const { data } = await query;
      setHands(data || []);
    } catch (_) {}
    setLoading(false);
  }, [filterTable]);

  useEffect(() => { fetchHands(); }, [fetchHands]);

  // I4: EventBus reactivity — auto-refresh when a hand completes
  useEffect(() => {
    const handler = (payload) => {
      if (payload === 'hand_history_updated') fetchHands();
    };
    const unsub = eventBus.on('DATA_MUTATED', handler);
    return () => { if (typeof unsub === 'function') unsub(); else eventBus.off('DATA_MUTATED', handler); };
  }, [fetchHands]);

  // Unique table IDs for filter
  const tableIds = useMemo(() => {
    const ids = [...new Set(hands.map(h => h.table_id).filter(Boolean))];
    return ids;
  }, [hands]);

  // Stats
  const stats = useMemo(() => {
    if (!hands.length) return null;
    const totalHands = hands.length;
    const totalPot = hands.reduce((a, h) => a + (h.pot_total || h.hand_data?.potTotal || 0), 0);
    const avgPot = Math.round(totalPot / totalHands);
    return { totalHands, totalPot, avgPot };
  }, [hands]);

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
            🃏 Hand History
          </h1>
          {stats && (
            <span style={{ color: T.textSec, fontSize: 11, fontWeight: 600 }}>
              {stats.totalHands} hands • Avg pot {stats.avgPot.toLocaleString()}
            </span>
          )}
        </div>

        {/* Table Filter */}
        {tableIds.length > 1 && (
          <div style={{ display: 'flex', gap: 4, marginBottom: 12, flexWrap: 'wrap' }}>
            <motion.button
              whileHover={{ scale: 1.03 }}
              whileTap={{ scale: 0.97 }}
              onClick={() => { setFilterTable('all'); setLoading(true); }}
              style={{
                padding: '5px 12px', borderRadius: 8, fontSize: 10, fontWeight: 700, cursor: 'pointer',
                background: filterTable === 'all' ? 'rgba(79,172,254,0.15)' : 'rgba(255,255,255,0.04)',
                border: filterTable === 'all' ? '1px solid rgba(79,172,254,0.4)' : `1px solid ${T.border}`,
                color: filterTable === 'all' ? T.accent : T.textSec,
              }}
            >All Tables</motion.button>
            {tableIds.map(tid => (
              <motion.button
                key={tid}
                whileHover={{ scale: 1.03 }}
                whileTap={{ scale: 0.97 }}
                onClick={() => { setFilterTable(tid); setLoading(true); }}
                style={{
                  padding: '5px 12px', borderRadius: 8, fontSize: 10, fontWeight: 700, cursor: 'pointer',
                  background: filterTable === tid ? 'rgba(79,172,254,0.15)' : 'rgba(255,255,255,0.04)',
                  border: filterTable === tid ? '1px solid rgba(79,172,254,0.4)' : `1px solid ${T.border}`,
                  color: filterTable === tid ? T.accent : T.textSec,
                }}
              >{tid.length > 12 ? tid.slice(0, 12) + '…' : tid}</motion.button>
            ))}
          </div>
        )}

        {loading && (
          <div style={{ color: T.textSec, textAlign: 'center', padding: 40 }}>Loading hand histories...</div>
        )}

        {!loading && hands.length === 0 && (
          <div style={{ color: T.textDim, textAlign: 'center', padding: 40 }}>
            No hands recorded yet. Play some hands to see your history here!
          </div>
        )}

        {/* Hand List */}
        <AnimatePresence>
          {hands.map(h => {
            const hd = h.hand_data || {};
            const handId = h.hand_id || hd.handId || h.id;
            const pot = h.pot_total || hd.potTotal || 0;
            const winners = hd.winners || [];
            const heroWon = winners.some(w => String(w.playerId) === String(userIdRef.current));
            const board = hd.board || hd.communityCards || [];
            const heroCards = hd.heroCards || [];
            const actionLog = hd.actionLog || [];
            const isExpanded = expandedId === h.id;

            return (
              <motion.div
                key={h.id}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                onClick={() => setExpandedId(isExpanded ? null : h.id)}
                style={{
                  background: T.card, borderRadius: 10, padding: 12, marginBottom: 6,
                  border: `1px solid ${isExpanded ? (heroWon ? T.green : T.red) + '44' : T.border}`,
                  cursor: 'pointer', transition: 'border-color 0.2s',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div>
                    <div style={{ color: T.text, fontSize: 11, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 6 }}>
                      <span style={{ color: heroWon ? T.green : T.red }}>{heroWon ? '✅ Won' : '❌ Lost'}</span>
                      <span style={{ color: T.textDim, fontSize: 9 }}>#{typeof handId === 'string' ? handId.slice(-6) : handId}</span>
                    </div>
                    <div style={{ color: T.textDim, fontSize: 9, marginTop: 2 }}>
                      {formatDate(h.created_at)} • {h.table_id ? h.table_id.slice(0, 12) : '—'}
                    </div>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ fontSize: 14, fontWeight: 800, color: T.gold }}>{pot.toLocaleString()}</div>
                    <div style={{ fontSize: 8, color: T.textDim }}>pot</div>
                  </div>
                </div>

                {/* Expanded Detail */}
                <AnimatePresence>
                  {isExpanded && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: 'auto', opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      style={{ overflow: 'hidden', marginTop: 10 }}
                    >
                      {/* Hero Cards */}
                      {heroCards.length > 0 && (
                        <div style={{ marginBottom: 8 }}>
                          <div style={{ fontSize: 8, color: T.textDim, fontWeight: 700, textTransform: 'uppercase', marginBottom: 3 }}>Your Cards</div>
                          <div style={{ display: 'flex', gap: 3 }}>
                            {heroCards.map((c, i) => (
                              <div key={i} style={{
                                width: 28, height: 38, borderRadius: 4,
                                background: 'linear-gradient(135deg, #1a1a3e, #2a2a4e)',
                                border: '1px solid rgba(255,255,255,0.2)',
                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                fontSize: 11, fontWeight: 800,
                                color: typeof c === 'string' && (c.includes('h') || c.includes('d')) ? '#e53935' : '#fff',
                              }}>{typeof c === 'string' ? c : '?'}</div>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Board */}
                      {board.length > 0 && (
                        <div style={{ marginBottom: 8 }}>
                          <div style={{ fontSize: 8, color: T.textDim, fontWeight: 700, textTransform: 'uppercase', marginBottom: 3 }}>Board</div>
                          <div style={{ display: 'flex', gap: 2 }}>
                            {board.map((c, i) => (
                              <div key={i} style={{
                                width: 24, height: 32, borderRadius: 3,
                                background: 'linear-gradient(135deg, #0a0a1e, #1a1a3e)',
                                border: '1px solid rgba(255,255,255,0.12)',
                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                fontSize: 9, fontWeight: 800,
                                color: typeof c === 'string' && (c.includes('h') || c.includes('d')) ? '#e53935' : '#fff',
                              }}>{typeof c === 'string' ? c : '?'}</div>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Winners */}
                      {winners.length > 0 && (
                        <div style={{ marginBottom: 8 }}>
                          <div style={{ fontSize: 8, color: T.textDim, fontWeight: 700, textTransform: 'uppercase', marginBottom: 3 }}>Winners</div>
                          {winners.map((w, i) => (
                            <div key={i} style={{ fontSize: 10, color: T.green, fontWeight: 600 }}>
                              {w.playerName || 'Player'} won {(w.amount || 0).toLocaleString()}
                            </div>
                          ))}
                        </div>
                      )}

                      {/* Action Log */}
                      {actionLog.length > 0 && (
                        <div>
                          <div style={{ fontSize: 8, color: T.textDim, fontWeight: 700, textTransform: 'uppercase', marginBottom: 3 }}>Action Log</div>
                          <div style={{ maxHeight: 80, overflowY: 'auto' }}>
                            {actionLog.map((a, i) => (
                              <div key={i} style={{ fontSize: 9, color: T.textSec, padding: '1px 0' }}>
                                <span style={{ color: T.text, fontWeight: 600 }}>{a.playerName || 'Player'}</span>{' '}
                                {a.text || a.type}{a.amount > 0 ? ` ${a.amount.toLocaleString()}` : ''}
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
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
