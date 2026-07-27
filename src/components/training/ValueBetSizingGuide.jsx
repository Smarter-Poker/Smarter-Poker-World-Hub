/**
 * ValueBetSizingGuide — Optimal Value Bet Sizing
 * How to size your bets to extract maximum value
 */
import React, { useState, useMemo } from 'react';
import { motion } from 'framer-motion';

const SIZING_TIERS = [
  { size: '25-33%', label: 'Small', color: '#22c55e', emoji: '',
    when: 'When you have range advantage on dry boards. Want calls from many hands.',
    hands: 'Top pair on dry flops, overpairs on low boards, when entire range bets',
    avoid: 'When draws are present — you\'re giving too good a price' },
  { size: '50-66%', label: 'Medium', color: '#3b82f6', emoji: '',
    when: 'Standard bet sizing. Good balance of value extraction and protection.',
    hands: 'Strong top pair, overpairs on somewhat wet boards, two pair',
    avoid: 'When villain\'s range is very inelastic (they call or fold regardless of size)' },
  { size: '75-100%', label: 'Large', color: '#f59e0b', emoji: '',
    when: 'Polarized spots. You have a very strong hand or are bluffing.',
    hands: 'Sets, straights, flushes on wet boards. Also your bluffs.',
    avoid: 'With medium-strength hands — you only get called by better' },
  { size: '120-200%', label: 'Overbet', color: '#ef4444', emoji: '',
    when: 'When you have significant nut advantage. Villain can\'t have the nuts.',
    hands: 'Nut flushes, full houses on river. Boards where villain\'s range is capped.',
    avoid: 'When villain can have a wide strong range. Only works when they\'re capped.' },
];

export default function ValueBetSizingGuide() {
  const [selectedTier, setSelectedTier] = useState(0);
  const [pot, setPot] = useState(50);
  const tier = SIZING_TIERS[selectedTier];

  const sizingRange = useMemo(() => {
    const parts = tier.size.replace('%', '').split('-');
    const low = Math.round(pot * parseInt(parts[0]) / 100);
    const high = Math.round(pot * parseInt(parts[1] || parts[0]) / 100);
    return { low, high };
  }, [tier, pot]);

  return (
    <div style={{ padding: 20, color: '#e2e8f0' }}>
      <h3 style={{ fontSize: 20, fontWeight: 800, marginBottom: 8, background: 'linear-gradient(135deg, #22c55e, #3b82f6)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
         Value Bet Sizing Guide
      </h3>
      <p style={{ color: '#94a3b8', fontSize: 13, marginBottom: 16 }}>Size your value bets to extract maximum chips.</p>

      {/* Tier selector */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 6, marginBottom: 16 }}>
        {SIZING_TIERS.map((t, i) => (
          <button key={i} onClick={() => setSelectedTier(i)}
            style={{ padding: '10px 6px', borderRadius: 10, border: selectedTier === i ? `2px solid ${t.color}` : '1px solid rgba(255,255,255,0.06)',
              background: selectedTier === i ? `${t.color}15` : 'rgba(0,0,0,0.2)', cursor: 'pointer', textAlign: 'center' }}>
            <div style={{ fontSize: 20 }}>{t.emoji}</div>
            <div style={{ fontSize: 12, fontWeight: 800, color: t.color }}>{t.size}</div>
            <div style={{ fontSize: 10, color: '#64748b' }}>{t.label}</div>
          </button>
        ))}
      </div>

      {/* Calculator */}
      <div style={{ background: 'rgba(0,0,0,0.3)', borderRadius: 12, padding: 16, marginBottom: 16 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
          <span style={{ fontSize: 12, color: '#94a3b8' }}>Current Pot</span>
          <span style={{ fontSize: 14, fontWeight: 800, color: '#e2e8f0' }}>{pot} BB</span>
        </div>
        <input type="range" min={5} max={200} value={pot} onChange={e => setPot(+e.target.value)}
          style={{ width: '100%', accentColor: tier.color, marginBottom: 12 }} />
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: 11, color: '#64748b' }}>Bet Size Range</div>
          <div style={{ fontSize: 28, fontWeight: 800, color: tier.color }}>{sizingRange.low} - {sizingRange.high} BB</div>
        </div>
      </div>

      {/* Tier details */}
      <motion.div key={selectedTier} initial={{ opacity: 0 }} animate={{ opacity: 1 }}
        style={{ display: 'grid', gap: 8 }}>
        {[
          { label: '✓ When to Use', text: tier.when, color: '#22c55e'},
          { label: 'Best Hands', text: tier.hands, color: '#3b82f6'},
          { label: '✕ Avoid When', text: tier.avoid, color: '#ef4444'},
        ].map((item, i) => (
          <div key={i} style={{ background: `${item.color}08`, borderLeft: `3px solid ${item.color}`, borderRadius: 8, padding: '8px 12px' }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: item.color }}>{item.label}</div>
            <div style={{ fontSize: 12, color: '#94a3b8' }}>{item.text}</div>
          </div>
        ))}
      </motion.div>
    </div>
  );
}
