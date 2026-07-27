/**
 * WIN RATE PROJECTOR
 * ●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●
 * Project long-term win rates and earnings:
 * - Win rate input with confidence intervals
 * - Hourly/monthly/yearly earnings projection
 * - Variance and standard deviation
 * - Required sample size for significance
 * - Stake recommendation based on bankroll
 * ●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●
 */

import React, { useState, useMemo } from 'react';

// ●●● STAKE LEVELS ●●●
const STAKES = [
  { label: '$0.25/0.50', bbSize: 0.50, name: 'NL50' },
  { label: '$0.50/1.00', bbSize: 1.00, name: 'NL100' },
  { label: '$1/2', bbSize: 2.00, name: 'NL200' },
  { label: '$2/5', bbSize: 5.00, name: 'NL500' },
  { label: '$5/10', bbSize: 10.00, name: 'NL1000' },
  { label: '$10/20', bbSize: 20.00, name: 'NL2000' },
  { label: '$25/50', bbSize: 50.00, name: 'NL5000' },
];

// ●●● MAIN COMPONENT ●●●
export default function WinRateProjector() {
  const [winRate, setWinRate] = useState(5.0);
  const [stdDev, setStdDev] = useState(80);
  const [hoursPerWeek, setHoursPerWeek] = useState(20);
  const [handsPerHour, setHandsPerHour] = useState(75);
  const [selectedStake, setSelectedStake] = useState(3); // index into STAKES
  const [bankroll, setBankroll] = useState(10000);

  const projections = useMemo(() => {
    const stake = STAKES[selectedStake];
    const bbPerHour = winRate * (handsPerHour / 100);
    const dollarPerHour = bbPerHour * stake.bbSize;
    const hourlyVariance = (stdDev * stake.bbSize) * Math.sqrt(handsPerHour / 100);

    const weeklyHours = hoursPerWeek;
    const monthlyHours = weeklyHours * 4.33;
    const yearlyHours = weeklyHours * 52;

    const weeklyEarnings = dollarPerHour * weeklyHours;
    const monthlyEarnings = dollarPerHour * monthlyHours;
    const yearlyEarnings = dollarPerHour * yearlyHours;

    // Confidence intervals (1 std dev = 68%)
    const monthlyHands = handsPerHour * monthlyHours;
    const monthlyStdDev = (stdDev * stake.bbSize / 100) * Math.sqrt(monthlyHands);
    const monthlyLow = monthlyEarnings - monthlyStdDev;
    const monthlyHigh = monthlyEarnings + monthlyStdDev;

    // Required hands for statistical significance (95% confidence that WR > 0)
    const requiredHands = winRate > 0 ? Math.round(Math.pow((1.96 * stdDev) / winRate, 2) * 100) : Infinity;
    const requiredHours = requiredHands > 0 ? Math.round(requiredHands / handsPerHour) : Infinity;

    // Risk of ruin (simplified)
    const ror = winRate > 0 ? Math.min(100, Math.max(0, Math.exp(-2 * winRate * (bankroll / stake.bbSize) / (stdDev * stdDev)) * 100)) : 100;

    // Recommended stake based on bankroll (30 buy-in rule)
    const maxBuyIn = bankroll / 30;
    const recommendedStakeIdx = STAKES.reduce((best, s, i) => {
      if (s.bbSize * 100 <= maxBuyIn) return i;
      return best;
    }, 0);

    // Break-even probability over various sample sizes
    const breakEvenProbs = [1000, 5000, 10000, 25000, 50000, 100000].map(hands => {
      if (winRate <= 0) return { hands, prob: 0 };
      const z = (winRate * (hands / 100)) / (stdDev * Math.sqrt(hands / 100));
      // Approximate normal CDF
      const p = 0.5 * (1 + Math.tanh(Math.sqrt(2 / Math.PI) * (z + 0.044715 * z * z * z)));
      return { hands, prob: Math.round(p * 1000) / 10 };
    });

    return {
      bbPerHour, dollarPerHour, hourlyVariance,
      weeklyEarnings, monthlyEarnings, yearlyEarnings,
      monthlyLow, monthlyHigh,
      requiredHands, requiredHours,
      ror, recommendedStakeIdx,
      breakEvenProbs,
      stake,
    };
  }, [winRate, stdDev, hoursPerWeek, handsPerHour, selectedStake, bankroll]);

  try {
    return (
      <div style={{ background: 'rgba(15,23,42,0.6)', borderRadius: 12, padding: 20, border: '1px solid rgba(255,255,255,0.06)' }}>
        <div style={{ marginBottom: 16 }}>
          <h3 style={{ color: '#f1f5f9', fontSize: 18, fontWeight: 700, margin: 0 }}>Win Rate Projector</h3>
          <div style={{ color: '#64748b', fontSize: 11, marginTop: 2 }}>Project your long-term earnings and variance</div>
        </div>

        {/* Inputs */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 16 }}>
          {[
            { label: 'Win Rate (bb/100)', value: winRate, set: setWinRate, min: -10, max: 20, step: 0.5, color: '#22c55e', suffix: ' bb/100' },
            { label: 'Std Deviation', value: stdDev, set: setStdDev, min: 40, max: 150, step: 5, color: '#f59e0b', suffix: ' bb/100' },
            { label: 'Hours/Week', value: hoursPerWeek, set: setHoursPerWeek, min: 2, max: 60, step: 2, color: '#3b82f6', suffix: 'h' },
            { label: 'Hands/Hour', value: handsPerHour, set: setHandsPerHour, min: 25, max: 300, step: 25, color: '#a78bfa', suffix: '' },
          ].map(inp => (
            <div key={inp.label} style={{ background: 'rgba(0,0,0,0.15)', borderRadius: 6, padding: 8 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                <span style={{ color: '#64748b', fontSize: 8, fontWeight: 600, textTransform: 'uppercase' }}>{inp.label}</span>
                <span style={{ color: inp.color, fontSize: 11, fontWeight: 800 }}>{inp.value}{inp.suffix}</span>
              </div>
              <input type="range" min={inp.min} max={inp.max} step={inp.step} value={inp.value}
                onChange={e => inp.set(Number(e.target.value))}
                style={{ width: '100%', accentColor: inp.color, height: 4, cursor: 'pointer' }} />
            </div>
          ))}
        </div>

        {/* Stake selector */}
        <div style={{ display: 'flex', gap: 3, marginBottom: 12, overflowX: 'auto' }}>
          {STAKES.map((s, i) => (
            <button key={i} onClick={() => setSelectedStake(i)} style={{
              padding: '4px 8px', borderRadius: 4, cursor: 'pointer', whiteSpace: 'nowrap',
              background: selectedStake === i ? 'rgba(245,158,11,0.15)' : 'rgba(0,0,0,0.1)',
              border: selectedStake === i ? '1px solid rgba(245,158,11,0.3)' : '1px solid transparent',
              color: selectedStake === i ? '#f59e0b' : '#94a3b8', fontSize: 9, fontWeight: 600,
            }}>{s.label}</button>
          ))}
        </div>

        {/* Bankroll input */}
        <div style={{ background: 'rgba(0,0,0,0.1)', borderRadius: 6, padding: 8, marginBottom: 16 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
            <span style={{ color: '#64748b', fontSize: 8, fontWeight: 600, textTransform: 'uppercase' }}>Bankroll</span>
            <span style={{ color: '#22c55e', fontSize: 11, fontWeight: 800 }}>${bankroll.toLocaleString()}</span>
          </div>
          <input type="range" min={500} max={100000} step={500} value={bankroll}
            onChange={e => setBankroll(Number(e.target.value))}
            style={{ width: '100%', accentColor: '#22c55e', height: 4, cursor: 'pointer' }} />
        </div>

        {/* Earnings projections */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 6, marginBottom: 16 }}>
          {[
            { label: '$/Hour', value: `$${projections.dollarPerHour.toFixed(0)}`, color: projections.dollarPerHour >= 0 ? '#22c55e' : '#ef4444' },
            { label: '$/Week', value: `$${projections.weeklyEarnings.toFixed(0)}`, color: projections.weeklyEarnings >= 0 ? '#22c55e' : '#ef4444' },
            { label: '$/Month', value: `$${projections.monthlyEarnings.toFixed(0)}`, color: projections.monthlyEarnings >= 0 ? '#22c55e' : '#ef4444' },
            { label: '$/Year', value: `$${projections.yearlyEarnings.toFixed(0)}`, color: projections.yearlyEarnings >= 0 ? '#22c55e' : '#ef4444' },
          ].map((p, i) => (
            <div key={i} style={{ background: 'rgba(0,0,0,0.2)', borderRadius: 6, padding: 8, textAlign: 'center' }}>
              <div style={{ color: '#64748b', fontSize: 7, fontWeight: 600, textTransform: 'uppercase' }}>{p.label}</div>
              <div style={{ color: p.color, fontSize: 16, fontWeight: 800 }}>{p.value}</div>
            </div>
          ))}
        </div>

        {/* Monthly confidence interval */}
        <div style={{ background: 'rgba(0,0,0,0.1)', borderRadius: 8, padding: 10, marginBottom: 16 }}>
          <div style={{ color: '#64748b', fontSize: 8, fontWeight: 700, textTransform: 'uppercase', marginBottom: 6 }}>Monthly Range (68% Confidence)</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ color: '#ef4444', fontSize: 12, fontWeight: 800 }}>${projections.monthlyLow.toFixed(0)}</span>
            <div style={{ flex: 1, height: 10, background: 'rgba(0,0,0,0.2)', borderRadius: 5, overflow: 'hidden', position: 'relative' }}>
              <div style={{
                position: 'absolute', left: '20%', right: '20%', top: 0, bottom: 0,
                background: 'linear-gradient(90deg, #ef4444, #f59e0b, #22c55e)', opacity: 0.4, borderRadius: 5,
              }} />
              <div style={{
                position: 'absolute', left: '50%', top: 0, bottom: 0, width: 2,
                background: '#f1f5f9', transform: 'translateX(-1px)',
              }} />
            </div>
            <span style={{ color: '#22c55e', fontSize: 12, fontWeight: 800 }}>${projections.monthlyHigh.toFixed(0)}</span>
          </div>
          <div style={{ color: '#94a3b8', fontSize: 9, textAlign: 'center', marginTop: 4 }}>
            Expected: ${projections.monthlyEarnings.toFixed(0)}/month at {STAKES[selectedStake].label}
          </div>
        </div>

        {/* Statistical significance + Risk */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 6, marginBottom: 16 }}>
          <div style={{ background: 'rgba(0,0,0,0.15)', borderRadius: 6, padding: 8, textAlign: 'center' }}>
            <div style={{ color: '#64748b', fontSize: 7, fontWeight: 600, textTransform: 'uppercase' }}>Hands for 95% Sig</div>
            <div style={{ color: '#3b82f6', fontSize: 14, fontWeight: 800 }}>
              {projections.requiredHands < 1000000 ? `${(projections.requiredHands / 1000).toFixed(0)}k` : '∞'}
            </div>
            <div style={{ color: '#475569', fontSize: 7 }}>
              {projections.requiredHours < 10000 ? `~${projections.requiredHours} hours` : 'Very long'}
            </div>
          </div>
          <div style={{ background: 'rgba(0,0,0,0.15)', borderRadius: 6, padding: 8, textAlign: 'center' }}>
            <div style={{ color: '#64748b', fontSize: 7, fontWeight: 600, textTransform: 'uppercase' }}>Risk of Ruin</div>
            <div style={{ color: projections.ror < 1 ? '#22c55e' : projections.ror < 5 ? '#f59e0b' : '#ef4444', fontSize: 14, fontWeight: 800 }}>
              {projections.ror < 0.01 ? '<0.01%' : `${projections.ror.toFixed(1)}%`}
            </div>
            <div style={{ color: '#475569', fontSize: 7 }}>At ${bankroll.toLocaleString()} roll</div>
          </div>
          <div style={{ background: 'rgba(0,0,0,0.15)', borderRadius: 6, padding: 8, textAlign: 'center' }}>
            <div style={{ color: '#64748b', fontSize: 7, fontWeight: 600, textTransform: 'uppercase' }}>Rec. Stake</div>
            <div style={{ color: '#f59e0b', fontSize: 14, fontWeight: 800 }}>
              {STAKES[projections.recommendedStakeIdx].name}
            </div>
            <div style={{ color: '#475569', fontSize: 7 }}>30 buy-in rule</div>
          </div>
        </div>

        {/* Break-even probability */}
        <div style={{ background: 'rgba(0,0,0,0.1)', borderRadius: 8, padding: 10 }}>
          <div style={{ color: '#64748b', fontSize: 8, fontWeight: 700, textTransform: 'uppercase', marginBottom: 6 }}>Probability of Being Ahead After N Hands</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
            {projections.breakEvenProbs.map(bp => (
              <div key={bp.hands} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ color: '#94a3b8', fontSize: 9, width: 50, textAlign: 'right' }}>{(bp.hands / 1000)}k</span>
                <div style={{ flex: 1, height: 10, background: 'rgba(0,0,0,0.2)', borderRadius: 3, overflow: 'hidden' }}>
                  <div style={{
                    width: `${bp.prob}%`, height: '100%', borderRadius: 3,
                    background: bp.prob > 80 ? '#22c55e' : bp.prob > 60 ? '#f59e0b' : '#ef4444',
                    opacity: 0.6, transition: 'width 0.3s',
                  }} />
                </div>
                <span style={{
                  color: bp.prob > 80 ? '#22c55e' : bp.prob > 60 ? '#f59e0b' : '#ef4444',
                  fontSize: 10, fontWeight: 800, width: 36, textAlign: 'right',
                }}>{bp.prob}%</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  } catch (err) {
    return (
      <div style={{ background: 'rgba(15,23,42,0.6)', borderRadius: 12, padding: 20, border: '1px solid rgba(255,255,255,0.06)' }}>
        <h3 style={{ color: '#f1f5f9', fontSize: 18, margin: 0 }}>Win Rate Projector</h3>
        <p style={{ color: '#64748b', fontSize: 13 }}>Component loading... Please refresh if this persists.</p>
      </div>
    );
  }
}
