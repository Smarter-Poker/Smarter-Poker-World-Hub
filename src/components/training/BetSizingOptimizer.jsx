/**
 * BetSizingOptimizer — Optimal Bet Sizing Tool
 * ●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●
 * Interactive tool for finding optimal bet sizes based on hand strength,
 * board texture, and opponent tendencies.
 */
import React, { useState, useMemo } from 'react';

const SITUATIONS = [
  {
    name: 'Value Bet - Thin', hand: 'Top Pair Good Kicker', color: '#10b981',
    sizes: [
      { pct: '25%', verdict: 'Best', reason: 'Small bet gets called by most worse hands. Maximizes call frequency.' },
      { pct: '50%', verdict: 'OK', reason: 'Reasonable but loses some calls from marginal hands.' },
      { pct: '75%', verdict: 'Bad', reason: 'Too large — only better hands call. Turns value into a bluff.' },
      { pct: '100%+', verdict: 'Terrible', reason: 'Only sets and better call. You lose max when behind.' },
    ],
    optimal: '25-33% pot',
    tip: 'With thin value hands, bet smaller to keep opponent calling range wide.',
  },
  {
    name: 'Value Bet - Thick', hand: 'Set/Two Pair/Nut Flush', color: '#3b82f6',
    sizes: [
      { pct: '25%', verdict: 'Weak', reason: 'Leaves money on the table. Strong hands want bigger pots.' },
      { pct: '50%', verdict: 'OK', reason: 'Decent but could go bigger, especially on wet boards.' },
      { pct: '75%', verdict: 'Best', reason: 'Optimal — gets called by top pair, overpairs, draws.' },
      { pct: '100%+', verdict: 'Good', reason: 'Overbet is fine when you have the nuts. Polarized strategy.' },
    ],
    optimal: '66-100% pot',
    tip: 'With strong value, bet bigger. Opponents have strong enough hands to call.',
  },
  {
    name: 'Bluff - Semi', hand: 'Flush/Straight Draw', color: '#f59e0b',
    sizes: [
      { pct: '25%', verdict: 'Weak', reason: 'Not enough fold equity. Opponent calls too wide.' },
      { pct: '50%', verdict: 'Good', reason: 'Balance of fold equity and price. Risk little with live draw.' },
      { pct: '75%', verdict: 'Best', reason: 'Maximum fold equity while having equity if called.' },
      { pct: '100%+', verdict: 'Risky', reason: 'High fold equity but costly when called. Use selectively.' },
    ],
    optimal: '50-75% pot',
    tip: 'Semi-bluffs want fold equity. Medium-large sizes maximize it while you have backup equity.',
  },
  {
    name: 'Bluff - Pure', hand: 'Complete Air', color: '#ef4444',
    sizes: [
      { pct: '25%', verdict: 'Terrible', reason: 'Opponent calls everything. You need folds to profit.' },
      { pct: '50%', verdict: 'OK', reason: 'Gets some folds but risk/reward is marginal.' },
      { pct: '75%', verdict: 'Good', reason: 'Good fold equity. Standard bluffing size.' },
      { pct: '100%+', verdict: 'Situational', reason: 'Overbet bluffs work when villain is capped. High risk, high reward.' },
    ],
    optimal: '66-100% pot',
    tip: 'Pure bluffs need maximum fold equity. Bet big or dont bluff at all.',
  },
  {
    name: 'Protection Bet', hand: 'Overpair on Wet Board', color: '#e879f9',
    sizes: [
      { pct: '25%', verdict: 'Bad', reason: 'Gives draws correct odds. They profit from calling.' },
      { pct: '50%', verdict: 'OK', reason: 'Borderline. Some draws still have odds.' },
      { pct: '75%', verdict: 'Best', reason: 'Denies correct odds to all draws. Charges max for seeing next card.' },
      { pct: '100%+', verdict: 'Good', reason: 'Maximum denial. Use on very wet boards (flush + straight draws).' },
    ],
    optimal: '66-80% pot',
    tip: 'Protection bets need to deny equity. Bet large enough that draws pay too much.',
  },
];

function BetSizingOptimizer() {
  const [selected, setSelected] = useState(1);
  const sit = SITUATIONS[selected];
  const verdictColors = { 'Best': '#10b981', 'Good': '#3b82f6', 'OK': '#f59e0b', 'Weak': '#f97316', 'Bad': '#ef4444', 'Terrible': '#dc2626', 'Situational': '#8b5cf6', 'Risky': '#f97316' };

  try {
    return (
      <div style={{ padding: 20, background: 'rgba(0,0,0,0.3)', borderRadius: 12, border: '1px solid rgba(255,255,255,0.08)' }}>
        <h3 style={{ margin: '0 0 16px 0', fontSize: 18, color: '#14b8a6' }}>Bet Sizing Optimizer</h3>

        <div style={{ display: 'flex', gap: 4, marginBottom: 16, flexWrap: 'wrap' }}>
          {SITUATIONS.map((s, i) => (
            <button key={i} onClick={() => setSelected(i)} style={{
              padding: '6px 8px', borderRadius: 6, border: 'none', cursor: 'pointer', fontSize: 10, fontWeight: 600,
              background: selected === i ? s.color : 'rgba(255,255,255,0.06)',
              color: selected === i ? '#fff' : 'rgba(255,255,255,0.5)',
            }}>{s.name}</button>
          ))}
        </div>

        <div style={{ padding: 12, background: `${sit.color}11`, borderRadius: 10, border: `1px solid ${sit.color}33`, marginBottom: 16, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <div style={{ fontSize: 15, fontWeight: 800, color: sit.color }}>{sit.name}</div>
            <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.5)' }}>{sit.hand}</div>
          </div>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: 9, color: 'rgba(255,255,255,0.3)' }}>Optimal</div>
            <div style={{ fontSize: 16, fontWeight: 900, color: '#fff' }}>{sit.optimal}</div>
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 12 }}>
          {sit.sizes.map((s, i) => (
            <div key={i} style={{ padding: 10, background: 'rgba(255,255,255,0.03)', borderRadius: 8, display: 'flex', alignItems: 'center', gap: 10 }}>
              <div style={{ minWidth: 45, fontSize: 14, fontWeight: 800, color: '#fff', textAlign: 'center' }}>{s.pct}</div>
              <div style={{ minWidth: 50 }}>
                <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 6px', borderRadius: 4, background: `${verdictColors[s.verdict]}22`, color: verdictColors[s.verdict] }}>{s.verdict}</span>
              </div>
              <div style={{ flex: 1, fontSize: 11, color: 'rgba(255,255,255,0.6)', lineHeight: 1.4 }}>{s.reason}</div>
            </div>
          ))}
        </div>

        <div style={{ padding: 10, background: 'rgba(20,184,166,0.06)', borderRadius: 8, border: '1px solid rgba(20,184,166,0.12)' }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: '#14b8a6', marginBottom: 2 }}>Key Principle</div>
          <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.7)', lineHeight: 1.6 }}>{sit.tip}</div>
        </div>
      </div>
    );
  } catch (err) {
    return <div style={{ padding: 20, color: '#ef4444' }}>Bet Sizing Optimizer failed to load: {err.message}</div>;
  }
}

export default BetSizingOptimizer;
