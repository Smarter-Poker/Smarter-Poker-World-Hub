/**
 * EQUITY CALCULATOR TOOL
 * ═══════════════════════════════════════════════════════════════════════════
 * Interactive range vs range equity calculator:
 * - Input hands or ranges for up to 4 players
 * - Select board cards (flop/turn/river)
 * - Monte Carlo simulation with configurable iterations
 * - Real-time equity bars + win/tie/lose breakdown
 * - Dead cards exclusion, random hand generation
 * ═══════════════════════════════════════════════════════════════════════════
 */

import React, { useState, useCallback, useMemo } from 'react';

const RANKS = ['A','K','Q','J','T','9','8','7','6','5','4','3','2'];
const SUITS = ['s','h','d','c'];
const SUIT_SYMBOLS = { s: '\u2660', h: '\u2665', d: '\u2666', c: '\u2663' };
const SUIT_COLORS = { s: '#e2e8f0', h: '#ef4444', d: '#3b82f6', c: '#22c55e' };
const RANK_VALUES = { A: 14, K: 13, Q: 12, J: 11, T: 10, '9': 9, '8': 8, '7': 7, '6': 6, '5': 5, '4': 4, '3': 3, '2': 2 };

const PLAYER_COLORS = ['#3b82f6', '#ef4444', '#22c55e', '#f59e0b'];

// ═══ PRESET RANGES ═══
const PRESETS = [
  { label: 'Custom', value: '' },
  { label: 'AA', value: 'AA' },
  { label: 'QQ+', value: 'AA,KK,QQ' },
  { label: 'TT+,AK', value: 'AA,KK,QQ,JJ,TT,AKs,AKo' },
  { label: 'Top 10%', value: 'AA,KK,QQ,JJ,TT,99,AKs,AQs,AJs,ATs,KQs,AKo,AQo' },
  { label: 'Top 20%', value: 'AA-55,AKs-A8s,KQs-KTs,QJs,JTs,AKo-ATo,KQo' },
  { label: 'Top 40%', value: 'AA-22,AKs-A2s,KQs-K5s,QJs-Q8s,JTs-J8s,T9s-T8s,98s,87s,AKo-A7o,KQo-KTo,QJo-QTo,JTo' },
  { label: 'Random', value: 'random' },
];

// ═══ SIMPLE HAND EVALUATOR ═══
function evaluateHand(cards) {
  if (cards.length < 5) return { rank: 0, value: 0 };
  try {
    const vals = cards.map(c => RANK_VALUES[c[0]]).sort((a, b) => b - a);
    const suits = cards.map(c => c[1]);
    const isFlush = suits.filter(s => s === suits[0]).length >= 5 || [...new Set(suits)].some(s => suits.filter(x => x === s).length >= 5);
    const uniqueVals = [...new Set(vals)].sort((a, b) => b - a);

    // Check straight
    let isStraight = false, straightHigh = 0;
    for (let i = 0; i <= uniqueVals.length - 5; i++) {
      if (uniqueVals[i] - uniqueVals[i + 4] === 4) {
        isStraight = true;
        straightHigh = uniqueVals[i];
        break;
      }
    }
    // Wheel
    if (!isStraight && uniqueVals.includes(14) && uniqueVals.includes(5) && uniqueVals.includes(4) && uniqueVals.includes(3) && uniqueVals.includes(2)) {
      isStraight = true;
      straightHigh = 5;
    }

    // Count groups
    const counts = {};
    vals.forEach(v => { counts[v] = (counts[v] || 0) + 1; });
    const groups = Object.entries(counts || {}).map(([v, c]) => ({ val: parseInt(v), count: c })).sort((a, b) => b.count - a.count || b.val - a.val);

    if (isFlush && isStraight) return { rank: 8, value: straightHigh };
    if (groups[0].count === 4) return { rank: 7, value: groups[0].val * 100 + groups[1].val };
    if (groups[0].count === 3 && groups[1]?.count >= 2) return { rank: 6, value: groups[0].val * 100 + groups[1].val };
    if (isFlush) return { rank: 5, value: vals[0] };
    if (isStraight) return { rank: 4, value: straightHigh };
    if (groups[0].count === 3) return { rank: 3, value: groups[0].val * 10000 + (groups[1]?.val || 0) * 100 + (groups[2]?.val || 0) };
    if (groups[0].count === 2 && groups[1]?.count === 2) return { rank: 2, value: Math.max(groups[0].val, groups[1].val) * 10000 + Math.min(groups[0].val, groups[1].val) * 100 + (groups[2]?.val || 0) };
    if (groups[0].count === 2) return { rank: 1, value: groups[0].val * 1000000 + vals.filter(v => v !== groups[0].val).slice(0, 3).reduce((s, v, i) => s + v * Math.pow(100, 2 - i), 0) };
    return { rank: 0, value: vals.slice(0, 5).reduce((s, v, i) => s + v * Math.pow(100, 4 - i), 0) };
  } catch {
    return { rank: 0, value: 0 };
  }
}

function compareHands(h1, h2) {
  if (h1.rank !== h2.rank) return h1.rank - h2.rank;
  return h1.value - h2.value;
}

// ═══ MONTE CARLO SIMULATION ═══
function runEquitySim(playerHands, boardCards, iterations = 5000) {
  const results = playerHands.map(() => ({ wins: 0, ties: 0, total: 0 }));
  const deck = [];
  const usedCards = new Set([...boardCards, ...playerHands.flat()]);

  for (const r of RANKS) {
    for (const s of SUITS) {
      const card = r + s;
      if (!usedCards.has(card)) deck.push(card);
    }
  }

  const cardsNeeded = 5 - boardCards.length;

  for (let i = 0; i < iterations; i++) {
    // Random remaining board cards.
    // Phase 62: Fisher-Yates instead of biased sort(()=>Math.random()-0.5) —
    // this is a Monte Carlo equity simulation; biased shuffles tilted the
    // sampled runouts toward certain card orderings, skewing the equity %.
    const shuffled = [...deck];
    for (let k = shuffled.length - 1; k > 0; k--) {
      const j = Math.floor(Math.random() * (k + 1));
      [shuffled[k], shuffled[j]] = [shuffled[j], shuffled[k]];
    }
    const runout = [...boardCards, ...shuffled.slice(0, cardsNeeded)];

    // Evaluate each player
    const evals = playerHands.map(hand => {
      const allCards = [...hand, ...runout];
      return evaluateHand(allCards);
    });

    // Find winner(s)
    let bestIdx = [0];
    for (let j = 1; j < evals.length; j++) {
      const cmp = compareHands(evals[j], evals[bestIdx[0]]);
      if (cmp > 0) bestIdx = [j];
      else if (cmp === 0) bestIdx.push(j);
    }

    if (bestIdx.length === 1) {
      results[bestIdx[0]].wins++;
    } else {
      bestIdx.forEach(idx => { results[idx].ties++; });
    }
    results.forEach(r => r.total++);
  }

  return results.map(r => ({
    equity: ((r.wins + r.ties / 2) / r.total * 100).toFixed(1),
    win: (r.wins / r.total * 100).toFixed(1),
    tie: (r.ties / r.total * 100).toFixed(1),
    lose: (((r.total - r.wins - r.ties) / r.total) * 100).toFixed(1),
  }));
}

// ═══ CARD PICKER ═══
function CardPicker({ selected, onSelect, usedCards, label }) {
  const [open, setOpen] = useState(false);

  return (
    <div style={{ position: 'relative' }}>
      <div onClick={() => setOpen(!open)} style={{
        display: 'flex', gap: 4, cursor: 'pointer', padding: '4px 8px',
        borderRadius: 6, background: 'rgba(0,0,0,0.2)', border: '1px solid rgba(255,255,255,0.08)',
        minHeight: 32, alignItems: 'center', minWidth: 80,
      }}>
        {selected.length > 0 ? selected.map((c, i) => (
          <span key={i} style={{ color: SUIT_COLORS[c[1]], fontSize: 13, fontWeight: 700, fontFamily: 'monospace' }}>
            {c[0]}{SUIT_SYMBOLS[c[1]]}
          </span>
        )) : (
          <span style={{ color: '#475569', fontSize: 11 }}>{label || 'Select'}</span>
        )}
      </div>
      {open && (
        <div style={{
          position: 'absolute', top: '100%', left: 0, zIndex: 100, marginTop: 4,
          background: '#1e293b', borderRadius: 8, padding: 8,
          border: '1px solid rgba(255,255,255,0.1)', boxShadow: '0 8px 24px rgba(0,0,0,0.5)',
        }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(13, 1fr)', gap: 2 }}>
            {SUITS.map(suit => RANKS.map(rank => {
              const card = rank + suit;
              const isUsed = usedCards.has(card) && !selected.includes(card);
              const isSel = selected.includes(card);
              return (
                <button key={card} disabled={isUsed} onClick={() => {
                  if (isSel) onSelect(selected.filter(c => c !== card));
                  else onSelect([...selected, card]);
                }} style={{
                  width: 24, height: 24, borderRadius: 3, border: 'none', cursor: isUsed ? 'default' : 'pointer',
                  background: isSel ? 'rgba(59,130,246,0.4)' : isUsed ? 'rgba(255,255,255,0.02)' : 'rgba(255,255,255,0.06)',
                  color: isUsed ? '#334155' : SUIT_COLORS[suit], fontSize: 9, fontWeight: 700,
                  opacity: isUsed ? 0.3 : 1,
                }}>
                  {rank}{SUIT_SYMBOLS[suit]}
                </button>
              );
            }))}
          </div>
          <button onClick={() => setOpen(false)} style={{
            marginTop: 6, width: '100%', padding: '4px', borderRadius: 4, border: 'none',
            background: '#3b82f6', color: '#fff', fontSize: 11, fontWeight: 600, cursor: 'pointer',
          }}>Done</button>
        </div>
      )}
    </div>
  );
}

// ═══ MAIN COMPONENT ═══
export default function EquityCalculatorTool() {
  const [players, setPlayers] = useState([
    { hand: ['As', 'Kh'], label: 'Player 1' },
    { hand: ['Qd', 'Qc'], label: 'Player 2' },
  ]);
  const [board, setBoard] = useState([]);
  const [results, setResults] = useState(null);
  const [iterations, setIterations] = useState(10000);
  const [running, setRunning] = useState(false);

  const usedCards = useMemo(() => {
    const set = new Set();
    players.forEach(p => p.hand.forEach(c => set.add(c)));
    board.forEach(c => set.add(c));
    return set;
  }, [players, board]);

  const updatePlayerHand = useCallback((idx, hand) => {
    setPlayers(prev => prev.map((p, i) => i === idx ? { ...p, hand } : p));
    setResults(null);
  }, []);

  const addPlayer = useCallback(() => {
    if (players.length >= 4) return;
    setPlayers(prev => [...prev, { hand: [], label: `Player ${prev.length + 1}` }]);
    setResults(null);
  }, [players]);

  const removePlayer = useCallback((idx) => {
    if (players.length <= 2) return;
    setPlayers(prev => prev.filter((_, i) => i !== idx));
    setResults(null);
  }, [players]);

  const calculate = useCallback(() => {
    const validPlayers = players.filter(p => p.hand.length === 2);
    if (validPlayers.length < 2) return;
    setRunning(true);
    setTimeout(() => {
      const res = runEquitySim(validPlayers.map(p => p.hand), board, iterations);
      setResults(res);
      setRunning(false);
    }, 50);
  }, [players, board, iterations]);

  return (
    <div style={{ background: 'rgba(15,23,42,0.6)', borderRadius: 12, padding: 20, border: '1px solid rgba(255,255,255,0.06)' }}>
      <h3 style={{ color: '#f1f5f9', fontSize: 18, fontWeight: 700, margin: '0 0 16px 0' }}>
        Equity Calculator
      </h3>

      {/* ═══ PLAYERS ═══ */}
      <div style={{ marginBottom: 16 }}>
        {players.map((player, idx) => (
          <div key={idx} style={{
            display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8,
            padding: '8px 12px', borderRadius: 8, background: 'rgba(0,0,0,0.15)',
            borderLeft: `3px solid ${PLAYER_COLORS[idx]}`,
          }}>
            <span style={{ color: PLAYER_COLORS[idx], fontSize: 12, fontWeight: 700, minWidth: 60 }}>
              {player.label}
            </span>
            <CardPicker selected={player.hand} onSelect={(h) => updatePlayerHand(idx, h.slice(0, 2))} usedCards={usedCards} label="Select 2 cards" />

            {/* Presets */}
            <select onChange={(e) => {
              const val = e.target.value;
              if (val === 'AA') updatePlayerHand(idx, ['As', 'Ah']);
              else if (val === 'KK') updatePlayerHand(idx, ['Ks', 'Kh']);
              else if (val === 'AKs') updatePlayerHand(idx, ['As', 'Ks']);
              e.target.value = '';
            }} style={{
              padding: '4px 8px', borderRadius: 4, background: 'rgba(255,255,255,0.06)',
              border: '1px solid rgba(255,255,255,0.08)', color: '#94a3b8', fontSize: 10,
            }}>
              <option value="">Quick</option>
              <option value="AA">AA</option>
              <option value="KK">KK</option>
              <option value="AKs">AKs</option>
            </select>

            {/* Results inline */}
            {results && results[idx] && (
              <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 8 }}>
                <div style={{ flex: 1, height: 20, borderRadius: 4, overflow: 'hidden', display: 'flex' }}>
                  <div style={{ width: `${results[idx].equity}%`, background: PLAYER_COLORS[idx], transition: 'width 0.3s', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <span style={{ color: '#fff', fontSize: 10, fontWeight: 800 }}>{results[idx].equity}%</span>
                  </div>
                  <div style={{ flex: 1, background: 'rgba(255,255,255,0.06)' }} />
                </div>
              </div>
            )}

            {players.length > 2 && (
              <button onClick={() => removePlayer(idx)} style={{
                width: 20, height: 20, borderRadius: '50%', border: 'none', cursor: 'pointer',
                background: 'rgba(239,68,68,0.15)', color: '#ef4444', fontSize: 12, fontWeight: 700,
              }}>×</button>
            )}
          </div>
        ))}

        {players.length < 4 && (
          <button onClick={addPlayer} style={{
            padding: '6px 12px', borderRadius: 6, border: '1px dashed rgba(255,255,255,0.1)',
            background: 'transparent', color: '#64748b', fontSize: 11, fontWeight: 600, cursor: 'pointer',
          }}>+ Add Player</button>
        )}
      </div>

      {/* ═══ BOARD ═══ */}
      <div style={{ marginBottom: 16 }}>
        <div style={{ color: '#64748b', fontSize: 11, fontWeight: 600, marginBottom: 6, textTransform: 'uppercase', letterSpacing: 1 }}>
          Board
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <CardPicker selected={board} onSelect={(b) => { setBoard(b.slice(0, 5)); setResults(null); }} usedCards={usedCards} label="Select up to 5 cards" />
          {board.length > 0 && (
            <button onClick={() => { setBoard([]); setResults(null); }} style={{
              padding: '4px 8px', borderRadius: 4, border: 'none', cursor: 'pointer',
              background: 'rgba(255,255,255,0.06)', color: '#64748b', fontSize: 10,
            }}>Clear</button>
          )}
          <span style={{ color: '#475569', fontSize: 10 }}>
            {board.length === 0 ? 'Preflop' : board.length === 3 ? 'Flop' : board.length === 4 ? 'Turn' : board.length === 5 ? 'River' : `${board.length} cards`}
          </span>
        </div>
      </div>

      {/* ═══ CONTROLS ═══ */}
      <div style={{ display: 'flex', gap: 12, alignItems: 'center', marginBottom: 16 }}>
        <button onClick={calculate} disabled={running || players.filter(p => p.hand.length === 2).length < 2} style={{
          padding: '10px 24px', borderRadius: 8, border: 'none', cursor: 'pointer',
          background: running ? 'rgba(255,255,255,0.06)' : 'linear-gradient(135deg, #3b82f6, #8b5cf6)',
          color: running ? '#475569' : '#fff', fontSize: 14, fontWeight: 700,
        }}>
          {running ? 'Calculating...' : 'Calculate Equity'}
        </button>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ color: '#64748b', fontSize: 10 }}>Iterations:</span>
          {[1000, 5000, 10000, 50000].map(n => (
            <button key={n} onClick={() => setIterations(n)} style={{
              padding: '3px 8px', borderRadius: 4, border: 'none', cursor: 'pointer',
              background: iterations === n ? '#3b82f6' : 'rgba(255,255,255,0.06)',
              color: iterations === n ? '#fff' : '#64748b', fontSize: 10, fontWeight: 600,
            }}>{n >= 1000 ? `${n / 1000}K` : n}</button>
          ))}
        </div>
      </div>

      {/* ═══ DETAILED RESULTS ═══ */}
      {results && (
        <div style={{ background: 'rgba(0,0,0,0.2)', borderRadius: 8, padding: 12 }}>
          <div style={{ color: '#64748b', fontSize: 11, fontWeight: 600, marginBottom: 8, textTransform: 'uppercase' }}>
            Results ({iterations.toLocaleString()} simulations)
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: `repeat(${players.length}, 1fr)`, gap: 12 }}>
            {players.map((player, idx) => {
              if (!results[idx]) return null;
              const r = results[idx];
              return (
                <div key={idx} style={{ textAlign: 'center' }}>
                  <div style={{ color: PLAYER_COLORS[idx], fontSize: 12, fontWeight: 700, marginBottom: 4 }}>{player.label}</div>
                  <div style={{ color: '#f1f5f9', fontSize: 28, fontWeight: 800, marginBottom: 4 }}>{r.equity}%</div>
                  <div style={{ display: 'flex', gap: 8, justifyContent: 'center' }}>
                    <div>
                      <div style={{ color: '#22c55e', fontSize: 10, fontWeight: 600 }}>Win</div>
                      <div style={{ color: '#f1f5f9', fontSize: 12, fontWeight: 700 }}>{r.win}%</div>
                    </div>
                    <div>
                      <div style={{ color: '#f59e0b', fontSize: 10, fontWeight: 600 }}>Tie</div>
                      <div style={{ color: '#f1f5f9', fontSize: 12, fontWeight: 700 }}>{r.tie}%</div>
                    </div>
                    <div>
                      <div style={{ color: '#ef4444', fontSize: 10, fontWeight: 600 }}>Lose</div>
                      <div style={{ color: '#f1f5f9', fontSize: 12, fontWeight: 700 }}>{r.lose}%</div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
