/**
 * BoardCoverageAnalyzer — Range Board Coverage Analysis
 * ●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●
 * Analyze how well a range covers different board textures.
 * Shows which boards favor which positions.
 */
import React, { useState } from 'react';

const POSITIONS = [
  {
    name: 'UTG', color: '#ef4444',
    coverage: [
      { board: 'A-high dry', pct: 85, note: 'Many Ax combos, strong on A-high' },
      { board: 'K-high dry', pct: 78, note: 'KK, AK, KQs — good coverage' },
      { board: 'Q-high dry', pct: 70, note: 'QQ, AQ, KQs — decent but fewer combos' },
      { board: 'Low connected', pct: 35, note: 'Few suited connectors — poor coverage' },
      { board: 'Monotone', pct: 55, note: 'Has suited broadways but limited suits' },
      { board: 'Paired board', pct: 60, note: 'Pocket pairs help, but narrow range' },
    ],
  },
  {
    name: 'BTN', color: '#10b981',
    coverage: [
      { board: 'A-high dry', pct: 75, note: 'Wide Ax range but also weak Ax' },
      { board: 'K-high dry', pct: 72, note: 'Many Kx hands — good coverage' },
      { board: 'Q-high dry', pct: 68, note: 'QJ, QT, Q9 — wider Q coverage' },
      { board: 'Low connected', pct: 80, note: 'Suited connectors, gappers — best position' },
      { board: 'Monotone', pct: 75, note: 'More suited combos across all suits' },
      { board: 'Paired board', pct: 70, note: 'Many pocket pairs + wider range' },
    ],
  },
  {
    name: 'BB', color: '#3b82f6',
    coverage: [
      { board: 'A-high dry', pct: 60, note: 'Defends with some Ax but weaker combos' },
      { board: 'K-high dry', pct: 58, note: 'K9, K8, K7 — weaker Kx hands' },
      { board: 'Q-high dry', pct: 62, note: 'Q9, Q8, QT — wider Q range' },
      { board: 'Low connected', pct: 85, note: 'Defends with all suited connectors + gappers' },
      { board: 'Monotone', pct: 80, note: 'Widest range = most flush possibilities' },
      { board: 'Paired board', pct: 65, note: 'Random pairs hit boards well' },
    ],
  },
];

const BOARD_TYPES = [
  { type: 'A-high dry', example: 'A♠ 7♦ 2♣', favors: 'Preflop Raiser', reason: 'PFR has more strong Ax combos. Defender has weaker Ax.' },
  { type: 'K-high dry', example: 'K♣ 8♦ 3♠', favors: 'Preflop Raiser', reason: 'PFR has KK, AK, KQs. Good for c-betting.' },
  { type: 'Low connected', example: '8♥ 7♣ 5♦', favors: 'Big Blind', reason: 'BB defends with suited connectors that smash this board.' },
  { type: 'Monotone', example: 'T♠ 7♠ 3♠', favors: 'Position-dependent', reason: 'Whoever has more suited combos in that suit has advantage.' },
  { type: 'Paired board', example: 'Q♣ Q♦ 5♠', favors: 'Preflop Raiser', reason: 'PFR has more QQ, AQ, KQ. Board compresses ranges.' },
];

function BoardCoverageAnalyzer() {
  const [selectedPos, setSelectedPos] = useState(1);
  const [showGuide, setShowGuide] = useState(false);
  const pos = POSITIONS[selectedPos];

  try {
    return (
      <div style={{ padding: 20, background: 'rgba(0,0,0,0.3)', borderRadius: 12, border: '1px solid rgba(255,255,255,0.08)' }}>
        <h3 style={{ margin: '0 0 16px 0', fontSize: 18, color: '#f472b6' }}>Board Coverage Analyzer</h3>

        <div style={{ display: 'flex', gap: 6, marginBottom: 16 }}>
          {POSITIONS.map((p, i) => (
            <button key={p.name} onClick={() => setSelectedPos(i)} style={{
              flex: 1, padding: '8px 4px', borderRadius: 8, border: 'none', cursor: 'pointer',
              background: selectedPos === i ? p.color : 'rgba(255,255,255,0.06)',
              color: selectedPos === i ? '#fff' : 'rgba(255,255,255,0.5)',
              fontSize: 13, fontWeight: 700,
            }}>{p.name}</button>
          ))}
        </div>

        {/* Coverage bars */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 16 }}>
          {pos.coverage.map((c, i) => (
            <div key={c.board} style={{ padding: 8, background: 'rgba(255,255,255,0.03)', borderRadius: 8 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                <span style={{ fontSize: 12, fontWeight: 600, color: '#fff' }}>{c.board}</span>
                <span style={{ fontSize: 12, fontWeight: 800, color: c.pct >= 70 ? '#10b981' : c.pct >= 50 ? '#f59e0b' : '#ef4444' }}>{c.pct}%</span>
              </div>
              <div style={{ height: 8, background: 'rgba(255,255,255,0.06)', borderRadius: 4, overflow: 'hidden', marginBottom: 4 }}>
                <div style={{ height: '100%', width: `${c.pct}%`, borderRadius: 4, background: c.pct >= 70 ? '#10b981' : c.pct >= 50 ? '#f59e0b' : '#ef4444', transition: 'width 0.3s' }} />
              </div>
              <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.4)' }}>{c.note}</div>
            </div>
          ))}
        </div>

        {/* Board type guide */}
        <button onClick={() => setShowGuide(!showGuide)} style={{
          width: '100%', padding: '8px', borderRadius: 8, border: '1px solid rgba(244,114,182,0.2)',
          background: 'rgba(244,114,182,0.06)', color: '#f472b6', fontSize: 12, fontWeight: 600, cursor: 'pointer', marginBottom: showGuide ? 12 : 0,
        }}>{showGuide ? 'Hide' : 'Show'} Board Type Guide</button>

        {showGuide && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {BOARD_TYPES.map(b => (
              <div key={b.type} style={{ padding: 10, background: 'rgba(255,255,255,0.03)', borderRadius: 8 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                  <span style={{ fontSize: 12, fontWeight: 700, color: '#fff' }}>{b.type}</span>
                  <span style={{ fontSize: 11, color: '#f472b6', fontWeight: 600 }}>{b.example}</span>
                </div>
                <div style={{ fontSize: 11, color: '#f59e0b', marginBottom: 2 }}>Favors: {b.favors}</div>
                <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.5)' }}>{b.reason}</div>
              </div>
            ))}
          </div>
        )}
      </div>
    );
  } catch (err) {
    return <div style={{ padding: 20, color: '#ef4444' }}>Board Coverage failed to load: {err.message}</div>;
  }
}

export default BoardCoverageAnalyzer;
