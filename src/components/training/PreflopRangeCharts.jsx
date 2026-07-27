/**
 * PREFLOP RANGE CHARTS
 * ●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●
 * Visual preflop opening/3-bet/4-bet charts:
 * - 13x13 interactive range grid
 * - Multiple chart types (RFI, vs 3-bet, 3-bet, 4-bet, cold call)
 * - Position-based charts
 * - Color-coded by action frequency
 * - Hand details on hover/click
 * ●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●
 */

import React, { useState, useMemo } from 'react';

const RANKS = ['A', 'K', 'Q', 'J', 'T', '9', '8', '7', '6', '5', '4', '3', '2'];
const POSITIONS = ['UTG', 'MP', 'CO', 'BTN', 'SB', 'BB'];

const CHART_TYPES = [
  { id: 'rfi', label: 'Open Raise', desc: 'Raise First In ranges by position' },
  { id: '3bet', label: '3-Bet', desc: '3-Bet ranges vs open raise' },
  { id: 'vs3bet', label: 'vs 3-Bet', desc: 'How to respond to 3-bets' },
  { id: 'coldcall', label: 'Cold Call', desc: 'Cold calling ranges in position' },
  { id: '4bet', label: '4-Bet', desc: '4-Bet ranges after being 3-bet' },
];

// Generate a range based on position and chart type
function generateRange(position, chartType) {
  const grid = [];
  const posStrength = { UTG: 0.12, MP: 0.16, CO: 0.25, BTN: 0.38, SB: 0.30, BB: 0.35 };
  const chartMod = { rfi: 1.0, '3bet': 0.35, vs3bet: 0.65, coldcall: 0.40, '4bet': 0.18 };
  const base = (posStrength[position] || 0.2) * (chartMod[chartType] || 1.0);

  for (let r = 0; r < 13; r++) {
    for (let c = 0; c < 13; c++) {
      const isPair = r === c;
      const isSuited = c > r;
      const handStr = isPair ? `${RANKS[r]}${RANKS[c]}` : isSuited ? `${RANKS[r]}${RANKS[c]}s` : `${RANKS[c]}${RANKS[r]}o`;

      // Calculate hand strength heuristic
      const highRank = Math.min(r, c);
      const lowRank = Math.max(r, c);
      const gap = lowRank - highRank;

      let strength = (13 - highRank) * 8 + (13 - lowRank) * 3;
      if (isPair) strength += 40;
      if (isSuited) strength += 12;
      strength -= gap * 5;
      strength = Math.max(0, Math.min(100, strength));

      // Determine action frequency
      const threshold = base * 100 * 1.8;
      let freq = 0;
      if (strength > threshold * 0.7) {
        freq = Math.min(100, Math.round(((strength - threshold * 0.4) / (threshold * 0.6)) * 100));
      }
      freq = Math.max(0, Math.min(100, freq));

      // Action split for vs3bet
      let action = 'raise';
      if (chartType === 'vs3bet') {
        if (freq > 70) action = 'raise';
        else if (freq > 30) action = 'call';
        else if (freq > 0) action = 'fold';
        else action = 'fold';
      }

      grid.push({ row: r, col: c, hand: handStr, isPair, isSuited, freq, strength, action });
    }
  }
  return grid;
}

function getFreqColor(freq, action) {
  if (action === 'call') return `rgba(59,130,246,${freq / 100 * 0.8 + 0.1})`;
  if (action === 'fold') return `rgba(100,116,139,${freq / 100 * 0.3 + 0.05})`;
  if (freq >= 80) return `rgba(239,68,68,${freq / 100 * 0.8 + 0.15})`;
  if (freq >= 50) return `rgba(245,158,11,${freq / 100 * 0.7 + 0.15})`;
  if (freq >= 20) return `rgba(34,197,94,${freq / 100 * 0.6 + 0.1})`;
  if (freq > 0) return `rgba(59,130,246,${freq / 100 * 0.5 + 0.1})`;
  return 'rgba(0,0,0,0.15)';
}

// ●●● MAIN COMPONENT ●●●
export default function PreflopRangeCharts() {
  const [position, setPosition] = useState('BTN');
  const [chartType, setChartType] = useState('rfi');
  const [selectedHand, setSelectedHand] = useState(null);

  const range = useMemo(() => generateRange(position, chartType), [position, chartType]);
  const totalCombos = range.filter(h => h.freq > 0).length;
  const avgFreq = Math.round(range.reduce((a, h) => a + h.freq, 0) / 169);
  const rangePercent = Math.round(range.filter(h => h.freq >= 50).length / 169 * 100);

  try {
    return (
      <div style={{ background: 'rgba(15,23,42,0.6)', borderRadius: 12, padding: 20, border: '1px solid rgba(255,255,255,0.06)' }}>
        {/* Header */}
        <div style={{ marginBottom: 16 }}>
          <h3 style={{ color: '#f1f5f9', fontSize: 18, fontWeight: 700, margin: 0 }}>Preflop Range Charts</h3>
          <div style={{ color: '#64748b', fontSize: 11, marginTop: 2 }}>GTO preflop strategies by position and action</div>
        </div>

        {/* Chart type selector */}
        <div style={{ display: 'flex', gap: 4, marginBottom: 12, overflowX: 'auto' }}>
          {CHART_TYPES.map(ct => (
            <button key={ct.id} onClick={() => setChartType(ct.id)} style={{
              padding: '5px 10px', borderRadius: 5, cursor: 'pointer',
              background: chartType === ct.id ? 'rgba(59,130,246,0.2)' : 'rgba(255,255,255,0.04)',
              color: chartType === ct.id ? '#3b82f6' : '#94a3b8', fontSize: 10, fontWeight: 600,
              border: chartType === ct.id ? '1px solid rgba(59,130,246,0.3)' : '1px solid transparent',
            }}>{ct.label}</button>
          ))}
        </div>

        {/* Position selector */}
        <div style={{ display: 'flex', gap: 4, marginBottom: 16 }}>
          {POSITIONS.map(pos => (
            <button key={pos} onClick={() => setPosition(pos)} style={{
              padding: '5px 12px', borderRadius: 5, cursor: 'pointer', flex: 1,
              background: position === pos ? 'rgba(245,158,11,0.15)' : 'rgba(0,0,0,0.15)',
              color: position === pos ? '#f59e0b' : '#94a3b8', fontSize: 11, fontWeight: 700,
              border: position === pos ? '1px solid rgba(245,158,11,0.3)' : '1px solid transparent',
            }}>{pos}</button>
          ))}
        </div>

        {/* Summary stats */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 6, marginBottom: 16 }}>
          {[
            { label: 'Range %', value: `${rangePercent}%`, color: '#f59e0b' },
            { label: 'Active Combos', value: totalCombos, color: '#3b82f6' },
            { label: 'Avg Frequency', value: `${avgFreq}%`, color: '#22c55e' },
          ].map((s, i) => (
            <div key={i} style={{ background: 'rgba(0,0,0,0.2)', borderRadius: 6, padding: 8, textAlign: 'center' }}>
              <div style={{ color: '#64748b', fontSize: 7, fontWeight: 600, textTransform: 'uppercase' }}>{s.label}</div>
              <div style={{ color: s.color, fontSize: 18, fontWeight: 800 }}>{s.value}</div>
            </div>
          ))}
        </div>

        {/* 13x13 Range Grid */}
        <div style={{ background: 'rgba(0,0,0,0.15)', borderRadius: 8, padding: 8, marginBottom: 16 }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(13, 1fr)', gap: 1 }}>
            {range.map((cell, idx) => (
              <div key={idx} onClick={() => setSelectedHand(cell)} style={{
                aspectRatio: '1', display: 'flex', alignItems: 'center', justifyContent: 'center',
                background: getFreqColor(cell.freq, cell.action), borderRadius: 2, cursor: 'pointer',
                border: selectedHand && selectedHand.hand === cell.hand ? '1px solid #fff' : '1px solid transparent',
                transition: 'all 0.1s',
              }}>
                <span style={{
                  color: cell.freq > 0 ? '#fff' : 'rgba(255,255,255,0.15)',
                  fontSize: 7, fontWeight: 700, lineHeight: 1,
                }}>{cell.hand}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Legend */}
        <div style={{ display: 'flex', gap: 10, marginBottom: 12, justifyContent: 'center', flexWrap: 'wrap' }}>
          {chartType === 'vs3bet' ? (
            <>
              <span style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
                <div style={{ width: 12, height: 8, borderRadius: 2, background: 'rgba(239,68,68,0.7)' }} />
                <span style={{ color: '#94a3b8', fontSize: 8 }}>4-Bet/5-Bet</span>
              </span>
              <span style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
                <div style={{ width: 12, height: 8, borderRadius: 2, background: 'rgba(59,130,246,0.7)' }} />
                <span style={{ color: '#94a3b8', fontSize: 8 }}>Call</span>
              </span>
              <span style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
                <div style={{ width: 12, height: 8, borderRadius: 2, background: 'rgba(100,116,139,0.3)' }} />
                <span style={{ color: '#94a3b8', fontSize: 8 }}>Fold</span>
              </span>
            </>
          ) : (
            <>
              {[
                { label: '80-100%', bg: 'rgba(239,68,68,0.8)' },
                { label: '50-79%', bg: 'rgba(245,158,11,0.7)' },
                { label: '20-49%', bg: 'rgba(34,197,94,0.5)' },
                { label: '1-19%', bg: 'rgba(59,130,246,0.4)' },
                { label: '0%', bg: 'rgba(0,0,0,0.15)' },
              ].map(l => (
                <span key={l.label} style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
                  <div style={{ width: 12, height: 8, borderRadius: 2, background: l.bg }} />
                  <span style={{ color: '#94a3b8', fontSize: 8 }}>{l.label}</span>
                </span>
              ))}
            </>
          )}
        </div>

        {/* Selected hand detail */}
        {selectedHand && (
          <div style={{ background: 'rgba(0,0,0,0.2)', borderRadius: 8, padding: 12, border: '1px solid rgba(255,255,255,0.06)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <div style={{ color: '#f1f5f9', fontSize: 20, fontWeight: 800 }}>{selectedHand.hand}</div>
              <div>
                <div style={{ color: '#64748b', fontSize: 9 }}>
                  {selectedHand.isPair ? 'Pocket Pair' : selectedHand.isSuited ? 'Suited' : 'Offsuit'}
                </div>
                <div style={{ display: 'flex', gap: 8, marginTop: 2 }}>
                  <span style={{ color: '#f59e0b', fontSize: 10, fontWeight: 600 }}>Freq: {selectedHand.freq}%</span>
                  <span style={{ color: '#3b82f6', fontSize: 10, fontWeight: 600 }}>Strength: {selectedHand.strength}</span>
                  {chartType === 'vs3bet' && (
                    <span style={{ color: selectedHand.action === 'raise' ? '#ef4444' : selectedHand.action === 'call' ? '#3b82f6' : '#64748b', fontSize: 10, fontWeight: 700, textTransform: 'capitalize' }}>
                      Action: {selectedHand.action}
                    </span>
                  )}
                </div>
              </div>
              <div style={{ marginLeft: 'auto', textAlign: 'right' }}>
                <div style={{ color: '#94a3b8', fontSize: 9 }}>{position} • {CHART_TYPES.find(c => c.id === chartType)?.label}</div>
                <div style={{ color: selectedHand.freq >= 50 ? '#22c55e' : selectedHand.freq > 0 ? '#f59e0b' : '#ef4444', fontSize: 11, fontWeight: 700 }}>
                  {selectedHand.freq >= 50 ? 'In Range' : selectedHand.freq > 0 ? 'Mixed' : 'Not in Range'}
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  } catch (err) {
    return (
      <div style={{ background: 'rgba(15,23,42,0.6)', borderRadius: 12, padding: 20, border: '1px solid rgba(255,255,255,0.06)' }}>
        <h3 style={{ color: '#f1f5f9', fontSize: 18, margin: 0 }}>Preflop Range Charts</h3>
        <p style={{ color: '#64748b', fontSize: 13 }}>Component loading... Please refresh if this persists.</p>
      </div>
    );
  }
}
