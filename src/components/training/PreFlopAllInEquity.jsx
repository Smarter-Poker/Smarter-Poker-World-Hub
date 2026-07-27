/**
 * PreFlopAllInEquity — Preflop All-In Equity Matchup Calculator
 * ●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●
 * Quick reference for preflop all-in equity matchups. Shows common
 * hand-vs-hand and hand-vs-range equity.
 */
import React, { useState } from 'react';

const MATCHUPS = [
  { hand1: 'AA', hand2: 'KK', eq1: 81.9, eq2: 18.1, category: 'Overpair vs Underpair' },
  { hand1: 'AA', hand2: 'AKs', eq1: 87.2, eq2: 12.8, category: 'Pair vs Dominated' },
  { hand1: 'AA', hand2: 'AKo', eq1: 93.1, eq2: 6.9, category: 'Pair vs Dominated' },
  { hand1: 'KK', hand2: 'AKo', eq1: 69.2, eq2: 30.8, category: 'Pair vs Overcards' },
  { hand1: 'QQ', hand2: 'AKs', eq1: 54.1, eq2: 45.9, category: 'Classic Flip' },
  { hand1: 'QQ', hand2: 'AKo', eq1: 56.6, eq2: 43.4, category: 'Classic Flip' },
  { hand1: 'JJ', hand2: 'AKs', eq1: 53.8, eq2: 46.2, category: 'Classic Flip' },
  { hand1: 'TT', hand2: 'AKo', eq1: 56.9, eq2: 43.1, category: 'Pair vs Overcards' },
  { hand1: 'AKs', hand2: 'QJs', eq1: 62.4, eq2: 37.6, category: 'Big Cards vs Suited' },
  { hand1: 'AKs', hand2: '87s', eq1: 61.5, eq2: 38.5, category: 'Big vs Connected' },
  { hand1: 'AA', hand2: '22', eq1: 82.4, eq2: 17.6, category: 'Overpair vs Underpair' },
  { hand1: '99', hand2: 'AKs', eq1: 53.3, eq2: 46.7, category: 'Classic Flip' },
  { hand1: 'AKo', hand2: 'AQo', eq1: 73.9, eq2: 26.1, category: 'Domination' },
  { hand1: 'KQs', hand2: 'T9s', eq1: 58.7, eq2: 41.3, category: 'High vs Connected' },
  { hand1: 'AAs', hand2: 'Random', eq1: 85.2, eq2: 14.8, category: 'vs Random' },
  { hand1: 'KKs', hand2: 'Random', eq1: 82.3, eq2: 17.7, category: 'vs Random' },
  { hand1: '72o', hand2: 'Random', eq1: 34.6, eq2: 65.4, category: 'Worst Hand' },
];

const CATEGORIES = ['All', 'Classic Flip', 'Overpair vs Underpair', 'Pair vs Overcards', 'Domination', 'vs Random'];

function PreFlopAllInEquity() {
  const [filter, setFilter] = useState('All');
  const [showDetail, setShowDetail] = useState(null);

  const filtered = filter === 'All' ? MATCHUPS : MATCHUPS.filter(m => m.category === filter);

  try {
    return (
      <div style={{ padding: 20, background: 'rgba(0,0,0,0.3)', borderRadius: 12, border: '1px solid rgba(255,255,255,0.08)' }}>
        <h3 style={{ margin: '0 0 16px 0', fontSize: 18, color: '#e879f9' }}>Preflop All-In Equity</h3>

        <div style={{ display: 'flex', gap: 4, marginBottom: 16, flexWrap: 'wrap' }}>
          {CATEGORIES.map(c => (
            <button key={c} onClick={() => setFilter(c)} style={{
              padding: '4px 10px', borderRadius: 6, fontSize: 10, fontWeight: 600, cursor: 'pointer',
              background: filter === c ? '#e879f9' : 'rgba(255,255,255,0.06)',
              color: filter === c ? '#000' : 'rgba(255,255,255,0.6)', border: 'none',
            }}>{c}</button>
          ))}
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {filtered.map((m, i) => {
            const h1Color = m.eq1 > 60 ? '#10b981' : m.eq1 > 50 ? '#f59e0b' : '#ef4444';
            const h2Color = m.eq2 > 60 ? '#10b981' : m.eq2 > 50 ? '#f59e0b' : '#ef4444';
            return (
              <div key={i} onClick={() => setShowDetail(showDetail === i ? null : i)} style={{
                padding: 10, background: 'rgba(255,255,255,0.03)', borderRadius: 8, cursor: 'pointer',
                border: showDetail === i ? '1px solid rgba(232,121,249,0.3)' : '1px solid rgba(255,255,255,0.04)',
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <div style={{ flex: 1, textAlign: 'right' }}>
                    <span style={{ fontSize: 16, fontWeight: 800, color: '#fff' }}>{m.hand1}</span>
                  </div>
                  <div style={{ display: 'flex', height: 20, width: 200, borderRadius: 4, overflow: 'hidden' }}>
                    <div style={{ width: `${m.eq1}%`, background: h1Color, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, fontWeight: 700, color: '#fff' }}>
                      {m.eq1}%
                    </div>
                    <div style={{ width: `${m.eq2}%`, background: h2Color, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, fontWeight: 700, color: '#fff' }}>
                      {m.eq2}%
                    </div>
                  </div>
                  <div style={{ flex: 1, textAlign: 'left' }}>
                    <span style={{ fontSize: 16, fontWeight: 800, color: '#fff' }}>{m.hand2}</span>
                  </div>
                </div>
                {showDetail === i && (
                  <div style={{ marginTop: 8, textAlign: 'center' }}>
                    <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)', padding: '2px 8px', background: 'rgba(255,255,255,0.06)', borderRadius: 4 }}>{m.category}</span>
                    <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.5)', marginTop: 4 }}>
                      {m.eq1 > 80 ? 'Massive favorite — calling is always correct' :
                       m.eq1 > 60 ? 'Solid favorite — profitable all-in' :
                       m.eq1 > 52 ? 'Coin flip — small edge, high variance' :
                       'Underdog — need pot odds or ICM reasons to call'}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>

        <div style={{ marginTop: 12, padding: 10, background: 'rgba(232,121,249,0.06)', borderRadius: 8, border: '1px solid rgba(232,121,249,0.12)' }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: '#e879f9', marginBottom: 4 }}>Quick Rules</div>
          <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.6)', lineHeight: 1.5 }}>
            Overpair vs underpair: ~80/20. Pair vs two overcards: ~55/45 (coin flip). Dominated hand (AK vs AQ): ~70/30. Pair vs random hand: ~82/18. The closer in rank, the closer to 50/50.
          </div>
        </div>
      </div>
    );
  } catch (err) {
    return <div style={{ padding: 20, color: '#ef4444' }}>Preflop Equity failed to load: {err.message}</div>;
  }
}

export default PreFlopAllInEquity;
