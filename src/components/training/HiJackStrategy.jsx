/**
 * HiJackStrategy — HiJack Position Guide
 * Bridge between early and late position — play accordingly
 */
import React, { useState } from 'react';
import { motion } from 'framer-motion';

const HJ_TOPICS = [
  { title: 'Opening Range', icon: '■', color: '#6366f1',
    text: 'HJ opens ~22-26% of hands. Wider than UTG but tighter than CO. Include suited broadways, pairs, better suited connectors.',
    detail: '22+, A2s+, K5s+, Q8s+, J8s+, T8s+, 97s+, 87s, 76s, 65s, ATo+, KJo+, QJo' },
  { title: 'vs CO/BTN 3-Bet', icon: '■', color: '#ef4444',
    text: 'CO and BTN will 3-bet you with wider ranges than they would UTG. Defend accordingly.',
    detail: '4-bet: QQ+, AKs | Call: TT-JJ, AQs, AJs, KQs, some suited connectors | Fold: weak broadways, low suited' },
  { title: 'Iso-Raising Limpers', icon: '◆', color: '#f59e0b',
    text: 'When UTG or UTG+1 limps, iso-raise to 4-5x from HJ with a wide value range.',
    detail: 'Iso with: 77+, ATs+, KJs+, QJs — isolate the fish and play IP post-flop' },
  { title: 'C-Betting from HJ', icon: '●', color: '#22c55e',
    text: 'When you open from HJ and get called, c-bet ~55-60% of flops. Your range is perceived as stronger than CO/BTN.',
    detail: 'Bet small (33%) on dry boards, larger (66%) on wet. Check back with marginal showdown value.' },
];

export default function HiJackStrategy() {
  const [topicIdx, setTopicIdx] = useState(0);
  const topic = HJ_TOPICS[topicIdx];

  return (
    <div style={{ padding: 20, color: '#e2e8f0' }}>
      <h3 style={{ fontSize: 20, fontWeight: 800, marginBottom: 8, background: 'linear-gradient(135deg, #6366f1, #8b5cf6)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
        HiJack Strategy Guide
      </h3>
      <p style={{ color: '#94a3b8', fontSize: 13, marginBottom: 16 }}>The HJ bridges early and late position — adapt accordingly.</p>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 6, marginBottom: 16 }}>
        {HJ_TOPICS.map((t, i) => (
          <button key={i} onClick={() => setTopicIdx(i)}
            style={{ padding: '8px 4px', borderRadius: 8, border: topicIdx === i ? `2px solid ${t.color}` : '1px solid rgba(255,255,255,0.06)',
              background: topicIdx === i ? `${t.color}15` : 'rgba(0,0,0,0.2)', cursor: 'pointer', textAlign: 'center' }}>
            <div style={{ fontSize: 16 }}>{t.icon}</div>
            <div style={{ fontSize: 10, fontWeight: 700, color: topicIdx === i ? t.color : '#64748b' }}>{t.title}</div>
          </button>
        ))}
      </div>

      <motion.div key={topicIdx} initial={{ opacity: 0, x: 15 }} animate={{ opacity: 1, x: 0 }}
        style={{ background: 'rgba(0,0,0,0.3)', borderRadius: 12, padding: 16, marginBottom: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
          <span style={{ fontSize: 24 }}>{topic.icon}</span>
          <span style={{ fontSize: 16, fontWeight: 800, color: topic.color }}>{topic.title}</span>
        </div>
        <p style={{ fontSize: 13, color: '#cbd5e1', marginBottom: 12 }}>{topic.text}</p>
        <div style={{ background: `${topic.color}08`, borderLeft: `3px solid ${topic.color}`, borderRadius: 8, padding: 10 }}>
          <div style={{ fontSize: 12, color: '#94a3b8', fontFamily: 'monospace' }}>{topic.detail}</div>
        </div>
      </motion.div>

      {/* Position spectrum */}
      <div style={{ background: 'rgba(0,0,0,0.2)', borderRadius: 10, padding: 12 }}>
        <div style={{ fontSize: 12, fontWeight: 700, color: '#8b5cf6', marginBottom: 8 }}>Position Opening Spectrum</div>
        {[
          { pos: 'UTG', pct: 15, color: '#ef4444' },
          { pos: 'HJ', pct: 24, color: '#6366f1', highlight: true },
          { pos: 'CO', pct: 30, color: '#f59e0b' },
          { pos: 'BTN', pct: 45, color: '#22c55e' },
        ].map((p, i) => (
          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
            <span style={{ fontSize: 11, fontWeight: p.highlight ? 800 : 600, color: p.highlight ? '#8b5cf6' : '#94a3b8', minWidth: 30 }}>
              {p.pos}{p.highlight ? ' ←' : ''}
            </span>
            <div style={{ flex: 1, height: 10, background: 'rgba(255,255,255,0.06)', borderRadius: 4 }}>
              <motion.div initial={{ width: 0 }} animate={{ width: `${p.pct * 2}%` }}
                style={{ height: '100%', background: p.color, borderRadius: 4, border: p.highlight ? '1px solid #8b5cf6' : 'none' }} />
            </div>
            <span style={{ fontSize: 11, fontWeight: 700, color: p.color, minWidth: 35, textAlign: 'right' }}>{p.pct}%</span>
          </div>
        ))}
      </div>
    </div>
  );
}
