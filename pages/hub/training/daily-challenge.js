/**
 * Daily Training Challenge — Hand of the Day
 * ●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●
 * Phase 24: Daily canonical poker spot with leaderboard and streak
 * tracking. One challenge per day, changes at midnight Central Time.
 *
 * Route: /hub/training/daily-challenge
 * ●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●
 */

// TRAIN-CATCH-FIX-1 — replaced silent catch blocks with console.warn-backed handlers
// TRAIN-CSS-TOKENS-BATCH4-15 — hex sweep batch 4: literals routed to --sp-* tokens
// TRAIN-CSS-GRADIENT-ADOPT-7 — gradient hex routed to rgba(var(--sp-*-rgb), 1)
import React, { useState, useEffect, useCallback, useRef } from 'react';
import Head from 'next/head';
import { useRouter } from 'next/router';
import { motion, AnimatePresence } from 'framer-motion';
import useTrainingBus from '../../../src/hooks/useTrainingBus';
import { eventBus, EventType } from '../../../src/engine/EventBus';
import Card, { parseCards } from '../../../src/components/training/Card';
import { authedFetch } from '../../../src/lib/authUtils';
import ConnectionToast from '../../../src/components/training/ConnectionToast';
import { useTrainingFeedback } from '../../../src/hooks/useTrainingFeedback';
import QuizAnswer from '../../../src/components/poker/QuizAnswer';
import FeedbackCard from '../../../src/components/poker/FeedbackCard';
// TRAIN-WIRE-FX-4d — adoption: feedback hook for daily-challenge.fresh.js

/**
 * Convert abstract hand notation (A5s, KK, K5o) OR specific (Ah5s) to card objects.
 * Falls back to parseCards for specific notation with explicit suits.
 */
function handToCards(hand) {
    if (!hand) return [];
    // If hand has 4+ chars and every other char is a suit letter, use parseCards
    if (hand.length >= 4 && /^[AKQJT2-9][hdsc][AKQJT2-9][hdsc]$/i.test(hand.slice(0, 4))) {
        return parseCards(hand);
    }
    // Abstract notation: "AA", "AKs", "K5o"
    if (hand.length === 2) {
        // Pair: "AA", "KK"
        return [{ rank: hand[0], suit: 'h' }, { rank: hand[1], suit: 's' }];
    }
    if (hand.length === 3) {
        const r1 = hand[0], r2 = hand[1], flag = hand[2];
        if (flag === 's') {
            return [{ rank: r1, suit: 's' }, { rank: r2, suit: 's' }];
        }
        return [{ rank: r1, suit: 'h' }, { rank: r2, suit: 'd' }];
    }
    // Fallback: try parseCards
    const parsed = parseCards(hand);
    return parsed.length > 0 ? parsed : [];
}


const DAILY_CHALLENGE_DIAMOND_REWARD = 25;

// ●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●
// COUNTDOWN TIMER
// ●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●

function CountdownTimer({ expiresAt }) {
  const [remaining, setRemaining] = useState('');

  useEffect(() => {
    if (!expiresAt) return;
    const tick = () => {
      const now = Date.now();
      const expires = new Date(expiresAt).getTime();
      const diff = Math.max(0, expires - now);
      const h = Math.floor(diff / 3600000);
      const m = Math.floor((diff % 3600000) / 60000);
      const s = Math.floor((diff % 60000) / 1000);
      setRemaining(`${h}h ${m}m ${s}s`);
    };
    tick();
    const iv = setInterval(tick, 1000);
    return () => clearInterval(iv);
  }, [expiresAt]);

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 6,
        fontSize: 11,
        fontWeight: 700,
        color: 'var(--sp-fg-dim)',
      }}
    >
      <svg width="12" height="12" viewBox="0 0 24 24" fill="#64748b">
        <path d="M11.99 2C6.47 2 2 6.48 2 12s4.47 10 9.99 10C17.52 22 22 17.52 22 12S17.52 2 11.99 2zM12 20c-4.42 0-8-3.58-8-8s3.58-8 8-8 8 3.58 8 8-3.58 8-8 8zm.5-13H11v6l5.25 3.15.75-1.23-4.5-2.67V7z" />
      </svg>
      <span>Next Challenge In {remaining}</span>
    </div>
  );
}

// ●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●
// STREAK CALENDAR (30 days)
// ●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●

function StreakCalendar({ completedDays, todayKey }) {
  const days = [];
  const today = /^\d{4}-\d{2}-\d{2}$/.test(String(todayKey || ''))
    ? new Date(`${todayKey}T12:00:00Z`)
    : new Date();
  for (let i = 29; i >= 0; i--) {
    const d = new Date(today);
    d.setUTCDate(d.getUTCDate() - i);
    const key = d.toISOString().slice(0, 10);
    const isCompleted = completedDays.includes(key);
    const isToday = i === 0;
    days.push({ key, isCompleted, isToday, day: d.getUTCDate() });
  }

  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(10, 1fr)',
        gap: 3,
      }}
    >
      {days.map((d) => (
        <div
          key={d.key}
          style={{
            aspectRatio: '1',
            borderRadius: 4,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: 8,
            fontWeight: 700,
            background: d.isCompleted
              ? 'linear-gradient(135deg, rgba(var(--sp-accent-green-rgb), 1), #16a34a)'
              : d.isToday
                ? 'rgba(234,179,8,0.15)'
                : 'rgba(255,255,255,0.03)',
            border: d.isToday
              ? '1px solid rgba(234,179,8,0.4)'
              : d.isCompleted
                ? '1px solid rgba(34,197,94,0.3)'
                : '1px solid rgba(255,255,255,0.04)',
            color: d.isCompleted ? '#fff' : d.isToday ? 'var(--sp-accent-amber)' : 'var(--sp-fg-faint)',
          }}
        >
          {d.day}
        </div>
      ))}
    </div>
  );
}

// ●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●
// PAGE COMPONENT
// ●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●

export default function DailyChallengePage() {
  const router = useRouter();
  const bus = useTrainingBus('daily-challenge');
  const fb = useTrainingFeedback();

  const answerStartRef = useRef(Date.now());

  const [challenge, setChallenge] = useState(null);
  const [dailyId, setDailyId] = useState(null);
  const [expiresAt, setExpiresAt] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [selected, setSelected] = useState(null);
  const [persistedCorrect, setPersistedCorrect] = useState(null);
  const [feedback, setFeedback] = useState(null);
  const [completion, setCompletion] = useState(null);
  const [activeAttemptId, setActiveAttemptId] = useState(null);
  const [showResult, setShowResult] = useState(false);
  const [alreadyCompleted, setAlreadyCompleted] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [completing, setCompleting] = useState(false);
  const [completionPending, setCompletionPending] = useState(false);
  const [completedDays, setCompletedDays] = useState([]);
  const [currentStreak, setCurrentStreak] = useState(0);
  const completionResponseTimeRef = useRef(0);
  const answered = useRef(false);

  // Fetch daily challenge
  const fetchChallenge = useCallback(async () => {
    setLoading(true);
    setError(null);
    setSelected(null);
    setPersistedCorrect(null);
    setFeedback(null);
    setCompletion(null);
    setActiveAttemptId(null);
    setShowResult(false);
    setAlreadyCompleted(false);
    setCompleting(false);
    setCompletionPending(false);
    answered.current = false;
    try {
      const res = await authedFetch('/api/training/hand-of-the-day');
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error(data?.error || `Request failed (${res.status})`);
      if (data.success) {
        setChallenge(data.question);
        setDailyId(data.dailyId);
        setExpiresAt(data.expiresAt);
        answerStartRef.current = Date.now(); // Reset timer when challenge loads

        // Completion truth comes exclusively from the sealed attempt returned
        // by the server. Browser storage is never grading or progress evidence.
        if (data.completion) {
          setAlreadyCompleted(true);
          setCompletion(data.completion);
          setActiveAttemptId(data.completion.attemptId || null);
          setSelected(data.completion.selectedAction || null);
          setPersistedCorrect(
            typeof data.completion.isCorrect === 'boolean'
              ? data.completion.isCorrect
              : null
          );
          setFeedback(data.feedback || null);
          setShowResult(Boolean(data.feedback));
          answered.current = true;
        } else if (data.completionPending && data.persistedAnswer?.attemptId) {
          setActiveAttemptId(data.persistedAnswer.attemptId);
          setSelected(data.persistedAnswer.selectedAction || null);
          setPersistedCorrect(
            typeof data.persistedAnswer.isCorrect === 'boolean'
              ? data.persistedAnswer.isCorrect
              : null
          );
          setFeedback(data.feedback || null);
          setShowResult(Boolean(data.feedback));
          setCompletionPending(true);
          setError('Your answer is safely recorded. Finish the Daily Challenge below.');
          answered.current = true;
        } else {
          setActiveAttemptId(data.question?._gradingContext?.attemptId || null);
        }

        const streakData = Array.isArray(data.completedDays) ? data.completedDays : [];
        setCompletedDays(streakData);

        // Derive the display streak from authenticated completion dates. Use a
        // UTC-noon cursor so timezone conversion cannot skip a calendar date.
        let streak = 0;
        const today = String(data.dailyId || '').replace(/^daily-/, '');
        const d = new Date(`${today}T12:00:00Z`);
        for (let i = 0; i < 365; i++) {
          const key = d.toISOString().slice(0, 10);
          if (streakData.includes(key)) {
            streak++;
          } else {
            break;
          }
          d.setUTCDate(d.getUTCDate() - 1);
        }
        setCurrentStreak(streak);
      } else {
        setError(data.error || 'Failed to load daily challenge');
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchChallenge();
  }, [fetchChallenge]);

  // Bus listener
  useEffect(() => {
    const unsub = eventBus.on(EventType?.SESSION_END || 'session:end', () => fetchChallenge());
    return unsub;
  }, [fetchChallenge]);

  const completeDailyAttempt = useCallback(async (attemptId, responseTimeMs) => {
    if (!attemptId) return false;
    setCompleting(true);
    setCompletionPending(false);
    try {
      const completionResponse = await authedFetch('/api/training/save-progress', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ attemptId }),
      });
      const completed = await completionResponse.json().catch(() => null);
      if (
        !completionResponse.ok
        || completed?.success !== true
        || String(completed?.attemptId || '') !== String(attemptId)
      ) {
        throw new Error(completed?.error || 'Daily completion could not be verified');
      }

      setCompletion(completed);
      setActiveAttemptId(attemptId);
      setAlreadyCompleted(true);
      setCompleting(false);
      setCompletionPending(false);
      setError(null);

      const completedDate = String(
        completed.dailyChallenge?.daily_id || completed.dailyChallenge?.dailyId || dailyId || '',
      ).replace(/^daily-/, '');
      if (completedDate) {
        setCompletedDays((days) => (
          days.includes(completedDate) ? days : [...days, completedDate]
        ));
      }
      const authoritativeStreak = Number(completed.trainingStreak?.current_streak);
      if (Number.isInteger(authoritativeStreak) && authoritativeStreak >= 0) {
        setCurrentStreak(authoritativeStreak);
      }

      const isCorrect = completed.correct === 1;
      if (bus?.emitAnswerSpeed) bus.emitAnswerSpeed(responseTimeMs, { is_correct: isCorrect });
      if (bus?.emitStreakUpdate && Number.isInteger(authoritativeStreak)) {
        bus.emitStreakUpdate(authoritativeStreak);
      }
      if (bus?.emitCardViewed && challenge?.boardCards) {
        bus.emitCardViewed(challenge.boardCards);
      }
      eventBus?.emit?.(
        'training:daily-challenge-completed',
        {
          accuracy: Number.isFinite(Number(completed.accuracy))
            ? Number(completed.accuracy)
            : null,
          responseTimeMs,
          attemptId,
        },
        'DailyChallenge'
      );
      return true;
    } catch (completionError) {
      console.warn('[DailyChallenge] Completion failed:', completionError?.message || completionError);
      setCompleting(false);
      setCompletionPending(true);
      setError('Your answer is safely recorded. Completion is temporarily unavailable; retry below.');
      return false;
    }
  }, [bus, challenge, dailyId]);

  // Persist the signed answer before revealing any grading information. Once
  // grading is durable, completion is a separate idempotent transaction so a
  // temporary failure can be retried without asking the player to answer again.
  const handleAnswer = useCallback(
    async (actionId) => {
      if (answered.current || submitting || !challenge) return;
      const context = challenge._gradingContext;
      if (
        !context?.receipt
        || !context?.attemptId
        || !context?.snapshotKey
        || !context?.submissionId
        || !challenge.id
      ) {
        setError('This Daily Challenge is missing its secure grading receipt. Reload and try again.');
        return;
      }

      answered.current = true;
      setSelected(actionId);
      setSubmitting(true);
      setError(null);
      try {
        const recordResponse = await authedFetch('/api/training/record-question', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            gameId: 'daily-challenge',
            questionId: challenge.id,
            answerId: actionId,
            gradingReceipt: context.receipt,
            submissionId: context.submissionId,
            sessionId: context.sessionId,
            attemptId: context.attemptId,
            snapshotKey: context.snapshotKey,
            gradingMode: context.difficultyMode,
          }),
        });
        const recorded = await recordResponse.json().catch(() => null);
        if (
          !recordResponse.ok
          || recorded?.success !== true
          || String(recorded?.attemptId || '') !== String(context.attemptId)
          || typeof recorded?.evidence?.isCorrect !== 'boolean'
          || !recorded?.feedback
        ) {
          throw new Error(recorded?.error || 'Daily answer could not be verified');
        }

        const responseTimeMs = Date.now() - answerStartRef.current;
        completionResponseTimeRef.current = responseTimeMs;
        setActiveAttemptId(recorded.attemptId);
        setPersistedCorrect(recorded.evidence.isCorrect);
        setFeedback({
          ...recorded.feedback,
          evLossMeasured: recorded.evidence.evLossMeasured === true,
          evLoss: recorded.evidence.evLossMeasured === true
            && Number.isFinite(Number(recorded.evidence.evLoss))
            ? Number(recorded.evidence.evLoss)
            : null,
        });
        setShowResult(true);
        setSubmitting(false);
        if (recorded.evidence.isCorrect) fb.correct(); else fb.incorrect();
        await completeDailyAttempt(recorded.attemptId, responseTimeMs);
      } catch (recordError) {
        console.warn('[DailyChallenge] Answer recording failed:', recordError?.message || recordError);
        answered.current = false;
        setSubmitting(false);
        setSelected(null);
        setError('Your answer was not recorded and no result was revealed. Please try again.');
      }
    },
    [challenge, completeDailyAttempt, fb, submitting]
  );

  // Derive question data
  const options = (challenge?.options || challenge?.choices || []).map((option) => ({
    id: String(option?.id ?? option),
    text: String(option?.text ?? option),
  }));
  const correctAnswer = feedback?.correctAnswer || '';
  const correctAnswerText = feedback?.correctAnswerText
    || options.find((option) => option.id === correctAnswer)?.text
    || correctAnswer;
  const board = challenge?.boardCards || challenge?.board_cards || challenge?.board || [];
  const heroHand = challenge?.scenario?.heroHand || challenge?.heroHand || challenge?.hero_hand || challenge?.hand || '';
  const scenario = challenge?.question || challenge?.scenario_text || challenge?.scenario?.context || 'What Is The Best Play?';
  const explanation = feedback?.explanation || '';
  const frequencies = feedback?.gtoFrequencies || feedback?.frequencies || null;
  const position = challenge?.scenario?.heroPosition || challenge?.hero_position || challenge?.position || '';
  const street = challenge?.scenario?.street || challenge?.street || '';
  const resultIsCorrect = persistedCorrect === true;

  return (
    <>
      <Head>
        <title>Daily Training Challenge | Smarter.Poker</title>
        <meta
          name="description"
          content="Daily audited poker spot. Test your skills, track your streak, and compete on the leaderboard."
        />
      </Head>

      <div
        className="sp-training-command sp-training-command--daily"
        style={{
          minHeight: '100vh', paddingBottom: 70, width: '100%', maxWidth: '100vw', overflowX: 'hidden', boxSizing: 'border-box',
          background: 'linear-gradient(180deg, #0a0a12 0%, #0f0f1e 50%, #1a1a2e 100%)',
          color: 'var(--sp-fg)',
          fontFamily: "'Inter', -apple-system, sans-serif",
        }}
      >
        {/* Header */}
        <div
          className="sp-command-header"
          style={{
            padding: '20px 24px 12px',
            borderBottom: '1px solid rgba(255,255,255,0.06)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
            {/* BUG FIX (TRAIN-DAILY-CHALLENGE-A11Y-1): explicit aria-label so
                screen readers don't read the HTML entity '&larr;' as 'left
                pointing arrow'; the visible label 'Training' alone reads
                ambiguously without context. */}
            <button
              type="button"
              onClick={() => router.push('/hub/training')}
              aria-label="Back to training"
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
              &larr; Training
            </button>
            <h1
              style={{
                fontSize: 20,
                fontWeight: 800,
                margin: 0,
                background: 'linear-gradient(135deg, #eab308, rgba(var(--sp-accent-orange-rgb), 1))',
                WebkitBackgroundClip: 'text',
                WebkitTextFillColor: 'transparent',
                fontFamily: "var(--font-orbitron), 'Orbitron', monospace",
              }}
            >
              Daily Challenge
            </h1>
            <span
              style={{
                fontSize: 10,
                color: 'var(--sp-accent-amber)',
                background: 'rgba(234,179,8,0.1)',
                padding: '3px 8px',
                borderRadius: 12,
                fontWeight: 700,
                border: '1px solid rgba(234,179,8,0.2)',
                fontFamily: "var(--font-orbitron), 'Orbitron', monospace",
              }}
            >
              Daily Training Spot
            </span>
          </div>
          {expiresAt && (
            <div style={{ marginTop: 6 }}>
              <CountdownTimer expiresAt={expiresAt} />
            </div>
          )}
        </div>

        <div className="sp-command-main" style={{ padding: '16px 24px', maxWidth: 600, margin: '0 auto' }}>
          {/* Streak + Stats Bar */}
          <div
            className="sp-command-metric-grid"
            style={{
              display: 'flex',
              gap: 8,
              marginBottom: 14,
            }}
          >
            <div
              style={{
                flex: 1,
                textAlign: 'center',
                background: 'rgba(234,179,8,0.06)',
                border: '1px solid rgba(234,179,8,0.15)',
                borderRadius: 10,
                padding: '10px 8px',
              }}
            >
              <div
                style={{
                  fontSize: 24,
                  fontWeight: 900,
                  color: 'var(--sp-accent-amber)',
                  fontFamily: "var(--font-orbitron), 'Orbitron', monospace",
                }}
              >
                {currentStreak}
              </div>
              <div
                style={{
                  fontSize: 9,
                  color: 'var(--sp-fg-dim)',
                  fontWeight: 700,
                  textTransform: 'uppercase',
                  letterSpacing: 1,
                }}
              >
                Day Streak
              </div>
            </div>
            <div
              style={{
                flex: 1,
                textAlign: 'center',
                background: 'rgba(34,197,94,0.06)',
                border: '1px solid rgba(34,197,94,0.15)',
                borderRadius: 10,
                padding: '10px 8px',
              }}
            >
              <div
                style={{
                  fontSize: 24,
                  fontWeight: 900,
                  color: 'var(--sp-accent-green)',
                  fontFamily: "var(--font-orbitron), 'Orbitron', monospace",
                }}
              >
                {completedDays.length}
              </div>
              <div
                style={{
                  fontSize: 9,
                  color: 'var(--sp-fg-dim)',
                  fontWeight: 700,
                  textTransform: 'uppercase',
                  letterSpacing: 1,
                }}
              >
                Days Done
              </div>
            </div>
            <div
              style={{
                flex: 1,
                textAlign: 'center',
                background: 'rgba(168,85,247,0.06)',
                border: '1px solid rgba(168,85,247,0.15)',
                borderRadius: 10,
                padding: '10px 8px',
              }}
            >
              <div
                style={{
                  fontSize: 24,
                  fontWeight: 900,
                  color: 'var(--sp-accent-purple)',
                  fontFamily: "var(--font-orbitron), 'Orbitron', monospace",
                }}
              >
                {DAILY_CHALLENGE_DIAMOND_REWARD}
              </div>
              <div
                style={{
                  fontSize: 9,
                  color: 'var(--sp-fg-dim)',
                  fontWeight: 700,
                  textTransform: 'uppercase',
                  letterSpacing: 1,
                }}
              >
                Diamonds
              </div>
            </div>
          </div>

          {/* Error */}
          {error && (
            <div
              style={{
                padding: '10px 14px',
                background: 'rgba(239,68,68,0.1)',
                border: '1px solid rgba(239,68,68,0.3)',
                borderRadius: 8,
                color: 'var(--sp-accent-red)',
                fontSize: 12,
                fontWeight: 600,
                marginBottom: 14,
              }}
            >
              {error}
              {/* TRAIN-DAILY-CHALLENGE-A11Y-1: aria-label disambiguates Retry */}
              <button
                type="button"
                onClick={fetchChallenge}
                aria-label="Retry loading today's challenge"
                style={{
                  marginLeft: 12,
                  background: 'rgba(234,179,8,0.2)',
                  border: '1px solid rgba(234,179,8,0.4)',
                  borderRadius: 6,
                  padding: '4px 12px',
                  color: 'var(--sp-accent-amber)',
                  cursor: 'pointer',
                  fontSize: 11,
                  fontWeight: 700,
                }}
              >
                Retry
              </button>
            </div>
          )}

          {/* Loading */}
          {loading && (
            <div
              style={{
                textAlign: 'center',
                padding: 40,
                color: 'var(--sp-fg-dim)',
                fontFamily: "var(--font-orbitron), 'Orbitron', monospace",
                fontSize: 12,
                fontWeight: 700,
              }}
            >
              LOADING TODAY'S CHALLENGE...
            </div>
          )}

          {/* Challenge Display */}
          {!loading && challenge && (
            <motion.div className="sp-command-card-stage" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
              {/* Already completed banner */}
              {alreadyCompleted && (
                <div
                  style={{
                    padding: '8px 12px',
                    marginBottom: 12,
                    background: 'rgba(34,197,94,0.08)',
                    border: '1px solid rgba(34,197,94,0.2)',
                    borderRadius: 8,
                    fontSize: 11,
                    fontWeight: 700,
                    color: 'var(--sp-accent-green)',
                    textAlign: 'center',
                  }}
                >
                  You Already Completed Today's Challenge
                </div>
              )}

              {/* Spot Info */}
              <div
                style={{
                  display: 'flex',
                  gap: 6,
                  marginBottom: 12,
                  flexWrap: 'wrap',
                }}
              >
                {position && (
                  <span
                    style={{
                      fontSize: 10,
                      fontWeight: 800,
                      color: 'var(--sp-accent-amber)',
                      background: 'rgba(234,179,8,0.1)',
                      padding: '3px 8px',
                      borderRadius: 6,
                      fontFamily: "var(--font-orbitron), 'Orbitron', monospace",
                    }}
                  >
                    {position}
                  </span>
                )}
                {street && (
                  <span
                    style={{
                      fontSize: 10,
                      fontWeight: 700,
                      color: 'var(--sp-fg-muted)',
                      background: 'rgba(255,255,255,0.04)',
                      padding: '3px 8px',
                      borderRadius: 6,
                    }}
                  >
                    {street}
                  </span>
                )}
              </div>

              {/* Board + Hand */}
              <div
                style={{
                  background:
                    'linear-gradient(145deg, rgba(255,255,255,0.04), rgba(255,255,255,0.01))',
                  border: '1px solid rgba(234,179,8,0.12)',
                  borderRadius: 14,
                  padding: '20px 24px',
                  marginBottom: 14,
                  textAlign: 'center',
                }}
              >
                {Array.isArray(board) && board.length > 0 && (
                  <>
                    <div
                      style={{
                        fontSize: 9,
                        fontWeight: 700,
                        color: 'var(--sp-fg-dim)',
                        textTransform: 'uppercase',
                        letterSpacing: 1.5,
                        marginBottom: 10,
                        fontFamily: "var(--font-orbitron), 'Orbitron', monospace",
                      }}
                    >
                      BOARD
                    </div>
                    <div
                      style={{
                        display: 'flex',
                        gap: 8,
                        justifyContent: 'center',
                        marginBottom: 16,
                      }}
                    >
                      {board.map((card, i) => (
                        <Card
                          key={i}
                          rank={card[0]?.toUpperCase()}
                          suit={card[1]?.toLowerCase()}
                          size="small"
                        />
                      ))}
                    </div>
                  </>
                )}
                {heroHand && (
                  <>
                    <div
                      style={{
                        fontSize: 9,
                        fontWeight: 700,
                        color: 'var(--sp-fg-dim)',
                        textTransform: 'uppercase',
                        letterSpacing: 1.5,
                        marginBottom: 8,
                        fontFamily: "var(--font-orbitron), 'Orbitron', monospace",
                      }}
                    >
                      YOUR HAND
                    </div>
                    <div style={{ display: 'flex', gap: 6, justifyContent: 'center', alignItems: 'center' }}>
                      {handToCards(heroHand).map((c, i) => (
                        <Card key={i} rank={c.rank} suit={c.suit} size="small" />
                      ))}
                    </div>
                  </>
                )}
              </div>

              {/* Scenario */}
              <div
                style={{
                  fontSize: 14,
                  fontWeight: 700,
                  color: 'var(--sp-fg)',
                  textAlign: 'center',
                  marginBottom: 14,
                }}
              >
                {scenario}
              </div>

              {/* Action Buttons */}
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(2, 1fr)',
                  gap: 8,
                  marginBottom: 16,
                }}
              >
                {/* TRAIN-WIRE-QUIZ-ANSWER-4 — options via shared QuizAnswer */}
                {options.map((action, idx) => (
                  <QuizAnswer
                    key={action.id}
                    label={action.text}
                    shortcut={idx + 1}
                    selected={selected === action.id}
                    correct={showResult && action.id === correctAnswer}
                    show={showResult}
                    disabled={answered.current || submitting}
                    onClick={() => handleAnswer(action.id)}
                    ariaLabel={`Choose ${action.text}`}
                    size="md"
                  />
                ))}
              </div>

              {submitting && !showResult && (
                <div
                  role="status"
                  aria-live="polite"
                  style={{
                    marginBottom: 14,
                    textAlign: 'center',
                    color: 'var(--sp-accent-amber)',
                    fontSize: 11,
                    fontWeight: 700,
                  }}
                >
                  Verifying And Recording Your Answer...
                </div>
              )}

              {/* Result Feedback */}
              <AnimatePresence>
                {showResult && (
                  <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    style={{
                      background:
                        resultIsCorrect ? 'rgba(34,197,94,0.1)' : 'rgba(239,68,68,0.1)',
                      border: `1px solid ${resultIsCorrect ? 'rgba(34,197,94,0.3)' : 'rgba(239,68,68,0.3)'}`,
                      borderRadius: 10,
                      padding: '12px 16px',
                      marginBottom: 14,
                    }}
                  >
                    {/* TRAIN-WIRE-FEEDBACK-V2-6 — verdict via FeedbackCard compact */}
                    <div style={{ marginBottom: 6 }}>
                      <FeedbackCard
                        verdict={resultIsCorrect ? 'correct' : 'incorrect'}
                        userAction={options.find((option) => option.id === selected)?.text || selected || ''}
                        solverAction={correctAnswerText}
                        evLoss={feedback?.evLossMeasured === true
                          && Number.isFinite(Number(feedback?.evLoss))
                          ? Number(feedback.evLoss)
                          : Number.isFinite(completion?.evLoss)
                          ? completion.evLoss
                          : undefined}
                        whyShort={feedback?.solverVerified
                          ? (resultIsCorrect ? 'Solver Correct.' : `Solver Prefers ${correctAnswerText}.`)
                          : (resultIsCorrect ? 'Correct.' : `The Canonical Answer Is ${correctAnswerText}.`)}
                        compact
                      />
                    </div>
                    <div
                      style={{
                        fontSize: 12,
                        fontWeight: 700,
                        color: 'var(--sp-fg)',
                        marginBottom: 4,
                      }}
                    >
                      Correct Answer: {correctAnswerText}
                    </div>

                    {/* GTO Frequency Breakdown */}
                    {frequencies && (
                      <>
                        <div
                          style={{
                            fontSize: 10,
                            fontWeight: 700,
                            color: 'var(--sp-fg-dim)',
                            marginTop: 6,
                            marginBottom: 4,
                            textTransform: 'uppercase',
                            letterSpacing: 1,
                          }}
                        >
                          GTO Frequencies
                        </div>
                        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                          {Object.entries(frequencies || {})
                            .sort(([, a], [, b]) => b - a)
                            .map(([act, freq]) => (
                              <span
                                key={act}
                                style={{
                                  fontSize: 11,
                                  fontWeight: 600,
                                  color: act === correctAnswer || act === correctAnswerText ? 'var(--sp-accent-green)' : 'var(--sp-fg-muted)',
                                  background:
                                    act === correctAnswer || act === correctAnswerText
                                      ? 'rgba(34,197,94,0.1)'
                                      : 'rgba(255,255,255,0.04)',
                                  padding: '3px 8px',
                                  borderRadius: 6,
                                }}
                              >
                                {act}: {freq}%
                              </span>
                            ))}
                        </div>
                      </>
                    )}

                    {/* Explanation */}
                    {explanation && (
                      <div
                        style={{
                          marginTop: 8,
                          fontSize: 11,
                          color: 'var(--sp-fg-muted)',
                          lineHeight: 1.5,
                          borderTop: '1px solid rgba(255,255,255,0.06)',
                          paddingTop: 8,
                        }}
                      >
                        {explanation}
                      </div>
                    )}

                    <div style={{ marginTop: 10, display: 'flex', flexDirection: 'column', gap: 8 }}>
                      {completing && (
                        <div
                          role="status"
                          aria-live="polite"
                          style={{
                            padding: '10px 14px',
                            borderRadius: 8,
                            background: 'rgba(234,179,8,0.08)',
                            border: '1px solid rgba(234,179,8,0.24)',
                            color: 'var(--sp-accent-amber)',
                            textAlign: 'center',
                            fontSize: 12,
                            fontWeight: 800,
                          }}
                        >
                          Answer Recorded. Finalizing Your Daily Reward...
                        </div>
                      )}

                      {completion && (
                        <motion.div
                          initial={{ scale: 0.9, opacity: 0 }}
                          animate={{ scale: 1, opacity: 1 }}
                          style={{
                            padding: '10px 14px',
                            borderRadius: 8,
                            background: 'linear-gradient(135deg, rgba(234,179,8,0.12), rgba(249,115,22,0.06))',
                            border: '1px solid rgba(234,179,8,0.3)',
                            textAlign: 'center',
                          }}
                        >
                          <div style={{ fontSize: 13, fontWeight: 800, color: 'var(--sp-accent-amber)' }}>
                            Daily Challenge Complete
                            {Number(completion.diamondsEarned || completion.diamondsAwarded || 0) > 0
                              ? `! +${Number(completion.diamondsEarned || completion.diamondsAwarded)} Diamonds`
                              : '!'}
                          </div>
                        </motion.div>
                      )}

                      {completionPending && !completing && (
                        <button
                          type="button"
                          onClick={() => completeDailyAttempt(
                            activeAttemptId,
                            completionResponseTimeRef.current,
                          )}
                          aria-label="Retry saving Daily Challenge completion"
                          style={{
                            padding: '11px 14px',
                            borderRadius: 8,
                            border: '1px solid rgba(234,179,8,0.45)',
                            background: 'rgba(234,179,8,0.14)',
                            color: 'var(--sp-accent-amber)',
                            fontSize: 12,
                            fontWeight: 800,
                            cursor: 'pointer',
                          }}
                        >
                          Retry Completion
                        </button>
                      )}

                      {(completion || alreadyCompleted) && !completionPending && !completing && (
                        <button
                          type="button"
                          onClick={() => router.push('/hub/training')}
                          aria-label="Continue to Training Hub"
                          style={{
                            padding: '11px 14px',
                            borderRadius: 8,
                            border: '1px solid rgba(34,211,238,0.35)',
                            background: 'linear-gradient(180deg, rgba(34,211,238,0.2), rgba(14,116,144,0.16))',
                            color: 'var(--sp-fg)',
                            fontSize: 12,
                            fontWeight: 800,
                            cursor: 'pointer',
                          }}
                        >
                          Continue To Training Hub
                        </button>
                      )}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>

              {alreadyCompleted && !showResult && (
                <div
                  style={{
                    marginBottom: 14,
                    padding: '12px 16px',
                    borderRadius: 10,
                    border: '1px solid rgba(34,211,238,0.25)',
                    background: 'rgba(34,211,238,0.06)',
                    textAlign: 'center',
                  }}
                >
                  <div style={{ marginBottom: 10, color: 'var(--sp-fg-muted)', fontSize: 11 }}>
                    Your Sealed Completion Is Saved. Detailed Feedback Is Temporarily Unavailable.
                  </div>
                  <button
                    type="button"
                    onClick={() => router.push('/hub/training')}
                    aria-label="Continue to Training Hub"
                    style={{
                      padding: '11px 14px',
                      borderRadius: 8,
                      border: '1px solid rgba(34,211,238,0.35)',
                      background: 'linear-gradient(180deg, rgba(34,211,238,0.2), rgba(14,116,144,0.16))',
                      color: 'var(--sp-fg)',
                      fontSize: 12,
                      fontWeight: 800,
                      cursor: 'pointer',
                    }}
                  >
                    Continue To Training Hub
                  </button>
                </div>
              )}

              {/* Streak Calendar */}
              <div
                style={{
                  background: 'rgba(255,255,255,0.03)',
                  border: '1px solid rgba(255,255,255,0.06)',
                  borderRadius: 12,
                  padding: '14px 16px',
                  marginBottom: 14,
                }}
              >
                <div
                  style={{
                    fontSize: 10,
                    fontWeight: 700,
                    color: 'var(--sp-fg-dim)',
                    textTransform: 'uppercase',
                    letterSpacing: 1,
                    marginBottom: 8,
                    fontFamily: "var(--font-orbitron), 'Orbitron', monospace",
                  }}
                >
                  30-Day Streak
                </div>
                <StreakCalendar
                  completedDays={completedDays}
                  todayKey={String(dailyId || '').replace(/^daily-/, '')}
                />
                <div
                  style={{
                    display: 'flex',
                    gap: 12,
                    marginTop: 8,
                    fontSize: 9,
                    color: 'var(--sp-fg-dim)',
                    fontWeight: 600,
                  }}
                >
                  <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                    <div style={{ width: 8, height: 8, borderRadius: 2, background: 'var(--sp-accent-green)' }} />
                    Completed
                  </span>
                  <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                    <div
                      style={{
                        width: 8,
                        height: 8,
                        borderRadius: 2,
                        background: 'rgba(234,179,8,0.3)',
                        border: '1px solid rgba(234,179,8,0.4)',
                      }}
                    />
                    Today
                  </span>
                </div>
              </div>

              {/* About */}
              <div
                style={{
                  padding: '14px 18px',
                  background: 'rgba(255,255,255,0.02)',
                  borderRadius: 10,
                  border: '1px solid rgba(255,255,255,0.06)',
                }}
              >
                {/* TRAIN-DAILY-CHALLENGE-A11Y-1: semantic h2 for section heading */}
                <h2
                  style={{
                    fontSize: 10,
                    fontWeight: 700,
                    color: 'var(--sp-fg-dim)',
                    textTransform: 'uppercase',
                    letterSpacing: 1,
                    marginTop: 0,
                    marginBottom: 6,
                    fontFamily: "var(--font-orbitron), 'Orbitron', monospace",
                  }}
                >
                  About Daily Challenge
                </h2>
                <p style={{ fontSize: 12, color: 'var(--sp-fg-muted)', lineHeight: 1.6, margin: 0 }}>
                  A New Audited Poker Spot Every Day At Midnight Central Time. Complete The
                  Challenge To Extend Your Streak And Earn Up To {DAILY_CHALLENGE_DIAMOND_REWARD} Diamonds. Compete With Players Worldwide For The
                  Fastest Correct Answer On The Daily Leaderboard.
                </p>
              </div>
            </motion.div>
          )}

          {/* No challenge available */}
          {!loading && !challenge && !error && (
            <div
              style={{
                textAlign: 'center',
                padding: 40,
                color: 'var(--sp-fg-faint)',
                fontSize: 12,
                fontWeight: 600,
              }}
            >
              No Daily Challenge Available Right Now. Check Back Soon.
            </div>
          )}
        </div>

      </div>
      <ConnectionToast />
    </>
  );
}
