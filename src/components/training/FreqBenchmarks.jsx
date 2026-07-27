/**
 * FreqBenchmarks — Betting Frequency Benchmarks
 * Target frequencies for every common action
 */
import React, { useState } from 'react';
import { motion } from 'framer-motion';

const FREQ_BENCHMARKS = [
  { action: 'Flop C-Bet (IP, HU)', target: '55-65%', color: '#22c55e', icon: '◆',
    tooHigh: '>70% — You\'re betting too many weak hands. Get check-raised more.',
    tooLow: '<45% — You\'re giving up too much equity and letting villain see free cards.',
    adjust: 'Higher on dry boards (K72r = 80%), lower on wet boards (JT8hh = 35%).' },
  { action: 'Flop C-Bet (OOP, HU)', target: '40-50%', color: '#3b82f6', icon: '·',
    tooHigh: '>55% — OOP c-bets get exploited by floats and raises. Check more.',
    tooLow: '<30% — You\'re check-folding too much. Villain steals with any two cards.',
    adjust: 'Use range bets (33% pot with entire range) on favorable textures OOP.' },
  { action: 'Turn Barrel', target: '45-55%', color: '#f59e0b', icon: '▲',
    tooHigh: '>60% — You\'re double-barreling too aggressively. Run into traps more.',
    tooLow: '<35% — You\'re giving up after the flop too often. Free showdowns for villain.',
    adjust: 'Barrel more on scare cards. Check back more on bricks when villain calls flop.' },
  { action: 'River Bet', target: '35-45%', color: '#ef4444', icon: '●',
    tooHigh: '>50% — You\'re over-bluffing rivers. Villain starts hero-calling.',
    tooLow: '<25% — You\'re missing thin value and giving up too many bluffing opportunities.',
    adjust: 'Aim for 2:1 value-to-bluff ratio. Every 2 value bets, include 1 bluff.' },
  { action: 'Fold to 3-Bet', target: '55-65%', color: '#8b5cf6', icon: '■',
    tooHigh: '>70% — You\'re over-folding to 3-bets. Get exploited by light 3-bettors.',
    tooLow: '<45% — You\'re defending too wide. Playing bloated pots with marginal hands.',
    adjust: 'Defend wider from late position opens. Fold more from EP opens.' },
];

export default function FreqBenchmarks() {
  const [freqIdx, setFreqIdx] = useState(0);
  const freq = FREQ_BENCHMARKS[freqIdx];

  return (
    <div style={{ padding: 20, color: '#e2e8f0' }}>
      <h3 style={{ fontSize: 20, fontWeight: 800, marginBottom: 8, background: 'linear-gradient(135deg, #22c55e, #f59e0b)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
        Frequency Benchmarks
      </h3>
      <p style={{ color: '#94a3b8', fontSize: 13, marginBottom: 16 }}>Compare your frequencies against optimal targets.</p>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 4, marginBottom: 16 }}>
        {FREQ_BENCHMARKS.map((f, i) => (
          <button key={i} onClick={() => setFreqIdx(i)}
            style={{ padding: '8px 4px', borderRadius: 8, border: freqIdx === i ? `2px solid ${f.color}` : '1px solid rgba(255,255,255,0.06)',
              background: freqIdx === i ? `${f.color}15` : 'rgba(0,0,0,0.2)', cursor: 'pointer', textAlign: 'center' }}>
            <div style={{ fontSize: 14 }}>{f.icon}</div>
            <div style={{ fontSize: 8, fontWeight: 700, color: freqIdx === i ? f.color : '#64748b' }}>{f.action.substring(0, 10)}</div>
          </button>
        ))}
      </div>

      <motion.div key={freqIdx} initial={{ opacity: 0 }} animate={{ opacity: 1 }}
        style={{ background: 'rgba(0,0,0,0.3)', borderRadius: 12, padding: 16 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
          <div style={{ fontSize: 15, fontWeight: 800, color: freq.color }}>{freq.action}</div>
          <div style={{ background: `${freq.color}20`, borderRadius: 8, padding: '4px 14px' }}>
            <span style={{ fontSize: 16, fontWeight: 800, color: freq.color }}>{freq.target}</span>
          </div>
        </div>
        <div style={{ display: 'grid', gap: 8 }}>
          <div style={{ background: 'rgba(239,68,68,0.06)', borderRadius: 8, padding: 10, borderLeft: '3px solid #ef4444' }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: '#ef4444' }}>Too High</div>
            <div style={{ fontSize: 12, color: '#94a3b8' }}>{freq.tooHigh}</div>
          </div>
          <div style={{ background: 'rgba(59,130,246,0.06)', borderRadius: 8, padding: 10, borderLeft: '3px solid #3b82f6' }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: '#3b82f6' }}>Too Low</div>
            <div style={{ fontSize: 12, color: '#94a3b8' }}>{freq.tooLow}</div>
          </div>
          <div style={{ background: 'rgba(245,158,11,0.06)', borderRadius: 8, padding: 10, borderLeft: '3px solid #f59e0b' }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: '#f59e0b' }}>How to Adjust</div>
            <div style={{ fontSize: 12, color: '#94a3b8' }}>{freq.adjust}</div>
          </div>
        </div>
      </motion.div>
    </div>
  );
}
