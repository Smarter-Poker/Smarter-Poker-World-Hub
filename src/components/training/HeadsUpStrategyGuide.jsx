/**
 * HeadsUpStrategyGuide — Heads-Up Play Strategy
 * ●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●
 * Complete guide to heads-up poker strategy including range adjustments,
 * positional play, and common spots.
 */
import React, { useState } from 'react';

const SECTIONS = [
  {
    title: 'Opening Strategy', color: '#3b82f6',
    content: [
      { label: 'SB (BTN) Open Range', value: '70-80%', detail: 'Open nearly everything in position. Fold only worst hands (72o, 83o, 92o). Position is king HU.' },
      { label: 'SB Min-Raise', value: '2x', detail: 'Standard open size. Gives great price on steals. Keeps pot small with marginal hands.' },
      { label: 'SB Limp Range', value: '15-25%', detail: 'Limp weak suited hands and small pairs. Building a limp range prevents BB from over-3-betting.' },
      { label: 'BB 3-Bet Range', value: '18-22%', detail: 'Expand 3-bet range significantly. Include suited connectors and broadways as bluffs.' },
    ],
  },
  {
    title: 'Postflop Adjustments', color: '#10b981',
    content: [
      { label: 'C-Bet Frequency IP', value: '55-65%', detail: 'Bet most flops in position. Check back marginal hands for pot control and bluff-catching.' },
      { label: 'C-Bet Frequency OOP', value: '30-40%', detail: 'Lower c-bet frequency out of position. Check-raise more often with strong hands and draws.' },
      { label: 'Probe Bet (vs missed c-bet)', value: '50-60%', detail: 'When IP player checks back flop, lead the turn frequently. They showed weakness.' },
      { label: 'Float Frequency IP', value: '40-50%', detail: 'Call wider in position. Your positional advantage lets you win pots on later streets.' },
    ],
  },
  {
    title: 'Key Adjustments', color: '#f59e0b',
    content: [
      { label: 'Hand Values Change', value: 'Massively', detail: 'Top pair is a monster HU. Second pair is often the best hand. Ace-high is a strong bluff catcher.' },
      { label: 'Aggression Level', value: '↑↑↑', detail: 'HU is about aggression. If youre not uncomfortable with how much youre betting, youre not aggressive enough.' },
      { label: 'Bluff Frequency', value: 'Much Higher', detail: 'Both players miss the flop ~66% of the time. The player who bets first wins most pots.' },
      { label: 'Showdown Value', value: 'Premium', detail: 'Getting to showdown with any pair is valuable. Dont turn made hands into bluffs unnecessarily.' },
    ],
  },
  {
    title: 'Common Mistakes', color: '#ef4444',
    content: [
      { label: 'Playing too tight', value: 'Fatal Leak', detail: 'Folding >40% of SB is bleeding chips. Open wider and fight for every pot.' },
      { label: 'Not 3-betting enough', value: 'Major Leak', detail: 'Letting SB open and see flops cheaply. 3-bet more aggressively from BB.' },
      { label: 'Giving up too easily', value: 'Costly', detail: 'One c-bet and done. You need to barrel multiple streets and fight for pots.' },
      { label: 'Ignoring position', value: 'Fundamental', detail: 'Position matters even more HU. The BTN/SB acts last on every postflop street.' },
    ],
  },
];

const RANGES_HU = [
  { position: 'SB Open', pct: 75, hands: 'Any pair, any suited hand, any Ax, any Kx, Q2o+, J4o+, T6o+, 97o+, 87o', color: '#3b82f6' },
  { position: 'BB 3-Bet', pct: 20, hands: 'AA-66, AKs-A2s, KQs-K8s, QJs-Q9s, JTs-J9s, T9s, AKo-ATo, KQo-KJo, some bluffs', color: '#ef4444' },
  { position: 'BB Call', pct: 45, hands: 'Rest of playable hands — small pairs, suited connectors, weak broadways, Kx suited', color: '#10b981' },
  { position: 'BB Fold', pct: 10, hands: '72o, 82o, 83o, 92o, 93o, 94o — true garbage', color: '#6b7280' },
];

function HeadsUpStrategyGuide() {
  const [activeSection, setActiveSection] = useState(0);
  const section = SECTIONS[activeSection];

  try {
    return (
      <div style={{ padding: 20, background: 'rgba(0,0,0,0.3)', borderRadius: 12, border: '1px solid rgba(255,255,255,0.08)' }}>
        <h3 style={{ margin: '0 0 16px 0', fontSize: 18, color: '#8b5cf6' }}>Heads-Up Strategy</h3>

        <div style={{ display: 'flex', gap: 4, marginBottom: 16 }}>
          {SECTIONS.map((s, i) => (
            <button key={i} onClick={() => setActiveSection(i)} style={{
              flex: 1, padding: '6px 4px', borderRadius: 6, border: 'none', cursor: 'pointer', fontSize: 10, fontWeight: 600,
              background: activeSection === i ? s.color : 'rgba(255,255,255,0.06)',
              color: activeSection === i ? '#fff' : 'rgba(255,255,255,0.5)',
            }}>{s.title}</button>
          ))}
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 16 }}>
          {section.content.map((item, i) => (
            <div key={i} style={{ padding: 10, background: 'rgba(255,255,255,0.03)', borderRadius: 8, display: 'flex', gap: 10, alignItems: 'flex-start' }}>
              <div style={{ minWidth: 60, textAlign: 'center' }}>
                <div style={{ fontSize: 16, fontWeight: 900, color: section.color }}>{item.value}</div>
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: '#fff', marginBottom: 2 }}>{item.label}</div>
                <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.5)', lineHeight: 1.5 }}>{item.detail}</div>
              </div>
            </div>
          ))}
        </div>

        {/* HU Ranges summary */}
        <div style={{ padding: 10, background: 'rgba(139,92,246,0.06)', borderRadius: 8, border: '1px solid rgba(139,92,246,0.12)' }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: '#8b5cf6', marginBottom: 8 }}>HU Range Summary</div>
          {RANGES_HU.map(r => (
            <div key={r.position} style={{ marginBottom: 6 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 2 }}>
                <span style={{ fontSize: 11, fontWeight: 600, color: r.color }}>{r.position}</span>
                <span style={{ fontSize: 11, fontWeight: 700, color: '#fff' }}>{r.pct}%</span>
              </div>
              <div style={{ height: 6, background: 'rgba(255,255,255,0.06)', borderRadius: 3, overflow: 'hidden', marginBottom: 2 }}>
                <div style={{ height: '100%', width: `${r.pct}%`, borderRadius: 3, background: r.color }} />
              </div>
              <div style={{ fontSize: 9, color: 'rgba(255,255,255,0.3)' }}>{r.hands}</div>
            </div>
          ))}
        </div>
      </div>
    );
  } catch (err) {
    return <div style={{ padding: 20, color: '#ef4444' }}>Heads-Up Strategy Guide failed to load: {err.message}</div>;
  }
}

export default HeadsUpStrategyGuide;
