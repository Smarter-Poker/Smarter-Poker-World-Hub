/**
 * CommonLeaksGuide — Identifying and Plugging Common Leaks
 * The most frequent strategic errors across all levels
 */
import React, { useState } from 'react';
import { motion } from 'framer-motion';

const LEAKS = [
  { leak: 'Not Folding to River Raises', level: 'Micro/Low', color: '#ef4444', icon: '●',
    stat: 'WTSD > 28%',
    impact: 'Calling river raises with bluff-catchers vs players who never bluff the river. Massive leak.',
    diagnostic: 'Check your "Fold to River Raise" stat. If it\'s below 50%, you\'re calling way too much.',
    plug: 'At low stakes, river raises are almost always value. Fold one-pair hands unless you have a read.' },
  { leak: 'Over-Bluffing Rivers', level: 'Mid Stakes', color: '#f59e0b', icon: '●',
    stat: 'River Bet % > 45%',
    impact: 'Bluffing too frequently on the river, especially into calling stations who won\'t fold.',
    diagnostic: 'If your river bet win% is below 50%, you\'re probably bluffing too much.',
    plug: 'Use the 2:1 rule: for every 2 value bets, have 1 bluff. Adjust vs calling stations (fewer bluffs).' },
  { leak: 'C-Betting Too Much Multi-Way', level: 'All Levels', color: '#3b82f6', icon: '●',
    stat: 'MW C-Bet > 40%',
    impact: 'C-betting 65% into 3+ players. Someone always has something. You\'re burning money.',
    diagnostic: 'Filter for multi-way pots and check your c-bet frequency. Should be 25-35%.',
    plug: 'Only c-bet multi-way with: top pair+, strong draws, or on very dry boards where you have range advantage.' },
  { leak: 'Playing Too Many Tables', level: 'Online', color: '#8b5cf6', icon: '●',
    stat: 'Win Rate Drops > 2BB/100',
    impact: 'More tables = more autopilot. You miss exploitative adjustments and play ABC only.',
    diagnostic: 'Track your BB/100 at different table counts. If it drops significantly, cut tables.',
    plug: 'Play the max tables where your winrate stays within 1 BB/100 of your peak. Quality > quantity.' },
  { leak: 'Ignoring Bet Sizing Tells', level: 'Live/Low Online', color: '#22c55e', icon: '●',
    stat: 'Not using reads',
    impact: 'Most low-stakes players have massive sizing tells. Min-bets = weak, overbets = polarized.',
    diagnostic: 'Start noting villain bet sizes. Do they always min-bet draws? Overbet the nuts?',
    plug: 'Build a mental database of sizing patterns. Exploit: fold to overbets from nits, call min-bets.' },
];

export default function CommonLeaksGuide() {
  const [leakIdx, setLeakIdx] = useState(0);
  const leak = LEAKS[leakIdx];

  return (
    <div style={{ padding: 20, color: '#e2e8f0' }}>
      <h3 style={{ fontSize: 20, fontWeight: 800, marginBottom: 8, background: 'linear-gradient(135deg, #ef4444, #22c55e)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
        Common Leaks Guide
      </h3>
      <p style={{ color: '#94a3b8', fontSize: 13, marginBottom: 16 }}>Find your leaks, plug them, profit.</p>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 4, marginBottom: 16 }}>
        {LEAKS.map((l, i) => (
          <button key={i} onClick={() => setLeakIdx(i)}
            style={{ padding: '8px 4px', borderRadius: 8, border: leakIdx === i ? `2px solid ${l.color}` : '1px solid rgba(255,255,255,0.06)',
              background: leakIdx === i ? `${l.color}15` : 'rgba(0,0,0,0.2)', cursor: 'pointer', textAlign: 'center' }}>
            <div style={{ fontSize: 14 }}>{l.icon}</div>
            <div style={{ fontSize: 8, fontWeight: 700, color: leakIdx === i ? l.color : '#64748b' }}>{l.leak.substring(0, 12)}</div>
          </button>
        ))}
      </div>

      <motion.div key={leakIdx} initial={{ opacity: 0 }} animate={{ opacity: 1 }}
        style={{ background: 'rgba(0,0,0,0.3)', borderRadius: 12, padding: 16 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
          <div style={{ fontSize: 16, fontWeight: 800, color: leak.color }}>{leak.leak}</div>
          <div style={{ background: 'rgba(255,255,255,0.05)', borderRadius: 6, padding: '3px 10px' }}>
            <span style={{ fontSize: 10, color: '#94a3b8' }}>{leak.level}</span>
          </div>
        </div>

        <div style={{ background: `${leak.color}10`, borderRadius: 8, padding: 8, marginBottom: 10, textAlign: 'center' }}>
          <div style={{ fontSize: 10, color: '#64748b' }}>Diagnostic Stat</div>
          <div style={{ fontSize: 14, fontWeight: 800, color: leak.color, fontFamily: 'monospace' }}>{leak.stat}</div>
        </div>

        <p style={{ fontSize: 13, color: '#cbd5e1', marginBottom: 10 }}>{leak.impact}</p>

        <div style={{ display: 'grid', gap: 8 }}>
          <div style={{ background: 'rgba(59,130,246,0.06)', borderRadius: 8, padding: 10, borderLeft: '3px solid #3b82f6' }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: '#3b82f6' }}>How to Diagnose</div>
            <div style={{ fontSize: 12, color: '#94a3b8' }}>{leak.diagnostic}</div>
          </div>
          <div style={{ background: 'rgba(34,197,94,0.06)', borderRadius: 8, padding: 10, borderLeft: '3px solid #22c55e' }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: '#22c55e' }}>How to Fix</div>
            <div style={{ fontSize: 12, color: '#94a3b8' }}>{leak.plug}</div>
          </div>
        </div>
      </motion.div>
    </div>
  );
}
