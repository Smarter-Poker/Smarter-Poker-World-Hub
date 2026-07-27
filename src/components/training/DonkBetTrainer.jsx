/**
 * DonkBetTrainer — GTO Wizard-Style Donk Bet Strategy Trainer
 * ═══════════════════════════════════════════════════════════════════════════
 * Learn when donk betting (leading into the previous street aggressor)
 * is a valid GTO play. Interactive quiz with EV breakdowns.
 */
import React, { useState } from 'react';

const SPOTS = [
  {
    id: 1, board: '8♣ 7♦ 6♠', hero: '5♠ 4♠', position: 'BB vs BTN (SRP)',
    street: 'Flop', context: 'BTN opened, you called BB. BTN c-bets 33%, you called. Turn: 3♥. Check or donk?',
    correct: 'donk', action: 'Donk 50%',
    reasoning: 'You turned the nut straight on a board where BTN checked back turn. The board heavily favors BB range (connected cards). Donk betting is GTO here — you have more straights and two pairs than BTN.',
    donkFreq: 35, checkFreq: 65,
    evDonk: '+3.8 bb', evCheck: '+1.9 bb',
  },
  {
    id: 2, board: 'A♠ K♦ 7♣', hero: 'Q♠ J♠', position: 'BB vs CO (SRP)',
    street: 'Flop', context: 'CO opened, you called BB. Flop is AK7r. Donk or check to CO?',
    correct: 'check', action: 'Check (always)',
    reasoning: 'AK7 rainbow heavily favors CO opening range — they have all the AK, AA, KK combos. BB should almost never donk on A-high or K-high boards. Check and let CO c-bet, then decide.',
    donkFreq: 2, checkFreq: 98,
    evDonk: '-1.2 bb', evCheck: '+0.3 bb',
  },
  {
    id: 3, board: '6♥ 5♥ 3♣', hero: '6♣ 5♣', position: 'BB vs BTN (SRP)',
    street: 'Flop', context: 'BTN opened, you called BB with 65o. Flop 653. Donk or check?',
    correct: 'donk', action: 'Donk 75%',
    reasoning: 'Low connected flop strongly favors BB range. You have top two pair. BTN will check back many overpairs and AK/AQ here. Donk to build pot — BTN often has nothing and wont bet.',
    donkFreq: 40, checkFreq: 60,
    evDonk: '+4.2 bb', evCheck: '+2.8 bb',
  },
  {
    id: 4, board: 'Q♠ T♥ 4♦', hero: 'A♣ 4♣', position: 'BB vs MP (SRP)',
    street: 'Turn', context: 'MP opened, you called BB. MP c-bet flop, you called. Turn 4♦ giving you bottom pair. MP checks turn. River 9♠. Donk?',
    correct: 'check', action: 'Check (showdown value)',
    reasoning: 'Bottom pair has showdown value but is not strong enough to donk for value on this board. MP checking turn means they likely have a medium-strength hand. Check and realize equity.',
    donkFreq: 5, checkFreq: 95,
    evDonk: '-0.8 bb', evCheck: '+0.6 bb',
  },
  {
    id: 5, board: '9♣ 8♣ 2♦', hero: 'T♣ 7♣', position: 'BB vs CO (SRP)',
    street: 'Turn', context: 'CO opened, you called BB. CO c-bet flop, you called with OESD + flush draw. Turn: 5♣ completing your flush. CO checks. Donk?',
    correct: 'donk', action: 'Donk 67%',
    reasoning: 'You made the flush on a board that favors BB range. CO checking turn indicates medium strength. Donk bet to extract value — if you check back, river action may not develop.',
    donkFreq: 55, checkFreq: 45,
    evDonk: '+5.1 bb', evCheck: '+2.4 bb',
  },
  {
    id: 6, board: 'J♥ T♠ 2♣', hero: 'K♠ Q♠', position: 'BB vs UTG (SRP)',
    street: 'Flop', context: 'UTG opened, you called BB with KQs. Flop JT2. Donk or check?',
    correct: 'check', action: 'Check (let UTG c-bet)',
    reasoning: 'JT2 is a board where UTG range is strong (overpairs, AJ, KJ, QJ). KQ has a gutshot but donking into UTGs range advantage is -EV. Check, and if UTG bets, you can call with your draw.',
    donkFreq: 3, checkFreq: 97,
    evDonk: '-0.5 bb', evCheck: '+0.7 bb',
  },
];

function DonkBetTrainer() {
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
          <h3 style={{ margin: 0, fontSize: 18, color: '#f97316' }}>Donk Bet Trainer</h3>
          <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.5)' }}>{stats.correct}/{stats.total} ({accuracy}%) • Spot {currentIdx + 1}/{SPOTS.length}</span>
        </div>

        {/* Scenario */}
        <div style={{ padding: 14, background: 'rgba(249,115,22,0.06)', borderRadius: 10, border: '1px solid rgba(249,115,22,0.15)', marginBottom: 16, textAlign: 'center' }}>
          <div style={{ fontSize: 26, fontWeight: 900, color: '#fff', letterSpacing: 4, marginBottom: 6 }}>{spot.board}</div>
          <div style={{ fontSize: 18, fontWeight: 700, color: '#f97316', marginBottom: 6 }}>Hero: {spot.hero}</div>
          <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.6)', marginBottom: 4 }}>{spot.position} • {spot.street}</div>
          <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.5)', lineHeight: 1.5, maxWidth: 400, margin: '0 auto' }}>{spot.context}</div>
        </div>

        {/* Decision */}
        {!userChoice && (
          <div style={{ display: 'flex', gap: 12, justifyContent: 'center', marginBottom: 16 }}>
            <button onClick={() => handleChoice('donk')} style={{ padding: '14px 32px', borderRadius: 10, border: 'none', fontSize: 15, fontWeight: 700, cursor: 'pointer', background: '#f97316', color: '#fff', flex: 1, maxWidth: 180 }}>Donk Bet</button>
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
              <div style={{ flex: 1, padding: 10, background: 'rgba(249,115,22,0.06)', borderRadius: 8, textAlign: 'center', border: spot.correct === 'donk' ? '1px solid rgba(249,115,22,0.3)' : '1px solid rgba(255,255,255,0.06)' }}>
                <div style={{ fontSize: 16, fontWeight: 800, color: '#f97316' }}>{spot.evDonk}</div>
                <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.4)' }}>EV of Donk</div>
              </div>
              <div style={{ flex: 1, padding: 10, background: 'rgba(107,114,128,0.06)', borderRadius: 8, textAlign: 'center', border: spot.correct === 'check' ? '1px solid rgba(107,114,128,0.3)' : '1px solid rgba(255,255,255,0.06)' }}>
                <div style={{ fontSize: 16, fontWeight: 800, color: '#9ca3af' }}>{spot.evCheck}</div>
                <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.4)' }}>EV of Check</div>
              </div>
            </div>

            {/* Frequency Bar */}
            <div style={{ display: 'flex', height: 20, borderRadius: 6, overflow: 'hidden', marginBottom: 12 }}>
              <div style={{ width: `${spot.donkFreq}%`, background: '#f97316', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, fontWeight: 700, color: '#fff' }}>Donk {spot.donkFreq}%</div>
              <div style={{ width: `${spot.checkFreq}%`, background: '#4b5563', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, fontWeight: 700, color: '#fff' }}>Check {spot.checkFreq}%</div>
            </div>

            <div style={{ padding: 12, background: 'rgba(249,115,22,0.06)', borderRadius: 8, border: '1px solid rgba(249,115,22,0.12)', marginBottom: 12 }}>
              <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.8)', lineHeight: 1.6 }}>{spot.reasoning}</div>
            </div>

            <div style={{ textAlign: 'center' }}>
              <button onClick={nextSpot} style={{ padding: '10px 28px', borderRadius: 8, border: 'none', fontSize: 14, fontWeight: 700, cursor: 'pointer', background: '#f97316', color: '#fff' }}>Next Spot →</button>
            </div>
          </div>
        )}
      </div>
    );
  } catch (err) {
    return <div style={{ padding: 20, color: '#ef4444' }}>Donk Bet Trainer failed to load: {err.message}</div>;
  }
}

export default DonkBetTrainer;
