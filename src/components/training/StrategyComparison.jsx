/**
 * STRATEGY COMPARISON
 * ●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●
 * GTO Wizard-style side-by-side strategy comparison:
 * - Compare IP vs OOP strategies on same board
 * - Compare SRP vs 3-Bet pot strategies
 * - Compare different positions (BTN vs CO, etc.)
 * - Visual diff highlighting frequency differences
 * - EV comparison across scenarios
 * ●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●
 */

import React, { useState, useMemo } from 'react';

// ●●● RANKS & SUITS ●●●
const RANKS = ['A','K','Q','J','T','9','8','7','6','5','4','3','2'];

// ●●● COMPARISON PRESETS ●●●
const COMPARISON_PRESETS = [
  { id: 'ip_vs_oop', label: 'IP vs OOP', desc: 'BTN c-bet strategy vs BB facing c-bet', leftLabel: 'BTN (IP)', rightLabel: 'BB (OOP)' },
  { id: 'srp_vs_3bp', label: 'SRP vs 3-Bet Pot', desc: 'How strategy shifts in 3-bet pots', leftLabel: 'SRP', rightLabel: '3-Bet Pot' },
  { id: 'btn_vs_co', label: 'BTN vs CO', desc: 'Position-based strategy differences', leftLabel: 'BTN Open', rightLabel: 'CO Open' },
  { id: 'wet_vs_dry', label: 'Wet vs Dry Board', desc: 'Board texture impact on strategy', leftLabel: 'T♠ 9♥ 8♦', rightLabel: 'K♠ 7♦ 2♣' },
  { id: 'deep_vs_short', label: 'Deep vs Short Stack', desc: '100bb vs 25bb strategy shifts', leftLabel: '100bb Deep', rightLabel: '25bb Short' },
  { id: 'hu_vs_mw', label: 'Heads-Up vs Multiway', desc: 'How multiway changes ranges', leftLabel: 'Heads-Up', rightLabel: '3-Way' },
];

// ●●● GENERATE STRATEGY GRID ●●●
function generateStrategy(preset, side) {
  const grid = [];
  for (let r = 0; r < 13; r++) {
    const row = [];
    for (let c = 0; c < 13; c++) {
      const isPair = r === c;
      const isSuited = c > r;
      const highRank = Math.min(r, c);
      const lowRank = Math.max(r, c);

      // Base frequencies influenced by hand strength
      let bet = 0, check = 0, raise = 0, fold = 0;
      const strength = (13 - highRank) * 3 + (13 - lowRank) + (isPair ? 15 : 0) + (isSuited ? 5 : 0);

      if (preset === 'ip_vs_oop') {
        if (side === 'left') { // BTN IP c-bet
          bet = strength > 25 ? Math.min(95, 40 + strength * 1.2) : Math.max(5, strength * 1.5);
          check = 100 - bet;
        } else { // BB OOP facing c-bet
          if (strength > 30) { raise = 15 + (strength - 30) * 0.8; bet = 0; check = Math.max(0, 60 - strength * 0.5); fold = Math.max(0, 100 - raise - check); }
          else if (strength > 15) { raise = 5; check = 50; fold = 45; }
          else { raise = 0; check = 20; fold = 80; }
        }
      } else if (preset === 'srp_vs_3bp') {
        if (side === 'left') { // SRP — wider range, more checking
          bet = strength > 20 ? Math.min(80, 25 + strength * 0.8) : Math.max(5, strength);
          check = 100 - bet;
        } else { // 3BP — narrower range, more aggression
          bet = strength > 25 ? Math.min(95, 50 + strength * 1.0) : Math.max(10, strength * 1.8);
          check = 100 - bet;
        }
      } else if (preset === 'btn_vs_co') {
        if (side === 'left') { // BTN — wider opening
          bet = strength > 10 ? Math.min(90, 30 + strength * 1.1) : Math.max(5, strength * 2);
          check = 100 - bet;
        } else { // CO — tighter opening
          bet = strength > 18 ? Math.min(90, 35 + strength * 1.0) : Math.max(0, strength * 0.8);
          check = 100 - bet;
        }
      } else if (preset === 'wet_vs_dry') {
        if (side === 'left') { // Wet board — more checking, smaller bets
          bet = strength > 22 ? Math.min(75, 20 + strength * 0.8) : Math.max(10, strength * 1.2);
          check = 100 - bet;
        } else { // Dry board — more betting, larger sizing
          bet = strength > 15 ? Math.min(95, 40 + strength * 1.2) : Math.max(5, strength * 0.5);
          check = 100 - bet;
        }
      } else if (preset === 'deep_vs_short') {
        if (side === 'left') { // Deep — more speculative hands
          bet = strength > 12 ? Math.min(85, 30 + strength * 0.9) : Math.max(10, strength * 2);
          check = 100 - bet;
        } else { // Short — tighter, more all-in
          bet = strength > 22 ? Math.min(95, 50 + strength * 1.1) : Math.max(0, strength * 0.3);
          check = 100 - bet;
        }
      } else { // hu_vs_mw
        if (side === 'left') { // HU — wide range
          bet = strength > 10 ? Math.min(90, 35 + strength * 1.0) : Math.max(15, strength * 2.5);
          check = 100 - bet;
        } else { // Multiway — much tighter
          bet = strength > 25 ? Math.min(85, 30 + strength * 0.7) : Math.max(0, strength * 0.2);
          check = 100 - bet;
        }
      }

      // Normalize
      const total = bet + check + raise + fold;
      if (total > 0) { bet = (bet/total)*100; check = (check/total)*100; raise = (raise/total)*100; fold = (fold/total)*100; }

      const hand = isPair ? `${RANKS[r]}${RANKS[c]}` : isSuited ? `${RANKS[r]}${RANKS[c]}s` : `${RANKS[c]}${RANKS[r]}o`;
      row.push({ hand, bet: Math.round(bet), check: Math.round(check), raise: Math.round(raise), fold: Math.round(fold) });
    }
    grid.push(row);
  }
  return grid;
}

// ●●● CELL COLOR ●●●
function getCellColor(cell, mode) {
  if (mode === 'bet') {
    const v = cell.bet + cell.raise;
    if (v > 70) return 'rgba(239,68,68,0.7)';
    if (v > 40) return 'rgba(239,68,68,0.4)';
    if (v > 15) return 'rgba(239,68,68,0.2)';
    return 'rgba(59,130,246,0.2)';
  }
  if (mode === 'diff') return null; // handled separately
  return 'rgba(255,255,255,0.05)';
}

function getDiffColor(diff) {
  if (diff > 30) return 'rgba(239,68,68,0.6)';
  if (diff > 15) return 'rgba(245,158,11,0.5)';
  if (diff > 5) return 'rgba(245,158,11,0.25)';
  return 'rgba(34,197,94,0.15)';
}

// ●●● MINI GRID COMPONENT ●●●
function StrategyGrid({ grid, label, mode, otherGrid, showLabels }) {
  const [hovered, setHovered] = useState(null);

  return (
    <div>
      <div style={{ color: '#f1f5f9', fontSize: 13, fontWeight: 700, marginBottom: 8, textAlign: 'center' }}>
        {label}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: `repeat(13, 1fr)`, gap: 1 }}>
        {grid.map((row, r) => row.map((cell, c) => {
          const isDiff = mode === 'diff' && otherGrid;
          const diff = isDiff ? Math.abs(cell.bet - otherGrid[r][c].bet) : 0;
          const bg = isDiff ? getDiffColor(diff) : getCellColor(cell, mode);
          const isPair = r === c;
          const isSuited = c > r;

          return (
            <div
              key={`${r}-${c}`}
              onMouseEnter={() => setHovered({ r, c })}
              onMouseLeave={() => setHovered(null)}
              style={{
                position: 'relative',
                aspectRatio: '1',
                background: bg,
                borderRadius: 2,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                cursor: 'pointer',
                border: hovered?.r === r && hovered?.c === c ? '1px solid rgba(255,255,255,0.4)' : '1px solid transparent',
                transition: 'all 0.1s',
              }}
            >
              {showLabels && (
                <span style={{
                  color: isPair ? '#fbbf24' : isSuited ? '#34d399' : '#94a3b8',
                  fontSize: 7, fontWeight: 700, lineHeight: 1,
                }}>
                  {cell.hand}
                </span>
              )}
              {!showLabels && (
                <span style={{ color: '#94a3b8', fontSize: 7, fontWeight: 600 }}>
                  {isDiff ? `${diff}` : `${cell.bet}`}
                </span>
              )}
            </div>
          );
        }))}
      </div>

      {/* Stats summary */}
      <div style={{ display: 'flex', justifyContent: 'center', gap: 12, marginTop: 8 }}>
        {(() => {
          let totalBet = 0, totalCheck = 0, count = 0;
          grid.forEach(row => row.forEach(cell => { totalBet += cell.bet; totalCheck += cell.check; count++; }));
          return (
            <>
              <span style={{ color: '#ef4444', fontSize: 10, fontWeight: 600 }}>
                Bet/Raise: {Math.round(totalBet / count)}%
              </span>
              <span style={{ color: '#3b82f6', fontSize: 10, fontWeight: 600 }}>
                Check/Call: {Math.round(totalCheck / count)}%
              </span>
            </>
          );
        })()}
      </div>
    </div>
  );
}

// ●●● DIFF SUMMARY ●●●
function DiffSummary({ leftGrid, rightGrid }) {
  let totalDiff = 0, maxDiff = 0, maxHand = '', bigDiffs = 0;
  const diffs = [];

  leftGrid.forEach((row, r) => row.forEach((cell, c) => {
    const diff = Math.abs(cell.bet - rightGrid[r][c].bet);
    totalDiff += diff;
    diffs.push({ hand: cell.hand, diff });
    if (diff > maxDiff) { maxDiff = diff; maxHand = cell.hand; }
    if (diff > 20) bigDiffs++;
  }));

  const avgDiff = Math.round(totalDiff / 169);
  const topDiffs = [...diffs].sort((a, b) => b.diff - a.diff).slice(0, 5);

  return (
    <div style={{ background: 'rgba(0,0,0,0.2)', borderRadius: 8, padding: 12, marginTop: 12 }}>
      <div style={{ color: '#f1f5f9', fontSize: 13, fontWeight: 700, marginBottom: 8 }}>
        Difference Summary
      </div>
      <div style={{ display: 'flex', gap: 16, marginBottom: 12 }}>
        <div>
          <div style={{ color: '#64748b', fontSize: 9, fontWeight: 600, textTransform: 'uppercase' }}>Avg Diff</div>
          <div style={{ color: '#f59e0b', fontSize: 18, fontWeight: 800 }}>{avgDiff}%</div>
        </div>
        <div>
          <div style={{ color: '#64748b', fontSize: 9, fontWeight: 600, textTransform: 'uppercase' }}>Max Diff</div>
          <div style={{ color: '#ef4444', fontSize: 18, fontWeight: 800 }}>{maxDiff}%</div>
        </div>
        <div>
          <div style={{ color: '#64748b', fontSize: 9, fontWeight: 600, textTransform: 'uppercase' }}>Max Hand</div>
          <div style={{ color: '#f1f5f9', fontSize: 18, fontWeight: 800 }}>{maxHand}</div>
        </div>
        <div>
          <div style={{ color: '#64748b', fontSize: 9, fontWeight: 600, textTransform: 'uppercase' }}>Big Diffs (20%+)</div>
          <div style={{ color: '#a78bfa', fontSize: 18, fontWeight: 800 }}>{bigDiffs}</div>
        </div>
      </div>

      <div style={{ color: '#64748b', fontSize: 10, fontWeight: 600, textTransform: 'uppercase', marginBottom: 4 }}>
        Biggest Differences
      </div>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        {topDiffs.map((d, i) => (
          <div key={i} style={{
            padding: '4px 8px', borderRadius: 4,
            background: d.diff > 30 ? 'rgba(239,68,68,0.15)' : d.diff > 15 ? 'rgba(245,158,11,0.15)' : 'rgba(34,197,94,0.1)',
            color: d.diff > 30 ? '#ef4444' : d.diff > 15 ? '#f59e0b' : '#22c55e',
            fontSize: 11, fontWeight: 700,
          }}>
            {d.hand}: {d.diff}%
          </div>
        ))}
      </div>

      {/* Legend */}
      <div style={{ display: 'flex', gap: 12, marginTop: 10 }}>
        {[
          { color: 'rgba(34,197,94,0.4)', label: '< 5%' },
          { color: 'rgba(245,158,11,0.4)', label: '5-15%' },
          { color: 'rgba(245,158,11,0.7)', label: '15-30%' },
          { color: 'rgba(239,68,68,0.7)', label: '30%+' },
        ].map((l, i) => (
          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <div style={{ width: 10, height: 10, borderRadius: 2, background: l.color }} />
            <span style={{ color: '#64748b', fontSize: 9 }}>{l.label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ●●● MAIN COMPONENT ●●●
export default function StrategyComparison() {
  const [selectedPreset, setSelectedPreset] = useState('ip_vs_oop');
  const [viewMode, setViewMode] = useState('side'); // side | diff | overlay
  const [showLabels, setShowLabels] = useState(true);

  const preset = COMPARISON_PRESETS.find(p => p.id === selectedPreset);
  const leftGrid = useMemo(() => generateStrategy(selectedPreset, 'left'), [selectedPreset]);
  const rightGrid = useMemo(() => generateStrategy(selectedPreset, 'right'), [selectedPreset]);

  try {
    return (
      <div style={{ background: 'rgba(15,23,42,0.6)', borderRadius: 12, padding: 20, border: '1px solid rgba(255,255,255,0.06)' }}>
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <div>
            <h3 style={{ color: '#f1f5f9', fontSize: 18, fontWeight: 700, margin: 0 }}>
              Strategy Comparison
            </h3>
            <div style={{ color: '#64748b', fontSize: 11, marginTop: 2 }}>
              {preset?.desc}
            </div>
          </div>
          <div style={{ display: 'flex', gap: 4 }}>
            {['side', 'diff'].map(m => (
              <button key={m} onClick={() => setViewMode(m)} style={{
                padding: '4px 10px', borderRadius: 4, border: 'none', cursor: 'pointer',
                background: viewMode === m ? '#3b82f6' : 'rgba(255,255,255,0.06)',
                color: viewMode === m ? '#fff' : '#94a3b8',
                fontSize: 11, fontWeight: 600, textTransform: 'capitalize',
              }}>
                {m === 'side' ? 'Side by Side' : 'Diff View'}
              </button>
            ))}
            <button onClick={() => setShowLabels(!showLabels)} style={{
              padding: '4px 10px', borderRadius: 4, border: 'none', cursor: 'pointer',
              background: showLabels ? 'rgba(245,158,11,0.15)' : 'rgba(255,255,255,0.06)',
              color: showLabels ? '#f59e0b' : '#94a3b8',
              fontSize: 11, fontWeight: 600,
            }}>
              {showLabels ? 'Hands' : '%'}
            </button>
          </div>
        </div>

        {/* Preset selector */}
        <div style={{ display: 'flex', gap: 6, marginBottom: 16, flexWrap: 'wrap' }}>
          {COMPARISON_PRESETS.map(p => (
            <button key={p.id} onClick={() => setSelectedPreset(p.id)} style={{
              padding: '6px 12px', borderRadius: 6, border: 'none', cursor: 'pointer',
              background: selectedPreset === p.id ? 'rgba(59,130,246,0.2)' : 'rgba(255,255,255,0.04)',
              color: selectedPreset === p.id ? '#3b82f6' : '#94a3b8',
              fontSize: 11, fontWeight: 600,
              border: selectedPreset === p.id ? '1px solid rgba(59,130,246,0.3)' : '1px solid transparent',
            }}>
              {p.label}
            </button>
          ))}
        </div>

        {/* Grids */}
        {viewMode === 'side' ? (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
            <StrategyGrid grid={leftGrid} label={preset?.leftLabel} mode="bet" showLabels={showLabels} />
            <StrategyGrid grid={rightGrid} label={preset?.rightLabel} mode="bet" showLabels={showLabels} />
          </div>
        ) : (
          <div>
            <StrategyGrid
              grid={leftGrid}
              label={`${preset?.leftLabel} vs ${preset?.rightLabel} — Difference`}
              mode="diff"
              otherGrid={rightGrid}
              showLabels={showLabels}
            />
          </div>
        )}

        {/* Diff Summary */}
        <DiffSummary leftGrid={leftGrid} rightGrid={rightGrid} />

        {/* Key Insights */}
        <div style={{ marginTop: 12, background: 'rgba(0,0,0,0.1)', borderRadius: 6, padding: 10 }}>
          <div style={{ color: '#64748b', fontSize: 9, fontWeight: 600, textTransform: 'uppercase', marginBottom: 6 }}>
            Key Insights
          </div>
          <div style={{ color: '#94a3b8', fontSize: 11, lineHeight: 1.6 }}>
            {selectedPreset === 'ip_vs_oop' && 'IP has a significant betting advantage — BTN c-bets at high frequency while BB must defend carefully. Premium pairs and top pair+ hands see the largest strategic divergence.'}
            {selectedPreset === 'srp_vs_3bp' && 'In 3-bet pots, ranges are narrower and aggression increases. Marginal hands that check in SRPs become bets in 3BPs. Nut advantage shifts significantly.'}
            {selectedPreset === 'btn_vs_co' && 'BTN opens wider than CO, especially suited connectors and small pairs. CO compensates with tighter ranges and more aggression with premium holdings.'}
            {selectedPreset === 'wet_vs_dry' && 'Wet boards demand smaller, more frequent bets. Dry boards allow larger polarized sizing. Drawing hands see the biggest strategic shift between textures.'}
            {selectedPreset === 'deep_vs_short' && 'Deep stacks favor speculative hands (suited connectors, small pairs) while short stacks polarize to shove-or-fold. Implied odds vanish at 25bb.'}
            {selectedPreset === 'hu_vs_mw' && 'Multiway pots drastically tighten ranges. Hands that are clear bets heads-up become checks multiway. Equity realization drops significantly with more players.'}
          </div>
        </div>
      </div>
    );
  } catch (err) {
    return (
      <div style={{ background: 'rgba(15,23,42,0.6)', borderRadius: 12, padding: 20, border: '1px solid rgba(255,255,255,0.06)' }}>
        <h3 style={{ color: '#f1f5f9', fontSize: 18, margin: 0 }}>Strategy Comparison</h3>
        <p style={{ color: '#64748b', fontSize: 13 }}>Component loading... Please refresh if this persists.</p>
      </div>
    );
  }
}
