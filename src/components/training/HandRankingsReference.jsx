import React, { useState } from 'react';

const HANDS = [
  { rank: 1, name: 'Royal Flush', example: 'A♠ K♠ Q♠ J♠ T♠', probability: '0.000154%', odds: '649,739:1', combos: 4, color: '#fbbf24', description: 'A, K, Q, J, T all same suit.' },
  { rank: 2, name: 'Straight Flush', example: '9♥ 8♥ 7♥ 6♥ 5♥', probability: '0.00139%', odds: '72,192:1', combos: 36, color: '#f97316', description: 'Five sequential cards same suit.' },
  { rank: 3, name: 'Four of a Kind', example: 'K♠ K♥ K♦ K♣ 7♠', probability: '0.024%', odds: '4,164:1', combos: 624, color: '#ef4444', description: 'Four cards same rank.' },
  { rank: 4, name: 'Full House', example: 'A♠ A♥ A♦ K♠ K♥', probability: '0.144%', odds: '693:1', combos: 3744, color: '#e879f9', description: 'Three of a kind plus a pair.' },
  { rank: 5, name: 'Flush', example: 'A♣ J♣ 8♣ 6♣ 2♣', probability: '0.197%', odds: '508:1', combos: 5108, color: '#3b82f6', description: 'Five cards same suit, not sequential.' },
  { rank: 6, name: 'Straight', example: 'T♠ 9♥ 8♣ 7♦ 6♠', probability: '0.392%', odds: '254:1', combos: 10200, color: '#10b981', description: 'Five sequential cards mixed suits.' },
  { rank: 7, name: 'Three of a Kind', example: 'Q♠ Q♥ Q♦ 9♠ 4♣', probability: '2.11%', odds: '46.3:1', combos: 54912, color: '#f59e0b', description: 'Three cards same rank.' },
  { rank: 8, name: 'Two Pair', example: 'J♠ J♥ 5♣ 5♦ A♠', probability: '4.75%', odds: '20:1', combos: 123552, color: '#8b5cf6', description: 'Two different pairs.' },
  { rank: 9, name: 'One Pair', example: 'A♠ A♥ K♣ 9♦ 4♠', probability: '42.3%', odds: '1.37:1', combos: 1098240, color: '#6b7280', description: 'Two cards same rank.' },
  { rank: 10, name: 'High Card', example: 'A♠ J♥ 8♣ 5♦ 2♠', probability: '50.1%', odds: '0.995:1', combos: 1302540, color: '#94a3b8', description: 'No made hand.' },
];

export default function HandRankingsReference() {
  const [expandedRank, setExpandedRank] = useState(null);

  return (
    <section style={{ padding: 20, background: 'linear-gradient(145deg, rgba(7,20,31,0.96), rgba(1,7,13,0.98))', border: '1px solid rgba(124,219,255,0.3)', boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.12), 0 18px 44px rgba(0,0,0,0.45)' }}>
      <h3 style={{ margin: '0 0 16px', fontSize: 18, color: '#f6d47a' }}>Hand Rankings</h3>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        {HANDS.map((hand) => {
          const expanded = expandedRank === hand.rank;
          const toggle = () => setExpandedRank(expanded ? null : hand.rank);
          return (
            <div key={hand.rank} role="button" tabIndex={0} aria-expanded={expanded} onClick={toggle} onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); toggle(); } }} style={{ padding: 10, background: expanded ? `${hand.color}18` : 'rgba(255,255,255,0.035)', cursor: 'pointer', border: expanded ? `1px solid ${hand.color}55` : '1px solid rgba(124,219,255,0.08)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div style={{ width: 24, height: 24, borderRadius: '50%', background: `${hand.color}33`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 800, color: hand.color }}>{hand.rank}</div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: hand.color }}>{hand.name}</div>
                  <div style={{ fontSize: 12, color: 'rgba(233,248,255,0.72)', letterSpacing: 1 }}>{hand.example}</div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: '#fff' }}>{hand.probability}</div>
                  <div style={{ fontSize: 12, color: 'rgba(213,235,245,0.62)' }}>{hand.odds}</div>
                </div>
              </div>
              {expanded && (
                <div style={{ marginTop: 8, paddingTop: 8, borderTop: '1px solid rgba(124,219,255,0.12)' }}>
                  <div style={{ fontSize: 12, color: 'rgba(236,248,255,0.78)', lineHeight: 1.5, marginBottom: 4 }}>{hand.description}</div>
                  <div style={{ fontSize: 12, color: 'rgba(192,220,233,0.64)' }}>Combos: {hand.combos.toLocaleString()}</div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}
