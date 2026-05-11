/**
 * BLIND DEFENSE TRAINER — BB vs Open Drills
 * ═══════════════════════════════════════════════════════════════════════════
 * Specialized drills randomizing open sizing and position against the BB.
 * Evaluates Call vs 3Bet vs Fold decisions.
 *
 * Route: /hub/training/blind-defense
 * ═══════════════════════════════════════════════════════════════════════════
 */

import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import Head from 'next/head';
import { useRouter } from 'next/router';
import useTrainingBus from '../../../src/hooks/useTrainingBus';
import { eventBus, EventType } from '../../../src/engine/EventBus';
import { getAccessToken, authedFetch } from '../../../src/lib/authUtils';
import PlayingCard from '../../../src/components/poker/PlayingCard';
// TRAIN-WIRE-PLAYCARD-3 — adoption: blind-defense via shared PlayingCard

const SUITS = ['♠', '♥', '♦', '♣'];
const RANKS = ['A', 'K', 'Q', 'J', 'T', '9', '8', '7', '6', '5', '4', '3', '2'];
const POSITIONS = ['UTG', 'HJ', 'CO', 'BTN', 'SB'];
const SIZES = ['2x', '2.5x', '3x', 'All-In'];

function getRandomInt(max) {
  return Math.floor(Math.random() * max);
}

function generateScenario() {
  const rank1 = RANKS[getRandomInt(RANKS.length)];
  const rank2 = RANKS[getRandomInt(RANKS.length)];
  const suit1 = SUITS[getRandomInt(SUITS.length)];
  const suit2 = SUITS[getRandomInt(SUITS.length)];
  const hand = [
    { r: rank1, s: suit1, c: suit1 === '♥' || suit1 === '♦' ? '#ef4444' : '#e2e8f0' },
    { r: rank2, s: suit2, c: suit2 === '♥' || suit2 === '♦' ? '#ef4444' : '#e2e8f0' },
  ];

  // Sort so higher rank is first visually
  hand.sort((a, b) => RANKS.indexOf(a.r) - RANKS.indexOf(b.r));

  const vPos = POSITIONS[getRandomInt(POSITIONS.length)];
  const size = SIZES[getRandomInt(SIZES.length)];

  // Simple deterministic answer logic for the drill
  let correct = 'Fold';
  const isPair = hand[0].r === hand[1].r;
  const isSuited = hand[0].s === hand[1].s;
  const highCard = RANKS.indexOf(hand[0].r) < 5; // A K Q J T

  if (isPair || (highCard && isSuited) || hand[0].r === 'A') {
    correct = '3-Bet';
  } else if (isSuited || highCard) {
    correct = size === 'All-In' ? 'Fold' : 'Call';
  } else {
    correct = 'Fold';
  }

  // Edge case constraints (very loose BTN implies wider BB defense)
  if (vPos === 'BTN' && size === '2x' && correct === 'Fold' && Math.random() > 0.5)
    correct = 'Call';

  return { hand, vPos, size, correct };
}

export default function BlindDefensePage() {
  const router = useRouter();
  useTrainingBus('blind-defense');

  const [scenario, setScenario] = useState(null);
  const [feedback, setFeedback] = useState(null);
  const [score, setScore] = useState({ correct: 0, total: 0 });

  useEffect(() => {
    setScenario(generateScenario());
  }, []);

  useEffect(() => {
    const h = () => {};
    const unsub = eventBus.on(EventType?.SESSION_END || 'training:session-complete', h);
    return () => unsub();
  }, []);

  const handleAction = (action) => {
    if (feedback) return; // Prevent double click

    const isCorrect = action === scenario.correct;
    setFeedback({
      isCorrect,
      chosen: action,
      correctAction: scenario.correct,
      msg: isCorrect
        ? 'Correct Defense Strategy!'
        : `Incorrect. The GTO action here is to ${scenario.correct}.`,
    });

    setScore((prev) => ({ correct: prev.correct + (isCorrect ? 1 : 0), total: prev.total + 1 }));

    setTimeout(() => {
      setFeedback(null);
      setScenario(generateScenario());

      // Periodically emit session updates for overarching stats tracking
      if ((score.total + 1) % 5 === 0) {
        const token = typeof getAccessToken === 'function' ? getAccessToken() : null;
        if (!token) return;
        authedFetch('/api/training/save-session', {
          method: 'POST',
          body: JSON.stringify({
            gameId: 'blind-defense',
            stats: {
              correct_count: score.correct + (isCorrect ? 1 : 0),
              total_questions: score.total + 1,
            },
          }),
        }).catch(e => console.warn('[App] Handled promise rejection:', e?.message || e));
      }
    }, 1500);
  };

  if (!scenario) return null;

  return (
    <>
      <Head>
        <title>Blind Defense | Smarter.Poker Training</title>
      </Head>
      <div
        style={{
          minHeight: '100vh', paddingBottom: 70, width: '100%', maxWidth: '100vw', overflowX: 'hidden', boxSizing: 'border-box',
          background: 'linear-gradient(180deg, #0a0a1a 0%, #0f172a 100%)',
          color: '#e2e8f0',
          fontFamily: "'Inter', sans-serif",
        }}
      >
        <div
          style={{
            padding: '16px 20px',
            borderBottom: '1px solid rgba(255,255,255,0.06)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <button
              onClick={() => router.push('/hub/training')}
              style={{
                background: 'rgba(255,255,255,0.05)',
                border: 'none',
                color: '#94a3b8',
                fontSize: 18,
                cursor: 'pointer',
                width: 36,
                height: 36,
                borderRadius: 8,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              ←
            </button>
            <div>
              <div style={{ fontSize: 16, fontWeight: 700 }}>Blind Defense</div>
              <div style={{ fontSize: 11, color: '#64748b' }}>BB vs Open Specific Drills</div>
            </div>
          </div>
          <div
            style={{
              background: 'rgba(0,0,0,0.3)',
              padding: '6px 12px',
              borderRadius: 8,
              border: '1px solid rgba(255,255,255,0.1)',
            }}
          >
            <div
              style={{
                fontSize: 10,
                color: '#94a3b8',
                textTransform: 'uppercase',
                letterSpacing: 1,
                marginBottom: 2,
              }}
            >
              Streak Score
            </div>
            <div style={{ fontSize: 16, fontWeight: 900, color: '#00d4ff' }}>
              {score.correct}{' '}
              <span style={{ fontSize: 12, color: '#64748b' }}>/ {score.total}</span>
            </div>
          </div>
        </div>

        <div style={{ padding: '40px 20px', maxWidth: 500, margin: '0 auto', textAlign: 'center' }}>
          {/* Scenario Context Box */}
          <div
            style={{
              background: 'rgba(30, 41, 59, 0.5)',
              border: '1px solid rgba(148, 163, 184, 0.2)',
              borderRadius: 16,
              padding: '24px',
              marginBottom: 32,
            }}
          >
            <div
              style={{
                fontSize: 12,
                color: '#94a3b8',
                fontWeight: 700,
                textTransform: 'uppercase',
                letterSpacing: 1,
                marginBottom: 8,
              }}
            >
              Action to you
            </div>
            <div style={{ fontSize: 24, fontWeight: 800, color: '#fff', marginBottom: 4 }}>
              {scenario.vPos} Opens <span style={{ color: '#fbbf24' }}>{scenario.size}</span>
            </div>
            <div style={{ fontSize: 14, color: '#cbd5e1' }}>You are in the Big-Blind</div>
          </div>

          {/* Hero Cards */}
          <div
            style={{
              display: 'flex',
              justifyContent: 'center',
              gap: 12,
              marginBottom: 40,
              position: 'relative',
            }}
          >
            <AnimatePresence>
              {feedback && (
                <motion.div
                  initial={{ opacity: 0, scale: 0.8, y: -20 }}
                  animate={{ opacity: 1, scale: 1, y: 0 }}
                  exit={{ opacity: 0 }}
                  style={{
                    position: 'absolute',
                    top: -50,
                    background: feedback.isCorrect ? '#4ade80' : '#ef4444',
                    color: '#fff',
                    padding: '8px 16px',
                    borderRadius: 20,
                    fontSize: 14,
                    fontWeight: 800,
                    boxShadow: '0 4px 12px rgba(0,0,0,0.5)',
                    zIndex: 10,
                  }}
                >
                  {feedback.msg}
                </motion.div>
              )}
            </AnimatePresence>

            <PlayingCard
              key={'c1-'+scenario.hand[0].r+scenario.hand[0].s}
              rank={scenario.hand[0].r}
              suit={scenario.hand[0].s}
              size="xl"
              priority
              style={{ transform: 'rotate(-5deg)' }}
            />

            <PlayingCard
              key={'c2-'+scenario.hand[1].r+scenario.hand[1].s}
              rank={scenario.hand[1].r}
              suit={scenario.hand[1].s}
              size="xl"
              priority
              style={{ transform: 'rotate(5deg)' }}
            />
          </div>

          {/* Action Buttons */}
          <div style={{ display: 'flex', gap: 12 }}>
            <motion.button
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              onClick={() => handleAction('Fold')}
              disabled={!!feedback}
              style={{
                flex: 1,
                padding: '20px',
                borderRadius: 12,
                border: 'none',
                background: 'rgba(239, 68, 68, 0.15)',
                color: '#fca5a5',
                border: '1px solid rgba(239, 68, 68, 0.3)',
                fontSize: 16,
                fontWeight: 800,
                cursor: feedback ? 'not-allowed' : 'pointer',
                transition: 'all 0.2s',
              }}
            >
              FOLD
            </motion.button>
            <motion.button
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              onClick={() => handleAction('Call')}
              disabled={!!feedback}
              style={{
                flex: 1,
                padding: '20px',
                borderRadius: 12,
                border: 'none',
                background: 'rgba(52, 211, 153, 0.15)',
                color: '#6ee7b7',
                border: '1px solid rgba(52, 211, 153, 0.3)',
                fontSize: 16,
                fontWeight: 800,
                cursor: feedback ? 'not-allowed' : 'pointer',
                transition: 'all 0.2s',
              }}
            >
              CALL
            </motion.button>
            <motion.button
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              onClick={() => handleAction('3-Bet')}
              disabled={!!feedback}
              style={{
                flex: 1,
                padding: '20px',
                borderRadius: 12,
                border: 'none',
                background: 'rgba(251, 191, 36, 0.15)',
                color: '#fcd34d',
                border: '1px solid rgba(251, 191, 36, 0.3)',
                fontSize: 16,
                fontWeight: 800,
                cursor: feedback ? 'not-allowed' : 'pointer',
                transition: 'all 0.2s',
              }}
            >
              3-BET
            </motion.button>
          </div>
        </div>
      </div>
    </>
  );
}
