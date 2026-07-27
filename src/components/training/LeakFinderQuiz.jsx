/**
 * LeakFinderQuiz — Identify Common Poker Leaks
 * ●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●
 * Quiz that presents common leak scenarios and asks the player
 * to identify what's wrong with the strategy shown.
 */
import React, { useState } from 'react';

const LEAKS = [
  {
    id: 1, category: 'Preflop',
    scenario: 'Player opens 3x from UTG with K♠ 9♠ at a 9-handed table.',
    options: [
      { text: 'Opening too wide from UTG', correct: true },
      { text: 'Sizing is too large', correct: false },
      { text: 'Should be 3-betting instead', correct: false },
    ],
    explanation: 'K9s is too weak to open from UTG at a full ring table. UTG range should be ~12-15% — K9s is outside this range. It plays poorly multiway and is dominated by KT+, AK, AQ.',
    fix: 'Tighten UTG range to pairs 77+, ATs+, KQs, AJo+. Fold K9s from early position.',
    severity: 'Medium',
  },
  {
    id: 2, category: 'Postflop',
    scenario: 'Player check-calls three streets with A♠ 5♠ on K♣ Q♦ 7♣ 3♥ J♠ as the BB in a single-raised pot.',
    options: [
      { text: 'Calling too wide — A-high cant beat anything by river', correct: true },
      { text: 'Should be check-raising flop', correct: false },
      { text: 'Should be leading the turn', correct: false },
    ],
    explanation: 'A5 has zero showdown value on KQJ73. By the river, villain has connected with this board or is value betting. A-high loses to every value bet and is a pure fold by the turn at the latest.',
    fix: 'Fold weak hands when the board heavily favors opponents range. Dont become a calling station.',
    severity: 'High',
  },
  {
    id: 3, category: 'Sizing',
    scenario: 'Player bets 25% pot on the river with A♠ A♣ on K♦ 8♣ 3♠ 2♥ 7♦ (BTN vs BB, 3-bet pot).',
    options: [
      { text: 'Bet sizing is way too small', correct: true },
      { text: 'Should be checking instead', correct: false },
      { text: 'Hand is not strong enough to bet', correct: false },
    ],
    explanation: 'AA on K8327 is a strong value hand. Betting 25% pot doesnt extract enough value from Kx hands that will call. BB has KQ, KJ, KT that call much larger sizes. You left money on the table.',
    fix: 'Bet 66-75% pot for value. Target Kx hands that cant fold. Maximize value with strong holdings.',
    severity: 'Medium',
  },
  {
    id: 4, category: 'Bluffing',
    scenario: 'Player bluffs river with 6♠ 5♠ (missed straight draw) by betting 33% pot into a multiway pot (3 players).',
    options: [
      { text: 'Bluffing into multiple players with tiny sizing', correct: true },
      { text: 'Should be bluffing with a bigger hand', correct: false },
      { text: 'Draw should have hit by the river', correct: false },
    ],
    explanation: 'Bluffing into 3 players rarely works — each player only needs to call sometimes. Small sizing gives everyone great odds. In multiway pots, bluffing frequency should drop dramatically. Give up on missed draws multiway.',
    fix: 'Avoid bluffing multiway unless you have a very credible story. If bluffing heads-up, use appropriate sizing (66%+).',
    severity: 'High',
  },
  {
    id: 5, category: 'Mental Game',
    scenario: 'After losing 3 buy-ins, player moves up to 2/5 from 1/2 to "win it back faster".',
    options: [
      { text: 'Moving up to chase losses — classic tilt', correct: true },
      { text: 'Higher stakes have weaker players', correct: false },
      { text: 'Its fine if bankroll can handle it', correct: false },
    ],
    explanation: 'This is revenge tilt / desperation tilt. Moving up after losses leads to playing against tougher opponents while emotionally compromised. This is how bankrolls get destroyed in a single session.',
    fix: 'Move DOWN when losing, not up. Take a break. Only play your regular stakes when mentally sharp.',
    severity: 'Critical',
  },
  {
    id: 6, category: 'Position',
    scenario: 'Player cold-calls a raise and a 3-bet from the SB with T♠ 9♠.',
    options: [
      { text: 'Cold-calling a 3-bet OOP with a speculative hand', correct: true },
      { text: 'T9s is too weak to play at all', correct: false },
      { text: 'Should be 4-betting as a squeeze', correct: false },
    ],
    explanation: 'Cold-calling a 3-bet from the SB is one of the worst plays in poker. Youre OOP, facing a strong range, and cant realize your equity well. T9s needs position and implied odds — you have neither here.',
    fix: 'SB should 4-bet or fold vs 3-bets. Never cold-call. If you want to play T9s, 4-bet bluff (occasionally) or fold.',
    severity: 'High',
  },
];

function LeakFinderQuiz() {
  const [idx, setIdx] = useState(0);
  const [selected, setSelected] = useState(null);
  const [stats, setStats] = useState({ correct: 0, total: 0 });

  const leak = LEAKS[idx];
  const accuracy = stats.total > 0 ? Math.round((stats.correct / stats.total) * 100) : 0;

  const handleSelect = (i) => {
    if (selected !== null) return;
    setSelected(i);
    setStats(prev => ({ correct: prev.correct + (leak.options[i].correct ? 1 : 0), total: prev.total + 1 }));
  };

  const next = () => { setIdx((idx + 1) % LEAKS.length); setSelected(null); };

  const sevColors = { 'Critical': '#ef4444', 'High': '#f97316', 'Medium': '#f59e0b', 'Low': '#10b981' };

  try {
    return (
      <div style={{ padding: 20, background: 'rgba(0,0,0,0.3)', borderRadius: 12, border: '1px solid rgba(255,255,255,0.08)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <h3 style={{ margin: 0, fontSize: 18, color: '#f43f5e' }}>Leak Finder Quiz</h3>
          <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.5)' }}>{stats.correct}/{stats.total} ({accuracy}%)</span>
        </div>

        <div style={{ padding: 12, background: 'rgba(244,63,94,0.06)', borderRadius: 10, border: '1px solid rgba(244,63,94,0.15)', marginBottom: 16 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
            <span style={{ fontSize: 10, fontWeight: 600, color: '#f43f5e' }}>{leak.category}</span>
            <span style={{ fontSize: 9, padding: '2px 6px', borderRadius: 4, background: `${sevColors[leak.severity]}22`, color: sevColors[leak.severity] }}>{leak.severity}</span>
          </div>
          <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.8)', lineHeight: 1.6 }}>{leak.scenario}</div>
        </div>

        <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.4)', marginBottom: 8 }}>What is the leak?</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 16 }}>
          {leak.options.map((opt, i) => {
            const isSelected = selected === i;
            const showResult = selected !== null;
            let bg = 'rgba(255,255,255,0.04)';
            let border = '1px solid rgba(255,255,255,0.06)';
            if (showResult && opt.correct) { bg = 'rgba(16,185,129,0.1)'; border = '1px solid rgba(16,185,129,0.3)'; }
            if (showResult && isSelected && !opt.correct) { bg = 'rgba(239,68,68,0.1)'; border = '1px solid rgba(239,68,68,0.3)'; }
            return (
              <button key={i} onClick={() => handleSelect(i)} style={{
                padding: 12, borderRadius: 8, border, background: bg, cursor: selected === null ? 'pointer' : 'default',
                textAlign: 'left', fontSize: 12, color: 'rgba(255,255,255,0.8)',
              }}>{opt.text}</button>
            );
          })}
        </div>

        {selected !== null && (
          <div>
            <div style={{ padding: 10, background: 'rgba(244,63,94,0.06)', borderRadius: 8, border: '1px solid rgba(244,63,94,0.12)', marginBottom: 8 }}>
              <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.8)', lineHeight: 1.6, marginBottom: 6 }}>{leak.explanation}</div>
              <div style={{ fontSize: 11, fontWeight: 600, color: '#10b981' }}>Fix: {leak.fix}</div>
            </div>
            <div style={{ textAlign: 'center' }}>
              <button onClick={next} style={{ padding: '10px 28px', borderRadius: 8, border: 'none', fontSize: 14, fontWeight: 700, cursor: 'pointer', background: '#f43f5e', color: '#fff' }}>Next Leak →</button>
            </div>
          </div>
        )}
      </div>
    );
  } catch (err) {
    return <div style={{ padding: 20, color: '#ef4444' }}>Leak Finder Quiz failed to load: {err.message}</div>;
  }
}

export default LeakFinderQuiz;
