/**
 * RiverBluffCatcherTrainer — River Bluff-Catching Decisions
 * ═══════════════════════════════════════════════════════════════════════════
 * Train optimal river call/fold decisions when facing bets.
 * Uses pot odds, blockers, and range analysis.
 */
import React, { useState } from 'react';

const SPOTS = [
  {
    id: 1, board: 'K♠ 9♥ 4♣ 7♦ 2♠', hero: 'A♣ K♥', position: 'BB vs BTN',
    action: 'BTN bets 75% pot on river',
    pot: 15, bet: 11.25, heroRange: 'Top pair top kicker',
    correct: 'call',
    potOdds: '30%', mdf: '57%',
    reasoning: 'TPTK is near the top of your range. You need to defend 57% vs this size. AK easily makes the cut — villain has many missed draws (flush draws, straight draws) that turned into bluffs.',
    blockers: 'You block AK (reduces villains value combos) but dont block missed draws.',
    evCall: '+2.8 bb', evFold: '0 bb',
  },
  {
    id: 2, board: 'Q♥ J♥ 5♣ 8♦ 3♥', hero: 'A♠ Q♣', position: 'CO vs BTN',
    action: 'BTN bets 125% pot on river (flush completes)',
    pot: 20, bet: 25, heroRange: 'Top pair, no heart',
    correct: 'fold',
    potOdds: '36%', mdf: '44%',
    reasoning: 'Three hearts on board — flush completes. BTN has many flush combos. Your AQ has no heart blocker. Large overbet sizing is polarized to nutted hands + bluffs, and villain has way more flushes than bluffs here.',
    blockers: 'No heart blocker = bad. You dont block any flushes. Fold is correct despite having top pair.',
    evCall: '-4.2 bb', evFold: '0 bb',
  },
  {
    id: 3, board: 'T♣ 8♣ 3♦ K♠ 6♣', hero: 'K♦ J♦', position: 'BB vs CO',
    action: 'CO bets 50% pot on river (flush completes)',
    pot: 18, bet: 9, heroRange: 'Top pair, no club',
    correct: 'call',
    potOdds: '25%', mdf: '67%',
    reasoning: 'Small sizing on a scary river. CO would bet bigger with the flush — this small bet looks like thin value or a blocker bet. You only need to be right 25% of the time. KJ is strong enough to call at this price.',
    blockers: 'You block Kx value hands. Small sizing suggests villain is not confident = more bluffs in range.',
    evCall: '+1.5 bb', evFold: '0 bb',
  },
  {
    id: 4, board: 'A♠ 7♠ 2♦ 9♣ J♠', hero: '8♠ 8♥', position: 'BTN vs BB',
    action: 'BB check-raises river all-in (2x pot)',
    pot: 24, bet: 48, heroRange: 'Underpair to board',
    correct: 'fold',
    potOdds: '40%', mdf: '33%',
    reasoning: 'Check-raise all-in on a 3-flush board is extremely polarized. Your 88 is near the bottom of your range — you have better hands to call with (Ax, Jx, flushes). No need to bluff-catch with underpair when you have stronger candidates.',
    blockers: '8♠ blocks one flush combo, but your hand is too weak. Use better hands as bluff catchers.',
    evCall: '-8.5 bb', evFold: '0 bb',
  },
  {
    id: 5, board: '9♥ 6♥ 3♣ T♦ Q♣', hero: 'T♥ 9♣', position: 'BB vs BTN',
    action: 'BTN bets 66% pot on river',
    pot: 16, bet: 10.5, heroRange: 'Two pair',
    correct: 'call',
    potOdds: '28%', mdf: '60%',
    reasoning: 'Two pair is very strong on this board. The Q completing on river doesnt hit many of villains value hands except QT/QQ. Many draws bricked (hearts, J8, 87). Your hand is comfortably in the top of your defending range.',
    blockers: 'You block T9 combos villain could have. Two pair is too strong to fold vs 66% pot.',
    evCall: '+4.1 bb', evFold: '0 bb',
  },
  {
    id: 6, board: 'K♣ Q♦ 7♣ 4♠ A♣', hero: 'Q♠ J♠', position: 'CO vs BTN',
    action: 'BTN bets 100% pot on river (A and flush complete)',
    pot: 22, bet: 22, heroRange: 'Second pair with J kicker',
    correct: 'fold',
    potOdds: '33%', mdf: '50%',
    reasoning: 'Ace on river + flush completing = two big draws got there. BTN has lots of Ax, flush combos. Your QJ is middle of your range at best, and you have better candidates to call with (KQ, AQ, flushes). Fold the mediocre hands.',
    blockers: 'Q blocks some KQ/QQ but villain has Ax and flushes. Not enough blocker value to justify calling.',
    evCall: '-3.9 bb', evFold: '0 bb',
  },
];

function RiverBluffCatcherTrainer() {
  const [idx, setIdx] = useState(0);
  const [choice, setChoice] = useState(null);
  const [stats, setStats] = useState({ correct: 0, total: 0 });

  const spot = SPOTS[idx];
  const accuracy = stats.total > 0 ? Math.round((stats.correct / stats.total) * 100) : 0;

  const handleChoice = (c) => {
    setChoice(c);
    setStats(prev => ({ correct: prev.correct + (c === spot.correct ? 1 : 0), total: prev.total + 1 }));
  };

  const next = () => { setIdx((idx + 1) % SPOTS.length); setChoice(null); };

  try {
    return (
      <div style={{ padding: 20, background: 'rgba(0,0,0,0.3)', borderRadius: 12, border: '1px solid rgba(255,255,255,0.08)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <h3 style={{ margin: 0, fontSize: 18, color: '#ec4899' }}>River Bluff Catcher</h3>
          <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.5)' }}>{stats.correct}/{stats.total} ({accuracy}%)</span>
        </div>

        {/* Scenario */}
        <div style={{ padding: 14, background: 'rgba(236,72,153,0.06)', borderRadius: 10, border: '1px solid rgba(236,72,153,0.15)', marginBottom: 16, textAlign: 'center' }}>
          <div style={{ fontSize: 24, fontWeight: 900, color: '#fff', letterSpacing: 3, marginBottom: 6 }}>{spot.board}</div>
          <div style={{ fontSize: 16, fontWeight: 700, color: '#ec4899', marginBottom: 4 }}>Hero: {spot.hero}</div>
          <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.5)', marginBottom: 4 }}>{spot.position} | {spot.heroRange}</div>
          <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.7)', lineHeight: 1.5 }}>{spot.action}</div>
        </div>

        {/* Pot odds info */}
        <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
          <div style={{ flex: 1, padding: 8, background: 'rgba(255,255,255,0.03)', borderRadius: 8, textAlign: 'center' }}>
            <div style={{ fontSize: 9, color: 'rgba(255,255,255,0.4)' }}>Pot</div>
            <div style={{ fontSize: 14, fontWeight: 800, color: '#fff' }}>{spot.pot} bb</div>
          </div>
          <div style={{ flex: 1, padding: 8, background: 'rgba(255,255,255,0.03)', borderRadius: 8, textAlign: 'center' }}>
            <div style={{ fontSize: 9, color: 'rgba(255,255,255,0.4)' }}>Bet</div>
            <div style={{ fontSize: 14, fontWeight: 800, color: '#ef4444' }}>{spot.bet} bb</div>
          </div>
          <div style={{ flex: 1, padding: 8, background: 'rgba(255,255,255,0.03)', borderRadius: 8, textAlign: 'center' }}>
            <div style={{ fontSize: 9, color: 'rgba(255,255,255,0.4)' }}>Pot Odds</div>
            <div style={{ fontSize: 14, fontWeight: 800, color: '#3b82f6' }}>{spot.potOdds}</div>
          </div>
          <div style={{ flex: 1, padding: 8, background: 'rgba(255,255,255,0.03)', borderRadius: 8, textAlign: 'center' }}>
            <div style={{ fontSize: 9, color: 'rgba(255,255,255,0.4)' }}>MDF</div>
            <div style={{ fontSize: 14, fontWeight: 800, color: '#f59e0b' }}>{spot.mdf}</div>
          </div>
        </div>

        {!choice && (
          <div style={{ display: 'flex', gap: 12, justifyContent: 'center', marginBottom: 16 }}>
            <button onClick={() => handleChoice('call')} style={{ padding: '14px 40px', borderRadius: 10, border: 'none', fontSize: 15, fontWeight: 700, cursor: 'pointer', background: '#10b981', color: '#fff', flex: 1, maxWidth: 180 }}>Call</button>
            <button onClick={() => handleChoice('fold')} style={{ padding: '14px 40px', borderRadius: 10, border: 'none', fontSize: 15, fontWeight: 700, cursor: 'pointer', background: '#ef4444', color: '#fff', flex: 1, maxWidth: 180 }}>Fold</button>
          </div>
        )}

        {choice && (
          <div>
            <div style={{ padding: 10, borderRadius: 8, marginBottom: 10, textAlign: 'center', background: choice === spot.correct ? 'rgba(16,185,129,0.1)' : 'rgba(239,68,68,0.1)', border: `1px solid ${choice === spot.correct ? 'rgba(16,185,129,0.3)' : 'rgba(239,68,68,0.3)'}` }}>
              <span style={{ fontSize: 16, fontWeight: 800, color: choice === spot.correct ? '#10b981' : '#ef4444' }}>
                {choice === spot.correct ? '✓ Correct!': `✕ Optimal: ${spot.correct.toUpperCase()}`}
              </span>
            </div>
            <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
              <div style={{ flex: 1, padding: 8, borderRadius: 8, textAlign: 'center', background: 'rgba(16,185,129,0.06)' }}>
                <div style={{ fontSize: 14, fontWeight: 800, color: '#10b981' }}>{spot.evCall}</div>
                <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.4)' }}>EV Call</div>
              </div>
              <div style={{ flex: 1, padding: 8, borderRadius: 8, textAlign: 'center', background: 'rgba(239,68,68,0.06)' }}>
                <div style={{ fontSize: 14, fontWeight: 800, color: '#ef4444' }}>{spot.evFold}</div>
                <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.4)' }}>EV Fold</div>
              </div>
            </div>
            <div style={{ padding: 10, background: 'rgba(236,72,153,0.06)', borderRadius: 8, border: '1px solid rgba(236,72,153,0.12)', marginBottom: 8 }}>
              <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.8)', lineHeight: 1.6, marginBottom: 6 }}>{spot.reasoning}</div>
              <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.5)', fontStyle: 'italic' }}>{spot.blockers}</div>
            </div>
            <div style={{ textAlign: 'center' }}>
              <button onClick={next} style={{ padding: '10px 28px', borderRadius: 8, border: 'none', fontSize: 14, fontWeight: 700, cursor: 'pointer', background: '#ec4899', color: '#fff' }}>Next Spot →</button>
            </div>
          </div>
        )}
      </div>
    );
  } catch (err) {
    return <div style={{ padding: 20, color: '#ef4444' }}>River Bluff Catcher failed to load: {err.message}</div>;
  }
}

export default RiverBluffCatcherTrainer;
