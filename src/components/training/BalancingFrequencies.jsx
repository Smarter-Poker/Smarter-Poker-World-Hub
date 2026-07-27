/**
 * BalancingFrequencies — GTO Frequency Balance
 * Understand and practice balancing your bet/check, raise/call ratios
 */
import React, { useState, useMemo } from 'react';
import { motion } from 'framer-motion';

const BALANCE_SPOTS = [
  { spot: 'Flop C-Bet (IP, SRP, Dry)', betFreq: 70, checkFreq: 30, color: '#22c55e',
    betRange: 'All pairs, draws, overcards, air with backdoors',
    checkRange: 'Some medium pairs for protection, air without backdoors',
    note: 'On dry boards, you can bet at very high frequency with small sizing.' },
  { spot: 'Flop C-Bet (IP, SRP, Wet)', betFreq: 45, checkFreq: 55, color: '#3b82f6',
    betRange: 'Strong hands, draws with equity, some air',
    checkRange: 'Medium pairs, backdoor draws, showdown value',
    note: 'Wet boards require selectivity. Check more and bet larger when you do bet.' },
  { spot: 'Turn Barrel (after flop c-bet)', betFreq: 55, checkFreq: 45, color: '#f59e0b',
    betRange: 'Strong hands, improved draws, scare card bluffs',
    checkRange: 'Medium hands with showdown, weak hands giving up',
    note: 'Turn is where bluffs start dropping out. Only barrel with equity or strong hands.' },
  { spot: 'River Value/Bluff Ratio', betFreq: 67, checkFreq: 33, color: '#ef4444',
    betRange: '2:1 value to bluff ratio (for pot-sized bets)',
    checkRange: 'Medium hands → check for showdown',
    note: 'For pot-size bets: 2 value combos for every 1 bluff combo. This is the GTO ratio.' },
  { spot: 'BB Defense vs BTN Open', betFreq: 55, checkFreq: 45, color: '#8b5cf6',
    betRange: '3-bet 12-15%, call 40-45%',
    checkRange: 'Fold ~45%',
    note: 'Defend ~55% of hands vs BTN opens. Mix between 3-bets and calls.' },
];

export default function BalancingFrequencies() {
  const [spotIdx, setSpotIdx] = useState(0);
  const spot = BALANCE_SPOTS[spotIdx];

  return (
    <div style={{ padding: 20, color: '#e2e8f0' }}>
      <h3 style={{ fontSize: 20, fontWeight: 800, marginBottom: 8, background: 'linear-gradient(135deg, #6366f1, #8b5cf6)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
        ◇ Balancing Frequencies
      </h3>
      <p style={{ color: '#94a3b8', fontSize: 13, marginBottom: 16 }}>GTO-balanced frequencies for every major decision point.</p>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 16 }}>
        {BALANCE_SPOTS.map((s, i) => (
          <button key={i} onClick={() => setSpotIdx(i)}
            style={{ padding: '6px 12px', borderRadius: 8, border: 'none', fontSize: 11, fontWeight: 600, cursor: 'pointer',
              background: spotIdx === i ? `linear-gradient(135deg, ${s.color}, ${s.color}cc)` : 'rgba(255,255,255,0.06)',
              color: spotIdx === i ? '#fff' : '#94a3b8' }}>
            {s.spot.substring(0, 20)}...
          </button>
        ))}
      </div>

      <motion.div key={spotIdx} initial={{ opacity: 0 }} animate={{ opacity: 1 }}
        style={{ background: 'rgba(0,0,0,0.3)', borderRadius: 12, padding: 16, marginBottom: 16 }}>
        <div style={{ fontSize: 14, fontWeight: 700, color: '#e2e8f0', marginBottom: 12 }}>{spot.spot}</div>

        {/* Frequency bar */}
        <div style={{ marginBottom: 12 }}>
          <div style={{ display: 'flex', height: 32, borderRadius: 8, overflow: 'hidden' }}>
            <motion.div initial={{ width: 0 }} animate={{ width: `${spot.betFreq}%` }}
              style={{ background: spot.color, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, fontWeight: 800, color: '#fff' }}>
              Bet {spot.betFreq}%
            </motion.div>
            <motion.div initial={{ width: 0 }} animate={{ width: `${spot.checkFreq}%` }}
              style={{ background: 'rgba(255,255,255,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, fontWeight: 700, color: '#94a3b8' }}>
              Check {spot.checkFreq}%
            </motion.div>
          </div>
        </div>

        <div style={{ display: 'grid', gap: 8 }}>
          <div style={{ background: `${spot.color}08`, borderLeft: `3px solid ${spot.color}`, borderRadius: 8, padding: 10 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: spot.color }}>BET WITH</div>
            <div style={{ fontSize: 12, color: '#94a3b8' }}>{spot.betRange}</div>
          </div>
          <div style={{ background: 'rgba(255,255,255,0.03)', borderLeft: '3px solid #475569', borderRadius: 8, padding: 10 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: '#64748b' }}>CHECK WITH</div>
            <div style={{ fontSize: 12, color: '#94a3b8' }}>{spot.checkRange}</div>
          </div>
        </div>

        <p style={{ fontSize: 12, color: '#cbd5e1', marginTop: 8, fontStyle: 'italic' }}> {spot.note}</p>
      </motion.div>
    </div>
  );
}
