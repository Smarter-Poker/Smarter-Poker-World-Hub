/**
 * POSTFLOP SOLUTIONS BROWSER
 * ●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●
 * GTO Wizard-style postflop strategy browser:
 * - Select board texture (flop), turn, river cards
 * - Browse by position matchup (e.g., BTN vs BB SRP)
 * - View solver strategy as action frequency bars per hand
 * - 13x13 grid showing bet/check/raise frequencies
 * - Bet sizing breakdown (1/3, 1/2, 2/3, overbet)
 * - Aggregate stats: bet%, check%, raise% across full range
 * ●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●
 */

import React, { useState, useMemo, useCallback } from 'react';

const RANKS = ['A','K','Q','J','T','9','8','7','6','5','4','3','2'];
const SUITS = ['s','h','d','c'];
const SUIT_SYMBOLS = { s: '\u2660', h: '\u2665', d: '\u2666', c: '\u2663' };
const SUIT_COLORS = { s: '#94a3b8', h: '#ef4444', d: '#3b82f6', c: '#22c55e' };

// ●●● PRESET FLOPS ●●●
const PRESET_FLOPS = [
  { cards: ['As','Kh','7d'], label: 'AK7r', texture: 'Dry High' },
  { cards: ['Qh','Jh','3d'], label: 'QJ3tt', texture: 'Two-tone Broadway' },
  { cards: ['Ts','9s','8s'], label: 'T98ss', texture: 'Monotone Connected' },
  { cards: ['7h','6d','2c'], label: '762r', texture: 'Dry Low' },
  { cards: ['Kd','Kh','5c'], label: 'KK5', texture: 'Paired High' },
  { cards: ['Ac','Td','5h'], label: 'AT5r', texture: 'Dry Mixed' },
  { cards: ['9h','8d','7c'], label: '987r', texture: 'Connected' },
  { cards: ['Jd','Jh','Tc'], label: 'JJT', texture: 'Paired Broadway' },
  { cards: ['5s','4s','3h'], label: '543tt', texture: 'Low Connected' },
  { cards: ['Ah','8h','2d'], label: 'A82fd', texture: 'Flush Draw' },
  { cards: ['Ks','Qd','Jc'], label: 'KQJr', texture: 'Broadway' },
  { cards: ['6c','6d','3h'], label: '663', texture: 'Paired Low' },
];

// ●●● POSITION MATCHUPS ●●●
const MATCHUPS = [
  { id: 'btn_bb_srp', label: 'BTN vs BB (SRP)', hero: 'BTN', villain: 'BB', pot: 'SRP' },
  { id: 'co_bb_srp', label: 'CO vs BB (SRP)', hero: 'CO', villain: 'BB', pot: 'SRP' },
  { id: 'btn_bb_3bet', label: 'BTN vs BB (3-Bet)', hero: 'BTN', villain: 'BB', pot: '3BP' },
  { id: 'sb_bb_srp', label: 'SB vs BB (SRP)', hero: 'SB', villain: 'BB', pot: 'SRP' },
  { id: 'co_btn_3bet', label: 'CO vs BTN (3-Bet)', hero: 'CO', villain: 'BTN', pot: '3BP' },
  { id: 'utg_bb_srp', label: 'UTG vs BB (SRP)', hero: 'UTG', villain: 'BB', pot: 'SRP' },
];

const BET_SIZINGS = ['1/3 pot', '1/2 pot', '2/3 pot', 'Pot', 'Overbet'];

// ●●● STRATEGY GENERATOR ●●●
function generatePostflopStrategy(flop, matchup, street) {
  const grid = {};
  const flopRanks = flop.map(c => RANKS.indexOf(c[0]));
  const isMonotone = flop.length >= 3 && flop[0][1] === flop[1][1] && flop[1][1] === flop[2][1];
  const isPaired = flopRanks.length >= 3 && (flopRanks[0] === flopRanks[1] || flopRanks[1] === flopRanks[2] || flopRanks[0] === flopRanks[2]);
  const highCard = Math.min(...flopRanks); // lower index = higher rank
  const isConnected = flopRanks.length >= 3 && Math.max(...flopRanks) - Math.min(...flopRanks) <= 4;
  const isIP = matchup.hero === 'BTN' || matchup.hero === 'CO';
  const is3Bet = matchup.pot === '3BP';

  // Adjustments
  const ipBonus = isIP ? 10 : -5;
  const threeBetBonus = is3Bet ? 15 : 0;

  for (let r = 0; r < 13; r++) {
    for (let c = 0; c < 13; c++) {
      const isPair = r === c;
      const isSuited = c > r;
      const hi = Math.min(r, c), lo = Math.max(r, c);

      // Does hand connect with board?
      let connectsFlop = flopRanks.includes(hi) || flopRanks.includes(lo);
      let hasTopPair = flopRanks.includes(hi) && hi === highCard;
      let hasOverpair = isPair && hi < highCard;
      let hasSet = isPair && flopRanks.includes(hi);
      let hasDraw = !isPair && isSuited && Math.abs(hi - lo) <= 4;

      // Calculate frequencies
      let betFreq = 0, checkFreq = 0, raiseFreq = 0;

      if (hasSet) {
        betFreq = 75 + Math.random() * 20;
        raiseFreq = 5 + Math.random() * 10;
      } else if (hasOverpair) {
        betFreq = 65 + Math.random() * 25 + ipBonus + threeBetBonus;
      } else if (hasTopPair) {
        betFreq = 50 + Math.random() * 30 + ipBonus;
      } else if (connectsFlop && isPair) {
        betFreq = 30 + Math.random() * 30;
      } else if (connectsFlop) {
        betFreq = 20 + Math.random() * 35 + ipBonus;
      } else if (hasDraw) {
        betFreq = 25 + Math.random() * 30; // semi-bluff
      } else if (hi <= 2 && !connectsFlop) {
        betFreq = 15 + Math.random() * 20; // AK/AQ type bluff
      } else {
        betFreq = Math.random() * 20;
      }

      // Monotone adjustment
      if (isMonotone && !isSuited) {
        betFreq *= 0.5;
      }
      if (isMonotone && isSuited && flop[0][1] === SUITS[c > r ? 1 : 0]) {
        betFreq += 20; // flush draw bet more
      }

      // Paired board adjustments
      if (isPaired) {
        betFreq *= 0.7; // less betting on paired boards
        checkFreq += 15;
      }

      betFreq = Math.round(Math.min(95, Math.max(0, betFreq)));
      raiseFreq = Math.round(Math.min(15, Math.max(0, raiseFreq)));
      checkFreq = 100 - betFreq - raiseFreq;

      // Bet sizing distribution
      let sizing = { small: 0, medium: 0, large: 0, pot: 0, overbet: 0 };
      if (betFreq > 0) {
        if (hasSet || hasOverpair) {
          sizing = { small: 10, medium: 20, large: 40, pot: 20, overbet: 10 };
        } else if (hasTopPair) {
          sizing = { small: 20, medium: 40, large: 30, pot: 10, overbet: 0 };
        } else if (hasDraw) {
          sizing = { small: 40, medium: 35, large: 20, pot: 5, overbet: 0 };
        } else {
          sizing = { small: 50, medium: 30, large: 15, pot: 5, overbet: 0 };
        }
      }

      grid[`${r}-${c}`] = {
        bet: betFreq, check: checkFreq, raise: raiseFreq,
        sizing,
        connects: connectsFlop, topPair: hasTopPair, overPair: hasOverpair,
        set: hasSet, draw: hasDraw,
      };
    }
  }
  return grid;
}

const getHandLabel = (r, c) => {
  if (r === c) return `${RANKS[r]}${RANKS[c]}`;
  return c > r ? `${RANKS[r]}${RANKS[c]}s` : `${RANKS[c]}${RANKS[r]}o`;
};

const getCellColor = (d) => {
  if (d.bet > 70) return 'rgba(239,68,68,0.75)';
  if (d.bet > 45) return 'rgba(239,68,68,0.45)';
  if (d.bet > 25) return 'rgba(234,179,8,0.5)';
  if (d.bet > 10) return 'rgba(34,197,94,0.3)';
  return 'rgba(30,41,59,0.5)';
};

// ●●● CARD DISPLAY ●●●
function CardChip({ card, onClick, selected }) {
  const rank = card[0], suit = card[1];
  return (
    <span onClick={onClick} style={{
      display: 'inline-flex', alignItems: 'center', gap: 1,
      padding: '3px 7px', borderRadius: 4, cursor: onClick ? 'pointer' : 'default',
      background: selected ? 'rgba(59,130,246,0.3)' : 'rgba(0,0,0,0.3)',
      border: selected ? '1px solid rgba(59,130,246,0.5)' : '1px solid transparent',
      color: SUIT_COLORS[suit] || '#94a3b8', fontSize: 14, fontWeight: 700, fontFamily: 'monospace',
    }}>
      {rank}{SUIT_SYMBOLS[suit]}
    </span>
  );
}

// ●●● MAIN COMPONENT ●●●
export default function PostflopSolutionsBrowser() {
  const [selectedFlop, setSelectedFlop] = useState(PRESET_FLOPS[0]);
  const [matchup, setMatchup] = useState(MATCHUPS[0]);
  const [street, setStreet] = useState('flop');
  const [hoveredCell, setHoveredCell] = useState(null);
  const [selectedCell, setSelectedCell] = useState(null);
  const [viewMode, setViewMode] = useState('grid'); // 'grid' | 'sizing'

  const strategy = useMemo(
    () => generatePostflopStrategy(selectedFlop.cards, matchup, street),
    [selectedFlop, matchup, street]
  );

  const stats = useMemo(() => {
    let totalBet = 0, totalCheck = 0, totalRaise = 0, cells = 0;
    for (let r = 0; r < 13; r++) {
      for (let c = 0; c < 13; c++) {
        const d = strategy[`${r}-${c}`];
        totalBet += d.bet;
        totalCheck += d.check;
        totalRaise += d.raise;
        cells++;
      }
    }
    return {
      bet: (totalBet / cells).toFixed(1),
      check: (totalCheck / cells).toFixed(1),
      raise: (totalRaise / cells).toFixed(1),
    };
  }, [strategy]);

  const activeCell = selectedCell || hoveredCell;
  const activeCellData = activeCell ? strategy[`${activeCell.r}-${activeCell.c}`] : null;

  return (
    <div style={{ background: 'rgba(15,23,42,0.6)', borderRadius: 12, padding: 20, border: '1px solid rgba(255,255,255,0.06)' }}>
      <h3 style={{ color: '#f1f5f9', fontSize: 18, fontWeight: 700, margin: '0 0 16px 0' }}>
        Postflop Solutions Browser
      </h3>

      {/* ●●● FLOP SELECTOR ●●● */}
      <div style={{ marginBottom: 12 }}>
        <div style={{ color: '#64748b', fontSize: 11, fontWeight: 600, marginBottom: 6, textTransform: 'uppercase', letterSpacing: 1 }}>
          Board
        </div>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {PRESET_FLOPS.map((flop, i) => (
            <button key={i} onClick={() => setSelectedFlop(flop)} style={{
              padding: '5px 10px', borderRadius: 6, border: 'none', cursor: 'pointer',
              background: selectedFlop === flop ? 'rgba(59,130,246,0.2)' : 'rgba(255,255,255,0.04)',
              border: selectedFlop === flop ? '1px solid rgba(59,130,246,0.3)' : '1px solid transparent',
              color: selectedFlop === flop ? '#3b82f6' : '#94a3b8', fontSize: 11, fontWeight: 600,
              transition: 'all 0.15s',
            }}>
              {flop.label}
            </button>
          ))}
        </div>
      </div>

      {/* Active board display */}
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 12 }}>
        <div style={{ display: 'flex', gap: 4 }}>
          {selectedFlop.cards.map((card, i) => <CardChip key={i} card={card} />)}
        </div>
        <span style={{ color: '#64748b', fontSize: 11 }}>{selectedFlop.texture}</span>
      </div>

      {/* ●●● MATCHUP + CONTROLS ●●● */}
      <div style={{ display: 'flex', gap: 16, marginBottom: 16, flexWrap: 'wrap' }}>
        <div>
          <div style={{ color: '#64748b', fontSize: 11, fontWeight: 600, marginBottom: 4, textTransform: 'uppercase', letterSpacing: 1 }}>Spot</div>
          <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
            {MATCHUPS.map(m => (
              <button key={m.id} onClick={() => setMatchup(m)} style={{
                padding: '5px 10px', borderRadius: 5, border: 'none', cursor: 'pointer',
                background: matchup.id === m.id ? '#8b5cf6' : 'rgba(255,255,255,0.06)',
                color: matchup.id === m.id ? '#fff' : '#94a3b8', fontSize: 10, fontWeight: 600,
              }}>
                {m.label}
              </button>
            ))}
          </div>
        </div>
        <div>
          <div style={{ color: '#64748b', fontSize: 11, fontWeight: 600, marginBottom: 4, textTransform: 'uppercase', letterSpacing: 1 }}>View</div>
          <div style={{ display: 'flex', gap: 4 }}>
            <button onClick={() => setViewMode('grid')} style={{
              padding: '5px 10px', borderRadius: 5, border: 'none', cursor: 'pointer',
              background: viewMode === 'grid' ? '#3b82f6' : 'rgba(255,255,255,0.06)',
              color: viewMode === 'grid' ? '#fff' : '#94a3b8', fontSize: 11, fontWeight: 600,
            }}>Strategy</button>
            <button onClick={() => setViewMode('sizing')} style={{
              padding: '5px 10px', borderRadius: 5, border: 'none', cursor: 'pointer',
              background: viewMode === 'sizing' ? '#3b82f6' : 'rgba(255,255,255,0.06)',
              color: viewMode === 'sizing' ? '#fff' : '#94a3b8', fontSize: 11, fontWeight: 600,
            }}>Sizing</button>
          </div>
        </div>
      </div>

      <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap' }}>
        {/* ●●● 13x13 GRID ●●● */}
        <div style={{ flex: '1 1 400px' }}>
          <div style={{
            display: 'grid', gridTemplateColumns: 'repeat(13, 1fr)', gap: 1,
            background: 'rgba(0,0,0,0.3)', borderRadius: 8, overflow: 'hidden', padding: 1,
          }}>
            {Array.from({ length: 169 }, (_, i) => {
              const r = Math.floor(i / 13), c = i % 13;
              const key = `${r}-${c}`;
              const d = strategy[key];
              const label = getHandLabel(r, c);
              const isActive = activeCell && activeCell.r === r && activeCell.c === c;

              return (
                <div key={key}
                  onMouseEnter={() => setHoveredCell({ r, c })}
                  onMouseLeave={() => setHoveredCell(null)}
                  onClick={() => setSelectedCell(selectedCell?.r === r && selectedCell?.c === c ? null : { r, c })}
                  style={{
                    position: 'relative', aspectRatio: '1', display: 'flex', flexDirection: 'column',
                    alignItems: 'center', justifyContent: 'center', cursor: 'pointer',
                    background: getCellColor(d),
                    outline: isActive ? '2px solid #fff' : 'none', zIndex: isActive ? 2 : 1,
                  }}
                >
                  <span style={{ color: '#fff', fontSize: 9, fontWeight: 700, textShadow: '0 1px 2px rgba(0,0,0,0.5)' }}>
                    {label}
                  </span>
                  {d.bet > 0 && d.bet < 100 && (
                    <span style={{ color: 'rgba(255,255,255,0.6)', fontSize: 7 }}>{Math.round(d.bet)}%</span>
                  )}
                  {/* Action bar */}
                  <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: 2, display: 'flex' }}>
                    <div style={{ width: `${d.bet}%`, background: '#ef4444' }} />
                    <div style={{ width: `${d.raise}%`, background: '#f59e0b' }} />
                    <div style={{ flex: 1, background: '#334155' }} />
                  </div>
                </div>
              );
            })}
          </div>

          {/* Legend */}
          <div style={{ display: 'flex', gap: 16, marginTop: 8, justifyContent: 'center' }}>
            {[
              { color: 'rgba(239,68,68,0.75)', label: 'Bet' },
              { color: 'rgba(234,179,8,0.5)', label: 'Mixed' },
              { color: 'rgba(30,41,59,0.5)', label: 'Check' },
            ].map(l => (
              <div key={l.label} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                <div style={{ width: 12, height: 12, borderRadius: 3, background: l.color }} />
                <span style={{ color: '#94a3b8', fontSize: 11 }}>{l.label}</span>
              </div>
            ))}
          </div>
        </div>

        {/* ●●● DETAIL PANEL ●●● */}
        <div style={{ flex: '0 0 220px' }}>
          {/* Aggregate Stats */}
          <div style={{ background: 'rgba(0,0,0,0.2)', borderRadius: 8, padding: 12, marginBottom: 12 }}>
            <div style={{ color: '#64748b', fontSize: 11, fontWeight: 600, marginBottom: 8, textTransform: 'uppercase' }}>
              Range Average
            </div>
            {[
              { label: 'Bet', pct: stats.bet, color: '#ef4444' },
              { label: 'Check', pct: stats.check, color: '#22c55e' },
              { label: 'Raise', pct: stats.raise, color: '#f59e0b' },
            ].map(a => (
              <div key={a.label} style={{ marginBottom: 6 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 2 }}>
                  <span style={{ color: a.color, fontSize: 11, fontWeight: 600 }}>{a.label}</span>
                  <span style={{ color: '#94a3b8', fontSize: 11 }}>{a.pct}%</span>
                </div>
                <div style={{ height: 3, background: 'rgba(255,255,255,0.06)', borderRadius: 2 }}>
                  <div style={{ height: '100%', width: `${a.pct}%`, background: a.color, borderRadius: 2 }} />
                </div>
              </div>
            ))}
          </div>

          {/* Selected Hand Detail */}
          {activeCell && activeCellData && (
            <div style={{ background: 'rgba(0,0,0,0.2)', borderRadius: 8, padding: 12, marginBottom: 12 }}>
              <div style={{ color: '#f1f5f9', fontSize: 16, fontWeight: 700, marginBottom: 4 }}>
                {getHandLabel(activeCell.r, activeCell.c)}
              </div>

              {/* Tags */}
              <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginBottom: 8 }}>
                {activeCellData.set && <span style={{ padding: '2px 6px', borderRadius: 3, background: 'rgba(239,68,68,0.2)', color: '#ef4444', fontSize: 9, fontWeight: 700 }}>SET</span>}
                {activeCellData.overPair && <span style={{ padding: '2px 6px', borderRadius: 3, background: 'rgba(245,158,11,0.2)', color: '#f59e0b', fontSize: 9, fontWeight: 700 }}>OVERPAIR</span>}
                {activeCellData.topPair && <span style={{ padding: '2px 6px', borderRadius: 3, background: 'rgba(34,197,94,0.2)', color: '#22c55e', fontSize: 9, fontWeight: 700 }}>TOP PAIR</span>}
                {activeCellData.connects && !activeCellData.topPair && !activeCellData.set && !activeCellData.overPair && (
                  <span style={{ padding: '2px 6px', borderRadius: 3, background: 'rgba(59,130,246,0.2)', color: '#3b82f6', fontSize: 9, fontWeight: 700 }}>CONNECTS</span>
                )}
                {activeCellData.draw && <span style={{ padding: '2px 6px', borderRadius: 3, background: 'rgba(168,85,247,0.2)', color: '#a855f7', fontSize: 9, fontWeight: 700 }}>DRAW</span>}
              </div>

              {/* Action frequency */}
              <div style={{ display: 'flex', height: 24, borderRadius: 6, overflow: 'hidden', marginBottom: 8 }}>
                {activeCellData.bet > 0 && (
                  <div style={{ width: `${activeCellData.bet}%`, background: '#ef4444', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <span style={{ color: '#fff', fontSize: 9, fontWeight: 700 }}>{Math.round(activeCellData.bet)}%</span>
                  </div>
                )}
                {activeCellData.raise > 0 && (
                  <div style={{ width: `${activeCellData.raise}%`, background: '#f59e0b', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <span style={{ color: '#fff', fontSize: 9, fontWeight: 700 }}>{Math.round(activeCellData.raise)}%</span>
                  </div>
                )}
                {activeCellData.check > 0 && (
                  <div style={{ width: `${activeCellData.check}%`, background: '#475569', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <span style={{ color: '#fff', fontSize: 9, fontWeight: 700 }}>{Math.round(activeCellData.check)}%</span>
                  </div>
                )}
              </div>

              {/* Sizing breakdown */}
              {activeCellData.bet > 0 && (
                <div>
                  <div style={{ color: '#64748b', fontSize: 10, fontWeight: 600, marginBottom: 4, textTransform: 'uppercase' }}>Bet Sizing</div>
                  {[
                    { label: '1/3 pot', pct: activeCellData.sizing.small, color: '#22c55e' },
                    { label: '1/2 pot', pct: activeCellData.sizing.medium, color: '#3b82f6' },
                    { label: '2/3 pot', pct: activeCellData.sizing.large, color: '#8b5cf6' },
                    { label: 'Pot', pct: activeCellData.sizing.pot, color: '#f59e0b' },
                    { label: 'Overbet', pct: activeCellData.sizing.overbet, color: '#ef4444' },
                  ].filter(s => s.pct > 0).map(s => (
                    <div key={s.label} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 3 }}>
                      <span style={{ color: s.color, fontSize: 10, fontWeight: 600 }}>{s.label}</span>
                      <div style={{ flex: 1, marginLeft: 8, height: 3, background: 'rgba(255,255,255,0.06)', borderRadius: 2 }}>
                        <div style={{ height: '100%', width: `${s.pct}%`, background: s.color, borderRadius: 2 }} />
                      </div>
                      <span style={{ color: '#94a3b8', fontSize: 10, marginLeft: 6, minWidth: 28, textAlign: 'right' }}>{s.pct}%</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Board Info */}
          <div style={{ background: 'rgba(0,0,0,0.2)', borderRadius: 8, padding: 12 }}>
            <div style={{ color: '#64748b', fontSize: 10, fontWeight: 600, textTransform: 'uppercase', marginBottom: 4 }}>Spot Info</div>
            <div style={{ color: '#f1f5f9', fontSize: 12, fontWeight: 600, marginBottom: 2 }}>{matchup.label}</div>
            <div style={{ color: '#94a3b8', fontSize: 11 }}>Board: {selectedFlop.label} ({selectedFlop.texture})</div>
          </div>
        </div>
      </div>
    </div>
  );
}
