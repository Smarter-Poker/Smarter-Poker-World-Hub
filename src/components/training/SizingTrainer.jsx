/**
 * SIZING TRAINER
 * ●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●
 * Practice correct bet sizing decisions:
 * - Scenario-based: given hand + board + action, choose correct size
 * - 5 sizing options: 1/3, 1/2, 2/3, pot, overbet
 * - Explains WHY each sizing is optimal (polarity, protection, etc.)
 * - Tracks accuracy per sizing type
 * - Progressive difficulty
 * ●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●
 */

import React, { useState, useCallback, useMemo } from 'react';

const SIZINGS = [
  { id: 'third', label: '33%', fraction: 0.33, color: '#22c55e' },
  { id: 'half', label: '50%', fraction: 0.50, color: '#3b82f6' },
  { id: 'twothirds', label: '67%', fraction: 0.67, color: '#8b5cf6' },
  { id: 'pot', label: '100%', fraction: 1.00, color: '#f59e0b' },
  { id: 'overbet', label: '150%+', fraction: 1.50, color: '#ef4444' },
];

// ●●● SCENARIO DATABASE ●●●
const SCENARIOS = [
  {
    hand: 'A\u2660 A\u2665',
    board: 'K\u2663 7\u2666 2\u2660',
    pot: 6,
    street: 'Flop',
    position: 'IP',
    spot: 'BTN vs BB SRP',
    correctSizing: 'third',
    explanation: 'On a dry K72 board, you want to bet small with your entire range. AA is a value hand that doesn\'t need protection — the small sizing lets you bet your full range profitably while keeping villain\'s calling range wide.',
    concepts: ['Range betting', 'Dry board', 'Small sizing = wide range'],
  },
  {
    hand: 'Q\u2665 J\u2665',
    board: 'T\u2665 8\u2663 3\u2665',
    pot: 8,
    street: 'Flop',
    position: 'IP',
    spot: 'BTN vs BB SRP',
    correctSizing: 'twothirds',
    explanation: 'With a flush draw + open-ended straight draw, you have massive equity. The 2/3 pot sizing builds the pot while still giving you fold equity. You want to charge draws and extract value from pairs.',
    concepts: ['Semi-bluff', 'Combo draw', 'Build pot with equity'],
  },
  {
    hand: '9\u2660 9\u2663',
    board: 'A\u2666 K\u2665 5\u2663',
    pot: 12,
    street: 'Flop',
    position: 'OOP',
    spot: 'BB vs BTN SRP',
    correctSizing: 'third',
    explanation: 'As the OOP player on AK5, your range is at a disadvantage. When you do bet, keep it small. 99 has some showdown value but struggles against the A/K-heavy BTN range. Small bet or check are both reasonable.',
    concepts: ['Range disadvantage', 'OOP play', 'Pot control'],
  },
  {
    hand: 'A\u2660 5\u2660',
    board: 'K\u2663 8\u2666 3\u2665 \u2502 2\u2660',
    pot: 14,
    street: 'Turn',
    position: 'IP',
    spot: 'BTN vs BB SRP',
    correctSizing: 'twothirds',
    explanation: 'Barrel the turn with the nut flush draw. The 2\u2660 doesn\'t change much, but you pick up a flush draw. 2/3 pot applies maximum pressure while you have great equity if called.',
    concepts: ['Turn barrel', 'Flush draw', 'Pressure sizing'],
  },
  {
    hand: 'K\u2666 K\u2663',
    board: 'Q\u2665 J\u2665 4\u2660 \u2502 7\u2663 \u2502 2\u2666',
    pot: 35,
    street: 'River',
    position: 'IP',
    spot: 'BTN vs BB SRP',
    correctSizing: 'half',
    explanation: 'KK on a QJ427 river is a thin value bet. You beat AQ, QT, JT but lose to straights. 50% pot extracts value from worse hands without over-committing when behind.',
    concepts: ['Thin value', 'River sizing', 'Value-to-bluff ratio'],
  },
  {
    hand: '7\u2660 6\u2660',
    board: 'A\u2663 K\u2666 Q\u2665 \u2502 8\u2660 \u2502 3\u2666',
    pot: 28,
    street: 'River',
    position: 'IP',
    spot: 'BTN vs BB SRP',
    correctSizing: 'overbet',
    explanation: 'On AKQ83 with complete air, you need maximum fold equity. An overbet polarizes your range — you\'re either the nuts or nothing. Villain has to fold most one-pair hands facing an overbet.',
    concepts: ['Polarized bluff', 'Maximum fold equity', 'River overbet'],
  },
  {
    hand: 'J\u2665 T\u2665',
    board: 'J\u2660 6\u2663 2\u2666',
    pot: 10,
    street: 'Flop',
    position: 'IP',
    spot: 'CO vs BB SRP',
    correctSizing: 'half',
    explanation: 'Top pair good kicker on a dry board. 50% pot is the default sizing when you have a strong but not nutted hand. You want to get value from worse pairs and draws.',
    concepts: ['Top pair', 'Standard c-bet', 'Value sizing'],
  },
  {
    hand: '5\u2665 5\u2663',
    board: '5\u2660 T\u2665 8\u2665 \u2502 K\u2663',
    pot: 18,
    street: 'Turn',
    position: 'IP',
    spot: 'BTN vs BB SRP',
    correctSizing: 'pot',
    explanation: 'Bottom set on a wet board that just bricked. The turn K changes nothing for flush draws. Pot-sized bet charges draws the maximum while extracting value from top pair and two pair.',
    concepts: ['Set on wet board', 'Charge draws', 'Protection + value'],
  },
  {
    hand: 'A\u2663 K\u2666',
    board: '8\u2665 7\u2665 6\u2660',
    pot: 24,
    street: 'Flop',
    position: 'OOP',
    spot: 'SB vs BTN 3-Bet Pot',
    correctSizing: 'pot',
    explanation: 'In a 3-bet pot on 876, your range advantage as the 3-bettor is massive. AK has two overcards and a gutshot. Pot-sized c-bet is standard in 3-bet pots on coordinated boards to deny equity.',
    concepts: ['3-bet pot', 'Range advantage', 'Deny equity'],
  },
  {
    hand: 'Q\u2660 Q\u2663',
    board: '9\u2665 5\u2666 2\u2663 \u2502 J\u2665 \u2502 4\u2660',
    pot: 40,
    street: 'River',
    position: 'IP',
    spot: 'BTN vs BB SRP',
    correctSizing: 'twothirds',
    explanation: 'QQ on 952J4 is a clear value bet on the river. You beat all pairs below queens. 2/3 pot is the sweet spot — big enough to extract meaningful value, but not so big that only better hands call.',
    concepts: ['River value', 'Overpair', 'Sizing for value'],
  },
  {
    hand: 'A\u2665 2\u2665',
    board: 'K\u2660 9\u2663 4\u2665',
    pot: 7,
    street: 'Flop',
    position: 'IP',
    spot: 'BTN vs BB SRP',
    correctSizing: 'third',
    explanation: 'A2 with a backdoor flush draw on K94. Small c-bet is ideal — you have some equity, and a small size allows you to bluff profitably with your entire air range. If called, you can barrel hearts.',
    concepts: ['Backdoor draw', 'Small c-bet bluff', 'Range bet'],
  },
  {
    hand: '8\u2660 7\u2660',
    board: '6\u2663 5\u2666 2\u2665 \u2502 4\u2660',
    pot: 20,
    street: 'Turn',
    position: 'IP',
    spot: 'BTN vs BB SRP',
    correctSizing: 'overbet',
    explanation: 'You just made the nut straight. On 6524, an overbet is optimal because you\'re polarized — you either have the nuts or nothing. This sizing extracts maximum value from two pairs and sets.',
    concepts: ['Nut hand', 'Polarized overbet', 'Maximum value'],
  },
];

// ●●● MAIN COMPONENT ●●●
export default function SizingTrainer() {
  const [scenarioIdx, setScenarioIdx] = useState(0);
  const [selectedSizing, setSelectedSizing] = useState(null);
  const [score, setScore] = useState({ correct: 0, total: 0 });
  const [sizingStats, setSizingStats] = useState({});
  const [showAll, setShowAll] = useState(false);

  const scenario = SCENARIOS[scenarioIdx % SCENARIOS.length];

  const handleSelect = useCallback((sizingId) => {
    if (selectedSizing !== null) return;
    setSelectedSizing(sizingId);
    const isCorrect = sizingId === scenario.correctSizing;
    setScore(prev => ({ correct: prev.correct + (isCorrect ? 1 : 0), total: prev.total + 1 }));
    setSizingStats(prev => ({
      ...prev,
      [scenario.correctSizing]: {
        shown: (prev[scenario.correctSizing]?.shown || 0) + 1,
        correct: (prev[scenario.correctSizing]?.correct || 0) + (isCorrect ? 1 : 0),
      },
    }));
  }, [selectedSizing, scenario]);

  const nextScenario = useCallback(() => {
    setSelectedSizing(null);
    setScenarioIdx(prev => prev + 1);
  }, []);

  const correctSizingData = SIZINGS.find(s => s.id === scenario.correctSizing);

  return (
    <div style={{ background: 'rgba(15,23,42,0.6)', borderRadius: 12, padding: 20, border: '1px solid rgba(255,255,255,0.06)' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <h3 style={{ color: '#f1f5f9', fontSize: 18, fontWeight: 700, margin: 0 }}>
          Bet Sizing Trainer
        </h3>
        <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
          <span style={{
            padding: '4px 12px', borderRadius: 6, background: 'rgba(59,130,246,0.15)',
            color: '#3b82f6', fontSize: 12, fontWeight: 700,
          }}>
            {score.correct}/{score.total} ({score.total > 0 ? Math.round(score.correct / score.total * 100) : 0}%)
          </span>
          <span style={{ color: '#64748b', fontSize: 11 }}>
            Q {(scenarioIdx % SCENARIOS.length) + 1}/{SCENARIOS.length}
          </span>
        </div>
      </div>

      {/* ●●● SCENARIO CARD ●●● */}
      <div style={{
        background: 'rgba(0,0,0,0.2)', borderRadius: 10, padding: 16, marginBottom: 16,
        border: '1px solid rgba(255,255,255,0.06)',
      }}>
        {/* Hand + Board */}
        <div style={{ display: 'flex', gap: 20, alignItems: 'center', marginBottom: 12, flexWrap: 'wrap' }}>
          <div>
            <div style={{ color: '#64748b', fontSize: 10, fontWeight: 600, textTransform: 'uppercase', marginBottom: 4 }}>Your Hand</div>
            <div style={{ color: '#f1f5f9', fontSize: 22, fontWeight: 800, fontFamily: 'monospace', letterSpacing: 2 }}>
              {scenario.hand}
            </div>
          </div>
          <div>
            <div style={{ color: '#64748b', fontSize: 10, fontWeight: 600, textTransform: 'uppercase', marginBottom: 4 }}>Board</div>
            <div style={{ color: '#cbd5e1', fontSize: 18, fontWeight: 700, fontFamily: 'monospace', letterSpacing: 1 }}>
              {scenario.board}
            </div>
          </div>
          <div>
            <div style={{ color: '#64748b', fontSize: 10, fontWeight: 600, textTransform: 'uppercase', marginBottom: 4 }}>Pot</div>
            <div style={{ color: '#f59e0b', fontSize: 18, fontWeight: 700 }}>{scenario.pot}bb</div>
          </div>
        </div>

        {/* Meta tags */}
        <div style={{ display: 'flex', gap: 6, marginBottom: 16 }}>
          {[scenario.street, scenario.position, scenario.spot].map((tag, i) => (
            <span key={i} style={{
              padding: '3px 8px', borderRadius: 4, background: 'rgba(255,255,255,0.06)',
              color: '#94a3b8', fontSize: 11, fontWeight: 600,
            }}>
              {tag}
            </span>
          ))}
        </div>

        <div style={{ color: '#94a3b8', fontSize: 13, marginBottom: 16 }}>
          You decide to bet. What sizing do you choose?
        </div>

        {/* ●●● SIZING OPTIONS ●●● */}
        <div style={{ display: 'flex', gap: 8 }}>
          {SIZINGS.map(s => {
            const betAmount = (scenario.pot * s.fraction).toFixed(1);
            const isSelected = selectedSizing === s.id;
            const isCorrect = s.id === scenario.correctSizing;
            const showResult = selectedSizing !== null;

            return (
              <button key={s.id} onClick={() => handleSelect(s.id)} disabled={selectedSizing !== null}
                style={{
                  flex: 1, padding: '12px 8px', borderRadius: 8, border: 'none',
                  cursor: selectedSizing !== null ? 'default' : 'pointer',
                  background: showResult
                    ? isCorrect
                      ? 'rgba(34,197,94,0.2)'
                      : isSelected
                        ? 'rgba(239,68,68,0.2)'
                        : 'rgba(255,255,255,0.03)'
                    : 'rgba(255,255,255,0.06)',
                  border: showResult
                    ? isCorrect
                      ? '2px solid rgba(34,197,94,0.4)'
                      : isSelected
                        ? '2px solid rgba(239,68,68,0.4)'
                        : '2px solid transparent'
                    : '2px solid transparent',
                  transition: 'all 0.2s',
                }}
              >
                <div style={{
                  color: showResult ? (isCorrect ? '#22c55e' : isSelected ? '#ef4444' : '#64748b') : s.color,
                  fontSize: 18, fontWeight: 800, marginBottom: 2,
                }}>
                  {s.label}
                </div>
                <div style={{ color: '#94a3b8', fontSize: 11 }}>{betAmount}bb</div>
              </button>
            );
          })}
        </div>
      </div>

      {/* ●●● EXPLANATION ●●● */}
      {selectedSizing !== null && (
        <div style={{
          background: selectedSizing === scenario.correctSizing
            ? 'rgba(34,197,94,0.08)' : 'rgba(239,68,68,0.08)',
          borderRadius: 10, padding: 16, marginBottom: 16,
          border: `1px solid ${selectedSizing === scenario.correctSizing ? 'rgba(34,197,94,0.2)' : 'rgba(239,68,68,0.2)'}`,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
            <span style={{
              color: selectedSizing === scenario.correctSizing ? '#22c55e' : '#ef4444',
              fontSize: 14, fontWeight: 700,
            }}>
              {selectedSizing === scenario.correctSizing ? 'Correct!' : 'Incorrect'}
            </span>
            <span style={{ color: '#94a3b8', fontSize: 12 }}>
              Optimal: <span style={{ color: correctSizingData.color, fontWeight: 700 }}>{correctSizingData.label}</span> ({(scenario.pot * correctSizingData.fraction).toFixed(1)}bb)
            </span>
          </div>

          <div style={{ color: '#cbd5e1', fontSize: 13, lineHeight: 1.5, marginBottom: 12 }}>
            {scenario.explanation}
          </div>

          {/* Concepts */}
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {scenario.concepts.map((concept, i) => (
              <span key={i} style={{
                padding: '3px 8px', borderRadius: 4,
                background: 'rgba(139,92,246,0.15)', color: '#a78bfa',
                fontSize: 10, fontWeight: 600,
              }}>
                {concept}
              </span>
            ))}
          </div>

          <div style={{ marginTop: 12, textAlign: 'center' }}>
            <button onClick={nextScenario} style={{
              padding: '10px 28px', borderRadius: 8, border: 'none', cursor: 'pointer',
              background: 'linear-gradient(135deg, #3b82f6, #8b5cf6)', color: '#fff',
              fontSize: 14, fontWeight: 700,
            }}>
              Next Question
            </button>
          </div>
        </div>
      )}

      {/* ●●● STATS BY SIZING TYPE ●●● */}
      {score.total >= 3 && (
        <div style={{ background: 'rgba(0,0,0,0.2)', borderRadius: 8, padding: 12 }}>
          <div style={{ color: '#64748b', fontSize: 11, fontWeight: 600, textTransform: 'uppercase', marginBottom: 8 }}>
            Accuracy by Sizing
          </div>
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
            {SIZINGS.map(s => {
              const stat = sizingStats[s.id];
              if (!stat) return null;
              const pct = stat.shown > 0 ? Math.round(stat.correct / stat.shown * 100) : 0;
              return (
                <div key={s.id} style={{ textAlign: 'center' }}>
                  <div style={{ color: s.color, fontSize: 11, fontWeight: 700, marginBottom: 2 }}>{s.label}</div>
                  <div style={{ color: '#f1f5f9', fontSize: 16, fontWeight: 700 }}>{pct}%</div>
                  <div style={{ color: '#64748b', fontSize: 10 }}>{stat.correct}/{stat.shown}</div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
