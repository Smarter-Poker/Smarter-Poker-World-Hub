/**
 * CheckRaiseStrategyGuide — When & How to Check-Raise
 * ●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●
 * Interactive guide for check-raise strategy across streets.
 * Covers value check-raises, bluff check-raises, and sizing.
 */
import React, { useState } from 'react';

const SCENARIOS = [
  {
    street: 'Flop', board: 'T♥ 7♣ 2♦', hero: '7♠ 7♦', position: 'BB vs BTN',
    type: 'Value', sizing: 'x/r to 3x c-bet',
    reasoning: 'Middle set on dry board. BTN c-bets wide here. Check-raise for value to build pot. Calling is also fine but check-raising maximizes value vs overpairs and top pairs that wont fold.',
    frequency: '85% x/r, 15% call',
    color: '#10b981',
    tips: ['Dry boards = can slow play more', 'Wet boards = must x/r to charge draws', 'Size 3x the c-bet for balanced sizing'],
  },
  {
    street: 'Flop', board: 'J♥ T♥ 6♣', hero: '9♥ 8♥', position: 'BB vs CO',
    type: 'Semi-Bluff', sizing: 'x/r to 3x c-bet',
    reasoning: 'Open-ended straight draw + flush draw = 15 outs. Massive semi-bluff. Check-raise puts pressure on villains marginal hands while you have huge equity if called. Best semi-bluff candidate possible.',
    frequency: '90% x/r, 10% call',
    color: '#f59e0b',
    tips: ['Best x/r bluffs have max equity when called', 'Combo draws (flush + straight) are ideal', 'If called, you still win ~50% of the time'],
  },
  {
    street: 'Turn', board: 'K♣ 8♦ 3♠ | Q♥', hero: 'Q♣ Q♦', position: 'BB vs BTN',
    type: 'Value', sizing: 'x/r to 2.5x turn bet',
    reasoning: 'You hit a set on the turn. Board got scarier (straight possible). Check-raise now to build pot and protect vs draws. If you just call, river could brick and villain checks back.',
    frequency: '70% x/r, 30% call',
    color: '#10b981',
    tips: ['Turn x/r is more credible than flop', 'Sets up river jam naturally', 'Villain has strong range if they double barrel'],
  },
  {
    street: 'Flop', board: 'A♠ K♦ 5♣', hero: '4♠ 3♠', position: 'BB vs BTN',
    type: 'Bluff', sizing: 'x/r to 3.5x c-bet',
    reasoning: 'Pure bluff on AK-high board. BB defends wide, so needs bluffs in x/r range. This hand has no showdown value and backdoor straight draw. Perfect bluff candidate — you never win by calling.',
    frequency: '40% x/r, 60% fold',
    color: '#ef4444',
    tips: ['Choose bluffs with no showdown value', 'Backdoor draws add some equity', 'AK-high boards are good for BB x/r'],
  },
  {
    street: 'River', board: 'T♣ 8♣ 3♦ K♠ | 2♣', hero: 'A♣ 5♣', position: 'BB vs BTN',
    type: 'Value', sizing: 'x/r all-in',
    reasoning: 'Nut flush on the river. Check-raise all-in for maximum value. BTN will bet for value/thin value, and you get to raise the biggest amount. Much better than leading which might get just a call.',
    frequency: '95% x/r, 5% lead',
    color: '#10b981',
    tips: ['River x/r with nuts = max value extraction', 'Let villain bet before raising', 'Sizing = all-in or close to it'],
  },
  {
    street: 'Turn', board: '9♥ 7♥ 4♣ | J♦', hero: '6♥ 5♥', position: 'BB vs CO',
    type: 'Semi-Bluff', sizing: 'x/r to 2.5x turn bet',
    reasoning: 'Open-ended straight draw + flush draw on the turn. 15 clean outs. Check-raise as a semi-bluff — massive fold equity + huge equity when called. If villain folds, great. If they call, you hit ~33% of rivers.',
    frequency: '75% x/r, 25% call',
    color: '#f59e0b',
    tips: ['Turn semi-bluffs are very powerful', 'You threaten an all-in river if called', 'Combo draws are the #1 turn x/r bluff'],
  },
];

function CheckRaiseStrategyGuide() {
  const [selected, setSelected] = useState(0);
  const [showAll, setShowAll] = useState(false);
  const spot = SCENARIOS[selected];

  const typeColors = { 'Value': '#10b981', 'Semi-Bluff': '#f59e0b', 'Bluff': '#ef4444' };

  try {
    return (
      <div style={{ padding: 20, background: 'rgba(0,0,0,0.3)', borderRadius: 12, border: '1px solid rgba(255,255,255,0.08)' }}>
        <h3 style={{ margin: '0 0 16px 0', fontSize: 18, color: '#06b6d4' }}>Check-Raise Strategy</h3>

        <div style={{ display: 'flex', gap: 4, marginBottom: 16, flexWrap: 'wrap' }}>
          {SCENARIOS.map((s, i) => (
            <button key={i} onClick={() => setSelected(i)} style={{
              padding: '6px 10px', borderRadius: 6, border: 'none', cursor: 'pointer', fontSize: 10, fontWeight: 600,
              background: selected === i ? typeColors[s.type] : 'rgba(255,255,255,0.06)',
              color: selected === i ? '#000' : 'rgba(255,255,255,0.5)',
            }}>
              {s.street} {s.type}
            </button>
          ))}
        </div>

        <div style={{ padding: 14, background: `${spot.color}11`, borderRadius: 10, border: `1px solid ${spot.color}33`, marginBottom: 16, textAlign: 'center' }}>
          <div style={{ fontSize: 22, fontWeight: 900, color: '#fff', letterSpacing: 3, marginBottom: 6 }}>{spot.board}</div>
          <div style={{ fontSize: 16, fontWeight: 700, color: spot.color, marginBottom: 4 }}>Hero: {spot.hero}</div>
          <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.5)', marginBottom: 4 }}>{spot.position} | {spot.street}</div>
          <div style={{ display: 'inline-block', padding: '3px 10px', borderRadius: 6, background: `${typeColors[spot.type]}33`, marginBottom: 4 }}>
            <span style={{ fontSize: 12, fontWeight: 700, color: typeColors[spot.type] }}>{spot.type} Check-Raise</span>
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 16 }}>
          <div style={{ padding: 10, background: 'rgba(255,255,255,0.03)', borderRadius: 8, textAlign: 'center' }}>
            <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.4)' }}>Sizing</div>
            <div style={{ fontSize: 14, fontWeight: 800, color: '#3b82f6' }}>{spot.sizing}</div>
          </div>
          <div style={{ padding: 10, background: 'rgba(255,255,255,0.03)', borderRadius: 8, textAlign: 'center' }}>
            <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.4)' }}>Frequency</div>
            <div style={{ fontSize: 14, fontWeight: 800, color: '#f59e0b' }}>{spot.frequency}</div>
          </div>
        </div>

        <div style={{ padding: 12, background: 'rgba(6,182,212,0.06)', borderRadius: 8, border: '1px solid rgba(6,182,212,0.12)', marginBottom: 12 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: '#06b6d4', marginBottom: 4 }}>GTO Reasoning</div>
          <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.8)', lineHeight: 1.6 }}>{spot.reasoning}</div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          {spot.tips.map((tip, i) => (
            <div key={i} style={{ padding: 8, background: 'rgba(255,255,255,0.03)', borderRadius: 6, fontSize: 11, color: 'rgba(255,255,255,0.6)', paddingLeft: 12, borderLeft: `2px solid ${spot.color}` }}>
              {tip}
            </div>
          ))}
        </div>
      </div>
    );
  } catch (err) {
    return <div style={{ padding: 20, color: '#ef4444' }}>Check-Raise Guide failed to load: {err.message}</div>;
  }
}

export default CheckRaiseStrategyGuide;
