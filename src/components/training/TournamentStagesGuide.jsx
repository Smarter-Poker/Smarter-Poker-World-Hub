/**
 * TournamentStagesGuide — MTT Stage Strategy
 * ●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●
 * How to adjust strategy across different tournament stages.
 */
import React, { useState } from 'react';

const STAGES = [
  {
    name: 'Early Stage', range: 'Blinds 25/50 — 100/200', stacks: '150-200bb', color: '#10b981',
    overview: 'Deep stacked. Play like a cash game. Speculative hands have massive implied odds.',
    adjustments: [
      { area: 'Opening', tip: 'Standard cash game ranges. Open tighter from EP, wider from LP.' },
      { area: 'Speculative Hands', tip: 'Play suited connectors, small pairs aggressively. Set mining is very profitable.' },
      { area: 'Pot Control', tip: 'Top pair is NOT a stack-off hand at 200bb. Pot control with medium strength.' },
      { area: 'Bluffing', tip: 'Multi-street bluffs are possible with deep stacks. Plan ahead.' },
    ],
    goal: 'Accumulate chips. Build a stack for the middle stage. Dont bust with marginal hands.',
    danger: 'Going broke with top pair at 200bb effective. This is a cash game leak in tournaments.',
  },
  {
    name: 'Middle Stage', range: 'Blinds 200/400 — 1000/2000', stacks: '30-80bb', color: '#f59e0b',
    overview: 'Most important stage. ICM starts mattering. Stack preservation becomes key.',
    adjustments: [
      { area: 'Stealing', tip: 'Increase steal attempts as antes kick in. Antes add 20%+ to each pot.' },
      { area: 'Reshove', tip: 'At 20-35bb, reshove ranges become critical. Use Nash charts.' },
      { area: '3-Betting', tip: '3-bet more as a bluff to pick up the larger pots. Fold equity is high.' },
      { area: 'Stack Awareness', tip: 'Always know who has you covered and who you cover. Target medium stacks.' },
    ],
    goal: 'Build a big stack or maintain average. Survive to the money without bleeding out.',
    danger: 'Being too passive and blinding down. Antes eat your stack if you dont fight.',
  },
  {
    name: 'Bubble', range: 'Near the money', stacks: '15-60bb', color: '#ef4444',
    overview: 'Maximum ICM pressure. Short stacks are desperate. Big stacks should bully.',
    adjustments: [
      { area: 'Big Stack', tip: 'BULLY mercilessly. Open 60%+. Medium stacks cant call without risking elimination.' },
      { area: 'Medium Stack', tip: 'Tighten significantly. Fold marginal spots. Let short stacks bust first.' },
      { area: 'Short Stack', tip: 'Shove or fold. Any pair, any ace, and suited broadways. Get chips or go home.' },
      { area: 'ICM Spots', tip: 'Never flip for your stack unless youre the short stack. Let ICM work for you.' },
    ],
    goal: 'Big stacks: accumulate. Medium stacks: survive. Short stacks: double up or bust.',
    danger: 'Medium stacks calling shoves with marginal hands. The pay jump from bubble to min-cash is HUGE.',
  },
  {
    name: 'In The Money', range: 'Money to Final Table', stacks: '20-100bb', color: '#3b82f6',
    overview: 'Pressure eases slightly. Focus shifts to final table. Laddering pay jumps matters.',
    adjustments: [
      { area: 'Aggression', tip: 'Increase aggression again. Many players tighten after cashing — exploit this.' },
      { area: 'Pay Jumps', tip: 'Each elimination means everyone earns more. Short stacks benefit from stalling.' },
      { area: 'Position', tip: 'Position is premium. Fight for BTN and CO pots more than ever.' },
      { area: 'Reshoves', tip: '20-30bb reshove ranges widen. Pick spots where opener is likely to fold.' },
    ],
    goal: 'Build a stack for the final table. Top-heavy payouts mean the final table is where the real money is.',
    danger: 'Playing too conservatively after min-cashing. The big money is at the final table.',
  },
  {
    name: 'Final Table', range: '6-9 players', stacks: '15-100bb', color: '#8b5cf6',
    overview: 'Maximum pay jumps. Every hand matters. ICM is at its most extreme.',
    adjustments: [
      { area: 'Chip Leader', tip: 'Apply maximum pressure. You cant bust. Every pot you win increases everyones stress.' },
      { area: '2nd/3rd Stack', tip: 'Play solid. Target short stacks. Avoid the chip leader in big pots.' },
      { area: 'Short Stack', tip: 'Find your spot and shove. Waiting too long costs equity as blinds increase.' },
      { area: 'Heads-Up', tip: 'If you make HU, ICM almost disappears. Play aggressive chip-EV poker.' },
    ],
    goal: 'Win the tournament. The difference between 1st and 2nd is often 30%+ of the prize pool.',
    danger: 'Freezing up under pressure. Stay aggressive and trust your preparation.',
  },
];

function TournamentStagesGuide() {
  const [selected, setSelected] = useState(1);
  const stage = STAGES[selected];

  try {
    return (
      <div style={{ padding: 20, background: 'rgba(0,0,0,0.3)', borderRadius: 12, border: '1px solid rgba(255,255,255,0.08)' }}>
        <h3 style={{ margin: '0 0 16px 0', fontSize: 18, color: '#fbbf24' }}>MTT Stage Strategy</h3>

        <div style={{ display: 'flex', gap: 4, marginBottom: 16 }}>
          {STAGES.map((s, i) => (
            <button key={i} onClick={() => setSelected(i)} style={{
              flex: 1, padding: '6px 3px', borderRadius: 6, border: 'none', cursor: 'pointer', fontSize: 9, fontWeight: 600,
              background: selected === i ? s.color : 'rgba(255,255,255,0.06)',
              color: selected === i ? '#fff' : 'rgba(255,255,255,0.5)',
            }}>{s.name}</button>
          ))}
        </div>

        <div style={{ padding: 12, background: `${stage.color}11`, borderRadius: 10, border: `1px solid ${stage.color}33`, marginBottom: 16 }}>
          <div style={{ fontSize: 16, fontWeight: 800, color: stage.color, marginBottom: 4 }}>{stage.name}</div>
          <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.5)', marginBottom: 4 }}>{stage.range} | {stage.stacks}</div>
          <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.7)', lineHeight: 1.5 }}>{stage.overview}</div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 12 }}>
          {stage.adjustments.map((a, i) => (
            <div key={i} style={{ padding: 8, background: 'rgba(255,255,255,0.03)', borderRadius: 6, display: 'flex', gap: 8 }}>
              <div style={{ minWidth: 70, fontSize: 10, fontWeight: 700, color: stage.color }}>{a.area}</div>
              <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.6)', lineHeight: 1.4 }}>{a.tip}</div>
            </div>
          ))}
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
          <div style={{ padding: 8, background: 'rgba(16,185,129,0.06)', borderRadius: 6 }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: '#10b981', marginBottom: 2 }}>Goal</div>
            <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.6)', lineHeight: 1.4 }}>{stage.goal}</div>
          </div>
          <div style={{ padding: 8, background: 'rgba(239,68,68,0.06)', borderRadius: 6 }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: '#ef4444', marginBottom: 2 }}>Danger</div>
            <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.6)', lineHeight: 1.4 }}>{stage.danger}</div>
          </div>
        </div>
      </div>
    );
  } catch (err) {
    return <div style={{ padding: 20, color: '#ef4444' }}>Tournament Stages Guide failed to load: {err.message}</div>;
  }
}

export default TournamentStagesGuide;
