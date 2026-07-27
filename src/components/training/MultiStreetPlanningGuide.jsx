/**
 * MultiStreetPlanningGuide — Plan Across Flop/Turn/River
 * ●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●
 * Guide for thinking ahead across all three postflop streets.
 * Shows how decisions on one street affect future streets.
 */
import React, { useState } from 'react';

const PLANS = [
  {
    hand: 'A♠ A♥', board: 'K♣ 8♦ 3♠', position: 'BTN vs BB (3-bet pot)',
    pot: 18, stack: 85, color: '#ef4444',
    streets: [
      { street: 'Flop', plan: 'Bet 33% (6 bb)', potAfter: 30, reasoning: 'Small c-bet to get value from all Kx and pocket pairs. Board favors our range. Small size keeps their calling range wide.' },
      { street: 'Turn', plan: 'Bet 66% (20 bb) on blanks', potAfter: 70, reasoning: 'Turn barrel for value. At this SPR, one more bet commits stacks. Target Kx, QQ, JJ. Size up because calling range is stronger after flop call.' },
      { street: 'River', plan: 'Shove remaining (~39 bb into 70)', potAfter: 148, reasoning: 'Natural all-in after two streets of building. You invested 65 bb across 3 streets with AA. Geometric progression gets max value.' },
    ],
    summary: 'Classic 3-street value plan. Small → medium → jam. Gets 100bb stacks in by river with the best hand.',
  },
  {
    hand: '8♥ 7♥', board: 'T♥ 6♣ 2♥', position: 'CO vs BB (SRP)',
    pot: 6, stack: 100, color: '#e879f9',
    streets: [
      { street: 'Flop', plan: 'Bet 66% (4 bb)', potAfter: 14, reasoning: 'Semi-bluff with flush draw + gutshot (12 outs). Betting builds the pot for when you hit. If called, you have ~45% equity.' },
      { street: 'Turn (miss)', plan: 'Bet 75% (10.5 bb) on blank turn', potAfter: 35, reasoning: 'Double barrel as semi-bluff. Still 9 flush outs. If villain folds, great. If called, you have ~20% equity for a big river pot.' },
      { street: 'River (miss)', plan: 'Give up (check/fold)', potAfter: 35, reasoning: 'After investing 14.5 bb on a bluff that bricked, dont throw more money away. Bluff accomplished its purpose on earlier streets.' },
    ],
    summary: 'Semi-bluff plan: bet-bet-give up. Two streets of aggression with equity, surrender if draw misses river.',
  },
  {
    hand: 'Q♣ Q♦', board: 'A♥ 9♣ 5♦', position: 'BB vs BTN (SRP)',
    pot: 6, stack: 100, color: '#3b82f6',
    streets: [
      { street: 'Flop', plan: 'Check-call c-bet', potAfter: 12, reasoning: 'QQ is below the A. Check-call to keep pot controlled. Raising bloats pot with a vulnerable hand. Let villain continue bluffing.' },
      { street: 'Turn (blank)', plan: 'Check-call another barrel', potAfter: 28, reasoning: 'Still pot controlling. Villain has many bluffs that fire twice. Your hand is strong but not nutted. Two streets of calling is fine.' },
      { street: 'River (blank)', plan: 'Check-call 50% pot, fold to overbet', potAfter: 42, reasoning: 'River is where you make your decision. Call normal sizes (you beat bluffs). Fold to overbets (too weighted to Ax+).' },
    ],
    summary: 'Pot control plan: check-call three streets with showdown value. Dont bloat pot when you cant handle big raises.',
  },
  {
    hand: 'K♠ J♠', board: 'T♠ 9♣ 4♠', position: 'BTN vs BB (SRP)',
    pot: 6, stack: 100, color: '#10b981',
    streets: [
      { street: 'Flop', plan: 'Bet 50% (3 bb)', potAfter: 12, reasoning: 'Flush draw + gutshot + two overcards. Semi-bluff for value of fold equity. Massive draw with 15 outs to the nuts.' },
      { street: 'Turn (hit: Q♠)', plan: 'Bet 75% (9 bb) — VALUE', potAfter: 30, reasoning: 'Hit the flush! Switch from semi-bluff to value. Bet big to build pot. Target two pairs, sets, and smaller flushes.' },
      { street: 'River', plan: 'Bet 100% pot (30 bb) for max value', potAfter: 90, reasoning: 'Three streets of value with the second nut flush. River overbet is justified because villain called two streets = strong range.' },
    ],
    summary: 'Semi-bluff → value transition. Started as draw, hit the nuts, switch to max value extraction.',
  },
];

function MultiStreetPlanningGuide() {
  const [selected, setSelected] = useState(0);
  const [revealedStreet, setRevealedStreet] = useState(0);
  const plan = PLANS[selected];

  const reset = (i) => { setSelected(i); setRevealedStreet(0); };

  try {
    return (
      <div style={{ padding: 20, background: 'rgba(0,0,0,0.3)', borderRadius: 12, border: '1px solid rgba(255,255,255,0.08)' }}>
        <h3 style={{ margin: '0 0 16px 0', fontSize: 18, color: '#22d3ee' }}>Multi-Street Planning</h3>

        <div style={{ display: 'flex', gap: 6, marginBottom: 16 }}>
          {PLANS.map((p, i) => (
            <button key={i} onClick={() => reset(i)} style={{
              flex: 1, padding: '8px 4px', borderRadius: 8, border: 'none', cursor: 'pointer',
              background: selected === i ? p.color : 'rgba(255,255,255,0.06)',
              color: selected === i ? '#fff' : 'rgba(255,255,255,0.5)',
              fontSize: 11, fontWeight: 700,
            }}>{p.hand}</button>
          ))}
        </div>

        <div style={{ padding: 12, background: `${plan.color}11`, borderRadius: 10, border: `1px solid ${plan.color}33`, marginBottom: 16, textAlign: 'center' }}>
          <div style={{ fontSize: 20, fontWeight: 900, color: '#fff', letterSpacing: 3, marginBottom: 4 }}>{plan.board}</div>
          <div style={{ fontSize: 15, fontWeight: 700, color: plan.color, marginBottom: 2 }}>Hero: {plan.hand}</div>
          <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.5)' }}>{plan.position} | Pot: {plan.pot} bb | Stack: {plan.stack} bb</div>
        </div>

        {/* Street-by-street plan */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 16 }}>
          {plan.streets.map((st, i) => {
            const isRevealed = i <= revealedStreet;
            return (
              <div key={i} onClick={() => { if (i === revealedStreet + 1) setRevealedStreet(i); }}
                style={{
                  padding: 12, borderRadius: 8, cursor: i === revealedStreet + 1 ? 'pointer' : 'default',
                  background: isRevealed ? 'rgba(255,255,255,0.04)' : 'rgba(255,255,255,0.02)',
                  borderLeft: `4px solid ${isRevealed ? plan.color : 'rgba(255,255,255,0.1)'}`,
                  opacity: isRevealed ? 1 : 0.5,
                }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: isRevealed ? 6 : 0 }}>
                  <span style={{ fontSize: 13, fontWeight: 700, color: isRevealed ? plan.color : 'rgba(255,255,255,0.4)' }}>{st.street}</span>
                  {isRevealed && <span style={{ fontSize: 11, fontWeight: 700, color: '#fff' }}>{st.plan}</span>}
                  {!isRevealed && i === revealedStreet + 1 && <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.3)' }}>Click to reveal</span>}
                </div>
                {isRevealed && (
                  <>
                    <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.6)', lineHeight: 1.5, marginBottom: 4 }}>{st.reasoning}</div>
                    <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.3)' }}>Pot after: {st.potAfter} bb</div>
                  </>
                )}
              </div>
            );
          })}
        </div>

        {revealedStreet >= 2 && (
          <div style={{ padding: 10, background: 'rgba(34,211,238,0.06)', borderRadius: 8, border: '1px solid rgba(34,211,238,0.12)' }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: '#22d3ee', marginBottom: 4 }}>Plan Summary</div>
            <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.7)', lineHeight: 1.6 }}>{plan.summary}</div>
          </div>
        )}
      </div>
    );
  } catch (err) {
    return <div style={{ padding: 20, color: '#ef4444' }}>Multi-Street Planning failed to load: {err.message}</div>;
  }
}

export default MultiStreetPlanningGuide;
