/**
 * EquityBucketGuide — Understanding Equity Buckets
 * Categorize your hand's equity to make better decisions
 */
import React, { useState } from 'react';
import { motion } from 'framer-motion';

const BUCKETS = [
  { name: 'Trash', range: '0-20%', color: '#ef4444', icon: '✕', width: 20,
    hands: 'Unimproved air, missed draws, no backdoors',
    action: 'Fold or bluff (if fold equity exists). Never call.',
    strategy: 'Check-fold most of the time. Bluff only with good blockers or scare cards.' },
  { name: 'Marginal', range: '20-35%', color: '#f59e0b', icon: '▲', width: 15,
    hands: 'Weak draws, bottom pair, A-high no pair',
    action: 'Fold to bets or semi-bluff with best draws.',
    strategy: 'These hands need improvement. Don\'t invest heavily unless you have a clear plan.' },
  { name: 'Medium', range: '35-55%', color: '#3b82f6', icon: '■', width: 20,
    hands: 'Middle pair, top pair weak kicker, decent draws',
    action: 'Check/call or bet for thin value. Don\'t build big pots.',
    strategy: 'Pot control zone. Check for free cards, call reasonable bets, fold to big pressure.' },
  { name: 'Strong', range: '55-75%', color: '#8b5cf6', icon: '▲', width: 20,
    hands: 'Top pair good kicker, overpairs, strong draws',
    action: 'Bet for value and protection. Build the pot.',
    strategy: 'Bet every street for value. Size to get called by worse. Protect against draws.' },
  { name: 'Nutted', range: '75-100%', color: '#22c55e', icon: '★', width: 25,
    hands: 'Sets, straights, flushes, full houses, quads',
    action: 'Maximize value. Bet big, raise, slow play if beneficial.',
    strategy: 'Extract every chip. Size for max value. Consider slow playing only on static boards.' },
];

export default function EquityBucketGuide() {
  const [bucketIdx, setBucketIdx] = useState(3);
  const bucket = BUCKETS[bucketIdx];

  return (
    <div style={{ padding: 20, color: '#e2e8f0' }}>
      <h3 style={{ fontSize: 20, fontWeight: 800, marginBottom: 8, background: 'linear-gradient(135deg, #22c55e, #8b5cf6)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
        Equity Bucket Guide
      </h3>
      <p style={{ color: '#94a3b8', fontSize: 13, marginBottom: 16 }}>Categorize your hand equity to simplify decisions instantly.</p>

      {/* Bucket spectrum */}
      <div style={{ display: 'flex', height: 40, borderRadius: 8, overflow: 'hidden', marginBottom: 16, cursor: 'pointer' }}>
        {BUCKETS.map((b, i) => (
          <motion.div key={i} onClick={() => setBucketIdx(i)}
            style={{ width: `${b.width}%`, background: bucketIdx === i ? b.color : `${b.color}60`,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 11, fontWeight: 700, color: '#fff', borderRight: '1px solid rgba(0,0,0,0.3)',
              transition: 'all 0.2s' }}
            whileHover={{ filter: 'brightness(1.2)' }}>
            {b.icon}
          </motion.div>
        ))}
      </div>

      {/* Labels */}
      <div style={{ display: 'flex', marginBottom: 16 }}>
        {BUCKETS.map((b, i) => (
          <div key={i} style={{ width: `${b.width}%`, textAlign: 'center', fontSize: 9, fontWeight: 600,
            color: bucketIdx === i ? b.color : '#64748b' }}>
            {b.range}
          </div>
        ))}
      </div>

      {/* Selected bucket detail */}
      <motion.div key={bucketIdx} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
        style={{ background: `${bucket.color}08`, border: `1px solid ${bucket.color}25`, borderRadius: 12, padding: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
          <span style={{ fontSize: 28 }}>{bucket.icon}</span>
          <div>
            <div style={{ fontSize: 18, fontWeight: 800, color: bucket.color }}>{bucket.name}</div>
            <div style={{ fontSize: 12, color: '#64748b' }}>Equity: {bucket.range}</div>
          </div>
        </div>

        <div style={{ display: 'grid', gap: 8 }}>
          <div style={{ background: 'rgba(0,0,0,0.2)', borderRadius: 8, padding: 10, borderLeft: `3px solid ${bucket.color}` }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: bucket.color }}>TYPICAL HANDS</div>
            <div style={{ fontSize: 12, color: '#94a3b8' }}>{bucket.hands}</div>
          </div>
          <div style={{ background: 'rgba(0,0,0,0.2)', borderRadius: 8, padding: 10, borderLeft: '3px solid #f59e0b' }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: '#f59e0b' }}>DEFAULT ACTION</div>
            <div style={{ fontSize: 12, color: '#94a3b8' }}>{bucket.action}</div>
          </div>
          <div style={{ background: 'rgba(0,0,0,0.2)', borderRadius: 8, padding: 10, borderLeft: '3px solid #3b82f6' }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: '#3b82f6' }}>STRATEGY</div>
            <div style={{ fontSize: 12, color: '#94a3b8' }}>{bucket.strategy}</div>
          </div>
        </div>
      </motion.div>
    </div>
  );
}
