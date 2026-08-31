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
    scenario: 'At a 9-handed table, action folds to you Under The Gun. You hold K♠ 9♠ and raise to 3 BB. What is the primary strategic leak?',
    options: [
      { text: 'The Hand Is Outside A Sound UTG Opening Range', correct: true },
      { text: 'The Raise Size Is Too Small For A Nine-Handed Table', correct: false },
      { text: 'The Hand Should Be Open-Limped To Control The Pot', correct: false },
      { text: 'The Hand Should Be Raised Larger To Deny Equity', correct: false },
    ],
    explanation: 'K9s is too weak to open from UTG at a full ring table. UTG range should be ~12-15% - K9s is outside this range. It plays poorly multiway and is dominated by KT+, AK, AQ.',
    fix: 'Tighten UTG range to pairs 77+, ATs+, KQs, AJo+. Fold K9s from early position.',
    severity: 'Medium',
  },
  {
    id: 2, category: 'Postflop',
    scenario: 'The Button raises to 2.5 BB and you call in the Big Blind with A♠ 5♠. You check-call 3 BB on K♣ Q♦ 7♣, then 9 BB on the 3♥ turn, and finally 24 BB on the J♠ river. What is the primary strategic leak?',
    options: [
      { text: 'Calling The River Too Wide With Almost No Showdown Value', correct: true },
      { text: 'Failing To Check-Raise The Flop As A Semi-Bluff', correct: false },
      { text: 'Failing To Lead The Turn After The Flop Call', correct: false },
      { text: 'Missing A River Raise Because The Ace Blocks Strong Hands', correct: false },
    ],
    explanation: 'A5 has zero showdown value on KQJ73. By the river, villain has connected with this board or is value betting. A-high loses to every value bet and is a pure fold by the turn at the latest.',
    fix: 'Fold weak hands when the board heavily favors opponents range. Dont become a calling station.',
    severity: 'High',
  },
  {
    id: 3, category: 'Sizing',
    scenario: 'In A Button-Versus-Big-Blind 3-bet pot, the Big Blind checks the K♦ 8♣ 3♠ 2♥ 7♦ river. You hold A♠ A♣ on the Button and bet 25% pot. What is the primary strategic leak?',
    options: [
      { text: 'The Value Bet Is Too Small Against The Calling Range', correct: true },
      { text: 'The Hand Should Check Back To Avoid A Check-Raise', correct: false },
      { text: 'The Hand Is Too Weak To Value Bet This River', correct: false },
      { text: 'The Only Profitable Size Is An All-In Bet', correct: false },
    ],
    explanation: 'AA on K8327 is a strong value hand. Betting 25% pot doesnt extract enough value from Kx hands that will call. BB has KQ, KJ, KT that call much larger sizes. You left money on the table.',
    fix: 'Bet 66-75% pot for value. Target Kx hands that cant fold. Maximize value with strong holdings.',
    severity: 'Medium',
  },
  {
    id: 4, category: 'Bluffing',
    scenario: 'On the river of a three-player pot, both opponents check. You hold 6♠ 5♠ with a missed straight draw and bluff 33% pot. What is the primary strategic leak?',
    options: [
      { text: 'Bluffing Too Often Into Multiple Players With A Small Size', correct: true },
      { text: 'Choosing A Missed Draw That Is Too Strong To Bluff', correct: false },
      { text: 'Failing To Use A Smaller Block Bet With Six-High', correct: false },
      { text: 'Checking Would Waste Too Much Fold Equity On The River', correct: false },
    ],
    explanation: 'Bluffing into 3 players rarely works - each player only needs to call sometimes. Small sizing gives everyone great odds. In multiway pots, bluffing frequency should drop dramatically. Give up on missed draws multiway.',
    fix: 'Avoid bluffing multiway unless you have a very credible story. If bluffing heads-up, use appropriate sizing (66%+).',
    severity: 'High',
  },
  {
    id: 5, category: 'Mental Game',
    scenario: 'After losing three buy-ins at $1/$2, you immediately move up to $2/$5 to “win it back faster.” What is the primary leak?',
    options: [
      { text: 'Moving Up To Chase Losses While Emotionally Compromised', correct: true },
      { text: 'Remaining At A Limit With Too Little Strategic Variety', correct: false },
      { text: 'Leaving A Lower-Stakes Game Before Recovering The Loss', correct: false },
      { text: 'Changing Tables Without First Taking A Short Break', correct: false },
    ],
    explanation: 'This is revenge tilt / desperation tilt. Moving up after losses leads to playing against tougher opponents while emotionally compromised. This is how bankrolls get destroyed in a single session.',
    fix: 'Move DOWN when losing, not up. Take a break. Only play your regular stakes when mentally sharp.',
    severity: 'Critical',
  },
  {
    id: 6, category: 'Position',
    scenario: 'The Cutoff raises to 2.5 BB and the Button 3-bets to 9 BB. You cold-call from the Small Blind with T♠ 9♠ at 100 BB effective. What is the primary strategic leak?',
    options: [
      { text: 'Cold-Calling A 3-Bet Out Of Position With A Speculative Hand', correct: true },
      { text: 'Folding Would Give Up Too Much Equity With A Suited Connector', correct: false },
      { text: 'The Hand Should Always Be Used As A 4-Bet Bluff', correct: false },
      { text: 'The Call Is Correct Because Suited Hands Fully Realize Equity', correct: false },
    ],
    explanation: 'Cold-calling a 3-bet from the SB is one of the worst plays in poker. Youre OOP, facing a strong range, and cant realize your equity well. T9s needs position and implied odds - you have neither here.',
    fix: 'SB should 4-bet or fold vs 3-bets. Never cold-call. If you want to play T9s, 4-bet bluff (occasionally) or fold.',
    severity: 'High',
  },
];

function LeakFinderQuiz() {
  const [idx, setIdx] = useState(0);
  const [selected, setSelected] = useState(null);
  const [stats, setStats] = useState({ correct: 0, total: 0 });

  const leak = LEAKS[idx];
  const selectedOption = selected === null ? null : leak.options[selected];
  const correctOption = leak.options.find((option) => option.correct);
  const answeredCorrectly = Boolean(selectedOption?.correct);
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

        <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.4)', marginBottom: 8 }}>What Is The Leak?</div>
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
          <div aria-live="assertive" aria-atomic="true">
            <div style={{
              padding: 16,
              background: answeredCorrectly
                ? 'linear-gradient(145deg, rgba(8, 55, 42, 0.98), rgba(2, 20, 17, 0.98))'
                : 'linear-gradient(145deg, rgba(83, 18, 28, 0.98), rgba(25, 4, 9, 0.98))',
              borderRadius: 0,
              border: `2px solid ${answeredCorrectly ? '#39f6b2' : '#ff5c74'}`,
              boxShadow: answeredCorrectly
                ? '0 0 26px rgba(57, 246, 178, 0.28), inset 0 1px rgba(255,255,255,0.18)'
                : '0 0 26px rgba(255, 92, 116, 0.3), inset 0 1px rgba(255,255,255,0.16)',
              marginBottom: 12,
            }}>
              <div style={{
                color: answeredCorrectly ? '#72ffd0' : '#ff8296',
                fontSize: 24,
                fontWeight: 900,
                letterSpacing: '0.08em',
                marginBottom: 10,
                textTransform: 'uppercase',
                textShadow: '0 0 18px currentColor',
              }}>
                {answeredCorrectly ? 'Correct' : 'Incorrect'}
              </div>
              <div style={{ display: 'grid', gap: 6, marginBottom: 12, fontSize: 12, lineHeight: 1.5 }}>
                <div style={{ color: 'rgba(255,255,255,0.72)' }}><strong style={{ color: '#fff' }}>Your Answer:</strong> {selectedOption?.text}</div>
                {!answeredCorrectly && (
                  <div style={{ color: '#72ffd0' }}><strong>Correct Answer:</strong> {correctOption?.text}</div>
                )}
              </div>
              <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.8)', lineHeight: 1.6, marginBottom: 6 }}>{leak.explanation}</div>
              <div style={{ fontSize: 11, fontWeight: 600, color: '#10b981' }}>Fix: {leak.fix}</div>
            </div>
            <div style={{ color: 'rgba(255,255,255,0.6)', fontSize: 11, lineHeight: 1.5, marginBottom: 10, textAlign: 'center' }}>
              Review The Explanation. This Result Will Stay Open Until You Click Next.
            </div>
            <div style={{ textAlign: 'center' }}>
              <button onClick={next} style={{ padding: '12px 30px', borderRadius: 0, border: '1px solid #9beeff', fontSize: 14, fontWeight: 800, cursor: 'pointer', background: 'linear-gradient(180deg, #23465b, #07121b)', color: '#fff', boxShadow: 'inset 0 1px rgba(255,255,255,0.26), 0 8px 18px rgba(0,0,0,0.38)' }}>Next Leak →</button>
            </div>
          </div>
        )}
      </div>
    );
  } catch (err) {
    return <div style={{ padding: 20, color: '#ef4444' }}>Leak Finder Quiz Failed To Load: {err.message}</div>;
  }
}

export default LeakFinderQuiz;
