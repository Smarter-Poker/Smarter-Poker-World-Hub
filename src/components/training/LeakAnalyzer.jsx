/**
 * LeakAnalyzer — Statistical Leak Analysis
 * Use your HUD stats to find and fix leaks
 */
import React, { useState } from 'react';
import { motion } from 'framer-motion';

const LEAK_STATS = [
  { stat: 'VPIP (Voluntarily Put $ In Pot)', optimal: '22-28%', color: '#22c55e', icon: '■',
    tooHigh: '>30% — You\'re playing too many hands. Tighten preflop ranges, especially from EP.',
    tooLow: '<18% — You\'re too tight. Missing value from late position steals and blind defense.',
    fix: 'Track VPIP by position. UTG should be ~13%, BTN should be ~40%. Overall ~24%.' },
  { stat: 'PFR (Preflop Raise %)', optimal: '18-24%', color: '#3b82f6', icon: '▲',
    tooHigh: '>28% — You\'re raising too many weak hands. Tighten your open-raise ranges.',
    tooLow: '<15% — You\'re too passive preflop. Open-limping or calling too much instead of raising.',
    fix: 'PFR should be close to VPIP (gap < 6). Large gap = too much calling preflop.' },
  { stat: 'AF (Aggression Factor)', optimal: '2.5-3.5', color: '#f59e0b', icon: '▲',
    tooHigh: '>4.0 — You\'re too aggressive postflop. Over-bluffing and getting caught.',
    tooLow: '<2.0 — You\'re too passive postflop. Check-calling too much instead of betting/raising.',
    fix: 'AF = (Bets + Raises) / Calls. Increase by betting more flops and raising more turns.' },
  { stat: 'WTSD (Went to Showdown %)', optimal: '25-28%', color: '#ef4444', icon: '◆',
    tooHigh: '>30% — You\'re calling too much. Getting to showdown with weak hands and losing.',
    tooLow: '<22% — You\'re folding too much. Getting bluffed off good hands too often.',
    fix: 'High WTSD = calling station. Low WTSD = folding too much. Both cost you money.' },
  { stat: 'W$SD (Won $ at Showdown)', optimal: '50-55%', color: '#8b5cf6', icon: '●',
    tooHigh: '>58% — You\'re too tight at showdown. You\'re folding hands that should go to showdown.',
    tooLow: '<48% — You\'re reaching showdown with too many weak hands. Tighten your calling ranges.',
    fix: 'W$SD works WITH WTSD. High WTSD + Low W$SD = massive leak (calling station).' },
];

export default function LeakAnalyzer() {
  const [statIdx, setStatIdx] = useState(0);
  const stat = LEAK_STATS[statIdx];

  return (
    <div style={{ padding: 20, color: '#e2e8f0' }}>
      <h3 style={{ fontSize: 20, fontWeight: 800, marginBottom: 8, background: 'linear-gradient(135deg, #ef4444, #f59e0b)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
        Leak Analyzer
      </h3>
      <p style={{ color: '#94a3b8', fontSize: 13, marginBottom: 16 }}>Use your stats to diagnose and fix leaks.</p>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 4, marginBottom: 16 }}>
        {LEAK_STATS.map((s, i) => (
          <button key={i} onClick={() => setStatIdx(i)}
            style={{ padding: '8px 4px', borderRadius: 8, border: statIdx === i ? `2px solid ${s.color}` : '1px solid rgba(255,255,255,0.06)',
              background: statIdx === i ? `${s.color}15` : 'rgba(0,0,0,0.2)', cursor: 'pointer', textAlign: 'center' }}>
            <div style={{ fontSize: 14 }}>{s.icon}</div>
            <div style={{ fontSize: 8, fontWeight: 700, color: statIdx === i ? s.color : '#64748b' }}>{s.stat.substring(0, 6)}</div>
          </button>
        ))}
      </div>

      <motion.div key={statIdx} initial={{ opacity: 0 }} animate={{ opacity: 1 }}
        style={{ background: 'rgba(0,0,0,0.3)', borderRadius: 12, padding: 16 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
          <div style={{ fontSize: 15, fontWeight: 800, color: stat.color }}>{stat.stat}</div>
          <div style={{ background: `${stat.color}20`, borderRadius: 8, padding: '4px 12px' }}>
            <span style={{ fontSize: 14, fontWeight: 800, color: stat.color }}>{stat.optimal}</span>
          </div>
        </div>
        <div style={{ display: 'grid', gap: 8 }}>
          <div style={{ background: 'rgba(239,68,68,0.06)', borderRadius: 8, padding: 10, borderLeft: '3px solid #ef4444' }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: '#ef4444' }}>Too High</div>
            <div style={{ fontSize: 12, color: '#94a3b8' }}>{stat.tooHigh}</div>
          </div>
          <div style={{ background: 'rgba(59,130,246,0.06)', borderRadius: 8, padding: 10, borderLeft: '3px solid #3b82f6' }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: '#3b82f6' }}>Too Low</div>
            <div style={{ fontSize: 12, color: '#94a3b8' }}>{stat.tooLow}</div>
          </div>
          <div style={{ background: 'rgba(34,197,94,0.06)', borderRadius: 8, padding: 10, borderLeft: '3px solid #22c55e' }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: '#22c55e' }}>How to Fix</div>
            <div style={{ fontSize: 12, color: '#94a3b8' }}>{stat.fix}</div>
          </div>
        </div>
      </motion.div>
    </div>
  );
}
