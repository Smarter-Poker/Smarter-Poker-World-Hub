/**
 * ZoomPokerGuide — Zoom/Fast-Fold Poker Strategy
 * Adjustments for fast-fold poker formats
 */
import React, { useState } from 'react';
import { motion } from 'framer-motion';

const ZOOM_TOPICS = [
  { title: 'Tighter is Better', icon: '■', color: '#22c55e',
    detail: 'In Zoom, you\'re instantly dealt a new hand when you fold. This means folding is "free" — there\'s no opportunity cost of waiting.',
    strategy: 'Tighten your opening ranges by 5-10% vs regular tables. You\'ll see so many hands that you can afford to be selective.',
    stat: 'Average VPIP at Zoom tables: 18-22%. At regular tables: 22-28%. The pool naturally plays tighter.',
    tip: 'Don\'t play marginal hands from EP. You\'ll get a new hand in 2 seconds. Fold and wait for a better spot.' },
  { title: 'Anonymity & Reads', icon: '◇', color: '#3b82f6',
    detail: 'In Zoom, you face random opponents each hand. You can\'t build reads on specific players the way you can at regular tables.',
    strategy: 'Play a solid, balanced default strategy. Exploit population tendencies rather than individual players.',
    stat: 'HUD data matters more in Zoom — you need 500+ hands on a player before making significant adjustments.',
    tip: 'Focus on your own game. The most profitable Zoom players are the most fundamentally sound, not the most creative.' },
  { title: 'C-Bet Adjustments', icon: '◆', color: '#ef4444',
    detail: 'Zoom pools tend to over-fold to c-bets because players quickly fold and move on. This makes c-betting very profitable.',
    strategy: 'C-bet more frequently (65-70%) with a smaller sizing (25-33% pot). The pool folds enough to make this instantly profitable.',
    stat: 'Average fold to c-bet in Zoom: 55-60%. At regular tables: 45-50%. Zoom players are more auto-pilot.',
    tip: 'On dry flops (K72r), you can c-bet nearly 100% of your range for 25% pot. The fold equity is insane.' },
  { title: 'Blind Defense', icon: '■', color: '#f59e0b',
    detail: 'Many Zoom players over-fold their blinds since they can instantly get a new hand. This makes stealing very profitable.',
    strategy: 'Steal aggressively from CO and BTN. Open 35-40% from CO and 50%+ from BTN. The blinds fold too much.',
    stat: 'Average fold to steal in Zoom BB: 65-70%. You profit even with a 100% opening range if they fold that much.',
    tip: 'But also defend your own BB more — you\'re likely being over-stolen from. Adjust by 3-betting more from the BB.' },
  { title: 'Volume & Rakeback', icon: '■', color: '#8b5cf6',
    detail: 'Zoom lets you play 250-400 hands/hour per table. Multi-tabling 4 Zoom tables = 1000-1600 hands/hour.',
    strategy: 'Volume is the key advantage of Zoom. Even with a lower win rate, the sheer number of hands generates more total profit.',
    stat: 'Win rate at Zoom is typically 2-4bb/100 lower than regular tables, but hands/hour is 3-4x higher.',
    tip: 'Factor in rakeback. At high volume, rakeback can add 2-3bb/100 to your effective win rate. Zoom + rakeback = printing money.' },
];

export default function ZoomPokerGuide() {
  const [idx, setIdx] = useState(0);
  const t = ZOOM_TOPICS[idx];

  return (
    <div style={{ padding: 20, color: '#e2e8f0' }}>
      <h3 style={{ fontSize: 20, fontWeight: 800, marginBottom: 8, background: 'linear-gradient(135deg, #3b82f6, #8b5cf6)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
        Zoom / Fast-Fold Strategy
      </h3>
      <p style={{ color: '#94a3b8', fontSize: 13, marginBottom: 16 }}>Maximize your edge in fast-fold poker.</p>

      <div style={{ display: 'flex', gap: 6, marginBottom: 16, flexWrap: 'wrap' }}>
        {ZOOM_TOPICS.map((topic, i) => (
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
          <div style={{ fontSize: 10, fontWeight: 700, color: t.color }}>STRATEGY</div>
          <div style={{ fontSize: 12, color: '#94a3b8' }}>{t.strategy}</div>
        </div>
        <div style={{ background: 'rgba(0,0,0,0.2)', borderRadius: 8, padding: 10, marginBottom: 8, fontFamily: 'monospace' }}>
          <div style={{ fontSize: 10, color: '#64748b' }}>Key Stat</div>
          <div style={{ fontSize: 11, color: t.color }}>{t.stat}</div>
        </div>
        <div style={{ background: 'rgba(245,158,11,0.06)', borderRadius: 8, padding: 10, borderLeft: '3px solid #f59e0b' }}>
          <div style={{ fontSize: 10, fontWeight: 700, color: '#f59e0b' }}>PRO TIP</div>
          <div style={{ fontSize: 12, color: '#94a3b8' }}>{t.tip}</div>
        </div>
      </motion.div>
    </div>
  );
}
