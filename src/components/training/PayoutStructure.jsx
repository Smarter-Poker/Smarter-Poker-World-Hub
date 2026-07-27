/**
 * PayoutStructure — Understanding Payout Structures
 * How prize pool distribution affects strategy
 */
import React, { useState } from 'react';
import { motion } from 'framer-motion';

const PAYOUT_TYPES = [
  { structure: 'Top-Heavy (Winner Take All)', icon: '★', color: '#ef4444',
    distribution: '1st: 100% | 2nd: 0% | 3rd: 0%',
    strategy: 'Play to WIN. Maximum aggression. Chip EV > ICM. Gamble for the title.',
    adjust: 'This is basically a cash game. No ICM. Play for maximum chips at all times.',
    examples: 'Heads-up SNGs, winner-take-all satellites, bounty tournaments (bounties portion).' },
  { structure: 'Standard MTT (Top 15% Paid)', icon: '●', color: '#22c55e',
    distribution: '1st: 20-25% | 2nd: 12-15% | 3rd: 8-10% | Top 15% paid',
    strategy: 'Balanced approach. Play for chips early, ICM awareness near money. Go for the win after cashing.',
    adjust: 'Early: chip accumulation. Near bubble: ICM discipline. After bubble: accumulate for final table.',
    examples: 'Most online MTTs, WSOP events, regular Sunday tournaments.' },
  { structure: 'Flat Payout', icon: '■', color: '#3b82f6',
    distribution: '1st: 30% | 2nd: 25% | 3rd: 20% | 4th: 15% | 5th: 10%',
    strategy: 'Survival matters more. Each pay jump is significant. Tighter play is rewarded.',
    adjust: 'ICM impact is extreme. Avoid marginal spots. Let short stacks bust. Ladder up.',
    examples: 'Satellite tournaments (all qualifiers get equal prize), some invitational formats.' },
  { structure: 'Progressive Knockout (PKO)', icon: '»', color: '#f59e0b',
    distribution: '50% to bounties, 50% to prizes. Each knockout = cash in your pocket.',
    strategy: 'Bounties change the math. Call wider when you can win a bounty. Your own bounty grows with each KO.',
    adjust: 'Adjust calling ranges based on bounty size vs risk. Large bounties = call much wider.',
    examples: 'PKO format on PokerStars, GGPoker Progressive KO tournaments.' },
  { structure: 'Turbo / Hyper-Turbo', icon: '⌁', color: '#8b5cf6',
    distribution: 'Same as standard, but blind levels are fast (3-5 min each).',
    strategy: 'Push/fold comes much earlier. Less postflop play. Preflop ranges and shove/fold math are critical.',
    adjust: 'Study push/fold charts extensively. You\'ll be in shove/fold mode by level 5-6.',
    examples: 'Spin & Go, Hyper-Turbo SNGs, fast structure daily tournaments.' },
];

export default function PayoutStructure() {
  const [structIdx, setStructIdx] = useState(0);
  const struct = PAYOUT_TYPES[structIdx];

  return (
    <div style={{ padding: 20, color: '#e2e8f0' }}>
      <h3 style={{ fontSize: 20, fontWeight: 800, marginBottom: 8, background: 'linear-gradient(135deg, #f59e0b, #22c55e)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
        Payout Structures
      </h3>
      <p style={{ color: '#94a3b8', fontSize: 13, marginBottom: 16 }}>How prize distribution shapes your strategy.</p>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 4, marginBottom: 16 }}>
        {PAYOUT_TYPES.map((p, i) => (
          <button key={i} onClick={() => setStructIdx(i)}
            style={{ padding: '8px 4px', borderRadius: 8, border: structIdx === i ? `2px solid ${p.color}` : '1px solid rgba(255,255,255,0.06)',
              background: structIdx === i ? `${p.color}15` : 'rgba(0,0,0,0.2)', cursor: 'pointer', textAlign: 'center' }}>
            <div style={{ fontSize: 14 }}>{p.icon}</div>
            <div style={{ fontSize: 7, fontWeight: 700, color: structIdx === i ? p.color : '#64748b' }}>{p.structure.substring(0, 10)}</div>
          </button>
        ))}
      </div>

      <motion.div key={structIdx} initial={{ opacity: 0 }} animate={{ opacity: 1 }}
        style={{ background: 'rgba(0,0,0,0.3)', borderRadius: 12, padding: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
          <span style={{ fontSize: 24 }}>{struct.icon}</span>
          <span style={{ fontSize: 15, fontWeight: 800, color: struct.color }}>{struct.structure}</span>
        </div>
        <div style={{ background: `${struct.color}08`, borderRadius: 8, padding: 8, marginBottom: 10, fontFamily: 'monospace' }}>
          <div style={{ fontSize: 10, color: '#64748b' }}>Distribution</div>
          <div style={{ fontSize: 11, color: struct.color }}>{struct.distribution}</div>
        </div>
        <div style={{ display: 'grid', gap: 8 }}>
          <div style={{ background: 'rgba(34,197,94,0.06)', borderRadius: 8, padding: 10, borderLeft: '3px solid #22c55e' }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: '#22c55e' }}>Strategy</div>
            <div style={{ fontSize: 12, color: '#94a3b8' }}>{struct.strategy}</div>
          </div>
          <div style={{ background: 'rgba(59,130,246,0.06)', borderRadius: 8, padding: 10, borderLeft: '3px solid #3b82f6' }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: '#3b82f6' }}>Key Adjustment</div>
            <div style={{ fontSize: 12, color: '#94a3b8' }}>{struct.adjust}</div>
          </div>
          <div style={{ background: 'rgba(245,158,11,0.06)', borderRadius: 8, padding: 10, borderLeft: '3px solid #f59e0b' }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: '#f59e0b' }}>Examples</div>
            <div style={{ fontSize: 12, color: '#94a3b8' }}>{struct.examples}</div>
          </div>
        </div>
      </motion.div>
    </div>
  );
}
