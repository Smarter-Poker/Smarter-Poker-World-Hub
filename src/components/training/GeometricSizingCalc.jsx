/**
 * GeometricSizingCalc — Geometric Bet Sizing Calculator
 * ●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●
 * Calculate the exact geometric bet size to go all-in by the river.
 * Shows optimal sizing per street given stack depth and pot.
 */
import React, { useState, useMemo } from 'react';

function GeometricSizingCalc() {
  const [pot, setPot] = useState(6);
  const [stack, setStack] = useState(97);
  const [streetsLeft, setStreetsLeft] = useState(3);

  const calc = useMemo(() => {
    // Geometric sizing: each bet is the same fraction of the new pot
    // Solve: pot * (1 + 2r)^n = pot + 2*stack where r = bet/pot ratio
    // r = ((pot + 2*stack) / pot)^(1/n) - 1) / 2... simplified
    const totalPot = pot + 2 * stack;
    const growthFactor = totalPot / pot;
    const perStreetGrowth = Math.pow(growthFactor, 1 / streetsLeft);
    const betFraction = (perStreetGrowth - 1) / 2;
    const betPct = Math.round(betFraction * 100);

    const streets = [];
    let currentPot = pot;
    let remaining = stack;

    for (let i = 0; i < streetsLeft; i++) {
      const bet = Math.round(currentPot * betFraction * 10) / 10;
      const actualBet = Math.min(bet, remaining);
      const newPot = currentPot + actualBet * 2;
      remaining = Math.max(0, remaining - actualBet);
      const spr = newPot > 0 ? Math.round(remaining / newPot * 10) / 10 : 0;
      streets.push({
        street: ['Flop', 'Turn', 'River'][i] || `Street ${i + 1}`,
        pot: currentPot,
        bet: actualBet,
        potAfter: newPot,
        remaining,
        spr,
        pctPot: Math.round((actualBet / currentPot) * 100),
      });
      currentPot = newPot;
    }

    const totalBet = stack - remaining;
    const allIn = remaining <= 0.5;

    return { betPct, streets, totalBet, allIn, betFraction };
  }, [pot, stack, streetsLeft]);

  try {
    return (
      <div style={{ padding: 20, background: 'rgba(0,0,0,0.3)', borderRadius: 12, border: '1px solid rgba(255,255,255,0.08)' }}>
        <h3 style={{ margin: '0 0 16px 0', fontSize: 18, color: '#14b8a6' }}>Geometric Sizing Calculator</h3>

        {/* Inputs */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10, marginBottom: 16 }}>
          <div style={{ padding: 8, background: 'rgba(255,255,255,0.03)', borderRadius: 8, textAlign: 'center' }}>
            <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.5)', marginBottom: 2 }}>Pot (bb)</div>
            <input type="range" min={2} max={40} step={0.5} value={pot} onChange={e => setPot(parseFloat(e.target.value))} style={{ width: '100%', accentColor: '#14b8a6' }} />
            <div style={{ fontSize: 16, fontWeight: 800, color: '#fff' }}>{pot}</div>
          </div>
          <div style={{ padding: 8, background: 'rgba(255,255,255,0.03)', borderRadius: 8, textAlign: 'center' }}>
            <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.5)', marginBottom: 2 }}>Stack Behind (bb)</div>
            <input type="range" min={5} max={200} step={1} value={stack} onChange={e => setStack(parseInt(e.target.value))} style={{ width: '100%', accentColor: '#14b8a6' }} />
            <div style={{ fontSize: 16, fontWeight: 800, color: '#fff' }}>{stack}</div>
          </div>
          <div style={{ padding: 8, background: 'rgba(255,255,255,0.03)', borderRadius: 8, textAlign: 'center' }}>
            <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.5)', marginBottom: 2 }}>Streets Left</div>
            <div style={{ display: 'flex', gap: 4, justifyContent: 'center', marginTop: 8 }}>
              {[1, 2, 3].map(n => (
                <button key={n} onClick={() => setStreetsLeft(n)} style={{
                  padding: '6px 14px', borderRadius: 6, border: 'none', fontSize: 14, fontWeight: 700,
                  cursor: 'pointer', background: streetsLeft === n ? '#14b8a6' : 'rgba(255,255,255,0.08)',
                  color: streetsLeft === n ? '#000' : 'rgba(255,255,255,0.6)',
                }}>{n}</button>
              ))}
            </div>
          </div>
        </div>

        {/* Result */}
        <div style={{ textAlign: 'center', padding: 16, background: 'rgba(20,184,166,0.08)', borderRadius: 10, border: '1px solid rgba(20,184,166,0.2)', marginBottom: 16 }}>
          <div style={{ fontSize: 36, fontWeight: 900, color: '#14b8a6' }}>{calc.betPct}%</div>
          <div style={{ fontSize: 14, fontWeight: 600, color: '#14b8a6' }}>Geometric Bet Size (per street)</div>
          <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.5)', marginTop: 4 }}>
            Bet {calc.betPct}% of pot each street to {calc.allIn ? 'go all-in by river' : 'commit maximum'}
          </div>
        </div>

        {/* Street Breakdown */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 16 }}>
          {calc.streets.map((s, i) => {
            const colors = ['#3b82f6', '#10b981', '#f59e0b'];
            return (
              <div key={i} style={{
                display: 'grid', gridTemplateColumns: '60px 1fr 70px 70px 50px', alignItems: 'center', gap: 8,
                padding: 10, background: 'rgba(255,255,255,0.03)', borderRadius: 8,
                borderLeft: `3px solid ${colors[i]}`,
              }}>
                <span style={{ fontSize: 12, fontWeight: 700, color: colors[i] }}>{s.street}</span>
                <div style={{ height: 8, background: 'rgba(255,255,255,0.06)', borderRadius: 4, overflow: 'hidden' }}>
                  <div style={{ height: '100%', width: `${Math.min(s.pctPot, 100)}%`, background: colors[i], borderRadius: 4 }} />
                </div>
                <span style={{ fontSize: 12, fontWeight: 600, color: '#fff', textAlign: 'right' }}>{s.bet.toFixed(1)} bb</span>
                <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.4)', textAlign: 'right' }}>Pot: {s.potAfter.toFixed(1)}</span>
                <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.4)', textAlign: 'right' }}>SPR {s.spr}</span>
              </div>
            );
          })}
        </div>

        {/* Summary */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
          <div style={{ padding: 8, background: 'rgba(255,255,255,0.03)', borderRadius: 8, textAlign: 'center' }}>
            <div style={{ fontSize: 16, fontWeight: 800, color: '#14b8a6' }}>{calc.totalBet.toFixed(1)} bb</div>
            <div style={{ fontSize: 9, color: 'rgba(255,255,255,0.4)' }}>Total Invested</div>
          </div>
          <div style={{ padding: 8, background: 'rgba(255,255,255,0.03)', borderRadius: 8, textAlign: 'center' }}>
            <div style={{ fontSize: 16, fontWeight: 800, color: calc.allIn ? '#10b981' : '#f59e0b' }}>{calc.allIn ? 'YES' : 'NO'}</div>
            <div style={{ fontSize: 9, color: 'rgba(255,255,255,0.4)' }}>All-in by River</div>
          </div>
          <div style={{ padding: 8, background: 'rgba(255,255,255,0.03)', borderRadius: 8, textAlign: 'center' }}>
            <div style={{ fontSize: 16, fontWeight: 800, color: '#fff' }}>{Math.round(calc.betFraction * 100)}%</div>
            <div style={{ fontSize: 9, color: 'rgba(255,255,255,0.4)' }}>Bet Fraction</div>
          </div>
        </div>
      </div>
    );
  } catch (err) {
    return <div style={{ padding: 20, color: '#ef4444' }}>Geometric Sizing Calculator failed to load: {err.message}</div>;
  }
}

export default GeometricSizingCalc;
