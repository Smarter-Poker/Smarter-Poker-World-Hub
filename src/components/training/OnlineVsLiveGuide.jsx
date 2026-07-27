/**
 * OnlineVsLiveGuide — Online vs Live Poker Differences
 * Key adjustments between online and live play
 */
import React, { useState } from 'react';
import { motion } from 'framer-motion';

const DIFFERENCES = [
  { topic: 'Speed & Volume', icon: '⌁', color: '#3b82f6',
    online: 'Play 500-1000+ hands/hour multi-tabling. Decisions must be fast. Reads come from HUD stats and patterns.',
    live: 'Play 25-30 hands/hour at one table. Lots of downtime. Reads come from physical tells and verbal cues.',
    adjust: 'Online: Use HUD stats, note-taking software, and preflop charts. Live: Pay attention to every hand, take mental notes.' },
  { topic: 'Player Skill Level', icon: '▲', color: '#22c55e',
    online: 'Tougher player pool at equivalent stakes. NL50 online plays like NL200+ live. Regs study hard.',
    live: 'Softer player pool. Recreational players dominate live low-stakes. More calling stations and weaker play.',
    adjust: 'Online: Play tighter, more balanced. Live: Widen value ranges, reduce bluffs, exploit weak players aggressively.' },
  { topic: 'Bet Sizing', icon: '●', color: '#f59e0b',
    online: 'Standard sizing: 2.5x open, 3x 3-bet, 33-75% pot c-bets. Players respect sizing and fold correctly.',
    live: 'Oversized opens work (3-5x). Players call with wide ranges regardless of sizing. Bigger = more value.',
    adjust: 'Live: Open bigger (3-4x + 1x per limper). Bet bigger for value (75-100% pot). Bluff less, value bet more.' },
  { topic: 'Table Dynamics', icon: '◇', color: '#ef4444',
    online: 'Anonymous or semi-anonymous. Players rotate constantly. Little meta-game unless playing regulars.',
    live: 'Social, table-talk matters. Image is built over hours. Players tilt visibly. Angle-shooting exists.',
    adjust: 'Live: Cultivate a friendly, loose image. Players will call you lighter if they like you. Use table talk for reads.' },
  { topic: 'Rake & Costs', icon: '■', color: '#8b5cf6',
    online: 'Lower rake (2.5-5%), plus rakeback/VIP programs. Software, HUD subscriptions as costs.',
    live: 'Higher rake (5-10%) plus tips, travel, food. But softer games often compensate for higher costs.',
    adjust: 'Calculate your effective rake. If live rake + tips = 8bb/100, you need a higher win rate to be profitable.' },
];

export default function OnlineVsLiveGuide() {
  const [idx, setIdx] = useState(0);
  const d = DIFFERENCES[idx];

  return (
    <div style={{ padding: 20, color: '#e2e8f0' }}>
      <h3 style={{ fontSize: 20, fontWeight: 800, marginBottom: 8, background: 'linear-gradient(135deg, #3b82f6, #22c55e)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
        Online vs Live Poker
      </h3>
      <p style={{ color: '#94a3b8', fontSize: 13, marginBottom: 16 }}>Key differences and adjustments between formats.</p>

      <div style={{ display: 'flex', gap: 6, marginBottom: 16, flexWrap: 'wrap' }}>
        {DIFFERENCES.map((t, i) => (
          <button key={i} onClick={() => setIdx(i)}
            style={{ padding: '6px 12px', borderRadius: 8, border: idx === i ? `2px solid ${t.color}` : '1px solid rgba(255,255,255,0.06)',
              background: idx === i ? `${t.color}15` : 'rgba(0,0,0,0.2)', cursor: 'pointer',
              fontSize: 11, fontWeight: 700, color: idx === i ? t.color : '#64748b' }}>
            {t.icon} {t.topic}
          </button>
        ))}
      </div>

      <motion.div key={idx} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
        style={{ background: 'rgba(0,0,0,0.3)', borderRadius: 12, padding: 16 }}>
        <div style={{ fontSize: 16, fontWeight: 800, color: d.color, marginBottom: 12 }}>{d.icon} {d.topic}</div>
        <div style={{ display: 'grid', gap: 8 }}>
          <div style={{ background: 'rgba(59,130,246,0.06)', borderRadius: 8, padding: 10, borderLeft: '3px solid #3b82f6' }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: '#3b82f6' }}>ONLINE</div>
            <div style={{ fontSize: 12, color: '#94a3b8' }}>{d.online}</div>
          </div>
          <div style={{ background: 'rgba(245,158,11,0.06)', borderRadius: 8, padding: 10, borderLeft: '3px solid #f59e0b' }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: '#f59e0b' }}>LIVE</div>
            <div style={{ fontSize: 12, color: '#94a3b8' }}>{d.live}</div>
          </div>
          <div style={{ background: 'rgba(34,197,94,0.06)', borderRadius: 8, padding: 10, borderLeft: '3px solid #22c55e' }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: '#22c55e' }}>ADJUSTMENT</div>
            <div style={{ fontSize: 12, color: '#94a3b8' }}>{d.adjust}</div>
          </div>
        </div>
      </motion.div>
    </div>
  );
}
