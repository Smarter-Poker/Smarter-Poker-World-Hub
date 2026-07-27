/**
 * BoardTextureQuiz — GTO Wizard-Style Board Texture Classification Quiz
 * ═══════════════════════════════════════════════════════════════════════════
 * Quiz players on identifying board textures, connectedness, and optimal
 * strategic adjustments for different flop/turn/river textures.
 */
import React, { useState, useCallback } from 'react';

const BOARDS = [
  {
    id: 1, cards: 'A♠ 7♦ 2♣', texture: 'Dry Rainbow',
    properties: { wet: false, monotone: false, paired: false, connected: false, broadway: false },
    strategy: 'High c-bet frequency with small sizing. Range advantage to preflop aggressor. Minimal draws available.',
    cbetFreq: 82, preferredSize: '33%',
  },
  {
    id: 2, cards: 'J♥ T♥ 8♠', texture: 'Wet Two-Tone',
    properties: { wet: true, monotone: false, paired: false, connected: true, broadway: false },
    strategy: 'Reduce c-bet frequency. Many draws available. Use larger sizing when betting. Check strong hands for protection.',
    cbetFreq: 45, preferredSize: '67%',
  },
  {
    id: 3, cards: '6♣ 5♣ 4♣', texture: 'Monotone Connected',
    properties: { wet: true, monotone: true, paired: false, connected: true, broadway: false },
    strategy: 'Very low c-bet frequency. Board heavily favors defending range. Only bet made flushes and nut draws.',
    cbetFreq: 22, preferredSize: '33%',
  },
  {
    id: 4, cards: 'K♠ K♦ 5♥', texture: 'Paired High',
    properties: { wet: false, monotone: false, paired: true, connected: false, broadway: true },
    strategy: 'High c-bet frequency. Trip Kx is rare. Leverage range advantage with small bets. Few bad turn cards.',
    cbetFreq: 78, preferredSize: '33%',
  },
  {
    id: 5, cards: 'Q♥ J♦ T♠', texture: 'Broadway Connected',
    properties: { wet: true, monotone: false, paired: false, connected: true, broadway: true },
    strategy: 'Mixed strategy. Both ranges connect heavily. Straights possible. Larger sizing with strong hands, check medium.',
    cbetFreq: 40, preferredSize: '67%',
  },
  {
    id: 6, cards: '9♠ 4♦ 2♥', texture: 'Dry Low',
    properties: { wet: false, monotone: false, paired: false, connected: false, broadway: false },
    strategy: 'High c-bet frequency. Preflop raiser overpairs dominate. Small sizing with wide range. Board favors aggressor.',
    cbetFreq: 75, preferredSize: '33%',
  },
  {
    id: 7, cards: '8♥ 7♥ 6♦', texture: 'Wet Connected',
    properties: { wet: true, monotone: false, paired: false, connected: true, broadway: false },
    strategy: 'Very dynamic board. Many straights and draws. Reduce c-bet frequency significantly. Position is crucial.',
    cbetFreq: 35, preferredSize: '75%',
  },
  {
    id: 8, cards: 'A♦ A♣ 8♠', texture: 'Paired Ace',
    properties: { wet: false, monotone: false, paired: true, connected: false, broadway: true },
    strategy: 'Extreme range advantage for preflop raiser. Very high c-bet frequency. Trip aces almost always in raiser range.',
    cbetFreq: 88, preferredSize: '33%',
  },
];

const TEXTURE_TYPES = ['Dry Rainbow', 'Wet Two-Tone', 'Monotone Connected', 'Paired High', 'Broadway Connected', 'Dry Low', 'Wet Connected', 'Paired Ace'];

function BoardTextureQuiz() {
  const [currentIdx, setCurrentIdx] = useState(0);
  const [phase, setPhase] = useState('classify'); // classify | properties | strategy
  const [selectedTexture, setSelectedTexture] = useState(null);
  const [selectedProps, setSelectedProps] = useState({});
  const [selectedFreq, setSelectedFreq] = useState(null);
  const [stats, setStats] = useState({ correct: 0, total: 0 });

  const board = BOARDS[currentIdx];

  const checkClassification = useCallback(() => {
    const correct = selectedTexture === board.texture;
    setStats(prev => ({ correct: prev.correct + (correct ? 1 : 0), total: prev.total + 1 }));
    setPhase('properties');
  }, [selectedTexture, board]);

  const checkProperties = useCallback(() => {
    const propKeys = Object.keys(board.properties || {});
    const correctCount = propKeys.filter(k => (selectedProps[k] || false) === board.properties[k]).length;
    setStats(prev => ({ correct: prev.correct + (correctCount === propKeys.length ? 1 : 0), total: prev.total + 1 }));
    setPhase('strategy');
  }, [selectedProps, board]);

  const checkFrequency = useCallback(() => {
    const diff = Math.abs((selectedFreq || 0) - board.cbetFreq);
    const correct = diff <= 15;
    setStats(prev => ({ correct: prev.correct + (correct ? 1 : 0), total: prev.total + 1 }));
    nextBoard();
  }, [selectedFreq, board]);

  const nextBoard = useCallback(() => {
    setCurrentIdx((currentIdx + 1) % BOARDS.length);
    setPhase('classify');
    setSelectedTexture(null);
    setSelectedProps({});
    setSelectedFreq(null);
  }, [currentIdx]);

  const accuracy = stats.total > 0 ? Math.round((stats.correct / stats.total) * 100) : 0;

  try {
    return (
      <div style={{ padding: 20, background: 'rgba(0,0,0,0.3)', borderRadius: 12, border: '1px solid rgba(255,255,255,0.08)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <h3 style={{ margin: 0, fontSize: 18, color: '#f43f5e' }}>Board Texture Quiz</h3>
          <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.5)' }}>
            {stats.correct}/{stats.total} ({accuracy}%) • Board {currentIdx + 1}/{BOARDS.length}
          </span>
        </div>

        {/* Board Display */}
        <div style={{ textAlign: 'center', padding: 24, background: 'rgba(244,63,94,0.06)', borderRadius: 12, border: '1px solid rgba(244,63,94,0.15)', marginBottom: 20 }}>
          <div style={{ fontSize: 42, fontWeight: 900, color: '#fff', letterSpacing: 10 }}>{board.cards}</div>
          <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.4)', marginTop: 6 }}>
            Step {phase === 'classify' ? 1 : phase === 'properties' ? 2 : 3} of 3
          </div>
        </div>

        {/* Phase 1: Classify */}
        {phase === 'classify' && (
          <div>
            <div style={{ fontSize: 14, fontWeight: 600, color: 'rgba(255,255,255,0.7)', marginBottom: 12, textAlign: 'center' }}>
              What texture is this board?
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 6, marginBottom: 12 }}>
              {TEXTURE_TYPES.map(t => (
                <button key={t} onClick={() => setSelectedTexture(t)} style={{
                  padding: '10px 12px', borderRadius: 8, border: `1px solid ${selectedTexture === t ? 'rgba(244,63,94,0.4)' : 'rgba(255,255,255,0.06)'}`,
                  background: selectedTexture === t ? 'rgba(244,63,94,0.12)' : 'rgba(255,255,255,0.03)',
                  color: selectedTexture === t ? '#f43f5e' : 'rgba(255,255,255,0.7)',
                  fontSize: 12, fontWeight: 600, cursor: 'pointer',
                }}>{t}</button>
              ))}
            </div>
            {selectedTexture && (
              <div style={{ textAlign: 'center' }}>
                <button onClick={checkClassification} style={{
                  padding: '10px 28px', borderRadius: 8, border: 'none', fontSize: 14, fontWeight: 700, cursor: 'pointer', background: '#f43f5e', color: '#fff',
                }}>Check →</button>
                <div style={{ marginTop: 8, fontSize: 14, fontWeight: 700, color: selectedTexture === board.texture ? '#10b981' : '#ef4444' }}>
                  {selectedTexture === board.texture ? '✓ Correct!': `✕ It's ${board.texture}`}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Phase 2: Properties */}
        {phase === 'properties' && (
          <div>
            <div style={{ fontSize: 14, fontWeight: 600, color: 'rgba(255,255,255,0.7)', marginBottom: 12, textAlign: 'center' }}>
              Select all properties that apply:
            </div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'center', marginBottom: 12 }}>
              {Object.keys(board.properties || {}).map(prop => (
                <button key={prop} onClick={() => setSelectedProps(prev => ({ ...prev, [prop]: !prev[prop] }))} style={{
                  padding: '8px 16px', borderRadius: 8, fontSize: 12, fontWeight: 600, cursor: 'pointer',
                  background: selectedProps[prop] ? 'rgba(244,63,94,0.15)' : 'rgba(255,255,255,0.04)',
                  color: selectedProps[prop] ? '#f43f5e' : 'rgba(255,255,255,0.6)',
                  border: `1px solid ${selectedProps[prop] ? 'rgba(244,63,94,0.3)' : 'rgba(255,255,255,0.08)'}`,
                  textTransform: 'capitalize',
                }}>{prop}</button>
              ))}
            </div>
            <div style={{ textAlign: 'center' }}>
              <button onClick={checkProperties} style={{
                padding: '10px 28px', borderRadius: 8, border: 'none', fontSize: 14, fontWeight: 700, cursor: 'pointer', background: '#f43f5e', color: '#fff',
              }}>Check →</button>
              <div style={{ display: 'flex', gap: 8, justifyContent: 'center', marginTop: 8, flexWrap: 'wrap' }}>
                {Object.entries(board.properties || {}).map(([k, v]) => (
                  <span key={k} style={{
                    fontSize: 11, padding: '2px 8px', borderRadius: 4,
                    background: (selectedProps[k] || false) === v ? 'rgba(16,185,129,0.15)' : 'rgba(239,68,68,0.15)',
                    color: (selectedProps[k] || false) === v ? '#10b981' : '#ef4444',
                    textTransform: 'capitalize',
                  }}>{k}: {v ? 'Yes' : 'No'}</span>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Phase 3: Strategy */}
        {phase === 'strategy' && (
          <div>
            <div style={{ fontSize: 14, fontWeight: 600, color: 'rgba(255,255,255,0.7)', marginBottom: 12, textAlign: 'center' }}>
              Estimate the optimal c-bet frequency (%):
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, justifyContent: 'center', marginBottom: 12 }}>
              <input type="range" min={10} max={95} step={5} value={selectedFreq || 50} onChange={e => setSelectedFreq(parseInt(e.target.value))} style={{ width: 200, accentColor: '#f43f5e' }} />
              <span style={{ fontSize: 18, fontWeight: 800, color: '#f43f5e', minWidth: 50 }}>{selectedFreq || 50}%</span>
            </div>
            <div style={{ textAlign: 'center', marginBottom: 12 }}>
              <button onClick={checkFrequency} style={{
                padding: '10px 28px', borderRadius: 8, border: 'none', fontSize: 14, fontWeight: 700, cursor: 'pointer', background: '#f43f5e', color: '#fff',
              }}>Submit →</button>
            </div>
            <div style={{ padding: 12, background: 'rgba(244,63,94,0.06)', borderRadius: 8, border: '1px solid rgba(244,63,94,0.12)' }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: '#f43f5e', marginBottom: 4 }}>Optimal: {board.cbetFreq}% at {board.preferredSize}</div>
              <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.8)', lineHeight: 1.6 }}>{board.strategy}</div>
            </div>
          </div>
        )}
      </div>
    );
  } catch (err) {
    return <div style={{ padding: 20, color: '#ef4444' }}>Board Texture Quiz failed to load: {err.message}</div>;
  }
}

export default BoardTextureQuiz;
