/**
 * SlowPlayDecisionTrainer — When to Slow Play vs Fast Play
 * ═══════════════════════════════════════════════════════════════════════════
 * Train decisions on when to slow play strong hands vs betting for
 * value immediately. Interactive quiz with GTO reasoning.
 */
import React, { useState } from 'react';

const SPOTS = [
  {
    id: 1, board: 'T♠ 6♣ 2♦', hero: 'T♥ T♣', position: 'BB vs BTN (SRP)',
    context: 'BTN c-bets 33%. You flopped top set on a dry board. Fast play or slow play?',
    correct: 'slow', action: 'Slow Play (call)',
    reasoning: 'Dry board = few draws to protect against. Calling keeps villains bluffs in. If you raise, villain folds everything except overpairs. By calling, you let them barrel turn with more hands.',
    fastFreq: 25, slowFreq: 75,
    evFast: '+2.8 bb', evSlow: '+4.1 bb',
  },
  {
    id: 2, board: 'J♥ T♥ 8♣', hero: 'J♣ J♦', position: 'BB vs CO (SRP)',
    context: 'CO c-bets 50%. You flopped top set on a very wet board. Fast or slow?',
    correct: 'fast', action: 'Fast Play (raise)',
    reasoning: 'Extremely wet board — flush draws, straight draws everywhere. You MUST raise to charge draws and protect your equity. Slow playing risks getting outdrawn on turn/river.',
    fastFreq: 80, slowFreq: 20,
    evFast: '+5.2 bb', evSlow: '+2.9 bb',
  },
  {
    id: 3, board: 'A♠ A♦ 5♣', hero: 'A♥ K♣', position: 'BTN vs BB (SRP)',
    context: 'You c-bet 33% with trip aces on a paired board. BB check-raises. Re-raise or call?',
    correct: 'slow', action: 'Slow Play (call)',
    reasoning: 'You have trips with the best kicker. BB check-raising means they have something — let them continue being aggressive. Flat call and let them barrel off on turn/river. Re-raising folds out their bluffs.',
    fastFreq: 15, slowFreq: 85,
    evFast: '+3.4 bb', evSlow: '+5.8 bb',
  },
  {
    id: 4, board: '9♣ 7♣ 4♠', hero: '9♠ 9♦', position: 'BB vs BTN (SRP)',
    context: 'BTN c-bets 50%. You flopped top set with flush draw possible. Fast or slow?',
    correct: 'fast', action: 'Fast Play (raise)',
    reasoning: 'Two-tone flop with connected cards. Flush and straight draws are present. Raise to charge draws. If you slow play and a club or 8/6/5 hits, your set loses a lot of equity.',
    fastFreq: 70, slowFreq: 30,
    evFast: '+4.6 bb', evSlow: '+3.1 bb',
  },
  {
    id: 5, board: 'K♠ 7♦ 2♣', hero: 'A♠ A♥', position: 'CO vs BB (3bet pot)',
    context: 'You 3-bet pre and c-bet 33% on K72 rainbow. BB calls. Turn: 4♦. BB checks. Bet big or pot control?',
    correct: 'fast', action: 'Bet 67% (value)',
    reasoning: 'AA is a strong hand but NOT the nuts. Kx hands in BB range beat you. Bet for value to get called by Kx and protect against backdoor draws. Checking gives free cards and misses value.',
    fastFreq: 75, slowFreq: 25,
    evFast: '+3.9 bb', evSlow: '+2.1 bb',
  },
  {
    id: 6, board: 'Q♣ Q♠ 3♦', hero: 'Q♥ J♣', position: 'BB vs BTN (SRP)',
    context: 'BTN c-bets 33%. You have trips on a paired, dry board. Fast or slow?',
    correct: 'slow', action: 'Slow Play (call)',
    reasoning: 'Board is paired and very dry. No draws possible. BTN will shut down if you raise. Call and let them keep barreling with overpairs, AK, and bluffs. Trap for maximum value.',
    fastFreq: 10, slowFreq: 90,
    evFast: '+2.1 bb', evSlow: '+4.5 bb',
  },
];

function SlowPlayDecisionTrainer() {
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
          <h3 style={{ margin: 0, fontSize: 18, color: '#facc15' }}>Slow Play Trainer</h3>
          <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.5)' }}>{stats.correct}/{stats.total} ({accuracy}%)</span>
        </div>

        <div style={{ padding: 14, background: 'rgba(250,204,21,0.06)', borderRadius: 10, border: '1px solid rgba(250,204,21,0.15)', marginBottom: 16, textAlign: 'center' }}>
          <div style={{ fontSize: 26, fontWeight: 900, color: '#fff', letterSpacing: 4, marginBottom: 6 }}>{spot.board}</div>
          <div style={{ fontSize: 18, fontWeight: 700, color: '#facc15', marginBottom: 6 }}>Hero: {spot.hero}</div>
          <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.6)', marginBottom: 4 }}>{spot.position}</div>
          <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.5)', lineHeight: 1.5, maxWidth: 420, margin: '0 auto' }}>{spot.context}</div>
        </div>

        {!userChoice && (
          <div style={{ display: 'flex', gap: 12, justifyContent: 'center', marginBottom: 16 }}>
            <button onClick={() => handleChoice('fast')} style={{ padding: '14px 32px', borderRadius: 10, border: 'none', fontSize: 15, fontWeight: 700, cursor: 'pointer', background: '#ef4444', color: '#fff', flex: 1, maxWidth: 180 }}>Fast Play</button>
            <button onClick={() => handleChoice('slow')} style={{ padding: '14px 32px', borderRadius: 10, border: 'none', fontSize: 15, fontWeight: 700, cursor: 'pointer', background: '#3b82f6', color: '#fff', flex: 1, maxWidth: 180 }}>Slow Play</button>
          </div>
        )}

        {userChoice && (
          <div>
            <div style={{ padding: 12, borderRadius: 8, marginBottom: 12, textAlign: 'center', background: userChoice === spot.correct ? 'rgba(16,185,129,0.1)' : 'rgba(239,68,68,0.1)', border: `1px solid ${userChoice === spot.correct ? 'rgba(16,185,129,0.3)' : 'rgba(239,68,68,0.3)'}` }}>
              <div style={{ fontSize: 16, fontWeight: 800, color: userChoice === spot.correct ? '#10b981' : '#ef4444' }}>
                {userChoice === spot.correct ? '✓ Correct!': `✕ Optimal: ${spot.action}`}
              </div>
            </div>
            <div style={{ display: 'flex', gap: 12, marginBottom: 12 }}>
              <div style={{ flex: 1, padding: 10, borderRadius: 8, textAlign: 'center', background: 'rgba(239,68,68,0.06)' }}>
                <div style={{ fontSize: 16, fontWeight: 800, color: '#ef4444' }}>{spot.evFast}</div>
                <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.4)' }}>EV Fast ({spot.fastFreq}%)</div>
              </div>
              <div style={{ flex: 1, padding: 10, borderRadius: 8, textAlign: 'center', background: 'rgba(59,130,246,0.06)' }}>
                <div style={{ fontSize: 16, fontWeight: 800, color: '#3b82f6' }}>{spot.evSlow}</div>
                <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.4)' }}>EV Slow ({spot.slowFreq}%)</div>
              </div>
            </div>
            <div style={{ padding: 12, background: 'rgba(250,204,21,0.06)', borderRadius: 8, border: '1px solid rgba(250,204,21,0.12)', marginBottom: 12 }}>
              <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.8)', lineHeight: 1.6 }}>{spot.reasoning}</div>
            </div>
            <div style={{ textAlign: 'center' }}>
              <button onClick={nextSpot} style={{ padding: '10px 28px', borderRadius: 8, border: 'none', fontSize: 14, fontWeight: 700, cursor: 'pointer', background: '#facc15', color: '#000' }}>Next Spot →</button>
            </div>
          </div>
        )}
      </div>
    );
  } catch (err) {
    return <div style={{ padding: 20, color: '#ef4444' }}>Slow Play Trainer failed to load: {err.message}</div>;
  }
}

export default SlowPlayDecisionTrainer;
