/**
 * HandReadingTrainer — Street-by-Street Range Narrowing Trainer
 * ●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●
 * Practice hand reading by narrowing villain's range street by street
 * based on their actions. Interactive multi-street exercise.
 */
import React, { useState } from 'react';

const EXERCISES = [
  {
    id: 1, title: 'Value or Bluff?',
    streets: [
      { street: 'Preflop', action: 'BTN opens 2.5x', range: 'Top ~45% of hands', rangeWidth: 45, note: 'Wide BTN opening range: pairs, broadways, suited cards, connectors.' },
      { street: 'Flop: K♠ 9♦ 4♣', action: 'BTN c-bets 33%', range: 'Top pair+, draws, some air (~65% of open)', rangeWidth: 30, note: 'Small c-bet = wide range. Still has air, overcards, and weak hands alongside Kx and 9x.' },
      { street: 'Turn: 2♥', action: 'BTN bets 67%', range: 'KQ-KT, 99, 44, strong draws, some bluffs (~35% of flop range)', rangeWidth: 12, note: 'Bigger turn bet polarizes. Air mostly gives up. Remaining range is value-heavy with some committed bluffs.' },
      { street: 'River: 7♠', action: 'BTN bets 100% pot', range: 'KQ+, sets, bluffs with missed draws (AQ, AJ, QJ type)', rangeWidth: 6, note: 'Pot-sized river bet = very polarized. Either nutted (KK, 99, K9) or a bluff (missed draws). Very few medium hands.' },
    ],
    question: 'Should you call with K♥ T♥ (top pair, medium kicker)?',
    answer: 'CALL — Villain is polarized and you beat bluffs (missed draws). KT is strong enough as a bluff-catcher. Folding allows villain to print money with bluffs.',
  },
  {
    id: 2, title: 'The Slow Play Tell',
    streets: [
      { street: 'Preflop', action: 'CO opens 2.5x, you 3-bet from BTN, CO calls', range: 'JJ-22, AQs-ATs, KQs, suited connectors (~12% of hands)', rangeWidth: 12, note: 'CO flatting a 3-bet. Missing AA/KK/AK (would 4-bet). Capped range.' },
      { street: 'Flop: T♠ 8♣ 5♥', action: 'CO check-calls your 33% c-bet', range: 'TT, 88, 55 (sets), T9s, AT, JJ, 99, 98s, draws', rangeWidth: 9, note: 'Check-call on connected board. Has sets (slow-playing), pairs, draws. Missing complete air (folded).' },
      { street: 'Turn: 3♦', action: 'CO check-raises your 67% turn bet', range: 'TT, 88, 55 (main range), T8 (unlikely), 76s, 97s', rangeWidth: 3, note: 'CHECK-RAISE on turn = very strong. Sets are primary. Some straights (76, 97). Almost zero bluffs at low stakes.' },
      { street: 'River: K♣', action: 'CO shoves all-in', range: 'Sets (TT, 88, 55), maybe 76 straight', rangeWidth: 2, note: 'All-in after check-raise = monster. Narrowed to sets almost exclusively. This is a fold with anything less than top set.' },
    ],
    question: 'Should you call with AA (overpair)?',
    answer: 'FOLD — The check-raise turn into river shove line at low-to-mid stakes is almost always sets or better. AA loses to TT, 88, 55, and any straight. Save your stack.',
  },
  {
    id: 3, title: 'The Missed Draw Bluff',
    streets: [
      { street: 'Preflop', action: 'SB opens 3x, you call BB', range: 'Wide SB opening: ~50% of hands', rangeWidth: 50, note: 'SB opens wide. Full range of hands.' },
      { street: 'Flop: J♣ 8♣ 3♠', action: 'SB bets 50%', range: 'Jx, 88, 33, club draws, overcards, air (~70%)', rangeWidth: 35, note: 'Standard c-bet on connected board. Many draws available (clubs, 9T, T7). Wide range.' },
      { street: 'Turn: 5♦', action: 'SB bets 67%', range: 'JJ, 88, JT+, club draws, committed bluffs (~40%)', rangeWidth: 14, note: 'Continued betting. Still has many flush draws. Value range is strong top pairs and better.' },
      { street: 'River: 2♥', action: 'SB bets 100% pot', range: 'Sets/two pair for value, missed club draws for bluff', rangeWidth: 8, note: 'All draws missed (no club, no straight). Big river bet = polarized. Flush draws became bluffs. Value hands bet big.' },
    ],
    question: 'Should you call with J♥ 9♥ (top pair)?',
    answer: 'CALL — Many club draws (AcXc, KcQc, T9cc, etc.) bricked the river. Villain is forced to bluff or give up. Your top pair beats all bluffs. Good bluff-catching spot.',
  },
];

function HandReadingTrainer() {
  const [exerciseIdx, setExerciseIdx] = useState(0);
  const [revealedStreet, setRevealedStreet] = useState(0);
  const [showAnswer, setShowAnswer] = useState(false);

  const exercise = EXERCISES[exerciseIdx];

  const nextExercise = () => {
    setExerciseIdx((exerciseIdx + 1) % EXERCISES.length);
    setRevealedStreet(0);
    setShowAnswer(false);
  };

  try {
    return (
      <div style={{ padding: 20, background: 'rgba(0,0,0,0.3)', borderRadius: 12, border: '1px solid rgba(255,255,255,0.08)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <h3 style={{ margin: 0, fontSize: 18, color: '#c084fc' }}>Hand Reading Trainer</h3>
          <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.5)' }}>Exercise {exerciseIdx + 1}/{EXERCISES.length}</span>
        </div>

        <div style={{ fontSize: 14, fontWeight: 700, color: '#c084fc', marginBottom: 12 }}>{exercise.title}</div>

        {/* Streets */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 16 }}>
          {exercise.streets.map((s, i) => {
            const visible = i <= revealedStreet;
            const streetColors = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444'];
            return (
              <div key={i} style={{
                padding: 12, borderRadius: 8, borderLeft: `4px solid ${streetColors[i]}`,
                background: visible ? 'rgba(255,255,255,0.04)' : 'rgba(255,255,255,0.01)',
                opacity: visible ? 1 : 0.3, cursor: !visible && i === revealedStreet + 1 ? 'pointer' : 'default',
              }} onClick={() => { if (i === revealedStreet + 1) setRevealedStreet(i); }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                  <span style={{ fontSize: 13, fontWeight: 700, color: streetColors[i] }}>{s.street}</span>
                  <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.5)' }}>{s.action}</span>
                </div>
                {visible && (
                  <>
                    <div style={{ fontSize: 12, fontWeight: 600, color: '#fff', marginBottom: 4 }}>Range: {s.range}</div>
                    <div style={{ height: 8, background: 'rgba(255,255,255,0.06)', borderRadius: 4, marginBottom: 4 }}>
                      <div style={{ width: `${s.rangeWidth}%`, height: '100%', background: streetColors[i], borderRadius: 4, transition: 'width 0.5s' }} />
                    </div>
                    <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.5)', lineHeight: 1.4 }}>{s.note}</div>
                  </>
                )}
                {!visible && i === revealedStreet + 1 && (
                  <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.3)', textAlign: 'center' }}>Click to reveal next street →</div>
                )}
              </div>
            );
          })}
        </div>

        {/* Question + Answer */}
        {revealedStreet >= exercise.streets.length - 1 && (
          <div>
            <div style={{ padding: 12, background: 'rgba(192,132,252,0.06)', borderRadius: 8, border: '1px solid rgba(192,132,252,0.15)', marginBottom: 12 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: '#c084fc', marginBottom: 4 }}>Decision Point</div>
              <div style={{ fontSize: 13, color: '#fff' }}>{exercise.question}</div>
            </div>

            {!showAnswer ? (
              <div style={{ textAlign: 'center' }}>
                <button onClick={() => setShowAnswer(true)} style={{ padding: '10px 28px', borderRadius: 8, border: 'none', fontSize: 14, fontWeight: 700, cursor: 'pointer', background: '#c084fc', color: '#fff' }}>Show Answer</button>
              </div>
            ) : (
              <div>
                <div style={{ padding: 12, background: 'rgba(16,185,129,0.06)', borderRadius: 8, border: '1px solid rgba(16,185,129,0.2)', marginBottom: 12 }}>
                  <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.8)', lineHeight: 1.6 }}>{exercise.answer}</div>
                </div>
                <div style={{ textAlign: 'center' }}>
                  <button onClick={nextExercise} style={{ padding: '10px 28px', borderRadius: 8, border: 'none', fontSize: 14, fontWeight: 700, cursor: 'pointer', background: '#c084fc', color: '#fff' }}>Next Exercise →</button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    );
  } catch (err) {
    return <div style={{ padding: 20, color: '#ef4444' }}>Hand Reading Trainer failed to load: {err.message}</div>;
  }
}

export default HandReadingTrainer;
