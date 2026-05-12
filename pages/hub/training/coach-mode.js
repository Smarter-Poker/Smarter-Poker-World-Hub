/**
 * COACH MODE — Guided Lesson Plans
 * ═══════════════════════════════════════════════════════════════════════════
 * Step-by-step guided lessons with concept explanations and mini-quizzes.
 *
 * Route: /hub/training/coach-mode
 * ═══════════════════════════════════════════════════════════════════════════
 */

// TRAIN-CSS-MOBILE-ADOPT-16 — mobile data-attr long-tail adoption from TRAIN-CSS-MOBILE-1
// TRAIN-CSS-TOKENS-BATCH5-6 — hex sweep batch 5: literals routed to --sp-* tokens
// TRAIN-CSS-GRADIENT-ADOPT-6 — gradient hex routed to rgba(var(--sp-*-rgb), 1)
import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import Head from 'next/head';
import { useRouter } from 'next/router';
import useTrainingBus from '../../../src/hooks/useTrainingBus';
import { eventBus, EventType } from '../../../src/engine/EventBus';


// BUG FIX (TRAIN-COACH-A11Y-1): SVG icon components replacing the
// coach-mode emoji set across LESSONS data (positions / three-bet /
// 🧮 preflop-math / 🎯 cbet / 🔄 turn / 🏁 river), results screen
// (🏆 / 👍 / 💪 based on score), completion ✅, and ← back arrow. Card-
// suit glyphs (♠♣♥♦) in quiz options remain (semantic). Same surface-
// specific a11y pattern as PR #320/#322/#324/#327-#343.
const ICON_PROPS = {
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 2,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
  'aria-hidden': true,
};
function _Svg({ size=20, vb='0 0 24 24', children }) {
  return <svg {...ICON_PROPS} width={size} height={size} viewBox={vb}>{children}</svg>;
}
function CrownIcon({ size=20 })   { return <_Svg size={size}><path d="M2 7l5 5 5-9 5 9 5-5-2 12H4L2 7z"/><path d="M4 19h16"/></_Svg>; }
function BoltIcon({ size=20 })    { return <_Svg size={size}><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></_Svg>; }
function AbacusIcon({ size=20 })  { return <_Svg size={size}><rect x="3" y="3" width="18" height="18" rx="2"/><line x1="3" y1="9" x2="21" y2="9"/><line x1="3" y1="15" x2="21" y2="15"/><circle cx="7" cy="6" r="1"/><circle cx="11" cy="6" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="16" cy="12" r="1"/><circle cx="9" cy="18" r="1"/></_Svg>; }
function TargetIcon({ size=20 })  { return <_Svg size={size}><circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/></_Svg>; }
function RotateIcon({ size=20 })  { return <_Svg size={size}><polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10"/><path d="M20.49 15a9 9 0 0 1-14.85 3.36L1 14"/></_Svg>; }
function FlagIcon({ size=20 })    { return <_Svg size={size}><path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z"/><line x1="4" y1="22" x2="4" y2="15"/></_Svg>; }
function TrophyIcon({ size=48 })  { return <_Svg size={size}><path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6"/><path d="M18 9h1.5a2.5 2.5 0 0 0 0-5H18"/><path d="M4 22h16"/><path d="M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20.24 7 22"/><path d="M14 14.66V17c0 .55.47.98.97 1.21C16.15 18.75 17 20.24 17 22"/><path d="M18 2H6v7a6 6 0 0 0 12 0V2z"/></_Svg>; }
function ThumbsUpIcon({ size=48 }){ return <_Svg size={size}><path d="M7 10v12"/><path d="M15 5.88 14 10h5.83a2 2 0 0 1 1.92 2.56l-2.33 8A2 2 0 0 1 17.5 22H7V10l4-8c1.7 0 3 1.3 3 3v.88z"/></_Svg>; }
function FlexIcon({ size=48 })    { return <_Svg size={size}><path d="M3 12c2-4 5-6 9-6 4 0 7 3 8 7 0 3-2 5-5 5h-2c-2 0-4-1-5-3l-5-3z"/></_Svg>; }
function CheckIcon({ size=16 })   { return <_Svg size={size}><polyline points="20 6 9 17 4 12"/></_Svg>; }
function BackArrowIcon({ size=18 }){ return <_Svg size={size}><line x1="19" y1="12" x2="5" y2="12"/><polyline points="12 19 5 12 12 5"/></_Svg>; }
function LessonIcon({ kind, size=20 }) {
  switch (kind) {
    case 'crown':  return <CrownIcon size={size}/>;
    case 'bolt':   return <BoltIcon size={size}/>;
    case 'abacus': return <AbacusIcon size={size}/>;
    case 'target': return <TargetIcon size={size}/>;
    case 'rotate': return <RotateIcon size={size}/>;
    case 'flag':   return <FlagIcon size={size}/>;
    default:       return <TargetIcon size={size}/>;
  }
}
function ScoreIcon({ score, total, size=48 }) {
  const pct = total > 0 ? score / total : 0;
  if (pct >= 0.8 || score >= 4) return <TrophyIcon size={size}/>;
  if (pct >= 0.6 || score >= 3) return <ThumbsUpIcon size={size}/>;
  return <FlexIcon size={size}/>;
}

const LESSONS = [
  {
    id: 'preflop-basics',
    name: 'Preflop Basics',
    iconKind: 'crown',
    icon: '🃏',
    color: 'var(--sp-accent-blue)',
    desc: 'Open ranges, positions, and sizing fundamentals',
    concepts: [
      'In 6-max poker, there are 6 positions: UTG, HJ, CO, BTN, SB, BB. Each has a different opening range — tighter from early position, wider from late.',
      'The standard open raise is 2.5x the Big-Blind from any position. Do NOT vary your sizing based on hand strength — this gives away information.',
      'Your BTN opening range should be ~45% of hands. Your UTG range should be ~15%. This asymmetry exists because of positional advantage.',
    ],
    quiz: [
      { q: 'What is the standard open raise size?', opts: ['2x', '2.5x', '3x', '4x'], answer: 1 },
      { q: 'Which position opens the widest range?', opts: ['UTG', 'HJ', 'CO', 'BTN'], answer: 3 },
      {
        q: 'Approximately what % of hands should UTG open?',
        opts: ['5%', '15%', '30%', '45%'],
        answer: 1,
      },
      {
        q: 'Should you vary open raise size by hand strength?',
        opts: [
          'Yes, raise bigger with AA',
          'No, use consistent sizing',
          'Only with premium hands',
          'Depends on opponent',
        ],
        answer: 1,
      },
      {
        q: 'What advantage does BTN have?',
        opts: ['Bigger stack', 'Position (acts last postflop)', 'Better cards', 'More time'],
        answer: 1,
      },
    ],
  },
  {
    id: 'three-bet',
    name: '3-Bet Strategy',
    iconKind: 'bolt',
    icon: '⚡',
    color: 'var(--sp-accent-purple)',
    desc: 'When and how to re-raise preflop',
    concepts: [
      "A 3-bet is a re-raise over an initial open raise. It's the most powerful preflop weapon for building pots with strong hands and isolating players.",
      'Your 3-bet range should be polarized: premium value hands (AA, KK, QQ, AK) and bluffs (suited aces like A5s, A4s). Avoid 3-betting medium hands.',
      'Standard 3-bet sizing: 3x the open in position, 3.5-4x out of position. The extra OOP sizing compensates for positional disadvantage.',
    ],
    quiz: [
      {
        q: 'What type of range should your 3-bet be?',
        opts: ['Linear', 'Polarized', 'Merged', 'Random'],
        answer: 1,
      },
      { q: 'Which hand is a good 3-bet bluff?', opts: ['KJo', 'A5s', 'QTo', '87o'], answer: 1 },
      {
        q: 'What is the standard IP 3-bet size?',
        opts: ['2x the open', '3x the open', '4x the open', 'Pot-sized'],
        answer: 1,
      },
      {
        q: 'Why 3-bet larger OOP?',
        opts: [
          'To scare opponents',
          'Compensate for positional disadvantage',
          'Bigger pot = more money',
          'It is a bluff',
        ],
        answer: 1,
      },
      {
        q: 'Should you 3-bet KJo for value?',
        opts: [
          'Yes, always',
          'Only vs loose openers',
          'No, it plays better as a call',
          'Only from SB',
        ],
        answer: 2,
      },
    ],
  },
  {
    id: 'cbet-basics',
    name: 'C-Bet Fundamentals',
    iconKind: 'target',
    icon: '🎯',
    color: 'var(--sp-accent-green)',
    desc: 'When to continuation bet and sizing selection',
    concepts: [
      "A continuation bet (c-bet) is a bet by the preflop raiser on the flop. It's profitable because you have range advantage on most boards as the preflop aggressor.",
      'C-bet at high frequency on dry boards (K-7-2 rainbow). C-bet less on wet boards (J-T-9 two-tone) where defender has many strong hands.',
      'Two main c-bet sizes: small (33% pot) for high frequency on dry boards, large (66-75%) for selective betting on wet boards with strong hands.',
    ],
    quiz: [
      {
        q: 'On which board should you c-bet most often?',
        opts: ['J♠T♥9♦', 'K♣7♦2♠', '8♠7♠6♠', 'Q♥J♥T♣'],
        answer: 1,
      },
      {
        q: 'What is a "small c-bet" size?',
        opts: ['10% pot', '33% pot', '75% pot', 'Pot-sized'],
        answer: 1,
      },
      {
        q: 'Why does the preflop raiser have range advantage?',
        opts: [
          'They bet first',
          'Their range is stronger on most boards',
          'They have more chips',
          'They have position',
        ],
        answer: 1,
      },
      {
        q: 'When should you use a large c-bet?',
        opts: ['Always', 'On dry boards', 'On wet boards with strong hands', 'When bluffing'],
        answer: 2,
      },
      {
        q: 'Should you c-bet every flop?',
        opts: [
          'Yes, always',
          'No, check some boards especially wet ones',
          'Only with pairs or better',
          'Only in position',
        ],
        answer: 1,
      },
    ],
  },
  {
    id: 'pot-odds',
    name: 'Pot Odds & MDF',
    iconKind: 'abacus',
    icon: '🧮',
    color: 'var(--sp-accent-amber)',
    desc: 'The math behind calling and defense decisions',
    concepts: [
      'Pot odds = bet size / (pot + bet size). A half-pot bet gives 25% odds, meaning you need 25% equity to break even on a call.',
      'MDF (Minimum Defense Frequency) = 1 - (bet / (pot + bet)). Against a pot-sized bet, you must defend 50% of your range to prevent auto-profit.',
      'The Rule of 2 and 4: multiply your outs by 4 on the flop (2 cards to come) or by 2 on the turn (1 card) for approximate equity.',
    ],
    quiz: [
      {
        q: 'What equity do you need to call a half-pot bet?',
        opts: ['20%', '25%', '33%', '50%'],
        answer: 1,
      },
      { q: 'What is MDF against a pot-sized bet?', opts: ['33%', '50%', '67%', '75%'], answer: 1 },
      {
        q: 'You have 9 outs on the flop (2 cards to come). Approx equity?',
        opts: ['18%', '27%', '36%', '45%'],
        answer: 2,
      },
      {
        q: 'You have 9 outs on the turn (1 card). Approx equity?',
        opts: ['9%', '18%', '27%', '36%'],
        answer: 1,
      },
      { q: 'A flush draw has how many outs?', opts: ['4', '8', '9', '15'], answer: 2 },
    ],
  },
  {
    id: 'turn-play',
    name: 'Turn Strategy',
    iconKind: 'rotate',
    icon: '🔄',
    color: 'var(--sp-accent-cyan)',
    desc: 'Second barrel decisions and range evolution',
    concepts: [
      'The turn is where the pot grows significantly. Betting 66% pot on the turn after a 33% flop c-bet means the pot is now 3x the original flop size.',
      'Double barrel on turns that improve your range. Overcards, completing draws, and paired boards favor the preflop aggressor.',
      'Check back medium-strength hands like top pair weak kicker. These hands have showdown value but cannot handle aggression well.',
    ],
    quiz: [
      {
        q: 'When should you double barrel the turn?',
        opts: [
          'Always',
          'When the card improves your range',
          'Only with the nuts',
          'Never, always check',
        ],
        answer: 1,
      },
      {
        q: 'What should you do with top pair weak kicker on the turn?',
        opts: ['Bet big', 'Check back', 'Go all-in', 'Fold'],
        answer: 1,
      },
      {
        q: 'An overcard on the turn generally favors:',
        opts: ['The caller', 'The preflop raiser', 'Neither player', 'The Big-Blind'],
        answer: 1,
      },
      {
        q: 'Why does the pot grow fast on the turn?',
        opts: ['Blinds increase', 'Geometric betting compounds', 'Antes kick in', 'More players'],
        answer: 1,
      },
      {
        q: 'A turn card that pairs the board favors:',
        opts: ['The caller', 'Both equally', 'The preflop aggressor', 'Neither'],
        answer: 2,
      },
    ],
  },
  {
    id: 'river-play',
    name: 'River Mastery',
    iconKind: 'flag',
    icon: '🏁',
    color: 'var(--sp-accent-red)',
    desc: 'Final street value bets, bluffs, and river decisions',
    concepts: [
      'On the river, hands have fixed equity — no more draws. Your range should be polarized: bet with very strong hands (value) and some bluffs, check medium hands.',
      'Value bet sizing on the river should be based on how wide your opponent will call. Larger bets get called by narrower ranges but extract more per call.',
      'Optimal bluff-to-value ratio depends on your bet size. For a pot-sized bet, you should bluff 1 hand for every 2 value hands (33% bluffs in your betting range).',
    ],
    quiz: [
      {
        q: 'What type of range should you bet with on the river?',
        opts: ['Linear', 'Merged', 'Polarized', 'Only value'],
        answer: 2,
      },
      {
        q: 'With medium-strength hands on the river, you should:',
        opts: ['Always bet', 'Check and call/fold', 'Always fold', 'Go all-in'],
        answer: 1,
      },
      {
        q: 'For a pot-sized river bet, what % of your bets should be bluffs?',
        opts: ['0%', '25%', '33%', '50%'],
        answer: 2,
      },
      {
        q: 'Why do hands have fixed equity on the river?',
        opts: [
          'All chips are committed',
          'No more cards to come',
          'Position is irrelevant',
          'Pot odds change',
        ],
        answer: 1,
      },
      {
        q: 'A larger river bet gets called by:',
        opts: ['A wider range', 'A narrower range', 'The same range', 'Only premium hands'],
        answer: 1,
      },
    ],
  },
];

export default function CoachModePage() {
  const router = useRouter();
  useTrainingBus('coach-mode');
  const [activeLesson, setActiveLesson] = useState(null);
  const [step, setStep] = useState(0); // 0..concepts.length = concepts, then quiz
  const [quizIdx, setQuizIdx] = useState(0);
  const [selected, setSelected] = useState(null);
  const [score, setScore] = useState(0);
  const [completed, setCompleted] = useState(new Set());

  useEffect(() => {
    try {
      const saved = localStorage.getItem('coach-completed');
      if (saved) setCompleted(new Set(JSON.parse(saved)));
    } catch (e) { console.warn('[App] Handled exception:', e); }
  }, []);

  useEffect(() => {
    const h = () => {};
    const unsub = eventBus.on(EventType?.SESSION_END || 'training:session-complete', h);
    return () => unsub();
  }, []);

  const startLesson = (lesson) => {
    setActiveLesson(lesson);
    setStep(0);
    setQuizIdx(0);
    setSelected(null);
    setScore(0);
  };

  const handleAnswer = (idx) => {
    if (selected !== null) return;
    setSelected(idx);
    if (idx === activeLesson.quiz[quizIdx].answer) setScore((s) => s + 1);
  };

  const nextQuizQuestion = () => {
    if (quizIdx < activeLesson.quiz.length - 1) {
      setQuizIdx(quizIdx + 1);
      setSelected(null);
    } else {
      // Complete
      const next = new Set(completed);
      next.add(activeLesson.id);
      setCompleted(next);
      try {
        localStorage.setItem('coach-completed', JSON.stringify([...next]));
      } catch (e) { console.warn('[App] Handled exception:', e); }
      setStep(activeLesson.concepts.length + 1); // results
    }
  };

  // Lesson view
  if (activeLesson) {
    const isConceptPhase = step < activeLesson.concepts.length;
    const isQuizPhase = step === activeLesson.concepts.length;
    const isResults = step > activeLesson.concepts.length;

    return (
      <>
        <Head>
          <title>{activeLesson.name} | Coach Mode</title>
        </Head>
        <div
          style={{
            minHeight: '100vh', paddingBottom: 70, width: '100%', maxWidth: '100vw', overflowX: 'hidden', boxSizing: 'border-box',
            background: 'linear-gradient(180deg, #0a0a1a 0%, #0f172a 50%, #0a0a1a 100%)',
            color: 'var(--sp-fg)',
            fontFamily: "'Inter', -apple-system, sans-serif",
          }}
        >
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
              type="button"
              aria-label="Back to lesson list"
              onClick={() => setActiveLesson(null)}
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
              <div style={{ fontSize: 16, fontWeight: 700 }}>{activeLesson.name}</div>
              <div style={{ fontSize: 11, color: 'var(--sp-fg-dim)' }}>
                {isConceptPhase
                  ? `Concept ${step + 1}/${activeLesson.concepts.length}`
                  : isQuizPhase
                    ? `Quiz ${quizIdx + 1}/${activeLesson.quiz.length}`
                    : 'Complete'}
              </div>
            </div>
          </div>
          <div style={{ padding: '20px 16px', maxWidth: 600, margin: '0 auto' }}>
            {/* Progress Bar */}
            <div
              style={{
                height: 4,
                borderRadius: 2,
                background: 'rgba(255,255,255,0.05)',
                marginBottom: 24,
                overflow: 'hidden',
              }}
            >
              <motion.div
                animate={{
                  width: `${((isConceptPhase ? step : activeLesson.concepts.length + quizIdx) / (activeLesson.concepts.length + activeLesson.quiz.length)) * 100}%`,
                }}
                style={{
                  height: '100%',
                  background: `linear-gradient(90deg, ${activeLesson.color}, ${activeLesson.color}88)`,
                  borderRadius: 2,
                }}
              />
            </div>

            {isConceptPhase && (
              <motion.div key={step} initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }}>
                <div
                  style={{
                    padding: '24px 20px',
                    borderRadius: 16,
                    background: `${activeLesson.color}08`,
                    border: `1px solid ${activeLesson.color}15`,
                    marginBottom: 20,
                  }}
                >
                  <div
                    style={{
                      fontSize: 10,
                      fontWeight: 700,
                      color: activeLesson.color,
                      textTransform: 'uppercase',
                      letterSpacing: 1,
                      marginBottom: 10,
                    }}
                  >
                    CONCEPT {step + 1}
                  </div>
                  <div style={{ fontSize: 14, color: 'var(--sp-fg)', lineHeight: 1.7 }}>
                    {activeLesson.concepts[step]}
                  </div>
                </div>
                <motion.button
                  whileTap={{ scale: 0.97 }}
                  onClick={() => setStep(step + 1)}
                  style={{
                    width: '100%',
                    padding: '14px',
                    borderRadius: 12,
                    border: 'none',
                    background: `linear-gradient(135deg, ${activeLesson.color}, ${activeLesson.color}aa)`,
                    color: '#fff',
                    fontSize: 14,
                    fontWeight: 800,
                    cursor: 'pointer',
                  }}
                >
                  {step < activeLesson.concepts.length - 1 ? 'Next Concept' : 'Start Quiz'}
                </motion.button>
              </motion.div>
            )}

            {isQuizPhase && activeLesson.quiz[quizIdx] && (
              <motion.div
                key={quizIdx}
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
              >
                <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 16, lineHeight: 1.5 }}>
                  {activeLesson.quiz[quizIdx].q}
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 16 }}>
                  {activeLesson.quiz[quizIdx].opts.map((opt, i) => (
                    <motion.button
                      key={i}
                      whileTap={selected === null ? { scale: 0.98 } : {}}
                      onClick={() => handleAnswer(i)}
                      style={{
                        padding: '14px 16px',
                        borderRadius: 10,
                        textAlign: 'left',
                        border: `1px solid ${selected === null ? 'rgba(255,255,255,0.08)' : i === activeLesson.quiz[quizIdx].answer ? 'rgba(34,197,94,0.3)' : selected === i ? 'rgba(239,68,68,0.3)' : 'rgba(255,255,255,0.04)'}`,
                        background:
                          selected === null
                            ? 'rgba(0,0,0,0.2)'
                            : i === activeLesson.quiz[quizIdx].answer
                              ? 'rgba(34,197,94,0.08)'
                              : selected === i
                                ? 'rgba(239,68,68,0.08)'
                                : 'rgba(0,0,0,0.1)',
                        color:
                          selected === null
                            ? 'var(--sp-fg)'
                            : i === activeLesson.quiz[quizIdx].answer
                              ? 'var(--sp-accent-green)'
                              : selected === i
                                ? 'var(--sp-accent-red)'
                                : 'var(--sp-fg-faint)',
                        fontSize: 13,
                        fontWeight: 600,
                        cursor: selected === null ? 'pointer' : 'default',
                      }}
                    >
                      {opt}
                    </motion.button>
                  ))}
                </div>
                {selected !== null && (
                  <motion.button
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    whileTap={{ scale: 0.97 }}
                    onClick={nextQuizQuestion}
                    style={{
                      width: '100%',
                      padding: '14px',
                      borderRadius: 12,
                      border: 'none',
                      background: `linear-gradient(135deg, ${activeLesson.color}, ${activeLesson.color}aa)`,
                      color: '#fff',
                      fontSize: 14,
                      fontWeight: 800,
                      cursor: 'pointer',
                    }}
                  >
                    {quizIdx < activeLesson.quiz.length - 1 ? 'Next Question' : 'See Results'}
                  </motion.button>
                )}
              </motion.div>
            )}

            {isResults && (
              <motion.div
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                style={{ textAlign: 'center', padding: '20px 0' }}
              >
                <div style={{ fontSize: 48, marginBottom: 12, display: 'inline-flex', justifyContent: 'center', color: score >= 4 ? 'var(--sp-accent-amber)' : score >= 3 ? 'var(--sp-accent-green)' : 'var(--sp-accent-purple)' }} aria-hidden>
                  {/* TRAIN-COACH-A11Y-1: SVG ScoreIcon replaces 🏆/👍/💪 */}
                  <ScoreIcon score={score} total={activeLesson.quiz.length} size={48} />
                </div>
                <div style={{ fontSize: 22, fontWeight: 900, marginBottom: 4 }}>
                  Lesson Complete
                </div>
                <div style={{ fontSize: 14, color: 'var(--sp-fg-muted)', marginBottom: 24 }}>
                  {activeLesson.name}
                </div>
                <div
                  style={{
                    fontSize: 36,
                    fontWeight: 900,
                    color: score >= 4 ? 'var(--sp-accent-green)' : 'var(--sp-accent-amber)',
                  }}
                >
                  {score}/{activeLesson.quiz.length}
                </div>
                <div style={{ fontSize: 11, color: 'var(--sp-fg-dim)', marginBottom: 24 }}>
                  Questions Correct
                </div>
                <motion.button
                  whileTap={{ scale: 0.97 }}
                  onClick={() => setActiveLesson(null)}
                  style={{
                    padding: '14px 32px',
                    borderRadius: 12,
                    border: 'none',
                    background: 'linear-gradient(135deg, rgba(var(--sp-accent-cyan-rgb), 1), rgba(var(--sp-accent-blue-rgb), 1))',
                    color: '#fff',
                    fontSize: 14,
                    fontWeight: 800,
                    cursor: 'pointer',
                  }}
                >
                  Back to Lessons
                </motion.button>
              </motion.div>
            )}
          </div>
        </div>
      </>
    );
  }

  // Lesson list
  return (
    <>
      <Head>
        <title>Coach Mode | Smarter.Poker GTO Training</title>
      </Head>
      <div
        style={{
          minHeight: '100vh',
          background: 'linear-gradient(180deg, #0a0a1a 0%, #0f172a 50%, #0a0a1a 100%)',
          color: 'var(--sp-fg)',
          fontFamily: "'Inter', -apple-system, sans-serif",
        }}
      >
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
            type="button"
            aria-label="Back to training"
            onClick={() => router.push('/hub/training')}
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
            {/* TRAIN-COACH-A11Y-1: SVG back arrow */}
            <BackArrowIcon size={18} />
          </button>
          <div>
            {/* TRAIN-COACH-A11Y-1: semantic h1 */}
            <h1 style={{ fontSize: 16, fontWeight: 700, margin: 0 }}>Coach Mode</h1>
            <div style={{ fontSize: 11, color: 'var(--sp-fg-dim)' }}>Guided GTO lessons</div>
          </div>
          <div style={{ marginLeft: 'auto', fontSize: 11, color: 'var(--sp-fg-dim)' }} role="status" aria-label={`${completed.size} of ${LESSONS.length} lessons complete`}>
            {completed.size}/{LESSONS.length} complete
          </div>
        </div>
        <div style={{ padding: '20px 16px', maxWidth: 600, margin: '0 auto' }}>
          {LESSONS.map((lesson, i) => (
            <motion.button
              key={lesson.id}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.06 }}
              whileTap={{ scale: 0.98 }}
              onClick={() => startLesson(lesson)}
              style={{
                width: '100%',
                padding: '16px',
                borderRadius: 14,
                marginBottom: 8,
                background: `${lesson.color}06`,
                border: `1px solid ${lesson.color}15`,
                display: 'flex',
                alignItems: 'center',
                gap: 14,
                cursor: 'pointer',
                textAlign: 'left',
              }}
            >
              <div
                style={{
                  width: 40,
                  height: 40,
                  borderRadius: 10,
                  background: `${lesson.color}12`,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: 20,
                  flexShrink: 0,
                }}
              >
                {/* TRAIN-COACH-A11Y-1: SVG LessonIcon */}
                <span style={{ display: 'inline-flex', color: lesson.color }} aria-hidden>
                  <LessonIcon kind={lesson.iconKind} size={20} />
                </span>
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 14, fontWeight: 700, color: lesson.color }}>
                  {lesson.name}
                </div>
                <div style={{ fontSize: 11, color: 'var(--sp-fg-muted)', marginTop: 2 }}>{lesson.desc}</div>
                <div style={{ fontSize: 9, color: 'var(--sp-fg-faint)', marginTop: 3 }}>
                  {lesson.concepts.length} concepts · {lesson.quiz.length} quiz questions
                </div>
              </div>
              {/* TRAIN-COACH-A11Y-1: SVG check replaces ✅ */}
              {completed.has(lesson.id) && <div style={{ fontSize: 16, display: 'inline-flex', color: 'var(--sp-accent-green)' }} aria-label="Completed" role="img"><CheckIcon size={16} /></div>}
            </motion.button>
          ))}
        </div>
      </div>
    </>
  );
}