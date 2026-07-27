/**
 * RunItTwiceCalc — Run It Twice EV Calculator
 * Understand variance reduction when running it twice
 */
import React, { useState } from 'react';
import { motion } from 'framer-motion';

const RIT_SCENARIOS = [
  { spot: 'Flush Draw vs Top Pair', equity: 35, potSize: 200, color: '#3b82f6',
    explain: 'With 35% equity, you win 35% of both runs on average. RIT doesn\'t change EV, only variance.',
    varianceReduction: '~50% less variance. You\'ll win one run and lose the other more often.',
    shouldRun: 'Yes — you\'re the underdog. RIT protects your stack when you miss.' },
  { spot: 'Set vs Overpair', equity: 82, potSize: 350, color: '#22c55e',
    explain: 'Massive favorite. You\'ll win both runs most of the time, but occasionally split.',
    varianceReduction: '~50% less variance. Fewer cooler moments where you lose an 82% spot.',
    shouldRun: 'Optional — you\'re a big favorite. RIT slightly reduces your upside but protects downside.' },
  { spot: 'Coinflip (AKs vs QQ)', equity: 46, potSize: 500, color: '#f59e0b',
    explain: 'Near 50/50. Running it twice means you\'ll split the pot very frequently.',
    varianceReduction: '~50% less variance. Coinflips become half-pots much more often.',
    shouldRun: 'Strong yes — coinflips are the highest variance spots. RIT smooths them out.' },
  { spot: 'Combo Draw vs Two Pair', equity: 42, potSize: 280, color: '#8b5cf6',
    explain: 'Slight underdog with many outs. Good chance to win at least one run.',
    varianceReduction: '~50% less variance. You\'ll win one board more often than winning or losing both.',
    shouldRun: 'Yes — with 42% equity and lots of outs, you\'ll frequently split instead of losing all.' },
  { spot: 'Dominated (AK vs AA)', equity: 7, potSize: 400, color: '#ef4444',
    explain: 'Heavily dominated. Running twice gives you two chances but odds are still terrible.',
    varianceReduction: 'Minimal practical impact. You\'re losing both runs 86% of the time.',
    shouldRun: 'Doesn\'t matter much — you\'re crushed either way. Save mental energy.' },
];

export default function RunItTwiceCalc() {
  const [scenIdx, setScenIdx] = useState(0);
  const scen = RIT_SCENARIOS[scenIdx];
  const evOnce = (scen.equity / 100 * scen.potSize).toFixed(0);
  const evTwice = evOnce; // EV is identical

  return (
    <div style={{ padding: 20, color: '#e2e8f0' }}>
      <h3 style={{ fontSize: 20, fontWeight: 800, marginBottom: 8, background: 'linear-gradient(135deg, #8b5cf6, #3b82f6)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
        Run It Twice Calculator
      </h3>
      <p style={{ color: '#94a3b8', fontSize: 13, marginBottom: 16 }}>Same EV, less variance. When does it matter most?</p>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 16 }}>
        {RIT_SCENARIOS.map((s, i) => (
          <button key={i} onClick={() => setScenIdx(i)}
            style={{ padding: '6px 10px', borderRadius: 8, border: 'none', fontSize: 10, fontWeight: 600, cursor: 'pointer',
              background: scenIdx === i ? `linear-gradient(135deg, ${s.color}, ${s.color}cc)` : 'rgba(255,255,255,0.06)',
              color: scenIdx === i ? '#fff' : '#94a3b8' }}>
            {s.spot.substring(0, 15)}
          </button>
        ))}
      </div>

      <motion.div key={scenIdx} initial={{ opacity: 0 }} animate={{ opacity: 1 }}
        style={{ background: 'rgba(0,0,0,0.3)', borderRadius: 12, padding: 16, marginBottom: 16 }}>
        <div style={{ fontSize: 15, fontWeight: 800, color: scen.color, marginBottom: 8 }}>{scen.spot}</div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8, marginBottom: 12 }}>
          <div style={{ background: 'rgba(59,130,246,0.1)', borderRadius: 8, padding: 8, textAlign: 'center' }}>
            <div style={{ fontSize: 10, color: '#64748b' }}>Equity</div>
            <div style={{ fontSize: 18, fontWeight: 800, color: '#3b82f6' }}>{scen.equity}%</div>
          </div>
          <div style={{ background: 'rgba(34,197,94,0.1)', borderRadius: 8, padding: 8, textAlign: 'center' }}>
            <div style={{ fontSize: 10, color: '#64748b' }}>Pot Size</div>
            <div style={{ fontSize: 18, fontWeight: 800, color: '#22c55e' }}>${scen.potSize}</div>
          </div>
          <div style={{ background: 'rgba(245,158,11,0.1)', borderRadius: 8, padding: 8, textAlign: 'center' }}>
            <div style={{ fontSize: 10, color: '#64748b' }}>Your EV</div>
            <div style={{ fontSize: 18, fontWeight: 800, color: '#f59e0b' }}>${evOnce}</div>
          </div>
        </div>

        <p style={{ fontSize: 13, color: '#cbd5e1', marginBottom: 10 }}>{scen.explain}</p>

        <div style={{ display: 'grid', gap: 8 }}>
          <div style={{ background: 'rgba(139,92,246,0.06)', borderRadius: 8, padding: 10, borderLeft: '3px solid #8b5cf6' }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: '#8b5cf6' }}>Variance Impact</div>
            <div style={{ fontSize: 12, color: '#94a3b8' }}>{scen.varianceReduction}</div>
          </div>
          <div style={{ background: `${scen.color}08`, borderRadius: 8, padding: 10, borderLeft: `3px solid ${scen.color}` }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: scen.color }}>Should You RIT?</div>
            <div style={{ fontSize: 12, color: '#94a3b8' }}>{scen.shouldRun}</div>
          </div>
        </div>
      </motion.div>

      <div style={{ background: 'rgba(139,92,246,0.06)', borderRadius: 10, padding: 12, textAlign: 'center' }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: '#8b5cf6', marginBottom: 4 }}>Key Insight</div>
        <div style={{ fontSize: 12, color: '#94a3b8' }}>Running it twice NEVER changes your EV — only your variance. Always accept RIT as the underdog.</div>
      </div>
    </div>
  );
}
