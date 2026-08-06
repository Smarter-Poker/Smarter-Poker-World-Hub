/**
 * MIXED STRATEGY TRAINER
 * ●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●
 * Practice executing mixed strategies at correct frequencies:
 * - Scenario with GTO mixed action (e.g., bet 60% / check 40%)
 * - RNG-assisted frequency practice
 * - Track actual vs target frequency over many hands
 * - Drift detection when you deviate from GTO mix
 * ●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●
 */

import React, { useState, useCallback } from 'react';

// ●●● MIXED STRATEGY SCENARIOS ●●●
const SCENARIOS = [
  {
    id: 1, hand: 'A♠Q♥', board: 'K♠ 8♦ 3♣', position: 'BTN vs BB', street: 'Flop', pot: 6.5,
    situation: 'You have AQo with overcards and backdoor equity. GTO mixes between betting and checking.',
    actions: [
      { label: 'Bet 33%', freq: 62, ev: 0.85, color: '#ef4444' },
      { label: 'Check', freq: 38, ev: 0.62, color: '#3b82f6' },
    ],
  },
  {
    id: 2, hand: 'T♥9♥', board: 'Q♠ 8♦ 2♣', position: 'CO vs BB', street: 'Flop', pot: 7.0,
    situation: 'Gutshot + backdoor flush draw. GTO has a mixed strategy between a small c-bet and checking.',
    actions: [
      { label: 'Bet 33%', freq: 45, ev: 0.42, color: '#ef4444' },
      { label: 'Check', freq: 55, ev: 0.38, color: '#3b82f6' },
    ],
  },
  {
    id: 3, hand: 'J♠J♦', board: 'A♣ 7♥ 4♠ 2♦', position: 'BTN vs BB', street: 'Turn', pot: 12.0,
    situation: 'Jacks on ace-high board facing check. You block nothing and have showdown value. GTO mixes.',
    actions: [
      { label: 'Bet 50%', freq: 35, ev: 1.15, color: '#ef4444' },
      { label: 'Check', freq: 65, ev: 1.05, color: '#3b82f6' },
    ],
  },
  {
    id: 4, hand: 'K♦Q♦', board: 'J♠ T♣ 4♥ 8♠ 3♦', position: 'BTN vs BB', street: 'River', pot: 22.0,
    situation: 'Missed straight draw, king high. Board is draw-heavy. GTO bluffs at a specific frequency.',
    actions: [
      { label: 'Bet 75%', freq: 28, ev: -0.85, color: '#ef4444' },
      { label: 'Check', freq: 72, ev: 0.00, color: '#3b82f6' },
    ],
  },
  {
    id: 5, hand: '6♠5♠', board: 'A♠ 9♥ 7♣', position: 'BB vs CO', street: 'Flop', pot: 8.5,
    situation: 'Gutshot + backdoor flush. Facing a c-bet. GTO mixes between calling and check-raising.',
    actions: [
      { label: 'Check-Raise', freq: 22, ev: 0.25, color: '#f59e0b' },
      { label: 'Call', freq: 58, ev: 0.18, color: '#22c55e' },
      { label: 'Fold', freq: 20, ev: 0.00, color: '#64748b' },
    ],
  },
  {
    id: 6, hand: 'A♣8♣', board: 'K♥ 7♣ 2♣ J♦', position: 'BTN vs BB', street: 'Turn', pot: 14.0,
    situation: 'Nut flush draw on the turn. GTO splits between semi-bluff betting and checking to realize equity.',
    actions: [
      { label: 'Bet 67%', freq: 55, ev: 1.40, color: '#ef4444' },
      { label: 'Check', freq: 45, ev: 1.20, color: '#3b82f6' },
    ],
  },
];

// ●●● MAIN COMPONENT ●●●
export default function MixedStrategyTrainer() {
  const [scenarioIdx, setScenarioIdx] = useState(0);
  const [history, setHistory] = useState([]);
  const [rngValue, setRngValue] = useState(null);
  const [showRng, setShowRng] = useState(false);

  const scenario = SCENARIOS[scenarioIdx];
  const scenarioHistory = history.filter(h => h.scenarioId === scenario.id);

  const rollRng = useCallback(() => {
    // GTOW parity #38 — this used to be Math.round(Math.random() * 100), which
    // yields 0..100: 101 outcomes over a 100-slot dial. The consumer resolves
    // with `rngValue <= cumulative`, so 0 and 1 both land on the first action
    // and that action is over-selected on every single roll. A randomiser with
    // a measurable bias is worse than no randomiser, because the player trusts
    // it. Math.floor(...*100)+1 gives exactly 1..100, uniform.
    setRngValue(Math.floor(Math.random() * 100) + 1);
    setShowRng(true);
  }, []);

  const recordAction = (actionIdx) => {
    setHistory(prev => [...prev, {
      scenarioId: scenario.id,
      actionIdx,
      rng: rngValue,
      timestamp: Date.now(),
    }]);
    setRngValue(null);
    setShowRng(false);
  };

  // Calculate actual frequencies
  const actualFreqs = scenario.actions.map((_, i) => {
    const count = scenarioHistory.filter(h => h.actionIdx === i).length;
    return scenarioHistory.length > 0 ? Math.round((count / scenarioHistory.length) * 100) : 0;
  });

  // Drift detection
  const drifts = scenario.actions.map((a, i) => ({
    action: a.label,
    target: a.freq,
    actual: actualFreqs[i],
    drift: Math.abs(actualFreqs[i] - a.freq),
    color: a.color,
  }));

  const maxDrift = Math.max(...drifts.map(d => d.drift));
  const driftStatus = scenarioHistory.length < 5 ? 'gathering' :
    maxDrift < 8 ? 'excellent' : maxDrift < 15 ? 'good' : maxDrift < 25 ? 'drifting' : 'off_track';

  const driftColors = { gathering: '#64748b', excellent: '#22c55e', good: '#34d399', drifting: '#f59e0b', off_track: '#ef4444' };
  const driftLabels = { gathering: 'Gathering Data...', excellent: 'Excellent Execution', good: 'Good Frequency', drifting: 'Slight Drift', off_track: 'Off Track' };

  try {
    return (
      <div style={{ background: 'rgba(15,23,42,0.6)', borderRadius: 12, padding: 20, border: '1px solid rgba(255,255,255,0.06)' }}>
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <div>
            <h3 style={{ color: '#f1f5f9', fontSize: 18, fontWeight: 700, margin: 0 }}>Mixed Strategy Trainer</h3>
            <div style={{ color: '#64748b', fontSize: 11, marginTop: 2 }}>Practice executing GTO frequencies</div>
          </div>
          <div style={{
            padding: '4px 10px', borderRadius: 4,
            background: `${driftColors[driftStatus]}15`,
            color: driftColors[driftStatus], fontSize: 11, fontWeight: 700,
          }}>{driftLabels[driftStatus]}</div>
        </div>

        {/* Scenario selector */}
        <div style={{ display: 'flex', gap: 4, marginBottom: 16, overflowX: 'auto' }}>
          {SCENARIOS.map((s, i) => (
            <button key={s.id} onClick={() => setScenarioIdx(i)} style={{
              padding: '5px 10px', borderRadius: 5, border: 'none', cursor: 'pointer', whiteSpace: 'nowrap',
              background: scenarioIdx === i ? 'rgba(59,130,246,0.2)' : 'rgba(255,255,255,0.04)',
              color: scenarioIdx === i ? '#3b82f6' : '#94a3b8', fontSize: 10, fontWeight: 600,
              border: scenarioIdx === i ? '1px solid rgba(59,130,246,0.3)' : '1px solid transparent',
            }}>#{s.id} {s.hand}</button>
          ))}
        </div>

        {/* Scenario display */}
        <div style={{ background: 'rgba(0,0,0,0.2)', borderRadius: 8, padding: 14, marginBottom: 16 }}>
          <div style={{ display: 'flex', gap: 16, marginBottom: 10 }}>
            <div>
              <div style={{ color: '#64748b', fontSize: 9, fontWeight: 600, textTransform: 'uppercase' }}>Hand</div>
              <div style={{ color: '#f1f5f9', fontSize: 22, fontWeight: 800 }}>{scenario.hand}</div>
            </div>
            <div>
              <div style={{ color: '#64748b', fontSize: 9, fontWeight: 600, textTransform: 'uppercase' }}>Board</div>
              <div style={{ color: '#f1f5f9', fontSize: 22, fontWeight: 800 }}>{scenario.board}</div>
            </div>
            <div>
              <div style={{ color: '#64748b', fontSize: 9, fontWeight: 600, textTransform: 'uppercase' }}>Pot</div>
              <div style={{ color: '#f59e0b', fontSize: 22, fontWeight: 800 }}>{scenario.pot}bb</div>
            </div>
          </div>
          <div style={{ display: 'flex', gap: 6, marginBottom: 8 }}>
            <span style={{ padding: '2px 6px', borderRadius: 3, background: 'rgba(59,130,246,0.1)', color: '#3b82f6', fontSize: 9, fontWeight: 600 }}>{scenario.position}</span>
            <span style={{ padding: '2px 6px', borderRadius: 3, background: 'rgba(245,158,11,0.1)', color: '#f59e0b', fontSize: 9, fontWeight: 600 }}>{scenario.street}</span>
          </div>
          <div style={{ color: '#94a3b8', fontSize: 11, lineHeight: 1.5 }}>{scenario.situation}</div>
        </div>

        {/* GTO Frequencies */}
        <div style={{ marginBottom: 16 }}>
          <div style={{ color: '#64748b', fontSize: 9, fontWeight: 700, textTransform: 'uppercase', marginBottom: 6 }}>GTO Strategy</div>
          <div style={{ display: 'flex', gap: 2, height: 24, borderRadius: 6, overflow: 'hidden', marginBottom: 8 }}>
            {scenario.actions.map((a, i) => (
              <div key={i} style={{
                width: `${a.freq}%`, background: a.color, display: 'flex', alignItems: 'center', justifyContent: 'center',
                opacity: 0.6, transition: 'width 0.3s',
              }}>
                <span style={{ color: '#fff', fontSize: 8, fontWeight: 700 }}>{a.label} {a.freq}%</span>
              </div>
            ))}
          </div>
          {scenarioHistory.length > 0 && (
            <>
              <div style={{ color: '#64748b', fontSize: 9, fontWeight: 700, textTransform: 'uppercase', marginBottom: 4 }}>Your Actual</div>
              <div style={{ display: 'flex', gap: 2, height: 24, borderRadius: 6, overflow: 'hidden' }}>
                {scenario.actions.map((a, i) => (
                  <div key={i} style={{
                    width: `${actualFreqs[i] || 1}%`, background: a.color, display: 'flex', alignItems: 'center', justifyContent: 'center',
                    transition: 'width 0.3s',
                  }}>
                    {actualFreqs[i] > 10 && <span style={{ color: '#fff', fontSize: 8, fontWeight: 700 }}>{actualFreqs[i]}%</span>}
                  </div>
                ))}
              </div>
            </>
          )}
        </div>

        {/* RNG Tool */}
        <div style={{ textAlign: 'center', marginBottom: 16 }}>
          <button onClick={rollRng} style={{
            padding: '8px 20px', borderRadius: 8, border: 'none', cursor: 'pointer',
            background: 'linear-gradient(135deg, #a855f7, #6366f1)', color: '#fff',
            fontSize: 13, fontWeight: 700,
          }}>
            {showRng ? `RNG: ${rngValue}` : 'Roll RNG'}
          </button>
          {showRng && (
            <div style={{ marginTop: 6 }}>
              {(() => {
                let cum = 0;
                for (let i = 0; i < scenario.actions.length; i++) {
                  cum += scenario.actions[i].freq;
                  if (rngValue <= cum) {
                    return (
                      <span style={{ color: scenario.actions[i].color, fontSize: 12, fontWeight: 700 }}>
                        GTO says: {scenario.actions[i].label}
                      </span>
                    );
                  }
                }
                return null;
              })()}
            </div>
          )}
        </div>

        {/* Action buttons */}
        <div style={{ display: 'grid', gridTemplateColumns: `repeat(${scenario.actions.length}, 1fr)`, gap: 8, marginBottom: 16 }}>
          {scenario.actions.map((a, i) => (
            <button key={i} onClick={() => recordAction(i)} style={{
              padding: '14px 8px', borderRadius: 8, border: 'none', cursor: 'pointer',
              background: `${a.color}15`, color: a.color, fontSize: 14, fontWeight: 700,
              border: `1px solid ${a.color}30`, transition: 'all 0.2s',
            }}>
              {a.label}
              <div style={{ fontSize: 9, opacity: 0.7, marginTop: 2 }}>Target: {a.freq}%</div>
            </button>
          ))}
        </div>

        {/* Drift analysis */}
        {scenarioHistory.length > 0 && (
          <div style={{ background: 'rgba(0,0,0,0.15)', borderRadius: 8, padding: 12 }}>
            <div style={{ color: '#f1f5f9', fontSize: 12, fontWeight: 700, marginBottom: 8 }}>
              Frequency Analysis ({scenarioHistory.length} samples)
            </div>
            {drifts.map((d, i) => (
              <div key={i} style={{ marginBottom: 8 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 2 }}>
                  <span style={{ color: d.color, fontSize: 11, fontWeight: 600 }}>{d.action}</span>
                  <span style={{ color: d.drift < 10 ? '#22c55e' : d.drift < 20 ? '#f59e0b' : '#ef4444', fontSize: 10 }}>
                    {d.actual}% actual vs {d.target}% target (drift: {d.drift}%)
                  </span>
                </div>
                <div style={{ position: 'relative', height: 12, background: 'rgba(0,0,0,0.3)', borderRadius: 6 }}>
                  {/* Target marker */}
                  <div style={{
                    position: 'absolute', left: `${d.target}%`, top: 0, bottom: 0, width: 2,
                    background: 'rgba(255,255,255,0.4)', transform: 'translateX(-1px)',
                  }} />
                  {/* Actual bar */}
                  <div style={{
                    width: `${d.actual}%`, height: '100%', borderRadius: 6,
                    background: d.drift < 10 ? '#22c55e' : d.drift < 20 ? '#f59e0b' : '#ef4444',
                    opacity: 0.6, transition: 'width 0.3s',
                  }} />
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    );
  } catch (err) {
    return (
      <div style={{ background: 'rgba(15,23,42,0.6)', borderRadius: 12, padding: 20, border: '1px solid rgba(255,255,255,0.06)' }}>
        <h3 style={{ color: '#f1f5f9', fontSize: 18, margin: 0 }}>Mixed Strategy Trainer</h3>
        <p style={{ color: '#64748b', fontSize: 13 }}>Component loading... Please refresh if this persists.</p>
      </div>
    );
  }
}
