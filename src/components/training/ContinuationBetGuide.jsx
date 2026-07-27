/**
 * ContinuationBetGuide — Complete C-Bet Strategy Guide
 * ●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●
 * Comprehensive guide covering c-bet strategy across all streets,
 * board textures, and positions. Interactive scenarios.
 */
import React, { useState } from 'react';

const BOARDS = [
  {
    texture: 'A♠ 7♦ 2♣', type: 'Dry A-high', color: '#10b981',
    ip: { freq: '75%', size: '25-33%', reason: 'Massive range advantage. Small size works because villain folds or has very few continues.' },
    oop: { freq: '50%', size: '33%', reason: 'Still good range advantage but OOP means less fold equity. Check more medium hands.' },
    tip: 'Range bet small on dry A-high boards. Villain has almost no raising range.',
  },
  {
    texture: 'J♥ T♥ 8♣', type: 'Wet Connected', color: '#ef4444',
    ip: { freq: '35%', size: '66-75%', reason: 'Board smashes both ranges. Only bet with strong hands/draws. Larger size to charge draws.' },
    oop: { freq: '25%', size: '75%', reason: 'Very dangerous board OOP. Check most range. Only bet with sets, two pair, big draws.' },
    tip: 'Check a LOT on wet connected boards. Both players have strong holdings.',
  },
  {
    texture: 'K♣ 5♦ 2♠', type: 'Dry K-high', color: '#3b82f6',
    ip: { freq: '70%', size: '25-33%', reason: 'Strong range advantage with all KK, AK, KQ combos. Small size extracts value and folds weak hands.' },
    oop: { freq: '45%', size: '33%', reason: 'Good board but check-raise frequency is higher OOP. Mix bets and checks.' },
    tip: 'Similar to A-high dry but slightly less extreme. K-high is still good for PFR.',
  },
  {
    texture: 'Q♠ Q♦ 6♣', type: 'Paired', color: '#8b5cf6',
    ip: { freq: '80%', size: '25%', reason: 'Almost pure range bet. Nobody has a Q very often. Tiny size with entire range is optimal.' },
    oop: { freq: '60%', size: '25%', reason: 'Still very high frequency. Paired boards compress ranges — small bets work great.' },
    tip: 'Paired boards = range bet small. The pair removes so many combos from both ranges.',
  },
  {
    texture: '6♣ 5♣ 4♦', type: 'Low Connected', color: '#f59e0b',
    ip: { freq: '25%', size: '50-66%', reason: 'Terrible board for PFR. BB has all the 78, 87, 34, suited connectors. Check back most range.' },
    oop: { freq: '20%', size: '66%', reason: 'Almost never c-bet OOP here. Defender has massive board advantage. Check and play defense.' },
    tip: 'Low connected boards strongly favor BB. Dramatically reduce c-bet frequency.',
  },
  {
    texture: 'T♠ 7♠ 3♠', type: 'Monotone', color: '#e879f9',
    ip: { freq: '40%', size: '50%', reason: 'Flush possibilities reduce range advantage. Bet with made flushes, strong pairs + flush draw. Medium size.' },
    oop: { freq: '30%', size: '50-66%', reason: 'Check most range. Bet with flushes and strong combo draws. Very polarized strategy.' },
    tip: 'Monotone boards = check more, bet bigger when you do bet. Polarized strategy.',
  },
];

function ContinuationBetGuide() {
  const [selected, setSelected] = useState(0);
  const [perspective, setPerspective] = useState('ip');
  const board = BOARDS[selected];
  const data = perspective === 'ip' ? board.ip : board.oop;

  try {
    return (
      <div style={{ padding: 20, background: 'rgba(0,0,0,0.3)', borderRadius: 12, border: '1px solid rgba(255,255,255,0.08)' }}>
        <h3 style={{ margin: '0 0 16px 0', fontSize: 18, color: '#06b6d4' }}>C-Bet Strategy Guide</h3>

        <div style={{ display: 'flex', gap: 4, marginBottom: 12, flexWrap: 'wrap' }}>
          {BOARDS.map((b, i) => (
            <button key={i} onClick={() => setSelected(i)} style={{
              padding: '5px 8px', borderRadius: 6, border: 'none', cursor: 'pointer', fontSize: 10, fontWeight: 600,
              background: selected === i ? b.color : 'rgba(255,255,255,0.06)',
              color: selected === i ? '#fff' : 'rgba(255,255,255,0.5)',
            }}>{b.type}</button>
          ))}
        </div>

        <div style={{ display: 'flex', gap: 6, marginBottom: 12 }}>
          {['ip', 'oop'].map(p => (
            <button key={p} onClick={() => setPerspective(p)} style={{
              flex: 1, padding: '6px', borderRadius: 6, border: 'none', cursor: 'pointer',
              background: perspective === p ? '#06b6d4' : 'rgba(255,255,255,0.06)',
              color: perspective === p ? '#000' : 'rgba(255,255,255,0.5)',
              fontSize: 12, fontWeight: 700, textTransform: 'uppercase',
            }}>{p === 'ip' ? 'In Position' : 'Out of Position'}</button>
          ))}
        </div>

        <div style={{ padding: 14, background: `${board.color}11`, borderRadius: 10, border: `1px solid ${board.color}33`, marginBottom: 16, textAlign: 'center' }}>
          <div style={{ fontSize: 26, fontWeight: 900, color: '#fff', letterSpacing: 4, marginBottom: 6 }}>{board.texture}</div>
          <div style={{ fontSize: 13, fontWeight: 700, color: board.color }}>{board.type}</div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 16 }}>
          <div style={{ padding: 12, background: 'rgba(255,255,255,0.04)', borderRadius: 8, textAlign: 'center' }}>
            <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.4)' }}>C-Bet Frequency</div>
            <div style={{ fontSize: 28, fontWeight: 900, color: board.color }}>{data.freq}</div>
          </div>
          <div style={{ padding: 12, background: 'rgba(255,255,255,0.04)', borderRadius: 8, textAlign: 'center' }}>
            <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.4)' }}>Bet Size</div>
            <div style={{ fontSize: 28, fontWeight: 900, color: '#3b82f6' }}>{data.size}</div>
          </div>
        </div>

        <div style={{ padding: 10, background: 'rgba(255,255,255,0.03)', borderRadius: 8, marginBottom: 10 }}>
          <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.8)', lineHeight: 1.6 }}>{data.reason}</div>
        </div>

        <div style={{ padding: 10, background: `${board.color}09`, borderRadius: 8, border: `1px solid ${board.color}22` }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: board.color, marginBottom: 2 }}>Key Insight</div>
          <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.7)', lineHeight: 1.6 }}>{board.tip}</div>
        </div>
      </div>
    );
  } catch (err) {
    return <div style={{ padding: 20, color: '#ef4444' }}>C-Bet Guide failed to load: {err.message}</div>;
  }
}

export default ContinuationBetGuide;
