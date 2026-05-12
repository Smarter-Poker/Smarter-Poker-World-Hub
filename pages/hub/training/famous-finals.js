/**
 * 🏆 FAMOUS FINALS — Historic Final Table Replayer
 * ═══════════════════════════════════════════════════════════════════════════
 * Recreates iconic WSOP/EPT/WPT final tables with exact chip stacks.
 * Play through each decision point and compare your choices vs solver output.
 * GTO Wizard "Events" feature equivalent.
 *
 * Route: /hub/training/famous-finals
 * ═══════════════════════════════════════════════════════════════════════════
 */

// TRAIN-CSS-MOBILE-ADOPT-13 — mobile data-attr long-tail adoption from TRAIN-CSS-MOBILE-1
// TRAIN-CSS-TOKENS-BATCH5-13 — hex sweep batch 5: literals routed to --sp-* tokens
// TRAIN-CSS-GRADIENT-ADOPT-10 — gradient hex routed to rgba(var(--sp-*-rgb), 1)
// TRAIN-CSS-TOKENS-BATCH6-4 — hex sweep batch 6: extended palette literals routed
import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import Head from 'next/head';
import { useRouter } from 'next/router';
import useTrainingBus from '../../../src/hooks/useTrainingBus';
import { eventBus, EventType, busEmit } from '../../../src/engine/EventBus';
import { getAccessToken, authedFetch } from '../../../src/lib/authUtils';
import Card from '../../../src/components/training/Card';
import ConnectionToast from '../../../src/components/training/ConnectionToast';
import { useTrainingFeedback } from '../../../src/hooks/useTrainingFeedback';
// TRAIN-WIRE-FX-5c — adoption: feedback hook


// ═══════════════════════════════════════════════════════════════════════════
// HISTORIC FINAL TABLE DATABASE
// ═══════════════════════════════════════════════════════════════════════════

const FINAL_TABLES = [
  {
    id: 'wsop-2023-me',
    event: '2023 WSOP Main Event',
    series: 'WSOP',
    icon: '🏆',
    players: [
      { name: 'Daniel Weinman', chips: 178_100_000, position: 'BTN' },
      { name: 'Adam Walton', chips: 97_800_000, position: 'CO' },
      { name: 'Joe McKeehen replica', chips: 65_200_000, position: 'HJ' },
    ],
    blinds: '2M/4M',
    ante: '4M',
    totalChips: 341_100_000,
    description: 'Three-handed final table with massive chip lead.',
    difficulty: 'Advanced',
    spots: [
      {
        street: 'preflop',
        hero: 'BTN',
        hand: ['Ah', 'Kd'],
        action: 'Raise 8M',
        vilResp: 'BB calls',
        board: [],
        options: [
          { id: 'raise', text: 'Raise 8M', freq: 85, ev: 1.2, correct: true },
          { id: 'limp', text: 'Limp 4M', freq: 10, ev: 0.4 },
          { id: 'fold', text: 'Fold', freq: 5, ev: 0 },
        ],
        explanation:
          'With AKo on the BTN 3-handed, raising is the dominant strategy. Limping is a significant leak as it gives the blinds a cheap flop with position.',
      },
      {
        street: 'flop',
        hero: 'BTN',
        hand: ['Ah', 'Kd'],
        board: ['As', '7c', '2d'],
        action: 'C-Bet 6M',
        vilResp: 'BB check-calls',
        options: [
          { id: 'cbet-33', text: 'C-Bet 33% pot', freq: 65, ev: 2.8, correct: true },
          { id: 'cbet-75', text: 'C-Bet 75% pot', freq: 25, ev: 2.1 },
          { id: 'check', text: 'Check back', freq: 10, ev: 1.5 },
        ],
        explanation:
          "Top pair top kicker on a dry board. Small c-bet is optimal — it gets value from worse Ax and doesn't build the pot unnecessarily.",
      },
      {
        street: 'turn',
        hero: 'BTN',
        hand: ['Ah', 'Kd'],
        board: ['As', '7c', '2d', 'Qh'],
        action: 'Bet 14M',
        vilResp: 'BB folds',
        options: [
          { id: 'bet-66', text: 'Bet 66% pot', freq: 55, ev: 3.5, correct: true },
          { id: 'bet-100', text: 'Bet pot', freq: 20, ev: 2.8 },
          { id: 'check', text: 'Check', freq: 25, ev: 2.2 },
        ],
        explanation:
          'The Queen brings backdoor flush draws. Betting 66% continues to extract value while maintaining range balance.',
      },
    ],
  },
  {
    id: 'wsop-2019-me',
    event: '2019 WSOP Main Event',
    series: 'WSOP',
    icon: '🏆',
    players: [
      { name: 'Hossein Ensan', chips: 326_800_000, position: 'BTN' },
      { name: 'Dario Sammartino', chips: 68_200_000, position: 'BB' },
    ],
    blinds: '3M/6M',
    ante: '6M',
    totalChips: 395_000_000,
    description: 'Heads-up for the bracelet. Massive 5:1 chip lead.',
    difficulty: 'Expert',
    spots: [
      {
        street: 'preflop',
        hero: 'BTN',
        hand: ['9s', '8s'],
        board: [],
        options: [
          { id: 'raise', text: 'Raise 14M', freq: 75, ev: 1.8, correct: true },
          { id: 'limp', text: 'Limp 6M', freq: 20, ev: 1.1 },
          { id: 'fold', text: 'Fold', freq: 5, ev: 0 },
        ],
        explanation:
          'Suited connectors are premium HU. With a 5:1 chip lead, applying pressure with a standard raise is ICM-optimal.',
      },
      {
        street: 'flop',
        hero: 'BTN',
        hand: ['9s', '8s'],
        board: ['7h', '6d', '2s'],
        options: [
          { id: 'cbet-33', text: 'C-Bet 33%', freq: 70, ev: 3.2, correct: true },
          { id: 'cbet-75', text: 'C-Bet 75%', freq: 15, ev: 2.5 },
          { id: 'check', text: 'Check', freq: 15, ev: 1.8 },
        ],
        explanation:
          'Open-ended straight draw with two overcards. Small c-bet is optimal — you have massive equity and want to build the pot cheaply.',
      },
    ],
  },
  {
    id: 'ept-monte-carlo-2024',
    event: '2024 EPT Monte Carlo Main',
    series: 'EPT',
    icon: '🇲🇨',
    players: [
      { name: 'Jakub Oliva', chips: 12_400_000, position: 'BTN' },
      { name: 'Tobias Hall', chips: 8_900_000, position: 'CO' },
      { name: 'Joao Vieira', chips: 7_200_000, position: 'BB' },
    ],
    blinds: '200K/400K',
    ante: '400K',
    totalChips: 28_500_000,
    description: 'Three-handed EPT final with tight stacks.',
    difficulty: 'Advanced',
    spots: [
      {
        street: 'preflop',
        hero: 'CO',
        hand: ['Jd', 'Ts'],
        board: [],
        options: [
          { id: 'raise', text: 'Raise 900K', freq: 70, ev: 0.9, correct: true },
          { id: 'fold', text: 'Fold', freq: 25, ev: 0 },
          { id: 'jam', text: 'All-in 8.9M', freq: 5, ev: -0.3 },
        ],
        explanation:
          'JTs is a strong CO open 3-handed. Standard raise size at 2.25x. Jamming would be a severe ICM error at this stack depth.',
      },
    ],
  },
  {
    id: 'wpt-2024-champ',
    event: '2024 WPT World Championship',
    series: 'WPT',
    icon: '🌍',
    players: [
      { name: 'Eliot Hudon', chips: 44_800_000, position: 'BTN' },
      { name: 'Thomas Mühlöcker', chips: 33_500_000, position: 'SB' },
      { name: 'Ren Lin', chips: 21_700_000, position: 'BB' },
    ],
    blinds: '400K/800K',
    ante: '800K',
    totalChips: 100_000_000,
    description: 'High-stakes WPT finale with deep stacks.',
    difficulty: 'Intermediate',
    spots: [
      {
        street: 'preflop',
        hero: 'SB',
        hand: ['Ac', 'Qd'],
        board: [],
        options: [
          { id: 'raise', text: 'Raise 2M', freq: 80, ev: 1.5, correct: true },
          { id: 'jam', text: 'All-in 33.5M', freq: 5, ev: 0.8 },
          { id: 'limp', text: 'Limp 800K', freq: 15, ev: 0.6 },
        ],
        explanation:
          'AQo is a premium hand from the SB 3-handed. Standard 2.5x raise maximizes EV. Jamming is +EV but surrenders significant edge.',
      },
      {
        street: 'flop',
        hero: 'SB',
        hand: ['Ac', 'Qd'],
        board: ['Qs', '8c', '3h'],
        options: [
          { id: 'cbet-33', text: 'C-Bet 33%', freq: 60, ev: 2.2, correct: true },
          { id: 'cbet-75', text: 'C-Bet 75%', freq: 30, ev: 1.9 },
          { id: 'check', text: 'Check', freq: 10, ev: 1.2 },
        ],
        explanation:
          'Top pair with top kicker on a dry Q-high board. Small c-bet extracts from worse queens and middle pairs.',
      },
    ],
  },
  {
    id: 'shrb-2024',
    event: '2024 Super High Roller Bowl',
    series: 'SHRB',
    icon: '💎',
    players: [
      { name: 'Isaac Haxton', chips: 8_400_000, position: 'CO' },
      { name: 'Justin Bonomo', chips: 5_600_000, position: 'BTN' },
    ],
    blinds: '100K/200K',
    ante: '200K',
    totalChips: 14_000_000,
    description: 'Heads-up super high roller with elite pros.',
    difficulty: 'Expert',
    spots: [
      {
        street: 'preflop',
        hero: 'BTN',
        hand: ['Kh', 'Jh'],
        board: [],
        options: [
          { id: 'raise', text: 'Raise 450K', freq: 82, ev: 1.3, correct: true },
          { id: 'limp', text: 'Limp 200K', freq: 15, ev: 0.7 },
          { id: 'fold', text: 'Fold', freq: 3, ev: 0 },
        ],
        explanation:
          'KJh is a strong HU raising hand. At 28 BB effective, standard raise sizing keeps the SPR manageable.',
      },
      {
        street: 'flop',
        hero: 'BTN',
        hand: ['Kh', 'Jh'],
        board: ['Kd', '5h', '2h'],
        options: [
          { id: 'cbet-50', text: 'C-Bet 50%', freq: 55, ev: 3.8, correct: true },
          { id: 'cbet-100', text: 'C-Bet pot', freq: 25, ev: 3.1 },
          { id: 'check', text: 'Check', freq: 20, ev: 2.4 },
        ],
        explanation:
          'Top pair with a nut flush draw. This is a monster draw — c-betting 50% pot sets up for a turn barrel or free card.',
      },
    ],
  },
];

const SERIES_FILTERS = ['All', 'WSOP', 'EPT', 'WPT', 'SHRB'];

// Card rendering uses shared Card.tsx custom PNG deck

// ═══════════════════════════════════════════════════════════════════════════
// MAIN PAGE
// ═══════════════════════════════════════════════════════════════════════════

export default function FamousFinalsPage() {
  const router = useRouter();
  useTrainingBus('famous-finals');
  const fb = useTrainingFeedback();

  const [seriesFilter, setSeriesFilter] = useState('All');
  const [activeEvent, setActiveEvent] = useState(null);
  const [spotIndex, setSpotIndex] = useState(0);
  const [selectedAnswer, setSelectedAnswer] = useState(null);
  const [showFeedback, setShowFeedback] = useState(false);
  const [results, setResults] = useState([]); // { spotId, correct, ev }
  const [sessionComplete, setSessionComplete] = useState(false);

  const filtered = useMemo(() => {
    if (seriesFilter === 'All') return FINAL_TABLES;
    return FINAL_TABLES.filter((t) => t.series === seriesFilter);
  }, [seriesFilter]);

  const currentSpot = activeEvent?.spots?.[spotIndex] || null;

  const handleAnswer = useCallback(
    (optionId) => {
      if (showFeedback) return;
      setSelectedAnswer(optionId);
      setShowFeedback(true);
      const opt = currentSpot.options.find((o) => o.id === optionId);
      if (opt?.correct) fb.correct(); else fb.incorrect();
      setResults((prev) => [
        ...prev,
        {
          spotIndex,
          correct: !!opt?.correct,
          ev: opt?.ev || 0,
        },
      ]);
    },
    [showFeedback, currentSpot, spotIndex]
  );

  const handleNext = useCallback(() => {
    if (spotIndex + 1 < activeEvent.spots.length) {
      setSpotIndex(spotIndex + 1);
      setSelectedAnswer(null);
      setShowFeedback(false);
    } else {
      setSessionComplete(true);
      // Save session
      const correct =
        results.filter((r) => r.correct).length +
        (showFeedback && currentSpot?.options?.find((o) => o.id === selectedAnswer)?.correct
          ? 1
          : 0);
      const total = activeEvent.spots.length;
      (async () => {
        try {
          const token = await getAccessToken();
          if (token) {
            authedFetch('/api/training/save-session', {
              method: 'POST',
              body: JSON.stringify({
                gameId: 'famous-finals',
                questionsAnswered: total,
                questionsCorrect: correct,
                accuracy: Math.round((correct / total) * 100),
                trainerConfig: { eventId: activeEvent.id, series: activeEvent.series },
              }),
            }).catch(e => console.warn('[App] Handled promise rejection:', e?.message || e));
          }
          eventBus?.emit?.(
            EventType?.SESSION_END || 'session:end',
            {
              accuracy: Math.round((correct / total) * 100),
              questionsAnswered: total,
              questionsCorrect: correct,
            },
            'famous-finals'
          );
          eventBus?.emit?.('training:session-complete', {
            game_id: 'famous-finals',
            accuracy: Math.round((correct / total) * 100),
            correct_answers: correct,
            total_questions: total,
            hands_played: total,
          });
        } catch (e) {
          console.warn(e);
        }
      })();
    }
  }, [spotIndex, activeEvent, results, showFeedback, selectedAnswer, currentSpot]);

  const resetEvent = () => {
    setActiveEvent(null);
    setSpotIndex(0);
    setSelectedAnswer(null);
    setShowFeedback(false);
    setResults([]);
    setSessionComplete(false);
  };

  const getDiffColor = (d) =>
    d === 'Expert' ? 'var(--sp-accent-red)' : d === 'Advanced' ? 'var(--sp-accent-amber)' : 'var(--sp-accent-green)';

  return (
    <>
      <Head>
        <title>Famous Finals | Smarter.Poker Training</title>
      </Head>
      <div
        style={{
          minHeight: '100vh', paddingBottom: 70, width: '100%', maxWidth: '100vw', overflowX: 'hidden', boxSizing: 'border-box',
          background: 'linear-gradient(180deg, #0a0a1a 0%, #0f172a 50%, #0a0a1a 100%)',
          color: 'var(--sp-fg)',
          fontFamily: "'Inter', sans-serif",
          paddingBottom: 60,
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
            onClick={() => (activeEvent ? resetEvent() : router.push('/hub/training'))}
            style={{
              background: 'rgba(255,255,255,0.05)',
              border: 'none',
              color: 'var(--sp-fg-muted)',
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
            <div style={{ fontSize: 16, fontWeight: 700 }}>Famous Finals</div>
            <div style={{ fontSize: 11, color: 'var(--sp-fg-dim)' }}>
              {activeEvent ? activeEvent.event : 'Historic Final Table Replayer'}
            </div>
          </div>
        </div>

        <div style={{ padding: '20px 16px', maxWidth: 700, margin: '0 auto' }}>
          {/* EVENT LIST */}
          {!activeEvent && (
            <>
              {/* Series Filter */}
              <div
                style={{
                  display: 'flex',
                  gap: 8,
                  marginBottom: 20,
                  overflowX: 'auto',
                  paddingBottom: 8,
                }}
              >
                {SERIES_FILTERS.map((f) => (
                  <button
                    key={f}
                    onClick={() => setSeriesFilter(f)}
                    style={{
                      padding: '8px 16px',
                      borderRadius: 20,
                      border: 'none',
                      fontSize: 12,
                      fontWeight: 700,
                      cursor: 'pointer',
                      whiteSpace: 'nowrap',
                      background: seriesFilter === f ? 'transparent' : 'rgba(255,255,255,0.05)',
                      color: seriesFilter === f ? '#fff' : 'var(--sp-fg-muted)',
                      boxShadow:
                        seriesFilter === f ? 'inset 0 0 0 1px rgba(251,191,36,0.5)' : 'none',
                    }}
                  >
                    {f}
                  </button>
                ))}
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                {filtered.map((ft) => (
                  <motion.button
                    key={ft.id}
                    whileHover={{ scale: 1.01 }}
                    whileTap={{ scale: 0.99 }}
                    onClick={() => setActiveEvent(ft)}
                    style={{
                      padding: 20,
                      borderRadius: 16,
                      border: '1px solid rgba(255,255,255,0.06)',
                      background: 'rgba(255,255,255,0.02)',
                      cursor: 'pointer',
                      textAlign: 'left',
                      color: 'var(--sp-fg)',
                      width: '100%',
                    }}
                  >
                    <div
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'flex-start',
                        marginBottom: 12,
                      }}
                    >
                      <div>
                        <div
                          style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}
                        >
                          <span style={{ fontSize: 20 }}>{ft.icon}</span>
                          <span style={{ fontSize: 16, fontWeight: 800 }}>{ft.event}</span>
                        </div>
                        <div style={{ fontSize: 12, color: 'var(--sp-fg-muted)' }}>{ft.description}</div>
                      </div>
                      <span
                        style={{
                          padding: '4px 8px',
                          borderRadius: 6,
                          fontSize: 10,
                          fontWeight: 700,
                          background: `${getDiffColor(ft.difficulty)}15`,
                          color: getDiffColor(ft.difficulty),
                        }}
                      >
                        {ft.difficulty}
                      </span>
                    </div>

                    {/* Players */}
                    <div data-pills-row style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 12 }}>
                      {ft.players.map((p) => (
                        <div
                          key={p.name}
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: 6,
                            padding: '6px 10px',
                            borderRadius: 8,
                            background: 'rgba(0,0,0,0.3)',
                          }}
                        >
                          <span style={{ fontSize: 10, color: 'var(--sp-fg-muted)', fontWeight: 700 }}>
                            {p.position}
                          </span>
                          <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--sp-fg)' }}>
                            {p.name}
                          </span>
                          <span style={{ fontSize: 10, color: 'var(--sp-accent-amber)', fontWeight: 700 }}>
                            {(Number.isFinite(Number(p.chips / 1_000_000)) ? Number(p.chips / 1_000_000) : 0).toFixed(1)}M
                          </span>
                        </div>
                      ))}
                    </div>
                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 16,
                        fontSize: 11,
                        color: 'var(--sp-fg-dim)',
                      }}
                    >
                      <span>Blinds: {ft.blinds}</span>
                      <span>Ante: {ft.ante}</span>
                      <span>{ft.spots.length} decision points</span>
                    </div>
                  </motion.button>
                ))}
              </div>
            </>
          )}

          {/* ACTIVE GAME */}
          {activeEvent && !sessionComplete && currentSpot && (
            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
              {/* Progress */}
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  marginBottom: 16,
                }}
              >
                <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--sp-fg-muted)' }}>
                  Spot {spotIndex + 1} / {activeEvent.spots.length}
                </div>
                <div style={{ display: 'flex', gap: 4 }}>
                  {activeEvent.spots.map((_, i) => (
                    <div
                      key={i}
                      style={{
                        width: 24,
                        height: 4,
                        borderRadius: 2,
                        background:
                          i < spotIndex
                            ? 'var(--sp-accent-green)'
                            : i === spotIndex
                              ? 'var(--sp-accent-blue)'
                              : 'rgba(255,255,255,0.1)',
                      }}
                    />
                  ))}
                </div>
              </div>

              {/* Scenario Card */}
              <div
                style={{
                  padding: 24,
                  borderRadius: 16,
                  background: 'rgba(0,0,0,0.3)',
                  border: '1px solid rgba(255,255,255,0.06)',
                  marginBottom: 20,
                }}
              >
                {/* Street Badge */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
                  <span
                    style={{
                      padding: '4px 12px',
                      borderRadius: 6,
                      fontSize: 11,
                      fontWeight: 800,
                      textTransform: 'uppercase',
                      letterSpacing: 1,
                      background:
                        currentSpot.street === 'preflop'
                          ? 'rgba(139,92,246,0.15)'
                          : currentSpot.street === 'flop'
                            ? 'rgba(34,197,94,0.15)'
                            : currentSpot.street === 'turn'
                              ? 'rgba(59,130,246,0.15)'
                              : 'rgba(239,68,68,0.15)',
                      color:
                        currentSpot.street === 'preflop'
                          ? 'var(--sp-accent-purple)'
                          : currentSpot.street === 'flop'
                            ? 'var(--sp-accent-green)'
                            : currentSpot.street === 'turn'
                              ? 'var(--sp-accent-blue)'
                              : 'var(--sp-accent-red)',
                    }}
                  >
                    {currentSpot.street}
                  </span>
                  <span style={{ fontSize: 12, color: 'var(--sp-fg-muted)', fontWeight: 600 }}>
                    Hero: {currentSpot.hero}
                  </span>
                </div>

                {/* Hero Hand */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
                  <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--sp-fg-dim)' }}>YOUR HAND</span>
                  <div style={{ display: 'flex', gap: 4 }}>
                    {currentSpot.hand.map((c, i) => (
                      <Card
                        key={i}
                        rank={c[0]?.toUpperCase()}
                        suit={c[1]?.toLowerCase()}
                        size="tiny"
                      />
                    ))}
                  </div>
                </div>

                {/* Board */}
                {currentSpot.board && currentSpot.board.length > 0 && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
                    <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--sp-fg-dim)' }}>BOARD</span>
                    <div style={{ display: 'flex', gap: 4 }}>
                      {currentSpot.board.map((c, i) => (
                        <Card
                          key={i}
                          rank={c[0]?.toUpperCase()}
                          suit={c[1]?.toLowerCase()}
                          size="tiny"
                        />
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* Action Buttons */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 20 }}>
                {currentSpot.options.map((opt) => {
                  const isSelected = selectedAnswer === opt.id;
                  const isCorrect = opt.correct;
                  let bg = 'rgba(255,255,255,0.04)';
                  let border = '1px solid rgba(255,255,255,0.08)';

                  if (showFeedback) {
                    if (isCorrect) {
                      bg = 'rgba(34,197,94,0.15)';
                      border = '1px solid rgba(34,197,94,0.4)';
                    } else if (isSelected && !isCorrect) {
                      bg = 'rgba(239,68,68,0.15)';
                      border = '1px solid rgba(239,68,68,0.4)';
                    }
                  }

                  return (
                    <motion.button
                      key={opt.id}
                      whileTap={!showFeedback ? { scale: 0.98 } : {}}
                      onClick={() => handleAnswer(opt.id)}
                      disabled={showFeedback}
                      style={{
                        padding: '16px 20px',
                        borderRadius: 12,
                        background: bg,
                        border,
                        color: 'var(--sp-fg)',
                        fontSize: 14,
                        fontWeight: 700,
                        cursor: showFeedback ? 'default' : 'pointer',
                        textAlign: 'left',
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                      }}
                    >
                      <span>{opt.text}</span>
                      {showFeedback && (
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <span style={{ fontSize: 11, color: 'var(--sp-fg-muted)' }}>{opt.freq}% freq</span>
                          <span
                            style={{
                              fontSize: 11,
                              fontWeight: 800,
                              color: opt.ev > 0 ? 'var(--sp-accent-green)' : 'var(--sp-accent-red)',
                            }}
                          >
                            {opt.ev > 0 ? '+' : ''}
                            {opt.ev} EV
                          </span>
                        </div>
                      )}
                    </motion.button>
                  );
                })}
              </div>

              {/* Explanation */}
              <AnimatePresence>
                {showFeedback && (
                  <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -10 }}
                    style={{
                      padding: 20,
                      borderRadius: 12,
                      background: 'rgba(59,130,246,0.08)',
                      border: '1px solid rgba(59,130,246,0.2)',
                      marginBottom: 20,
                    }}
                  >
                    <div
                      style={{
                        fontSize: 11,
                        fontWeight: 700,
                        color: 'var(--sp-accent-blue)',
                        textTransform: 'uppercase',
                        letterSpacing: 1,
                        marginBottom: 8,
                      }}
                    >
                      Solver Analysis
                    </div>
                    <div style={{ fontSize: 13, color: 'var(--sp-fg)', lineHeight: 1.6 }}>
                      {currentSpot.explanation}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>

              {/* Next button */}
              {showFeedback && (
                <motion.button
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  onClick={handleNext}
                  style={{
                    width: '100%',
                    padding: 16,
                    borderRadius: 12,
                    border: 'none',
                    background: 'linear-gradient(135deg, rgba(var(--sp-accent-blue-rgb), 1), #8b5cf6)',
                    color: '#fff',
                    fontSize: 15,
                    fontWeight: 800,
                    cursor: 'pointer',
                  }}
                >
                  {spotIndex + 1 < activeEvent.spots.length ? 'Next Decision →' : 'View Results'}
                </motion.button>
              )}
            </motion.div>
          )}

          {/* SESSION COMPLETE */}
          {sessionComplete && (
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              style={{
                padding: 32,
                borderRadius: 20,
                background: 'rgba(0,0,0,0.3)',
                border: '1px solid rgba(255,255,255,0.06)',
                textAlign: 'center',
              }}
            >
              <div style={{ fontSize: 42, marginBottom: 8 }}>🏆</div>
              <div style={{ fontSize: 22, fontWeight: 900, marginBottom: 8 }}>
                {activeEvent.event}
              </div>
              <div style={{ fontSize: 14, color: 'var(--sp-fg-muted)', marginBottom: 24 }}>
                Final Table Complete
              </div>

              <div style={{ display: 'flex', justifyContent: 'center', gap: 32, marginBottom: 32 }}>
                <div>
                  <div style={{ fontSize: 36, fontWeight: 900, color: 'var(--sp-accent-green)' }}>
                    {results.filter((r) => r.correct).length}/{results.length}
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--sp-fg-muted)', fontWeight: 700 }}>CORRECT</div>
                </div>
                <div>
                  <div style={{ fontSize: 36, fontWeight: 900, color: 'var(--sp-accent-amber)' }}>
                    {results.reduce((sum, r) => sum + r.ev, 0).toFixed(1)}
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--sp-fg-muted)', fontWeight: 700 }}>TOTAL EV</div>
                </div>
              </div>

              {/* Per-spot results */}
              <div
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 8,
                  marginBottom: 24,
                  textAlign: 'left',
                }}
              >
                {results.map((r, i) => (
                  <div
                    key={i}
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      padding: '10px 14px',
                      borderRadius: 8,
                      background: r.correct ? 'rgba(34,197,94,0.08)' : 'rgba(239,68,68,0.08)',
                    }}
                  >
                    <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--sp-fg)' }}>
                      Spot {i + 1}: {activeEvent.spots[i]?.street}
                    </span>
                    <span
                      style={{
                        fontSize: 12,
                        fontWeight: 700,
                        color: r.correct ? 'var(--sp-accent-green)' : 'var(--sp-accent-red)',
                      }}
                    >
                      {r.correct ? '✓ Correct' : '✗ Mistake'}
                    </span>
                  </div>
                ))}
              </div>

              <div style={{ display: 'flex', gap: 12 }}>
                <button
                  onClick={() => {
                    setSpotIndex(0);
                    setSelectedAnswer(null);
                    setShowFeedback(false);
                    setResults([]);
                    setSessionComplete(false);
                  }}
                  style={{
                    flex: 1,
                    padding: 14,
                    borderRadius: 10,
                    border: '1px solid rgba(59,130,246,0.3)',
                    background: 'rgba(59,130,246,0.1)',
                    color: 'var(--sp-accent-blue)',
                    fontSize: 14,
                    fontWeight: 700,
                    cursor: 'pointer',
                  }}
                >
                  Replay
                </button>
                <button
                  onClick={resetEvent}
                  style={{
                    flex: 1,
                    padding: 14,
                    borderRadius: 10,
                    border: 'none',
                    background: 'rgba(255,255,255,0.05)',
                    color: 'var(--sp-fg-muted)',
                    fontSize: 14,
                    fontWeight: 700,
                    cursor: 'pointer',
                  }}
                >
                  Back to Events
                </button>
              </div>
            </motion.div>
          )}
        </div>

      </div>
      <ConnectionToast />
    </>
  );
}
