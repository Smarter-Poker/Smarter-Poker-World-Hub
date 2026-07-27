/**
 * NosebleedGuide — Nosebleed Stakes Strategy (NL5k+)
 * The pinnacle of online poker strategy
 */
import React, { useState } from 'react';
import { motion } from 'framer-motion';

const NOSEBLEED_TOPICS = [
  { title: 'Solver Mastery is Mandatory', icon: '■', color: '#ef4444',
    detail: 'At nosebleed stakes, every regular has studied thousands of solver sims. Knowing approximate GTO for every common spot is table stakes.',
    depth: 'You need to know not just the solver\'s preferred action, but WHY — which blockers matter, how frequencies shift with stack depth, and how board texture changes the equilibrium.',
    reality: 'Players at NL5k+ will exploit any systematic deviation from GTO within a few hundred hands.' },
  { title: 'Heads-Up Dynamics', icon: '»', color: '#f59e0b',
    detail: 'Most nosebleed action is heads-up. You must have a deep HU game — opening 70%+ from the button, defending 60%+ from the BB.',
    depth: 'HU poker at this level is a constant adjustment war. Limping from the button, overbetting, check-raise bombing — everything is in play.',
    reality: 'The best HU nosebleed players have studied tens of thousands of solver outputs and can approximate GTO in real-time.' },
  { title: 'Bankroll & Mental Game', icon: '◇', color: '#8b5cf6',
    detail: 'A single session at NL10k can swing $50k+. You need 50+ buy-ins, ironclad emotional control, and a support system.',
    depth: 'Professional nosebleed players have coaches, therapists, and structured routines. The mental game is 50% of the battle.',
    reality: 'Most nosebleed players who go broke do so from tilt, not from being outplayed. Emotional discipline is THE edge.' },
  { title: 'Game Selection is Profit', icon: '●', color: '#22c55e',
    detail: 'Even at nosebleeds, game selection matters enormously. One whale at the table can make a losing game hugely profitable.',
    depth: 'Track when recreational players sit at high stakes. Alert systems, table scanning, and availability windows are critical.',
    reality: 'The biggest winners at nosebleeds aren\'t always the best players — they\'re the best at finding and playing against the worst players.' },
  { title: 'Advanced Exploits', icon: '⌁', color: '#3b82f6',
    detail: 'When you identify a specific opponent leak, the exploit must be surgical and time-limited. Over-exploit and they\'ll adjust.',
    depth: 'Track exploit windows: how long before an opponent notices your deviation? Some adjust in 50 hands, others in 5000.',
    reality: 'The meta at nosebleeds shifts weekly. What worked last month may be the most exploited line this month.' },
];

export default function NosebleedGuide() {
  const [idx, setIdx] = useState(0);
  const t = NOSEBLEED_TOPICS[idx];

  return (
    <div style={{ padding: 20, color: '#e2e8f0' }}>
      <h3 style={{ fontSize: 20, fontWeight: 800, marginBottom: 8, background: 'linear-gradient(135deg, #ef4444, #8b5cf6)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
        Nosebleed Stakes (NL5k+)
      </h3>
      <p style={{ color: '#94a3b8', fontSize: 13, marginBottom: 16 }}>The highest stakes in online poker — where legends are made.</p>

      <div style={{ display: 'flex', gap: 6, marginBottom: 16, flexWrap: 'wrap' }}>
        {NOSEBLEED_TOPICS.map((topic, i) => (
          <button key={i} onClick={() => setIdx(i)}
            style={{ padding: '6px 12px', borderRadius: 8, border: idx === i ? `2px solid ${topic.color}` : '1px solid rgba(255,255,255,0.06)',
              background: idx === i ? `${topic.color}15` : 'rgba(0,0,0,0.2)', cursor: 'pointer',
              fontSize: 11, fontWeight: 700, color: idx === i ? topic.color : '#64748b' }}>
            {topic.icon} {topic.title}
          </button>
        ))}
      </div>

      <motion.div key={idx} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
        style={{ background: 'rgba(0,0,0,0.3)', borderRadius: 12, padding: 16 }}>
        <div style={{ fontSize: 16, fontWeight: 800, color: t.color, marginBottom: 8 }}>{t.icon} {t.title}</div>
        <p style={{ fontSize: 13, color: '#cbd5e1', marginBottom: 12 }}>{t.detail}</p>
        <div style={{ background: `${t.color}08`, borderRadius: 8, padding: 10, marginBottom: 8, borderLeft: `3px solid ${t.color}` }}>
          <div style={{ fontSize: 10, fontWeight: 700, color: t.color }}>GOING DEEPER</div>
          <div style={{ fontSize: 12, color: '#94a3b8' }}>{t.depth}</div>
        </div>
        <div style={{ background: 'rgba(139,92,246,0.06)', borderRadius: 8, padding: 10, borderLeft: '3px solid #8b5cf6' }}>
          <div style={{ fontSize: 10, fontWeight: 700, color: '#8b5cf6' }}>REALITY CHECK</div>
          <div style={{ fontSize: 12, color: '#94a3b8' }}>{t.reality}</div>
        </div>
      </motion.div>
    </div>
  );
}
