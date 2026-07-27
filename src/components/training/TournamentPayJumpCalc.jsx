/**
 * TournamentPayJumpCalc — Pay Jump Equity Calculator
 * ●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●
 * Calculate equity gained/lost from pay jumps in tournament situations.
 * Shows how ICM equity changes with each elimination.
 */
import React, { useState, useMemo } from 'react';

const TOURNAMENT_STRUCTURES = [
  {
    name: '$100 SNG (9-max)',
    buyIn: 100,
    prizePool: 900,
    payouts: [{ place: '1st', pct: 50, amount: 450 }, { place: '2nd', pct: 30, amount: 270 }, { place: '3rd', pct: 20, amount: 180 }],
    jumps: [
      { from: 4, to: 3, label: 'Bubble → Money', jumpValue: 180, significance: 'CRITICAL', color: '#ef4444' },
      { from: 3, to: 2, label: '3rd → 2nd', jumpValue: 90, significance: 'Important', color: '#f59e0b' },
      { from: 2, to: 1, label: '2nd → 1st', jumpValue: 180, significance: 'High', color: '#10b981' },
    ],
  },
  {
    name: '$1K MTT Final Table',
    buyIn: 1000,
    prizePool: 500000,
    payouts: [
      { place: '1st', pct: 25, amount: 125000 }, { place: '2nd', pct: 15, amount: 75000 },
      { place: '3rd', pct: 10, amount: 50000 }, { place: '4th', pct: 7.5, amount: 37500 },
      { place: '5th', pct: 6, amount: 30000 }, { place: '6th', pct: 5, amount: 25000 },
      { place: '7th', pct: 4, amount: 20000 }, { place: '8th', pct: 3.5, amount: 17500 },
      { place: '9th', pct: 3, amount: 15000 },
    ],
    jumps: [
      { from: 9, to: 8, label: '9th → 8th', jumpValue: 2500, significance: 'Low', color: '#6b7280' },
      { from: 6, to: 5, label: '6th → 5th', jumpValue: 5000, significance: 'Medium', color: '#3b82f6' },
      { from: 4, to: 3, label: '4th → 3rd', jumpValue: 12500, significance: 'High', color: '#f59e0b' },
      { from: 3, to: 2, label: '3rd → 2nd', jumpValue: 25000, significance: 'Very High', color: '#ef4444' },
      { from: 2, to: 1, label: '2nd → 1st', jumpValue: 50000, significance: 'MASSIVE', color: '#10b981' },
    ],
  },
  {
    name: 'Satellite (10 seats)',
    buyIn: 500,
    prizePool: 50000,
    payouts: [
      { place: '1st-10th', pct: 10, amount: 5000 },
    ],
    jumps: [
      { from: 11, to: 10, label: 'Bubble → Seat', jumpValue: 5000, significance: 'MAXIMUM', color: '#ef4444' },
      { from: 10, to: 9, label: 'Already in', jumpValue: 0, significance: 'Zero', color: '#6b7280' },
    ],
  },
];

function TournamentPayJumpCalc() {
  const [selectedTourney, setSelectedTourney] = useState(1);
  const [heroChips, setHeroChips] = useState(25);

  const tourney = TOURNAMENT_STRUCTURES[selectedTourney];

  const icmEquity = useMemo(() => {
    // Simplified ICM: equity ≈ chip proportion * total prizes (rough approximation)
    const totalPrize = tourney.prizePool;
    const chipEquity = (heroChips / 100) * totalPrize;
    return Math.round(chipEquity);
  }, [heroChips, tourney]);

  try {
    return (
      <div style={{ padding: 20, background: 'rgba(0,0,0,0.3)', borderRadius: 12, border: '1px solid rgba(255,255,255,0.08)' }}>
        <h3 style={{ margin: '0 0 16px 0', fontSize: 18, color: '#fbbf24' }}>Pay Jump Calculator</h3>

        {/* Tournament Selector */}
        <div style={{ display: 'flex', gap: 4, marginBottom: 16, flexWrap: 'wrap' }}>
          {TOURNAMENT_STRUCTURES.map((t, i) => (
            <button key={t.name} onClick={() => setSelectedTourney(i)} style={{
              padding: '5px 12px', borderRadius: 6, fontSize: 11, fontWeight: 600, cursor: 'pointer',
              background: selectedTourney === i ? '#fbbf24' : 'rgba(255,255,255,0.06)',
              color: selectedTourney === i ? '#000' : 'rgba(255,255,255,0.6)', border: 'none',
            }}>{t.name}</button>
          ))}
        </div>

        {/* Prize Pool Info */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8, marginBottom: 16 }}>
          <div style={{ padding: 8, background: 'rgba(255,255,255,0.03)', borderRadius: 8, textAlign: 'center' }}>
            <div style={{ fontSize: 14, fontWeight: 800, color: '#fbbf24' }}>${tourney.prizePool.toLocaleString()}</div>
            <div style={{ fontSize: 9, color: 'rgba(255,255,255,0.4)' }}>Prize Pool</div>
          </div>
          <div style={{ padding: 8, background: 'rgba(255,255,255,0.03)', borderRadius: 8, textAlign: 'center' }}>
            <div style={{ fontSize: 14, fontWeight: 800, color: '#fff' }}>${tourney.buyIn.toLocaleString()}</div>
            <div style={{ fontSize: 9, color: 'rgba(255,255,255,0.4)' }}>Buy-In</div>
          </div>
          <div style={{ padding: 8, background: 'rgba(255,255,255,0.03)', borderRadius: 8, textAlign: 'center' }}>
            <div style={{ fontSize: 14, fontWeight: 800, color: '#10b981' }}>${icmEquity.toLocaleString()}</div>
            <div style={{ fontSize: 9, color: 'rgba(255,255,255,0.4)' }}>Your ICM Equity ({heroChips}% chips)</div>
          </div>
        </div>

        {/* Chip Slider */}
        <div style={{ padding: 8, background: 'rgba(255,255,255,0.03)', borderRadius: 8, marginBottom: 16 }}>
          <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.5)', marginBottom: 4 }}>Your Chip Stack (%)</div>
          <input type="range" min={1} max={60} value={heroChips} onChange={e => setHeroChips(parseInt(e.target.value))} style={{ width: '100%', accentColor: '#fbbf24' }} />
          <div style={{ fontSize: 14, fontWeight: 700, color: '#fff', textAlign: 'center' }}>{heroChips}% of chips in play</div>
        </div>

        {/* Payout Table */}
        <div style={{ fontSize: 12, fontWeight: 600, color: '#fff', marginBottom: 6 }}>Payout Structure</div>
        <div style={{ display: 'flex', gap: 4, marginBottom: 16, flexWrap: 'wrap' }}>
          {tourney.payouts.map((p, i) => (
            <div key={i} style={{ padding: '6px 10px', background: 'rgba(255,255,255,0.03)', borderRadius: 6, textAlign: 'center' }}>
              <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.4)' }}>{p.place}</div>
              <div style={{ fontSize: 13, fontWeight: 700, color: '#fbbf24' }}>${p.amount.toLocaleString()}</div>
            </div>
          ))}
        </div>

        {/* Pay Jumps */}
        <div style={{ fontSize: 12, fontWeight: 600, color: '#fff', marginBottom: 6 }}>Key Pay Jumps</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {tourney.jumps.map((j, i) => (
            <div key={i} style={{ padding: 10, background: 'rgba(255,255,255,0.03)', borderRadius: 8, borderLeft: `4px solid ${j.color}` }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <span style={{ fontSize: 13, fontWeight: 700, color: j.color }}>{j.label}</span>
                  <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.4)', marginLeft: 8 }}>{j.significance}</span>
                </div>
                <span style={{ fontSize: 14, fontWeight: 800, color: j.jumpValue > 0 ? '#10b981' : '#6b7280' }}>
                  +${j.jumpValue.toLocaleString()}
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  } catch (err) {
    return <div style={{ padding: 20, color: '#ef4444' }}>Pay Jump Calculator failed to load: {err.message}</div>;
  }
}

export default TournamentPayJumpCalc;
