/**
 * PotOddsTrainer — Interactive Pot Odds Practice
 * Practice calculating pot odds and comparing to equity in real time
 */
import React, { useState, useMemo } from 'react';
import { motion } from 'framer-motion';

const SCENARIOS = [
  { pot: 80, bet: 40, outs: 9, desc: 'Flush draw on the flop', cards: 2 },
  { pot: 60, bet: 45, outs: 8, desc: 'Open-ended straight draw, turn', cards: 1 },
  { pot: 100, bet: 33, outs: 15, desc: 'Flush + straight draw on flop', cards: 2 },
  { pot: 50, bet: 50, outs: 4, desc: 'Gutshot on the turn', cards: 1 },
  { pot: 120, bet: 60, outs: 12, desc: 'Flush draw + gutshot, flop', cards: 2 },
  { pot: 75, bet: 25, outs: 6, desc: 'Two overcards, turn', cards: 1 },
];

export default function PotOddsTrainer() {
  const [scenarioIdx, setScenarioIdx] = useState(0);
  const [userGuess, setUserGuess] = useState(null);
  const s = SCENARIOS[scenarioIdx];

  const analysis = useMemo(() => {
    const potOdds = s.bet / (s.pot + s.bet);
    const equity = s.cards === 2 ? 1 - Math.pow((46 - s.outs) / 46 * (45 - s.outs) / 45, 1) : s.outs / 46;
    const ev = (equity * (s.pot + s.bet)) - ((1 - equity) * s.bet);
    return {
      potOdds: (potOdds * 100).toFixed(1),
      equity: (equity * 100).toFixed(1),
      profitable: equity > potOdds,
      ev: ev.toFixed(1),
    };
  }, [s]);

  return (
    <div style={{ padding: 20, color: '#e2e8f0' }}>
      <h3 style={{ fontSize: 20, fontWeight: 800, marginBottom: 8, background: 'linear-gradient(135deg, #22c55e, #3b82f6)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
        Pot Odds Trainer
      </h3>
      <p style={{ color: '#94a3b8', fontSize: 13, marginBottom: 16 }}>Should you call? Practice the math that wins poker.</p>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 16 }}>
        {SCENARIOS.map((sc, i) => (
          <button key={i} onClick={() => { setScenarioIdx(i); setUserGuess(null); }}
            style={{ padding: '6px 10px', borderRadius: 8, border: 'none', fontSize: 11, fontWeight: 600, cursor: 'pointer',
              background: scenarioIdx === i ? 'linear-gradient(135deg, #22c55e, #3b82f6)' : 'rgba(255,255,255,0.06)',
              color: scenarioIdx === i ? '#fff' : '#94a3b8' }}>
            {sc.desc.substring(0, 15)}
          </button>
        ))}
      </div>

      <div style={{ background: 'rgba(0,0,0,0.3)', borderRadius: 12, padding: 16, marginBottom: 16 }}>
        <div style={{ fontSize: 13, color: '#94a3b8', marginBottom: 12 }}>{s.desc}</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8, marginBottom: 16 }}>
          <div style={{ background: 'rgba(59,130,246,0.1)', borderRadius: 8, padding: 10, textAlign: 'center' }}>
            <div style={{ fontSize: 10, color: '#64748b' }}>Pot</div>
            <div style={{ fontSize: 20, fontWeight: 800, color: '#3b82f6' }}>{s.pot}</div>
          </div>
          <div style={{ background: 'rgba(239,68,68,0.1)', borderRadius: 8, padding: 10, textAlign: 'center' }}>
            <div style={{ fontSize: 10, color: '#64748b' }}>Bet to Call</div>
            <div style={{ fontSize: 20, fontWeight: 800, color: '#ef4444' }}>{s.bet}</div>
          </div>
          <div style={{ background: 'rgba(245,158,11,0.1)', borderRadius: 8, padding: 10, textAlign: 'center' }}>
            <div style={{ fontSize: 10, color: '#64748b' }}>Outs ({s.cards === 2 ? '2 cards' : '1 card'})</div>
            <div style={{ fontSize: 20, fontWeight: 800, color: '#f59e0b' }}>{s.outs}</div>
          </div>
        </div>

        {userGuess === null ? (
          <div style={{ display: 'flex', gap: 8, justifyContent: 'center' }}>
            <button onClick={() => setUserGuess(true)}
              style={{ padding: '10px 24px', borderRadius: 8, border: 'none', fontWeight: 700, cursor: 'pointer',
                background: 'linear-gradient(135deg, #22c55e, #10b981)', color: '#fff', fontSize: 14 }}>
              ✓ Call
            </button>
            <button onClick={() => setUserGuess(false)}
              style={{ padding: '10px 24px', borderRadius: 8, border: 'none', fontWeight: 700, cursor: 'pointer',
                background: 'linear-gradient(135deg, #ef4444, #dc2626)', color: '#fff', fontSize: 14 }}>
              ✕ Fold
            </button>
          </div>
        ) : (
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
            <div style={{ textAlign: 'center', marginBottom: 12 }}>
              <div style={{ fontSize: 16, fontWeight: 800, color: userGuess === analysis.profitable ? '#22c55e' : '#ef4444' }}>
                {userGuess === analysis.profitable ? '✓ Correct!' : '✕ Wrong!'}
              </div>
              <div style={{ fontSize: 14, fontWeight: 700, color: analysis.profitable ? '#22c55e' : '#ef4444' }}>
                {analysis.profitable ? 'CALL — +EV' : 'FOLD — -EV'}
              </div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}>
              <div style={{ background: 'rgba(255,255,255,0.03)', borderRadius: 8, padding: 8, textAlign: 'center' }}>
                <div style={{ fontSize: 10, color: '#64748b' }}>Pot Odds</div>
                <div style={{ fontSize: 16, fontWeight: 800, color: '#ef4444' }}>{analysis.potOdds}%</div>
              </div>
              <div style={{ background: 'rgba(255,255,255,0.03)', borderRadius: 8, padding: 8, textAlign: 'center' }}>
                <div style={{ fontSize: 10, color: '#64748b' }}>Your Equity</div>
                <div style={{ fontSize: 16, fontWeight: 800, color: '#22c55e' }}>{analysis.equity}%</div>
              </div>
              <div style={{ background: 'rgba(255,255,255,0.03)', borderRadius: 8, padding: 8, textAlign: 'center' }}>
                <div style={{ fontSize: 10, color: '#64748b' }}>EV of Call</div>
                <div style={{ fontSize: 16, fontWeight: 800, color: parseFloat(analysis.ev) > 0 ? '#22c55e' : '#ef4444' }}>{analysis.ev}</div>
              </div>
            </div>
          </motion.div>
        )}
      </div>
    </div>
  );
}
