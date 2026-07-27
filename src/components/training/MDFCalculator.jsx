/**
 * MDFCalculator — Minimum Defense Frequency Calculator
 * ●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●
 * Calculate how often you must call/raise to prevent villain from
 * profiting with any two cards as a bluff. Core GTO concept.
 */
import React, { useState, useMemo } from 'react';

function MDFCalculator() {
  const [pot, setPot] = useState(20);
  const [betSize, setBetSize] = useState(15);

  const calc = useMemo(() => {
    const totalPot = pot + betSize;
    const mdf = (pot / totalPot) * 100;
    const potOdds = (betSize / (totalPot + betSize)) * 100;
    const alpha = (betSize / totalPot) * 100;
    const foldPct = 100 - mdf;
    const betPotPct = Math.round((betSize / pot) * 100);

    // Common sizing benchmarks
    const benchmarks = [
      { size: '25% pot', ratio: 0.25 },
      { size: '33% pot', ratio: 0.33 },
      { size: '50% pot', ratio: 0.50 },
      { size: '66% pot', ratio: 0.66 },
      { size: '75% pot', ratio: 0.75 },
      { size: '100% pot', ratio: 1.00 },
      { size: '150% pot', ratio: 1.50 },
      { size: '200% pot', ratio: 2.00 },
    ].map(b => {
      const bAmt = pot * b.ratio;
      const bMdf = (pot / (pot + bAmt)) * 100;
      const bPotOdds = (bAmt / (pot + bAmt + bAmt)) * 100;
      return { ...b, mdf: Math.round(bMdf * 10) / 10, potOdds: Math.round(bPotOdds * 10) / 10 };
    });

    return {
      mdf: Math.round(mdf * 10) / 10,
      potOdds: Math.round(potOdds * 10) / 10,
      alpha: Math.round(alpha * 10) / 10,
      foldPct: Math.round(foldPct * 10) / 10,
      betPotPct,
      benchmarks,
    };
  }, [pot, betSize]);

  try {
    return (
      <div style={{ padding: 20, background: 'rgba(0,0,0,0.3)', borderRadius: 12, border: '1px solid rgba(255,255,255,0.08)' }}>
        <h3 style={{ margin: '0 0 16px 0', fontSize: 18, color: '#8b5cf6' }}>MDF Calculator</h3>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 16 }}>
          <div style={{ padding: 8, background: 'rgba(255,255,255,0.03)', borderRadius: 8, textAlign: 'center' }}>
            <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.4)' }}>Pot Size</div>
            <input type="range" min={2} max={100} value={pot} onChange={e => setPot(parseInt(e.target.value))} style={{ width: '100%', accentColor: '#10b981' }} />
            <div style={{ fontSize: 18, fontWeight: 900, color: '#10b981' }}>{pot} bb</div>
          </div>
          <div style={{ padding: 8, background: 'rgba(255,255,255,0.03)', borderRadius: 8, textAlign: 'center' }}>
            <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.4)' }}>Bet Size</div>
            <input type="range" min={1} max={100} value={betSize} onChange={e => setBetSize(parseInt(e.target.value))} style={{ width: '100%', accentColor: '#ef4444' }} />
            <div style={{ fontSize: 18, fontWeight: 900, color: '#ef4444' }}>{betSize} bb ({calc.betPotPct}% pot)</div>
          </div>
        </div>

        {/* Results */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8, marginBottom: 16 }}>
          <div style={{ padding: 12, background: 'rgba(139,92,246,0.08)', borderRadius: 10, textAlign: 'center', border: '1px solid rgba(139,92,246,0.2)' }}>
            <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.4)' }}>MDF</div>
            <div style={{ fontSize: 28, fontWeight: 900, color: '#8b5cf6' }}>{calc.mdf}%</div>
            <div style={{ fontSize: 9, color: 'rgba(255,255,255,0.3)' }}>Must defend</div>
          </div>
          <div style={{ padding: 12, background: 'rgba(59,130,246,0.08)', borderRadius: 10, textAlign: 'center', border: '1px solid rgba(59,130,246,0.2)' }}>
            <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.4)' }}>Pot Odds</div>
            <div style={{ fontSize: 28, fontWeight: 900, color: '#3b82f6' }}>{calc.potOdds}%</div>
            <div style={{ fontSize: 9, color: 'rgba(255,255,255,0.3)' }}>Need to win</div>
          </div>
          <div style={{ padding: 12, background: 'rgba(239,68,68,0.08)', borderRadius: 10, textAlign: 'center', border: '1px solid rgba(239,68,68,0.2)' }}>
            <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.4)' }}>Max Fold %</div>
            <div style={{ fontSize: 28, fontWeight: 900, color: '#ef4444' }}>{calc.foldPct}%</div>
            <div style={{ fontSize: 9, color: 'rgba(255,255,255,0.3)' }}>Can fold</div>
          </div>
        </div>

        {/* Visual bar */}
        <div style={{ marginBottom: 16 }}>
          <div style={{ display: 'flex', height: 24, borderRadius: 6, overflow: 'hidden' }}>
            <div style={{ width: `${calc.mdf}%`, background: '#8b5cf6', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <span style={{ fontSize: 10, fontWeight: 700, color: '#fff' }}>Defend {calc.mdf}%</span>
            </div>
            <div style={{ width: `${calc.foldPct}%`, background: '#6b7280', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <span style={{ fontSize: 10, fontWeight: 700, color: '#fff' }}>Fold {calc.foldPct}%</span>
            </div>
          </div>
        </div>

        {/* Reference table */}
        <div style={{ padding: 10, background: 'rgba(139,92,246,0.06)', borderRadius: 8, border: '1px solid rgba(139,92,246,0.12)' }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: '#8b5cf6', marginBottom: 6 }}>Quick Reference</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 4 }}>
            <div style={{ fontSize: 9, fontWeight: 600, color: 'rgba(255,255,255,0.4)', padding: 3 }}>Size</div>
            <div style={{ fontSize: 9, fontWeight: 600, color: 'rgba(255,255,255,0.4)', padding: 3, textAlign: 'center' }}>MDF</div>
            <div style={{ fontSize: 9, fontWeight: 600, color: 'rgba(255,255,255,0.4)', padding: 3, textAlign: 'center' }}>Pot Odds</div>
            <div style={{ fontSize: 9, fontWeight: 600, color: 'rgba(255,255,255,0.4)', padding: 3, textAlign: 'right' }}>Fold</div>
            {calc.benchmarks.map(b => (
              <React.Fragment key={b.size}>
                <div style={{ fontSize: 10, color: '#fff', padding: 3 }}>{b.size}</div>
                <div style={{ fontSize: 10, fontWeight: 700, color: '#8b5cf6', padding: 3, textAlign: 'center' }}>{b.mdf}%</div>
                <div style={{ fontSize: 10, fontWeight: 700, color: '#3b82f6', padding: 3, textAlign: 'center' }}>{b.potOdds}%</div>
                <div style={{ fontSize: 10, fontWeight: 700, color: '#ef4444', padding: 3, textAlign: 'right' }}>{Math.round((100 - b.mdf) * 10) / 10}%</div>
              </React.Fragment>
            ))}
          </div>
        </div>
      </div>
    );
  } catch (err) {
    return <div style={{ padding: 20, color: '#ef4444' }}>MDF Calculator failed to load: {err.message}</div>;
  }
}

export default MDFCalculator;
