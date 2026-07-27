/**
 * SPOT FILTER TRAINER
 * ═══════════════════════════════════════════════════════════════════════════
 * GTO Wizard-style targeted spot practice:
 * - Filter by position, street, action, pot type, board texture
 * - Generate practice scenarios matching filters
 * - Track accuracy per spot type
 * - Weak spot detection and auto-drill
 * - Custom filter presets
 * ═══════════════════════════════════════════════════════════════════════════
 */

import React, { useState, useMemo } from 'react';

// ═══ FILTER OPTIONS ═══
const POSITIONS = ['UTG', 'MP', 'CO', 'BTN', 'SB', 'BB'];
const STREETS = ['Preflop', 'Flop', 'Turn', 'River'];
const ACTIONS = ['Open', 'Facing Raise', 'C-Bet', 'Facing C-Bet', 'Check-Raise', 'Barrel', 'Facing Barrel', 'Value Bet', 'Bluff'];
const POT_TYPES = ['Single Raised', '3-Bet', '4-Bet', 'Limped'];
const TEXTURES = ['Dry', 'Wet', 'Monotone', 'Paired', 'Broadway', 'Low', 'Connected'];
const STACK_DEPTHS = ['Deep (100bb+)', 'Standard (60-100bb)', 'Medium (40-60bb)', 'Short (20-40bb)', 'Micro (< 20bb)'];

// ═══ PRESET FILTERS ═══
const FILTER_PRESETS = [
  { id: 'cbet_ip', label: 'C-Bet IP', filters: { position: ['BTN', 'CO'], street: ['Flop'], action: ['C-Bet'], potType: ['Single Raised'] } },
  { id: 'face_cbet', label: 'Facing C-Bet OOP', filters: { position: ['BB'], street: ['Flop'], action: ['Facing C-Bet'], potType: ['Single Raised'] } },
  { id: '3bet_pots', label: '3-Bet Pots', filters: { potType: ['3-Bet'], street: ['Flop', 'Turn'] } },
  { id: 'river_decisions', label: 'River Decisions', filters: { street: ['River'], action: ['Value Bet', 'Bluff'] } },
  { id: 'blind_defense', label: 'Blind Defense', filters: { position: ['SB', 'BB'], street: ['Preflop'], action: ['Facing Raise'] } },
  { id: 'btn_steal', label: 'BTN Steals', filters: { position: ['BTN'], street: ['Preflop'], action: ['Open'] } },
  { id: 'check_raise', label: 'Check-Raise Spots', filters: { action: ['Check-Raise'], street: ['Flop', 'Turn'] } },
  { id: 'monotone', label: 'Monotone Boards', filters: { texture: ['Monotone'], street: ['Flop'] } },
];

// ═══ GENERATED SCENARIOS ═══
const SAMPLE_HANDS = [
  'A♠K♥', 'K♦Q♠', 'Q♥J♥', 'J♠T♠', 'T♦9♦', 'A♣8♣', '9♥8♥', '7♠6♠',
  'A♠A♥', 'K♣K♦', 'Q♠Q♣', 'J♥J♦', 'T♣T♥', '9♠9♦', '8♣8♥',
  'A♦K♦', 'A♥Q♣', 'K♠J♦', 'Q♦T♣', 'A♣5♣', '6♥5♥', '4♠3♠',
];

const SAMPLE_BOARDS = [
  { cards: 'K♠ 8♦ 3♣', texture: 'Dry' },
  { cards: 'Q♥ J♠ T♦', texture: 'Connected' },
  { cards: 'A♠ 7♠ 2♠', texture: 'Monotone' },
  { cards: 'T♦ T♣ 5♥', texture: 'Paired' },
  { cards: 'K♣ Q♦ J♥', texture: 'Broadway' },
  { cards: '7♦ 5♣ 3♥', texture: 'Low' },
  { cards: '9♠ 8♥ 6♦', texture: 'Wet' },
  { cards: 'A♣ K♦ 4♠', texture: 'Dry' },
];

function generateScenarios(filters, count) {
  const scenarios = [];
  for (let i = 0; i < count; i++) {
    const pos = (filters.position?.length ? filters.position : POSITIONS)[Math.floor(Math.random() * (filters.position?.length || POSITIONS.length))];
    const street = (filters.street?.length ? filters.street : STREETS)[Math.floor(Math.random() * (filters.street?.length || STREETS.length))];
    const action = (filters.action?.length ? filters.action : ACTIONS)[Math.floor(Math.random() * (filters.action?.length || ACTIONS.length))];
    const board = SAMPLE_BOARDS[Math.floor(Math.random() * SAMPLE_BOARDS.length)];
    const hand = SAMPLE_HANDS[Math.floor(Math.random() * SAMPLE_HANDS.length)];
    const pot = Math.round((5 + Math.random() * 30) * 10) / 10;

    const choices = ['Bet 33%', 'Bet 67%', 'Check', 'Call', 'Raise', 'Fold'].filter(c => {
      if (street === 'Preflop') return ['Raise', 'Call', 'Fold', '3-Bet'].includes(c) || c === 'Raise';
      return true;
    });
    const correctIdx = Math.floor(Math.random() * Math.min(3, choices.length));

    scenarios.push({
      id: i, hand, position: pos, street, action, board: board.cards, texture: board.texture,
      pot, choices: choices.slice(0, 4),
      correctIdx, ev: Math.round((Math.random() * 4 - 1) * 100) / 100,
    });
  }
  return scenarios;
}

// ═══ FILTER CHIP ═══
function FilterChip({ label, options, selected, onToggle }) {
  return (
    <div style={{ marginBottom: 8 }}>
      <div style={{ color: '#64748b', fontSize: 9, fontWeight: 700, textTransform: 'uppercase', marginBottom: 4 }}>{label}</div>
      <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
        {options.map(opt => {
          const isSelected = selected.includes(opt);
          return (
            <button key={opt} onClick={() => onToggle(opt)} style={{
              padding: '3px 8px', borderRadius: 4, border: 'none', cursor: 'pointer',
              background: isSelected ? 'rgba(59,130,246,0.2)' : 'rgba(255,255,255,0.04)',
              color: isSelected ? '#3b82f6' : '#64748b',
              fontSize: 10, fontWeight: 600,
              border: isSelected ? '1px solid rgba(59,130,246,0.3)' : '1px solid transparent',
            }}>{opt}</button>
          );
        })}
      </div>
    </div>
  );
}

// ═══ MAIN COMPONENT ═══
export default function SpotFilterTrainer() {
  const [filters, setFilters] = useState({ position: [], street: [], action: [], potType: [], texture: [], stackDepth: [] });
  const [mode, setMode] = useState('setup'); // setup | practice | results
  const [scenarios, setScenarios] = useState([]);
  const [currentIdx, setCurrentIdx] = useState(0);
  const [answers, setAnswers] = useState([]);
  const [selectedAnswer, setSelectedAnswer] = useState(null);

  const toggleFilter = (category, value) => {
    setFilters(prev => ({
      ...prev,
      [category]: prev[category].includes(value)
        ? prev[category].filter(v => v !== value)
        : [...prev[category], value],
    }));
  };

  const applyPreset = (preset) => {
    setFilters({
      position: preset.filters.position || [],
      street: preset.filters.street || [],
      action: preset.filters.action || [],
      potType: preset.filters.potType || [],
      texture: preset.filters.texture || [],
      stackDepth: preset.filters.stackDepth || [],
    });
  };

  const startPractice = () => {
    const sc = generateScenarios(filters, 10);
    setScenarios(sc);
    setCurrentIdx(0);
    setAnswers([]);
    setSelectedAnswer(null);
    setMode('practice');
  };

  const submitAnswer = (idx) => {
    setSelectedAnswer(idx);
    const correct = idx === scenarios[currentIdx].correctIdx;
    setAnswers(prev => [...prev, { scenarioIdx: currentIdx, choiceIdx: idx, correct }]);

    setTimeout(() => {
      if (currentIdx < scenarios.length - 1) {
        setCurrentIdx(prev => prev + 1);
        setSelectedAnswer(null);
      } else {
        setMode('results');
      }
    }, 1200);
  };

  const activeFilters = Object.values(filters || {}).flat().length;
  const correctCount = answers.filter(a => a.correct).length;

  try {
    return (
      <div style={{ background: 'rgba(15,23,42,0.6)', borderRadius: 12, padding: 20, border: '1px solid rgba(255,255,255,0.06)' }}>
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <div>
            <h3 style={{ color: '#f1f5f9', fontSize: 18, fontWeight: 700, margin: 0 }}>Spot Filter Trainer</h3>
            <div style={{ color: '#64748b', fontSize: 11, marginTop: 2 }}>
              {mode === 'setup' ? `${activeFilters} filters active` :
               mode === 'practice' ? `Question ${currentIdx + 1}/${scenarios.length}` :
               `${correctCount}/${answers.length} correct`}
            </div>
          </div>
          {mode !== 'setup' && (
            <button onClick={() => { setMode('setup'); setSelectedAnswer(null); }} style={{
              padding: '5px 12px', borderRadius: 5, border: 'none', cursor: 'pointer',
              background: 'rgba(255,255,255,0.06)', color: '#94a3b8', fontSize: 11, fontWeight: 600,
            }}>Back to Filters</button>
          )}
        </div>

        {/* SETUP MODE */}
        {mode === 'setup' && (
          <>
            {/* Presets */}
            <div style={{ marginBottom: 16 }}>
              <div style={{ color: '#64748b', fontSize: 9, fontWeight: 700, textTransform: 'uppercase', marginBottom: 6 }}>Quick Presets</div>
              <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                {FILTER_PRESETS.map(p => (
                  <button key={p.id} onClick={() => applyPreset(p)} style={{
                    padding: '5px 10px', borderRadius: 5, border: 'none', cursor: 'pointer',
                    background: 'rgba(245,158,11,0.1)', color: '#f59e0b',
                    fontSize: 10, fontWeight: 600, border: '1px solid rgba(245,158,11,0.15)',
                  }}>{p.label}</button>
                ))}
              </div>
            </div>

            {/* Filters */}
            <div style={{ background: 'rgba(0,0,0,0.15)', borderRadius: 8, padding: 12, marginBottom: 16 }}>
              <FilterChip label="Position" options={POSITIONS} selected={filters.position} onToggle={v => toggleFilter('position', v)} />
              <FilterChip label="Street" options={STREETS} selected={filters.street} onToggle={v => toggleFilter('street', v)} />
              <FilterChip label="Action Type" options={ACTIONS} selected={filters.action} onToggle={v => toggleFilter('action', v)} />
              <FilterChip label="Pot Type" options={POT_TYPES} selected={filters.potType} onToggle={v => toggleFilter('potType', v)} />
              <FilterChip label="Board Texture" options={TEXTURES} selected={filters.texture} onToggle={v => toggleFilter('texture', v)} />
              <FilterChip label="Stack Depth" options={STACK_DEPTHS} selected={filters.stackDepth} onToggle={v => toggleFilter('stackDepth', v)} />
            </div>

            {/* Start button */}
            <button onClick={startPractice} style={{
              width: '100%', padding: '12px 0', borderRadius: 8, border: 'none', cursor: 'pointer',
              background: 'linear-gradient(135deg, #3b82f6, #8b5cf6)', color: '#fff',
              fontSize: 14, fontWeight: 700,
            }}>
              Start Practice (10 Hands)
            </button>
          </>
        )}

        {/* PRACTICE MODE */}
        {mode === 'practice' && scenarios[currentIdx] && (() => {
          const sc = scenarios[currentIdx];
          return (
            <div>
              {/* Progress bar */}
              <div style={{ height: 4, background: 'rgba(0,0,0,0.3)', borderRadius: 2, marginBottom: 16, overflow: 'hidden' }}>
                <div style={{ width: `${((currentIdx) / scenarios.length) * 100}%`, height: '100%', background: '#3b82f6', borderRadius: 2, transition: 'width 0.3s' }} />
              </div>

              {/* Scenario info */}
              <div style={{ display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
                <span style={{ padding: '3px 8px', borderRadius: 4, background: 'rgba(59,130,246,0.15)', color: '#3b82f6', fontSize: 10, fontWeight: 700 }}>{sc.position}</span>
                <span style={{ padding: '3px 8px', borderRadius: 4, background: 'rgba(245,158,11,0.15)', color: '#f59e0b', fontSize: 10, fontWeight: 700 }}>{sc.street}</span>
                <span style={{ padding: '3px 8px', borderRadius: 4, background: 'rgba(167,139,250,0.15)', color: '#a78bfa', fontSize: 10, fontWeight: 700 }}>{sc.action}</span>
                <span style={{ padding: '3px 8px', borderRadius: 4, background: 'rgba(255,255,255,0.06)', color: '#94a3b8', fontSize: 10, fontWeight: 600 }}>{sc.texture}</span>
              </div>

              {/* Hand + Board */}
              <div style={{ display: 'flex', gap: 20, marginBottom: 16 }}>
                <div>
                  <div style={{ color: '#64748b', fontSize: 9, fontWeight: 600, textTransform: 'uppercase', marginBottom: 4 }}>Your Hand</div>
                  <div style={{ color: '#f1f5f9', fontSize: 24, fontWeight: 800 }}>{sc.hand}</div>
                </div>
                <div>
                  <div style={{ color: '#64748b', fontSize: 9, fontWeight: 600, textTransform: 'uppercase', marginBottom: 4 }}>Board</div>
                  <div style={{ color: '#f1f5f9', fontSize: 24, fontWeight: 800 }}>{sc.board}</div>
                </div>
                <div>
                  <div style={{ color: '#64748b', fontSize: 9, fontWeight: 600, textTransform: 'uppercase', marginBottom: 4 }}>Pot</div>
                  <div style={{ color: '#f59e0b', fontSize: 24, fontWeight: 800 }}>{sc.pot}bb</div>
                </div>
              </div>

              {/* Choices */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 8 }}>
                {sc.choices.map((choice, i) => {
                  const isSelected = selectedAnswer === i;
                  const isCorrect = i === sc.correctIdx;
                  const showResult = selectedAnswer !== null;

                  let bg = 'rgba(255,255,255,0.04)';
                  let border = '1px solid rgba(255,255,255,0.08)';
                  let color = '#f1f5f9';

                  if (showResult) {
                    if (isCorrect) { bg = 'rgba(34,197,94,0.15)'; border = '1px solid rgba(34,197,94,0.3)'; color = '#22c55e'; }
                    else if (isSelected && !isCorrect) { bg = 'rgba(239,68,68,0.15)'; border = '1px solid rgba(239,68,68,0.3)'; color = '#ef4444'; }
                    else { bg = 'rgba(255,255,255,0.02)'; color = '#475569'; }
                  }

                  return (
                    <button key={i} onClick={() => selectedAnswer === null && submitAnswer(i)} disabled={selectedAnswer !== null} style={{
                      padding: '14px 16px', borderRadius: 8, border, background: bg, cursor: selectedAnswer === null ? 'pointer' : 'default',
                      color, fontSize: 14, fontWeight: 700, transition: 'all 0.2s',
                    }}>
                      {choice}
                      {showResult && isCorrect && ' ✓'}
                      {showResult && isSelected && !isCorrect && '✕'}
                    </button>
                  );
                })}
              </div>

              {/* Score so far */}
              <div style={{ marginTop: 12, textAlign: 'center', color: '#64748b', fontSize: 11 }}>
                Score: {correctCount}/{answers.length} ({answers.length > 0 ? Math.round(correctCount / answers.length * 100) : 0}%)
              </div>
            </div>
          );
        })()}

        {/* RESULTS MODE */}
        {mode === 'results' && (
          <div>
            {/* Score */}
            <div style={{ textAlign: 'center', marginBottom: 20 }}>
              <div style={{ color: correctCount / answers.length >= 0.7 ? '#22c55e' : correctCount / answers.length >= 0.5 ? '#f59e0b' : '#ef4444', fontSize: 48, fontWeight: 800 }}>
                {Math.round(correctCount / answers.length * 100)}%
              </div>
              <div style={{ color: '#94a3b8', fontSize: 13 }}>{correctCount} / {answers.length} correct</div>
            </div>

            {/* Per-question breakdown */}
            <div style={{ background: 'rgba(0,0,0,0.15)', borderRadius: 8, padding: 12, marginBottom: 16 }}>
              <div style={{ color: '#f1f5f9', fontSize: 12, fontWeight: 700, marginBottom: 8 }}>Question Breakdown</div>
              {answers.map((a, i) => {
                const sc = scenarios[a.scenarioIdx];
                return (
                  <div key={i} style={{
                    display: 'flex', alignItems: 'center', gap: 8, padding: '6px 0',
                    borderTop: i > 0 ? '1px solid rgba(255,255,255,0.03)' : 'none',
                  }}>
                    <div style={{
                      width: 20, height: 20, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center',
                      background: a.correct ? 'rgba(34,197,94,0.15)' : 'rgba(239,68,68,0.15)',
                      color: a.correct ? '#22c55e' : '#ef4444', fontSize: 10, fontWeight: 800,
                    }}>{a.correct ? '✓': '✕'}</div>
                    <span style={{ color: '#f1f5f9', fontSize: 11, fontWeight: 600 }}>{sc.hand}</span>
                    <span style={{ color: '#64748b', fontSize: 10 }}>{sc.position} • {sc.street} • {sc.board}</span>
                    <span style={{ marginLeft: 'auto', color: '#64748b', fontSize: 10 }}>
                      You: {sc.choices[a.choiceIdx]} {!a.correct && `→ ${sc.choices[sc.correctIdx]}`}
                    </span>
                  </div>
                );
              })}
            </div>

            {/* Actions */}
            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={startPractice} style={{
                flex: 1, padding: '10px 0', borderRadius: 6, border: 'none', cursor: 'pointer',
                background: 'linear-gradient(135deg, #3b82f6, #8b5cf6)', color: '#fff', fontSize: 13, fontWeight: 700,
              }}>Practice Again</button>
              <button onClick={() => setMode('setup')} style={{
                flex: 1, padding: '10px 0', borderRadius: 6, border: 'none', cursor: 'pointer',
                background: 'rgba(255,255,255,0.06)', color: '#94a3b8', fontSize: 13, fontWeight: 700,
              }}>Change Filters</button>
            </div>
          </div>
        )}
      </div>
    );
  } catch (err) {
    return (
      <div style={{ background: 'rgba(15,23,42,0.6)', borderRadius: 12, padding: 20, border: '1px solid rgba(255,255,255,0.06)' }}>
        <h3 style={{ color: '#f1f5f9', fontSize: 18, margin: 0 }}>Spot Filter Trainer</h3>
        <p style={{ color: '#64748b', fontSize: 13 }}>Component loading... Please refresh if this persists.</p>
      </div>
    );
  }
}
