/**
 * NutAdvantageTracker — Understand Nut Advantage
 * ●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●
 * Interactive tool showing which player has the nut advantage on
 * different board textures. Fundamental to GTO strategy.
 */
import React, { useState } from 'react';

const SCENARIOS = [
  {
    board: 'A♠ K♦ 7♣', street: 'Flop', context: 'BTN vs BB SRP',
    nutAdvantage: 'PFR', score: 85, color: '#10b981',
    pfrNuts: ['AA', 'KK', 'AK', 'AQ', '77'],
    defNuts: ['77', 'A7s', 'K7s'],
    explanation: 'PFR has massive nut advantage. All the AA, KK, AK combos. BB rarely has AK (would 3-bet) and never has AA/KK. PFR can bet aggressively.',
    implication: 'PFR should c-bet frequently with small sizing. Defender should fold wide and check-raise only with 2-pair+.',
  },
  {
    board: '8♥ 7♣ 5♦', street: 'Flop', context: 'CO vs BB SRP',
    nutAdvantage: 'Defender', score: 65, color: '#ef4444',
    pfrNuts: ['88', '77', '55', '96s'],
    defNuts: ['88', '77', '55', '96', '64', '86', '75', '87'],
    explanation: 'BB has more two-pair and straight combos on this connected low board. Suited connectors and gappers that BB defends with hit this board hard.',
    implication: 'PFR should check more. Defender should check-raise aggressively. Dont try to range bet this board.',
  },
  {
    board: 'Q♣ J♦ T♣', street: 'Flop', context: 'BTN vs BB SRP',
    nutAdvantage: 'Shared', score: 50, color: '#f59e0b',
    pfrNuts: ['AK', 'K9', 'QQ', 'JJ', 'TT', 'QJ', 'QT'],
    defNuts: ['K9', 'QJ', 'QT', 'JT', '98', 'QQ', 'JJ', 'TT'],
    explanation: 'Both players have strong hands on this connected broadway board. Straights, sets, and two pairs exist in both ranges. Nut advantage is roughly equal.',
    implication: 'Both players should proceed cautiously. Mix bets and checks. This is a high-variance flop where ranges collide.',
  },
  {
    board: 'A♠ K♦ 7♣ | 2♥', street: 'Turn', context: 'BTN vs BB (after flop check-through)',
    nutAdvantage: 'Defender', score: 55, color: '#ef4444',
    pfrNuts: ['AK', '77', 'AA', 'KK'],
    defNuts: ['77', 'A7', 'K7', 'AK', '22', 'A2s'],
    explanation: 'After PFR checks flop, nut advantage shifts to defender. PFR showed weakness by checking. BB now has more relative nutted hands.',
    implication: 'BB should probe bet frequently. PFR gave up their range advantage by checking. Defender can bluff effectively.',
  },
  {
    board: 'K♠ 9♣ 4♦ | K♥', street: 'Turn', context: 'BTN vs BB SRP',
    nutAdvantage: 'PFR', score: 90, color: '#10b981',
    pfrNuts: ['KK', 'K9', 'K4', 'AK', 'KQ', 'KJ', 'KT'],
    defNuts: ['K9', 'K4s', '99', '44'],
    explanation: 'Turn K gives PFR a massive nut advantage. PFR has all AK, KQ, KJ, KT that BB would often 3-bet. PFR can overbet this turn.',
    implication: 'PFR should bet large or overbet. Defender is in terrible shape — few trips and many hands that cant continue.',
  },
  {
    board: 'T♣ 8♣ 3♦ | 5♣', street: 'Turn', context: 'CO vs BB SRP',
    nutAdvantage: 'Shared', score: 48, color: '#f59e0b',
    pfrNuts: ['A♣x', 'T♣x', 'Flush made', 'TT', '88'],
    defNuts: ['Flush combos', '87', '65', '53', 'T8', '88', '33', '55'],
    explanation: 'Flush completes and both players have flush draws in their range. BB has more suited connectors. PFR has more suited broadways. Roughly equal.',
    implication: 'Whoever has the nut flush has all the leverage. Play is very draw-dependent. Mix strategies.',
  },
];

function NutAdvantageTracker() {
  const [selected, setSelected] = useState(0);
  const s = SCENARIOS[selected];

  try {
    return (
      <div style={{ padding: 20, background: 'rgba(0,0,0,0.3)', borderRadius: 12, border: '1px solid rgba(255,255,255,0.08)' }}>
        <h3 style={{ margin: '0 0 16px 0', fontSize: 18, color: '#f472b6' }}>Nut Advantage Tracker</h3>

        <div style={{ display: 'flex', gap: 4, marginBottom: 16, flexWrap: 'wrap' }}>
          {SCENARIOS.map((sc, i) => (
            <button key={i} onClick={() => setSelected(i)} style={{
              padding: '5px 8px', borderRadius: 6, border: 'none', cursor: 'pointer', fontSize: 10, fontWeight: 600,
              background: selected === i ? sc.color : 'rgba(255,255,255,0.06)',
              color: selected === i ? '#fff' : 'rgba(255,255,255,0.5)',
            }}>{sc.board}</button>
          ))}
        </div>

        <div style={{ padding: 14, background: `${s.color}11`, borderRadius: 10, border: `1px solid ${s.color}33`, marginBottom: 16, textAlign: 'center' }}>
          <div style={{ fontSize: 24, fontWeight: 900, color: '#fff', letterSpacing: 3, marginBottom: 4 }}>{s.board}</div>
          <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.5)' }}>{s.context} | {s.street}</div>
        </div>

        {/* Nut advantage meter */}
        <div style={{ marginBottom: 16 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
            <span style={{ fontSize: 11, color: '#10b981', fontWeight: 600 }}>PFR</span>
            <span style={{ fontSize: 13, fontWeight: 800, color: s.color }}>{s.nutAdvantage}</span>
            <span style={{ fontSize: 11, color: '#ef4444', fontWeight: 600 }}>Defender</span>
          </div>
          <div style={{ display: 'flex', height: 20, borderRadius: 10, overflow: 'hidden' }}>
            <div style={{ width: `${s.score}%`, background: '#10b981', transition: 'width 0.5s' }} />
            <div style={{ width: `${100 - s.score}%`, background: '#ef4444', transition: 'width 0.5s' }} />
          </div>
        </div>

        {/* Nut combos */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 16 }}>
          <div style={{ padding: 10, background: 'rgba(16,185,129,0.06)', borderRadius: 8, borderLeft: '3px solid #10b981' }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: '#10b981', marginBottom: 4 }}>PFR Nuts</div>
            <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.6)', lineHeight: 1.5 }}>{s.pfrNuts.join(', ')}</div>
          </div>
          <div style={{ padding: 10, background: 'rgba(239,68,68,0.06)', borderRadius: 8, borderLeft: '3px solid #ef4444' }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: '#ef4444', marginBottom: 4 }}>Defender Nuts</div>
            <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.6)', lineHeight: 1.5 }}>{s.defNuts.join(', ')}</div>
          </div>
        </div>

        <div style={{ padding: 10, background: 'rgba(255,255,255,0.03)', borderRadius: 8, marginBottom: 8 }}>
          <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.8)', lineHeight: 1.6 }}>{s.explanation}</div>
        </div>

        <div style={{ padding: 10, background: 'rgba(244,114,182,0.06)', borderRadius: 8, border: '1px solid rgba(244,114,182,0.12)' }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: '#f472b6', marginBottom: 2 }}>Strategic Implication</div>
          <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.7)', lineHeight: 1.6 }}>{s.implication}</div>
        </div>
      </div>
    );
  } catch (err) {
    return <div style={{ padding: 20, color: '#ef4444' }}>Nut Advantage Tracker failed to load: {err.message}</div>;
  }
}

export default NutAdvantageTracker;
