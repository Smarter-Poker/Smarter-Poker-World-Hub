/**
 * ThinValueTrainer — GTO Wizard-Style Thin Value Betting Trainer
 * ═══════════════════════════════════════════════════════════════════════════
 * Train extracting thin value on river with marginal made hands.
 * Shows when to value bet thin vs check back for showdown.
 */
import React, { useState, useMemo } from 'react';

const SPOTS = [
  {
    id: 1, board: 'K♠ 9♦ 4♣ 2♥ 7♠', hero: 'K♥ J♣', position: 'IP vs BB',
    action: 'Bet 33%', correct: 'bet',
    reasoning: 'Top pair good kicker on dry board. Villain calls with K-weak kicker, 99, pocket pairs. Enough worse hands call to make thin value bet profitable.',
    calledBy: 'Kx weak kicker, 99, 77, 44, some 9x',
    beatenBy: 'K9, KQ, sets, two pair combos',
    evBet: '+1.8 bb', evCheck: '+0.6 bb',
  },
  {
    id: 2, board: 'Q♣ T♥ 6♦ 3♠ 8♣', hero: 'Q♦ 9♦', position: 'IP vs BB',
    action: 'Check Back', correct: 'check',
    reasoning: 'Top pair weak kicker on connected board. 8 completes some straights (J9, 97). Villain\'s calling range is too strong — check back and show down.',
    calledBy: 'QJ, QT, sets, straights, better queens',
    beatenBy: 'QJ, QK, J9 straight, 97 straight, sets',
    evBet: '-0.5 bb', evCheck: '+0.8 bb',
  },
  {
    id: 3, board: 'A♥ 7♠ 3♦ T♣ 5♥', hero: 'A♣ 4♣', position: 'IP vs BB',
    action: 'Bet 33%', correct: 'bet',
    reasoning: 'Top pair with a weak kicker but board is very dry. Villain defends many worse Ax and pocket pairs. Small sizing extracts thin value from wide range.',
    calledBy: 'Ax worse kicker, TT-88, 77, some 7x',
    beatenBy: 'AK, AQ, AJ, AT, A7, A5, A3, two pair, sets',
    evBet: '+1.2 bb', evCheck: '+0.4 bb',
  },
  {
    id: 4, board: 'J♥ 8♦ 5♣ K♠ 2♦', hero: '8♠ 8♣', position: 'IP vs BB',
    action: 'Bet 50%', correct: 'bet',
    reasoning: 'Middle set on relatively safe runout. King turn might slow villain down but set is well ahead. Bet for value — villain calls with Kx, Jx, overpairs.',
    calledBy: 'Kx, Jx, QQ, TT, 99, two pair',
    beatenBy: 'KJ, K8 (unlikely), JJ (unlikely — would 3bet)',
    evBet: '+4.5 bb', evCheck: '+1.8 bb',
  },
  {
    id: 5, board: 'T♠ 7♥ 2♣ 4♦ 9♠', hero: 'T♦ 8♦', position: 'IP vs BB',
    action: 'Check Back', correct: 'check',
    reasoning: 'Top pair but 9 on river completes many straights (J8, 86). T8 is vulnerable — villain\'s check-call range is too strong. Showdown value is better.',
    calledBy: 'T9, J8 straight, 86 straight, 97, better tens',
    beatenBy: 'T9, J8, 86, 97, sets, two pair',
    evBet: '-1.1 bb', evCheck: '+0.5 bb',
  },
  {
    id: 6, board: 'K♦ 6♣ 2♥ Q♠ 3♦', hero: 'K♣ 5♣', position: 'IP vs BB',
    action: 'Bet 33%', correct: 'bet',
    reasoning: 'Top pair on a board that ran out clean. Q on turn could slow villain but K5 is still well ahead of villain\'s check-call range. Thin bet 33% for value.',
    calledBy: 'Qx, 66, pocket pairs, worse Kx (K4, K3)',
    beatenBy: 'KQ, K6, QQ, sets',
    evBet: '+1.5 bb', evCheck: '+0.3 bb',
  },
  {
    id: 7, board: 'A♠ J♦ 8♣ 5♥ T♥', hero: 'J♠ T♠', position: 'IP vs BB',
    action: 'Bet 50%', correct: 'bet',
    reasoning: 'Rivered two pair. Board is somewhat coordinated but J♠T♠ now beats all one-pair hands. Villain calls with Ax, Jx, and straight draws that missed.',
    calledBy: 'Ax, Jx, TT-99, KQ that missed',
    beatenBy: 'AJ, AT, A8, sets, KQ straight (unlikely line)',
    evBet: '+3.2 bb', evCheck: '+1.0 bb',
  },
  {
    id: 8, board: '9♣ 7♣ 3♠ K♦ 2♣', hero: '9♥ 9♦', position: 'IP vs BB',
    action: 'Check Back', correct: 'check',
    reasoning: 'Set of 9s but third club on river. Villain\'s check-calling range is polarized to flushes and strong hands. Risk of getting check-raised by flushes. Check back to avoid disaster.',
    calledBy: 'Flushes, Kx, two pair, 77',
    beatenBy: 'Any club flush, K9 (unlikely), 73 (unlikely)',
    evBet: '+0.8 bb', evCheck: '+2.1 bb',
  },
];

function ThinValueTrainer() {
  const [currentIdx, setCurrentIdx] = useState(0);
  const [userChoice, setUserChoice] = useState(null);
  const [stats, setStats] = useState({ correct: 0, total: 0 });

  const spot = SPOTS[currentIdx];

  const handleChoice = (choice) => {
    setUserChoice(choice);
    const isCorrect = choice === spot.correct;
    setStats(prev => ({ correct: prev.correct + (isCorrect ? 1 : 0), total: prev.total + 1 }));
  };

  const nextSpot = () => {
    setCurrentIdx((currentIdx + 1) % SPOTS.length);
    setUserChoice(null);
  };

  const accuracy = stats.total > 0 ? Math.round((stats.correct / stats.total) * 100) : 0;

  try {
    return (
      <div style={{ padding: 20, background: 'rgba(0,0,0,0.3)', borderRadius: 12, border: '1px solid rgba(255,255,255,0.08)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <h3 style={{ margin: 0, fontSize: 18, color: '#fb923c' }}>Thin Value Trainer</h3>
          <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.5)' }}>
            {stats.correct}/{stats.total} ({accuracy}%) • Spot {currentIdx + 1}/{SPOTS.length}
          </span>
        </div>

        {/* Board + Hero */}
        <div style={{ textAlign: 'center', padding: 16, background: 'rgba(251,146,60,0.06)', borderRadius: 10, border: '1px solid rgba(251,146,60,0.15)', marginBottom: 16 }}>
          <div style={{ fontSize: 30, fontWeight: 900, color: '#fff', letterSpacing: 5, marginBottom: 6 }}>{spot.board}</div>
          <div style={{ fontSize: 20, fontWeight: 700, color: '#fb923c', marginBottom: 6 }}>Hero: {spot.hero}</div>
          <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.6)' }}>{spot.position} • Villain checks to you</div>
        </div>

        {/* Decision */}
        {!userChoice && (
          <div style={{ display: 'flex', gap: 12, justifyContent: 'center', marginBottom: 16 }}>
            <button onClick={() => handleChoice('bet')} style={{
              padding: '14px 32px', borderRadius: 10, border: 'none', fontSize: 15, fontWeight: 700,
              cursor: 'pointer', background: '#10b981', color: '#fff', flex: 1, maxWidth: 180,
            }}>Bet for Value</button>
            <button onClick={() => handleChoice('check')} style={{
              padding: '14px 32px', borderRadius: 10, border: 'none', fontSize: 15, fontWeight: 700,
              cursor: 'pointer', background: '#6b7280', color: '#fff', flex: 1, maxWidth: 180,
            }}>Check Back</button>
          </div>
        )}

        {/* Result */}
        {userChoice && (
          <div>
            <div style={{
              padding: 12, borderRadius: 8, marginBottom: 12, textAlign: 'center',
              background: userChoice === spot.correct ? 'rgba(16,185,129,0.1)' : 'rgba(239,68,68,0.1)',
              border: `1px solid ${userChoice === spot.correct ? 'rgba(16,185,129,0.3)' : 'rgba(239,68,68,0.3)'}`,
            }}>
              <div style={{ fontSize: 16, fontWeight: 800, color: userChoice === spot.correct ? '#10b981' : '#ef4444' }}>
                {userChoice === spot.correct ? '✓ Correct!': `✕ Optimal: ${spot.action}`}
              </div>
            </div>

            {/* EV Comparison */}
            <div style={{ display: 'flex', gap: 12, marginBottom: 12 }}>
              <div style={{ flex: 1, padding: 10, background: 'rgba(16,185,129,0.06)', borderRadius: 8, textAlign: 'center', border: spot.correct === 'bet' ? '1px solid rgba(16,185,129,0.3)' : '1px solid rgba(255,255,255,0.06)' }}>
                <div style={{ fontSize: 16, fontWeight: 800, color: '#10b981' }}>{spot.evBet}</div>
                <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.4)' }}>EV of Betting</div>
              </div>
              <div style={{ flex: 1, padding: 10, background: 'rgba(107,114,128,0.06)', borderRadius: 8, textAlign: 'center', border: spot.correct === 'check' ? '1px solid rgba(107,114,128,0.3)' : '1px solid rgba(255,255,255,0.06)' }}>
                <div style={{ fontSize: 16, fontWeight: 800, color: '#9ca3af' }}>{spot.evCheck}</div>
                <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.4)' }}>EV of Checking</div>
              </div>
            </div>

            {/* Range Breakdown */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 12 }}>
              <div style={{ padding: 8, background: 'rgba(255,255,255,0.03)', borderRadius: 6, borderLeft: '3px solid #10b981' }}>
                <span style={{ fontSize: 11, fontWeight: 700, color: '#10b981' }}>Called By: </span>
                <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.6)' }}>{spot.calledBy}</span>
              </div>
              <div style={{ padding: 8, background: 'rgba(255,255,255,0.03)', borderRadius: 6, borderLeft: '3px solid #ef4444' }}>
                <span style={{ fontSize: 11, fontWeight: 700, color: '#ef4444' }}>Beaten By: </span>
                <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.6)' }}>{spot.beatenBy}</span>
              </div>
            </div>

            {/* Reasoning */}
            <div style={{ padding: 12, background: 'rgba(251,146,60,0.06)', borderRadius: 8, border: '1px solid rgba(251,146,60,0.12)', marginBottom: 12 }}>
              <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.8)', lineHeight: 1.6 }}>{spot.reasoning}</div>
            </div>

            <div style={{ textAlign: 'center' }}>
              <button onClick={nextSpot} style={{
                padding: '10px 28px', borderRadius: 8, border: 'none', fontSize: 14, fontWeight: 700,
                cursor: 'pointer', background: '#fb923c', color: '#fff',
              }}>Next Spot →</button>
            </div>
          </div>
        )}
      </div>
    );
  } catch (err) {
    return <div style={{ padding: 20, color: '#ef4444' }}>Thin Value Trainer failed to load: {err.message}</div>;
  }
}

export default ThinValueTrainer;
