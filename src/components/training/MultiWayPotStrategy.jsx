/**
 * MultiWayPotStrategy — GTO Wizard-Style Multiway Pot Strategy Guide
 * ●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●
 * Understand how strategy changes in multiway pots vs heads-up.
 * Interactive guide with adjustments for c-betting, ranges, and sizing.
 */
import React, { useState } from 'react';

const CONCEPTS = [
  {
    title: 'C-Bet Frequency Drops',
    icon: '▼',
    headsUp: { value: '65-75%', desc: 'Can c-bet wide with range advantage and position.' },
    multiway: { value: '25-40%', desc: 'More players = someone likely connected. Only bet strong hands and best draws.' },
    adjustment: 'Cut c-bet frequency by 40-50%. Only bet with top pair+, strong draws, or nut advantage. Check-fold more air.',
    color: '#ef4444',
  },
  {
    title: 'Bluffing Frequency Drops',
    icon: '◇',
    headsUp: { value: '30-40%', desc: 'Balanced bluff frequency to remain unexploitable.' },
    multiway: { value: '10-15%', desc: 'Too many opponents to bluff through. Each player can wake up with a hand.' },
    adjustment: 'Reduce bluffs dramatically. Focus on semi-bluffs with strong draws. Pure bluffs are rarely profitable multiway.',
    color: '#f59e0b',
  },
  {
    title: 'Hand Strength Requirements Rise',
    icon: '▲',
    headsUp: { value: 'Top pair good', desc: 'Top pair with good kicker is often the best hand HU.' },
    multiway: { value: 'Two pair+', desc: 'Top pair is often just a bluff-catcher. Need stronger hands to value bet.' },
    adjustment: 'Raise your value betting threshold. Top pair is a check in many multiway spots. Two pair and sets become your main value hands.',
    color: '#3b82f6',
  },
  {
    title: 'Implied Odds Improve',
    icon: '●',
    headsUp: { value: 'Moderate', desc: 'One opponent to pay off your draws.' },
    multiway: { value: 'Excellent', desc: 'Multiple opponents = higher chance someone pays off your made hand.' },
    adjustment: 'Speculative hands (suited connectors, small pairs) gain value. Set mining and suited connector calling become more profitable.',
    color: '#10b981',
  },
  {
    title: 'Position Value Increases',
    icon: '◆',
    headsUp: { value: 'Important', desc: 'Position matters but edge is manageable.' },
    multiway: { value: 'Critical', desc: 'Acting last after 3+ players gives massive information advantage.' },
    adjustment: 'Tighten up in early position even more. The BTN becomes incredibly powerful in multiway pots — you see everyone act first.',
    color: '#8b5cf6',
  },
  {
    title: 'Pot Odds Change',
    icon: '■',
    headsUp: { value: '1 caller', desc: 'Standard pot odds calculation.' },
    multiway: { value: '2+ callers', desc: 'More money in pot = better odds for draws. But more opponents = less fold equity.' },
    adjustment: 'You get better direct odds but worse fold equity. Call more draws for direct odds. Bluff less because you cant fold everyone out.',
    color: '#06b6d4',
  },
];

function MultiWayPotStrategy() {
  const [selected, setSelected] = useState(0);

  const concept = CONCEPTS[selected];

  try {
    return (
      <div style={{ padding: 20, background: 'rgba(0,0,0,0.3)', borderRadius: 12, border: '1px solid rgba(255,255,255,0.08)' }}>
        <h3 style={{ margin: '0 0 16px 0', fontSize: 18, color: '#22d3ee' }}>Multiway Pot Strategy</h3>

        {/* Concept Selector */}
        <div style={{ display: 'flex', gap: 4, marginBottom: 16, flexWrap: 'wrap' }}>
          {CONCEPTS.map((c, i) => (
            <button key={c.title} onClick={() => setSelected(i)} style={{
              padding: '5px 10px', borderRadius: 6, fontSize: 10, fontWeight: 600, cursor: 'pointer',
              background: selected === i ? c.color : 'rgba(255,255,255,0.06)',
              color: selected === i ? '#fff' : 'rgba(255,255,255,0.6)', border: 'none',
            }}>{c.icon} {c.title}</button>
          ))}
        </div>

        {/* HU vs Multiway Comparison */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 16 }}>
          <div style={{ padding: 12, background: 'rgba(59,130,246,0.06)', borderRadius: 8, border: '1px solid rgba(59,130,246,0.15)' }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: '#3b82f6', marginBottom: 6 }}>Heads-Up</div>
            <div style={{ fontSize: 22, fontWeight: 900, color: '#3b82f6', marginBottom: 4 }}>{concept.headsUp.value}</div>
            <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.5)', lineHeight: 1.4 }}>{concept.headsUp.desc}</div>
          </div>
          <div style={{ padding: 12, background: `${concept.color}10`, borderRadius: 8, border: `1px solid ${concept.color}25` }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: concept.color, marginBottom: 6 }}>Multiway (3+)</div>
            <div style={{ fontSize: 22, fontWeight: 900, color: concept.color, marginBottom: 4 }}>{concept.multiway.value}</div>
            <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.5)', lineHeight: 1.4 }}>{concept.multiway.desc}</div>
          </div>
        </div>

        {/* Adjustment */}
        <div style={{ padding: 12, background: `${concept.color}08`, borderRadius: 8, border: `1px solid ${concept.color}20`, marginBottom: 16 }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: concept.color, marginBottom: 6 }}>Key Adjustment</div>
          <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.8)', lineHeight: 1.6 }}>{concept.adjustment}</div>
        </div>

        {/* Quick Rules */}
        <div style={{ padding: 10, background: 'rgba(255,255,255,0.03)', borderRadius: 8 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: '#22d3ee', marginBottom: 6 }}>Multiway Golden Rules</div>
          {[
            'Bet less often, but bet bigger when you do',
            'Top pair is a check, not a bet',
            'Sets and two pair are your bread and butter',
            'Suited connectors and pairs gain implied odds value',
            'Position is 2-3x more valuable than heads-up',
            'Never bluff into 3+ players without a strong draw',
          ].map((rule, i) => (
            <div key={i} style={{ fontSize: 11, color: 'rgba(255,255,255,0.6)', padding: '3px 0', borderBottom: i < 5 ? '1px solid rgba(255,255,255,0.04)' : 'none' }}>
              {i + 1}. {rule}
            </div>
          ))}
        </div>
      </div>
    );
  } catch (err) {
    return <div style={{ padding: 20, color: '#ef4444' }}>Multiway Strategy failed to load: {err.message}</div>;
  }
}

export default MultiWayPotStrategy;
