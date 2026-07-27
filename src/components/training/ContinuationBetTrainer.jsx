/**
 * ContinuationBetTrainer — GTO Wizard-Style C-Bet Strategy Trainer
 * ═══════════════════════════════════════════════════════════════════════════
 * Train c-bet decision making across flop textures, positions, and SPR levels.
 * Shows optimal c-bet frequency, sizing, and range composition.
 */
import React, { useState, useMemo } from 'react';

const SCENARIOS = [
  {
    id: 1, name: 'Dry Ace-High', board: 'A♠ 7♦ 2♣', position: 'BTN vs BB', spr: 4.2,
    optimalCbet: 85, optimalSize: '33%', rangeAdvantage: 'IP',
    cbetBreakdown: { bet33: 62, bet67: 23, check: 15 },
    reasoning: 'Strong range advantage on ace-high dry board. High frequency small c-bet exploits BB wide defend range. Ace blockers give IP significant equity edge.',
    keyHands: { valueBet: 'Top pair+, strong Ax', bluff: 'Backdoor draws, gutshots', check: 'Weak pairs, no equity' },
  },
  {
    id: 2, name: 'Wet Two-Tone', board: 'J♥ T♥ 6♠', position: 'CO vs BB', spr: 5.1,
    optimalCbet: 52, optimalSize: '67%', rangeAdvantage: 'Slight IP',
    cbetBreakdown: { bet33: 15, bet67: 37, check: 48 },
    reasoning: 'Connected two-tone board reduces range advantage. BB has more suited connectors. Use larger sizing with polarized range — strong hands and draws.',
    keyHands: { valueBet: 'Two pair+, strong draws', bluff: 'Combo draws, Qx gutshots', check: 'Weak one-pair, air' },
  },
  {
    id: 3, name: 'Monotone Low', board: '8♣ 5♣ 3♣', position: 'UTG vs BB', spr: 6.0,
    optimalCbet: 28, optimalSize: '33%', rangeAdvantage: 'Neutral',
    cbetBreakdown: { bet33: 28, bet67: 0, check: 72 },
    reasoning: 'Monotone board heavily favors BB defending range with more suited combos. UTG should check most of range and only bet nutted flushes and overpairs at small sizing.',
    keyHands: { valueBet: 'Flush, overpair w/ club', bluff: 'Nut club blocker', check: 'Most of range' },
  },
  {
    id: 4, name: 'Paired Board', board: 'K♠ 9♠ 9♦', position: 'BTN vs SB', spr: 3.8,
    optimalCbet: 72, optimalSize: '33%', rangeAdvantage: 'IP',
    cbetBreakdown: { bet33: 55, bet67: 17, check: 28 },
    reasoning: 'Paired board with a king gives BTN strong range advantage. Trip 9x is rare for both. High frequency small bets work well as SB has many weak hands that fold.',
    keyHands: { valueBet: 'Kx, trips, overpairs', bluff: 'Spade draws, Ax high', check: 'Low pocket pairs' },
  },
  {
    id: 5, name: 'Broadway Heavy', board: 'K♥ Q♦ J♠', position: 'MP vs BB', spr: 5.5,
    optimalCbet: 44, optimalSize: '67%', rangeAdvantage: 'IP',
    cbetBreakdown: { bet33: 12, bet67: 32, check: 56 },
    reasoning: 'Both ranges connect heavily with broadway cards. BB has more two-pair combos (KQ, QJ, KJ). IP uses larger sizing with strong hands and straights, checks medium strength.',
    keyHands: { valueBet: 'AT straight, sets, two pair', bluff: 'AT with spade, gutshots', check: 'One pair kings/queens' },
  },
  {
    id: 6, name: 'Low Rainbow', board: '6♠ 4♥ 2♦', position: 'SB vs BB', spr: 4.0,
    optimalCbet: 60, optimalSize: '33%', rangeAdvantage: 'SB',
    cbetBreakdown: { bet33: 48, bet67: 12, check: 40 },
    reasoning: 'Low disconnected rainbow board slightly favors SB opener. Overpairs are strong, sets are rare. Small c-bet with wide range including overcards that can barrel turns.',
    keyHands: { valueBet: 'Overpairs, sets, strong Ax', bluff: 'Overcards, backdoors', check: 'Weak Ax, middling pairs' },
  },
];

function FrequencyBar({ label, pct, color }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
      <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.5)', width: 50, textAlign: 'right' }}>{label}</span>
      <div style={{ flex: 1, height: 16, background: 'rgba(255,255,255,0.06)', borderRadius: 4, overflow: 'hidden', position: 'relative' }}>
        <div style={{ height: '100%', width: `${pct}%`, background: color, borderRadius: 4, transition: 'width 0.3s ease' }} />
        <span style={{ position: 'absolute', right: 6, top: 0, fontSize: 11, fontWeight: 700, color: '#fff', lineHeight: '16px' }}>{pct}%</span>
      </div>
    </div>
  );
}

function ContinuationBetTrainer() {
  const [selectedId, setSelectedId] = useState(1);
  const [userDecision, setUserDecision] = useState(null); // 'bet33' | 'bet67' | 'check'
  const [showAnswer, setShowAnswer] = useState(false);
  const [score, setScore] = useState({ correct: 0, total: 0 });

  const scenario = useMemo(() => SCENARIOS.find(s => s.id === selectedId), [selectedId]);

  const handleDecision = (decision) => {
    setUserDecision(decision);
    setShowAnswer(true);
    const optimal = scenario.cbetBreakdown;
    const best = Object.entries(optimal || {}).sort((a, b) => b[1] - a[1])[0][0];
    const isCorrect = decision === best;
    setScore(prev => ({ correct: prev.correct + (isCorrect ? 1 : 0), total: prev.total + 1 }));
  };

  const nextScenario = () => {
    const nextIdx = SCENARIOS.findIndex(s => s.id === selectedId);
    const next = SCENARIOS[(nextIdx + 1) % SCENARIOS.length];
    setSelectedId(next.id);
    setUserDecision(null);
    setShowAnswer(false);
  };

  const bestAction = useMemo(() => {
    const bd = scenario.cbetBreakdown;
    return Object.entries(bd || {}).sort((a, b) => b[1] - a[1])[0][0];
  }, [scenario]);

  try {
    return (
      <div style={{ padding: 20, background: 'rgba(0,0,0,0.3)', borderRadius: 12, border: '1px solid rgba(255,255,255,0.08)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <h3 style={{ margin: 0, fontSize: 18, color: '#f97316' }}>C-Bet Trainer</h3>
          <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.5)' }}>
            Score: <span style={{ color: '#10b981', fontWeight: 700 }}>{score.correct}</span>/{score.total}
          </span>
        </div>

        {/* Scenario Selector */}
        <div style={{ display: 'flex', gap: 6, marginBottom: 16, flexWrap: 'wrap' }}>
          {SCENARIOS.map(s => (
            <button key={s.id} onClick={() => { setSelectedId(s.id); setUserDecision(null); setShowAnswer(false); }}
              style={{
                padding: '6px 12px', borderRadius: 6, fontSize: 12, fontWeight: 600, cursor: 'pointer',
                background: selectedId === s.id ? '#f97316' : 'rgba(255,255,255,0.06)',
                color: selectedId === s.id ? '#000' : 'rgba(255,255,255,0.7)', border: 'none',
              }}>{s.name}</button>
          ))}
        </div>

        {/* Board Display */}
        <div style={{ textAlign: 'center', padding: 20, background: 'rgba(249,115,22,0.06)', borderRadius: 10, border: '1px solid rgba(249,115,22,0.15)', marginBottom: 16 }}>
          <div style={{ fontSize: 36, fontWeight: 900, letterSpacing: 8, color: '#fff', marginBottom: 8 }}>{scenario.board}</div>
          <div style={{ display: 'flex', justifyContent: 'center', gap: 24, fontSize: 13, color: 'rgba(255,255,255,0.6)' }}>
            <span>{scenario.position}</span>
            <span>SPR: <span style={{ color: '#f97316', fontWeight: 700 }}>{scenario.spr}</span></span>
            <span>Advantage: <span style={{ color: '#10b981', fontWeight: 700 }}>{scenario.rangeAdvantage}</span></span>
          </div>
        </div>

        {/* Decision Buttons */}
        {!showAnswer && (
          <div style={{ display: 'flex', gap: 10, marginBottom: 16, justifyContent: 'center' }}>
            {[
              { id: 'bet33', label: 'Bet 33%', color: '#3b82f6' },
              { id: 'bet67', label: 'Bet 67%', color: '#8b5cf6' },
              { id: 'check', label: 'Check', color: '#6b7280' },
            ].map(a => (
              <button key={a.id} onClick={() => handleDecision(a.id)}
                style={{
                  padding: '14px 28px', borderRadius: 10, border: 'none', fontSize: 15, fontWeight: 700,
                  cursor: 'pointer', background: a.color, color: '#fff', flex: 1, maxWidth: 160,
                }}>{a.label}</button>
            ))}
          </div>
        )}

        {/* Answer Reveal */}
        {showAnswer && (
          <div style={{ marginBottom: 16 }}>
            <div style={{
              padding: 12, borderRadius: 8, marginBottom: 12, textAlign: 'center',
              background: userDecision === bestAction ? 'rgba(16,185,129,0.1)' : 'rgba(239,68,68,0.1)',
              border: `1px solid ${userDecision === bestAction ? 'rgba(16,185,129,0.3)' : 'rgba(239,68,68,0.3)'}`,
            }}>
              <span style={{ fontSize: 16, fontWeight: 800, color: userDecision === bestAction ? '#10b981' : '#ef4444' }}>
                {userDecision === bestAction ? '✓ Correct!': '✕ Incorrect'}
              </span>
              <span style={{ fontSize: 13, color: 'rgba(255,255,255,0.6)', marginLeft: 12 }}>
                Optimal: <span style={{ fontWeight: 700, color: '#f97316' }}>{bestAction === 'bet33' ? 'Bet 33%' : bestAction === 'bet67' ? 'Bet 67%' : 'Check'}</span> ({scenario.cbetBreakdown[bestAction]}% frequency)
              </span>
            </div>

            {/* Frequency Breakdown */}
            <div style={{ marginBottom: 12 }}>
              <FrequencyBar label="Bet 33%" pct={scenario.cbetBreakdown.bet33} color="#3b82f6" />
              <FrequencyBar label="Bet 67%" pct={scenario.cbetBreakdown.bet67} color="#8b5cf6" />
              <FrequencyBar label="Check" pct={scenario.cbetBreakdown.check} color="#6b7280" />
            </div>

            {/* Reasoning */}
            <div style={{ padding: 12, background: 'rgba(255,255,255,0.03)', borderRadius: 8, border: '1px solid rgba(255,255,255,0.06)', marginBottom: 12 }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: '#f97316', marginBottom: 6 }}>Strategy</div>
              <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.8)', lineHeight: 1.6 }}>{scenario.reasoning}</div>
            </div>

            {/* Key Hands */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8, marginBottom: 12 }}>
              {[
                { label: 'Value Bet', hands: scenario.keyHands.valueBet, color: '#10b981' },
                { label: 'Bluff', hands: scenario.keyHands.bluff, color: '#f59e0b' },
                { label: 'Check', hands: scenario.keyHands.check, color: '#6b7280' },
              ].map(k => (
                <div key={k.label} style={{ padding: 10, background: 'rgba(255,255,255,0.03)', borderRadius: 6, borderTop: `2px solid ${k.color}` }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: k.color, marginBottom: 4 }}>{k.label}</div>
                  <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.7)' }}>{k.hands}</div>
                </div>
              ))}
            </div>

            <div style={{ textAlign: 'center' }}>
              <button onClick={nextScenario} style={{
                padding: '12px 32px', borderRadius: 8, border: 'none', fontSize: 14, fontWeight: 700,
                cursor: 'pointer', background: '#f97316', color: '#fff',
              }}>Next Scenario →</button>
            </div>
          </div>
        )}

        {/* Optimal C-Bet Gauge */}
        <div style={{ padding: 12, background: 'rgba(255,255,255,0.03)', borderRadius: 8, border: '1px solid rgba(255,255,255,0.06)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
            <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.5)' }}>Overall C-Bet Frequency</span>
            <span style={{ fontSize: 13, fontWeight: 700, color: '#f97316' }}>{scenario.optimalCbet}%</span>
          </div>
          <div style={{ height: 8, background: 'rgba(255,255,255,0.08)', borderRadius: 4, overflow: 'hidden' }}>
            <div style={{ height: '100%', width: `${scenario.optimalCbet}%`, background: 'linear-gradient(90deg, #f97316, #fb923c)', borderRadius: 4 }} />
          </div>
        </div>
      </div>
    );
  } catch (err) {
    return <div style={{ padding: 20, color: '#ef4444' }}>C-Bet Trainer failed to load: {err.message}</div>;
  }
}

export default ContinuationBetTrainer;
