/**
 * PLOPostflopGuide — PLO Postflop Strategy
 * Navigating flop, turn, and river play in Omaha
 */
import React, { useState } from 'react';
import { motion } from 'framer-motion';

const POSTFLOP_TOPICS = [
  { title: 'Flop Play: Bet or Check?', icon: '◆', color: '#22c55e',
    detail: 'In PLO, c-bet frequency is much lower than NLHE (~35% vs ~65%). Ranges are wider, and equity runs closer. Only bet when you have a clear advantage.',
    when_bet: 'Bet with: nut draws, sets, top two pair, wraps with backup equity. Bet 50-75% pot to charge draws.',
    when_check: 'Check with: bare overpairs, non-nut draws, marginal hands. PLO flops hit both ranges hard.' },
  { title: 'Turn Play: Pot Control vs Aggression', icon: '↻', color: '#3b82f6',
    detail: 'The turn is where PLO pots explode. A pot-sized turn bet often commits you to the river. Choose your battles carefully.',
    when_bet: 'Barrel turns that improve your hand or range. Nut flush draws picking up straight equity. Sets on safe turns.',
    when_check: 'Pot control with non-nut made hands. Check back medium-strength hands to avoid bloating the pot OOP.' },
  { title: 'River Play: Value vs Bluff', icon: '★', color: '#ef4444',
    detail: 'River play in PLO is all about the nuts. Non-nut hands are often bluff catchers. The nut advantage is the primary driver of betting strategy.',
    when_bet: 'Bet with the nuts or near-nuts. Bluff with hands that block the nuts (e.g., nut flush blocker when flush misses).',
    when_check: 'Check non-nut flushes, straights where a higher straight is possible, and sets on wet boards.' },
  { title: 'Multiway Adjustments', icon: '●', color: '#f59e0b',
    detail: 'PLO pots are frequently multiway. With 3+ players, equity distribution shifts dramatically. You need the nuts much more often.',
    when_bet: 'Only bet strong draws (13+ outs) and made hands (sets+) in multiway. Small sizing (33-50% pot) to deny equity.',
    when_check: 'Check almost everything else. Even top two pair is vulnerable in 4-way PLO pots.' },
  { title: 'Drawing Strategy', icon: '■', color: '#8b5cf6',
    detail: 'Draws in PLO are much stronger than in NLHE. A 13-card wrap has ~50% equity against a set. Play draws aggressively.',
    when_bet: 'Bet/raise with nut draws (20+ outs), especially when you have position. Semi-bluffing is hugely profitable.',
    when_check: 'Check non-nut draws and draws with <10 outs. These are call-and-pray hands, not betting hands.' },
];

export default function PLOPostflopGuide() {
  const [idx, setIdx] = useState(0);
  const t = POSTFLOP_TOPICS[idx];

  return (
    <div style={{ padding: 20, color: '#e2e8f0' }}>
      <h3 style={{ fontSize: 20, fontWeight: 800, marginBottom: 8, background: 'linear-gradient(135deg, #3b82f6, #ef4444)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
        PLO Postflop Strategy
      </h3>
      <p style={{ color: '#94a3b8', fontSize: 13, marginBottom: 16 }}>Navigate every street in Pot Limit Omaha.</p>

      <div style={{ display: 'flex', gap: 6, marginBottom: 16, flexWrap: 'wrap' }}>
        {POSTFLOP_TOPICS.map((topic, i) => (
          <button key={i} onClick={() => setIdx(i)}
            style={{ padding: '6px 12px', borderRadius: 8, border: idx === i ? `2px solid ${topic.color}` : '1px solid rgba(255,255,255,0.06)',
              background: idx === i ? `${topic.color}15` : 'rgba(0,0,0,0.2)', cursor: 'pointer',
              fontSize: 11, fontWeight: 700, color: idx === i ? topic.color : '#64748b' }}>
            {topic.icon} {topic.title.split(':')[0]}
          </button>
        ))}
      </div>

      <motion.div key={idx} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
        style={{ background: 'rgba(0,0,0,0.3)', borderRadius: 12, padding: 16 }}>
        <div style={{ fontSize: 16, fontWeight: 800, color: t.color, marginBottom: 8 }}>{t.icon} {t.title}</div>
        <p style={{ fontSize: 13, color: '#cbd5e1', marginBottom: 12 }}>{t.detail}</p>
        <div style={{ display: 'grid', gap: 8 }}>
          <div style={{ background: 'rgba(34,197,94,0.06)', borderRadius: 8, padding: 10, borderLeft: '3px solid #22c55e' }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: '#22c55e' }}>WHEN TO BET</div>
            <div style={{ fontSize: 12, color: '#94a3b8' }}>{t.when_bet}</div>
          </div>
          <div style={{ background: 'rgba(239,68,68,0.06)', borderRadius: 8, padding: 10, borderLeft: '3px solid #ef4444' }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: '#ef4444' }}>WHEN TO CHECK</div>
            <div style={{ fontSize: 12, color: '#94a3b8' }}>{t.when_check}</div>
          </div>
        </div>
      </motion.div>
    </div>
  );
}
