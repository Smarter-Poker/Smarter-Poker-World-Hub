/**
 * RangeVsRange — Range vs Range Equity Analysis
 * How your entire range performs against villain's range
 */
import React, { useState } from 'react';
import { motion } from 'framer-motion';

const RVR_MATCHUPS = [
  { matchup: 'UTG Open vs BTN 3-Bet', color: '#ef4444', icon: '»',
    range1: 'UTG: 77+, ATs+, KQs, AJo+ (~13%)',
    range2: 'BTN 3-Bet: TT+, AQs+, A5s-A4s, KQs, AKo (~8%)',
    equity: 'UTG: ~47% | BTN: ~53%',
    insight: 'BTN\'s 3-bet range is slightly ahead. UTG should 4-bet AA-QQ, AKs, and fold the bottom of their range.',
    key: 'The 3-bettor has a tighter, stronger range. Don\'t defend too wide from UTG.' },
  { matchup: 'BTN Open vs BB Defend', color: '#22c55e', icon: '■',
    range1: 'BTN: 22+, A2s+, K5s+, Q8s+, J9s+, A4o+, KTo+ (~40%)',
    range2: 'BB Defend: 22+, A2s+, K7s+, Q9s+, JTs, A7o+, KJo+ (~35%)',
    equity: 'BTN: ~53% | BB: ~47%',
    insight: 'Surprisingly close! The BB gets a discount and defends wide. BTN\'s range advantage is small.',
    key: 'BB defense ranges are wider than you think. Don\'t over c-bet; BB has plenty of hands.' },
  { matchup: 'CO Open vs SB 3-Bet', color: '#3b82f6', icon: '▲',
    range1: 'CO: 55+, A3s+, K9s+, QTs+, JTs, A9o+, KQo (~27%)',
    range2: 'SB 3-Bet: QQ+, AKs, A5s-A4s, KQs, AKo (~6%)',
    equity: 'CO: ~42% | SB: ~58%',
    insight: 'SB is 3-betting tight and has significant equity advantage. CO must tighten their continuing range.',
    key: 'Against SB 3-bets, respect the range. They\'re usually strong from that position.' },
  { matchup: 'Loose Open vs Tight 3-Bet', color: '#f59e0b', icon: '◆',
    range1: 'Loose Open: Any pair, any suited, any broadway (~50%)',
    range2: 'Tight 3-Bet: JJ+, AQs+, AKo (~4%)',
    equity: 'Loose: ~35% | Tight: ~65%',
    insight: 'When a tight player 3-bets your wide open, you\'re in trouble. Fold most of your range.',
    key: 'Equity disparity grows as ranges widen vs tighten. Respect tight 3-bettors.' },
  { matchup: 'Postflop: PFR vs Caller on A♠7♦2♣', color: '#8b5cf6', icon: '●',
    range1: 'PFR: AA, KK, QQ, AK, AQ, AJ, KQs (~top 15%)',
    range2: 'Caller: 77-JJ, A7s-ATs, KQs, QJs (~mid range)',
    equity: 'PFR: ~62% | Caller: ~38%',
    insight: 'PFR has massive range advantage on ace-high boards. They have all the AA, AK, AQ combos.',
    key: 'Range advantage on dry boards justifies frequent c-betting. PFR should bet entire range here.' },
];

export default function RangeVsRange() {
  const [matchIdx, setMatchIdx] = useState(0);
  const match = RVR_MATCHUPS[matchIdx];

  return (
    <div style={{ padding: 20, color: '#e2e8f0' }}>
      <h3 style={{ fontSize: 20, fontWeight: 800, marginBottom: 8, background: 'linear-gradient(135deg, #ef4444, #8b5cf6)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
        Range vs Range
      </h3>
      <p style={{ color: '#94a3b8', fontSize: 13, marginBottom: 16 }}>Think in ranges, not hands.</p>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 4, marginBottom: 16 }}>
        {RVR_MATCHUPS.map((m, i) => (
          <button key={i} onClick={() => setMatchIdx(i)}
            style={{ padding: '8px 4px', borderRadius: 8, border: matchIdx === i ? `2px solid ${m.color}` : '1px solid rgba(255,255,255,0.06)',
              background: matchIdx === i ? `${m.color}15` : 'rgba(0,0,0,0.2)', cursor: 'pointer', textAlign: 'center' }}>
            <div style={{ fontSize: 14 }}>{m.icon}</div>
            <div style={{ fontSize: 7, fontWeight: 700, color: matchIdx === i ? m.color : '#64748b' }}>{m.matchup.substring(0, 12)}</div>
          </button>
        ))}
      </div>

      <motion.div key={matchIdx} initial={{ opacity: 0 }} animate={{ opacity: 1 }}
        style={{ background: 'rgba(0,0,0,0.3)', borderRadius: 12, padding: 16 }}>
        <div style={{ fontSize: 15, fontWeight: 800, color: match.color, marginBottom: 8 }}>{match.matchup}</div>
        <div style={{ display: 'grid', gap: 6, marginBottom: 10 }}>
          <div style={{ background: 'rgba(59,130,246,0.05)', borderRadius: 6, padding: 8, fontFamily: 'monospace', fontSize: 11 }}>
            <span style={{ color: '#3b82f6' }}>{match.range1}</span>
          </div>
          <div style={{ background: 'rgba(239,68,68,0.05)', borderRadius: 6, padding: 8, fontFamily: 'monospace', fontSize: 11 }}>
            <span style={{ color: '#ef4444' }}>{match.range2}</span>
          </div>
        </div>
        <div style={{ background: `${match.color}10`, borderRadius: 8, padding: 8, textAlign: 'center', marginBottom: 10 }}>
          <div style={{ fontSize: 10, color: '#64748b' }}>Equity</div>
          <div style={{ fontSize: 15, fontWeight: 800, color: match.color }}>{match.equity}</div>
        </div>
        <p style={{ fontSize: 13, color: '#cbd5e1', marginBottom: 8 }}>{match.insight}</p>
        <div style={{ background: 'rgba(245,158,11,0.06)', borderRadius: 8, padding: 10, borderLeft: '3px solid #f59e0b' }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: '#f59e0b' }}>Key Takeaway</div>
          <div style={{ fontSize: 12, color: '#94a3b8' }}>{match.key}</div>
        </div>
      </motion.div>
    </div>
  );
}
