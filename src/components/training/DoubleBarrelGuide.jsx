/**
 * DoubleBarrelGuide — Turn Continuation Bet Strategy
 * When to fire the second barrel: board texture changes, equity shifts, opponent tendencies
 */
import React, { useState } from 'react';
import { motion } from 'framer-motion';

const SCENARIOS = [
  { board: ['A♠','K♦','7♣','2♥'], label: 'AK72 Rainbow', verdict: 'BARREL', reason: 'Dry board, your range advantage persists. Barrel 65-75% pot on blanks.' },
  { board: ['Q♥','J♥','5♦','9♠'], label: 'QJ5♥-9', verdict: 'CHECK', reason: 'Straight completes, flush draw missed but board got coordinated. Check back with marginal hands.' },
  { board: ['T♠','8♣','3♦','T♥'], label: 'T83-T paired', verdict: 'BARREL', reason: 'Board pairs favor the PFR. Barrel for value + fold equity with Tx and overpairs.' },
  { board: ['K♦','9♣','4♠','6♣'], label: 'K94-6 backdoor', verdict: 'BARREL', reason: 'Backdoor flush draw arrived but board still dry. Continue with overcards and pairs.' },
  { board: ['A♥','7♥','2♣','J♦'], label: 'A72♥-J', verdict: 'BARREL', reason: 'Overcard on turn changes nothing for Ax. Keep barreling broadways and Ax combos.' },
  { board: ['8♠','7♦','6♣','5♥'], label: '876-5 four straight', verdict: 'CHECK', reason: 'Four to a straight kills your fold equity. Even 9x makes a straight. Shut down.' },
  { board: ['K♣','Q♠','4♦','A♥'], label: 'KQ4-A scare card', verdict: 'BARREL', reason: 'Ace on turn is great for PFR range. Fire big — opponents fold Kx, Qx.' },
  { board: ['J♣','T♣','2♠','3♦'], label: 'JT♣2-3 brick', verdict: 'BARREL', reason: 'Brick turn on draw-heavy flop. Barrel to deny equity from flush/straight draws.' },
];

const FACTORS = [
  { name: 'Board Texture Change', desc: 'Did the turn card change the texture? Scare cards favor the PFR.' },
  { name: 'Range Advantage', desc: 'Does your range still have more strong hands than villain on this board?' },
  { name: 'Opponent Tendencies', desc: 'Is villain a calling station or a folder? Adjust barrel frequency accordingly.' },
  { name: 'Pot Geometry', desc: 'Can you set up a river shove? Plan your sizing across streets.' },
  { name: 'Equity Retention', desc: 'Do you have enough equity if called? Backdoor draws add barrel incentive.' },
];

export default function DoubleBarrelGuide() {
  const [selectedIdx, setSelectedIdx] = useState(0);
  const [showVerdict, setShowVerdict] = useState(false);
  const scenario = SCENARIOS[selectedIdx];

  return (
    <div style={{ padding: 20, color: '#e2e8f0' }}>
      <h3 style={{ fontSize: 20, fontWeight: 800, marginBottom: 8, background: 'linear-gradient(135deg, #f59e0b, #ef4444)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
        Double Barrel Guide
      </h3>
      <p style={{ color: '#94a3b8', fontSize: 13, marginBottom: 16 }}>Master the turn continuation bet — when to fire and when to give up.</p>

      {/* Scenario selector */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 16 }}>
        {SCENARIOS.map((s, i) => (
          <button key={i} onClick={() => { setSelectedIdx(i); setShowVerdict(false); }}
            style={{ padding: '6px 12px', borderRadius: 8, border: 'none', fontSize: 12, fontWeight: 600, cursor: 'pointer',
              background: selectedIdx === i ? 'linear-gradient(135deg, #f59e0b, #ef4444)' : 'rgba(255,255,255,0.06)', color: selectedIdx === i ? '#000' : '#94a3b8' }}>
            {s.label}
          </button>
        ))}
      </div>

      {/* Board display */}
      <div style={{ background: 'rgba(0,0,0,0.3)', borderRadius: 12, padding: 16, marginBottom: 16 }}>
        <div style={{ display: 'flex', gap: 8, justifyContent: 'center', marginBottom: 12 }}>
          {scenario.board.map((c, i) => (
            <motion.div key={i} initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ delay: i * 0.1 }}
              style={{ width: 48, height: 64, background: i === 3 ? 'linear-gradient(135deg, #f59e0b, #b45309)' : 'linear-gradient(135deg, #1e293b, #334155)',
                borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20, fontWeight: 800,
                border: i === 3 ? '2px solid #f59e0b' : '1px solid rgba(255,255,255,0.1)',
                color: c.includes('♥') || c.includes('♦') ? '#ef4444' : '#e2e8f0' }}>
              {c}
            </motion.div>
          ))}
        </div>
        <div style={{ textAlign: 'center' }}>
          {!showVerdict ? (
            <button onClick={() => setShowVerdict(true)}
              style={{ padding: '8px 24px', borderRadius: 8, border: 'none', fontWeight: 700, cursor: 'pointer',
                background: 'linear-gradient(135deg, #f59e0b, #ef4444)', color: '#000', fontSize: 14 }}>
              Barrel or Check?
            </button>
          ) : (
            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
              <div style={{ fontSize: 18, fontWeight: 800, color: scenario.verdict === 'BARREL' ? '#22c55e' : '#ef4444', marginBottom: 6 }}>
                {scenario.verdict === 'BARREL' ? 'BARREL' : 'CHECK'}
              </div>
              <p style={{ color: '#cbd5e1', fontSize: 13 }}>{scenario.reason}</p>
            </motion.div>
          )}
        </div>
      </div>

      {/* Key factors */}
      <h4 style={{ fontSize: 14, fontWeight: 700, color: '#f59e0b', marginBottom: 8 }}>Key Decision Factors</h4>
      <div style={{ display: 'grid', gap: 6 }}>
        {FACTORS.map((f, i) => (
          <div key={i} style={{ background: 'rgba(245,158,11,0.06)', borderRadius: 8, padding: '8px 12px', borderLeft: '3px solid #f59e0b' }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: '#f59e0b' }}>{f.name}</div>
            <div style={{ fontSize: 12, color: '#94a3b8' }}>{f.desc}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
