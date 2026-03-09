/**
 * 🔀 MULTIWAY PREFLOP — 3+ Player Preflop Range Viewer
 * ═══════════════════════════════════════════════════════════════════════════
 * View preflop ranges for common multiway scenarios (3-way, 4-way).
 * BTN open / SB 3-bet / BB cold-call decision trees.
 * ═══════════════════════════════════════════════════════════════════════════
 */

import React, { useState, useEffect, useMemo } from 'react';
import { motion } from 'framer-motion';
import Head from 'next/head';
import { useRouter } from 'next/router';
import useTrainingBus from '../../../src/hooks/useTrainingBus';
import { getAccessToken } from '../../../src/lib/authUtils';
import { eventBus, EventType } from '../../../src/engine/EventBus';

// ═══════════════════════════════════════════════════════════════════════════
// MULTIWAY RANGES DATA — Pre-computed for common spots
// ═══════════════════════════════════════════════════════════════════════════

const RANKS = ['A', 'K', 'Q', 'J', 'T', '9', '8', '7', '6', '5', '4', '3', '2'];

const MULTIWAY_SCENARIOS = {
  btn_open_sb_3bet_bb_cold: {
    name: 'BTN Open → SB 3-Bet → BB Cold-Call',
    positions: ['BTN', 'SB', 'BB'],
    desc: 'Common 3-way pot scenario. BTN opens, SB 3-bets, BB decides to cold-call or fold.',
    tip: 'BB should cold-call with pocket pairs and suited broadway that play well multiway.',
    ranges: {
      BTN: {
        open: 'AA-22, AKs-A2s, KQs-K9s, QJs-Q9s, JTs-J9s, T9s-T8s, 98s-97s, 87s-86s, 76s-75s, 65s-64s, 54s, AKo-ATo, KQo-KJo, QJo',
      },
      SB: { threeBet: 'AA-TT, AKs-AJs, KQs, AKo-AQo' },
      BB: { coldCall: 'JJ-88, AQs-ATs, KQs-KJs, QJs, JTs, T9s, 98s, AQo-AJo, KQo' },
    },
  },
  utg_open_mp_3bet_co_cold: {
    name: 'UTG Open → MP 3-Bet → CO Decision',
    positions: ['UTG', 'MP', 'CO'],
    desc: 'Tight 3-way spot. UTG opens from early position, MP 3-bets, CO must decide with a tight range.',
    tip: 'CO should mostly fold here — only continue with hands that dominate MP\u2019s 3-bet range.',
    ranges: {
      UTG: { open: 'AA-66, AKs-ATs, KQs-KJs, QJs, JTs, AKo-AJo, KQo' },
      MP: { threeBet: 'AA-QQ, AKs, AKo' },
      CO: { coldCall: 'JJ-99, AQs-AJs, KQs' },
    },
  },
  co_open_btn_flat_bb_squeeze: {
    name: 'CO Open → BTN Flat → BB Squeeze',
    positions: ['CO', 'BTN', 'BB'],
    desc: 'BTN flats CO open, BB has a squeeze opportunity with a polarized range.',
    tip: 'BB squeeze range should be polarized — premiums + suited bluffs (A5s/A4s type hands).',
    ranges: {
      CO: {
        open: 'AA-22, AKs-A2s, KQs-K8s, QJs-Q9s, JTs-J9s, T9s, 98s, 87s, 76s, 65s, 54s, AKo-ATo, KQo-KJo, QJo',
      },
      BTN: { flat: 'JJ-66, AQs-ATs, KQs-KTs, QJs-QTs, JTs, T9s, 98s, 87s, 76s, AQo-AJo, KQo' },
      BB: { squeeze: 'AA-TT, AKs-AJs, AKo-AQo, A5s-A4s, K9s, Q9s, J8s' },
    },
  },
  limp_iso_bb: {
    name: 'SB Limp → BB Iso-Raise → 3-Way',
    positions: ['SB', 'BB', 'Caller'],
    desc: 'SB limps, BB iso-raises, one caller. Common 3-way limped pot scenario.',
    tip: 'BB should iso-raise wide for value — SB limp/call range is typically weak.',
    ranges: {
      SB: {
        limp: 'AA-22, AKs-A2s, KQs-K6s, QJs-Q8s, JTs-J8s, T9s-T8s, 98s-97s, 87s-86s, 76s, 65s, 54s, AKo-A8o, KQo-KTo, QJo-QTo, JTo',
      },
      BB: { isoRaise: 'AA-77, AKs-A9s, KQs-KTs, QJs, JTs, AKo-AJo, KQo' },
      Caller: { call: 'JJ-55, AQs-ATs, KQs-KJs, QJs, JTs, T9s, AQo-AJo' },
    },
  },
  ep_open_btn_sb_bb_4way: {
    name: 'EP Open → BTN/SB/BB All Call → 4-Way',
    positions: ['UTG', 'BTN', 'SB', 'BB'],
    desc: 'EP opens, BTN and both blinds all flat. 4-way pot with wide ranges.',
    tip: 'In 4-way pots, play tighter postflop — your equity realization drops significantly.',
    ranges: {
      UTG: { open: 'AA-66, AKs-ATs, KQs-KJs, QJs, JTs, AKo-AJo, KQo' },
      BTN: { flat: 'TT-55, AQs-ATs, KQs-KTs, QJs-QTs, JTs, T9s, 98s, 87s, AQo-AJo, KQo' },
      SB: { coldCall: '99-66, AJs-ATs, KQs-KJs, QJs, JTs, T9s, AJo' },
      BB: {
        call: 'TT-33, AQs-A7s, KQs-K9s, QJs-Q9s, JTs-J9s, T9s-T8s, 98s, 87s, AQo-A9o, KQo-KTo, QJo',
      },
    },
  },
  btn_3bet_sb_4bet_bb_cold_5bet: {
    name: 'BTN 3-Bet → SB 4-Bet → BB 5-Bet',
    positions: ['BTN', 'SB', 'BB'],
    desc: 'High-stakes 3-way battle with escalating aggression. Extremely tight ranges.',
    tip: '5-bet ranges are near-linear with premiums. Very few bluffs at these stack depths.',
    ranges: {
      BTN: { threeBet: 'AA-TT, AKs-AJs, KQs, AKo-AQo, A5s-A4s' },
      SB: { fourBet: 'AA-QQ, AKs, AKo' },
      BB: { fiveBet: 'AA-KK, AKs' },
    },
  },
  co_mp_utg_limp_chain: {
    name: 'UTG Limp → MP Limp → CO Iso-Raise',
    positions: ['UTG', 'MP', 'CO'],
    desc: 'Double limp from early positions. CO has a prime iso-raise opportunity.',
    tip: 'CO should iso-raise aggressively — limpers have weak/passive ranges.',
    ranges: {
      UTG: {
        limp: 'AA-22, AKs-A7s, KQs-K9s, QJs-Q9s, JTs-J9s, T9s, 98s, 87s, 76s, AKo-ATo, KQo-KJo, QJo',
      },
      MP: { limp: 'TT-22, AQs-A7s, KQs-K9s, QJs-Q9s, JTs-J9s, T9s, 98s, 87s, AJo-A9o, KQo-KJo' },
      CO: { isoRaise: 'AA-77, AKs-A9s, KQs-KTs, QJs, JTs, AKo-AJo, KQo' },
    },
  },
  sb_open_bb_3bet_btn_overcall: {
    name: 'SB Open → BB 3-Bet → BTN Over-Call',
    positions: ['SB', 'BB', 'BTN'],
    desc: 'SB opens, BB 3-bets, BTN makes an unusual over-call creating a 3-way pot.',
    tip: 'BTN over-call range should be hands that play well multiway — suited broadways and pairs.',
    ranges: {
      SB: {
        open: 'AA-22, AKs-A2s, KQs-K5s, QJs-Q8s, JTs-J8s, T9s-T8s, 98s-97s, 87s, 76s, 65s, AKo-A7o, KQo-K9o, QJo-QTo, JTo',
      },
      BB: { threeBet: 'AA-TT, AKs-AJs, KQs, AKo-AQo, A5s-A3s' },
      BTN: { overCall: 'JJ-66, AQs-ATs, KQs-KJs, QJs, JTs, T9s, 98s, AQo-AJo' },
    },
  },
};

// Proper range parser — matches hands against range strings accurately
function parseRangeToSet(rangeStr) {
  if (!rangeStr) return new Set();
  const inRange = new Set();
  const cleaned = rangeStr.replace(/(Call|3-Bet|Raise|Open|Fold):\s*/gi, ', ');
  const parts = cleaned
    .split(/,\s*/)
    .map((s) => s.trim())
    .filter(Boolean);
  for (const part of parts) {
    if (part.includes('-')) {
      const [start, end] = part.split('-').map((s) => s.trim());
      if (!start || !end) {
        inRange.add(start || end);
        continue;
      }
      if (start.length === 2 && start[0] === start[1]) {
        const si = RANKS.indexOf(start[0]);
        const ei = RANKS.indexOf(end[0]);
        if (si >= 0 && ei >= 0) {
          for (let i = Math.min(si, ei); i <= Math.max(si, ei); i++)
            inRange.add(RANKS[i] + RANKS[i]);
        }
      } else {
        const suffix = start.endsWith('s') ? 's' : start.endsWith('o') ? 'o' : '';
        const high = start[0],
          startLow = start[1];
        const cleanEnd = end.replace(/[so]/g, '');
        const endLow = cleanEnd.length >= 2 ? cleanEnd[1] : cleanEnd[0];
        if (!endLow) {
          inRange.add(start);
          inRange.add(end);
          continue;
        }
        const si = RANKS.indexOf(startLow),
          ei = RANKS.indexOf(endLow);
        if (si >= 0 && ei >= 0) {
          for (let i = Math.min(si, ei); i <= Math.max(si, ei); i++)
            inRange.add(high + RANKS[i] + suffix);
        }
      }
    } else {
      inRange.add(part);
    }
  }
  return inRange;
}

function isInRange(hand, rangeStr) {
  const rangeSet = parseRangeToSet(rangeStr);
  // Check exact match, suited/offsuit stripped match, and base pair match
  return (
    rangeSet.has(hand) ||
    rangeSet.has(hand.replace(/[so]/, '')) ||
    rangeSet.has(hand.substring(0, 2))
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// RANGE GRID COMPONENT
// ═══════════════════════════════════════════════════════════════════════════

function RangeGrid({ rangeStr, color, label }) {
  const grid = useMemo(() => {
    const cells = [];
    for (let r = 0; r < 13; r++) {
      for (let c = 0; c < 13; c++) {
        const isSuited = c > r;
        const isPair = r === c;
        const hand = isPair
          ? `${RANKS[r]}${RANKS[c]}`
          : isSuited
            ? `${RANKS[r]}${RANKS[c]}s`
            : `${RANKS[c]}${RANKS[r]}o`;
        const inRange = isInRange(hand, rangeStr);
        cells.push({ hand, inRange, r, c, isSuited, isPair });
      }
    }
    return cells;
  }, [rangeStr]);

  const handsInRange = grid.filter((c) => c.inRange).length;
  const pct = ((handsInRange / 169) * 100).toFixed(1);

  return (
    <div
      style={{
        padding: 12,
        borderRadius: 10,
        background: 'rgba(0,0,0,0.2)',
        border: '1px solid rgba(255,255,255,0.06)',
      }}
    >
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: 8,
        }}
      >
        <span style={{ fontSize: 11, fontWeight: 700, color }}>{label}</span>
        <span style={{ fontSize: 10, color: '#64748b' }}>{pct}% of hands</span>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(13, 1fr)', gap: 1 }}>
        {grid.map((cell, i) => (
          <div
            key={i}
            title={cell.hand}
            style={{
              width: '100%',
              aspectRatio: '1',
              borderRadius: 2,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: 6,
              fontWeight: 600,
              background: cell.inRange ? `${color}50` : 'rgba(255,255,255,0.02)',
              color: cell.inRange ? '#fff' : '#333',
              border: `1px solid ${cell.inRange ? `${color}40` : 'transparent'}`,
              cursor: 'pointer',
            }}
          >
            {cell.hand.length <= 3 ? cell.hand : ''}
          </div>
        ))}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// MAIN PAGE
// ═══════════════════════════════════════════════════════════════════════════

export default function MultiwayPreflopPage() {
  const router = useRouter();
  useTrainingBus('multiway-preflop');

  // Listen for session events from other training pages
  useEffect(() => {
    const unsub = eventBus.on(EventType?.SESSION_END || 'session:end', (event) => {
      const source = event?.source;
      if (source === 'MultiwayQuiz') return; // Ignore our own emits
    });
    return unsub;
  }, []);

  const [selectedScenario, setSelectedScenario] = useState('btn_open_sb_3bet_bb_cold');
  const [quizHand, setQuizHand] = useState(null);
  const [quizAnswer, setQuizAnswer] = useState(null);
  const [quizScore, setQuizScore] = useState({ total: 0, correct: 0 });
  const quizSavedRef = React.useRef(false);

  // Auto-save quiz session to Supabase when reaching 10+ questions
  useEffect(() => {
    if (quizScore.total > 0 && quizScore.total % 10 === 0 && !quizSavedRef.current) {
      quizSavedRef.current = true;
      const saveQuiz = async () => {
        try {
          const token = typeof getAccessToken === 'function' ? getAccessToken() : null;
          if (!token) return;
          const accuracy = Math.round((quizScore.correct / quizScore.total) * 100);
          await fetch('/api/training/save-session', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
            body: JSON.stringify({
              gameId: 'multiway-quiz',
              gameName: `Multiway Quiz (${quizScore.total} hands)`,
              gtowScore: accuracy,
              totalEVLoss: 0,
              handsPlayed: quizScore.total,
              mistakeCount: quizScore.total - quizScore.correct,
              accuracy,
              correctCount: quizScore.correct,
              bestStreak: 0,
              levelPassed: accuracy >= 60,
              level: 1,
              handHistory: [],
            }),
          });
          console.log('[MultiwayQuiz] Session saved ✅');
          eventBus?.emit?.(
            EventType?.SESSION_END || 'session:end',
            {
              gameId: 'multiway-quiz',
              handsPlayed: quizScore.total,
              accuracy,
            },
            'MultiwayQuiz'
          );
        } catch (err) {
          console.warn('[MultiwayQuiz] Save error:', err.message);
        }
      };
      saveQuiz();
      // Allow re-save on next milestone
      setTimeout(() => {
        quizSavedRef.current = false;
      }, 1000);
    }
  }, [quizScore.total]);

  const scenario = MULTIWAY_SCENARIOS[selectedScenario];
  const posColors = {
    UTG: '#ef4444',
    MP: '#f97316',
    CO: '#fbbf24',
    BTN: '#22c55e',
    SB: '#3b82f6',
    BB: '#a855f7',
    Caller: '#94a3b8',
  };

  // Generate a random quiz hand
  function generateQuizHand() {
    const scenarioKeys = Object.keys(MULTIWAY_SCENARIOS);
    const randomKey = scenarioKeys[Math.floor(Math.random() * scenarioKeys.length)];
    const sc = MULTIWAY_SCENARIOS[randomKey];
    const pos = sc.positions[Math.floor(Math.random() * sc.positions.length)];
    const rangeData = sc.ranges[pos];
    const action = Object.keys(rangeData)[0];
    const rangeStr = Object.values(rangeData)[0];

    // Generate random hand — MUST be canonical (higher rank first)
    const i1 = Math.floor(Math.random() * 13);
    const i2 = Math.floor(Math.random() * 13);
    const highIdx = Math.min(i1, i2); // Lower index = higher rank in RANKS array
    const lowIdx = Math.max(i1, i2);
    const r1 = RANKS[highIdx];
    const r2 = RANKS[lowIdx];
    const isPair = highIdx === lowIdx;
    const suited = !isPair && Math.random() > 0.5;
    const hand = isPair ? `${r1}${r2}` : suited ? `${r1}${r2}s` : `${r1}${r2}o`;
    const rangeSet = parseRangeToSet(rangeStr);
    const correct =
      rangeSet.has(hand) ||
      rangeSet.has(hand.replace(/[so]/, '')) ||
      rangeSet.has(hand.substring(0, 2));

    setQuizHand({
      hand,
      position: pos,
      scenario: sc.name,
      scenarioKey: randomKey,
      action,
      correct,
    });
    setQuizAnswer(null);
  }

  return (
    <>
      <Head>
        <title>Multiway Preflop Ranges | Smarter.Poker Training</title>
        <meta
          name="description"
          content="Explore 3+ player preflop range interactions. See how ranges change in multiway pots."
        />
        <link
          href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&family=Orbitron:wght@500;700;900&display=swap"
          rel="stylesheet"
        />
      </Head>

      <div
        style={{
          minHeight: '100vh',
          background: 'linear-gradient(180deg, #0a0a12 0%, #0f0f1e 50%, #1a1a2e 100%)',
          color: '#e2e8f0',
          fontFamily: "'Inter', -apple-system, sans-serif",
        }}
      >
        {/* Header */}
        <div
          style={{
            padding: '16px 20px',
            borderBottom: '1px solid rgba(255,255,255,0.06)',
            display: 'flex',
            alignItems: 'center',
            gap: 12,
          }}
        >
          <button
            onClick={() => router.push('/hub/training')}
            style={{
              background: 'rgba(255,255,255,0.06)',
              border: '1px solid rgba(255,255,255,0.1)',
              borderRadius: 8,
              padding: '6px 12px',
              color: '#94a3b8',
              cursor: 'pointer',
              fontSize: 12,
              fontWeight: 600,
            }}
          >
            ← Training
          </button>
          <h1
            style={{
              fontSize: 20,
              fontWeight: 800,
              margin: 0,
              background: 'linear-gradient(135deg, #a855f7, #3b82f6)',
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
              fontFamily: "'Orbitron', monospace",
            }}
          >
            Multiway Preflop
          </h1>
        </div>

        <div style={{ padding: '20px 16px', maxWidth: 800, margin: '0 auto' }}>
          {/* Scenario Selector */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(2, 1fr)',
              gap: 8,
              marginBottom: 20,
            }}
          >
            {Object.entries(MULTIWAY_SCENARIOS).map(([key, s]) => (
              <motion.button
                key={key}
                onClick={() => setSelectedScenario(key)}
                whileHover={{ scale: 1.02 }}
                style={{
                  padding: '12px 14px',
                  borderRadius: 10,
                  border: 'none',
                  cursor: 'pointer',
                  textAlign: 'left',
                  background:
                    selectedScenario === key ? 'rgba(168,85,247,0.1)' : 'rgba(255,255,255,0.03)',
                  border: `1px solid ${selectedScenario === key ? 'rgba(168,85,247,0.3)' : 'rgba(255,255,255,0.06)'}`,
                }}
              >
                <div
                  style={{
                    fontSize: 11,
                    fontWeight: 700,
                    color: selectedScenario === key ? '#a855f7' : '#e2e8f0',
                    marginBottom: 4,
                  }}
                >
                  {s.name}
                </div>
                <div style={{ fontSize: 9, color: '#64748b' }}>{s.positions.join(' → ')}</div>
              </motion.button>
            ))}
          </div>

          {/* Scenario Description */}
          <div
            style={{
              padding: '12px 16px',
              borderRadius: 10,
              marginBottom: 20,
              background: 'rgba(168,85,247,0.05)',
              border: '1px solid rgba(168,85,247,0.15)',
            }}
          >
            <div style={{ fontSize: 13, fontWeight: 700, color: '#a855f7', marginBottom: 4 }}>
              {scenario.name}
            </div>
            <div style={{ fontSize: 11, color: '#94a3b8' }}>{scenario.desc}</div>
          </div>

          {/* Range Grids for Each Position */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns:
                scenario.positions.length <= 3 ? 'repeat(3, 1fr)' : 'repeat(2, 1fr)',
              gap: 12,
            }}
          >
            {scenario.positions.map((pos) => {
              const rangeData = scenario.ranges[pos] || {};
              const action = Object.keys(rangeData)[0] || 'range';
              const rangeStr = Object.values(rangeData)[0] || '';
              return (
                <RangeGrid
                  key={pos}
                  rangeStr={rangeStr}
                  color={posColors[pos] || '#94a3b8'}
                  label={`${pos} — ${action.replace(/([A-Z])/g, ' $1').trim()}`}
                />
              );
            })}
          </div>

          {/* Interaction Legend */}
          <div
            style={{
              marginTop: 20,
              padding: 12,
              borderRadius: 10,
              background: 'rgba(0,0,0,0.2)',
              border: '1px solid rgba(255,255,255,0.06)',
            }}
          >
            <div style={{ fontSize: 11, fontWeight: 700, color: '#e2e8f0', marginBottom: 8 }}>
              Action Flow
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
              {scenario.positions.map((pos, i) => {
                const rangeData = scenario.ranges[pos] || {};
                const action = Object.keys(rangeData)[0] || '';
                return (
                  <React.Fragment key={pos}>
                    <div
                      style={{
                        padding: '4px 10px',
                        borderRadius: 6,
                        fontSize: 10,
                        fontWeight: 700,
                        background: `${posColors[pos] || '#94a3b8'}20`,
                        color: posColors[pos] || '#94a3b8',
                        border: `1px solid ${posColors[pos] || '#94a3b8'}40`,
                      }}
                    >
                      {pos}: {action.replace(/([A-Z])/g, ' $1').trim()}
                    </div>
                    {i < scenario.positions.length - 1 && (
                      <span style={{ color: '#475569', fontSize: 12 }}>→</span>
                    )}
                  </React.Fragment>
                );
              })}
            </div>
          </div>

          {/* Coaching Tip */}
          {scenario.tip && (
            <div
              style={{
                marginTop: 12,
                padding: '10px 14px',
                borderRadius: 8,
                background: 'rgba(0,212,255,0.05)',
                border: '1px solid rgba(0,212,255,0.15)',
                fontSize: 11,
                color: '#94a3b8',
              }}
            >
              <span style={{ fontWeight: 700, color: '#00d4ff', marginRight: 6 }}>TIP:</span>
              {scenario.tip}
            </div>
          )}

          {/* Quiz Mode */}
          <div
            style={{
              marginTop: 20,
              padding: 16,
              borderRadius: 12,
              background: 'rgba(0,0,0,0.2)',
              border: '1px solid rgba(255,255,255,0.06)',
            }}
          >
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                marginBottom: 12,
              }}
            >
              <div style={{ fontSize: 12, fontWeight: 700, color: '#e2e8f0' }}>Quiz Mode</div>
              {quizScore.total > 0 && (
                <span style={{ fontSize: 10, color: '#94a3b8' }}>
                  Score: {quizScore.correct}/{quizScore.total} (
                  {Math.round((quizScore.correct / quizScore.total) * 100)}%)
                </span>
              )}
            </div>
            {!quizHand ? (
              <motion.button
                onClick={generateQuizHand}
                whileHover={{ scale: 1.03 }}
                whileTap={{ scale: 0.97 }}
                style={{
                  width: '100%',
                  padding: '12px',
                  borderRadius: 10,
                  border: 'none',
                  cursor: 'pointer',
                  fontSize: 13,
                  fontWeight: 700,
                  fontFamily: "'Orbitron', monospace",
                  background: 'linear-gradient(135deg, #a855f7, #3b82f6)',
                  color: '#fff',
                }}
              >
                START QUIZ
              </motion.button>
            ) : (
              <div>
                <div style={{ textAlign: 'center', marginBottom: 12 }}>
                  <div style={{ fontSize: 10, color: '#64748b', marginBottom: 4 }}>
                    {quizHand.scenario}
                  </div>
                  <div style={{ fontSize: 11, fontWeight: 600, color: '#94a3b8', marginBottom: 8 }}>
                    You are in{' '}
                    <span
                      style={{ color: posColors[quizHand.position] || '#fff', fontWeight: 800 }}
                    >
                      {quizHand.position}
                    </span>
                  </div>
                  <div
                    style={{
                      display: 'inline-block',
                      padding: '14px 28px',
                      borderRadius: 12,
                      background: 'rgba(255,255,255,0.06)',
                      border: '1px solid rgba(255,255,255,0.1)',
                      fontSize: 28,
                      fontWeight: 900,
                      color: '#e2e8f0',
                      fontFamily: "'Orbitron', monospace",
                      letterSpacing: 3,
                    }}
                  >
                    {quizHand.hand}
                  </div>
                  <div style={{ fontSize: 11, color: '#64748b', marginTop: 8 }}>
                    Should you{' '}
                    <span style={{ fontWeight: 700, color: '#a855f7' }}>
                      {quizHand.action.replace(/([A-Z])/g, ' $1').trim()}
                    </span>{' '}
                    this hand?
                  </div>
                </div>

                {quizAnswer === null ? (
                  <div style={{ display: 'flex', gap: 8 }}>
                    <motion.button
                      whileHover={{ scale: 1.03 }}
                      whileTap={{ scale: 0.97 }}
                      onClick={() => {
                        setQuizAnswer(true);
                        setQuizScore((p) => ({
                          total: p.total + 1,
                          correct: p.correct + (quizHand.correct ? 1 : 0),
                        }));
                      }}
                      style={{
                        flex: 1,
                        padding: '12px',
                        borderRadius: 10,
                        border: 'none',
                        cursor: 'pointer',
                        fontSize: 14,
                        fontWeight: 800,
                        background: 'rgba(34,197,94,0.15)',
                        color: '#22c55e',
                        border: '1px solid rgba(34,197,94,0.3)',
                      }}
                    >
                      YES
                    </motion.button>
                    <motion.button
                      whileHover={{ scale: 1.03 }}
                      whileTap={{ scale: 0.97 }}
                      onClick={() => {
                        setQuizAnswer(false);
                        setQuizScore((p) => ({
                          total: p.total + 1,
                          correct: p.correct + (!quizHand.correct ? 1 : 0),
                        }));
                      }}
                      style={{
                        flex: 1,
                        padding: '12px',
                        borderRadius: 10,
                        border: 'none',
                        cursor: 'pointer',
                        fontSize: 14,
                        fontWeight: 800,
                        background: 'rgba(239,68,68,0.15)',
                        color: '#ef4444',
                        border: '1px solid rgba(239,68,68,0.3)',
                      }}
                    >
                      NO
                    </motion.button>
                  </div>
                ) : (
                  <div style={{ textAlign: 'center' }}>
                    <div
                      style={{
                        padding: '8px 16px',
                        borderRadius: 8,
                        marginBottom: 10,
                        display: 'inline-block',
                        background:
                          quizAnswer === quizHand.correct
                            ? 'rgba(34,197,94,0.15)'
                            : 'rgba(239,68,68,0.15)',
                        border: `1px solid ${quizAnswer === quizHand.correct ? 'rgba(34,197,94,0.3)' : 'rgba(239,68,68,0.3)'}`,
                        fontSize: 14,
                        fontWeight: 800,
                        color: quizAnswer === quizHand.correct ? '#22c55e' : '#ef4444',
                      }}
                    >
                      {quizAnswer === quizHand.correct ? 'CORRECT!' : 'WRONG!'}
                    </div>
                    <div style={{ fontSize: 11, color: '#94a3b8', marginBottom: 12 }}>
                      {quizHand.hand} is {quizHand.correct ? 'IN' : 'NOT IN'} the{' '}
                      {quizHand.position} {quizHand.action.replace(/([A-Z])/g, ' $1').trim()} range
                    </div>
                    <motion.button
                      whileHover={{ scale: 1.03 }}
                      whileTap={{ scale: 0.97 }}
                      onClick={generateQuizHand}
                      style={{
                        padding: '10px 24px',
                        borderRadius: 10,
                        border: 'none',
                        cursor: 'pointer',
                        fontSize: 13,
                        fontWeight: 700,
                        background: 'rgba(168,85,247,0.15)',
                        color: '#a855f7',
                        border: '1px solid rgba(168,85,247,0.3)',
                      }}
                    >
                      NEXT HAND
                    </motion.button>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
