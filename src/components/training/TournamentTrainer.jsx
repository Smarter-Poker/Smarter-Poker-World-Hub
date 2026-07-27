/**
 * TOURNAMENT TRAINER
 * ●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●
 * MTT-specific training scenarios:
 * - Bubble play with ICM pressure
 * - Final table dynamics (pay jumps, short stacks, chip leader play)
 * - Push/fold Nash equilibrium trainer
 * - Blind vs blind battles at various stack depths
 * - Re-entry/late-reg spot decisions
 * - Scenario generator with configurable tournament stage
 * ●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●
 */

import React, { useState, useCallback, useMemo } from 'react';

// ●●● TOURNAMENT STAGES ●●●
const STAGES = [
  { id: 'early', label: 'Early Game', blinds: '25/50', avgStack: '150bb', desc: 'Deep stacks, speculative hands gain value', color: '#22c55e' },
  { id: 'middle', label: 'Middle Stage', blinds: '200/400', avgStack: '40bb', desc: 'Antes kick in, stealing blinds becomes key', color: '#3b82f6' },
  { id: 'bubble', label: 'Bubble', blinds: '500/1000', avgStack: '25bb', desc: 'ICM pressure at maximum — survival vs accumulation', color: '#f59e0b' },
  { id: 'itm', label: 'In the Money', blinds: '800/1600', avgStack: '20bb', desc: 'Pay jumps matter — ladder vs gamble for the win', color: '#8b5cf6' },
  { id: 'final_table', label: 'Final Table', blinds: '2000/4000', avgStack: '25bb', desc: 'Maximum ICM — every decision is magnified', color: '#ef4444' },
  { id: 'heads_up', label: 'Heads Up', blinds: '5000/10000', avgStack: '30bb', desc: 'Winner takes all — ICM gone, pure chip EV', color: '#ec4899' },
];

// ●●● SCENARIO DATA ●●●
const SCENARIOS = {
  bubble: [
    {
      title: 'Bubble with Big Stack',
      stacks: [45, 22, 18, 12, 8],
      heroIdx: 0,
      position: 'CO',
      hand: 'A♠ T♥',
      blinds: { sb: 500, bb: 1000, ante: 100 },
      payouts: [0, 100, 70, 50, 35],
      playersLeft: 5,
      bubbleSize: 4,
      situation: 'You\'re the chip leader on the bubble. UTG folds, you\'re in the CO. The short stack is in the BB.',
      options: [
        { action: 'Raise 2.2x', correct: true, ev: '+0.8%', explanation: 'With the big stack on the bubble, you should be raising wide to exploit ICM pressure on medium stacks. A♠T♥ is a clear open.' },
        { action: 'Raise 3x', correct: false, ev: '-0.2%', explanation: 'Sizing too large risks too many chips. The smaller open accomplishes the same goal with less risk.' },
        { action: 'Fold', correct: false, ev: '-1.1%', explanation: 'Folding ATo as chip leader on the bubble is far too tight. You\'re giving up massive EV by not applying pressure.' },
        { action: 'Limp', correct: false, ev: '-0.5%', explanation: 'Limping caps your range and gives the blinds a free look. Open-raise to maintain fold equity.' },
      ],
    },
    {
      title: 'Bubble Squeeze Spot',
      stacks: [30, 28, 15, 10, 5],
      heroIdx: 2,
      position: 'BTN',
      hand: 'K♠ Q♠',
      blinds: { sb: 600, bb: 1200, ante: 150 },
      payouts: [0, 100, 70, 50, 35],
      playersLeft: 5,
      bubbleSize: 4,
      situation: 'On the bubble. UTG (30bb) opens 2.2x, HJ (28bb) calls. You have KQs on the BTN with 15bb.',
      options: [
        { action: 'All-in', correct: true, ev: '+1.5%', explanation: 'With 15bb and KQs, shoving over the open + call is profitable. You have great fold equity as both opponents need strong hands to call on the bubble.' },
        { action: 'Call', correct: false, ev: '-0.6%', explanation: 'Calling bloats the pot multiway and you\'re OOP postflop with an awkward stack. Push/fold is the right strategy here.' },
        { action: 'Fold', correct: false, ev: '-0.8%', explanation: 'KQs is too strong to fold at 15bb. Even with ICM, you need to accumulate chips to have a shot at the win.' },
        { action: 'Raise to 8bb', correct: false, ev: '-1.2%', explanation: 'Min-raising with 15bb commits half your stack. Either go all-in for maximum fold equity or fold.' },
      ],
    },
    {
      title: 'Short Stack on Bubble',
      stacks: [40, 25, 22, 6, 18],
      heroIdx: 3,
      position: 'SB',
      hand: '9♠ 9♥',
      blinds: { sb: 500, bb: 1000, ante: 100 },
      payouts: [0, 100, 70, 50, 35],
      playersLeft: 5,
      bubbleSize: 4,
      situation: 'You\'re the short stack (6bb) on the bubble. Everyone folds to you in the SB. BB has 22bb.',
      options: [
        { action: 'All-in', correct: true, ev: '+2.1%', explanation: '99 is a monster at 6bb. Even though you\'re on the bubble, you\'re so short that you need to double up. The BB can\'t call wide with ICM pressure from bigger stacks.' },
        { action: 'Fold', correct: false, ev: '-3.5%', explanation: 'Folding pocket nines at 6bb is a catastrophic error. Even in pure ICM, 99 is a profitable shove here. You\'ll blind out waiting for a better spot.' },
        { action: 'Raise to 2.5x', correct: false, ev: '-0.4%', explanation: 'With 6bb, there\'s no room for a standard open. Push/fold mode — either jam or fold.' },
        { action: 'Limp', correct: false, ev: '-1.8%', explanation: 'Limping is terrible. It gives BB great odds, lets them see a flop, and you lose the fold equity that\'s your biggest weapon at 6bb.' },
      ],
    },
  ],
  final_table: [
    {
      title: 'Final Table — Short Stack Shove',
      stacks: [55, 30, 20, 18, 15, 12, 10, 8, 6],
      heroIdx: 8,
      position: 'UTG',
      hand: 'A♥ 7♦',
      blinds: { sb: 2000, bb: 4000, ante: 500 },
      payouts: [0, 250, 180, 130, 95, 70, 55, 40, 30, 22],
      playersLeft: 9,
      situation: 'Final table, 9 players remain. You have 6bb in UTG. Everyone behind has 10-55bb.',
      options: [
        { action: 'All-in', correct: true, ev: '+0.9%', explanation: 'A7o at 6bb from UTG is a clear shove. You\'re desperate and A7 is well above the Nash push range for 6bb. Waiting will cost you more through blinds and antes.' },
        { action: 'Fold', correct: false, ev: '-1.5%', explanation: 'A7 is too strong to fold at 6bb. Your push range here should be ~35% of hands, and A7o is comfortably in that range.' },
        { action: 'Raise to 2x', correct: false, ev: '-0.8%', explanation: 'No standard opens at 6bb. It\'s push or fold — you need maximum fold equity from a shove.' },
      ],
    },
    {
      title: 'Final Table — Chip Leader Decision',
      stacks: [60, 22, 20, 18, 15, 12, 8],
      heroIdx: 0,
      position: 'BTN',
      hand: 'J♠ T♠',
      blinds: { sb: 3000, bb: 6000, ante: 750 },
      payouts: [0, 300, 200, 140, 100, 70, 50, 35],
      playersLeft: 7,
      situation: '7 left at the final table. You\'re chip leader on the BTN. Folds to you. SB has 12bb, BB has 15bb.',
      options: [
        { action: 'Raise 2.2x', correct: true, ev: '+1.4%', explanation: 'JTs is a premium at the final table from BTN. As chip leader, you apply maximum ICM pressure to the medium-short stacks in the blinds.' },
        { action: 'All-in', correct: false, ev: '+0.3%', explanation: 'Shoving is profitable but overkill. A normal raise gets the job done while risking less. Save the big shoves for when you need max fold equity.' },
        { action: 'Fold', correct: false, ev: '-1.8%', explanation: 'Folding JTs on the BTN as chip leader at the final table is extremely weak. You\'re leaving huge amounts of equity on the table.' },
        { action: 'Limp', correct: false, ev: '-0.5%', explanation: 'Limping the BTN at a final table invites the blinds to play cheaply. Raise to take down the pot preflop.' },
      ],
    },
  ],
  push_fold: [
    {
      title: 'Nash Push/Fold — 8bb UTG',
      stacks: [8, 15, 20, 25, 12, 10],
      heroIdx: 0,
      position: 'UTG',
      hand: 'K♥ 5♣',
      blinds: { sb: 500, bb: 1000, ante: 100 },
      situation: '6-handed, you have 8bb in UTG. Practice: should you push or fold K5o?',
      options: [
        { action: 'Fold', correct: true, ev: '+0.1%', explanation: 'K5o at 8bb from UTG is a fold in Nash equilibrium. There are 5 players left to act, and K5o doesn\'t have enough equity when called. Nash push range for UTG at 8bb is ~15% — K5o is just outside.' },
        { action: 'All-in', correct: false, ev: '-0.4%', explanation: 'K5o is marginal at 8bb from UTG. With 5 players behind, the chance of running into a premium is too high. From BTN or CO this would be a shove, but UTG it\'s a fold.' },
      ],
    },
    {
      title: 'Nash Push/Fold — 12bb BTN',
      stacks: [20, 15, 12, 8, 25, 18],
      heroIdx: 2,
      position: 'BTN',
      hand: '8♠ 7♠',
      blinds: { sb: 400, bb: 800, ante: 100 },
      situation: '6-handed, you have 12bb on the BTN. Folds to you. Push with 87s?',
      options: [
        { action: 'All-in', correct: true, ev: '+0.6%', explanation: '87s at 12bb from BTN is a clear push. Only 2 players remain, suited connectors play well all-in, and at 12bb your raise/fold game is too expensive. Nash range here is ~40%.' },
        { action: 'Fold', correct: false, ev: '-0.7%', explanation: '87s is well within the BTN push range at 12bb. Folding here is far too tight and bleeds your stack through blinds and antes.' },
        { action: 'Raise to 2.5x', correct: false, ev: '-0.2%', explanation: 'At 12bb, a standard open commits too much of your stack. If you get 3-bet, you\'ll be forced to fold having invested 20% of your stack. Push/fold is cleaner.' },
      ],
    },
  ],
  blind_battle: [
    {
      title: 'SB vs BB — 20bb Deep',
      stacks: [20, 30, 25, 20, 18, 22],
      heroIdx: 4,
      position: 'SB',
      hand: 'Q♥ 8♦',
      blinds: { sb: 300, bb: 600, ante: 75 },
      situation: 'Folds to you in the SB with 20bb. BB has 22bb. Q8o — raise, limp, or fold?',
      options: [
        { action: 'Raise 2.2x', correct: true, ev: '+0.4%', explanation: 'Q8o is a raise from the SB at 20bb in a blind battle. You need to be aggressive stealing blinds at this stack depth. Q8o has enough equity against BB\'s defending range.' },
        { action: 'All-in', correct: false, ev: '-0.3%', explanation: 'Shoving Q8o at 20bb from SB is too aggressive. You have room for a standard open/fold game. Save the jams for sub-12bb stacks.' },
        { action: 'Fold', correct: false, ev: '-0.6%', explanation: 'Q8o is well within the SB opening range heads-up against the BB. Folding is leaving money on the table.' },
        { action: 'Limp', correct: false, ev: '-0.2%', explanation: 'Limping from the SB is acceptable at very deep stacks but at 20bb you want to maximize fold equity by raising. If BB raises, you can fold.' },
      ],
    },
  ],
};

// ●●● MAIN COMPONENT ●●●
export default function TournamentTrainer() {
  const [stage, setStage] = useState('bubble');
  const [scenarioIdx, setScenarioIdx] = useState(0);
  const [selectedOption, setSelectedOption] = useState(null);
  const [showExplanation, setShowExplanation] = useState(false);
  const [score, setScore] = useState({ correct: 0, total: 0 });

  const scenarios = useMemo(() => SCENARIOS[stage] || SCENARIOS.bubble, [stage]);
  const scenario = scenarios[scenarioIdx] || scenarios[0];

  const handleSelect = useCallback((optIdx) => {
    if (selectedOption !== null) return; // Already answered
    setSelectedOption(optIdx);
    setShowExplanation(true);
    const opt = scenario.options[optIdx];
    setScore(prev => ({
      correct: prev.correct + (opt.correct ? 1 : 0),
      total: prev.total + 1,
    }));
  }, [selectedOption, scenario]);

  const nextScenario = useCallback(() => {
    setSelectedOption(null);
    setShowExplanation(false);
    setScenarioIdx(prev => (prev + 1) % scenarios.length);
  }, [scenarios]);

  const changeStage = useCallback((newStage) => {
    setStage(newStage);
    setScenarioIdx(0);
    setSelectedOption(null);
    setShowExplanation(false);
  }, []);

  const sectionStyle = {
    background: 'rgba(0,0,0,0.2)', borderRadius: 8, padding: 12, marginBottom: 12,
  };

  return (
    <div style={{ background: 'rgba(15,23,42,0.6)', borderRadius: 12, padding: 20, border: '1px solid rgba(255,255,255,0.06)' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <h3 style={{ color: '#f1f5f9', fontSize: 18, fontWeight: 700, margin: 0 }}>
          Tournament Trainer
        </h3>
        <div style={{
          padding: '4px 12px', borderRadius: 6, background: 'rgba(59,130,246,0.15)',
          color: '#3b82f6', fontSize: 12, fontWeight: 700,
        }}>
          {score.correct}/{score.total} correct ({score.total > 0 ? Math.round(score.correct / score.total * 100) : 0}%)
        </div>
      </div>

      {/* ●●● STAGE SELECTOR ●●● */}
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 16 }}>
        {STAGES.map(s => (
          <button key={s.id} onClick={() => changeStage(s.id)} style={{
            padding: '6px 12px', borderRadius: 6, border: 'none', cursor: 'pointer',
            background: stage === s.id ? `${s.color}30` : 'rgba(255,255,255,0.06)',
            color: stage === s.id ? s.color : '#94a3b8', fontSize: 12, fontWeight: 600,
            border: stage === s.id ? `1px solid ${s.color}40` : '1px solid transparent',
            transition: 'all 0.15s',
          }}>
            {s.label}
          </button>
        ))}
      </div>

      {/* Stage Info */}
      {(() => {
        const stageInfo = STAGES.find(s => s.id === stage);
        return stageInfo ? (
          <div style={{ ...sectionStyle, display: 'flex', gap: 16, alignItems: 'center' }}>
            <div style={{ width: 8, height: 8, borderRadius: '50%', background: stageInfo.color }} />
            <div>
              <div style={{ color: '#f1f5f9', fontSize: 13, fontWeight: 600 }}>{stageInfo.label}</div>
              <div style={{ color: '#94a3b8', fontSize: 11 }}>{stageInfo.desc}</div>
            </div>
            <div style={{ marginLeft: 'auto', color: '#64748b', fontSize: 11 }}>
              Blinds: {stageInfo.blinds} · Avg: {stageInfo.avgStack}
            </div>
          </div>
        ) : null;
      })()}

      {/* ●●● SCENARIO CARD ●●● */}
      <div style={{ ...sectionStyle, border: '1px solid rgba(255,255,255,0.08)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
          <div style={{ color: '#f1f5f9', fontSize: 16, fontWeight: 700 }}>{scenario.title}</div>
          <div style={{ color: '#64748b', fontSize: 11 }}>
            {scenarioIdx + 1}/{scenarios.length}
          </div>
        </div>

        {/* Stack visualization */}
        {scenario.stacks && (
          <div style={{ display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
            {scenario.stacks.map((stack, i) => (
              <div key={i} style={{
                padding: '4px 10px', borderRadius: 6,
                background: i === scenario.heroIdx ? 'rgba(59,130,246,0.2)' : 'rgba(255,255,255,0.04)',
                border: i === scenario.heroIdx ? '1px solid rgba(59,130,246,0.3)' : '1px solid transparent',
              }}>
                <div style={{ color: i === scenario.heroIdx ? '#3b82f6' : '#64748b', fontSize: 9, fontWeight: 600, textTransform: 'uppercase' }}>
                  {i === scenario.heroIdx ? 'Hero' : `P${i + 1}`}
                </div>
                <div style={{ color: '#f1f5f9', fontSize: 13, fontWeight: 700 }}>{stack}bb</div>
                {/* Stack bar */}
                <div style={{ width: 40, height: 3, background: 'rgba(255,255,255,0.06)', borderRadius: 2, marginTop: 2 }}>
                  <div style={{
                    width: `${Math.min(100, stack / Math.max(...scenario.stacks) * 100)}%`,
                    height: '100%', borderRadius: 2,
                    background: i === scenario.heroIdx ? '#3b82f6' : '#475569',
                  }} />
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Hand + Position */}
        <div style={{ display: 'flex', gap: 16, alignItems: 'center', marginBottom: 12 }}>
          <div style={{
            padding: '8px 16px', borderRadius: 8, background: 'rgba(0,0,0,0.3)',
            color: '#f1f5f9', fontSize: 20, fontWeight: 800, fontFamily: 'monospace',
            letterSpacing: 2,
          }}>
            {scenario.hand}
          </div>
          <div>
            <span style={{
              padding: '3px 8px', borderRadius: 4, background: 'rgba(139,92,246,0.2)',
              color: '#a78bfa', fontSize: 12, fontWeight: 700,
            }}>
              {scenario.position}
            </span>
          </div>
        </div>

        {/* Situation */}
        <div style={{ color: '#cbd5e1', fontSize: 13, lineHeight: 1.5, marginBottom: 16 }}>
          {scenario.situation}
        </div>

        {/* ●●● OPTIONS ●●● */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {scenario.options.map((opt, i) => {
            const isSelected = selectedOption === i;
            const isCorrect = opt.correct;
            const showResult = selectedOption !== null;

            return (
              <button key={i} onClick={() => handleSelect(i)} disabled={selectedOption !== null} style={{
                padding: '12px 16px', borderRadius: 8, border: 'none', cursor: selectedOption !== null ? 'default' : 'pointer',
                background: showResult
                  ? isCorrect
                    ? 'rgba(34,197,94,0.15)'
                    : isSelected
                      ? 'rgba(239,68,68,0.15)'
                      : 'rgba(255,255,255,0.03)'
                  : 'rgba(255,255,255,0.06)',
                border: showResult
                  ? isCorrect
                    ? '1px solid rgba(34,197,94,0.3)'
                    : isSelected
                      ? '1px solid rgba(239,68,68,0.3)'
                      : '1px solid transparent'
                  : '1px solid rgba(255,255,255,0.06)',
                textAlign: 'left', transition: 'all 0.2s',
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{
                    color: showResult
                      ? isCorrect ? '#22c55e' : isSelected ? '#ef4444' : '#64748b'
                      : '#f1f5f9',
                    fontSize: 14, fontWeight: 600,
                  }}>
                    {opt.action}
                  </span>
                  {showResult && (
                    <span style={{
                      color: isCorrect ? '#22c55e' : '#ef4444',
                      fontSize: 12, fontWeight: 700,
                    }}>
                      {opt.ev}
                    </span>
                  )}
                </div>
                {showResult && (isSelected || isCorrect) && (
                  <div style={{ color: '#94a3b8', fontSize: 12, marginTop: 6, lineHeight: 1.4 }}>
                    {opt.explanation}
                  </div>
                )}
              </button>
            );
          })}
        </div>

        {/* Next button */}
        {selectedOption !== null && (
          <div style={{ marginTop: 16, textAlign: 'center' }}>
            <button onClick={nextScenario} style={{
              padding: '10px 28px', borderRadius: 8, border: 'none', cursor: 'pointer',
              background: 'linear-gradient(135deg, #3b82f6, #8b5cf6)', color: '#fff',
              fontSize: 14, fontWeight: 700,
            }}>
              Next Scenario
            </button>
          </div>
        )}
      </div>

      {/* ●●● PAYOUTS (if available) ●●● */}
      {scenario.payouts && (
        <div style={sectionStyle}>
          <div style={{ color: '#64748b', fontSize: 10, fontWeight: 600, textTransform: 'uppercase', marginBottom: 6 }}>
            Payout Structure
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {scenario.payouts.slice(1).map((p, i) => (
              <div key={i} style={{
                padding: '3px 8px', borderRadius: 4,
                background: i === 0 ? 'rgba(245,158,11,0.15)' : 'rgba(255,255,255,0.04)',
                color: i === 0 ? '#f59e0b' : '#94a3b8', fontSize: 11, fontWeight: 600,
              }}>
                {i + 1}st: ${p}
              </div>
            ))}
          </div>
          {scenario.bubbleSize && (
            <div style={{ color: '#f59e0b', fontSize: 11, marginTop: 6 }}>
              Bubble: {scenario.playersLeft} remain, {scenario.bubbleSize} get paid
            </div>
          )}
        </div>
      )}
    </div>
  );
}
