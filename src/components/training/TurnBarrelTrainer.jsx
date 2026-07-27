/**
 * TurnBarrelTrainer — GTO Wizard-Style Turn Barrel Decision Trainer
 * ═══════════════════════════════════════════════════════════════════════════
 * Train turn barrel decisions — when to continue betting (double barrel)
 * vs checking back after a flop c-bet.
 */
import React, { useState } from 'react';

const SPOTS = [
  {
    id: 1, board: 'K♠ 9♦ 4♣ | A♥', hero: 'A♣ Q♣', position: 'BTN vs BB',
    context: 'You c-bet 33% on K94r, BB called. Turn A♥. Barrel or check?',
    correct: 'barrel', action: 'Barrel 67%',
    reasoning: 'Ace on turn is an excellent barrel card. You now have top pair with a good kicker, plus the Ace is a scare card for BB. Barrel for value — worse Ax and Kx will call.',
    barrelFreq: 75, checkFreq: 25,
    evBarrel: '+3.2 bb', evCheck: '+1.1 bb',
  },
  {
    id: 2, board: 'Q♣ J♥ 8♦ | 7♠', hero: 'A♠ K♠', position: 'CO vs BB',
    context: 'You c-bet 50% on QJ8, BB called. Turn 7♠. Continue or give up?',
    correct: 'check', action: 'Check (give up)',
    reasoning: 'Board is very connected and the 7 completes more straights (T9, 96). AK has two overcards but no pair. BB called a connected flop = they have something. Check back and hope to hit river.',
    barrelFreq: 15, checkFreq: 85,
    evBarrel: '-2.1 bb', evCheck: '-0.3 bb',
  },
  {
    id: 3, board: 'T♥ 6♣ 2♠ | K♦', hero: 'K♣ J♣', position: 'BTN vs BB',
    context: 'You c-bet 33% on T62r, BB called. Turn K♦ giving you top pair. Barrel?',
    correct: 'barrel', action: 'Barrel 67%',
    reasoning: 'You turned top pair on an excellent card. K is an overccard that improves your range but not BB calling range (which has a lot of Tx and middle pairs). Barrel for value.',
    barrelFreq: 80, checkFreq: 20,
    evBarrel: '+3.8 bb', evCheck: '+1.4 bb',
  },
  {
    id: 4, board: 'A♠ 8♣ 5♥ | 3♦', hero: '7♠ 6♠', position: 'CO vs BB',
    context: 'You c-bet A85 with air. BB called. Turn 3♦. Double barrel?',
    correct: 'check', action: 'Check (give up)',
    reasoning: '3 is a terrible barrel card — it doesnt change anything. BB called an Ace-high flop so they likely have an Ace or a pair. Your 76 has minimal equity. Save chips and give up.',
    barrelFreq: 10, checkFreq: 90,
    evBarrel: '-2.8 bb', evCheck: '-0.1 bb',
  },
  {
    id: 5, board: 'J♣ 7♦ 3♠ | Q♣', hero: 'A♣ T♣', position: 'BTN vs BB',
    context: 'You c-bet J73r with backdoor flush draw + overcard. BB called. Turn Q♣ giving you nut flush draw + gutshot. Barrel?',
    correct: 'barrel', action: 'Barrel 67%',
    reasoning: 'Turn Q♣ gives you nut flush draw (9 outs) + gutshot to broadway (3 more outs). You have 12 outs = ~26% equity, plus fold equity. Semi-bluff barrel is very profitable here.',
    barrelFreq: 85, checkFreq: 15,
    evBarrel: '+2.4 bb', evCheck: '+0.2 bb',
  },
  {
    id: 6, board: '9♣ 5♦ 2♥ | 9♠', hero: 'A♥ K♥', position: 'CO vs BB',
    context: 'You c-bet 952r with overcards. BB called. Turn 9♠ (pairs the board). Barrel?',
    correct: 'barrel', action: 'Barrel 50%',
    reasoning: 'Paired board is a great barrel card when you dont have a 9. It reduces the chance BB has trips, and AK can represent overpairs/trips. BB cant easily call with most of their flop calling range now.',
    barrelFreq: 65, checkFreq: 35,
    evBarrel: '+1.6 bb', evCheck: '-0.2 bb',
  },
  {
    id: 7, board: 'K♥ T♠ 4♦ | T♣', hero: 'Q♠ J♠', position: 'BTN vs BB',
    context: 'You c-bet KT4 with an OESD. BB called. Turn T♣ (pairs the Ten). Barrel?',
    correct: 'check', action: 'Check (draw to straight)',
    reasoning: 'Turn pairing the T is bad for you — BB called with many Tx combos on this board (AT, JT, T9). They now have trips. Your straight draw is live but barreling into trips is burning money.',
    barrelFreq: 20, checkFreq: 80,
    evBarrel: '-1.5 bb', evCheck: '+0.5 bb',
  },
];

function TurnBarrelTrainer() {
  const [currentIdx, setCurrentIdx] = useState(0);
  const [userChoice, setUserChoice] = useState(null);
  const [stats, setStats] = useState({ correct: 0, total: 0 });

  const spot = SPOTS[currentIdx];
  const accuracy = stats.total > 0 ? Math.round((stats.correct / stats.total) * 100) : 0;

  const handleChoice = (choice) => {
    setUserChoice(choice);
    setStats(prev => ({ correct: prev.correct + (choice === spot.correct ? 1 : 0), total: prev.total + 1 }));
  };

  const nextSpot = () => { setCurrentIdx((currentIdx + 1) % SPOTS.length); setUserChoice(null); };

  try {
    return (
      <div style={{ padding: 20, background: 'rgba(0,0,0,0.3)', borderRadius: 12, border: '1px solid rgba(255,255,255,0.08)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <h3 style={{ margin: 0, fontSize: 18, color: '#60a5fa' }}>Turn Barrel Trainer</h3>
          <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.5)' }}>{stats.correct}/{stats.total} ({accuracy}%) • Spot {currentIdx + 1}/{SPOTS.length}</span>
        </div>

        {/* Scenario */}
        <div style={{ padding: 14, background: 'rgba(96,165,250,0.06)', borderRadius: 10, border: '1px solid rgba(96,165,250,0.15)', marginBottom: 16, textAlign: 'center' }}>
          <div style={{ fontSize: 24, fontWeight: 900, color: '#fff', letterSpacing: 3, marginBottom: 6 }}>{spot.board}</div>
          <div style={{ fontSize: 18, fontWeight: 700, color: '#60a5fa', marginBottom: 6 }}>Hero: {spot.hero}</div>
          <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.6)', marginBottom: 4 }}>{spot.position}</div>
          <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.5)', lineHeight: 1.5, maxWidth: 420, margin: '0 auto' }}>{spot.context}</div>
        </div>

        {/* Decision */}
        {!userChoice && (
          <div style={{ display: 'flex', gap: 12, justifyContent: 'center', marginBottom: 16 }}>
            <button onClick={() => handleChoice('barrel')} style={{ padding: '14px 32px', borderRadius: 10, border: 'none', fontSize: 15, fontWeight: 700, cursor: 'pointer', background: '#60a5fa', color: '#fff', flex: 1, maxWidth: 180 }}>Double Barrel</button>
            <button onClick={() => handleChoice('check')} style={{ padding: '14px 32px', borderRadius: 10, border: 'none', fontSize: 15, fontWeight: 700, cursor: 'pointer', background: '#6b7280', color: '#fff', flex: 1, maxWidth: 180 }}>Check Back</button>
          </div>
        )}

        {/* Result */}
        {userChoice && (
          <div>
            <div style={{ padding: 12, borderRadius: 8, marginBottom: 12, textAlign: 'center', background: userChoice === spot.correct ? 'rgba(16,185,129,0.1)' : 'rgba(239,68,68,0.1)', border: `1px solid ${userChoice === spot.correct ? 'rgba(16,185,129,0.3)' : 'rgba(239,68,68,0.3)'}` }}>
              <div style={{ fontSize: 16, fontWeight: 800, color: userChoice === spot.correct ? '#10b981' : '#ef4444' }}>
                {userChoice === spot.correct ? '✓ Correct!': `✕ Optimal: ${spot.action}`}
              </div>
            </div>

            <div style={{ display: 'flex', gap: 12, marginBottom: 12 }}>
              <div style={{ flex: 1, padding: 10, borderRadius: 8, textAlign: 'center', background: spot.correct === 'barrel' ? 'rgba(96,165,250,0.1)' : 'rgba(255,255,255,0.03)', border: spot.correct === 'barrel' ? '1px solid rgba(96,165,250,0.3)' : '1px solid rgba(255,255,255,0.06)' }}>
                <div style={{ fontSize: 16, fontWeight: 800, color: '#60a5fa' }}>{spot.evBarrel}</div>
                <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.4)' }}>EV Barrel</div>
              </div>
              <div style={{ flex: 1, padding: 10, borderRadius: 8, textAlign: 'center', background: spot.correct === 'check' ? 'rgba(107,114,128,0.1)' : 'rgba(255,255,255,0.03)', border: spot.correct === 'check' ? '1px solid rgba(107,114,128,0.3)' : '1px solid rgba(255,255,255,0.06)' }}>
                <div style={{ fontSize: 16, fontWeight: 800, color: '#9ca3af' }}>{spot.evCheck}</div>
                <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.4)' }}>EV Check</div>
              </div>
            </div>

            <div style={{ display: 'flex', height: 20, borderRadius: 6, overflow: 'hidden', marginBottom: 12 }}>
              <div style={{ width: `${spot.barrelFreq}%`, background: '#60a5fa', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, fontWeight: 700, color: '#fff' }}>Barrel {spot.barrelFreq}%</div>
              <div style={{ width: `${spot.checkFreq}%`, background: '#4b5563', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, fontWeight: 700, color: '#fff' }}>Check {spot.checkFreq}%</div>
            </div>

            <div style={{ padding: 12, background: 'rgba(96,165,250,0.06)', borderRadius: 8, border: '1px solid rgba(96,165,250,0.12)', marginBottom: 12 }}>
              <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.8)', lineHeight: 1.6 }}>{spot.reasoning}</div>
            </div>

            <div style={{ textAlign: 'center' }}>
              <button onClick={nextSpot} style={{ padding: '10px 28px', borderRadius: 8, border: 'none', fontSize: 14, fontWeight: 700, cursor: 'pointer', background: '#60a5fa', color: '#fff' }}>Next Spot →</button>
            </div>
          </div>
        )}
      </div>
    );
  } catch (err) {
    return <div style={{ padding: 20, color: '#ef4444' }}>Turn Barrel Trainer failed to load: {err.message}</div>;
  }
}

export default TurnBarrelTrainer;
