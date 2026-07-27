/**
 * POSITION MASTERY TRACKER
 * ═══════════════════════════════════════════════════════════════════════════
 * Track mastery progress per position:
 * - 6 positions with individual mastery scores
 * - Per-position accuracy by street and action type
 * - Radar chart visualization
 * - Weak position identification
 * - Suggested drills per position
 * ═══════════════════════════════════════════════════════════════════════════
 */

import React, { useState, useMemo } from 'react';

const POSITIONS = ['UTG', 'MP', 'CO', 'BTN', 'SB', 'BB'];

// ═══ POSITION DATA ═══
const POSITION_DATA = {
  UTG: {
    mastery: 72, hands: 185, accuracy: 68,
    streets: { preflop: 78, flop: 65, turn: 62, river: 58 },
    actions: { open: 82, cbet: 70, barrel: 55, valuebet: 65, bluff: 48 },
    strengths: ['Tight opening range', 'Good fold discipline'],
    weaknesses: ['Under-cbetting dry boards', 'Missing river value bets'],
    evLoss: 1.8,
  },
  MP: {
    mastery: 68, hands: 210, accuracy: 65,
    streets: { preflop: 75, flop: 62, turn: 58, river: 55 },
    actions: { open: 78, cbet: 65, barrel: 52, valuebet: 60, bluff: 45 },
    strengths: ['Solid preflop range', 'Decent flop play'],
    weaknesses: ['Turn barrel frequency too low', 'Bluffing too much on rivers'],
    evLoss: 2.2,
  },
  CO: {
    mastery: 78, hands: 245, accuracy: 74,
    streets: { preflop: 82, flop: 75, turn: 70, river: 68 },
    actions: { open: 85, cbet: 78, barrel: 68, valuebet: 72, bluff: 58 },
    strengths: ['Good stealing frequency', 'Strong c-bet game'],
    weaknesses: ['Could 3-bet more vs BTN opens', 'River sizing too small'],
    evLoss: 1.2,
  },
  BTN: {
    mastery: 85, hands: 320, accuracy: 80,
    streets: { preflop: 88, flop: 82, turn: 78, river: 72 },
    actions: { open: 90, cbet: 85, barrel: 75, valuebet: 80, bluff: 65 },
    strengths: ['Excellent opening range', 'Great positional awareness', 'Good barrel frequency'],
    weaknesses: ['Overbetting some river spots'],
    evLoss: 0.6,
  },
  SB: {
    mastery: 55, hands: 180, accuracy: 52,
    streets: { preflop: 60, flop: 50, turn: 48, river: 45 },
    actions: { open: 55, cbet: 48, barrel: 42, valuebet: 50, bluff: 38 },
    strengths: ['Acceptable 3-bet frequency'],
    weaknesses: ['Opening too wide', 'Poor OOP postflop play', 'Over-folding to 3-bets', 'Check-raise frequency too low'],
    evLoss: 3.8,
  },
  BB: {
    mastery: 62, hands: 290, accuracy: 58,
    streets: { preflop: 65, flop: 58, turn: 55, river: 52 },
    actions: { open: 0, cbet: 0, barrel: 50, valuebet: 55, bluff: 42 },
    strengths: ['Decent defend frequency'],
    weaknesses: ['Over-folding vs BTN', 'Not check-raising enough', 'Missing thin value on rivers'],
    evLoss: 2.9,
  },
};

function getMasteryColor(mastery) {
  if (mastery >= 80) return '#22c55e';
  if (mastery >= 65) return '#f59e0b';
  if (mastery >= 50) return '#f97316';
  return '#ef4444';
}

function getMasteryLabel(mastery) {
  if (mastery >= 85) return 'Expert';
  if (mastery >= 75) return 'Advanced';
  if (mastery >= 65) return 'Intermediate';
  if (mastery >= 50) return 'Developing';
  return 'Beginner';
}

// ═══ RADAR CHART (SVG) ═══
function RadarChart({ data }) {
  const W = 200, H = 200, CX = 100, CY = 100, R = 75;
  const positions = POSITIONS;
  const n = positions.length;

  const getPoint = (i, val) => {
    const angle = (Math.PI * 2 * i) / n - Math.PI / 2;
    const r = (val / 100) * R;
    return { x: CX + r * Math.cos(angle), y: CY + r * Math.sin(angle) };
  };

  const points = positions.map((pos, i) => getPoint(i, data[pos].mastery));
  const pathD = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ') + ' Z';

  return (
    <svg width="100%" viewBox={`0 0 ${W} ${H}`} style={{ display: 'block' }}>
      {/* Grid circles */}
      {[25, 50, 75, 100].map(pct => (
        <circle key={pct} cx={CX} cy={CY} r={(pct / 100) * R}
          fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth="0.5" />
      ))}
      {/* Grid lines */}
      {positions.map((_, i) => {
        const p = getPoint(i, 100);
        return <line key={i} x1={CX} y1={CY} x2={p.x} y2={p.y} stroke="rgba(255,255,255,0.06)" strokeWidth="0.5" />;
      })}
      {/* Data polygon */}
      <path d={pathD} fill="rgba(59,130,246,0.15)" stroke="#3b82f6" strokeWidth="1.5" />
      {/* Points */}
      {points.map((p, i) => (
        <circle key={i} cx={p.x} cy={p.y} r={3} fill={getMasteryColor(data[positions[i]].mastery)} stroke="rgba(0,0,0,0.3)" strokeWidth="1" />
      ))}
      {/* Labels */}
      {positions.map((pos, i) => {
        const p = getPoint(i, 115);
        return (
          <text key={pos} x={p.x} y={p.y} textAnchor="middle" dominantBaseline="middle"
            fill={getMasteryColor(data[pos].mastery)} fontSize="9" fontWeight="700">
            {pos}
          </text>
        );
      })}
    </svg>
  );
}

// ═══ MAIN COMPONENT ═══
export default function PositionMasteryTracker() {
  const [selectedPos, setSelectedPos] = useState('BTN');
  const data = POSITION_DATA[selectedPos];

  const overallMastery = Math.round(POSITIONS.reduce((a, p) => a + POSITION_DATA[p].mastery, 0) / POSITIONS.length);
  const totalEVLoss = POSITIONS.reduce((a, p) => a + POSITION_DATA[p].evLoss, 0);
  const weakestPos = POSITIONS.reduce((w, p) => POSITION_DATA[p].mastery < POSITION_DATA[w].mastery ? p : w);

  try {
    return (
      <div style={{ background: 'rgba(15,23,42,0.6)', borderRadius: 12, padding: 20, border: '1px solid rgba(255,255,255,0.06)' }}>
        {/* Header */}
        <div style={{ marginBottom: 16 }}>
          <h3 style={{ color: '#f1f5f9', fontSize: 18, fontWeight: 700, margin: 0 }}>Position Mastery</h3>
          <div style={{ color: '#64748b', fontSize: 11, marginTop: 2 }}>Track your skill level from every seat</div>
        </div>

        {/* Summary */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8, marginBottom: 16 }}>
          {[
            { label: 'Overall', value: `${overallMastery}%`, color: getMasteryColor(overallMastery) },
            { label: 'Strongest', value: 'BTN', color: '#22c55e' },
            { label: 'Weakest', value: weakestPos, color: '#ef4444' },
            { label: 'Total EV Loss', value: `${totalEVLoss.toFixed(1)}bb`, color: '#f59e0b' },
          ].map((s, i) => (
            <div key={i} style={{ background: 'rgba(0,0,0,0.2)', borderRadius: 6, padding: 8, textAlign: 'center' }}>
              <div style={{ color: '#64748b', fontSize: 8, fontWeight: 600, textTransform: 'uppercase' }}>{s.label}</div>
              <div style={{ color: s.color, fontSize: 18, fontWeight: 800 }}>{s.value}</div>
            </div>
          ))}
        </div>

        {/* Radar + Position selector */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 16 }}>
          <div style={{ background: 'rgba(0,0,0,0.15)', borderRadius: 8, padding: 8 }}>
            <RadarChart data={POSITION_DATA} />
          </div>
          <div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              {POSITIONS.map(pos => {
                const d = POSITION_DATA[pos];
                const isSelected = selectedPos === pos;
                return (
                  <div key={pos} onClick={() => setSelectedPos(pos)} style={{
                    display: 'flex', alignItems: 'center', gap: 8, padding: '8px 10px',
                    borderRadius: 6, cursor: 'pointer',
                    background: isSelected ? 'rgba(59,130,246,0.1)' : 'rgba(0,0,0,0.1)',
                    border: isSelected ? '1px solid rgba(59,130,246,0.3)' : '1px solid transparent',
                  }}>
                    <span style={{ color: getMasteryColor(d.mastery), fontSize: 12, fontWeight: 800, width: 30 }}>{pos}</span>
                    <div style={{ flex: 1, height: 8, background: 'rgba(0,0,0,0.3)', borderRadius: 4, overflow: 'hidden' }}>
                      <div style={{ width: `${d.mastery}%`, height: '100%', background: getMasteryColor(d.mastery), borderRadius: 4 }} />
                    </div>
                    <span style={{ color: getMasteryColor(d.mastery), fontSize: 11, fontWeight: 700, width: 35, textAlign: 'right' }}>{d.mastery}%</span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* Selected position detail */}
        <div style={{ background: 'rgba(0,0,0,0.15)', borderRadius: 8, padding: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
            <span style={{ color: getMasteryColor(data.mastery), fontSize: 20, fontWeight: 800 }}>{selectedPos}</span>
            <span style={{ color: getMasteryColor(data.mastery), fontSize: 12, fontWeight: 600 }}>{getMasteryLabel(data.mastery)}</span>
            <span style={{ color: '#64748b', fontSize: 10, marginLeft: 'auto' }}>{data.hands} hands • {data.accuracy}% accuracy</span>
          </div>

          {/* Street accuracy */}
          <div style={{ marginBottom: 10 }}>
            <div style={{ color: '#475569', fontSize: 9, fontWeight: 700, textTransform: 'uppercase', marginBottom: 4 }}>Street Accuracy</div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 6 }}>
              {Object.entries(data.streets || {}).map(([street, acc]) => (
                <div key={street} style={{ textAlign: 'center' }}>
                  <div style={{ color: '#64748b', fontSize: 8, textTransform: 'capitalize' }}>{street}</div>
                  <div style={{ color: getMasteryColor(acc), fontSize: 16, fontWeight: 800 }}>{acc}%</div>
                </div>
              ))}
            </div>
          </div>

          {/* Action accuracy */}
          <div style={{ marginBottom: 10 }}>
            <div style={{ color: '#475569', fontSize: 9, fontWeight: 700, textTransform: 'uppercase', marginBottom: 4 }}>Action Accuracy</div>
            {Object.entries(data.actions || {}).filter(([, v]) => v > 0).map(([action, acc]) => (
              <div key={action} style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 3 }}>
                <span style={{ color: '#94a3b8', fontSize: 9, width: 60, textTransform: 'capitalize' }}>{action}</span>
                <div style={{ flex: 1, height: 6, background: 'rgba(0,0,0,0.3)', borderRadius: 3, overflow: 'hidden' }}>
                  <div style={{ width: `${acc}%`, height: '100%', background: getMasteryColor(acc), borderRadius: 3 }} />
                </div>
                <span style={{ color: getMasteryColor(acc), fontSize: 10, fontWeight: 700, width: 30, textAlign: 'right' }}>{acc}%</span>
              </div>
            ))}
          </div>

          {/* Strengths / Weaknesses */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <div>
              <div style={{ color: '#22c55e', fontSize: 9, fontWeight: 700, textTransform: 'uppercase', marginBottom: 4 }}>Strengths</div>
              {data.strengths.map((s, i) => (
                <div key={i} style={{ color: '#94a3b8', fontSize: 10, marginBottom: 2 }}>✓ {s}</div>
              ))}
            </div>
            <div>
              <div style={{ color: '#ef4444', fontSize: 9, fontWeight: 700, textTransform: 'uppercase', marginBottom: 4 }}>Weaknesses</div>
              {data.weaknesses.map((w, i) => (
                <div key={i} style={{ color: '#94a3b8', fontSize: 10, marginBottom: 2 }}>✕ {w}</div>
              ))}
            </div>
          </div>

          {/* EV Loss */}
          <div style={{ marginTop: 8, padding: '6px 8px', borderRadius: 4, background: 'rgba(239,68,68,0.06)', textAlign: 'center' }}>
            <span style={{ color: '#ef4444', fontSize: 11, fontWeight: 600 }}>
              EV Loss from {selectedPos}: -{data.evLoss.toFixed(1)}bb/100
            </span>
          </div>
        </div>
      </div>
    );
  } catch (err) {
    return (
      <div style={{ background: 'rgba(15,23,42,0.6)', borderRadius: 12, padding: 20, border: '1px solid rgba(255,255,255,0.06)' }}>
        <h3 style={{ color: '#f1f5f9', fontSize: 18, margin: 0 }}>Position Mastery</h3>
        <p style={{ color: '#64748b', fontSize: 13 }}>Component loading... Please refresh if this persists.</p>
      </div>
    );
  }
}
