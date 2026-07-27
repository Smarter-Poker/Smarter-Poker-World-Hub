/**
 * HandCombinatoricsGuide — Counting Hand Combinations
 * ●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●
 * Interactive guide for counting hand combos in opponent ranges.
 * Essential GTO skill for hand reading and range analysis.
 */
import React, { useState } from 'react';

const COMBOS = [
  {
    category: 'Pocket Pairs', color: '#ef4444',
    hands: [
      { hand: 'AA', total: 6, note: '4 choose 2 = 6 combos (A♠A♥, A♠A♦, A♠A♣, A♥A♦, A♥A♣, A♦A♣)' },
      { hand: 'AA (with A♠ on board)', total: 3, note: 'One A removed: 3 choose 2 = 3 combos' },
      { hand: 'AA (with A♠ A♥ on board)', total: 1, note: 'Two As removed: 2 choose 2 = 1 combo' },
      { hand: 'All pocket pairs', total: 78, note: '13 ranks × 6 combos = 78 total pocket pair combos' },
    ],
  },
  {
    category: 'Suited Hands', color: '#3b82f6',
    hands: [
      { hand: 'AKs', total: 4, note: '4 suits = 4 combos (A♠K♠, A♥K♥, A♦K♦, A♣K♣)' },
      { hand: 'AKs (with K♠ on board)', total: 3, note: 'K♠ blocks A♠K♠. 3 remaining suited combos.' },
      { hand: 'AKs (with K♠ and A♥ on board)', total: 2, note: 'K♠ blocks A♠K♠, A♥ blocks A♥K♥. 2 combos left.' },
      { hand: 'Any suited hand', total: 4, note: 'Always 4 combos for any two specific suited cards' },
    ],
  },
  {
    category: 'Offsuit Hands', color: '#10b981',
    hands: [
      { hand: 'AKo', total: 12, note: '4×4 - 4 suited = 12 offsuit combos' },
      { hand: 'AKo (with K♠ on board)', total: 9, note: 'K♠ removes 3 AKo combos. 12 - 3 = 9 remaining.' },
      { hand: 'AKo (with K♠ and A♥ on board)', total: 7, note: 'K♠ removes 3, A♥ removes 3, but A♥K♠ double-counted. 12-3-3+1=7.' },
      { hand: 'Any offsuit hand', total: 12, note: 'Always 12 combos for any two specific offsuit cards' },
    ],
  },
  {
    category: 'Total Combos', color: '#f59e0b',
    hands: [
      { hand: 'AK total', total: 16, note: '4 suited + 12 offsuit = 16 combos of AK' },
      { hand: 'Total starting hands', total: 1326, note: '52 choose 2 = 1,326 unique starting hands' },
      { hand: 'Unique hand types', total: 169, note: '13 pairs + 78 suited + 78 offsuit = 169 types' },
      { hand: 'Top 10% range', total: 133, note: '~133 combos = the strongest 10% of starting hands' },
    ],
  },
];

const BLOCKERS_EXAMPLES = [
  { hero: 'A♠ K♣', blocks: 'AK (12→7), AA (6→3), KK (6→3), AQ (16→12)', significance: 'Blocks villains strongest value hands. Good hand to bluff with on missed boards.' },
  { hero: 'Q♥ J♥', blocks: 'QQ (6→3), JJ (6→3), QJs (4→2), QJ (16→9)', significance: 'Blocks some strong hands but also blocks hands youd want villain to have when bluffing.' },
  { hero: '7♠ 6♠', blocks: 'Very little', significance: 'Doesnt block strong hands. Not a great bluff blocker. But also doesnt block villains folding range.' },
];

function HandCombinatoricsGuide() {
  const [activeTab, setActiveTab] = useState(0);

  try {
    return (
      <div style={{ padding: 20, background: 'rgba(0,0,0,0.3)', borderRadius: 12, border: '1px solid rgba(255,255,255,0.08)' }}>
        <h3 style={{ margin: '0 0 16px 0', fontSize: 18, color: '#a78bfa' }}>Hand Combinatorics</h3>

        <div style={{ display: 'flex', gap: 6, marginBottom: 16 }}>
          {COMBOS.map((c, i) => (
            <button key={i} onClick={() => setActiveTab(i)} style={{
              flex: 1, padding: '6px 4px', borderRadius: 6, border: 'none', cursor: 'pointer', fontSize: 10, fontWeight: 600,
              background: activeTab === i ? c.color : 'rgba(255,255,255,0.06)',
              color: activeTab === i ? '#fff' : 'rgba(255,255,255,0.5)',
            }}>{c.category}</button>
          ))}
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 16 }}>
          {COMBOS[activeTab].hands.map((h, i) => (
            <div key={i} style={{ padding: 10, background: 'rgba(255,255,255,0.03)', borderRadius: 8, display: 'flex', alignItems: 'center', gap: 10 }}>
              <div style={{ minWidth: 50, textAlign: 'center' }}>
                <div style={{ fontSize: 20, fontWeight: 900, color: COMBOS[activeTab].color }}>{h.total}</div>
                <div style={{ fontSize: 8, color: 'rgba(255,255,255,0.3)' }}>combos</div>
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: '#fff', marginBottom: 2 }}>{h.hand}</div>
                <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.5)', lineHeight: 1.4 }}>{h.note}</div>
              </div>
            </div>
          ))}
        </div>

        {/* Blocker examples */}
        <div style={{ padding: 10, background: 'rgba(167,139,250,0.06)', borderRadius: 8, border: '1px solid rgba(167,139,250,0.12)' }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: '#a78bfa', marginBottom: 8 }}>Blocker Effects</div>
          {BLOCKERS_EXAMPLES.map((b, i) => (
            <div key={i} style={{ marginBottom: i < BLOCKERS_EXAMPLES.length - 1 ? 8 : 0, paddingBottom: i < BLOCKERS_EXAMPLES.length - 1 ? 8 : 0, borderBottom: i < BLOCKERS_EXAMPLES.length - 1 ? '1px solid rgba(255,255,255,0.05)' : 'none' }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: '#fff', marginBottom: 2 }}>Hero: {b.hero}</div>
              <div style={{ fontSize: 10, color: '#f59e0b', marginBottom: 2 }}>Blocks: {b.blocks}</div>
              <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.5)' }}>{b.significance}</div>
            </div>
          ))}
        </div>
      </div>
    );
  } catch (err) {
    return <div style={{ padding: 20, color: '#ef4444' }}>Combinatorics Guide failed to load: {err.message}</div>;
  }
}

export default HandCombinatoricsGuide;
