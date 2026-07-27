/**
 * ICMDealMaker — ICM-Based Deal Making at Final Tables
 * Negotiate final table deals using ICM equity
 */
import React, { useState } from 'react';
import { motion } from 'framer-motion';

const DEAL_SCENARIOS = [
  { scenario: '3 Players — You\'re Chip Leader', icon: '★', color: '#22c55e',
    stacks: 'You: 500K | P2: 300K | P3: 200K',
    prizes: '1st: $5,000 | 2nd: $3,000 | 3rd: $2,000',
    icmEquity: 'You: $3,920 | P2: $3,450 | P3: $2,630',
    chipChop: 'You: $5,000 | P2: $3,000 | P3: $2,000',
    advice: 'ICM gives you less than chip chop. Push for chip chop or chip leader premium. Don\'t accept ICM flat.' },
  { scenario: '3 Players — You\'re Short Stack', icon: '▼', color: '#ef4444',
    stacks: 'P1: 500K | P2: 300K | You: 200K',
    prizes: '1st: $5,000 | 2nd: $3,000 | 3rd: $2,000',
    icmEquity: 'P1: $3,920 | P2: $3,450 | You: $2,630',
    chipChop: 'P1: $5,000 | P2: $3,000 | You: $2,000',
    advice: 'ICM gives you $630 MORE than chip chop. Push hard for ICM deal — it heavily favors short stacks.' },
  { scenario: '4 Players — Pay Bubble', icon: '●', color: '#f59e0b',
    stacks: 'P1: 400K | P2: 300K | P3: 200K | You: 100K',
    prizes: '1st: $8K | 2nd: $5K | 3rd: $3K | 4th: $0',
    icmEquity: 'P1: $5,280 | P2: $4,510 | P3: $3,560 | You: $2,650',
    chipChop: 'P1: $6,400 | P2: $4,800 | P3: $3,200 | You: $1,600',
    advice: 'On the bubble, ICM gives you $1,050 MORE than chip chop. You have huge incentive to deal NOW.' },
  { scenario: 'Heads-Up for the Title', icon: '★', color: '#3b82f6',
    stacks: 'You: 600K | Villain: 400K',
    prizes: '1st: $10,000 | 2nd: $6,000',
    icmEquity: 'You: $8,400 | Villain: $7,600',
    chipChop: 'You: $8,400 | Villain: $7,600',
    advice: 'HU ICM = chip chop! Consider saving $7K each and playing for the remaining $2K for excitement.' },
  { scenario: 'Even Stacks 3-Way', icon: '◇', color: '#8b5cf6',
    stacks: 'All three: 333K each',
    prizes: '1st: $5,000 | 2nd: $3,000 | 3rd: $2,000',
    icmEquity: 'All: $3,333 each',
    chipChop: 'All: $3,333 each',
    advice: 'Equal stacks = equal equity. Every deal method gives the same result. Just chop evenly.' },
];

export default function ICMDealMaker() {
  const [scenIdx, setScenIdx] = useState(0);
  const scen = DEAL_SCENARIOS[scenIdx];

  return (
    <div style={{ padding: 20, color: '#e2e8f0' }}>
      <h3 style={{ fontSize: 20, fontWeight: 800, marginBottom: 8, background: 'linear-gradient(135deg, #f59e0b, #8b5cf6)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
        ICM Deal Maker
      </h3>
      <p style={{ color: '#94a3b8', fontSize: 13, marginBottom: 16 }}>Negotiate final table deals with ICM equity.</p>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 4, marginBottom: 16 }}>
        {DEAL_SCENARIOS.map((s, i) => (
          <button key={i} onClick={() => setScenIdx(i)}
            style={{ padding: '8px 4px', borderRadius: 8, border: scenIdx === i ? `2px solid ${s.color}` : '1px solid rgba(255,255,255,0.06)',
              background: scenIdx === i ? `${s.color}15` : 'rgba(0,0,0,0.2)', cursor: 'pointer', textAlign: 'center' }}>
            <div style={{ fontSize: 14 }}>{s.icon}</div>
            <div style={{ fontSize: 7, fontWeight: 700, color: scenIdx === i ? s.color : '#64748b' }}>{s.scenario.substring(0, 14)}</div>
          </button>
        ))}
      </div>

      <motion.div key={scenIdx} initial={{ opacity: 0 }} animate={{ opacity: 1 }}
        style={{ background: 'rgba(0,0,0,0.3)', borderRadius: 12, padding: 16 }}>
        <div style={{ fontSize: 15, fontWeight: 800, color: scen.color, marginBottom: 8 }}>{scen.scenario}</div>
        <div style={{ display: 'grid', gap: 6, marginBottom: 10 }}>
          {[
            { label: 'Stacks', val: scen.stacks },
            { label: 'Prizes', val: scen.prizes },
            { label: 'ICM Equity', val: scen.icmEquity },
            { label: 'Chip Chop', val: scen.chipChop },
          ].map((r, i) => (
            <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'rgba(255,255,255,0.02)', borderRadius: 6, padding: '6px 10px' }}>
              <span style={{ fontSize: 10, fontWeight: 700, color: '#64748b' }}>{r.label}</span>
              <span style={{ fontSize: 10, color: '#cbd5e1', fontFamily: 'monospace' }}>{r.val}</span>
            </div>
          ))}
        </div>
        <div style={{ background: `${scen.color}10`, borderRadius: 8, padding: 10, borderLeft: `3px solid ${scen.color}` }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: scen.color }}>Negotiation Advice</div>
          <div style={{ fontSize: 12, color: '#94a3b8' }}>{scen.advice}</div>
        </div>
      </motion.div>
    </div>
  );
}
