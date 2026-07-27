/**
 * PLOHandSelection — PLO Starting Hand Rankings & Categories
 * Detailed hand selection guide for Pot Limit Omaha
 */
import React, { useState } from 'react';
import { motion } from 'framer-motion';

const HAND_TIERS = [
  { tier: 'Tier 1 — Premium', color: '#22c55e', icon: '',
    hands: ['AAKKds', 'AAJTds', 'AAQQ', 'AAJJ', 'KKQQds', 'KKJTds'],
    traits: 'Double-suited aces with broadway connectors. High pairs with connectivity. These are raise/3-bet in any position.',
    vpip: '~5% of all PLO hands. Open-raise from any position. 3-bet vs opens. 4-bet vs 3-bets.',
    ev: 'Expected to be profitable in almost any scenario. Can play for stacks preflop.' },
  { tier: 'Tier 2 — Strong', color: '#3b82f6', icon: '',
    hands: ['KKQJ', 'QQJT', 'JT98ds', 'T987ds', 'AKQJr', 'AAxxss'],
    traits: 'Connected rundowns, suited aces with any kicker, high pairs with some connectivity.',
    vpip: '~10% of hands. Open from MP+. Call 3-bets in position. Sometimes 3-bet for value.',
    ev: 'Profitable when played in position. Can get into trouble multiway with bare pairs.' },
  { tier: 'Tier 3 — Playable', color: '#f59e0b', icon: '✓',
    hands: ['9876ds', '8765ds', 'AKxx', 'KQJx', 'QJT9r', 'AQJ8ss'],
    traits: 'Medium rundowns, suited aces, partial connectivity. Need good flops to continue.',
    vpip: '~15% of hands. Open from CO/BTN. Call opens IP. Fold to 3-bets without strong suits.',
    ev: 'Marginal profitability. Highly position-dependent. Best in single-raised pots IP.' },
  { tier: 'Tier 4 — Speculative', color: '#8b5cf6', icon: '◆',
    hands: ['7654ds', '5432ds', 'A♠xx♠x', 'KK72r', 'QQJT'],
    traits: 'Low rundowns, single-suited aces, danglers (disconnected cards), bare pairs.',
    vpip: '~5% additional. Only from BTN/SB with good odds. Fold to raises.',
    ev: 'Slightly negative EV in most spots. Only playable in soft games or great positions.' },
  { tier: 'Tier 5 — Trash', color: '#ef4444', icon: '',
    hands: ['K♠7♥3♦2♣', 'Q♠8♥4♦2♣', 'J♠5♥3♦2♣', 'Any 3-gap hand', 'Rainbow disconnected'],
    traits: 'No connectivity, no suits, no pairs, random cards. These are auto-folds.',
    vpip: '~65% of all PLO hands are trash. Fold them.',
    ev: 'Negative EV from every position. Playing these is burning money.' },
];

export default function PLOHandSelection() {
  const [tierIdx, setTierIdx] = useState(0);
  const tier = HAND_TIERS[tierIdx];

  return (
    <div style={{ padding: 20, color: '#e2e8f0' }}>
      <h3 style={{ fontSize: 20, fontWeight: 800, marginBottom: 8, background: 'linear-gradient(135deg, #f59e0b, #22c55e)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
         PLO Hand Selection
      </h3>
      <p style={{ color: '#94a3b8', fontSize: 13, marginBottom: 16 }}>Know which starting hands to play in Pot Limit Omaha.</p>

      <div style={{ display: 'flex', gap: 6, marginBottom: 16, flexWrap: 'wrap' }}>
        {HAND_TIERS.map((t, i) => (
          <button key={i} onClick={() => setTierIdx(i)}
            style={{ padding: '6px 12px', borderRadius: 8, border: tierIdx === i ? `2px solid ${t.color}` : '1px solid rgba(255,255,255,0.06)',
              background: tierIdx === i ? `${t.color}15` : 'rgba(0,0,0,0.2)', cursor: 'pointer',
              fontSize: 11, fontWeight: 700, color: tierIdx === i ? t.color : '#64748b' }}>
            {t.icon} {t.tier.split(' — ')[1]}
          </button>
        ))}
      </div>

      <motion.div key={tierIdx} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
        style={{ background: 'rgba(0,0,0,0.3)', borderRadius: 12, padding: 16 }}>
        <div style={{ fontSize: 16, fontWeight: 800, color: tier.color, marginBottom: 8 }}>{tier.icon} {tier.tier}</div>
        <p style={{ fontSize: 13, color: '#cbd5e1', marginBottom: 10 }}>{tier.traits}</p>

        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 12 }}>
          {tier.hands.map((h, i) => (
            <span key={i} style={{ padding: '4px 8px', borderRadius: 6, background: `${tier.color}15`, border: `1px solid ${tier.color}30`,
              fontSize: 11, fontFamily: 'monospace', color: tier.color, fontWeight: 700 }}>{h}</span>
          ))}
        </div>

        <div style={{ display: 'grid', gap: 8 }}>
          <div style={{ background: `${tier.color}08`, borderRadius: 8, padding: 10, borderLeft: `3px solid ${tier.color}` }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: tier.color }}>VPIP GUIDE</div>
            <div style={{ fontSize: 12, color: '#94a3b8' }}>{tier.vpip}</div>
          </div>
          <div style={{ background: 'rgba(245,158,11,0.06)', borderRadius: 8, padding: 10, borderLeft: '3px solid #f59e0b' }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: '#f59e0b' }}>EV EXPECTATION</div>
            <div style={{ fontSize: 12, color: '#94a3b8' }}>{tier.ev}</div>
          </div>
        </div>
      </motion.div>
    </div>
  );
}
