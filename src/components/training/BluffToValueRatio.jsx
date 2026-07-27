/**
 * BluffToValueRatio — Optimal Bluff-to-Value Ratio Calculator
 * ●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●
 * Calculate and visualize the GTO optimal ratio of bluffs to value bets
 * based on bet sizing. Interactive tool with visual breakdowns.
 */
import React, { useState, useMemo } from 'react';

const COMMON_SIZINGS = [
  { pct: 25, label: '25% pot' },
  { pct: 33, label: '33% pot' },
  { pct: 50, label: '50% pot' },
  { pct: 67, label: '67% pot' },
  { pct: 75, label: '75% pot' },
  { pct: 100, label: '100% pot' },
  { pct: 150, label: '150% pot' },
  { pct: 200, label: '200% pot' },
];

function BluffToValueRatio() {
  const [betPct, setBetPct] = useState(67);
  const [valueCombos, setValueCombos] = useState(20);

  const calc = useMemo(() => {
    // Alpha = Bet / (Bet + Pot) = how often villain needs to call
    // Bluff ratio = 1 - alpha = bet / (2*bet + pot) simplified
    // For bet = B, pot = P: villain gets B/(P+2B) odds
    // Optimal bluff % of betting range = B / (P + 2B) where P=100 (standardized)
    const B = betPct;
    const P = 100;
    const potOdds = B / (P + 2 * B);
    const bluffPct = Math.round(potOdds * 100);
    const valuePct = 100 - bluffPct;

    // Bluffs needed per value combo
    const bluffRatio = potOdds / (1 - potOdds);
    const bluffCombos = Math.round(valueCombos * bluffRatio);
    const totalBets = valueCombos + bluffCombos;

    // Villain's MDF (minimum defense frequency)
    const mdf = 1 - (B / (P + B));
    const mdfPct = Math.round(mdf * 100);

    return { bluffPct, valuePct, bluffCombos, totalBets, bluffRatio: Math.round(bluffRatio * 100) / 100, mdfPct, potOdds: Math.round(potOdds * 1000) / 10 };
  }, [betPct, valueCombos]);

  try {
    return (
      <div style={{ padding: 20, background: 'rgba(0,0,0,0.3)', borderRadius: 12, border: '1px solid rgba(255,255,255,0.08)' }}>
        <h3 style={{ margin: '0 0 16px 0', fontSize: 18, color: '#f43f5e' }}>Bluff-to-Value Ratio</h3>

        {/* Quick Sizing Buttons */}
        <div style={{ display: 'flex', gap: 4, marginBottom: 12, flexWrap: 'wrap' }}>
          {COMMON_SIZINGS.map(s => (
            <button key={s.pct} onClick={() => setBetPct(s.pct)} style={{
              padding: '4px 10px', borderRadius: 6, fontSize: 10, fontWeight: 600, cursor: 'pointer',
              background: betPct === s.pct ? '#f43f5e' : 'rgba(255,255,255,0.06)',
              color: betPct === s.pct ? '#fff' : 'rgba(255,255,255,0.6)', border: 'none',
            }}>{s.label}</button>
          ))}
        </div>

        {/* Sliders */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 16 }}>
          <div style={{ padding: 8, background: 'rgba(255,255,255,0.03)', borderRadius: 8, textAlign: 'center' }}>
            <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.5)', marginBottom: 2 }}>Bet Size (% pot)</div>
            <input type="range" min={10} max={300} step={5} value={betPct} onChange={e => setBetPct(parseInt(e.target.value))} style={{ width: '100%', accentColor: '#f43f5e' }} />
            <div style={{ fontSize: 16, fontWeight: 800, color: '#f43f5e' }}>{betPct}%</div>
          </div>
          <div style={{ padding: 8, background: 'rgba(255,255,255,0.03)', borderRadius: 8, textAlign: 'center' }}>
            <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.5)', marginBottom: 2 }}>Value Combos</div>
            <input type="range" min={5} max={50} value={valueCombos} onChange={e => setValueCombos(parseInt(e.target.value))} style={{ width: '100%', accentColor: '#10b981' }} />
            <div style={{ fontSize: 16, fontWeight: 800, color: '#10b981' }}>{valueCombos}</div>
          </div>
        </div>

        {/* Visual Ratio */}
        <div style={{ textAlign: 'center', padding: 16, background: 'rgba(244,63,94,0.06)', borderRadius: 10, border: '1px solid rgba(244,63,94,0.15)', marginBottom: 16 }}>
          <div style={{ display: 'flex', height: 40, borderRadius: 8, overflow: 'hidden', marginBottom: 12 }}>
            <div style={{ width: `${calc.valuePct}%`, background: '#10b981', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 700, color: '#fff' }}>
              Value {calc.valuePct}%
            </div>
            <div style={{ width: `${calc.bluffPct}%`, background: '#ef4444', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 700, color: '#fff' }}>
              Bluff {calc.bluffPct}%
            </div>
          </div>
          <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.6)' }}>
            For every <span style={{ fontWeight: 800, color: '#10b981' }}>1</span> value bet, include{' '}
            <span style={{ fontWeight: 800, color: '#ef4444' }}>{calc.bluffRatio}</span> bluffs
          </div>
        </div>

        {/* Stats Grid */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(100px, 1fr))', gap: 8, marginBottom: 16 }}>
          {[
            { label: 'Value Combos', value: valueCombos, color: '#10b981' },
            { label: 'Bluff Combos', value: calc.bluffCombos, color: '#ef4444' },
            { label: 'Total Bets', value: calc.totalBets, color: '#f43f5e' },
            { label: 'Bluff Ratio', value: `${calc.bluffRatio}:1`, color: '#f59e0b' },
            { label: 'Villain MDF', value: `${calc.mdfPct}%`, color: '#3b82f6' },
            { label: 'Pot Odds', value: `${calc.potOdds}%`, color: '#8b5cf6' },
          ].map(s => (
            <div key={s.label} style={{ padding: 8, background: 'rgba(255,255,255,0.03)', borderRadius: 8, textAlign: 'center' }}>
              <div style={{ fontSize: 16, fontWeight: 800, color: s.color }}>{s.value}</div>
              <div style={{ fontSize: 9, color: 'rgba(255,255,255,0.4)', marginTop: 2 }}>{s.label}</div>
            </div>
          ))}
        </div>

        {/* Explanation */}
        <div style={{ padding: 10, background: 'rgba(244,63,94,0.06)', borderRadius: 8, border: '1px solid rgba(244,63,94,0.12)' }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: '#f43f5e', marginBottom: 4 }}>How It Works</div>
          <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.7)', lineHeight: 1.6 }}>
            At {betPct}% pot, villain gets {calc.potOdds}% pot odds and must call {calc.mdfPct}% to stay unexploitable.
            Your betting range should be {calc.valuePct}% value and {calc.bluffPct}% bluffs.
            With {valueCombos} value combos, include {calc.bluffCombos} bluff combos ({calc.totalBets} total bets).
          </div>
        </div>
      </div>
    );
  } catch (err) {
    return <div style={{ padding: 20, color: '#ef4444' }}>Bluff-to-Value Ratio failed to load: {err.message}</div>;
  }
}

export default BluffToValueRatio;
