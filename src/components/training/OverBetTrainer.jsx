/**
 * OverBetTrainer — GTO Wizard-Style Overbet Strategy Trainer
 * ═══════════════════════════════════════════════════════════════════════════
 * Train when and how to use overbets (>pot). Covers spots, sizing,
 * range construction, and villain reactions.
 */
import React, { useState, useMemo } from 'react';

const SPOTS = [
  {
    id: 1, street: 'River', board: 'K♠ 8♦ 3♣ 2♥ 7♠',
    position: 'IP vs BB', potSize: 45, sizing: '150%',
    frequency: 18, evGain: '+5.2 bb/100',
    valueRange: 'Sets, two pair (K8, K7), rivered straights (96, 54)',
    bluffRange: 'Missed spade flush draws (A♠x♠), busted gutshots',
    vilReaction: 'Villain must defend ~35% vs 1.5x pot. Forces folds from top pair.',
    reasoning: 'River completes no obvious draws. Nut advantage for IP player. Overbet maximizes value from Kx and punishes calling station tendency.',
    tips: ['Overbet river when you have nut advantage', 'Best on blank runouts', 'Forces villain into tough spots with one-pair hands'],
  },
  {
    id: 2, street: 'Turn', board: 'A♥ 9♦ 4♣ A♣',
    position: 'BTN vs BB', potSize: 32, sizing: '130%',
    frequency: 12, evGain: '+3.8 bb/100',
    valueRange: 'Trip aces (Ax), full houses (99, 44), overpairs with ace',
    bluffRange: 'Club flush draws (no ace), low pairs with BDFD',
    vilReaction: 'Villain folds most one-pair hands except strong Ax. Must fold ~40% of range.',
    reasoning: 'Paired ace on turn gives BTN massive nut advantage. BB rarely has Ax (would have 3-bet preflop). Overbet exploits range asymmetry.',
    tips: ['Paired boards amplify range advantage', 'Turn overbets set up river shoves', 'Villain Ax combos are drastically reduced'],
  },
  {
    id: 3, street: 'Flop', board: 'K♥ K♠ 3♦',
    position: 'SB vs BB', potSize: 20, sizing: '120%',
    frequency: 8, evGain: '+2.1 bb/100',
    valueRange: 'Kx (trip kings), full houses (33), AA',
    bluffRange: 'A-high no pair, suited connectors planning multi-barrel',
    vilReaction: 'Villain is in very tough spot — almost no Kx in BB flat range vs SB.',
    reasoning: 'Flop overbets rare but powerful on paired king board. SB has all KQ/KJ/KT from raises while BB mostly called with middling hands.',
    tips: ['Flop overbets work on paired broadway boards', 'SB 3-bet range has more Kx combos', 'Follow through with big turn bets'],
  },
  {
    id: 4, street: 'River', board: 'T♣ 7♣ 2♦ 5♥ Q♠',
    position: 'CO vs BB', potSize: 65, sizing: '200%',
    frequency: 6, evGain: '+8.5 bb/100',
    valueRange: 'QQ, TT, QT, rivered two pair, sets',
    bluffRange: 'Missed club flush draws (A♣K♣, J♣9♣), 98 busted OESD',
    vilReaction: 'Villain must fold ~60% facing 2x pot. Only calls with two pair+ and some Qx.',
    reasoning: 'River queen changes everything. CO can credibly rep QQ, QT, queens up. 2x pot overbet is maximum pressure — villain can\'t profitably call with one pair.',
    tips: ['2x pot on river = villain must fold 60%+', 'Card change rivers are best overbet spots', 'Missed draws become ideal bluffs at this sizing'],
  },
  {
    id: 5, street: 'Turn', board: 'J♠ 8♠ 4♦ 2♠',
    position: 'BTN vs CO', potSize: 28, sizing: '150%',
    frequency: 15, evGain: '+4.4 bb/100',
    valueRange: 'Flush (A♠x♠, K♠x♠), sets, JJ',
    bluffRange: 'Bare A♠ without flush, Q♠T no pair, strong straight draws',
    vilReaction: 'Monotone turn puts CO in defensive mode. Must fold non-spade hands.',
    reasoning: 'Third spade completes many flush combos for BTN. Overbet leverages the polarity of flushing draws. Villain range is capped without flush.',
    tips: ['Flush-completing cards are prime overbet turns', 'Having the bare ace of suit is a great blocker bluff', 'Villain without flush draw must overfold'],
  },
];

function OverBetTrainer() {
  const [selectedId, setSelectedId] = useState(1);
  const [showAnswer, setShowAnswer] = useState(false);
  const [quizGuess, setQuizGuess] = useState(null);

  const spot = useMemo(() => SPOTS.find(s => s.id === selectedId), [selectedId]);

  const sizingOptions = ['75%', '100%', '120%', '130%', '150%', '200%'];

  const handleGuess = (guess) => {
    setQuizGuess(guess);
    setShowAnswer(true);
  };

  try {
    return (
      <div style={{ padding: 20, background: 'rgba(0,0,0,0.3)', borderRadius: 12, border: '1px solid rgba(255,255,255,0.08)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <h3 style={{ margin: 0, fontSize: 18, color: '#dc2626' }}>Overbet Trainer</h3>
          <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.5)' }}>{spot.street} Spots</span>
        </div>

        {/* Spot Selector */}
        <div style={{ display: 'flex', gap: 6, marginBottom: 16, flexWrap: 'wrap' }}>
          {SPOTS.map(s => (
            <button key={s.id} onClick={() => { setSelectedId(s.id); setShowAnswer(false); setQuizGuess(null); }}
              style={{
                padding: '6px 12px', borderRadius: 6, fontSize: 12, fontWeight: 600, cursor: 'pointer',
                background: selectedId === s.id ? '#dc2626' : 'rgba(255,255,255,0.06)',
                color: selectedId === s.id ? '#fff' : 'rgba(255,255,255,0.7)', border: 'none',
              }}>{s.street}: {s.board.slice(0, 10)}...</button>
          ))}
        </div>

        {/* Board + Context */}
        <div style={{ textAlign: 'center', padding: 20, background: 'rgba(220,38,38,0.06)', borderRadius: 10, border: '1px solid rgba(220,38,38,0.15)', marginBottom: 16 }}>
          <div style={{ fontSize: 32, fontWeight: 900, color: '#fff', letterSpacing: 6, marginBottom: 8 }}>{spot.board}</div>
          <div style={{ display: 'flex', justifyContent: 'center', gap: 20, fontSize: 13, color: 'rgba(255,255,255,0.6)' }}>
            <span>{spot.position}</span>
            <span>Pot: ${spot.potSize}</span>
            <span>Freq: <span style={{ color: '#dc2626', fontWeight: 700 }}>{spot.frequency}%</span></span>
          </div>
        </div>

        {/* Quiz: Pick Sizing */}
        {!showAnswer && (
          <div>
            <div style={{ fontSize: 14, fontWeight: 600, color: 'rgba(255,255,255,0.7)', marginBottom: 10, textAlign: 'center' }}>
              What is the optimal overbet sizing?
            </div>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'center', flexWrap: 'wrap' }}>
              {sizingOptions.map(s => (
                <button key={s} onClick={() => handleGuess(s)} style={{
                  padding: '12px 20px', borderRadius: 8, border: 'none', fontSize: 14, fontWeight: 700,
                  cursor: 'pointer', background: 'rgba(220,38,38,0.1)', color: '#dc2626',
                }}>{s}</button>
              ))}
            </div>
          </div>
        )}

        {/* Answer */}
        {showAnswer && (
          <div>
            <div style={{
              padding: 10, borderRadius: 8, marginBottom: 12, textAlign: 'center',
              background: quizGuess === spot.sizing ? 'rgba(16,185,129,0.1)' : 'rgba(239,68,68,0.1)',
              border: `1px solid ${quizGuess === spot.sizing ? 'rgba(16,185,129,0.3)' : 'rgba(239,68,68,0.3)'}`,
            }}>
              <span style={{ fontSize: 16, fontWeight: 800, color: quizGuess === spot.sizing ? '#10b981' : '#ef4444' }}>
                {quizGuess === spot.sizing ? '✓ Correct!': `✕ Optimal: ${spot.sizing}`}
              </span>
              <span style={{ marginLeft: 12, fontSize: 13, color: 'rgba(255,255,255,0.6)' }}>EV: {spot.evGain}</span>
            </div>

            {/* Range Breakdown */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 12 }}>
              {[
                { label: 'Value Range', range: spot.valueRange, color: '#10b981' },
                { label: 'Bluff Range', range: spot.bluffRange, color: '#f59e0b' },
              ].map(r => (
                <div key={r.label} style={{ padding: 10, background: 'rgba(255,255,255,0.03)', borderRadius: 8, borderLeft: `3px solid ${r.color}` }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: r.color, marginBottom: 4 }}>{r.label}</div>
                  <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.7)' }}>{r.range}</div>
                </div>
              ))}
            </div>

            {/* Villain Reaction */}
            <div style={{ padding: 10, background: 'rgba(220,38,38,0.06)', borderRadius: 8, border: '1px solid rgba(220,38,38,0.1)', marginBottom: 12 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: '#dc2626', marginBottom: 4 }}>Villain Reaction</div>
              <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.7)' }}>{spot.vilReaction}</div>
            </div>

            {/* Strategy */}
            <div style={{ padding: 10, background: 'rgba(255,255,255,0.03)', borderRadius: 8, marginBottom: 12 }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: '#fff', marginBottom: 4 }}>Strategy</div>
              <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.8)', lineHeight: 1.6 }}>{spot.reasoning}</div>
            </div>

            {/* Tips */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              {spot.tips.map((tip, i) => (
                <div key={i} style={{ fontSize: 12, color: 'rgba(255,255,255,0.6)', paddingLeft: 12, position: 'relative' }}>
                  <span style={{ position: 'absolute', left: 0, color: '#dc2626' }}>•</span>{tip}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    );
  } catch (err) {
    return <div style={{ padding: 20, color: '#ef4444' }}>Overbet Trainer failed to load: {err.message}</div>;
  }
}

export default OverBetTrainer;
