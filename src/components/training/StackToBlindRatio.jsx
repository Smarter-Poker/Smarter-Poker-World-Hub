/**
 * StackToBlindRatio — Stack-to-Blind Ratio Strategy
 * How your stack size relative to blinds changes every decision
 */
import React, { useState } from 'react';
import { motion } from 'framer-motion';

const SBR_ZONES = [
  { zone: 'Deep Stack (100+ BB)', range: '100-200+ BB', color: '#22c55e', icon: '■',
    strategy: 'Full poker. All streets matter. Speculative hands (suited connectors, small pairs) gain value.',
    preflop: 'Open wider. Implied odds are huge. Set mining is very profitable.',
    postflop: 'All 3 streets play. Can make multi-street bluffs. Position is maximally important.',
    avoid: 'Don\'t overcommit with one pair. Deep stacks mean sets and straights are out there.' },
  { zone: 'Standard Stack (40-100 BB)', range: '40-100 BB', color: '#3b82f6', icon: '◇',
    strategy: 'Standard tournament poker. Balance aggression with stack preservation.',
    preflop: 'Standard opening ranges. 3-bet sizing matters — don\'t bloat pots unnecessarily.',
    postflop: 'Two streets of value typically. Thin value bets become risky.',
    avoid: 'Don\'t call 3-bets OOP with speculative hands. Implied odds are shrinking.' },
  { zone: 'Short Stack (20-40 BB)', range: '20-40 BB', color: '#f59e0b', icon: '▲',
    strategy: 'Simplified poker. Many hands become shove-or-fold preflop. Postflop gets compressed.',
    preflop: 'Tighten up opens. 3-bet shove with 20-25 BB. Open-raise smaller (2-2.2x).',
    postflop: 'Typically one bet commits you. SPR is so low that top pair is often a cooler.',
    avoid: 'Don\'t open-raise and fold to a 3-bet with 25 BB. Either shove or open small and call.' },
  { zone: 'Push/Fold (10-20 BB)', range: '10-20 BB', color: '#ef4444', icon: '▲',
    strategy: 'Pure push/fold mathematics. No more open-raising — just shove or fold.',
    preflop: 'Use push/fold charts. Shove wider from late position. Call shoves tighter.',
    postflop: 'There IS no postflop. You\'re all-in preflop or you folded.',
    avoid: 'Don\'t min-raise with 15 BB. You\'re committing 15% of your stack and learning nothing.' },
  { zone: 'Desperate (1-10 BB)', range: '1-10 BB', color: '#ef4444', icon: '▼',
    strategy: 'Shove any reasonable hand. Waiting costs you ante/blind equity every orbit.',
    preflop: 'Under 5 BB: shove any two from the button. 5-10 BB: shove top 30-50% of hands.',
    postflop: 'N/A — you\'re always all-in preflop at this depth.',
    avoid: 'Don\'t wait for AA. Every orbit you lose ~15% of your stack to blinds. Act now.' },
];

export default function StackToBlindRatio() {
  const [zoneIdx, setZoneIdx] = useState(0);
  const zone = SBR_ZONES[zoneIdx];

  return (
    <div style={{ padding: 20, color: '#e2e8f0' }}>
      <h3 style={{ fontSize: 20, fontWeight: 800, marginBottom: 8, background: 'linear-gradient(135deg, #22c55e, #ef4444)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
        Stack-to-Blind Ratio
      </h3>
      <p style={{ color: '#94a3b8', fontSize: 13, marginBottom: 16 }}>Your stack size dictates your entire strategy.</p>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 4, marginBottom: 16 }}>
        {SBR_ZONES.map((z, i) => (
          <button key={i} onClick={() => setZoneIdx(i)}
            style={{ padding: '8px 4px', borderRadius: 8, border: zoneIdx === i ? `2px solid ${z.color}` : '1px solid rgba(255,255,255,0.06)',
              background: zoneIdx === i ? `${z.color}15` : 'rgba(0,0,0,0.2)', cursor: 'pointer', textAlign: 'center' }}>
            <div style={{ fontSize: 14 }}>{z.icon}</div>
            <div style={{ fontSize: 8, fontWeight: 700, color: zoneIdx === i ? z.color : '#64748b' }}>{z.range}</div>
          </button>
        ))}
      </div>

      <motion.div key={zoneIdx} initial={{ opacity: 0 }} animate={{ opacity: 1 }}
        style={{ background: 'rgba(0,0,0,0.3)', borderRadius: 12, padding: 16 }}>
        <div style={{ fontSize: 16, fontWeight: 800, color: zone.color, marginBottom: 4 }}>{zone.zone}</div>
        <p style={{ fontSize: 13, color: '#cbd5e1', marginBottom: 10 }}>{zone.strategy}</p>
        <div style={{ display: 'grid', gap: 8 }}>
          {[
            { label: 'Preflop', text: zone.preflop, color: '#3b82f6' },
            { label: 'Postflop', text: zone.postflop, color: '#22c55e' },
            { label: 'Avoid', text: zone.avoid, color: '#ef4444' },
          ].map((s, i) => (
            <div key={i} style={{ background: `${s.color}08`, borderRadius: 8, padding: 10, borderLeft: `3px solid ${s.color}` }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: s.color }}>{s.label}</div>
              <div style={{ fontSize: 12, color: '#94a3b8' }}>{s.text}</div>
            </div>
          ))}
        </div>
      </motion.div>
    </div>
  );
}
