/**
 * OverbetStrategyTrainer — When to Overbet (>100% Pot)
 * ═══════════════════════════════════════════════════════════════════════════
 * Train overbet spots — when GTO prescribes betting more than pot.
 * Interactive scenarios with range analysis and EV comparisons.
 */
import React, { useState } from 'react';

const SPOTS = [
  {
    id: 1, board: 'A♠ K♦ 7♣ 2♥ 3♦', hero: 'A♣ A♥', position: 'BTN vs BB',
    street: 'River', pot: 20, sizing: '150% pot (30 bb)',
    correct: 'overbet',
    reasoning: 'You have the nuts (set of aces) on a dry board. BB is capped — they would have 3-bet AA/KK pre. Their best hand is AK (two pair). Overbet polarizes to get max value from strong-but-not-nuts hands.',
    condition: 'Nut advantage + opponent is capped',
    evOverbet: '+8.2 bb', evNormal: '+5.1 bb',
    whenToOverbet: true,
  },
  {
    id: 2, board: 'J♥ T♥ 4♣ 2♦ 8♣', hero: 'K♥ Q♥', position: 'CO vs BB',
    street: 'River', pot: 18, sizing: '50% pot (9 bb)',
    correct: 'normal',
    reasoning: 'You have a missed flush draw. Board is not great for overbetting — many draws bricked. BB can have plenty of Jx, Tx, two pairs. A normal-sized bluff is better here because overbetting risks too much with a range that doesnt have enough nutted hands.',
    condition: 'Bluff without nut advantage',
    evOverbet: '-3.4 bb', evNormal: '+1.2 bb',
    whenToOverbet: false,
  },
  {
    id: 3, board: 'Q♣ 8♣ 3♦ | K♠', hero: 'K♣ K♦', position: 'BTN vs BB',
    street: 'Turn', pot: 14, sizing: '120% pot (16.8 bb)',
    correct: 'overbet',
    reasoning: 'You turned top set. BTN has a massive nut advantage on this K turn — all the KK, KQ, AK combos. BB is capped (no KK/AK which 3-bet pre). Overbet to leverage nut advantage and deny equity to flush draws.',
    condition: 'Nut advantage + draws to charge',
    evOverbet: '+7.5 bb', evNormal: '+4.8 bb',
    whenToOverbet: true,
  },
  {
    id: 4, board: '9♠ 6♠ 2♣ T♦ J♠', hero: 'A♠ 4♠', position: 'CO vs BB',
    street: 'River', pot: 22, sizing: '200% pot (44 bb)',
    correct: 'overbet',
    reasoning: 'Nut flush on a completed flush board. This is the PERFECT overbet spot — you have the stone nuts and opponent has many flushes/straights that cant fold. The bigger you bet, the more they have to pay with their second-best hands.',
    condition: 'Stone nuts on scary board',
    evOverbet: '+12.1 bb', evNormal: '+6.8 bb',
    whenToOverbet: true,
  },
  {
    id: 5, board: 'A♥ Q♦ 7♣ 5♠ 3♥', hero: 'J♦ T♦', position: 'BTN vs BB',
    street: 'River', pot: 16, sizing: '33% pot (5.3 bb)',
    correct: 'normal',
    reasoning: 'Complete air on A-high board. You dont have nut advantage here — BBs range has AQ, A7, A5, sets. Without nutted hands backing up your overbets, you should use a smaller sizing where your bluffs risk less.',
    condition: 'No nut advantage to support overbet bluffs',
    evOverbet: '-5.8 bb', evNormal: '-0.3 bb',
    whenToOverbet: false,
  },
  {
    id: 6, board: '5♣ 4♣ 2♦ | A♣', hero: 'A♦ A♠', position: 'BTN vs BB',
    street: 'Turn', pot: 12, sizing: '130% pot (15.6 bb)',
    correct: 'overbet',
    reasoning: 'Top set on a board where the A brings a flush draw and a potential wheel. BTN has all the strong aces and sets. Overbet to charge club draws and get max value from smaller aces and two pairs.',
    condition: 'Nut advantage + equity denial',
    evOverbet: '+6.9 bb', evNormal: '+4.2 bb',
    whenToOverbet: true,
  },
];

function OverbetStrategyTrainer() {
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
          <h3 style={{ margin: 0, fontSize: 18, color: '#f97316' }}>Overbet Trainer</h3>
          <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.5)' }}>{stats.correct}/{stats.total} ({accuracy}%)</span>
        </div>

        <div style={{ padding: 14, background: 'rgba(249,115,22,0.06)', borderRadius: 10, border: '1px solid rgba(249,115,22,0.15)', marginBottom: 16, textAlign: 'center' }}>
          <div style={{ fontSize: 24, fontWeight: 900, color: '#fff', letterSpacing: 3, marginBottom: 6 }}>{spot.board}</div>
          <div style={{ fontSize: 16, fontWeight: 700, color: '#f97316', marginBottom: 4 }}>Hero: {spot.hero}</div>
          <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.5)', marginBottom: 4 }}>{spot.position} | {spot.street} | Pot: {spot.pot} bb</div>
          <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.6)' }}>Should you overbet or use normal sizing?</div>
        </div>

        {!choice && (
          <div style={{ display: 'flex', gap: 12, justifyContent: 'center', marginBottom: 16 }}>
            <button onClick={() => handleChoice('overbet')} style={{ padding: '14px 32px', borderRadius: 10, border: 'none', fontSize: 15, fontWeight: 700, cursor: 'pointer', background: '#f97316', color: '#fff', flex: 1, maxWidth: 180 }}>Overbet!</button>
            <button onClick={() => handleChoice('normal')} style={{ padding: '14px 32px', borderRadius: 10, border: 'none', fontSize: 15, fontWeight: 700, cursor: 'pointer', background: '#6b7280', color: '#fff', flex: 1, maxWidth: 180 }}>Normal Size</button>
          </div>
        )}

        {choice && (
          <div>
            <div style={{ padding: 10, borderRadius: 8, marginBottom: 10, textAlign: 'center', background: choice === spot.correct ? 'rgba(16,185,129,0.1)' : 'rgba(239,68,68,0.1)', border: `1px solid ${choice === spot.correct ? 'rgba(16,185,129,0.3)' : 'rgba(239,68,68,0.3)'}` }}>
              <span style={{ fontSize: 16, fontWeight: 800, color: choice === spot.correct ? '#10b981' : '#ef4444' }}>
                {choice === spot.correct ? '✓ Correct!': `✕ Optimal: ${spot.correct === 'overbet'? 'OVERBET': 'Normal sizing'}`}
              </span>
            </div>
            <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
              <div style={{ flex: 1, padding: 8, borderRadius: 8, textAlign: 'center', background: spot.whenToOverbet ? 'rgba(249,115,22,0.08)' : 'rgba(255,255,255,0.03)', border: spot.whenToOverbet ? '1px solid rgba(249,115,22,0.2)' : '1px solid rgba(255,255,255,0.04)' }}>
                <div style={{ fontSize: 14, fontWeight: 800, color: '#f97316' }}>{spot.evOverbet}</div>
                <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.4)' }}>EV Overbet ({spot.sizing})</div>
              </div>
              <div style={{ flex: 1, padding: 8, borderRadius: 8, textAlign: 'center', background: !spot.whenToOverbet ? 'rgba(107,114,128,0.08)' : 'rgba(255,255,255,0.03)', border: !spot.whenToOverbet ? '1px solid rgba(107,114,128,0.2)' : '1px solid rgba(255,255,255,0.04)' }}>
                <div style={{ fontSize: 14, fontWeight: 800, color: '#9ca3af' }}>{spot.evNormal}</div>
                <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.4)' }}>EV Normal</div>
              </div>
            </div>
            <div style={{ padding: 10, background: 'rgba(249,115,22,0.06)', borderRadius: 8, border: '1px solid rgba(249,115,22,0.12)', marginBottom: 8 }}>
              <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.8)', lineHeight: 1.6, marginBottom: 6 }}>{spot.reasoning}</div>
              <div style={{ fontSize: 11, fontWeight: 700, color: '#f59e0b' }}>Key: {spot.condition}</div>
            </div>
            <div style={{ textAlign: 'center' }}>
              <button onClick={next} style={{ padding: '10px 28px', borderRadius: 8, border: 'none', fontSize: 14, fontWeight: 700, cursor: 'pointer', background: '#f97316', color: '#fff' }}>Next Spot →</button>
            </div>
          </div>
        )}
      </div>
    );
  } catch (err) {
    return <div style={{ padding: 20, color: '#ef4444' }}>Overbet Trainer failed to load: {err.message}</div>;
  }
}

export default OverbetStrategyTrainer;
