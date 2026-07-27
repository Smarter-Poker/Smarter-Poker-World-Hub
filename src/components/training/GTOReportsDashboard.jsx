/**
 * GTOReportsDashboard — GTO Reports: Your Stats vs Optimal
 * COMPETITIVE GAP CLOSER: Mirrors GTO Wizard's #1 feature
 * Compares player's actual frequencies against GTO-optimal frequencies
 * with color-coded deviation heatmaps and EV-loss tracking
 */
import React, { useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

// Simulated GTO benchmark data for common spots
const GTO_BENCHMARKS = {
  preflop: [
    { spot: 'UTG Open', gto: 14, yours: 18, action: 'VPIP', ev_loss: 2.1 },
    { spot: 'CO Open', gto: 27, yours: 32, action: 'VPIP', ev_loss: 1.4 },
    { spot: 'BTN Open', gto: 42, yours: 48, action: 'VPIP', ev_loss: 1.8 },
    { spot: 'SB Open', gto: 36, yours: 28, action: 'VPIP', ev_loss: 2.5 },
    { spot: 'BB Defend vs BTN', gto: 42, yours: 35, action: 'Defend', ev_loss: 3.2 },
    { spot: 'BB Defend vs CO', gto: 34, yours: 29, action: 'Defend', ev_loss: 1.9 },
    { spot: '3-Bet CO vs MP', gto: 8, yours: 5, action: '3-Bet', ev_loss: 1.1 },
    { spot: '3-Bet BTN vs CO', gto: 10, yours: 7, action: '3-Bet', ev_loss: 1.6 },
    { spot: '3-Bet SB vs BTN', gto: 12, yours: 8, action: '3-Bet', ev_loss: 2.3 },
    { spot: '4-Bet vs 3-Bet', gto: 22, yours: 16, action: '4-Bet', ev_loss: 1.7 },
  ],
  flop: [
    { spot: 'C-Bet IP SRP', gto: 55, yours: 68, action: 'C-Bet', ev_loss: 3.4 },
    { spot: 'C-Bet OOP SRP', gto: 35, yours: 50, action: 'C-Bet', ev_loss: 4.1 },
    { spot: 'C-Bet 3BP IP', gto: 48, yours: 62, action: 'C-Bet', ev_loss: 2.8 },
    { spot: 'C-Bet 3BP OOP', gto: 28, yours: 40, action: 'C-Bet', ev_loss: 3.6 },
    { spot: 'X-Raise vs C-Bet', gto: 12, yours: 7, action: 'X/R', ev_loss: 2.2 },
    { spot: 'Fold to C-Bet IP', gto: 38, yours: 32, action: 'Fold', ev_loss: 1.5 },
    { spot: 'Fold to C-Bet OOP', gto: 45, yours: 38, action: 'Fold', ev_loss: 2.1 },
    { spot: 'Donk Bet', gto: 2, yours: 8, action: 'Donk', ev_loss: 1.8 },
  ],
  turn: [
    { spot: 'Barrel IP after C-Bet', gto: 52, yours: 60, action: 'Barrel', ev_loss: 2.3 },
    { spot: 'Barrel OOP after C-Bet', gto: 40, yours: 50, action: 'Barrel', ev_loss: 3.0 },
    { spot: 'Check-Raise Turn', gto: 8, yours: 4, action: 'X/R', ev_loss: 1.7 },
    { spot: 'Probe after Check', gto: 25, yours: 18, action: 'Probe', ev_loss: 2.1 },
    { spot: 'Fold to Turn Bet', gto: 35, yours: 28, action: 'Fold', ev_loss: 2.5 },
    { spot: 'Delayed C-Bet', gto: 30, yours: 22, action: 'Delay CB', ev_loss: 1.4 },
  ],
  river: [
    { spot: 'Value Bet Thin', gto: 42, yours: 30, action: 'Value', ev_loss: 5.2 },
    { spot: 'Bluff River', gto: 28, yours: 18, action: 'Bluff', ev_loss: 4.1 },
    { spot: 'Call River Bet', gto: 45, yours: 38, action: 'Call', ev_loss: 3.8 },
    { spot: 'Fold to River Bet', gto: 40, yours: 48, action: 'Fold', ev_loss: 4.5 },
    { spot: 'River Overbet', gto: 8, yours: 3, action: 'Overbet', ev_loss: 2.3 },
    { spot: 'River X-Raise', gto: 6, yours: 3, action: 'X/R', ev_loss: 1.9 },
  ],
};

const STREETS = ['preflop', 'flop', 'turn', 'river'];

function getDeviation(gto, yours) {
  return yours - gto;
}

function getDeviationColor(dev) {
  const abs = Math.abs(dev);
  if (abs <= 2) return '#22c55e';  // Good
  if (abs <= 5) return '#f59e0b';  // Slight deviation
  if (abs <= 10) return '#ef4444'; // Significant
  return '#dc2626';                // Critical
}

function getDeviationLabel(dev) {
  if (dev > 5) return 'Over-doing';
  if (dev > 2) return 'Slightly high';
  if (dev < -5) return 'Under-doing';
  if (dev < -2) return 'Slightly low';
  return 'Optimal';
}

export default function GTOReportsDashboard() {
  const [street, setStreet] = useState('preflop');
  const [sortBy, setSortBy] = useState('ev_loss');

  const data = useMemo(() => {
    const items = GTO_BENCHMARKS[street] || [];
    return [...items].sort((a, b) => sortBy === 'ev_loss' ? b.ev_loss - a.ev_loss : Math.abs(getDeviation(b.gto, b.yours)) - Math.abs(getDeviation(a.gto, a.yours)));
  }, [street, sortBy]);

  const totalEVLoss = data.reduce((sum, d) => sum + d.ev_loss, 0);
  const avgDeviation = data.length ? (data.reduce((sum, d) => sum + Math.abs(getDeviation(d.gto, d.yours)), 0) / data.length).toFixed(1) : 0;

  return (
    <div style={{ padding: 20, color: '#e2e8f0' }}>
      <h3 style={{ fontSize: 20, fontWeight: 800, marginBottom: 4, background: 'linear-gradient(135deg, #ef4444, #f59e0b)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
        GTO Reports — Your Play vs Optimal
      </h3>
      <p style={{ color: '#94a3b8', fontSize: 12, marginBottom: 16 }}>Color-coded frequency analysis showing where you deviate from GTO.</p>

      {/* Summary Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8, marginBottom: 16 }}>
        <div style={{ background: 'rgba(239,68,68,0.1)', borderRadius: 10, padding: 12, textAlign: 'center', border: '1px solid rgba(239,68,68,0.2)' }}>
          <div style={{ fontSize: 22, fontWeight: 800, color: '#ef4444' }}>{totalEVLoss.toFixed(1)}</div>
          <div style={{ fontSize: 10, color: '#94a3b8' }}>Total EV Loss (bb/100)</div>
        </div>
        <div style={{ background: 'rgba(245,158,11,0.1)', borderRadius: 10, padding: 12, textAlign: 'center', border: '1px solid rgba(245,158,11,0.2)' }}>
          <div style={{ fontSize: 22, fontWeight: 800, color: '#f59e0b' }}>{avgDeviation}%</div>
          <div style={{ fontSize: 10, color: '#94a3b8' }}>Avg Deviation</div>
        </div>
        <div style={{ background: 'rgba(34,197,94,0.1)', borderRadius: 10, padding: 12, textAlign: 'center', border: '1px solid rgba(34,197,94,0.2)' }}>
          <div style={{ fontSize: 22, fontWeight: 800, color: '#22c55e' }}>{data.filter(d => Math.abs(getDeviation(d.gto, d.yours)) <= 2).length}/{data.length}</div>
          <div style={{ fontSize: 10, color: '#94a3b8' }}>Spots at GTO</div>
        </div>
      </div>

      {/* Street Tabs */}
      <div style={{ display: 'flex', gap: 6, marginBottom: 12 }}>
        {STREETS.map(s => (
          <button key={s} onClick={() => setStreet(s)}
            style={{ padding: '6px 14px', borderRadius: 8, border: street === s ? '2px solid #3b82f6' : '1px solid rgba(255,255,255,0.06)',
              background: street === s ? 'rgba(59,130,246,0.15)' : 'rgba(0,0,0,0.2)', cursor: 'pointer',
              fontSize: 12, fontWeight: 700, color: street === s ? '#3b82f6' : '#64748b', textTransform: 'capitalize' }}>
            {s}
          </button>
        ))}
        <div style={{ flex: 1 }} />
        <button onClick={() => setSortBy(sortBy === 'ev_loss' ? 'deviation' : 'ev_loss')}
          style={{ padding: '6px 10px', borderRadius: 8, background: 'rgba(0,0,0,0.2)', border: '1px solid rgba(255,255,255,0.06)',
            fontSize: 10, color: '#94a3b8', cursor: 'pointer' }}>
          Sort: {sortBy === 'ev_loss' ? 'EV Loss' : 'Deviation'}
        </button>
      </div>

      {/* Deviation Table */}
      <div style={{ background: 'rgba(0,0,0,0.3)', borderRadius: 12, overflow: 'hidden' }}>
        <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr 1fr 1fr 1.2fr', padding: '8px 12px', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
          {['Spot', 'GTO%', 'You%', 'Dev', 'EV Loss', 'Status'].map(h => (
            <div key={h} style={{ fontSize: 9, fontWeight: 700, color: '#64748b', textTransform: 'uppercase' }}>{h}</div>
          ))}
        </div>
        <AnimatePresence mode="wait">
          <motion.div key={street} initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
            {data.map((d, i) => {
              const dev = getDeviation(d.gto, d.yours);
              const devColor = getDeviationColor(dev);
              return (
                <div key={i} style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr 1fr 1fr 1.2fr', padding: '10px 12px',
                  borderBottom: '1px solid rgba(255,255,255,0.03)', background: i % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.02)' }}>
                  <div style={{ fontSize: 12, fontWeight: 600, color: '#e2e8f0' }}>{d.spot}</div>
                  <div style={{ fontSize: 12, color: '#94a3b8', fontFamily: 'monospace' }}>{d.gto}%</div>
                  <div style={{ fontSize: 12, color: devColor, fontWeight: 700, fontFamily: 'monospace' }}>{d.yours}%</div>
                  <div style={{ fontSize: 12, fontWeight: 700, fontFamily: 'monospace', color: devColor }}>
                    {dev > 0 ? '+' : ''}{dev}%
                  </div>
                  <div style={{ fontSize: 12, fontWeight: 700, fontFamily: 'monospace', color: '#ef4444' }}>
                    -{d.ev_loss.toFixed(1)}
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                    <div style={{ width: 6, height: 6, borderRadius: 3, background: devColor }} />
                    <span style={{ fontSize: 10, color: devColor, fontWeight: 600 }}>{getDeviationLabel(dev)}</span>
                  </div>
                </div>
              );
            })}
          </motion.div>
        </AnimatePresence>
      </div>

      {/* Deviation Heatmap Bar */}
      <div style={{ marginTop: 16, background: 'rgba(0,0,0,0.2)', borderRadius: 10, padding: 12 }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: '#94a3b8', marginBottom: 8 }}>DEVIATION HEATMAP</div>
        <div style={{ display: 'flex', gap: 2, height: 24, borderRadius: 4, overflow: 'hidden' }}>
          {data.map((d, i) => {
            const dev = getDeviation(d.gto, d.yours);
            return (
              <div key={i} style={{ flex: 1, background: getDeviationColor(dev), opacity: 0.6 + Math.min(Math.abs(dev) / 15, 0.4),
                position: 'relative', cursor: 'pointer' }} title={`${d.spot}: ${dev > 0 ? '+' : ''}${dev}%`} />
            );
          })}
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 6 }}>
          <span style={{ fontSize: 9, color: '#22c55e' }}>Optimal (±2%)</span>
          <span style={{ fontSize: 9, color: '#f59e0b' }}>Slight (±5%)</span>
          <span style={{ fontSize: 9, color: '#ef4444' }}>Significant (±10%)</span>
          <span style={{ fontSize: 9, color: '#dc2626' }}>Critical (&gt;10%)</span>
        </div>
      </div>
    </div>
  );
}
