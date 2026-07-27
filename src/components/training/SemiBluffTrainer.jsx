/**
 * SemiBluffTrainer — Master the Semi-Bluff
 * Practice identifying optimal semi-bluff spots with draws
 */
import React, { useState } from 'react';
import { motion } from 'framer-motion';

const SPOTS = [
  { hand: 'A♥ 5♥', board: 'K♥ 9♥ 3♠', outs: 9, equity: 35, verdict: 'SEMI-BLUFF',
    sizing: '66-75% pot', reason: 'Nut flush draw + backdoor straight. 9 outs with 2 cards to come. Bet to deny equity and build pot for when you hit.' },
  { hand: 'J♠ T♠', board: 'Q♣ 9♦ 4♠', outs: 8, equity: 31, verdict: 'SEMI-BLUFF',
    sizing: '50-66% pot', reason: 'Open-ended straight draw. 8 clean outs. Great candidate to barrel the turn if a scare card arrives.' },
  { hand: '7♥ 6♥', board: 'A♥ 8♥ 2♣', outs: 9, equity: 35, verdict: 'SEMI-BLUFF',
    sizing: '50% pot', reason: 'Flush draw facing an Ace-high board. Your flush draw has great equity. Bet to fold out Kx, Qx with no heart.' },
  { hand: 'T♣ 9♣', board: 'J♦ 7♠ 2♥', outs: 4, equity: 17, verdict: 'CHECK',
    sizing: 'N/A', reason: 'Only a gutshot (4 outs). Not enough equity to semi-bluff profitably. Check and re-evaluate the turn.' },
  { hand: 'Q♠ J♠', board: 'K♠ T♣ 3♠', outs: 17, equity: 54, verdict: 'SEMI-BLUFF',
    sizing: '75-100% pot', reason: 'Flush draw + OESD = 17 outs! You\'re actually a FAVORITE. Bet large or even check-raise for max pressure.' },
  { hand: '6♦ 5♦', board: 'K♣ Q♥ 8♠', outs: 0, equity: 5, verdict: 'GIVE UP',
    sizing: 'N/A', reason: 'No draw, no equity, no fold equity vs this board. Pure air — save your chips.' },
];

export default function SemiBluffTrainer() {
  const [spotIdx, setSpotIdx] = useState(0);
  const [showAnswer, setShowAnswer] = useState(false);
  const [score, setScore] = useState({ correct: 0, total: 0 });
  const spot = SPOTS[spotIdx];

  const handleGuess = (guess) => {
    const correct = guess === spot.verdict;
    setScore(prev => ({ correct: prev.correct + (correct ? 1 : 0), total: prev.total + 1 }));
    setShowAnswer(true);
  };

  const nextSpot = () => {
    setSpotIdx((spotIdx + 1) % SPOTS.length);
    setShowAnswer(false);
  };

  return (
    <div style={{ padding: 20, color: '#e2e8f0' }}>
      <h3 style={{ fontSize: 20, fontWeight: 800, marginBottom: 8, background: 'linear-gradient(135deg, #ec4899, #ef4444)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
         Semi-Bluff Trainer
      </h3>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <p style={{ color: '#94a3b8', fontSize: 13, margin: 0 }}>Should you semi-bluff or give up?</p>
        {score.total > 0 && (
          <span style={{ fontSize: 12, fontWeight: 700, color: '#22c55e' }}>
            {score.correct}/{score.total} ({Math.round(score.correct/score.total*100)}%)
          </span>
        )}
      </div>

      {/* Hand & Board */}
      <div style={{ background: 'rgba(0,0,0,0.3)', borderRadius: 12, padding: 16, marginBottom: 16, textAlign: 'center' }}>
        <div style={{ fontSize: 12, color: '#64748b', fontWeight: 600, marginBottom: 4 }}>YOUR HAND</div>
        <div style={{ fontSize: 22, fontWeight: 800, marginBottom: 12 }}>{spot.hand}</div>
        <div style={{ fontSize: 12, color: '#64748b', fontWeight: 600, marginBottom: 4 }}>BOARD</div>
        <div style={{ fontSize: 24, fontWeight: 800, letterSpacing: 4, marginBottom: 12 }}>{spot.board}</div>

        {!showAnswer ? (
          <div style={{ display: 'flex', gap: 8, justifyContent: 'center' }}>
            <button onClick={() => handleGuess('SEMI-BLUFF')}
              style={{ padding: '10px 20px', borderRadius: 8, border: 'none', fontWeight: 700, cursor: 'pointer',
                background: 'linear-gradient(135deg, #ec4899, #ef4444)', color: '#fff', fontSize: 13 }}>
              ▲ Semi-Bluff
            </button>
            <button onClick={() => handleGuess('CHECK')}
              style={{ padding: '10px 20px', borderRadius: 8, border: 'none', fontWeight: 700, cursor: 'pointer',
                background: 'rgba(255,255,255,0.1)', color: '#94a3b8', fontSize: 13 }}>
               Check
            </button>
            <button onClick={() => handleGuess('GIVE UP')}
              style={{ padding: '10px 20px', borderRadius: 8, border: 'none', fontWeight: 700, cursor: 'pointer',
                background: 'rgba(255,255,255,0.06)', color: '#64748b', fontSize: 13 }}>
               Give Up
            </button>
          </div>
        ) : (
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
            <div style={{ display: 'flex', gap: 12, justifyContent: 'center', marginBottom: 12 }}>
              <div style={{ background: 'rgba(236,72,153,0.1)', borderRadius: 8, padding: '6px 12px' }}>
                <div style={{ fontSize: 10, color: '#64748b' }}>Outs</div>
                <div style={{ fontSize: 18, fontWeight: 800, color: '#ec4899' }}>{spot.outs}</div>
              </div>
              <div style={{ background: 'rgba(59,130,246,0.1)', borderRadius: 8, padding: '6px 12px' }}>
                <div style={{ fontSize: 10, color: '#64748b' }}>Equity</div>
                <div style={{ fontSize: 18, fontWeight: 800, color: '#3b82f6' }}>{spot.equity}%</div>
              </div>
              <div style={{ background: 'rgba(245,158,11,0.1)', borderRadius: 8, padding: '6px 12px' }}>
                <div style={{ fontSize: 10, color: '#64748b' }}>Sizing</div>
                <div style={{ fontSize: 14, fontWeight: 800, color: '#f59e0b' }}>{spot.sizing}</div>
              </div>
            </div>
            <div style={{ fontSize: 15, fontWeight: 800, color: spot.verdict === 'SEMI-BLUFF' ? '#22c55e' : '#ef4444', marginBottom: 6 }}>
              {spot.verdict}
            </div>
            <p style={{ fontSize: 13, color: '#cbd5e1', textAlign: 'left' }}>{spot.reason}</p>
            <button onClick={nextSpot}
              style={{ marginTop: 8, padding: '8px 20px', borderRadius: 8, border: 'none', fontWeight: 700, cursor: 'pointer',
                background: 'linear-gradient(135deg, #ec4899, #ef4444)', color: '#fff', fontSize: 13 }}>
              Next Spot →
            </button>
          </motion.div>
        )}
      </div>
    </div>
  );
}
