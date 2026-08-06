/**
 * MULTIWAY POSTFLOP SOLVER — 3-Way Pot Strategy Analysis
 * ═══════════════════════════════════════════════════════════════════════════
 * Pre-computed 3-way postflop scenarios showing optimal frequencies for
 * each player position (IP, OOP, 3rd player). Visualizes range advantage
 * and equity distribution across board textures.
 * ═══════════════════════════════════════════════════════════════════════════
 */

// TRAIN-CSS-TOKENS-BATCH4-5 — hex sweep batch 4: literals routed to --sp-* tokens
// TRAIN-CSS-GRADIENT-ADOPT-25 — gradient hex routed to rgba(var(--sp-*-rgb), 1)
import React, { useState, useEffect, useMemo, useCallback } from 'react';
import Head from 'next/head';
import { useRouter } from 'next/router';
import { motion, AnimatePresence } from 'framer-motion';
import useTrainingBus from '../../../src/hooks/useTrainingBus';
import { eventBus, EventType } from '../../../src/engine/EventBus';
import { getAuthUser, getAccessToken, authedFetch } from '../../../src/lib/authUtils';
import Card from '../../../src/components/training/Card';

// ═══════════════════════════════════════════════════════════════════════════
// PRE-COMPUTED 3-WAY SCENARIOS
// ═══════════════════════════════════════════════════════════════════════════

const SCENARIOS = [
  {
    id: 'btn_co_bb_dry',
    name: 'BTN vs CO vs BB — Dry Board',
    board: ['As', '7d', '2c'],
    players: [
      { position: 'BTN', role: 'IP Caller', color: 'var(--sp-accent-green)' },
      { position: 'CO', role: 'Original Raiser', color: 'var(--sp-accent-blue)' },
      { position: 'BB', role: 'OOP Defender', color: 'var(--sp-accent-amber)' },
    ],
    actions: {
      CO: { check: 58, bet33: 27, bet66: 12, bet100: 3 },
      BB: { check: 72, bet33: 18, bet66: 8, bet100: 2 },
      BTN: { check: 65, bet33: 22, bet66: 10, bet100: 3 },
    },
    equity: { CO: 38, BTN: 35, BB: 27 },
    rangeAdvantage: 'CO',
    nutAdvantage: 'CO',
    notes: 'CO has range and nut advantage on Ace-high dry boards. CO should c-bet ~42% with smaller sizing. BTN and BB can exploit by check-raising sets/two pair.',
    texture: 'Dry',
    difficulty: 'Intermediate',
  },
  {
    id: 'btn_mp_bb_wet',
    name: 'BTN vs MP vs BB — Wet Board',
    board: ['Jh', 'Th', '8s'],
    players: [
      { position: 'BTN', role: 'IP Caller', color: 'var(--sp-accent-green)' },
      { position: 'MP', role: 'Original Raiser', color: 'var(--sp-accent-blue)' },
      { position: 'BB', role: 'OOP Defender', color: 'var(--sp-accent-amber)' },
    ],
    actions: {
      MP: { check: 72, bet33: 18, bet66: 8, bet100: 2 },
      BB: { check: 78, bet33: 14, bet66: 6, bet100: 2 },
      BTN: { check: 60, bet33: 25, bet66: 11, bet100: 4 },
    },
    equity: { MP: 33, BTN: 37, BB: 30 },
    rangeAdvantage: 'BTN',
    nutAdvantage: 'BTN',
    notes: 'On highly connected boards, the OR checks most of their range. BTN has strong nutted hands (straights, sets) and can bet wider. BB should lead rarely.',
    texture: 'Wet',
    difficulty: 'Advanced',
  },
  {
    id: 'co_utg_bb_paired',
    name: 'CO vs UTG vs BB — Paired Board',
    board: ['Ks', 'Kd', '5h'],
    players: [
      { position: 'CO', role: 'IP Caller', color: 'var(--sp-accent-green)' },
      { position: 'UTG', role: 'Original Raiser', color: 'var(--sp-accent-blue)' },
      { position: 'BB', role: 'OOP Defender', color: 'var(--sp-accent-amber)' },
    ],
    actions: {
      UTG: { check: 48, bet33: 38, bet66: 12, bet100: 2 },
      BB: { check: 85, bet33: 10, bet66: 4, bet100: 1 },
      CO: { check: 70, bet33: 20, bet66: 8, bet100: 2 },
    },
    equity: { UTG: 42, CO: 33, BB: 25 },
    rangeAdvantage: 'UTG',
    nutAdvantage: 'UTG',
    notes: 'UTG has massive range advantage on King-paired boards. Bet frequently with small sizing. BB barely has Kx in 3-way range and should mostly check-fold.',
    texture: 'Paired',
    difficulty: 'Intermediate',
  },
  {
    id: 'btn_co_bb_monotone',
    name: 'BTN vs CO vs BB — Monotone Board',
    board: ['9h', '6h', '3h'],
    players: [
      { position: 'BTN', role: 'IP Caller', color: 'var(--sp-accent-green)' },
      { position: 'CO', role: 'Original Raiser', color: 'var(--sp-accent-blue)' },
      { position: 'BB', role: 'OOP Defender', color: 'var(--sp-accent-amber)' },
    ],
    actions: {
      CO: { check: 78, bet33: 14, bet66: 6, bet100: 2 },
      BB: { check: 70, bet33: 18, bet66: 9, bet100: 3 },
      BTN: { check: 55, bet33: 28, bet66: 13, bet100: 4 },
    },
    equity: { CO: 30, BTN: 38, BB: 32 },
    rangeAdvantage: 'BTN',
    nutAdvantage: 'BB',
    notes: 'Monotone boards flatten equity. BB has more flush combos from defending wide. OR checks most of range. BTN can bet as IP with decent flush coverage.',
    texture: 'Monotone',
    difficulty: 'Advanced',
  },
  {
    id: 'sb_btn_bb_lowboard',
    name: 'SB vs BTN vs BB — Low Connected',
    board: ['6d', '5s', '4c'],
    players: [
      { position: 'SB', role: '3-Bettor', color: 'var(--sp-accent-green)' },
      { position: 'BTN', role: 'Original Raiser', color: 'var(--sp-accent-blue)' },
      { position: 'BB', role: 'Cold Caller', color: 'var(--sp-accent-amber)' },
    ],
    actions: {
      SB: { check: 55, bet33: 30, bet66: 12, bet100: 3 },
      BTN: { check: 68, bet33: 20, bet66: 9, bet100: 3 },
      BB: { check: 75, bet33: 16, bet66: 7, bet100: 2 },
    },
    equity: { SB: 36, BTN: 32, BB: 32 },
    rangeAdvantage: 'BB',
    nutAdvantage: 'BB',
    notes: 'Low connected boards favor the BB who defends with suited connectors (78s, 67s, 45s). SB/BTN overpair-heavy ranges suffer here. Check frequently as the 3-bettor.',
    texture: 'Connected',
    difficulty: 'Expert',
  },
  {
    id: 'co_mp_bb_broadway',
    name: 'CO vs MP vs BB — Broadway Board',
    board: ['Qs', 'Jd', 'Tc'],
    players: [
      { position: 'CO', role: 'IP Caller', color: 'var(--sp-accent-green)' },
      { position: 'MP', role: 'Original Raiser', color: 'var(--sp-accent-blue)' },
      { position: 'BB', role: 'OOP Defender', color: 'var(--sp-accent-amber)' },
    ],
    actions: {
      MP: { check: 60, bet33: 25, bet66: 12, bet100: 3 },
      BB: { check: 80, bet33: 13, bet66: 5, bet100: 2 },
      CO: { check: 58, bet33: 26, bet66: 12, bet100: 4 },
    },
    equity: { MP: 36, CO: 36, BB: 28 },
    rangeAdvantage: 'MP',
    nutAdvantage: 'CO',
    notes: 'Broadway boards connect with all three players but IP players have more nutted combos (AK, KK). MP can c-bet small. CO can raise on good cards. BB mostly check-calls.',
    texture: 'Broadway',
    difficulty: 'Expert',
  },
];

const TEXTURE_COLORS = {
  Dry: 'var(--sp-fg-muted)',
  Wet: 'var(--sp-accent-blue)',
  Paired: 'var(--sp-accent-amber)',
  Monotone: 'var(--sp-accent-purple)',
  Connected: 'var(--sp-accent-green)',
  Broadway: 'var(--sp-accent-red)',
};

const DIFFICULTY_COLORS = {
  Intermediate: 'var(--sp-accent-green)',
  Advanced: 'var(--sp-accent-amber)',
  Expert: 'var(--sp-accent-red)',
};

// Card rendering — uses the custom 52-card PNG deck
function MiniCard({ card }) {
  if (!card) return null;
  const rank = card[0]?.toUpperCase();
  const suit = card.slice(1)?.toLowerCase();
  return <Card rank={rank} suit={suit} size="tiny" animate="none" />;
}

// ═══════════════════════════════════════════════════════════════════════════
// FREQUENCY BAR
// ═══════════════════════════════════════════════════════════════════════════

function FrequencyBar({ actions, playerColor, quizMode, showAnswers }) {
  const entries = Object.entries(actions || {}).filter(([, v]) => v > 0);
  const actionColors = {
    check: 'var(--sp-fg-dim)',
    bet33: 'var(--sp-accent-green)',
    bet66: 'var(--sp-accent-amber)',
    bet100: 'var(--sp-accent-red)',
    fold: 'var(--sp-fg-faint)',
    call: 'var(--sp-accent-blue)',
    raise: 'var(--sp-accent-purple)',
  };
  const actionLabels = {
    check: 'Check',
    bet33: 'Bet 33%',
    bet66: 'Bet 66%',
    bet100: 'Bet 100%',
    fold: 'Fold',
    call: 'Call',
    raise: 'Raise',
  };

  return (
    <div>
      <div
        style={{
          display: 'flex',
          height: 20,
          borderRadius: 6,
          overflow: 'hidden',
          marginBottom: 6,
          background: 'rgba(255,255,255,0.05)',
        }}
      >
        {!quizMode || showAnswers ? entries.map(([action, freq]) => (
          <div
            key={action}
            style={{
              width: `${freq}%`,
              background: actionColors[action] || playerColor,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: 7,
              fontWeight: 800,
              color: '#fff',
              minWidth: freq > 5 ? 20 : 0,
            }}
          >
            {freq > 8 ? `${freq}%` : ''}
          </div>
        )) : (
          <div style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--sp-fg-dim)', fontSize: 9, fontWeight: 700 }}>
            ? HIDDEN (QUIZ MODE)
          </div>
        )}
      </div>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        {!quizMode || showAnswers ? entries.map(([action, freq]) => (
          <div key={action} style={{ display: 'flex', alignItems: 'center', gap: 3, fontSize: 9 }}>
            <div
              style={{
                width: 6,
                height: 6,
                borderRadius: 2,
                background: actionColors[action] || 'var(--sp-fg-dim)',
              }}
            />
            <span style={{ color: 'var(--sp-fg-muted)' }}>
              {actionLabels[action] || action}:{' '}
              <strong style={{ color: 'var(--sp-fg)' }}>{freq}%</strong>
            </span>
          </div>
        )) : (
          <div style={{ fontSize: 9, color: 'var(--sp-fg-dim)' }}>Guess the frequencies before revealing.</div>
        )}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// EQUITY PIE CHART (SVG)
// ═══════════════════════════════════════════════════════════════════════════

function EquityPie({ equity, players }) {
  const size = 120;
  const center = size / 2;
  const radius = 45;
  const values = players.map((p) => equity[p.position] || 0);
  const total = values.reduce((a, b) => a + b, 0) || 1;

  let cumulative = 0;
  const arcs = values.map((val, i) => {
    const start = cumulative;
    cumulative += val / total;
    const end = cumulative;
    const startAngle = start * 2 * Math.PI - Math.PI / 2;
    const endAngle = end * 2 * Math.PI - Math.PI / 2;
    const largeArc = end - start > 0.5 ? 1 : 0;
    const x1 = center + radius * Math.cos(startAngle);
    const y1 = center + radius * Math.sin(startAngle);
    const x2 = center + radius * Math.cos(endAngle);
    const y2 = center + radius * Math.sin(endAngle);

    return (
      <path
        key={i}
        d={`M ${center} ${center} L ${x1} ${y1} A ${radius} ${radius} 0 ${largeArc} 1 ${x2} ${y2} Z`}
        fill={players[i].color}
        opacity={0.8}
        stroke="rgba(0,0,0,0.3)"
        strokeWidth={1}
      />
    );
  });

  return (
    <div style={{ textAlign: 'center' }}>
      <svg width={size} height={size}>
        {arcs}
      </svg>
      <div style={{ display: 'flex', gap: 8, justifyContent: 'center', marginTop: 6 }}>
        {players.map((p) => (
          <div key={p.position} style={{ fontSize: 9, display: 'flex', alignItems: 'center', gap: 3 }}>
            <div style={{ width: 6, height: 6, borderRadius: '50%', background: p.color }} />
            <span style={{ color: 'var(--sp-fg-muted)' }}>
              {p.position}: <strong style={{ color: p.color }}>{equity[p.position]}%</strong>
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// MAIN PAGE
// ═══════════════════════════════════════════════════════════════════════════

export default function MultiwayPostflop() {
  const router = useRouter();
  const bus = useTrainingBus('multiway-postflop');

  const [selectedScenario, setSelectedScenario] = useState(null);
  
  // Phase 34: Multiway Quiz Mode
  const [quizMode, setQuizMode] = useState(false);
  const [showAnswers, setShowAnswers] = useState(false);
  const [textureFilter, setTextureFilter] = useState('All');
  const [sessionsCompleted, setSessionsCompleted] = useState(0);

  const textures = ['All', ...new Set(SCENARIOS.map((s) => s.texture))];

  const filteredScenarios = useMemo(
    () =>
      textureFilter === 'All'
        ? SCENARIOS
        : SCENARIOS.filter((s) => s.texture === textureFilter),
    [textureFilter]
  );

  const scenario = selectedScenario ? SCENARIOS.find((s) => s.id === selectedScenario) : null;

  // Save session on scenario study
  const markStudied = useCallback(async () => {
    setSessionsCompleted((p) => p + 1);
    try {
      const token = await getAccessToken();
      if (!token) return;
      await authedFetch('/api/training/save-session', {
        method: 'POST',
        body: JSON.stringify({
          gameId: 'multiway_postflop',
          gameName: 'Multiway Postflop Solver',
          handsPlayed: 1,
          accuracy: 100,
          gtowScore: 100,
          levelPassed: true,
        }),
      });
      eventBus?.emit?.(EventType?.SESSION_END || 'session:end', {
        gameId: 'multiway_postflop',
        scenario: selectedScenario,
      }, 'MultiwayPostflop');
    } catch (e) { console.warn('[App] Handled exception:', e?.message || e); }
  }, [selectedScenario]);

  return (
    <>
      <Head>
        <title>Multiway Postflop Solver | Smarter.Poker</title>
        <meta name="description" content="Study optimal strategies in 3-way postflop pots. Pre-computed solver scenarios with range advantage analysis." />
        <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&family=Orbitron:wght@500;700;900&display=swap" rel="stylesheet" />
      </Head>

      <div
        style={{
          minHeight: '100vh', paddingBottom: 70, width: '100%', maxWidth: '100vw', overflowX: 'hidden', boxSizing: 'border-box',
          background: 'linear-gradient(180deg, #0a0a12 0%, #0f0f1e 50%, #1a1a2e 100%)',
          color: 'var(--sp-fg)',
          fontFamily: "'Inter', -apple-system, sans-serif",
        }}
      >
        {/* Header */}
        <div style={{ padding: '20px 24px 16px', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <button
              onClick={() => router.push('/hub/training')}
              style={{
                background: 'rgba(255,255,255,0.06)',
                border: '1px solid rgba(255,255,255,0.1)',
                borderRadius: 8,
                padding: '6px 12px',
                color: 'var(--sp-fg-muted)',
                cursor: 'pointer',
                fontSize: 12,
                fontWeight: 600,
              }}
            >
              ← Training
            </button>
            <h1
              style={{
                fontSize: 22,
                fontWeight: 800,
                margin: 0,
                background: 'linear-gradient(135deg, rgba(var(--sp-accent-purple-rgb), 1), rgba(var(--sp-accent-blue-rgb), 1))',
                WebkitBackgroundClip: 'text',
                WebkitTextFillColor: 'transparent',
                fontFamily: "var(--font-orbitron), 'Orbitron', monospace",
              }}
            >
              Multiway Postflop
            </h1>
            <span
              style={{
                fontSize: 10,
                color: 'var(--sp-fg-dim)',
                background: 'rgba(255,255,255,0.05)',
                padding: '2px 8px',
                borderRadius: 10,
                fontWeight: 600,
              }}
            >
              {SCENARIOS.length} scenarios
            </span>
          </div>
          <p style={{ fontSize: 12, color: 'var(--sp-fg-dim)', marginTop: 6 }}>
            Study optimal strategies in 3-way pots. See how equity, range advantage, and betting
            frequencies change with multiple players.
          </p>
        </div>

        <div style={{ padding: '16px 24px', maxWidth: 1000, margin: '0 auto' }}>
          {/* Texture Filter */}
          <div style={{ display: 'flex', gap: 6, marginBottom: 16, flexWrap: 'wrap' }}>
            {textures.map((t) => (
              <button
                key={t}
                onClick={() => { setTextureFilter(t); setSelectedScenario(null); }}
                style={{
                  padding: '5px 14px',
                  borderRadius: 8,
                  fontSize: 11,
                  fontWeight: 700,
                  cursor: 'pointer',
                  border: 'none',
                  background: textureFilter === t ? `${TEXTURE_COLORS[t] || 'var(--sp-accent-cyan)'}30` : 'rgba(255,255,255,0.04)',
                  color: textureFilter === t ? TEXTURE_COLORS[t] || 'var(--sp-accent-cyan)' : 'var(--sp-fg-dim)',
                  transition: 'all 0.15s',
                }}
              >
                {t}
              </button>
            ))}
          </div>

          <AnimatePresence mode="wait">
            {!scenario ? (
              /* Scenario List */
              <motion.div
                key="list"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                style={{ display: 'grid', gap: 10 }}
              >
                {filteredScenarios.map((s, i) => (
                  <motion.button
                    key={s.id}
                    onClick={() => { setSelectedScenario(s.id); setShowAnswers(false); }}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: i * 0.04 }}
                    whileHover={{ scale: 1.01 }}
                    style={{
                      width: '100%',
                      padding: '14px 18px',
                      borderRadius: 12,
                      background: 'rgba(255,255,255,0.03)',
                      border: '1px solid rgba(255,255,255,0.06)',
                      cursor: 'pointer',
                      textAlign: 'left',
                      display: 'flex',
                      alignItems: 'center',
                      gap: 14,
                      transition: 'all 0.15s',
                    }}
                  >
                    {/* Board Preview */}
                    <div style={{ display: 'flex', gap: 3 }}>
                      {s.board.map((c, ci) => (
                        <MiniCard key={ci} card={c} />
                      ))}
                    </div>

                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--sp-fg)', marginBottom: 4 }}>
                        {s.name}
                      </div>
                      <div style={{ display: 'flex', gap: 8 }}>
                        {s.players.map((p) => (
                          <span
                            key={p.position}
                            style={{
                              fontSize: 9,
                              fontWeight: 700,
                              padding: '1px 6px',
                              borderRadius: 4,
                              background: `${p.color}20`,
                              color: p.color,
                            }}
                          >
                            {p.position} {p.role}
                          </span>
                        ))}
                      </div>
                    </div>

                    <div style={{ display: 'flex', gap: 6 }}>
                      <span
                        style={{
                          fontSize: 9,
                          fontWeight: 700,
                          padding: '2px 8px',
                          borderRadius: 6,
                          background: `${TEXTURE_COLORS[s.texture]}20`,
                          color: TEXTURE_COLORS[s.texture],
                        }}
                      >
                        {s.texture}
                      </span>
                      <span
                        style={{
                          fontSize: 9,
                          fontWeight: 700,
                          padding: '2px 8px',
                          borderRadius: 6,
                          background: `${DIFFICULTY_COLORS[s.difficulty]}15`,
                          color: DIFFICULTY_COLORS[s.difficulty],
                        }}
                      >
                        {s.difficulty}
                      </span>
                    </div>
                  </motion.button>
                ))}
              </motion.div>
            ) : (
              /* Scenario Detail */
              <motion.div
                key="detail"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                  <button
                    onClick={() => {
                      setSelectedScenario(null);
                      setQuizMode(false);
                      setShowAnswers(false);
                    }}
                    style={{
                      background: 'rgba(255,255,255,0.06)',
                      border: '1px solid rgba(255,255,255,0.1)',
                      borderRadius: 8,
                      padding: '6px 12px',
                      color: 'var(--sp-fg-muted)',
                      cursor: 'pointer',
                      fontSize: 11,
                      fontWeight: 600,
                    }}
                  >
                    ← All Scenarios
                  </button>

                  <button
                    onClick={() => {
                      if (quizMode) {
                        setQuizMode(false);
                        setShowAnswers(true);
                      } else {
                        setQuizMode(true);
                        setShowAnswers(false);
                      }
                    }}
                    style={{
                      background: quizMode ? 'rgba(168,85,247,0.15)' : 'rgba(255,255,255,0.06)',
                      border: quizMode ? '1px solid rgba(168,85,247,0.4)' : '1px solid rgba(255,255,255,0.1)',
                      borderRadius: 8,
                      padding: '6px 14px',
                      color: quizMode ? 'var(--sp-accent-purple)' : 'var(--sp-fg-muted)',
                      cursor: 'pointer',
                      fontSize: 11,
                      fontWeight: 700,
                      display: 'flex',
                      alignItems: 'center',
                      gap: 6,
                    }}
                  >
                    {quizMode ? 'Quiz Mode: ON': 'Practice Quiz'}
                  </button>
                </div>

                {/* Board Display */}
                <div
                  style={{
                    background: 'linear-gradient(135deg, rgba(0,212,255,0.05), rgba(124,58,237,0.03))',
                    border: '1px solid rgba(0,212,255,0.15)',
                    borderRadius: 14,
                    padding: 20,
                    marginBottom: 16,
                  }}
                >
                  <div
                    style={{
                      fontSize: 16,
                      fontWeight: 800,
                      color: 'var(--sp-fg)',
                      marginBottom: 4,
                      fontFamily: "var(--font-orbitron), 'Orbitron', monospace",
                    }}
                  >
                    {scenario.name}
                  </div>
                  <div
                    style={{
                      display: 'flex',
                      gap: 6,
                      marginBottom: 14,
                    }}
                  >
                    <span
                      style={{
                        fontSize: 9,
                        padding: '2px 8px',
                        borderRadius: 6,
                        background: `${TEXTURE_COLORS[scenario.texture]}20`,
                        color: TEXTURE_COLORS[scenario.texture],
                        fontWeight: 700,
                      }}
                    >
                      {scenario.texture}
                    </span>
                    <span
                      style={{
                        fontSize: 9,
                        padding: '2px 8px',
                        borderRadius: 6,
                        background: `${DIFFICULTY_COLORS[scenario.difficulty]}15`,
                        color: DIFFICULTY_COLORS[scenario.difficulty],
                        fontWeight: 700,
                      }}
                    >
                      {scenario.difficulty}
                    </span>
                  </div>

                  <div
                    style={{
                      display: 'flex',
                      gap: 6,
                      justifyContent: 'center',
                      marginBottom: 16,
                    }}
                  >
                    {scenario.board.map((c, i) => (
                      <MiniCard key={i} card={c} />
                    ))}
                  </div>

                  {/* Equity Distribution */}
                  <div
                    style={{
                      display: 'flex',
                      justifyContent: 'center',
                      gap: 24,
                      alignItems: 'center',
                    }}
                  >
                    <EquityPie equity={scenario.equity} players={scenario.players} />
                    <div>
                      <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--sp-fg-dim)', marginBottom: 6, textTransform: 'uppercase', letterSpacing: 1 }}>
                        Advantage
                      </div>
                      <div style={{ fontSize: 11, color: 'var(--sp-fg-muted)', marginBottom: 4 }}>
                        Range: <strong style={{ color: 'var(--sp-accent-cyan)' }}>{scenario.rangeAdvantage}</strong>
                      </div>
                      <div style={{ fontSize: 11, color: 'var(--sp-fg-muted)' }}>
                        Nut: <strong style={{ color: 'var(--sp-accent-green)' }}>{scenario.nutAdvantage}</strong>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Per-Player Frequencies */}
                <div style={{ display: 'grid', gap: 10, marginBottom: 16 }}>
                  {scenario.players.map((player) => (
                    <div
                      key={player.position}
                      style={{
                        background: 'rgba(0,0,0,0.25)',
                        border: `1px solid ${player.color}30`,
                        borderRadius: 12,
                        padding: 16,
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                        <div
                          style={{
                            width: 28,
                            height: 28,
                            borderRadius: 8,
                            background: `${player.color}20`,
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            fontSize: 11,
                            fontWeight: 900,
                            color: player.color,
                            fontFamily: "var(--font-orbitron), 'Orbitron', monospace",
                          }}
                        >
                          {player.position}
                        </div>
                        <div>
                          <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--sp-fg)' }}>{player.role}</div>
                          <div style={{ fontSize: 10, color: 'var(--sp-fg-dim)' }}>
                            Equity: <strong style={{ color: player.color }}>{scenario.equity[player.position]}%</strong>
                          </div>
                        </div>
                      </div>
                      <FrequencyBar
                        actions={scenario.actions[player.position]}
                        playerColor={player.color}
                        quizMode={quizMode}
                        showAnswers={showAnswers}
                      />
                    </div>
                  ))}
                </div>

                {/* Analysis Notes (Hidden during quiz until revealed) */}
                {(!quizMode || showAnswers) && (
                  <div
                    style={{
                      background: 'rgba(251,191,36,0.05)',
                      border: '1px solid rgba(251,191,36,0.15)',
                      borderRadius: 10,
                      padding: 14,
                      marginBottom: 16,
                    }}
                  >
                    <div style={{ fontSize: 10, fontWeight: 800, color: 'var(--sp-accent-amber)', marginBottom: 6, textTransform: 'uppercase', letterSpacing: 1 }}>
                       Solver Insight
                    </div>
                    <div style={{ fontSize: 12, color: 'var(--sp-fg)', lineHeight: 1.6 }}>
                      {scenario.notes}
                    </div>
                  </div>
                )}

                {/* Reveal Solution Button */}
                {quizMode && !showAnswers && (
                  <motion.button
                    whileTap={{ scale: 0.97 }}
                    onClick={() => setShowAnswers(true)}
                    style={{
                      width: '100%',
                      marginTop: 8,
                      marginBottom: 16,
                      padding: '14px',
                      borderRadius: 10,
                      border: 'none',
                      background: 'linear-gradient(135deg, rgba(var(--sp-accent-purple-rgb), 1), #6366f1)',
                      color: '#fff',
                      fontSize: 13,
                      fontWeight: 800,
                      cursor: 'pointer',
                      boxShadow: '0 4px 20px rgba(168,85,247,0.3)',
                    }}
                  >
                     Reveal Solution
                  </motion.button>
                )}
                {quizMode && showAnswers && (
                  <div style={{ marginBottom: 16, textAlign: 'center', color: 'var(--sp-accent-green)', fontSize: 11, fontWeight: 700 }}>
                    Solution revealed. Try another scenario!
                  </div>
                )}

                <motion.button
                  onClick={() => {
                    markStudied();
                    
                    // Phase 34: Emit cross-page sync event for Dashboard
                    if (bus) {
                      bus.emitHandComplete({ gameId: 'multiway_postflop', correct: 1, ev_loss: 0 });
                      bus.emitDecisionCorrect();
                    }
                    
                    setSelectedScenario(null); 
                    setQuizMode(false);
                    setShowAnswers(false);
                  }}
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  style={{
                    width: '100%',
                    padding: '12px',
                    borderRadius: 10,
                    background: 'linear-gradient(135deg, rgba(var(--sp-accent-purple-rgb), 1), rgba(var(--sp-accent-blue-rgb), 1))',
                    color: '#fff',
                    fontSize: 13,
                    fontWeight: 700,
                    border: 'none',
                    cursor: 'pointer',
                    fontFamily: "var(--font-orbitron), 'Orbitron', monospace",
                  }}
                >
                  ✓ MARK STUDIED — NEXT SCENARIO
                </motion.button>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </>
  );
}
