/**
 * KellyBetCalculator — Kelly Criterion Bankroll Management
 * ●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●
 * Calculate optimal buy-in as a fraction of bankroll using Kelly criterion.
 * Shows full Kelly, half Kelly, and conservative recommendations.
 */
import React, { useState, useMemo } from 'react';

function KellyBetCalculator() {
  const [bankroll, setBankroll] = useState(10000);
  const [winRate, setWinRate] = useState(55);
  const [avgWin, setAvgWin] = useState(2);
  const [avgLoss, setAvgLoss] = useState(1);

  const calc = useMemo(() => {
    const p = winRate / 100;
    const q = 1 - p;
    const b = avgWin / avgLoss;

    // Kelly fraction: f* = (bp - q) / b
    const kellyFraction = (b * p - q) / b;
    const kellyPct = Math.max(0, Math.round(kellyFraction * 1000) / 10);
    const halfKellyPct = Math.round(kellyPct * 50) / 100;
    const quarterKellyPct = Math.round(kellyPct * 25) / 100;

    const kellyBet = Math.round(bankroll * kellyFraction);
    const halfKellyBet = Math.round(bankroll * kellyFraction * 0.5);
    const quarterKellyBet = Math.round(bankroll * kellyFraction * 0.25);

    // Ruin probability estimates
    const ruinFull = kellyFraction > 0 ? Math.max(0, Math.round(Math.pow(q / p, 5) * 100)) : 100;
    const ruinHalf = Math.max(0, Math.round(ruinFull * 0.3));
    const ruinQuarter = Math.max(0, Math.round(ruinFull * 0.1));

    const edge = Math.round((p * b - q) * 100) / 100;
    const hasEdge = kellyFraction > 0;

    return { kellyPct, halfKellyPct, quarterKellyPct, kellyBet, halfKellyBet, quarterKellyBet, ruinFull, ruinHalf, ruinQuarter, edge, hasEdge, kellyFraction };
  }, [bankroll, winRate, avgWin, avgLoss]);

  try {
    return (
      <div style={{ padding: 20, background: 'rgba(0,0,0,0.3)', borderRadius: 12, border: '1px solid rgba(255,255,255,0.08)' }}>
        <h3 style={{ margin: '0 0 16px 0', fontSize: 18, color: '#10b981' }}>Kelly Criterion Calculator</h3>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 10, marginBottom: 16 }}>
          {[
            { label: 'Bankroll ($)', value: bankroll, set: setBankroll, min: 100, max: 100000, step: 100, color: '#10b981', display: `$${bankroll.toLocaleString()}` },
            { label: 'Win Rate (%)', value: winRate, set: setWinRate, min: 40, max: 80, step: 1, color: '#3b82f6', display: `${winRate}%` },
            { label: 'Avg Win (units)', value: avgWin, set: setAvgWin, min: 0.5, max: 10, step: 0.5, color: '#10b981', display: `${avgWin}x` },
            { label: 'Avg Loss (units)', value: avgLoss, set: setAvgLoss, min: 0.5, max: 10, step: 0.5, color: '#ef4444', display: `${avgLoss}x` },
          ].map(s => (
            <div key={s.label} style={{ padding: 8, background: 'rgba(255,255,255,0.03)', borderRadius: 8, textAlign: 'center' }}>
              <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.5)', marginBottom: 2 }}>{s.label}</div>
              <input type="range" min={s.min} max={s.max} step={s.step} value={s.value} onChange={e => s.set(parseFloat(e.target.value))} style={{ width: '100%', accentColor: s.color }} />
              <div style={{ fontSize: 14, fontWeight: 800, color: s.color }}>{s.display}</div>
            </div>
          ))}
        </div>

        {/* Edge Display */}
        <div style={{ textAlign: 'center', padding: 14, borderRadius: 10, marginBottom: 16, background: calc.hasEdge ? 'rgba(16,185,129,0.08)' : 'rgba(239,68,68,0.08)', border: `1px solid ${calc.hasEdge ? 'rgba(16,185,129,0.25)' : 'rgba(239,68,68,0.25)'}` }}>
          <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.5)', marginBottom: 4 }}>Your Edge</div>
          <div style={{ fontSize: 28, fontWeight: 900, color: calc.hasEdge ? '#10b981' : '#ef4444' }}>
            {calc.hasEdge ? `+${calc.edge}` : calc.edge}
          </div>
          {!calc.hasEdge && <div style={{ fontSize: 11, color: '#ef4444', marginTop: 4 }}>No edge — do not play! Kelly says bet $0.</div>}
        </div>

        {calc.hasEdge && (
          <>
            {/* Kelly Recommendations */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8, marginBottom: 16 }}>
              {[
                { label: 'Full Kelly', pct: calc.kellyPct, bet: calc.kellyBet, ruin: calc.ruinFull, color: '#ef4444', rec: 'Aggressive' },
                { label: 'Half Kelly', pct: calc.halfKellyPct, bet: calc.halfKellyBet, ruin: calc.ruinHalf, color: '#f59e0b', rec: 'Recommended' },
                { label: 'Quarter Kelly', pct: calc.quarterKellyPct, bet: calc.quarterKellyBet, ruin: calc.ruinQuarter, color: '#10b981', rec: 'Conservative' },
              ].map(k => (
                <div key={k.label} style={{ padding: 12, background: 'rgba(255,255,255,0.03)', borderRadius: 8, textAlign: 'center', borderTop: `3px solid ${k.color}` }}>
                  <div style={{ fontSize: 10, fontWeight: 600, color: k.color, marginBottom: 4 }}>{k.label}</div>
                  <div style={{ fontSize: 20, fontWeight: 900, color: '#fff' }}>${k.bet.toLocaleString()}</div>
                  <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.4)' }}>{k.pct}% of bankroll</div>
                  <div style={{ fontSize: 9, color: k.ruin > 10 ? '#ef4444' : '#10b981', marginTop: 4 }}>Ruin risk: ~{k.ruin}%</div>
                  <div style={{ fontSize: 9, fontWeight: 700, color: k.color, marginTop: 2 }}>{k.rec}</div>
                </div>
              ))}
            </div>

            <div style={{ padding: 10, background: 'rgba(16,185,129,0.06)', borderRadius: 8, border: '1px solid rgba(16,185,129,0.12)' }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: '#10b981', marginBottom: 4 }}>Best Practice</div>
              <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.7)', lineHeight: 1.6 }}>
                Use Half Kelly for the best risk/reward balance. Full Kelly maximizes long-term growth but has high variance.
                Quarter Kelly is ultra-safe but slower growth. Never bet more than Full Kelly — it actually reduces expected growth.
              </div>
            </div>
          </>
        )}
      </div>
    );
  } catch (err) {
    return <div style={{ padding: 20, color: '#ef4444' }}>Kelly Calculator failed to load: {err.message}</div>;
  }
}

export default KellyBetCalculator;
