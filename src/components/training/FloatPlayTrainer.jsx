/**
 * FloatPlayTrainer — GTO Wizard-Style Float & Delayed C-Bet Trainer
 * ●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●
 * Train floating (calling flop to take pot on later streets) and delayed
 * c-bet strategies. Covers position, board texture, and turn/river play.
 */
import React, { useState, useMemo } from 'react';

const FLOAT_SPOTS = [
  {
    id: 1, name: 'IP Float vs C-Bet',
    board: 'Q♦ 7♠ 3♣', turn: '2♥', position: 'BTN vs BB',
    floatFreq: 35, delayedCbetFreq: 65,
    handExamples: [
      { hand: 'A♠ 5♠', action: 'Float Flop → Bet Turn', reasoning: 'Two overcards + backdoor. Float flop, stab turn when BB checks.' },
      { hand: 'K♣ T♣', action: 'Float Flop → Bet Turn', reasoning: 'Overcards with gutshot to Broadway. Excellent float candidate.' },
      { hand: '9♥ 8♥', action: 'Fold Flop', reasoning: 'No draws, no overcards. Clean fold — poor float candidate.' },
      { hand: 'J♦ T♦', action: 'Float Flop → Check Turn', reasoning: 'Gutshot only. Float flop if sizing is small, give up on brick turn.' },
    ],
    strategy: 'Dry Q-high board. BB c-bets wide at 33%. Float in position with overcards, backdoor draws, and gutshots. Bet turn when checked to — villain folds 60%+.',
    keyPrinciples: ['Position is essential for floating', 'Need equity or removal on later streets', 'Small flop bets = wider float range'],
  },
  {
    id: 2, name: 'Delayed C-Bet IP',
    board: 'J♥ 8♥ 5♦', turn: 'K♠', position: 'CO vs BB',
    floatFreq: 0, delayedCbetFreq: 55,
    handExamples: [
      { hand: 'A♠ K♦', action: 'Check Flop → Bet Turn K', reasoning: 'Turned top pair. Delayed c-bet for value on king turn.' },
      { hand: 'Q♣ Q♠', action: 'Check Flop → Bet Turn', reasoning: 'Overpair checked back. King turn doesn\'t hurt — bet for value.' },
      { hand: 'A♥ 2♥', action: 'Check Flop → Bet Turn', reasoning: 'Nut flush draw checked back. Turn brick — delayed bluff with equity.' },
      { hand: '6♣ 4♣', action: 'Check Flop → Check Turn', reasoning: 'No equity, no draws. Give up — don\'t bluff without backup plan.' },
    ],
    strategy: 'Wet flop favoring BB → check range IP. King turn shifts advantage back to IP (more Kx combos). Delayed c-bet ~55% on favorable turn cards.',
    keyPrinciples: ['Check flop on wet boards in position', 'Bet turn when card shifts range advantage', 'Keep delayed bluffs equity-backed'],
  },
  {
    id: 3, name: 'OOP Float (Probe Bet)',
    board: 'T♠ 6♦ 2♣', turn: '9♥', position: 'BB vs BTN',
    floatFreq: 28, delayedCbetFreq: 0,
    handExamples: [
      { hand: 'J♥ 8♥', action: 'Call Flop → Probe Turn', reasoning: 'Turned OESD. Probe bet to take initiative and semi-bluff.' },
      { hand: 'A♦ 4♦', action: 'Call Flop → Probe Turn', reasoning: 'Overcards + backdoor diamond draw. Probe to fold out weak BTN checks.' },
      { hand: '7♣ 5♣', action: 'Call Flop → Check Turn', reasoning: 'Gutshot but minimal equity. Call small flop bet, check-fold turn.' },
      { hand: 'K♠ 9♠', action: 'Call Flop → Probe Turn', reasoning: 'Turned second pair. Good probe candidate — BTN checked back weakness.' },
    ],
    strategy: 'BTN checks back flop showing weakness. BB probe bets ~28% of turn cards. 9♥ connects with BB range (T9, 98, J8). Probe with made hands and draws.',
    keyPrinciples: ['Probe when IP shows weakness by checking', 'Connected turn cards favor BB range', 'Size 50-67% for probes'],
  },
  {
    id: 4, name: 'Triple Barrel Bluff',
    board: 'A♠ 9♦ 4♣', turn: '6♥', river: 'K♣', position: 'BTN vs BB',
    floatFreq: 0, delayedCbetFreq: 0,
    handExamples: [
      { hand: 'Q♠ J♠', action: 'Bet Flop → Bet Turn → Bet River', reasoning: 'Overcards + gutshot. A and K on board block villain\'s calling range. Triple barrel.' },
      { hand: 'T♣ 8♣', action: 'Bet Flop → Bet Turn → Check River', reasoning: 'Gutshot on flop/turn, missed river. Give up — K completes draws, less fold equity.' },
      { hand: '5♠ 3♠', action: 'Bet Flop → Check Turn', reasoning: 'Backdoor only. One barrel enough, give up on blank turn.' },
      { hand: 'Q♥ T♥', action: 'Bet Flop → Bet Turn → Bet River', reasoning: 'Overcards, QJ gutshot. K river is great bluff card — rep AK, KK. Triple barrel.' },
    ],
    strategy: 'Ace-high board ideal for triple barrel. BTN has more Ax and Kx. King river is excellent barrel card — represents AK, sets. Villain folds one pair.',
    keyPrinciples: ['Triple barrel needs credible story', 'Scare cards (A, K) enable bluffs', 'Check bluffs with zero equity on turn', 'River sizing 67-100% for max fold equity'],
  },
];

function FloatPlayTrainer() {
  const [selectedId, setSelectedId] = useState(1);
  const [expandedHand, setExpandedHand] = useState(null);

  const spot = useMemo(() => FLOAT_SPOTS.find(s => s.id === selectedId), [selectedId]);

  try {
    return (
      <div style={{ padding: 20, background: 'rgba(0,0,0,0.3)', borderRadius: 12, border: '1px solid rgba(255,255,255,0.08)' }}>
        <h3 style={{ margin: '0 0 16px 0', fontSize: 18, color: '#0ea5e9' }}>Float & Probe Trainer</h3>

        <div style={{ display: 'flex', gap: 6, marginBottom: 16, flexWrap: 'wrap' }}>
          {FLOAT_SPOTS.map(s => (
            <button key={s.id} onClick={() => { setSelectedId(s.id); setExpandedHand(null); }} style={{
              padding: '6px 12px', borderRadius: 6, fontSize: 12, fontWeight: 600, cursor: 'pointer',
              background: selectedId === s.id ? '#0ea5e9' : 'rgba(255,255,255,0.06)',
              color: selectedId === s.id ? '#000' : 'rgba(255,255,255,0.7)', border: 'none',
            }}>{s.name}</button>
          ))}
        </div>

        {/* Board */}
        <div style={{ textAlign: 'center', padding: 16, background: 'rgba(14,165,233,0.06)', borderRadius: 10, border: '1px solid rgba(14,165,233,0.15)', marginBottom: 16 }}>
          <div style={{ fontSize: 28, fontWeight: 900, color: '#fff', letterSpacing: 6 }}>
            {spot.board}{spot.turn ? ` ${spot.turn}` : ''}{spot.river ? ` ${spot.river}` : ''}
          </div>
          <div style={{ display: 'flex', justifyContent: 'center', gap: 16, fontSize: 12, color: 'rgba(255,255,255,0.6)', marginTop: 6 }}>
            <span>{spot.position}</span>
            {spot.floatFreq > 0 && <span>Float: <span style={{ color: '#0ea5e9', fontWeight: 700 }}>{spot.floatFreq}%</span></span>}
            {spot.delayedCbetFreq > 0 && <span>Delayed C-Bet: <span style={{ color: '#10b981', fontWeight: 700 }}>{spot.delayedCbetFreq}%</span></span>}
          </div>
        </div>

        {/* Strategy */}
        <div style={{ padding: 12, background: 'rgba(255,255,255,0.03)', borderRadius: 8, marginBottom: 16 }}>
          <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.8)', lineHeight: 1.6 }}>{spot.strategy}</div>
        </div>

        {/* Hand Examples */}
        <div style={{ marginBottom: 16 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: '#0ea5e9', marginBottom: 8 }}>Hand Examples</div>
          {spot.handExamples.map((ex, i) => (
            <div key={i} onClick={() => setExpandedHand(expandedHand === i ? null : i)} style={{
              padding: 10, marginBottom: 6, borderRadius: 8, cursor: 'pointer',
              background: expandedHand === i ? 'rgba(14,165,233,0.08)' : 'rgba(255,255,255,0.03)',
              border: `1px solid ${expandedHand === i ? 'rgba(14,165,233,0.2)' : 'rgba(255,255,255,0.06)'}`,
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ fontSize: 14, fontWeight: 700, color: '#fff', fontFamily: 'monospace' }}>{ex.hand}</span>
                <span style={{ fontSize: 12, fontWeight: 600, color: ex.action.includes('Fold') || ex.action.includes('Give up') ? '#ef4444' : ex.action.includes('Check Turn') || ex.action.includes('check-fold') ? '#f59e0b' : '#10b981' }}>
                  {ex.action}
                </span>
              </div>
              {expandedHand === i && (
                <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.7)', marginTop: 6, lineHeight: 1.5 }}>{ex.reasoning}</div>
              )}
            </div>
          ))}
        </div>

        {/* Key Principles */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          {spot.keyPrinciples.map((p, i) => (
            <div key={i} style={{ fontSize: 12, color: 'rgba(255,255,255,0.6)', paddingLeft: 12, position: 'relative' }}>
              <span style={{ position: 'absolute', left: 0, color: '#0ea5e9' }}>•</span>{p}
            </div>
          ))}
        </div>
      </div>
    );
  } catch (err) {
    return <div style={{ padding: 20, color: '#ef4444' }}>Float Trainer failed to load: {err.message}</div>;
  }
}

export default FloatPlayTrainer;
