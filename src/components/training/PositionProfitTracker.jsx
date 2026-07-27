/**
 * PositionProfitTracker — Track Profit by Position
 * ●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●
 * Interactive position profit tracking tool. Shows expected win rates
 * by position and helps identify positional leaks.
 */
import React, { useState, useMemo } from 'react';

const POSITIONS_6MAX = [
  { pos: 'UTG', expected: -2.5, color: '#ef4444', hands: '15-18%', notes: 'Tightest position. Expected to lose from here. Minimize losses by playing premium hands only.' },
  { pos: 'HJ', expected: -0.5, color: '#f59e0b', hands: '18-22%', notes: 'Slightly wider than UTG. Still a losing position overall but less so.' },
  { pos: 'CO', expected: 3.0, color: '#84cc16', hands: '25-30%', notes: 'First profitable position. Open wider, steal blinds effectively.' },
  { pos: 'BTN', expected: 8.0, color: '#10b981', hands: '40-50%', notes: 'Most profitable seat. Positional advantage is massive. Open WIDE.' },
  { pos: 'SB', expected: -15.0, color: '#dc2626', hands: '30-40%', notes: 'Worst position long-term. Forced to post blind, always OOP postflop.' },
  { pos: 'BB', expected: -8.0, color: '#ef4444', hands: '35-50%', notes: 'Second worst. Forced blind but has closing action preflop. Defend wisely.' },
];

const BENCHMARKS = [
  { level: 'Elite (10bb/100+)', color: '#10b981', minWR: 10 },
  { level: 'Strong (5-10bb/100)', color: '#3b82f6', minWR: 5 },
  { level: 'Winning (1-5bb/100)', color: '#f59e0b', minWR: 1 },
  { level: 'Breakeven (0bb/100)', color: '#6b7280', minWR: 0 },
  { level: 'Losing (<0bb/100)', color: '#ef4444', minWR: -999 },
];

function PositionProfitTracker() {
  const [userRates, setUserRates] = useState(
    POSITIONS_6MAX.reduce((acc, p) => ({ ...acc, [p.pos]: p.expected }), {})
  );

  const totalWR = useMemo(() => {
    const sum = Object.values(userRates || {}).reduce((s, v) => s + v, 0);
    return Math.round(sum / 6 * 10) / 10;
  }, [userRates]);

  const updateRate = (pos, value) => {
    setUserRates(prev => ({ ...prev, [pos]: parseFloat(value) }));
  };

  const maxAbsRate = Math.max(...Object.values(userRates || {}).map(Math.abs), 15);

  try {
    return (
      <div style={{ padding: 20, background: 'rgba(0,0,0,0.3)', borderRadius: 12, border: '1px solid rgba(255,255,255,0.08)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <h3 style={{ margin: 0, fontSize: 18, color: '#22d3ee' }}>Position Profit Tracker</h3>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: 9, color: 'rgba(255,255,255,0.3)' }}>Overall WR</div>
            <div style={{ fontSize: 20, fontWeight: 900, color: totalWR >= 5 ? '#10b981' : totalWR >= 0 ? '#f59e0b' : '#ef4444' }}>{totalWR > 0 ? '+' : ''}{totalWR} bb/100</div>
          </div>
        </div>

        {/* Position bars */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 16 }}>
          {POSITIONS_6MAX.map(p => {
            const rate = userRates[p.pos];
            const barWidth = Math.abs(rate) / maxAbsRate * 50;
            const isPositive = rate >= 0;
            return (
              <div key={p.pos} style={{ padding: 8, background: 'rgba(255,255,255,0.03)', borderRadius: 8 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                  <div style={{ width: 36, fontSize: 12, fontWeight: 700, color: p.color }}>{p.pos}</div>
                  <div style={{ flex: 1, display: 'flex', height: 16, position: 'relative' }}>
                    <div style={{ width: '50%', display: 'flex', justifyContent: 'flex-end' }}>
                      {!isPositive && <div style={{ width: `${barWidth}%`, background: '#ef4444', borderRadius: '4px 0 0 4px', transition: 'width 0.3s' }} />}
                    </div>
                    <div style={{ width: 1, background: 'rgba(255,255,255,0.2)' }} />
                    <div style={{ width: '50%' }}>
                      {isPositive && <div style={{ width: `${barWidth}%`, background: '#10b981', borderRadius: '0 4px 4px 0', transition: 'width 0.3s' }} />}
                    </div>
                  </div>
                  <div style={{ width: 80, textAlign: 'right' }}>
                    <span style={{ fontSize: 13, fontWeight: 800, color: isPositive ? '#10b981' : '#ef4444' }}>
                      {isPositive ? '+' : ''}{rate} bb
                    </span>
                  </div>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <input type="range" min={-25} max={20} step={0.5} value={rate} onChange={e => updateRate(p.pos, e.target.value)} style={{ flex: 1, accentColor: p.color, height: 4 }} />
                  <span style={{ fontSize: 9, color: 'rgba(255,255,255,0.3)', marginLeft: 8, minWidth: 50 }}>Open: {p.hands}</span>
                </div>
                <div style={{ fontSize: 9, color: 'rgba(255,255,255,0.3)', marginTop: 2 }}>Expected: {p.expected > 0 ? '+' : ''}{p.expected} bb/100</div>
              </div>
            );
          })}
        </div>

        {/* Benchmark */}
        <div style={{ padding: 10, background: 'rgba(34,211,238,0.06)', borderRadius: 8, border: '1px solid rgba(34,211,238,0.12)' }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: '#22d3ee', marginBottom: 6 }}>Win Rate Benchmarks (6-max)</div>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {BENCHMARKS.map(b => (
              <span key={b.level} style={{ fontSize: 9, padding: '3px 8px', borderRadius: 4, background: `${b.color}22`, color: b.color, fontWeight: 600 }}>{b.level}</span>
            ))}
          </div>
        </div>
      </div>
    );
  } catch (err) {
    return <div style={{ padding: 20, color: '#ef4444' }}>Position Profit Tracker failed to load: {err.message}</div>;
  }
}

export default PositionProfitTracker;
