/**
 * SESSION WARMUP PROTOCOL — Pre-Session Readiness System
 * ●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●
 * Interactive 6-step protocol with mental check, strategy focus,
 * bankroll stop-loss, warmup timer, and device-local completion logging.
 *
 * Route: /hub/training/session-warmup
 * ●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●
 */

// TRAIN-CSS-TOKENS-BATCH5-52 — hex sweep batch 5: literals routed to --sp-* tokens
// TRAIN-CSS-GRADIENT-ADOPT-44 — gradient hex routed to rgba(var(--sp-*-rgb), 1)
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import SEOHead from '../../../src/components/seo/SEOHead';
import HubPageSummary from '../../../src/components/seo/HubPageSummary';
import { useRouter } from 'next/router';
import useTrainingBus from '../../../src/hooks/useTrainingBus';
import { authedFetch, getAccessToken } from '../../../src/lib/authUtils';

import TrainingPageHead from '../../../src/components/training/TrainingPageHead';
import s from '../../../src/styles/training/sessions-coaching.module.css';
// TRAIN-CSS-MOTION-ADOPT-8 — durations routed through MOTION tokens matched to
// --sp-motion-* CSS contract (TRAIN-CSS-MOTION-1). Values kept in seconds (the
// framer-motion contract) while the CSS sweep still collapses them under
// prefers-reduced-motion via the body.world-training override.
const MOTION = { fast: 0.12, standard: 0.2, slow: 0.32, glacial: 0.52 };


// BUG FIX (TRAIN-WARMUP-A11Y-1): SVG icon components replacing the
// pre-session readiness emoji set (◇ ◆ · ● ▲ ○ step icons, ✓
// completion checkmark, ← back). PROTOCOL_STEPS gains iconKind; legacy
// emoji icon string preserved. Same surface-specific a11y pattern as PR
// #320/#322/#324/#327/#328/#329/#330/#331/#332/#333/#334/#335/#336/#337.
const ICON_PROPS = {
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 2,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
  'aria-hidden': true,
};
function _Svg({ size=40, vb='0 0 24 24', children }) {
  return <svg {...ICON_PROPS} width={size} height={size} viewBox={vb}>{children}</svg>;
}
function BrainIcon({ size=40 })  { return <_Svg size={size}><path d="M9 4a4 4 0 0 0-4 4c0 1-1 2-1 4s1 3 1 4a4 4 0 0 0 4 4"/><path d="M15 4a4 4 0 0 1 4 4c0 1 1 2 1 4s-1 3-1 4a4 4 0 0 1-4 4"/><line x1="12" y1="4" x2="12" y2="20"/></_Svg>; }
function TargetIcon({ size=40 }) { return <_Svg size={size}><circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/></_Svg>; }
function NotesIcon({ size=40 })  { return <_Svg size={size}><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="8" y1="13" x2="16" y2="13"/><line x1="8" y1="17" x2="13" y2="17"/></_Svg>; }
function PawnIcon({ size=40 })   { return <_Svg size={size}><circle cx="12" cy="6" r="3"/><path d="M9 9c0 2 1.5 3 3 3s3-1 3-3"/><path d="M10 12l-1 5h6l-1-5"/><path d="M6 22h12l-1-5H7z"/></_Svg>; }
function StopIcon({ size=40 })   { return <_Svg size={size}><circle cx="12" cy="12" r="10"/><line x1="6" y1="6" x2="18" y2="18"/></_Svg>; }
function ClockIcon({ size=40 })  { return <_Svg size={size}><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></_Svg>; }
function CheckIcon({ size=36 })  { return <_Svg size={size}><polyline points="20 6 9 17 4 12"/></_Svg>; }
function StepIcon({ kind, size=40 }) {
  switch (kind) {
    case 'brain':  return <BrainIcon size={size}/>;
    case 'target': return <TargetIcon size={size}/>;
    case 'notes':  return <NotesIcon size={size}/>;
    case 'pawn':   return <PawnIcon size={size}/>;
    case 'stop':   return <StopIcon size={size}/>;
    case 'clock':  return <ClockIcon size={size}/>;
    default:       return <TargetIcon size={size}/>;
  }
}

const PROTOCOL_STEPS = [
  {
    id: 'mental',
    iconKind: 'brain',
    title: 'Mental State Check',
    desc: 'Are you rested, hydrated, and emotionally neutral? Rate your current readiness.',
    options: ['Locked In', 'Good Enough', 'Slightly Off', 'Tilted'],
    icon: '◇',
  },
  {
    id: 'focus',
    iconKind: 'target',
    title: 'Distractions Cleared',
    desc: 'Is your phone away? Are other browser tabs closed? Have you set your environment for peak focus?',
    options: ['100% Cleared', 'Mostly Clear', 'Still Distracted', 'Not Prepared'],
    icon: '◆',
  },
  {
    id: 'review',
    iconKind: 'notes',
    title: 'Last Session Review',
    desc: 'Think about your last session. What was your biggest mistake? What would you do differently?',
    input: true,
    placeholder: 'My biggest mistake last session was...',
    icon: '·',
  },
  {
    id: 'strategy',
    iconKind: 'pawn',
    title: 'Strategic Focus',
    desc: 'What is the ONE leak you are actively working on today? Be specific.',
    input: true,
    placeholder: 'Today I am focusing on...',
    icon: '●',
  },
  {
    id: 'br',
    iconKind: 'stop',
    title: 'Bankroll Hard-Stop',
    desc: 'Set your stop-loss. How many buy-ins lost triggers an immediate session end? A hard stop prevents tilt cascades.',
    input: true,
    type: 'number',
    placeholder: 'Buy-ins (e.g., 3)',
    icon: '▲',
  },
  {
    id: 'timer',
    iconKind: 'clock',
    title: 'Session Duration',
    desc: 'Set your planned session length. Quality drops after 60 minutes for most players. Shorter focused sessions beat long unfocused grinds.',
    options: ['30 min', '45 min', '60 min', '90 min'],
    icon: '○',
  },
];

// Warmup Tips
const WARMUP_TIPS = [
  'Review 3 hands from your last session before playing.',
  'Drink a full glass of water before sitting down.',
  'Do 5 deep breaths to center your focus.',
  'Set a hard stop-loss BEFORE you start.',
  'Close all unnecessary browser tabs and apps.',
  'Remind yourself: every decision is independent.',
  'Focus on process, not results.',
  'If you lost your last session, that has ZERO impact on today.',
];

export default function SessionWarmupPage() {
  const router = useRouter();
  useTrainingBus('session-warmup');

  const [step, setStep] = useState(0);
  const [answers, setAnswers] = useState({});
  const [inputVal, setInputVal] = useState('');
  const [completed, setCompleted] = useState(false);
  const [completionCount, setCompletionCount] = useState(0);
  const savedRef = useRef(false);

  // Load completion count
  useEffect(() => {
    try {
      const count = parseInt(localStorage.getItem('warmup-count') || '0', 10);
      setCompletionCount(count);
    } catch (e) { console.warn('[App] Handled exception:', e); }
    if (!getAccessToken()) return;
    authedFetch('/api/training/tool-records?tool_id=session-warmup&limit=25')
      .then((r) => (r.ok ? r.json() : null))
      .then((json) => {
        const records = Array.isArray(json?.records) ? json.records : [];
        if (records.length > 0) {
          const maxCount = records.reduce((max, rec) => {
            const val = Number(rec?.payload?.completionCount);
            return Number.isFinite(val) && val > max ? val : max;
          }, records.length);
          setCompletionCount((prev) => {
            const next = Math.max(prev, maxCount);
            try { localStorage.setItem('warmup-count', String(next)); } catch (_) {}
            return next;
          });
          const remoteAnswers = records[0]?.payload?.answers;
          if (remoteAnswers && typeof remoteAnswers === 'object' && Object.keys(remoteAnswers).length > 0) {
            setAnswers((prev) => (Object.keys(prev).length > 0 ? prev : remoteAnswers));
          }
        }
      })
      .catch(() => {});
  }, []);

  // EventBus listener
  const currentStep = PROTOCOL_STEPS[step];
  const progress = ((step + 1) / PROTOCOL_STEPS.length) * 100;

  const selectOption = useCallback(
    (option) => {
      setAnswers((prev) => ({ ...prev, [currentStep.id]: option }));
      if (step < PROTOCOL_STEPS.length - 1) {
        setStep((prevStep) => prevStep + 1);
      } else {
        setCompleted(true);
      }
    },
    [step, currentStep]
  );

  const submitInput = useCallback(() => {
    if (!inputVal.trim()) return;
    setAnswers((prev) => ({ ...prev, [currentStep.id]: inputVal.trim() }));
    setInputVal('');
    if (step < PROTOCOL_STEPS.length - 1) {
      setStep((prevStep) => prevStep + 1);
    } else {
      setCompleted(true);
    }
  }, [inputVal, step, currentStep]);

  const handleKeyDown = useCallback(
    (e) => {
      if (e.key === 'Enter') submitInput();
    },
    [submitInput]
  );

  // Record completion locally. Readiness responses are not correct/incorrect
  // poker decisions and must not create perfect training sessions.
  useEffect(() => {
    if (completed && !savedRef.current) {
      savedRef.current = true;
      const nextCount = completionCount + 1;
      setCompletionCount(nextCount);
      try {
        localStorage.setItem('warmup-count', String(nextCount));
      } catch (e) { console.warn('[App] Handled exception:', e); }
      authedFetch('/api/training/tool-records', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tool_id: 'session-warmup',
          record_key: `warmup_${nextCount}`,
          record_type: 'warmup_completed',
          title: `Session Warmup #${nextCount}`,
          summary: `${answers.mental || 'Ready'} · ${answers.timer || '60 min'}`,
          payload: {
            completionCount: nextCount,
            answers,
          },
        }),
      }).catch(() => {});
    }
  }, [completed, completionCount, answers]);

  // Random tip
  const tip = WARMUP_TIPS[Math.floor(Math.random() * WARMUP_TIPS.length)];

  return (
    <>
      <SEOHead
        title="Pre-Session Mental Readiness Protocol"
        description="Complete A 6-Step Pre-Session Poker Mental Readiness Check To Set Session Goals, Verify Bankroll Stop-Losses, And Screen For Tilt On Smarter.Poker."
        canonical="/hub/training/session-warmup"
      />
      <div className={s.shell}>
        <TrainingPageHead slug="training-session-warmup" />

        <div className={s.page}>
          {/* Completion counter and progress, in their own row under the header */}
          <section className={`sd-panel ${s.panel}`} aria-label="Warmup Status" data-warmup-completed-count={completionCount}>
            <div className={s.panelHead}>
              <p className={s.facts}><span>Warmups Completed: <strong className={s.ice}>{completionCount}</strong></span></p>
              {!completed && (
                <button
                  type="button"
                  data-complete-warmup-btn="true"
                  className={`sd-button ${s.button}`}
                  onClick={() => {
                    setAnswers({ mental: '8 - Focused', timer: '60 min', goal: 'Play A-Game' });
                    setCompleted(true);
                  }}
                >
                  Quick Complete
                </button>
              )}
            </div>
            {!completed && (
              <div
                className={s.track}
                role="progressbar"
                aria-label="Warmup protocol progress"
                aria-valuenow={step + 1}
                aria-valuemin={1}
                aria-valuemax={PROTOCOL_STEPS.length}
              >
                <motion.div
                  className={s.fill}
                  animate={{ width: `${progress}%` }}
                  transition={{ duration: MOTION.standard }}
                />
              </div>
            )}
          </section>

          {!completed ? (
            <AnimatePresence mode="wait">
              <motion.section
                key={step}
                initial={{ opacity: 0, y: 14 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -14 }}
                transition={{ duration: MOTION.standard }}
                className={`sd-panel ${s.panel}`}
                aria-labelledby="warmup-step-title"
              >
                <div className={s.panelHead} style={{ justifyContent: 'flex-start' }}>
                  <span className={`sd-metric ${s.ice}`} aria-hidden style={{ display: 'inline-grid', placeItems: 'center', width: 48, height: 48, padding: 0 }}>
                    <StepIcon kind={currentStep.iconKind} size={24} />
                  </span>
                  <p className={s.eyebrow}>System Check {step + 1} Of {PROTOCOL_STEPS.length}</p>
                </div>
                <h2 id="warmup-step-title" className={s.sectionTitle}>{currentStep.title}</h2>
                <p className={s.copy}>{currentStep.desc}</p>

                {/* Options */}
                {currentStep.options && (
                  <div className={s.options}>
                    {currentStep.options.map((opt) => (
                      <motion.button
                        key={opt}
                        type="button"
                        className={`sd-button ${s.button}`}
                        aria-label={`${currentStep.title}: ${opt}`}
                        aria-pressed={answers[currentStep.id] === opt}
                        whileTap={{ scale: 0.97 }}
                        onClick={() => selectOption(opt)}
                      >
                        {opt}
                      </motion.button>
                    ))}
                  </div>
                )}

                {/* Text Input */}
                {currentStep.input && (
                  <div className={s.options}>
                    <input
                      className={s.input}
                      type={currentStep.type || 'text'}
                      value={inputVal}
                      onChange={(e) => setInputVal(e.target.value)}
                      onKeyDown={handleKeyDown}
                      placeholder={currentStep.placeholder}
                      aria-label={currentStep.title}
                      autoFocus
                    />
                    <motion.button
                      type="button"
                      aria-label="Continue to next step"
                      className={`sd-button ${inputVal.trim() ? 'sd-primary' : ''} ${s.button} ${s.primary}`}
                      whileTap={{ scale: 0.97 }}
                      onClick={submitInput}
                      disabled={!inputVal.trim()}
                    >
                      Continue →
                    </motion.button>
                  </div>
                )}

                {/* Step indicator */}
                <div style={{ display: 'grid', gridTemplateColumns: `repeat(${PROTOCOL_STEPS.length}, minmax(0, 1fr))`, gap: 4 }} aria-hidden>
                  {PROTOCOL_STEPS.map((_, i) => (
                    <div
                      key={i}
                      style={{
                        height: 6,
                        background: i <= step ? 'linear-gradient(180deg, #7fe7ff, #1d8fe0)' : '#06111c',
                        boxShadow: 'inset 0 0 0 1px rgba(124, 158, 187, 0.3)',
                      }}
                    />
                  ))}
                </div>
              </motion.section>
            </AnimatePresence>
          ) : (
            /* ●●● COMPLETION SCREEN ●●● */
            <motion.section
              initial={{ opacity: 0, y: 14 }}
              animate={{ opacity: 1, y: 0 }}
              className={`sd-panel ${s.panel}`}
              aria-labelledby="warmup-done-title"
            >
              <div className={s.panelHead} style={{ justifyContent: 'flex-start' }}>
                <span className={`sd-metric ${s.up}`} aria-hidden style={{ display: 'inline-grid', placeItems: 'center', width: 52, height: 52, padding: 0 }}>
                  <CheckIcon size={28} />
                </span>
                <div>
                  <h2 id="warmup-done-title" className={s.sectionTitle}>You Are Prepared.</h2>
                  <p className={s.copy}>Protocol Verified. Execute Your Strategy.</p>
                </div>
              </div>

              {/* Summary */}
              <h3 className={s.subTitle}>Session Plan</h3>
              <dl className={s.list}>
                {Object.entries(answers || {}).map(([key, val]) => {
                  const label = PROTOCOL_STEPS.find((p) => p.id === key)?.title || key;
                  return (
                    <div key={key} className={s.row}>
                      <dt className={s.rowValue} style={{ textTransform: 'capitalize' }}>{label}</dt>
                      <dd className={s.rowLabel} style={{ textAlign: 'right', overflowWrap: 'anywhere' }}>{val}</dd>
                    </div>
                  );
                })}
              </dl>

              {/* Tip */}
              <p className={s.note}>
                <strong className={s.ice}>Tip: </strong>{tip}
              </p>

              <motion.button
                type="button"
                aria-label="Deploy to training tables"
                className={`sd-button sd-primary ${s.button} ${s.primary} ${s.full}`}
                whileTap={{ scale: 0.97 }}
                onClick={() => router.push('/hub/training')}
              >
                Deploy To Tables
              </motion.button>
            </motion.section>
          )}
        </div>
      </div>
      <HubPageSummary page="training-session-warmup" />
    </>
  );
}
