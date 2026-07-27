/**
 * BubbleFactorCalc — ICM Bubble Factor Calculator
 * ●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●
 * Calculate bubble factors for tournament decisions. Shows how ICM
 * pressure affects calling ranges near the money bubble.
 */
import React, { useState, useMemo } from 'react';

const PAYOUT_STRUCTURES = [
  {
    name: 'STT (9-man)',
    payouts: [50, 30, 20],
    players: 9,
    bubbleAt: 4,
    description: 'Standard sit-n-go. Bubble at 4 players.',
  },
  {
    name: 'MTT Final Table',
    payouts: [30, 20, 14, 10, 8, 6.5, 5, 3.5, 3],
    players: 9,
    bubbleAt: 10,
    description: 'Final table with steep payout jumps.',
  },
  {
    name: 'Satellite',
    payouts: [100, 100, 100, 0, 0],
    players: 5,
    bubbleAt: 4,
    description: 'Winner-take-all seats. Bubble is extreme — survival = everything.',
  },
  {
    name: 'Heads-Up',
    payouts: [65, 35],
    players: 2,
    bubbleAt: 0,
    description: 'Heads-up. No ICM pressure — pure chip EV.',
  },
];

const STACK_SCENARIOS = [
  { name: 'Big Stack (40%)', stack: 40, bf: 1.0, note: 'Can pressure others. Bubble factor ~1.0 — play close to chip EV.' },
  { name: 'Medium Stack (25%)', stack: 25, bf: 1.3, note: 'Some ICM pressure. Tighten calling range by ~15-20%. Avoid marginal spots.' },
  { name: 'Short Stack (15%)', stack: 15, bf: 1.5, note: 'Significant ICM pressure. Only call shoves with premium hands. Every chip is precious.' },
  { name: 'Micro Stack (8%)', stack: 8, bf: 1.8, note: 'Desperate. But ICM says fold marginal — let others bust first if possible.' },
  { name: 'Chip Leader vs Short', stack: 50, bf: 0.8, note: 'You can afford to call wider. Busting a short stack gains ICM equity for everyone.' },
];

function BubbleFactorCalc() {
  const [selectedPayout, setSelectedPayout] = useState(0);
  const [playersLeft, setPlayersLeft] = useState(4);
  const [heroStack, setHeroStack] = useState(25);
  const [villainShove, setVillainShove] = useState(15);

  const calc = useMemo(() => {
    const structure = PAYOUT_STRUCTURES[selectedPayout];
    const isBubble = playersLeft === structure.bubbleAt || playersLeft === structure.payouts.length + 1;

    // Simplified bubble factor estimation
    const stackPct = heroStack;
    let bubbleFactor;
    if (structure.name === 'Heads-Up') {
      bubbleFactor = 1.0;
    } else if (structure.name === 'Satellite') {
      bubbleFactor = isBubble ? 3.0 : (stackPct > 30 ? 1.2 : 2.5);
    } else {
      if (stackPct > 35) bubbleFactor = isBubble ? 1.1 : 1.0;
      else if (stackPct > 20) bubbleFactor = isBubble ? 1.4 : 1.2;
      else if (stackPct > 10) bubbleFactor = isBubble ? 1.8 : 1.4;
      else bubbleFactor = isBubble ? 2.2 : 1.6;
    }

    // Required equity to call
    const potOdds = villainShove / (heroStack + villainShove);
    const adjustedEquity = potOdds * bubbleFactor;
    const requiredEquityPct = Math.min(Math.round(adjustedEquity * 100), 99);
    const chipEVEquity = Math.round(potOdds * 100);

    return { bubbleFactor: Math.round(bubbleFactor * 100) / 100, isBubble, requiredEquityPct, chipEVEquity, structure };
  }, [selectedPayout, playersLeft, heroStack, villainShove]);

  try {
    return (
      <div style={{ padding: 20, background: 'rgba(0,0,0,0.3)', borderRadius: 12, border: '1px solid rgba(255,255,255,0.08)' }}>
        <h3 style={{ margin: '0 0 16px 0', fontSize: 18, color: '#fbbf24' }}>Bubble Factor Calculator</h3>

        {/* Payout Structure */}
        <div style={{ display: 'flex', gap: 4, marginBottom: 16, flexWrap: 'wrap' }}>
          {PAYOUT_STRUCTURES.map((p, i) => (
            <button key={p.name} onClick={() => setSelectedPayout(i)} style={{
              padding: '5px 12px', borderRadius: 6, fontSize: 11, fontWeight: 600, cursor: 'pointer',
              background: selectedPayout === i ? '#fbbf24' : 'rgba(255,255,255,0.06)',
              color: selectedPayout === i ? '#000' : 'rgba(255,255,255,0.6)', border: 'none',
            }}>{p.name}</button>
          ))}
        </div>

        <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)', marginBottom: 12 }}>{calc.structure.description}</div>

        {/* Inputs */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8, marginBottom: 16 }}>
          <div style={{ padding: 8, background: 'rgba(255,255,255,0.03)', borderRadius: 8, textAlign: 'center' }}>
            <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.5)', marginBottom: 2 }}>Players Left</div>
            <input type="range" min={2} max={calc.structure.players} value={playersLeft} onChange={e => setPlayersLeft(parseInt(e.target.value))} style={{ width: '100%', accentColor: '#fbbf24' }} />
            <div style={{ fontSize: 14, fontWeight: 700, color: '#fff' }}>{playersLeft}</div>
          </div>
          <div style={{ padding: 8, background: 'rgba(255,255,255,0.03)', borderRadius: 8, textAlign: 'center' }}>
            <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.5)', marginBottom: 2 }}>Your Stack (%)</div>
            <input type="range" min={3} max={60} value={heroStack} onChange={e => setHeroStack(parseInt(e.target.value))} style={{ width: '100%', accentColor: '#fbbf24' }} />
            <div style={{ fontSize: 14, fontWeight: 700, color: '#fff' }}>{heroStack}%</div>
          </div>
          <div style={{ padding: 8, background: 'rgba(255,255,255,0.03)', borderRadius: 8, textAlign: 'center' }}>
            <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.5)', marginBottom: 2 }}>Villain Shove (%)</div>
            <input type="range" min={3} max={50} value={villainShove} onChange={e => setVillainShove(parseInt(e.target.value))} style={{ width: '100%', accentColor: '#fbbf24' }} />
            <div style={{ fontSize: 14, fontWeight: 700, color: '#fff' }}>{villainShove}%</div>
          </div>
        </div>

        {/* Bubble Factor Display */}
        <div style={{ textAlign: 'center', padding: 16, background: calc.isBubble ? 'rgba(239,68,68,0.08)' : 'rgba(251,191,36,0.08)', borderRadius: 10, border: `1px solid ${calc.isBubble ? 'rgba(239,68,68,0.25)' : 'rgba(251,191,36,0.25)'}`, marginBottom: 16 }}>
          <div style={{ fontSize: 36, fontWeight: 900, color: calc.isBubble ? '#ef4444' : '#fbbf24' }}>{calc.bubbleFactor}x</div>
          <div style={{ fontSize: 14, fontWeight: 600, color: calc.isBubble ? '#ef4444' : '#fbbf24' }}>Bubble Factor</div>
          {calc.isBubble && <div style={{ fontSize: 11, color: '#ef4444', marginTop: 4 }}>ON THE BUBBLE — Tighten up!</div>}
        </div>

        {/* Equity Comparison */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 16 }}>
          <div style={{ padding: 12, background: 'rgba(59,130,246,0.06)', borderRadius: 8, textAlign: 'center', border: '1px solid rgba(59,130,246,0.15)' }}>
            <div style={{ fontSize: 22, fontWeight: 800, color: '#3b82f6' }}>{calc.chipEVEquity}%</div>
            <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.4)' }}>Chip EV Equity Needed</div>
          </div>
          <div style={{ padding: 12, background: 'rgba(239,68,68,0.06)', borderRadius: 8, textAlign: 'center', border: '1px solid rgba(239,68,68,0.15)' }}>
            <div style={{ fontSize: 22, fontWeight: 800, color: '#ef4444' }}>{calc.requiredEquityPct}%</div>
            <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.4)' }}>ICM-Adjusted Equity Needed</div>
          </div>
        </div>

        {/* Stack Scenarios */}
        <div style={{ fontSize: 12, fontWeight: 600, color: '#fff', marginBottom: 6 }}>Stack Size Reference</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          {STACK_SCENARIOS.map((s, i) => (
            <div key={s.name} style={{ padding: 8, background: 'rgba(255,255,255,0.03)', borderRadius: 6, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <span style={{ fontSize: 11, fontWeight: 600, color: '#fff' }}>{s.name}</span>
                <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.4)', marginLeft: 8 }}>{s.note}</span>
              </div>
              <span style={{ fontSize: 12, fontWeight: 700, color: '#fbbf24' }}>{s.bf}x</span>
            </div>
          ))}
        </div>
      </div>
    );
  } catch (err) {
    return <div style={{ padding: 20, color: '#ef4444' }}>Bubble Factor Calculator failed to load: {err.message}</div>;
  }
}

export default BubbleFactorCalc;
