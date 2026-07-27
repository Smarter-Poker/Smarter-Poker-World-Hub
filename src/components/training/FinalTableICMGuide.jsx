/**
 * FinalTableICMGuide — Final Table ICM Strategy
 * ●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●
 * Deep guide on ICM strategy at final tables. Covers pay jumps,
 * stack sizes, bubble factor, and optimal play adjustments.
 */
import React, { useState, useMemo } from 'react';

const STACKS = [
  { seat: 1, name: 'Hero', chips: 50, position: 'CO' },
  { seat: 2, name: 'Villain 1', chips: 80, position: 'BTN' },
  { seat: 3, name: 'Villain 2', chips: 30, position: 'SB' },
  { seat: 4, name: 'Villain 3', chips: 25, position: 'BB' },
  { seat: 5, name: 'Villain 4', chips: 15, position: 'UTG' },
];

const PAYOUTS = [
  { place: '1st', pct: 35, amount: 3500 },
  { place: '2nd', pct: 22, amount: 2200 },
  { place: '3rd', pct: 15, amount: 1500 },
  { place: '4th', pct: 11, amount: 1100 },
  { place: '5th', pct: 8, amount: 800 },
];

const SCENARIOS = [
  {
    title: 'Short Stack Shoves',
    situation: 'UTG (15bb) shoves all-in. Action to Hero in CO.',
    hero: 'A♠ T♦',
    chipEV: 'Call — AT has 60% equity vs shove range',
    icmPlay: 'FOLD — ICM says fold. Two shorter stacks behind. Let them bust first. The $300 pay jump from 5th→4th is worth more than the chips.',
    adjustment: 'Tighten calling range by 30%. Only call with TT+, AQs+.',
    impact: 'High',
  },
  {
    title: 'Bubble Factor Effect',
    situation: 'BB (25bb) 3-bets you. You have 50bb in CO.',
    hero: 'J♣ J♠',
    chipEV: '4-bet jam — JJ is strong enough vs 3-bet range',
    icmPlay: 'CALL and play postflop — Jamming 50bb risks your tournament life. JJ plays well postflop. If you bust, you lose $700+ in equity. If BB busts, you gain only $200.',
    adjustment: 'Avoid massive pots with medium hands. JJ is a call, not a jam at 50bb effective.',
    impact: 'Very High',
  },
  {
    title: 'Chip Leader Aggression',
    situation: 'You have 80bb as chip leader. Short stacks have 15-25bb.',
    hero: 'K♥ 8♥',
    chipEV: 'Open and c-bet — standard play',
    icmPlay: 'OPEN WIDE and apply pressure — As chip leader, you can bully medium stacks who cant call without risking elimination. Short stacks fear busting. Abuse this by opening 40%+ from LP.',
    adjustment: 'Increase opening range 20-30%. Target medium stacks, avoid short stacks who might shove.',
    impact: 'Medium',
  },
  {
    title: 'Pay Jump Awareness',
    situation: '3 players left. Hero has 50bb, Villain 1 has 100bb, Villain 2 has 50bb.',
    hero: 'A♣ K♣',
    chipEV: 'Get it in vs Villain 2 — AK is a premium',
    icmPlay: 'Still get it in — AK is strong enough even with ICM. The difference here is you should avoid coin flips with the chip leader. But vs the equal stack, AK is too strong to fold.',
    adjustment: 'Play normally vs equal stacks. Tighten significantly vs chip leader.',
    impact: 'Low',
  },
];

function FinalTableICMGuide() {
  const [activeScenario, setActiveScenario] = useState(0);
  const [showPayouts, setShowPayouts] = useState(false);
  const totalChips = STACKS.reduce((s, p) => s + p.chips, 0);
  const scenario = SCENARIOS[activeScenario];

  try {
    return (
      <div style={{ padding: 20, background: 'rgba(0,0,0,0.3)', borderRadius: 12, border: '1px solid rgba(255,255,255,0.08)' }}>
        <h3 style={{ margin: '0 0 16px 0', fontSize: 18, color: '#fbbf24' }}>Final Table ICM</h3>

        {/* Stack display */}
        <div style={{ display: 'flex', gap: 6, marginBottom: 16 }}>
          {STACKS.map(s => {
            const pct = Math.round((s.chips / totalChips) * 100);
            return (
              <div key={s.seat} style={{ flex: 1, padding: 8, background: 'rgba(255,255,255,0.03)', borderRadius: 8, textAlign: 'center' }}>
                <div style={{ fontSize: 9, color: 'rgba(255,255,255,0.4)' }}>{s.position}</div>
                <div style={{ fontSize: 14, fontWeight: 800, color: pct > 30 ? '#10b981' : pct > 15 ? '#f59e0b' : '#ef4444' }}>{s.chips}bb</div>
                <div style={{ fontSize: 9, color: 'rgba(255,255,255,0.3)' }}>{pct}%</div>
                <div style={{ height: 4, background: 'rgba(255,255,255,0.06)', borderRadius: 2, marginTop: 4 }}>
                  <div style={{ height: '100%', width: `${pct}%`, borderRadius: 2, background: pct > 30 ? '#10b981' : pct > 15 ? '#f59e0b' : '#ef4444' }} />
                </div>
              </div>
            );
          })}
        </div>

        {/* Payout toggle */}
        <button onClick={() => setShowPayouts(!showPayouts)} style={{
          width: '100%', padding: 6, borderRadius: 6, border: '1px solid rgba(251,191,36,0.2)',
          background: 'rgba(251,191,36,0.06)', color: '#fbbf24', fontSize: 11, fontWeight: 600, cursor: 'pointer', marginBottom: 12,
        }}>{showPayouts ? 'Hide' : 'Show'} Payout Structure</button>

        {showPayouts && (
          <div style={{ display: 'flex', gap: 6, marginBottom: 12 }}>
            {PAYOUTS.map(p => (
              <div key={p.place} style={{ flex: 1, padding: 8, background: 'rgba(255,255,255,0.03)', borderRadius: 6, textAlign: 'center' }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: '#fbbf24' }}>{p.place}</div>
                <div style={{ fontSize: 14, fontWeight: 800, color: '#fff' }}>${p.amount}</div>
                <div style={{ fontSize: 9, color: 'rgba(255,255,255,0.3)' }}>{p.pct}%</div>
              </div>
            ))}
          </div>
        )}

        {/* Scenario tabs */}
        <div style={{ display: 'flex', gap: 4, marginBottom: 12, flexWrap: 'wrap' }}>
          {SCENARIOS.map((s, i) => (
            <button key={i} onClick={() => setActiveScenario(i)} style={{
              padding: '5px 10px', borderRadius: 6, border: 'none', cursor: 'pointer', fontSize: 10, fontWeight: 600,
              background: activeScenario === i ? '#fbbf24' : 'rgba(255,255,255,0.06)',
              color: activeScenario === i ? '#000' : 'rgba(255,255,255,0.5)',
            }}>{s.title}</button>
          ))}
        </div>

        {/* Active scenario */}
        <div style={{ padding: 12, background: 'rgba(251,191,36,0.06)', borderRadius: 10, border: '1px solid rgba(251,191,36,0.15)', marginBottom: 12 }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: '#fbbf24', marginBottom: 6 }}>{scenario.title}</div>
          <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.6)', marginBottom: 4 }}>{scenario.situation}</div>
          <div style={{ fontSize: 14, fontWeight: 700, color: '#fff', marginBottom: 8 }}>Hero: {scenario.hero}</div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 8 }}>
            <div style={{ padding: 8, background: 'rgba(59,130,246,0.08)', borderRadius: 6 }}>
              <div style={{ fontSize: 10, fontWeight: 600, color: '#3b82f6', marginBottom: 2 }}>Chip EV Play</div>
              <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.7)' }}>{scenario.chipEV}</div>
            </div>
            <div style={{ padding: 8, background: 'rgba(251,191,36,0.08)', borderRadius: 6 }}>
              <div style={{ fontSize: 10, fontWeight: 600, color: '#fbbf24', marginBottom: 2 }}>ICM Play</div>
              <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.7)' }}>{scenario.icmPlay}</div>
            </div>
          </div>

          <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.6)', lineHeight: 1.5, padding: 8, background: 'rgba(255,255,255,0.03)', borderRadius: 6 }}>
            <span style={{ fontWeight: 700, color: '#f59e0b' }}>Adjustment: </span>{scenario.adjustment}
          </div>
          <div style={{ textAlign: 'right', marginTop: 6 }}>
            <span style={{ fontSize: 10, padding: '2px 8px', borderRadius: 4, background: scenario.impact === 'Very High' ? 'rgba(239,68,68,0.15)' : scenario.impact === 'High' ? 'rgba(249,115,22,0.15)' : scenario.impact === 'Medium' ? 'rgba(245,158,11,0.15)' : 'rgba(16,185,129,0.15)', color: scenario.impact === 'Very High' ? '#ef4444' : scenario.impact === 'High' ? '#f97316' : scenario.impact === 'Medium' ? '#f59e0b' : '#10b981' }}>
              ICM Impact: {scenario.impact}
            </span>
          </div>
        </div>
      </div>
    );
  } catch (err) {
    return <div style={{ padding: 20, color: '#ef4444' }}>Final Table ICM Guide failed to load: {err.message}</div>;
  }
}

export default FinalTableICMGuide;
