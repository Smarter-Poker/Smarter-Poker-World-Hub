/**
 * VarianceSimulator — GTO Wizard-Style Variance & Downswing Simulator
 * ●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●
 * Monte Carlo simulation showing expected variance, downswings, and
 * probability distributions for given win rates and sample sizes.
 */
import React, { useState, useMemo, useCallback } from 'react';

function generateSimulation(winRate, stdDev, numHands, numSims) {
  const results = [];
  for (let sim = 0; sim < numSims; sim++) {
    let cumulative = 0;
    let maxDrawdown = 0;
    let peak = 0;
    const path = [0];
    for (let h = 0; h < numHands; h += 100) {
      const result = (winRate + stdDev * gaussianRandom()) / 100;
      cumulative += result;
      if (cumulative > peak) peak = cumulative;
      const dd = peak - cumulative;
      if (dd > maxDrawdown) maxDrawdown = dd;
      path.push(cumulative);
    }
    results.push({ finalBB: cumulative, maxDrawdown, path });
  }
  return results;
}

function gaussianRandom() {
  let u = 0, v = 0;
  while (u === 0) u = Math.random();
  while (v === 0) v = Math.random();
  return Math.sqrt(-2.0 * Math.log(u)) * Math.cos(2.0 * Math.PI * v);
}

function MiniGraph({ paths, width, height }) {
  if (!paths || paths.length === 0) return null;
  const allVals = paths.flatMap(p => p);
  const minVal = Math.min(...allVals);
  const maxVal = Math.max(...allVals);
  const range = maxVal - minVal || 1;
  const maxLen = Math.max(...paths.map(p => p.length));

  return (
    <svg width={width} height={height} style={{ display: 'block' }}>
      <line x1={0} y1={height * (1 - (0 - minVal) / range)} x2={width} y2={height * (1 - (0 - minVal) / range)} stroke="rgba(255,255,255,0.15)" strokeWidth={1} strokeDasharray="4,4" />
      {paths.map((path, pi) => {
        const step = width / (maxLen - 1);
        const d = path.map((v, i) => {
          const x = i * step;
          const y = height - ((v - minVal) / range) * height;
          return `${i === 0 ? 'M' : 'L'} ${x} ${y}`;
        }).join(' ');
        const final = path[path.length - 1];
        const color = final >= 0 ? `rgba(16,185,129,${0.15 + pi * 0.05})` : `rgba(239,68,68,${0.15 + pi * 0.05})`;
        return <path key={pi} d={d} fill="none" stroke={color} strokeWidth={1.5} />;
      })}
    </svg>
  );
}

function VarianceSimulator() {
  const [winRate, setWinRate] = useState(5);
  const [stdDev, setStdDev] = useState(80);
  const [numHands, setNumHands] = useState(50000);
  const [simCount, setSimCount] = useState(8);
  const [simKey, setSimKey] = useState(0);

  const results = useMemo(() => {
    return generateSimulation(winRate, stdDev, numHands, simCount);
  }, [winRate, stdDev, numHands, simCount, simKey]);

  const stats = useMemo(() => {
    const finals = results.map(r => r.finalBB);
    const drawdowns = results.map(r => r.maxDrawdown);
    const avg = finals.reduce((s, v) => s + v, 0) / finals.length;
    const best = Math.max(...finals);
    const worst = Math.min(...finals);
    const avgDD = drawdowns.reduce((s, v) => s + v, 0) / drawdowns.length;
    const maxDD = Math.max(...drawdowns);
    const losingSims = finals.filter(f => f < 0).length;
    const losingPct = Math.round((losingSims / finals.length) * 100);
    return { avg, best, worst, avgDD, maxDD, losingSims, losingPct };
  }, [results]);

  const runSim = useCallback(() => setSimKey(k => k + 1), []);

  try {
    return (
      <div style={{ padding: 20, background: 'rgba(0,0,0,0.3)', borderRadius: 12, border: '1px solid rgba(255,255,255,0.08)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <h3 style={{ margin: 0, fontSize: 18, color: '#ec4899' }}>Variance Simulator</h3>
          <button onClick={runSim} style={{
            padding: '6px 16px', borderRadius: 6, border: 'none', fontSize: 12, fontWeight: 700,
            cursor: 'pointer', background: '#ec4899', color: '#fff',
          }}>Re-Simulate</button>
        </div>

        {/* Controls */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 12, marginBottom: 16 }}>
          {[
            { label: 'Win Rate (bb/100)', value: winRate, set: setWinRate, min: -10, max: 30, step: 0.5 },
            { label: 'Std Dev (bb/100)', value: stdDev, set: setStdDev, min: 40, max: 150, step: 5 },
            { label: 'Sample (hands)', value: numHands, set: setNumHands, min: 5000, max: 200000, step: 5000 },
            { label: 'Simulations', value: simCount, set: setSimCount, min: 2, max: 20, step: 1 },
          ].map(c => (
            <div key={c.label} style={{ padding: 10, background: 'rgba(255,255,255,0.03)', borderRadius: 8 }}>
              <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.5)', marginBottom: 4 }}>{c.label}</div>
              <input
                type="range" min={c.min} max={c.max} step={c.step} value={c.value}
                onChange={e => c.set(parseFloat(e.target.value))}
                style={{ width: '100%', accentColor: '#ec4899' }}
              />
              <div style={{ fontSize: 14, fontWeight: 700, color: '#fff', textAlign: 'center' }}>
                {c.label.includes('hands') ? c.value.toLocaleString() : c.value}
              </div>
            </div>
          ))}
        </div>

        {/* Graph */}
        <div style={{ marginBottom: 16, padding: 12, background: 'rgba(236,72,153,0.04)', borderRadius: 10, border: '1px solid rgba(236,72,153,0.12)' }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: 'rgba(255,255,255,0.5)', marginBottom: 8 }}>
            {simCount} Simulated Paths ({numHands.toLocaleString()} hands each)
          </div>
          <MiniGraph paths={results.map(r => r.path)} width={500} height={180} />
        </div>

        {/* Stats Grid */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: 8, marginBottom: 16 }}>
          {[
            { label: 'Avg Result', value: `${stats.avg >= 0 ? '+' : ''}${stats.avg.toFixed(1)} bb`, color: stats.avg >= 0 ? '#10b981' : '#ef4444' },
            { label: 'Best Run', value: `+${stats.best.toFixed(1)} bb`, color: '#10b981' },
            { label: 'Worst Run', value: `${stats.worst.toFixed(1)} bb`, color: '#ef4444' },
            { label: 'Avg Drawdown', value: `${stats.avgDD.toFixed(1)} bb`, color: '#f59e0b' },
            { label: 'Max Drawdown', value: `${stats.maxDD.toFixed(1)} bb`, color: '#ef4444' },
            { label: 'Losing Sims', value: `${stats.losingSims}/${simCount} (${stats.losingPct}%)`, color: stats.losingPct > 30 ? '#ef4444' : '#f59e0b' },
          ].map(s => (
            <div key={s.label} style={{ padding: 10, background: 'rgba(255,255,255,0.03)', borderRadius: 8, textAlign: 'center' }}>
              <div style={{ fontSize: 15, fontWeight: 800, color: s.color }}>{s.value}</div>
              <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.4)', marginTop: 2 }}>{s.label}</div>
            </div>
          ))}
        </div>

        {/* Insights */}
        <div style={{ padding: 12, background: 'rgba(236,72,153,0.06)', borderRadius: 8, border: '1px solid rgba(236,72,153,0.15)' }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: '#ec4899', marginBottom: 6 }}>Key Insights</div>
          <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.8)', lineHeight: 1.7 }}>
            At {winRate} bb/100 with {stdDev} bb/100 std dev over {numHands.toLocaleString()} hands:
            {' '}{stats.losingPct > 0
              ? `You have a ${stats.losingPct}% chance of being a losing player despite being a winner. `
              : 'All simulations were profitable. '}
            Expected worst downswing is approximately {stats.maxDD.toFixed(0)} bb ({(stats.maxDD / 100).toFixed(1)} buy-ins at NL100).
            {stats.avgDD > 200 ? ' Consider increasing your bankroll to withstand variance.' : ' Your variance exposure is manageable with standard bankroll management.'}
          </div>
        </div>
      </div>
    );
  } catch (err) {
    return <div style={{ padding: 20, color: '#ef4444' }}>Variance Simulator failed to load: {err.message}</div>;
  }
}

export default VarianceSimulator;
