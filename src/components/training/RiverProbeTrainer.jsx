/**
 * RiverProbeTrainer — GTO Wizard-Style River Probe Bet Trainer
 * ═══════════════════════════════════════════════════════════════════════════
 * Train river probe bets — betting into an opponent who checked back
 * the previous street. Shows when to probe vs check-give up.
 */
import React, { useState } from 'react';

const PROBE_SPOTS = [
  {
    id: 1, board: 'K♠ 9♦ 4♣ | 7♥ | 2♠', hero: 'K♥ T♣', position: 'BB vs BTN',
    context: 'BTN c-bet flop, you called. BTN checked turn. River 2♠.',
    correct: 'probe', action: 'Probe 50%',
    reasoning: 'BTN checking turn on K94 means they likely have a medium pair or a draw. River 2 is a brick. Your top pair is now likely best — probe to get value from 99, 77, pocket pairs.',
    probeFreq: 60, checkFreq: 40,
    evProbe: '+2.4 bb', evCheck: '+0.8 bb',
  },
  {
    id: 2, board: 'Q♣ J♥ 8♦ | T♠ | 5♣', hero: 'A♦ 9♦', position: 'BB vs CO',
    context: 'CO c-bet flop, you called with gutshot. CO checked turn when T hit (you made straight). River 5♣.',
    correct: 'probe', action: 'Probe 75%',
    reasoning: 'You made the nut straight on the turn and villain checked back. River is a brick. Probe big — villain likely has Qx or Jx and will call. Dont let them check it down!',
    probeFreq: 80, checkFreq: 20,
    evProbe: '+5.6 bb', evCheck: '+1.2 bb',
  },
  {
    id: 3, board: 'A♥ 7♠ 3♦ | K♣ | Q♦', hero: '8♣ 7♣', position: 'BB vs BTN',
    context: 'BTN c-bet flop, you floated with middle pair. BTN checked turn. River Q♦.',
    correct: 'check', action: 'Check (give up)',
    reasoning: 'Board ran out AKQ — three broadway cards. Your 77 is now very weak. Even though BTN checked turn, river Q means any Qx, Kx, Ax beats you. Check and fold if bet.',
    probeFreq: 8, checkFreq: 92,
    evProbe: '-1.8 bb', evCheck: '-0.2 bb',
  },
  {
    id: 4, board: 'T♥ 6♣ 2♠ | 9♦ | 4♣', hero: 'T♣ 8♣', position: 'BB vs MP',
    context: 'MP c-bet flop, you called top pair. MP checked turn. River 4♣.',
    correct: 'probe', action: 'Probe 33%',
    reasoning: 'Top pair on a board where MP checking turn means they gave up with overcards (AK, AQ, AJ). Small probe extracts value from pocket pairs and medium hands that check-call.',
    probeFreq: 55, checkFreq: 45,
    evProbe: '+1.9 bb', evCheck: '+0.9 bb',
  },
  {
    id: 5, board: 'J♠ 8♠ 5♥ | 2♣ | A♠', hero: 'J♦ 9♦', position: 'BB vs BTN',
    context: 'BTN c-bet flop, you called with top pair. BTN checked turn. River A♠ (flush completes).',
    correct: 'check', action: 'Check (scary river)',
    reasoning: 'Ace on river is terrible for your top pair. BTN could have been slowplaying AJ, or the flush completed. Your Jx is now very marginal. Check and be prepared to fold to a bet.',
    probeFreq: 12, checkFreq: 88,
    evProbe: '-1.4 bb', evCheck: '+0.3 bb',
  },
  {
    id: 6, board: '9♣ 5♦ 2♥ | 3♠ | 8♣', hero: 'A♠ K♠', position: 'BB vs CO',
    context: 'CO c-bet flop, you floated with overs + backdoor. CO checked turn. River 8♣.',
    correct: 'probe', action: 'Probe 67% (bluff)',
    reasoning: 'You have ace-high and no showdown value. CO checked turn showing weakness. River 8 doesnt help most hands. This is a prime bluff probe — represent the overpair or set that you would play this way.',
    probeFreq: 45, checkFreq: 55,
    evProbe: '+1.1 bb', evCheck: '-0.3 bb',
  },
];

function RiverProbeTrainer() {
  const [currentIdx, setCurrentIdx] = useState(0);
  const [userChoice, setUserChoice] = useState(null);
  const [stats, setStats] = useState({ correct: 0, total: 0 });

  const spot = PROBE_SPOTS[currentIdx];
  const accuracy = stats.total > 0 ? Math.round((stats.correct / stats.total) * 100) : 0;

  const handleChoice = (choice) => {
    setUserChoice(choice);
    setStats(prev => ({ correct: prev.correct + (choice === spot.correct ? 1 : 0), total: prev.total + 1 }));
  };

  const nextSpot = () => { setCurrentIdx((currentIdx + 1) % PROBE_SPOTS.length); setUserChoice(null); };

  try {
    return (
      <div style={{ padding: 20, background: 'rgba(0,0,0,0.3)', borderRadius: 12, border: '1px solid rgba(255,255,255,0.08)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <h3 style={{ margin: 0, fontSize: 18, color: '#a3e635' }}>River Probe Trainer</h3>
          <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.5)' }}>{stats.correct}/{stats.total} ({accuracy}%) • Spot {currentIdx + 1}/{PROBE_SPOTS.length}</span>
        </div>

        {/* Scenario */}
        <div style={{ padding: 14, background: 'rgba(163,230,53,0.06)', borderRadius: 10, border: '1px solid rgba(163,230,53,0.15)', marginBottom: 16, textAlign: 'center' }}>
          <div style={{ fontSize: 24, fontWeight: 900, color: '#fff', letterSpacing: 3, marginBottom: 6 }}>{spot.board}</div>
          <div style={{ fontSize: 18, fontWeight: 700, color: '#a3e635', marginBottom: 6 }}>Hero: {spot.hero}</div>
          <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.6)', marginBottom: 4 }}>{spot.position}</div>
          <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.5)', lineHeight: 1.5, maxWidth: 420, margin: '0 auto' }}>{spot.context}</div>
        </div>

        {/* Decision */}
        {!userChoice && (
          <div style={{ display: 'flex', gap: 12, justifyContent: 'center', marginBottom: 16 }}>
            <button onClick={() => handleChoice('probe')} style={{ padding: '14px 32px', borderRadius: 10, border: 'none', fontSize: 15, fontWeight: 700, cursor: 'pointer', background: '#a3e635', color: '#000', flex: 1, maxWidth: 180 }}>Probe Bet</button>
            <button onClick={() => handleChoice('check')} style={{ padding: '14px 32px', borderRadius: 10, border: 'none', fontSize: 15, fontWeight: 700, cursor: 'pointer', background: '#6b7280', color: '#fff', flex: 1, maxWidth: 180 }}>Check</button>
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
              <div style={{ flex: 1, padding: 10, borderRadius: 8, textAlign: 'center', background: spot.correct === 'probe' ? 'rgba(163,230,53,0.1)' : 'rgba(255,255,255,0.03)', border: spot.correct === 'probe' ? '1px solid rgba(163,230,53,0.3)' : '1px solid rgba(255,255,255,0.06)' }}>
                <div style={{ fontSize: 16, fontWeight: 800, color: '#a3e635' }}>{spot.evProbe}</div>
                <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.4)' }}>EV Probe</div>
              </div>
              <div style={{ flex: 1, padding: 10, borderRadius: 8, textAlign: 'center', background: spot.correct === 'check' ? 'rgba(107,114,128,0.1)' : 'rgba(255,255,255,0.03)', border: spot.correct === 'check' ? '1px solid rgba(107,114,128,0.3)' : '1px solid rgba(255,255,255,0.06)' }}>
                <div style={{ fontSize: 16, fontWeight: 800, color: '#9ca3af' }}>{spot.evCheck}</div>
                <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.4)' }}>EV Check</div>
              </div>
            </div>

            <div style={{ display: 'flex', height: 20, borderRadius: 6, overflow: 'hidden', marginBottom: 12 }}>
              <div style={{ width: `${spot.probeFreq}%`, background: '#a3e635', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, fontWeight: 700, color: '#000' }}>Probe {spot.probeFreq}%</div>
              <div style={{ width: `${spot.checkFreq}%`, background: '#4b5563', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, fontWeight: 700, color: '#fff' }}>Check {spot.checkFreq}%</div>
            </div>

            <div style={{ padding: 12, background: 'rgba(163,230,53,0.06)', borderRadius: 8, border: '1px solid rgba(163,230,53,0.12)', marginBottom: 12 }}>
              <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.8)', lineHeight: 1.6 }}>{spot.reasoning}</div>
            </div>

            <div style={{ textAlign: 'center' }}>
              <button onClick={nextSpot} style={{ padding: '10px 28px', borderRadius: 8, border: 'none', fontSize: 14, fontWeight: 700, cursor: 'pointer', background: '#a3e635', color: '#000' }}>Next Spot →</button>
            </div>
          </div>
        )}
      </div>
    );
  } catch (err) {
    return <div style={{ padding: 20, color: '#ef4444' }}>River Probe Trainer failed to load: {err.message}</div>;
  }
}

export default RiverProbeTrainer;
