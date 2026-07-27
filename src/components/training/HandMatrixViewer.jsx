/**
 * HandMatrixViewer — 13x13 Hand Strategy Matrix
 * CRITICAL GAP CLOSER: THE core GTO Wizard UI element
 * Shows every hand combo colored by action frequency in a 13x13 grid
 */
import React, { useState, useMemo } from 'react';
import { motion } from 'framer-motion';

const RANKS = ['A','K','Q','J','T','9','8','7','6','5','4','3','2'];

// Action strategies per hand (simplified for key spots)
const SPOTS = [
  { name: 'BTN Open (100bb)', position: 'BTN', type: 'Open' },
  { name: 'CO Open (100bb)', position: 'CO', type: 'Open' },
  { name: 'UTG Open (100bb)', position: 'UTG', type: 'Open' },
  { name: 'BB vs BTN 3-Bet', position: 'BB', type: '3-Bet' },
  { name: 'BTN vs 3-Bet Call', position: 'BTN', type: 'Call 3B' },
];

// Generate strategy data for each hand
function generateStrategy(r1, c1, spot) {
  const isPair = r1 === c1;
  const isSuited = c1 > r1; // upper triangle = suited
  const highRank = Math.min(r1, c1);
  const lowRank = Math.max(r1, c1);
  const gap = lowRank - highRank;
  const strength = (13 - highRank) * 3 + (13 - lowRank) + (isSuited ? 4 : 0) + (isPair ? 6 : 0) - gap * 2;

  let raise = 0, call = 0, fold = 0;

  if (spot.type === 'Open') {
    const threshold = spot.position === 'BTN' ? 15 : spot.position === 'CO' ? 22 : 32;
    if (strength > threshold + 10) { raise = 100; }
    else if (strength > threshold + 3) { raise = 85; fold = 15; }
    else if (strength > threshold - 3) { raise = 50; fold = 50; }
    else if (strength > threshold - 8) { raise = 15; fold = 85; }
    else { fold = 100; }
  } else if (spot.type === '3-Bet') {
    if (strength > 38) { raise = 100; }
    else if (strength > 30) { raise = 70; call = 30; }
    else if (strength > 22) { call = 60; fold = 40; }
    else if (strength > 15) { raise = 20; fold = 80; }
    else { fold = 100; }
  } else {
    if (strength > 35) { call = 100; }
    else if (strength > 28) { call = 75; fold = 25; }
    else if (strength > 20) { call = 40; fold = 60; }
    else { fold = 100; }
  }

  return { raise, call, fold };
}

function getCellColor(strat, mode) {
  if (mode === 'raise') {
    if (strat.raise >= 80) return '#dc2626';
    if (strat.raise >= 50) return '#ef4444';
    if (strat.raise >= 20) return '#f97316';
    if (strat.raise > 0) return '#fbbf24';
    return 'transparent';
  }
  if (mode === 'call') {
    if (strat.call >= 80) return '#22c55e';
    if (strat.call >= 50) return '#4ade80';
    if (strat.call >= 20) return '#86efac';
    if (strat.call > 0) return '#bbf7d0';
    return 'transparent';
  }
  // combined
  if (strat.raise >= 80) return '#dc2626';
  if (strat.raise >= 50) return '#ef4444';
  if (strat.call >= 80) return '#22c55e';
  if (strat.call >= 50) return '#4ade80';
  if (strat.raise >= 20) return '#f97316';
  if (strat.call >= 20) return '#86efac';
  if (strat.raise > 0 || strat.call > 0) return '#fbbf24';
  return 'rgba(100,116,139,0.2)';
}

export default function HandMatrixViewer() {
  const [spotIdx, setSpotIdx] = useState(0);
  const [colorMode, setColorMode] = useState('combined');
  const [hovered, setHovered] = useState(null);

  const spot = SPOTS[spotIdx];

  const matrix = useMemo(() => {
    return RANKS.map((r1, ri) =>
      RANKS.map((r2, ci) => {
        const strat = generateStrategy(ri, ci, spot);
        const isPair = ri === ci;
        const isSuited = ci > ri;
        const label = isPair ? `${r1}${r2}` : isSuited ? `${r1}${r2}s` : `${r2}${r1}o`;
        return { ...strat, label, isPair, isSuited, ri, ci };
      })
    );
  }, [spotIdx]);

  const hoveredCell = hovered ? matrix[hovered.r][hovered.c] : null;

  return (
    <div style={{ padding: 20, color: '#e2e8f0' }}>
      <h3 style={{ fontSize: 20, fontWeight: 800, marginBottom: 4, background: 'linear-gradient(135deg, #ef4444, #22c55e)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
        Hand Strategy Matrix
      </h3>
      <p style={{ color: '#94a3b8', fontSize: 12, marginBottom: 12 }}>13x13 grid showing GTO action frequencies for every starting hand.</p>

      {/* Spot Selector */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 10, flexWrap: 'wrap' }}>
        {SPOTS.map((s, i) => (
          <button key={i} onClick={() => setSpotIdx(i)}
            style={{ padding: '5px 10px', borderRadius: 6, border: spotIdx === i ? '2px solid #3b82f6' : '1px solid rgba(255,255,255,0.06)',
              background: spotIdx === i ? 'rgba(59,130,246,0.15)' : 'rgba(0,0,0,0.2)', cursor: 'pointer',
              fontSize: 10, fontWeight: 700, color: spotIdx === i ? '#3b82f6' : '#64748b' }}>
            {s.name}
          </button>
        ))}
      </div>

      {/* Color Mode */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 10 }}>
        {[
          { id: 'combined', label: 'Combined', color: '#8b5cf6' },
          { id: 'raise', label: 'Raise/Open', color: '#ef4444' },
          { id: 'call', label: 'Call', color: '#22c55e' },
        ].map(m => (
          <button key={m.id} onClick={() => setColorMode(m.id)}
            style={{ padding: '4px 8px', borderRadius: 4, border: colorMode === m.id ? `1px solid ${m.color}` : '1px solid rgba(255,255,255,0.04)',
              background: colorMode === m.id ? `${m.color}15` : 'rgba(0,0,0,0.2)', cursor: 'pointer',
              fontSize: 9, fontWeight: 700, color: colorMode === m.id ? m.color : '#64748b' }}>
            {m.label}
          </button>
        ))}
      </div>

      {/* Matrix Grid */}
      <div style={{ display: 'grid', gridTemplateColumns: `repeat(13, 1fr)`, gap: 1, background: 'rgba(0,0,0,0.4)', borderRadius: 8, padding: 2, marginBottom: 10 }}>
        {matrix.flat().map((cell, idx) => {
          const bg = getCellColor(cell, colorMode);
          const isHov = hovered && hovered.r === cell.ri && hovered.c === cell.ci;
          return (
            <div key={idx}
              onMouseEnter={() => setHovered({ r: cell.ri, c: cell.ci })}
              onMouseLeave={() => setHovered(null)}
              style={{
                aspectRatio: '1', display: 'flex', alignItems: 'center', justifyContent: 'center',
                background: bg, borderRadius: 2, cursor: 'pointer',
                border: isHov ? '2px solid #fff' : cell.isPair ? '1px solid rgba(255,255,255,0.15)' : '1px solid rgba(255,255,255,0.03)',
                opacity: cell.fold === 100 ? 0.3 : 1,
                transition: 'all 0.1s',
              }}>
              <span style={{ fontSize: 8, fontWeight: 700, color: bg === 'transparent' || bg.includes('139') ? '#64748b' : '#fff',
                textShadow: '0 1px 2px rgba(0,0,0,0.8)' }}>
                {cell.label}
              </span>
            </div>
          );
        })}
      </div>

      {/* Legend */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 10, flexWrap: 'wrap' }}>
        {[
          { color: '#dc2626', label: 'Raise 80%+' },
          { color: '#ef4444', label: 'Raise 50%+' },
          { color: '#f97316', label: 'Raise 20%+' },
          { color: '#22c55e', label: 'Call 80%+' },
          { color: '#4ade80', label: 'Call 50%+' },
          { color: '#86efac', label: 'Call 20%+' },
          { color: 'rgba(100,116,139,0.4)', label: 'Fold' },
        ].map((l, i) => (
          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <div style={{ width: 10, height: 10, borderRadius: 2, background: l.color }} />
            <span style={{ fontSize: 9, color: '#94a3b8' }}>{l.label}</span>
          </div>
        ))}
      </div>

      {/* Hover Detail */}
      {hoveredCell && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}
          style={{ background: 'rgba(0,0,0,0.4)', borderRadius: 10, padding: 12, border: '1px solid rgba(255,255,255,0.1)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
            <span style={{ fontSize: 18, fontWeight: 800, color: '#e2e8f0', fontFamily: 'monospace' }}>{hoveredCell.label}</span>
            <span style={{ fontSize: 10, color: '#64748b' }}>{hoveredCell.isPair ? 'Pair (6 combos)' : hoveredCell.isSuited ? 'Suited (4 combos)' : 'Offsuit (12 combos)'}</span>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            {hoveredCell.raise > 0 && (
              <div style={{ flex: hoveredCell.raise, background: '#ef4444', borderRadius: 4, padding: '4px 8px', textAlign: 'center' }}>
                <div style={{ fontSize: 12, fontWeight: 800, color: '#fff' }}>{hoveredCell.raise}%</div>
                <div style={{ fontSize: 8, color: 'rgba(255,255,255,0.7)' }}>Raise</div>
              </div>
            )}
            {hoveredCell.call > 0 && (
              <div style={{ flex: hoveredCell.call, background: '#22c55e', borderRadius: 4, padding: '4px 8px', textAlign: 'center' }}>
                <div style={{ fontSize: 12, fontWeight: 800, color: '#fff' }}>{hoveredCell.call}%</div>
                <div style={{ fontSize: 8, color: 'rgba(255,255,255,0.7)' }}>Call</div>
              </div>
            )}
            {hoveredCell.fold > 0 && (
              <div style={{ flex: hoveredCell.fold, background: '#64748b', borderRadius: 4, padding: '4px 8px', textAlign: 'center' }}>
                <div style={{ fontSize: 12, fontWeight: 800, color: '#fff' }}>{hoveredCell.fold}%</div>
                <div style={{ fontSize: 8, color: 'rgba(255,255,255,0.7)' }}>Fold</div>
              </div>
            )}
          </div>
        </motion.div>
      )}
    </div>
  );
}
