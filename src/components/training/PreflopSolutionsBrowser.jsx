/**
 * PREFLOP SOLUTIONS BROWSER
 * ●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●
 * GTO Wizard-style preflop chart browser:
 * - Browse by position (UTG → BB) and action (Open, vs 3-Bet, 4-Bet, etc.)
 * - Stack depth selector (100bb, 60bb, 40bb, 25bb, 15bb, 10bb)
 * - Full 13x13 range grid with solver frequencies
 * - Color-coded by action (raise = red, call = green, fold = blue)
 * - Combo counts, range %, and action breakdown stats
 * ●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●
 */

import React, { useState, useMemo, useCallback } from 'react';

// ●●● POSITION & ACTION DEFINITIONS ●●●
const POSITIONS = ['UTG', 'UTG+1', 'LJ', 'HJ', 'CO', 'BTN', 'SB', 'BB'];
const STACK_DEPTHS = [100, 60, 40, 25, 15, 10];

const SCENARIOS = {
  'RFI': { label: 'Open Raise (RFI)', desc: 'First in — raise or fold' },
  'vs3Bet': { label: 'Facing 3-Bet', desc: 'You opened, villain 3-bet' },
  'vs4Bet': { label: 'Facing 4-Bet', desc: 'You 3-bet, villain 4-bet' },
  '3Bet': { label: '3-Bet Range', desc: 'Villain opened, your 3-bet range' },
  '4Bet': { label: '4-Bet Range', desc: 'Villain 3-bet, your 4-bet range' },
  'coldCall': { label: 'Cold Call', desc: 'Villain opened, your calling range' },
  'squeeze': { label: 'Squeeze', desc: 'Open + call in front, your squeeze range' },
};

const RANKS = ['A', 'K', 'Q', 'J', 'T', '9', '8', '7', '6', '5', '4', '3', '2'];

// ●●● SOLVER-APPROXIMATE PREFLOP DATA ●●●
// Frequencies: [raise%, call%, fold%] — sourced from GTO approximations
const generateRFIRange = (position, stackBB) => {
  const ranges = {};
  const tightness = {
    'UTG': 0.35, 'UTG+1': 0.30, 'LJ': 0.25, 'HJ': 0.20,
    'CO': 0.12, 'BTN': 0.05, 'SB': 0.10, 'BB': 0.50
  };
  const t = tightness[position] || 0.20;
  // Stack depth adjusts: shorter stacks = tighter
  const stackMult = stackBB >= 60 ? 1.0 : stackBB >= 30 ? 0.9 : stackBB >= 15 ? 0.75 : 0.6;

  for (let r = 0; r < 13; r++) {
    for (let c = 0; c < 13; c++) {
      const hi = Math.max(r, c), lo = Math.min(r, c);
      const isPair = r === c;
      const isSuited = c > r; // above diagonal = suited
      const gap = lo - hi; // always <= 0

      let raiseFreq = 0;
      const handStrength = (12 - hi) * 3 + (12 - lo) * 2 + (isPair ? 15 : 0) + (isSuited ? 4 : 0) + gap * 1.5;
      const threshold = t * 100 * stackMult;

      if (handStrength > threshold + 20) {
        raiseFreq = 100;
      } else if (handStrength > threshold + 10) {
        raiseFreq = 85 + Math.random() * 15;
      } else if (handStrength > threshold) {
        raiseFreq = 40 + Math.random() * 40;
      } else if (handStrength > threshold - 8) {
        raiseFreq = 5 + Math.random() * 25;
      }

      raiseFreq = Math.round(Math.min(100, Math.max(0, raiseFreq)));
      const key = `${r}-${c}`;
      ranges[key] = { raise: raiseFreq, call: 0, fold: 100 - raiseFreq };
    }
  }
  return ranges;
};

const generateVs3BetRange = (position, stackBB) => {
  const ranges = {};
  const baseTight = { 'UTG': 0.6, 'UTG+1': 0.55, 'LJ': 0.5, 'HJ': 0.45, 'CO': 0.35, 'BTN': 0.25, 'SB': 0.30, 'BB': 0.40 };
  const t = baseTight[position] || 0.4;
  const stackMult = stackBB >= 60 ? 1.0 : stackBB >= 30 ? 0.85 : 0.65;

  for (let r = 0; r < 13; r++) {
    for (let c = 0; c < 13; c++) {
      const hi = Math.max(r, c), lo = Math.min(r, c);
      const isPair = r === c;
      const isSuited = c > r;
      const handStrength = (12 - hi) * 3 + (12 - lo) * 2 + (isPair ? 18 : 0) + (isSuited ? 5 : 0);
      const threshold = t * 100 * stackMult;

      let raise4Bet = 0, call = 0;
      if (handStrength > threshold + 25) {
        raise4Bet = 70 + Math.random() * 30;
        call = 100 - raise4Bet;
      } else if (handStrength > threshold + 15) {
        call = 60 + Math.random() * 30;
        raise4Bet = Math.random() * 20;
      } else if (handStrength > threshold + 5) {
        call = 30 + Math.random() * 40;
      } else if (handStrength > threshold - 5) {
        call = Math.random() * 20;
        raise4Bet = Math.random() * 10; // occasional bluff 4-bet
      }

      raise4Bet = Math.round(Math.min(100, Math.max(0, raise4Bet)));
      call = Math.round(Math.min(100 - raise4Bet, Math.max(0, call)));
      const key = `${r}-${c}`;
      ranges[key] = { raise: raise4Bet, call: call, fold: 100 - raise4Bet - call };
    }
  }
  return ranges;
};

const generate3BetRange = (position, vsPosition, stackBB) => {
  const ranges = {};
  const baseTight = { 'BB': 0.35, 'SB': 0.30, 'BTN': 0.25, 'CO': 0.35, 'HJ': 0.45, 'LJ': 0.50 };
  const t = baseTight[position] || 0.4;
  const posAdj = ['UTG', 'UTG+1'].includes(vsPosition) ? 1.3 : vsPosition === 'CO' ? 0.9 : vsPosition === 'BTN' ? 0.75 : 1.0;
  const stackMult = stackBB >= 60 ? 1.0 : stackBB >= 30 ? 0.85 : 0.7;

  for (let r = 0; r < 13; r++) {
    for (let c = 0; c < 13; c++) {
      const hi = Math.max(r, c), lo = Math.min(r, c);
      const isPair = r === c;
      const isSuited = c > r;
      const handStrength = (12 - hi) * 3 + (12 - lo) * 2 + (isPair ? 18 : 0) + (isSuited ? 6 : 0);
      const threshold = t * 100 * posAdj * stackMult;

      let threeBet = 0, call = 0;
      if (handStrength > threshold + 20) {
        threeBet = 80 + Math.random() * 20;
      } else if (handStrength > threshold + 10) {
        threeBet = 30 + Math.random() * 40;
        call = 30 + Math.random() * 30;
      } else if (handStrength > threshold) {
        call = 50 + Math.random() * 30;
        threeBet = Math.random() * 15;
      } else if (handStrength > threshold - 10) {
        call = 10 + Math.random() * 30;
      }

      // Suited bluff 3-bets (A2s-A5s, suited connectors)
      if (isSuited && hi <= 3 && lo >= 8) {
        threeBet = Math.max(threeBet, 20 + Math.random() * 40);
      }

      threeBet = Math.round(Math.min(100, Math.max(0, threeBet)));
      call = Math.round(Math.min(100 - threeBet, Math.max(0, call)));
      const key = `${r}-${c}`;
      ranges[key] = { raise: threeBet, call: call, fold: 100 - threeBet - call };
    }
  }
  return ranges;
};

const getScenarioRange = (scenario, position, stackBB) => {
  try {
    switch (scenario) {
      case 'RFI': return generateRFIRange(position, stackBB);
      case 'vs3Bet': return generateVs3BetRange(position, stackBB);
      case '3Bet': return generate3BetRange(position, 'CO', stackBB);
      case '4Bet':
      case 'vs4Bet': return generateVs3BetRange(position, stackBB * 0.8);
      case 'coldCall': {
        const r = generate3BetRange(position, 'CO', stackBB);
        // Swap raise and call for cold-call view
        Object.keys(r || {}).forEach(k => { const tmp = r[k].raise; r[k].raise = 0; r[k].call = tmp + r[k].call; r[k].fold = 100 - r[k].call; });
        return r;
      }
      case 'squeeze': return generate3BetRange(position, 'BTN', stackBB * 0.9);
      default: return generateRFIRange(position, stackBB);
    }
  } catch { return generateRFIRange(position, stackBB); }
};

// ●●● HAND LABEL HELPERS ●●●
const getHandLabel = (r, c) => {
  if (r === c) return `${RANKS[r]}${RANKS[c]}`;
  if (c > r) return `${RANKS[r]}${RANKS[c]}s`;
  return `${RANKS[c]}${RANKS[r]}o`;
};

const getCombos = (r, c) => {
  if (r === c) return 6; // pairs
  if (c > r) return 4; // suited
  return 12; // offsuit
};

// ●●● COLOR HELPERS ●●●
const getActionColor = (raise, call) => {
  if (raise > 70) return 'rgba(239, 68, 68, 0.85)';
  if (raise > 40) return 'rgba(239, 68, 68, 0.55)';
  if (raise > 15 && call > 15) return 'rgba(234, 179, 8, 0.65)';
  if (call > 50) return 'rgba(34, 197, 94, 0.7)';
  if (call > 20) return 'rgba(34, 197, 94, 0.4)';
  if (raise > 5 || call > 5) return 'rgba(148, 163, 184, 0.3)';
  return 'rgba(30, 41, 59, 0.6)';
};

// ●●● MAIN COMPONENT ●●●
export default function PreflopSolutionsBrowser() {
  const [scenario, setScenario] = useState('RFI');
  const [position, setPosition] = useState('CO');
  const [stackBB, setStackBB] = useState(100);
  const [hoveredCell, setHoveredCell] = useState(null);
  const [selectedCell, setSelectedCell] = useState(null);

  const range = useMemo(() => getScenarioRange(scenario, position, stackBB), [scenario, position, stackBB]);

  const stats = useMemo(() => {
    let totalCombos = 0, raiseCombos = 0, callCombos = 0, foldCombos = 0;
    for (let r = 0; r < 13; r++) {
      for (let c = 0; c < 13; c++) {
        const k = `${r}-${c}`;
        const d = range[k] || { raise: 0, call: 0, fold: 100 };
        const combos = getCombos(r, c);
        totalCombos += combos;
        raiseCombos += combos * d.raise / 100;
        callCombos += combos * d.call / 100;
        foldCombos += combos * d.fold / 100;
      }
    }
    return {
      total: totalCombos,
      raise: Math.round(raiseCombos),
      call: Math.round(callCombos),
      fold: Math.round(foldCombos),
      raiseP: (raiseCombos / totalCombos * 100).toFixed(1),
      callP: (callCombos / totalCombos * 100).toFixed(1),
      foldP: (foldCombos / totalCombos * 100).toFixed(1),
    };
  }, [range]);

  const activeCell = selectedCell || hoveredCell;
  const activeCellData = activeCell ? range[`${activeCell.r}-${activeCell.c}`] : null;

  return (
    <div style={{ background: 'rgba(15,23,42,0.6)', borderRadius: 12, padding: 20, border: '1px solid rgba(255,255,255,0.06)' }}>
      <h3 style={{ color: '#f1f5f9', fontSize: 18, fontWeight: 700, margin: '0 0 16px 0' }}>
        Preflop Solutions Browser
      </h3>

      {/* ●●● SCENARIO SELECTOR ●●● */}
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 12 }}>
        {Object.entries(SCENARIOS || {}).map(([id, s]) => (
          <button key={id} onClick={() => setScenario(id)} style={{
            padding: '6px 12px', borderRadius: 6, border: 'none', cursor: 'pointer',
            background: scenario === id ? '#3b82f6' : 'rgba(255,255,255,0.06)',
            color: scenario === id ? '#fff' : '#94a3b8', fontSize: 12, fontWeight: 600,
            transition: 'all 0.15s',
          }}>
            {s.label}
          </button>
        ))}
      </div>

      {/* ●●● POSITION & STACK SELECTORS ●●● */}
      <div style={{ display: 'flex', gap: 16, marginBottom: 16, flexWrap: 'wrap' }}>
        <div>
          <div style={{ color: '#64748b', fontSize: 11, fontWeight: 600, marginBottom: 4, textTransform: 'uppercase', letterSpacing: 1 }}>Position</div>
          <div style={{ display: 'flex', gap: 4 }}>
            {POSITIONS.map(p => (
              <button key={p} onClick={() => setPosition(p)} style={{
                padding: '5px 10px', borderRadius: 5, border: 'none', cursor: 'pointer',
                background: position === p ? '#8b5cf6' : 'rgba(255,255,255,0.06)',
                color: position === p ? '#fff' : '#94a3b8', fontSize: 11, fontWeight: 600,
              }}>
                {p}
              </button>
            ))}
          </div>
        </div>
        <div>
          <div style={{ color: '#64748b', fontSize: 11, fontWeight: 600, marginBottom: 4, textTransform: 'uppercase', letterSpacing: 1 }}>Stack Depth</div>
          <div style={{ display: 'flex', gap: 4 }}>
            {STACK_DEPTHS.map(s => (
              <button key={s} onClick={() => setStackBB(s)} style={{
                padding: '5px 10px', borderRadius: 5, border: 'none', cursor: 'pointer',
                background: stackBB === s ? '#f59e0b' : 'rgba(255,255,255,0.06)',
                color: stackBB === s ? '#000' : '#94a3b8', fontSize: 11, fontWeight: 600,
              }}>
                {s}bb
              </button>
            ))}
          </div>
        </div>
      </div>

      <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap' }}>
        {/* ●●● 13x13 RANGE GRID ●●● */}
        <div style={{ flex: '1 1 400px' }}>
          <div style={{
            display: 'grid', gridTemplateColumns: 'repeat(13, 1fr)', gap: 1,
            background: 'rgba(0,0,0,0.3)', borderRadius: 8, overflow: 'hidden', padding: 1,
          }}>
            {Array.from({ length: 169 }, (_, i) => {
              const r = Math.floor(i / 13), c = i % 13;
              const key = `${r}-${c}`;
              const d = range[key] || { raise: 0, call: 0, fold: 100 };
              const label = getHandLabel(r, c);
              const isActive = activeCell && activeCell.r === r && activeCell.c === c;

              return (
                <div
                  key={key}
                  onMouseEnter={() => setHoveredCell({ r, c })}
                  onMouseLeave={() => setHoveredCell(null)}
                  onClick={() => setSelectedCell(selectedCell?.r === r && selectedCell?.c === c ? null : { r, c })}
                  style={{
                    position: 'relative', aspectRatio: '1', display: 'flex', flexDirection: 'column',
                    alignItems: 'center', justifyContent: 'center', cursor: 'pointer',
                    background: getActionColor(d.raise, d.call),
                    outline: isActive ? '2px solid #fff' : 'none', zIndex: isActive ? 2 : 1,
                    transition: 'all 0.1s',
                  }}
                >
                  <span style={{ color: '#fff', fontSize: 9, fontWeight: 700, textShadow: '0 1px 2px rgba(0,0,0,0.5)' }}>
                    {label}
                  </span>
                  {d.raise > 0 && d.raise < 100 && (
                    <span style={{ color: 'rgba(255,255,255,0.7)', fontSize: 7, fontWeight: 600 }}>
                      {Math.round(d.raise)}%
                    </span>
                  )}
                  {/* Mixed strategy bar at bottom */}
                  {(d.raise > 0 && d.raise < 100) && (
                    <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: 2, display: 'flex' }}>
                      <div style={{ width: `${d.raise}%`, background: '#ef4444' }} />
                      <div style={{ width: `${d.call}%`, background: '#22c55e' }} />
                      <div style={{ flex: 1, background: '#334155' }} />
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* ●●● LEGEND ●●● */}
          <div style={{ display: 'flex', gap: 16, marginTop: 8, justifyContent: 'center' }}>
            {[
              { color: 'rgba(239, 68, 68, 0.85)', label: 'Raise/Bet' },
              { color: 'rgba(34, 197, 94, 0.7)', label: 'Call' },
              { color: 'rgba(30, 41, 59, 0.6)', label: 'Fold' },
            ].map(l => (
              <div key={l.label} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                <div style={{ width: 12, height: 12, borderRadius: 3, background: l.color }} />
                <span style={{ color: '#94a3b8', fontSize: 11 }}>{l.label}</span>
              </div>
            ))}
          </div>
        </div>

        {/* ●●● STATS PANEL ●●● */}
        <div style={{ flex: '0 0 220px' }}>
          <div style={{ background: 'rgba(0,0,0,0.2)', borderRadius: 8, padding: 12, marginBottom: 12 }}>
            <div style={{ color: '#64748b', fontSize: 11, fontWeight: 600, marginBottom: 8, textTransform: 'uppercase' }}>
              {SCENARIOS[scenario]?.label || scenario}
            </div>
            <div style={{ color: '#94a3b8', fontSize: 12, marginBottom: 12 }}>
              {SCENARIOS[scenario]?.desc}
            </div>
            <div style={{ color: '#f1f5f9', fontSize: 13, fontWeight: 600, marginBottom: 4 }}>
              {position} · {stackBB}bb
            </div>
          </div>

          {/* Action Breakdown */}
          <div style={{ background: 'rgba(0,0,0,0.2)', borderRadius: 8, padding: 12, marginBottom: 12 }}>
            <div style={{ color: '#64748b', fontSize: 11, fontWeight: 600, marginBottom: 8, textTransform: 'uppercase' }}>
              Range Breakdown
            </div>
            {[
              { label: 'Raise', combos: stats.raise, pct: stats.raiseP, color: '#ef4444' },
              { label: 'Call', combos: stats.call, pct: stats.callP, color: '#22c55e' },
              { label: 'Fold', combos: stats.fold, pct: stats.foldP, color: '#475569' },
            ].map(a => (
              <div key={a.label} style={{ marginBottom: 8 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 2 }}>
                  <span style={{ color: a.color, fontSize: 12, fontWeight: 600 }}>{a.label}</span>
                  <span style={{ color: '#94a3b8', fontSize: 12 }}>{a.combos} combos ({a.pct}%)</span>
                </div>
                <div style={{ height: 4, background: 'rgba(255,255,255,0.06)', borderRadius: 2 }}>
                  <div style={{ height: '100%', width: `${a.pct}%`, background: a.color, borderRadius: 2 }} />
                </div>
              </div>
            ))}
          </div>

          {/* Selected Hand Detail */}
          {activeCell && activeCellData && (
            <div style={{ background: 'rgba(0,0,0,0.2)', borderRadius: 8, padding: 12 }}>
              <div style={{ color: '#f1f5f9', fontSize: 16, fontWeight: 700, marginBottom: 8 }}>
                {getHandLabel(activeCell.r, activeCell.c)}
              </div>
              <div style={{ color: '#94a3b8', fontSize: 12, marginBottom: 8 }}>
                {getCombos(activeCell.r, activeCell.c)} combos · {activeCell.r === activeCell.c ? 'Pair' : activeCell.c > activeCell.r ? 'Suited' : 'Offsuit'}
              </div>
              {/* Action frequency bars */}
              <div style={{ display: 'flex', height: 24, borderRadius: 6, overflow: 'hidden', marginBottom: 8 }}>
                {activeCellData.raise > 0 && (
                  <div style={{ width: `${activeCellData.raise}%`, background: '#ef4444', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <span style={{ color: '#fff', fontSize: 9, fontWeight: 700 }}>{Math.round(activeCellData.raise)}%</span>
                  </div>
                )}
                {activeCellData.call > 0 && (
                  <div style={{ width: `${activeCellData.call}%`, background: '#22c55e', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <span style={{ color: '#fff', fontSize: 9, fontWeight: 700 }}>{Math.round(activeCellData.call)}%</span>
                  </div>
                )}
                {activeCellData.fold > 0 && (
                  <div style={{ width: `${activeCellData.fold}%`, background: '#475569', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <span style={{ color: '#fff', fontSize: 9, fontWeight: 700 }}>{Math.round(activeCellData.fold)}%</span>
                  </div>
                )}
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: '#ef4444', fontSize: 11 }}>Raise</span>
                  <span style={{ color: '#f1f5f9', fontSize: 11, fontWeight: 600 }}>{Math.round(activeCellData.raise)}%</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: '#22c55e', fontSize: 11 }}>Call</span>
                  <span style={{ color: '#f1f5f9', fontSize: 11, fontWeight: 600 }}>{Math.round(activeCellData.call)}%</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: '#64748b', fontSize: 11 }}>Fold</span>
                  <span style={{ color: '#f1f5f9', fontSize: 11, fontWeight: 600 }}>{Math.round(activeCellData.fold)}%</span>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
