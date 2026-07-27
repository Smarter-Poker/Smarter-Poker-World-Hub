/**
 * MTTEarlyStageGuide — MTT Early Stage Strategy
 * Deep-stack tournament play in the first few levels
 */
import React, { useState } from 'react';
import { motion } from 'framer-motion';

const EARLY_TOPICS = [
  { title: 'Chip Accumulation vs Survival', icon: '◇', color: '#22c55e',
    detail: 'In the early stages (100-200bb deep), play for chip EV. ICM is negligible with 1000+ players left. Build a stack for later stages.',
    do_this: 'Play speculative hands (suited connectors, small pairs) to flop big. Set-mining and implied odds are at their best.',
    avoid: 'Don\'t play scared. A double-up early gives you ammunition for the entire tournament. Risk chips to build a stack.' },
  { title: 'Range Construction', icon: '□', color: '#3b82f6',
    detail: 'At 100bb+ effective, your opening ranges should be wider than you think. Implied odds are massive and post-flop skill is rewarded.',
    do_this: 'Open 20-25% from EP, 30-35% from MP, 40%+ from CO/BTN. Include suited connectors, suited Aces, and small pairs.',
    avoid: 'Don\'t play "nitty tournament poker" early. You\'re 200bb deep — play like a cash game player.' },
  { title: 'Post-Flop Deep Stack Play', icon: '·', color: '#f59e0b',
    detail: 'With deep stacks, post-flop play is multi-street warfare. Plan your whole hand before betting the flop.',
    do_this: 'Think in terms of SPR. At SPR 10+, sets and flushes are your money-makers. Small bets build big pots over 3 streets.',
    avoid: 'Don\'t stack off with one pair at 150bb deep. Top pair is a one-street hand, not a three-street hand.' },
  { title: '3-Betting Deep', icon: '◆', color: '#ef4444',
    detail: 'Deep-stacked 3-bet pots are high-skill situations. Your 3-betting range should include more playable hands, not just premiums.',
    do_this: '3-bet with suited broadways (AJs, KQs) for value. Mix in suited connectors (87s, 76s) as bluffs. Keep the SPR workable.',
    avoid: 'Don\'t 3-bet too big — you want to see flops, not win 3bb pots. Use 2.5-3x sizing to keep ranges wide.' },
  { title: 'Table Dynamics', icon: '○', color: '#8b5cf6',
    detail: 'Early stages have the most recreational players. Identify fish quickly and adjust your seat/strategy to exploit them.',
    do_this: 'Isolate weak players with wide raises. Play more hands in position against bad players. Value bet thin vs calling stations.',
    avoid: 'Don\'t try to bluff recreational players. They call with anything. Just value bet relentlessly and let them pay you off.' },
];

export default function MTTEarlyStageGuide() {
  const [idx, setIdx] = useState(0);
  const t = EARLY_TOPICS[idx];

  return (
    <div style={{ padding: 20, color: '#e2e8f0' }}>
      <h3 style={{ fontSize: 20, fontWeight: 800, marginBottom: 8, background: 'linear-gradient(135deg, #22c55e, #f59e0b)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
        MTT Early Stage Strategy
      </h3>
      <p style={{ color: '#94a3b8', fontSize: 13, marginBottom: 16 }}>Build your stack in the first levels of a tournament.</p>

      <div style={{ display: 'flex', gap: 6, marginBottom: 16, flexWrap: 'wrap' }}>
        {EARLY_TOPICS.map((topic, i) => (
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
        <div style={{ display: 'grid', gap: 8 }}>
          <div style={{ background: 'rgba(34,197,94,0.06)', borderRadius: 8, padding: 10, borderLeft: '3px solid #22c55e' }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: '#22c55e' }}>DO THIS</div>
            <div style={{ fontSize: 12, color: '#94a3b8' }}>{t.do_this}</div>
          </div>
          <div style={{ background: 'rgba(239,68,68,0.06)', borderRadius: 8, padding: 10, borderLeft: '3px solid #ef4444' }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: '#ef4444' }}>AVOID</div>
            <div style={{ fontSize: 12, color: '#94a3b8' }}>{t.avoid}</div>
          </div>
        </div>
      </motion.div>
    </div>
  );
}
