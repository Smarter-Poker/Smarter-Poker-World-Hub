/**
 * OverbetBluffGuide — Overbetting as a Bluff
 * When and how to overbet bluff for maximum fold equity
 */
import React, { useState } from 'react';
import { motion } from 'framer-motion';

const BLUFF_SPOTS = [
  { title: 'Missed Flush Draw on River', board: 'K♠ 9♥ 4♣ 7♦ 2♠', hand: 'A♠T♠', sizing: '150% pot',
    color: '#ef4444', story: 'Flush missed but you can rep the nut flush by overbetting. Villain\'s range is capped to one pair.',
    foldEq: 60, neededFoldEq: 43 },
  { title: 'Scare Card River Bluff', board: 'Q♦ J♣ 5♠ 3♦ A♥', hand: '8♠7♠', sizing: '125% pot',
    color: '#f59e0b', story: 'Ace on river is perfect to overbet. You rep AQ/AJ/AK. Villain folds Qx, Jx, pocket pairs.',
    foldEq: 55, neededFoldEq: 38 },
  { title: 'Straight Completing River', board: 'T♥ 8♣ 3♦ 6♠ 7♣', hand: 'A♦K♦', sizing: '150% pot',
    color: '#22c55e', story: '4-straight on board. Overbet rep the straight. Villain can\'t call with overpairs.',
    foldEq: 65, neededFoldEq: 43 },
  { title: 'Board Pairs on River', board: 'K♠ Q♦ 8♣ 5♥ K♥', hand: 'J♠T♠', sizing: '125% pot',
    color: '#8b5cf6', story: 'K pairs on river. Overbet rep trips/full house. Your missed straight draw becomes a powerful bluff.',
    foldEq: 50, neededFoldEq: 38 },
];

export default function OverbetBluffGuide() {
  const [spotIdx, setSpotIdx] = useState(0);
  const [showMath, setShowMath] = useState(false);
  const spot = BLUFF_SPOTS[spotIdx];

  return (
    <div style={{ padding: 20, color: '#e2e8f0' }}>
      <h3 style={{ fontSize: 20, fontWeight: 800, marginBottom: 8, background: 'linear-gradient(135deg, #ef4444, #dc2626)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
         Overbet Bluff Guide
      </h3>
      <p style={{ color: '#94a3b8', fontSize: 13, marginBottom: 16 }}>Maximum pressure bluffs — when the board tells your story.</p>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 16 }}>
        {BLUFF_SPOTS.map((s, i) => (
          <button key={i} onClick={() => { setSpotIdx(i); setShowMath(false); }}
            style={{ padding: '6px 12px', borderRadius: 8, border: 'none', fontSize: 11, fontWeight: 600, cursor: 'pointer',
              background: spotIdx === i ? `linear-gradient(135deg, ${s.color}, ${s.color}cc)` : 'rgba(255,255,255,0.06)',
              color: spotIdx === i ? '#fff' : '#94a3b8' }}>
            {s.title.substring(0, 18)}
          </button>
        ))}
      </div>

      <motion.div key={spotIdx} initial={{ opacity: 0 }} animate={{ opacity: 1 }}
        style={{ background: 'rgba(0,0,0,0.3)', borderRadius: 12, padding: 16, marginBottom: 16 }}>
        <div style={{ fontSize: 20, fontWeight: 800, letterSpacing: 2, textAlign: 'center', marginBottom: 4 }}>{spot.board}</div>
        <div style={{ fontSize: 12, color: '#64748b', textAlign: 'center', marginBottom: 12 }}>Hand: <span style={{ color: '#ef4444', fontWeight: 700 }}>{spot.hand}</span> (air)</div>

        <div style={{ display: 'flex', gap: 8, justifyContent: 'center', marginBottom: 12 }}>
          <div style={{ background: `${spot.color}15`, borderRadius: 8, padding: '6px 16px', textAlign: 'center' }}>
            <div style={{ fontSize: 10, color: '#64748b' }}>Sizing</div>
            <div style={{ fontSize: 18, fontWeight: 800, color: spot.color }}>{spot.sizing}</div>
          </div>
        </div>

        <div style={{ background: `${spot.color}08`, borderRadius: 8, padding: 10, borderLeft: `3px solid ${spot.color}`, marginBottom: 8 }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: spot.color }}>The Story</div>
          <div style={{ fontSize: 12, color: '#94a3b8' }}>{spot.story}</div>
        </div>

        <button onClick={() => setShowMath(!showMath)}
          style={{ width: '100%', padding: '6px', borderRadius: 6, border: 'none', cursor: 'pointer', background: 'rgba(255,255,255,0.05)', color: '#64748b', fontSize: 11, fontWeight: 600 }}>
          {showMath ? '▼' : '▶'} Show Math
        </button>
        {showMath && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} style={{ marginTop: 8 }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
              <div style={{ background: 'rgba(34,197,94,0.08)', borderRadius: 8, padding: 8, textAlign: 'center' }}>
                <div style={{ fontSize: 10, color: '#64748b' }}>Expected Fold %</div>
                <div style={{ fontSize: 20, fontWeight: 800, color: '#22c55e' }}>{spot.foldEq}%</div>
              </div>
              <div style={{ background: 'rgba(245,158,11,0.08)', borderRadius: 8, padding: 8, textAlign: 'center' }}>
                <div style={{ fontSize: 10, color: '#64748b' }}>Need to Fold</div>
                <div style={{ fontSize: 20, fontWeight: 800, color: '#f59e0b' }}>{spot.neededFoldEq}%</div>
              </div>
            </div>
            <div style={{ fontSize: 11, color: '#22c55e', textAlign: 'center', marginTop: 6, fontWeight: 700 }}>
              ✓ +EV Bluff ({spot.foldEq}% fold &gt; {spot.neededFoldEq}% needed)
            </div>
          </motion.div>
        )}
      </motion.div>
    </div>
  );
}
