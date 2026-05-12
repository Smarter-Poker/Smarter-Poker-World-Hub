/**
 * Pot Geometry Trainer — SPR Mastery & Optimal Bet Sizing
 * Phase 27 — Route: /hub/training/pot-geometry
 */
// TRAIN-CSS-TOKENS-ADOPT-7 — adoption of --sp-* token contract from PR #470
// TRAIN-CSS-MOBILE-ADOPT-11 — mobile data-attr adoption from TRAIN-CSS-MOBILE-1
// TRAIN-CSS-TOKENS-BATCH5-37 — hex sweep batch 5: literals routed to --sp-* tokens
// TRAIN-CSS-GRADIENT-ADOPT-30 — gradient hex routed to rgba(var(--sp-*-rgb), 1)
import React, { useState, useCallback, useEffect, useRef } from 'react';
import Head from 'next/head';
import { useRouter } from 'next/router';
import { motion, AnimatePresence } from 'framer-motion';
import useTrainingBus from '../../../src/hooks/useTrainingBus';
import { eventBus, EventType, busEmit } from '../../../src/engine/EventBus';
import { useTrainingFeedback } from '../../../src/hooks/useTrainingFeedback';
import BottomSheet from '../../../src/components/ui/BottomSheet';
import FeedbackCard from '../../../src/components/poker/FeedbackCard';
import QuizAnswer, { QuizAnswerStack } from '../../../src/components/poker/QuizAnswer';

// TRAIN-CSS-MOTION-ADOPT-5 — durations routed through MOTION tokens matched to
// --sp-motion-* CSS contract (TRAIN-CSS-MOTION-1). Values kept in seconds (the
// framer-motion contract) while the CSS sweep still collapses them under
// prefers-reduced-motion via the body.world-training override.
const MOTION = { fast: 0.12, standard: 0.2, slow: 0.32, glacial: 0.52 };
// TRAIN-WIRE-FX-4b — adoption: feedback hook for pot-geometry.fresh.js

// ═══════════════════════════════════════════════════════════════════════════
// SPR ENGINE
// ═══════════════════════════════════════════════════════════════════════════

function calcSPR(effectiveStack, potSize) {
  if (!potSize || potSize <= 0) return 0;
  return Math.round((effectiveStack / potSize) * 10) / 10;
}

function getSPRCategory(spr) {
  if (spr <= 1.5)
    return {
      label: 'Micro SPR',
      color: 'var(--sp-accent-red)',
      icon: '🔥',
      desc: 'All-in situations. Any pair/draw = auto-commit. Pot odds dictate decisions entirely.',
    };
  if (spr <= 4)
    return {
      label: 'Low SPR',
      color: 'var(--sp-accent-orange)',
      icon: '⚡',
      desc: 'Set-mining unfavorable. Top pair is a strong commitment hand. Raise/fold dynamics dominate.',
    };
  if (spr <= 8)
    return {
      label: 'Medium SPR',
      color: 'var(--sp-accent-amber)',
      icon: '⚖️',
      desc: 'Optimal SPR for most flop play. Top pair = strong, two pair = near commitment. Sets fully +EV.',
    };
  if (spr <= 15)
    return {
      label: 'High SPR',
      color: 'var(--sp-accent-green)',
      icon: '🎯',
      desc: 'Deep play. Sets = nut hands. Top pair = marginal at best. Implied odds make draws valuable.',
    };
  return {
    label: 'Very Deep',
    color: 'var(--sp-accent-cyan)',
    icon: '🌊',
    desc: 'Extremely deep stacks. Only nutted hands and high-equity draws have clear commitment lines.',
  };
}

function getCommitmentThreshold(spr) {
  if (spr <= 1.5) return { hand: 'Any pair or flush draw', note: 'Auto-commit at micro SPR' };
  if (spr <= 4)
    return { hand: 'Top pair top kicker+', note: 'Reduce fold equity; commitment hands only' };
  if (spr <= 8) return { hand: 'Two pair + / strong draws', note: 'Balanced bet/call strategy' };
  if (spr <= 15)
    return {
      hand: 'Sets, strong two pair',
      note: 'Implied odds games — play cautiously with TPTK',
    };
  return {
    hand: 'Straights, flushes, sets only',
    note: 'Deep play — even sets need nut potential',
  };
}

function getOptimalBets(spr, potSize) {
  const bets = [];
  if (spr <= 4) {
    bets.push({
      label: 'Pot (Commit)',
      size: Math.round(potSize),
      pct: '100%',
      note: 'Sets up all-in on flop or turn',
    });
    bets.push({
      label: 'Over-bet',
      size: Math.round(potSize * 1.3),
      pct: '130%',
      note: 'Fold equity vs draws at low SPR',
    });
  } else if (spr <= 8) {
    bets.push({
      label: 'Half Pot',
      size: Math.round(potSize * 0.5),
      pct: '50%',
      note: 'Balanced — allows 3 streets of value',
    });
    bets.push({
      label: '2/3 Pot',
      size: Math.round(potSize * 0.67),
      pct: '67%',
      note: 'Standard medium SPR sizing',
    });
    bets.push({
      label: 'Pot',
      size: Math.round(potSize),
      pct: '100%',
      note: 'Strong hands / semi-bluffs with equity',
    });
  } else {
    bets.push({
      label: '1/4 Pot',
      size: Math.round(potSize * 0.25),
      pct: '25%',
      note: 'Keep opponents in — extract thin value',
    });
    bets.push({
      label: '1/3 Pot',
      size: Math.round(potSize * 0.33),
      pct: '33%',
      note: 'Board coverage / weak range bets',
    });
    bets.push({
      label: '1/2 Pot',
      size: Math.round(potSize * 0.5),
      pct: '50%',
      note: 'Standard deep sizing with strong hands',
    });
    bets.push({
      label: '2/3 Pot',
      size: Math.round(potSize * 0.67),
      pct: '67%',
      note: 'Premium hands / bluffs vs wide ranges',
    });
  }
  return bets;
}

// ═══════════════════════════════════════════════════════════════════════════
// DRILL ENGINE
// ═══════════════════════════════════════════════════════════════════════════

const DRILL_SCENARIOS = [
  {
    stack: 200,
    pot: 15,
    street: 'Flop',
    board: 'Ks 7h 2c',
    hero: 'KQo',
    note: 'High card board with TPTK',
  },
  {
    stack: 140,
    pot: 32,
    street: 'Flop',
    board: 'As Jd 4h',
    hero: 'ATo',
    note: 'Top pair mediocre kicker',
  },
  {
    stack: 90,
    pot: 45,
    street: 'Flop',
    board: '8h 7d 6s',
    hero: '9s8s',
    note: 'Connected board with two pair',
  },
  {
    stack: 240,
    pot: 18,
    street: 'Flop',
    board: 'Td 9h 3c',
    hero: 'JJ',
    note: 'Over-pair on connected board',
  },
  {
    stack: 60,
    pot: 55,
    street: 'Turn',
    board: 'Qd 8h 3c 2s',
    hero: 'QJs',
    note: 'Short stack, top pair facing pressure',
  },
  {
    stack: 310,
    pot: 22,
    street: 'Flop',
    board: '4s 4h 2c',
    hero: 'AsKs',
    note: 'Dry board, overcards + nut flush draw',
  },
  {
    stack: 180,
    pot: 60,
    street: 'Flop',
    board: 'Kh Qd Jc',
    hero: 'Th9h',
    note: 'Straight draw on Broadway board',
  },
  {
    stack: 500,
    pot: 12,
    street: 'Flop',
    board: '7c 5d 2h',
    hero: 'AA',
    note: 'Premium hand, dry board, very deep',
  },
  {
    stack: 35,
    pot: 30,
    street: 'River',
    board: 'Ah Kd Qh Th 2s',
    hero: 'JJ',
    note: 'Straight on board, short stack river',
  },
  {
    stack: 420,
    pot: 25,
    street: 'Flop',
    board: '9s 8s 7d',
    hero: 'AsKs',
    note: 'Very wet board, overcards + nut flush draw, deep',
  },
];

function generateDrill() {
  const s = DRILL_SCENARIOS[Math.floor(Math.random() * DRILL_SCENARIOS.length)];
  const spr = calcSPR(s.stack, s.pot);
  const cat = getSPRCategory(spr);
  // BUG-08 FIX: Fisher-Yates shuffle (sort-based shuffle is biased in V8 TimSort)
  const wrongOptions = ['Micro SPR', 'Low SPR', 'Medium SPR', 'High SPR', 'Very Deep']
    .filter((o) => o !== cat.label);
  for (let i = wrongOptions.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [wrongOptions[i], wrongOptions[j]] = [wrongOptions[j], wrongOptions[i]];
  }
  const options = [...wrongOptions.slice(0, 2), cat.label];
  for (let i = options.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [options[i], options[j]] = [options[j], options[i]];
  }
  return { ...s, spr, cat, options };
}

// ═══════════════════════════════════════════════════════════════════════════
// PAGE COMPONENT
// ═══════════════════════════════════════════════════════════════════════════

export default function PotGeometry() {
  const router = useRouter();
  // TRAIN-WIRE-BOTTOMSHEET-4 — info sheet state
  const [infoOpen, setInfoOpen] = useState(false);
  useTrainingBus('pot-geometry');
  const fb = useTrainingFeedback();

  // Calculator mode
  const [stack, setStack] = useState(200);
  const [pot, setPot] = useState(40);
  const spr = calcSPR(stack, pot);
  const cat = getSPRCategory(spr);
  const commitment = getCommitmentThreshold(spr);
  const optimalBets = getOptimalBets(spr, pot);

  // Drill mode
  const [mode, setMode] = useState('calc'); // 'calc' | 'drill'
  const [drill, setDrill] = useState(null);
  const [selected, setSelected] = useState(null);
  const [showResult, setShowResult] = useState(false);
  const [streak, setStreak] = useState(0);
  const [bestStreak, setBestStreak] = useState(0);
  const [correct, setCorrect] = useState(0);
  const [total, setTotal] = useState(0);
  const streakRef = useRef(0);
  const bestRef = useRef(0);

  const nextDrill = useCallback(() => {
    setDrill(generateDrill());
    setSelected(null);
    setShowResult(false);
  }, []);

  useEffect(() => {
    if (mode === 'drill' && !drill) nextDrill();
  }, [mode, drill, nextDrill]);

  const handleAnswer = useCallback(
    (option) => {
      if (showResult || !drill) return;
      setSelected(option);
      setShowResult(true);
      const isCorrect = option === drill.cat.label;
      if (isCorrect) fb.correct(); else fb.incorrect();
      const newTotal = total + 1;
      const newCorrect = correct + (isCorrect ? 1 : 0);
      setTotal(newTotal);
      setCorrect(newCorrect);
      if (isCorrect) {
        streakRef.current += 1;
        if (streakRef.current > bestRef.current) {
          bestRef.current = streakRef.current;
          setBestStreak(streakRef.current);
        }
        setStreak(streakRef.current);
      } else {
        streakRef.current = 0;
        setStreak(0);
      }
      eventBus?.emit?.('training:session-complete', {
        game_id: 'pot-geometry',
        accuracy: Math.round((newCorrect / newTotal) * 100),
        hands_played: newTotal,
        correct_answers: newCorrect,
        total_questions: newTotal,
      });
    },
    [showResult, drill, total, correct]
  );

  const accuracy = total > 0 ? Math.round((correct / total) * 100) : 0;

  return (
    <>
      <Head>
        <title>Pot Geometry Trainer | Smarter.Poker GTO Training</title>
        <meta
          name="description"
          content="Master SPR (Stack-to-Pot Ratio) and pot geometry with a drill-based trainer and interactive calculator."
        />
        <link
          href="https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700;800&family=Orbitron:wght@700;900&display=swap"
          rel="stylesheet"
        />
      </Head>
      <div
        style={{
          minHeight: '100vh', paddingBottom: 70, width: '100%', maxWidth: '100vw', overflowX: 'hidden', boxSizing: 'border-box',
          background: 'linear-gradient(135deg,#0a0f1e 0%,#0d1629 60%,#0a0f1e 100%)',
          color: 'var(--sp-fg)',
          fontFamily: "'Inter',sans-serif",
        }}
      >
        <BottomSheet
          open={infoOpen}
          onClose={() => setInfoOpen(false)}
          title="How Pot Geometry Works"
          subtitle="Bet sizing and SPR planning"
        >
          <div style={{ padding: '0 4px', color: 'var(--sp-fg)', fontSize: 13, lineHeight: 1.6 }}>
            <p style={{ marginTop: 0 }}>
              Pot geometry is about planning the SPR you want to face on later
              streets given today's bet sizing. Smaller bets keep SPR high and
              preserve future bluffing leverage. Bigger bets shrink SPR so you
              can profitably stack off on the river with your value range.
            </p>
            <p>
              Each spot presents a board, stacks, and a target. Pick the bet
              size that lands you at the right SPR on the next street so your
              value range can comfortably commit and your bluffs still have
              room to run. The solver answer plus EV-loss surfaces after each
              attempt.
            </p>
            <p>
              Aim for sub-1 BB EV loss across a full session before stepping
              up to wider or deeper stack configurations.
            </p>
          </div>
        </BottomSheet>

        {/* Header */}
        <div
          style={{ padding: '20px 24px 14px', borderBottom: '1px solid rgba(255,255,255,0.06)' }}
        >
          <div data-pills-row style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
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
            <button
              onClick={() => setInfoOpen(true)}
              aria-label="How Pot Geometry works"
              style={{
                background: 'rgba(249,115,22,0.10)',
                border: '1px solid rgba(249,115,22,0.30)',
                color: 'var(--sp-accent-orange)',
                fontSize: 11,
                fontWeight: 700,
                padding: '6px 12px',
                borderRadius: 12,
                cursor: 'pointer',
                letterSpacing: 0.4,
                textTransform: 'uppercase',
              }}
            >
              How it works
            </button>
            <h1
              style={{
                fontSize: 20,
                fontWeight: 800,
                margin: 0,
                background: 'linear-gradient(135deg,rgba(var(--sp-accent-orange-rgb), 1),#eab308)',
                WebkitBackgroundClip: 'text',
                WebkitTextFillColor: 'transparent',
                fontFamily: "'Orbitron',monospace",
              }}
            >
              Pot Geometry
            </h1>
            <span
              style={{
                fontSize: 10,
                color: 'var(--sp-accent-orange)',
                background: 'rgba(249,115,22,0.1)',
                padding: '3px 8px',
                borderRadius: 12,
                fontWeight: 700,
                border: '1px solid rgba(249,115,22,0.25)',
                fontFamily: "'Orbitron',monospace",
              }}
            >
              PHASE 27
            </span>
          </div>
          {/* Mode Tabs */}
          <div style={{ display: 'flex', gap: 6, marginTop: 12 }}>
            {[
              { id: 'calc', label: '📐 Calculator' },
              { id: 'drill', label: '🎯 SPR Drills' },
            ].map((m) => (
              <button
                key={m.id}
                onClick={() => {
                  setMode(m.id);
                  if (m.id === 'drill') nextDrill();
                }}
                style={{
                  padding: '7px 16px',
                  borderRadius: 8,
                  fontSize: 12,
                  fontWeight: 700,
                  cursor: 'pointer',
                  border: 'none',
                  background:
                    mode === m.id
                      ? 'linear-gradient(135deg,rgba(var(--sp-accent-orange-rgb), 1),#eab308)'
                      : 'rgba(255,255,255,0.06)',
                  color: mode === m.id ? '#000' : 'var(--sp-fg-muted)',
                  fontFamily: "'Orbitron',monospace",
                }}
              >
                {m.label}
              </button>
            ))}
          </div>
        </div>

        <div style={{ padding: '16px 24px', maxWidth: 680, margin: '0 auto' }}>
          {/* === CALCULATOR MODE === */}
          {mode === 'calc' && (
            <>
              {/* Inputs */}
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: '1fr 1fr',
                  gap: 12,
                  marginBottom: 16,
                }}
              >
                {[
                  { label: 'Effective Stack (BB)', value: stack, set: setStack, min: 1 },
                  { label: 'Pot Size (BB)', value: pot, set: setPot, min: 1 },
                ].map((inp) => (
                  <div
                    key={inp.label}
                    style={{
                      background: 'rgba(255,255,255,0.03)',
                      border: '1px solid rgba(255,255,255,0.07)',
                      borderRadius: 12,
                      padding: '14px 16px',
                    }}
                  >
                    <label
                      style={{
                        fontSize: 9,
                        fontWeight: 700,
                        color: 'var(--sp-fg-dim)',
                        textTransform: 'uppercase',
                        letterSpacing: 1,
                        display: 'block',
                        marginBottom: 8,
                        fontFamily: "'Orbitron',monospace",
                      }}
                    >
                      {inp.label}
                    </label>
                    <input
                      type="number"
                      value={inp.value}
                      min={inp.min}
                      onChange={(e) => inp.set(Math.max(inp.min, parseInt(e.target.value, 10) || 1))}
                      style={{
                        width: '100%',
                        boxSizing: 'border-box',
                        background: 'rgba(255,255,255,0.06)',
                        border: '1px solid rgba(255,255,255,0.12)',
                        borderRadius: 8,
                        padding: '10px 12px',
                        color: 'var(--sp-fg)',
                        fontSize: 20,
                        fontWeight: 800,
                        outline: 'none',
                        fontFamily: "'Orbitron',monospace",
                      }}
                    />
                  </div>
                ))}
              </div>

              {/* SPR Result */}
              <motion.div
                key={spr}
                initial={{ scale: 0.95, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={{ duration: MOTION.standard }}
                style={{
                  background: `linear-gradient(135deg,${cat.color}18,${cat.color}08)`,
                  border: `2px solid ${cat.color}40`,
                  borderRadius: 16,
                  padding: '20px 24px',
                  marginBottom: 16,
                  textAlign: 'center',
                }}
              >
                <div
                  style={{
                    fontSize: 48,
                    fontWeight: 900,
                    color: cat.color,
                    fontFamily: "'Orbitron',monospace",
                    lineHeight: 1,
                  }}
                >
                  {(Number.isFinite(Number(spr)) ? Number(spr) : 0).toFixed(1)}
                </div>
                <div
                  style={{
                    fontSize: 11,
                    color: 'var(--sp-fg-dim)',
                    fontWeight: 700,
                    textTransform: 'uppercase',
                    letterSpacing: 1.5,
                    marginBottom: 8,
                  }}
                >
                  SPR (Stack / Pot)
                </div>
                <div
                  style={{
                    fontSize: 14,
                    fontWeight: 800,
                    color: cat.color,
                    fontFamily: "'Orbitron',monospace",
                    marginBottom: 8,
                  }}
                >
                  {cat.icon} {cat.label}
                </div>
                <p style={{ fontSize: 12, color: 'var(--sp-fg-muted)', lineHeight: 1.6, margin: 0 }}>
                  {cat.desc}
                </p>
              </motion.div>

              {/* Commitment Threshold */}
              <div
                style={{
                  background: 'rgba(255,255,255,0.03)',
                  border: '1px solid rgba(255,255,255,0.07)',
                  borderRadius: 12,
                  padding: '14px 16px',
                  marginBottom: 14,
                }}
              >
                <div
                  style={{
                    fontSize: 9,
                    fontWeight: 700,
                    color: 'var(--sp-fg-dim)',
                    textTransform: 'uppercase',
                    letterSpacing: 1,
                    marginBottom: 8,
                    fontFamily: "'Orbitron',monospace",
                  }}
                >
                  Commitment Threshold
                </div>
                <div style={{ fontSize: 14, fontWeight: 800, color: 'var(--sp-accent-amber)', marginBottom: 4 }}>
                  {commitment.hand}
                </div>
                <div style={{ fontSize: 11, color: 'var(--sp-fg-muted)' }}>{commitment.note}</div>
              </div>

              {/* Optimal Bet Sizes */}
              <div
                style={{
                  background: 'rgba(255,255,255,0.03)',
                  border: '1px solid rgba(255,255,255,0.07)',
                  borderRadius: 12,
                  padding: '14px 16px',
                  marginBottom: 16,
                }}
              >
                <div
                  style={{
                    fontSize: 9,
                    fontWeight: 700,
                    color: 'var(--sp-fg-dim)',
                    textTransform: 'uppercase',
                    letterSpacing: 1,
                    marginBottom: 10,
                    fontFamily: "'Orbitron',monospace",
                  }}
                >
                  Optimal Bet Sizes at this SPR
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {optimalBets.map((b, i) => (
                    <div
                      key={i}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 10,
                        padding: '8px 10px',
                        background: 'rgba(249,115,22,0.06)',
                        border: '1px solid rgba(249,115,22,0.15)',
                        borderRadius: 8,
                      }}
                    >
                      <span
                        style={{
                          fontSize: 11,
                          fontWeight: 800,
                          color: 'var(--sp-accent-orange)',
                          minWidth: 70,
                          fontFamily: "'Orbitron',monospace",
                        }}
                      >
                        {b.pct}
                      </span>
                      <span
                        style={{ fontSize: 12, fontWeight: 700, color: 'var(--sp-accent-amber)', minWidth: 60 }}
                      >
                        {b.size} BB
                      </span>
                      <span style={{ fontSize: 11, color: 'var(--sp-fg-muted)', flex: 1 }}>
                        {b.label} — {b.note}
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              {/* About */}
              <div
                style={{
                  padding: '12px 16px',
                  background: 'rgba(255,255,255,0.02)',
                  borderRadius: 10,
                  border: '1px solid rgba(255,255,255,0.05)',
                }}
              >
                <div
                  style={{
                    fontSize: 9,
                    fontWeight: 700,
                    color: 'var(--sp-fg-dim)',
                    textTransform: 'uppercase',
                    letterSpacing: 1,
                    marginBottom: 6,
                    fontFamily: "'Orbitron',monospace",
                  }}
                >
                  What is SPR?
                </div>
                <p style={{ fontSize: 11, color: 'var(--sp-fg-muted)', lineHeight: 1.6, margin: 0 }}>
                  Stack-to-Pot Ratio (SPR) = Effective Stack ÷ Pot Size at flop. SPR determines your
                  commitment threshold: how strong a hand you need to put all your chips in. Low SPR
                  = commit with top pair. High SPR = need two pair or better. Mastering SPR lets you
                  plan entire hand trees before you bet.
                </p>
              </div>
            </>
          )}

          {/* === DRILL MODE === */}
          {mode === 'drill' && (
            <>
              {/* Stats */}
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(4,1fr)',
                  gap: 8,
                  marginBottom: 14,
                }}
              >
                {[
                  {
                    label: 'Accuracy',
                    value: `${accuracy}%`,
                    color: accuracy >= 70 ? 'var(--sp-accent-green)' : 'var(--sp-accent-red)',
                  },
                  { label: 'Correct', value: correct, color: 'var(--sp-accent-green)' },
                  { label: 'Streak', value: streak, color: 'var(--sp-accent-purple)' },
                  { label: 'Best', value: bestStreak, color: 'var(--sp-accent-cyan)' },
                ].map((s) => (
                  <div
                    key={s.label}
                    style={{
                      background: 'rgba(255,255,255,0.03)',
                      border: '1px solid rgba(255,255,255,0.07)',
                      borderRadius: 10,
                      padding: '10px 8px',
                      textAlign: 'center',
                    }}
                  >
                    <div
                      style={{
                        fontSize: 18,
                        fontWeight: 900,
                        color: s.color,
                        fontFamily: "'Orbitron',monospace",
                      }}
                    >
                      {s.value}
                    </div>
                    <div
                      style={{
                        fontSize: 9,
                        color: 'var(--sp-fg-dim)',
                        fontWeight: 700,
                        textTransform: 'uppercase',
                        letterSpacing: 0.5,
                      }}
                    >
                      {s.label}
                    </div>
                  </div>
                ))}
              </div>

              {/* Drill Card */}
              <AnimatePresence mode="wait">
                {drill && (
                  <motion.div
                    key={drill.stack + drill.pot}
                    initial={{ opacity: 0, y: 16 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -16 }}
                    transition={{ duration: MOTION.standard }}
                  >
                    {/* Scenario */}
                    <div
                      style={{
                        background: 'rgba(255,255,255,0.03)',
                        border: '1px solid rgba(255,255,255,0.08)',
                        borderRadius: 14,
                        padding: '20px',
                        marginBottom: 14,
                      }}
                    >
                      <div
                        style={{
                          fontSize: 9,
                          fontWeight: 700,
                          color: 'var(--sp-accent-orange)',
                          textTransform: 'uppercase',
                          letterSpacing: 1.5,
                          marginBottom: 12,
                          fontFamily: "'Orbitron',monospace",
                        }}
                      >
                        {drill.street} · {drill.board}
                      </div>
                      <div
                        style={{
                          display: 'grid',
                          gridTemplateColumns: 'repeat(3,1fr)',
                          gap: 8,
                          marginBottom: 12,
                        }}
                      >
                        {[
                          { label: 'Hero Hand', value: drill.hero, color: 'var(--sp-accent-orange)' },
                          { label: 'Eff. Stack', value: `${drill.stack}BB`, color: 'var(--sp-accent-cyan)' },
                          { label: 'Pot Size', value: `${drill.pot}BB`, color: 'var(--sp-accent-amber)' },
                        ].map((s) => (
                          <div key={s.label} style={{ textAlign: 'center' }}>
                            <div
                              style={{
                                fontSize: 16,
                                fontWeight: 900,
                                color: s.color,
                                fontFamily: "'Orbitron',monospace",
                              }}
                            >
                              {s.value}
                            </div>
                            <div
                              style={{
                                fontSize: 9,
                                color: 'var(--sp-fg-dim)',
                                fontWeight: 700,
                                textTransform: 'uppercase',
                                letterSpacing: 0.5,
                              }}
                            >
                              {s.label}
                            </div>
                          </div>
                        ))}
                      </div>
                      <div
                        style={{
                          fontSize: 11,
                          color: 'var(--sp-fg-dim)',
                          textAlign: 'center',
                          fontStyle: 'italic',
                        }}
                      >
                        {drill.note}
                      </div>
                    </div>

                    {/* Question */}
                    <div
                      style={{
                        fontSize: 15,
                        fontWeight: 700,
                        color: 'var(--sp-fg)',
                        textAlign: 'center',
                        marginBottom: 12,
                      }}
                    >
                      What is the SPR category for this spot?
                    </div>

                    {/* TRAIN-WIRE-QUIZ-ANSWER-2 — options via shared QuizAnswer */}
                    <QuizAnswerStack gap={8} maxWidth={undefined} style={{ marginBottom: 14 }}>
                      {drill.options.map((opt, idx) => (
                        <QuizAnswer
                          key={opt}
                          label={opt}
                          shortcut={idx + 1}
                          selected={selected === opt}
                          correct={opt === drill.cat.label}
                          show={showResult}
                          onClick={() => handleAnswer(opt)}
                          size="md"
                        />
                      ))}
                    </QuizAnswerStack>

                    {/* TRAIN-WIRE-FEEDBACK-V2-4 — verdict band via shared FeedbackCard (compact) */}
                    <AnimatePresence>
                      {showResult && (
                        <motion.div
                          initial={{ opacity: 0, y: 8 }}
                          animate={{ opacity: 1, y: 0 }}
                          exit={{ opacity: 0 }}
                          style={{ marginBottom: 14 }}
                        >
                          <FeedbackCard
                            verdict={selected === drill.cat.label ? 'correct' : 'incorrect'}
                            userAction={selected || ''}
                            solverAction={drill.cat.label}
                            evLoss={0}
                            whyShort={drill.cat.desc}
                            compact
                          />
                        </motion.div>
                      )}
                    </AnimatePresence>

                    {showResult && (
                      <button
                        onClick={nextDrill}
                        style={{
                          width: '100%',
                          padding: '14px',
                          borderRadius: 12,
                          background: 'linear-gradient(135deg,rgba(var(--sp-accent-orange-rgb), 1),#eab308)',
                          border: 'none',
                          color: '#000',
                          fontWeight: 900,
                          fontSize: 14,
                          cursor: 'pointer',
                          fontFamily: "'Orbitron',monospace",
                        }}
                      >
                        NEXT SCENARIO →
                      </button>
                    )}
                  </motion.div>
                )}
              </AnimatePresence>
            </>
          )}
        </div>
      </div>
    </>
  );
}