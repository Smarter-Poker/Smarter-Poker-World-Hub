/**
 * PlayerTyping — Player Type Classification System
 * Identify and exploit each player archetype
 */
import React, { useState } from 'react';
import { motion } from 'framer-motion';

const PLAYER_TYPES = [
  { type: 'TAG (Tight-Aggressive)', icon: '◆', color: '#22c55e',
    stats: 'VPIP: 20-26% | PFR: 18-23% | AF: 2.5-4.0',
    style: 'Plays few hands, bets/raises when they play. The most winning player type.',
    exploit: 'Hard to exploit. Best approach: avoid big pots without big hands. They rarely bluff.',
    beware: 'When a TAG bets big, they usually have it. Fold medium hands to their aggression.' },
  { type: 'LAG (Loose-Aggressive)', icon: '▲', color: '#ef4444',
    stats: 'VPIP: 28-38% | PFR: 24-32% | AF: 3.0-5.0',
    style: 'Plays many hands aggressively. High variance but potentially very profitable.',
    exploit: 'Call down lighter. They bluff more often. Trap with strong hands. Let them hang themselves.',
    beware: 'Good LAGs are the toughest opponents. They\'re hard to put on a range because it\'s so wide.' },
  { type: 'Calling Station (LP)', icon: '●', color: '#3b82f6',
    stats: 'VPIP: 35-55% | PFR: 8-15% | AF: 0.5-1.5',
    style: 'Calls everything, rarely raises. Hates folding. Will call with any pair or draw.',
    exploit: 'NEVER bluff. Value bet relentlessly with any pair or better. Bet thin for value.',
    beware: 'They\'ll crack your big hands occasionally. Don\'t tilt — just keep value betting.' },
  { type: 'Nit (Ultra-Tight)', icon: '■', color: '#f59e0b',
    stats: 'VPIP: 10-16% | PFR: 8-14% | AF: 2.0-3.5',
    style: 'Only plays premium hands. When they bet, they have the goods. Very predictable.',
    exploit: 'Steal their blinds relentlessly. Fold to their raises and bets — they always have it.',
    beware: 'If a nit 3-bets you, it\'s QQ+ or AKs. Just fold everything except AA/KK.' },
  { type: 'Maniac', icon: '↻', color: '#8b5cf6',
    stats: 'VPIP: 45-70% | PFR: 30-50% | AF: 4.0+',
    style: 'Raises everything, bluffs constantly, creates chaos. Very high variance.',
    exploit: 'Tighten up preflop. Call down with medium hands. Let them donate. Don\'t try to outplay them.',
    beware: 'They\'ll occasionally have the nuts. But they bluff so often that calling is usually correct.' },
];

export default function PlayerTyping() {
  const [typeIdx, setTypeIdx] = useState(0);
  const ptype = PLAYER_TYPES[typeIdx];

  return (
    <div style={{ padding: 20, color: '#e2e8f0' }}>
      <h3 style={{ fontSize: 20, fontWeight: 800, marginBottom: 8, background: 'linear-gradient(135deg, #22c55e, #ef4444)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
        · Player Type System
      </h3>
      <p style={{ color: '#94a3b8', fontSize: 13, marginBottom: 16 }}>Classify opponents and exploit their tendencies.</p>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 4, marginBottom: 16 }}>
        {PLAYER_TYPES.map((t, i) => (
          <button key={i} onClick={() => setTypeIdx(i)}
            style={{ padding: '8px 4px', borderRadius: 8, border: typeIdx === i ? `2px solid ${t.color}` : '1px solid rgba(255,255,255,0.06)',
              background: typeIdx === i ? `${t.color}15` : 'rgba(0,0,0,0.2)', cursor: 'pointer', textAlign: 'center' }}>
            <div style={{ fontSize: 14 }}>{t.icon}</div>
            <div style={{ fontSize: 8, fontWeight: 700, color: typeIdx === i ? t.color : '#64748b' }}>{t.type.substring(0, 8)}</div>
          </button>
        ))}
      </div>

      <motion.div key={typeIdx} initial={{ opacity: 0 }} animate={{ opacity: 1 }}
        style={{ background: 'rgba(0,0,0,0.3)', borderRadius: 12, padding: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
          <span style={{ fontSize: 24 }}>{ptype.icon}</span>
          <span style={{ fontSize: 16, fontWeight: 800, color: ptype.color }}>{ptype.type}</span>
        </div>
        <div style={{ background: `${ptype.color}08`, borderRadius: 8, padding: 8, marginBottom: 10, fontFamily: 'monospace' }}>
          <div style={{ fontSize: 11, color: ptype.color }}>{ptype.stats}</div>
        </div>
        <p style={{ fontSize: 13, color: '#cbd5e1', marginBottom: 10 }}>{ptype.style}</p>
        <div style={{ display: 'grid', gap: 8 }}>
          <div style={{ background: 'rgba(34,197,94,0.06)', borderRadius: 8, padding: 10, borderLeft: '3px solid #22c55e' }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: '#22c55e' }}>How to Exploit</div>
            <div style={{ fontSize: 12, color: '#94a3b8' }}>{ptype.exploit}</div>
          </div>
          <div style={{ background: 'rgba(239,68,68,0.06)', borderRadius: 8, padding: 10, borderLeft: '3px solid #ef4444' }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: '#ef4444' }}>Beware</div>
            <div style={{ fontSize: 12, color: '#94a3b8' }}>{ptype.beware}</div>
          </div>
        </div>
      </motion.div>
    </div>
  );
}
