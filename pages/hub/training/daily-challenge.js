/**
 * Daily Training Challenge - Hand of the Day
 * ●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●
 * Phase 24: Daily canonical poker spot with server-authoritative grading and
 * streak tracking. One challenge per day, changes at midnight Central Time.
 *
 * Route: /hub/training/daily-challenge
 * ●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●
 */

// TRAIN-CATCH-FIX-1 - replaced silent catch blocks with console.warn-backed handlers
// TRAIN-CSS-TOKENS-BATCH4-15 - hex sweep batch 4: literals routed to --sp-* tokens
// TRAIN-CSS-GRADIENT-ADOPT-7 - gradient hex routed to rgba(var(--sp-*-rgb), 1)
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
import { trainingSourcePresentation } from '../../../src/lib/training/cacheTruthContract.mjs';
import styles from '../../../src/styles/training/daily-challenge-casino.module.css';
// TRAIN-WIRE-FX-4d - adoption: feedback hook for daily-challenge.fresh.js

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
    <div className={styles.countdown}>
      <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
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
    <div className={styles.streakGrid} aria-label="Thirty Day Challenge History">
      {days.map((d) => (
        <div
          key={d.key}
          className={`${styles.streakDay} ${d.isCompleted ? styles.streakDayComplete : ''} ${d.isToday ? styles.streakDayToday : ''}`}
          aria-label={`${d.key}: ${d.isCompleted ? 'Completed' : d.isToday ? 'Today' : 'Not Completed'}`}
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
        || !/^[0-9a-f]{64}$/i.test(String(challenge.policyChecksum || ''))
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
            policyChecksum: challenge.policyChecksum,
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
  const awardedDiamonds = Number(completion?.diamondsEarned ?? completion?.diamondsAwarded);
  const hasAwardedDiamonds = Number.isFinite(awardedDiamonds) && awardedDiamonds > 0;
  const recordStatus = completing
    ? 'Saving'
    : completion
      ? 'Saved'
      : completionPending
        ? 'Retry'
        : showResult
          ? 'Recorded'
          : challenge?._gradingContext?.receipt
            ? 'Sealed'
            : 'Waiting';
  const sourceBadge = trainingSourcePresentation(challenge?.sourceClassification);

  return (
    <>
      <Head>
        <title>Daily Training Challenge | Smarter.Poker</title>
        <meta
          name="description"
          content="A daily source-classified poker spot with signed delivery, server grading, and verified streak tracking."
        />
      </Head>

      <main className={`sp-training-command sp-training-command--daily ${styles.shell}`}>
        <header className={`sp-command-header ${styles.marquee}`}>
          <div className={styles.marqueeArtwork} aria-hidden="true" />
          <div className={styles.marqueeContent}>
            <button
              type="button"
              onClick={() => router.push('/hub/training')}
              aria-label="Back To Training"
              className={styles.backButton}
            >
              <span aria-hidden="true">‹</span> Training
            </button>
            <div className={styles.titleBlock}>
              <span className={styles.eyebrow} title={sourceBadge.title}>{sourceBadge.label} · One Seat · One Shot</span>
              <h1>Daily Challenge</h1>
              <p>Read The Table. Lock Your Decision. Review The Verified Result When You Are Ready.</p>
            </div>
            <div className={styles.clockBay}>
              <span>Table Resets</span>
              {expiresAt ? <CountdownTimer expiresAt={expiresAt} /> : <strong>Awaiting Dealer</strong>}
            </div>
          </div>
        </header>

        <div className={`sp-command-main ${styles.commandDeck}`}>
          <section className={styles.metrics} aria-label="Daily Challenge Status">
            <div><span>Current Run</span><strong>{currentStreak}</strong><small>Day Streak</small></div>
            <div><span>History</span><strong>{completedDays.length}</strong><small>Days Completed</small></div>
            <div className={styles.rewardMetric}><span>Decision Record</span><strong>{recordStatus}</strong><small>Server Status</small></div>
          </section>

          {error && (
            <div className={styles.errorBay} role="alert">
              <span>{error}</span>
              <button
                type="button"
                onClick={fetchChallenge}
                aria-label="Retry Loading Today's Challenge"
              >
                Retry Challenge
              </button>
            </div>
          )}

          {loading && (
            <div className={styles.loadingBay} role="status">
              <span className={styles.dealerLight} aria-hidden="true" />
              <strong>Dealing Today's Challenge</strong>
              <small>Synchronizing Signed Challenge</small>
            </div>
          )}

          {!loading && challenge && (
            <motion.div className={styles.challengeStage} initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
              <div className={styles.challengeLayout}>
                <article className={styles.feltTable} aria-labelledby="daily-spot-question">
                  <div className={styles.tableRail}>
                    <div className={styles.spotMeta}>
                      <span>Today's Table</span>
                      {position && <strong>{position}</strong>}
                      {street && <strong>{street}</strong>}
                    </div>
                    {alreadyCompleted && <div className={styles.completedStamp}>Challenge Completed</div>}
                  </div>

                  <div className={styles.cardLayout}>
                    {Array.isArray(board) && board.length > 0 && (
                      <div className={styles.cardZone}>
                        <span>Board</span>
                        <div className={styles.cards}>
                          {board.map((card, i) => (
                            <Card
                              key={i}
                              rank={card[0]?.toUpperCase()}
                              suit={card[1]?.toLowerCase()}
                              size="small"
                            />
                          ))}
                        </div>
                      </div>
                    )}
                    {heroHand && (
                      <div className={`${styles.cardZone} ${styles.heroZone}`}>
                        <span>Your Hand</span>
                        <div className={styles.cards}>
                          {handToCards(heroHand).map((card, i) => (
                            <Card key={i} rank={card.rank} suit={card.suit} size="small" />
                          ))}
                        </div>
                      </div>
                    )}
                  </div>

                  <div className={styles.decisionWell}>
                    <span>Decision Required</span>
                    <h2 id="daily-spot-question">{scenario}</h2>
                  </div>

                  <div className={styles.actionKeys} aria-label="Challenge Actions">
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
                    <div className={styles.explanation} role="status" aria-live="polite">
                      Verifying And Recording Your Answer...
                    </div>
                  )}
                </article>

                <aside className={styles.pitRail} aria-label="Challenge Progress And Rules">
                  <section className={styles.streakPanel}>
                    <div className={styles.panelHeading}>
                      <span>Last Thirty Days</span>
                      <strong>{currentStreak} Day Run</strong>
                    </div>
                    <StreakCalendar
                      completedDays={completedDays}
                      todayKey={String(dailyId || '').replace(/^daily-/, '')}
                    />
                    <div className={styles.legend}>
                      <span><i className={styles.completeKey} /> Completed</span>
                      <span><i className={styles.todayKey} /> Today</span>
                    </div>
                  </section>
                  <section className={styles.rulesPanel}>
                    <span>House Rules</span>
                    <h2>One Canonical Policy Spot Every Day</h2>
                    <p>
                      Choose Once. The Training Service Grades And Saves The Signed Decision. Any
                      Reward Or Streak Change Appears Only After The Server Confirms Completion.
                    </p>
                    <div title={sourceBadge.title}><strong>{sourceBadge.label}</strong><small>Source Classification</small></div>
                    <div><strong>Manual</strong><small>Continue Control</small></div>
                  </section>
                </aside>
              </div>

              <AnimatePresence>
                {showResult && (
                  <motion.div
                    className={`${styles.resultDrawer} ${resultIsCorrect ? styles.resultCorrect : styles.resultIncorrect}`}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                  >
                    <div className={styles.feedbackWrap}>
                      <FeedbackCard
                        verdict={resultIsCorrect ? 'correct' : 'incorrect'}
                        userAction={options.find((option) => option.id === selected)?.text || selected || ''}
                        solverAction={feedback?.solverVerified === true ? correctAnswerText : undefined}
                        referenceLabel={sourceBadge.label}
                        evLoss={feedback?.evLossMeasured === true
                          && Number.isFinite(Number(feedback?.evLoss))
                          ? Number(feedback.evLoss)
                          : undefined}
                        whyShort={feedback?.solverVerified
                          ? (resultIsCorrect ? 'Solver Correct.' : `Solver Prefers ${correctAnswerText}.`)
                          : (resultIsCorrect ? 'Correct.' : `The Canonical Answer Is ${correctAnswerText}.`)}
                        compact
                      />
                    </div>
                    <div className={styles.answerReadout}>
                      {feedback?.solverVerified === true ? 'Solver Verified' : 'Audited'} Answer: {correctAnswerText}
                    </div>

                    {frequencies && feedback?.solverVerified === true && (
                      <div className={styles.frequencyBlock}>
                        <span>Solver Frequencies</span>
                        <div>
                          {Object.entries(frequencies)
                            .sort(([, a], [, b]) => b - a)
                            .map(([action, frequency]) => (
                              <span
                                key={action}
                                data-optimal={action === correctAnswer || action === correctAnswerText || undefined}
                              >
                                {action}: {frequency}%
                              </span>
                            ))}
                        </div>
                      </div>
                    )}

                    {explanation && (
                      <div className={styles.explanation}>{explanation}</div>
                    )}

                    <div className={styles.resultActions}>
                      {completing && (
                        <div className={styles.rewardWin} role="status" aria-live="polite">
                          Answer Recorded. Verifying Completion...
                        </div>
                      )}

                      {completion && (
                        <motion.div
                          className={styles.rewardWin}
                          initial={{ scale: 0.9, opacity: 0 }}
                          animate={{ scale: 1, opacity: 1 }}
                        >
                          Daily Challenge Complete{hasAwardedDiamonds ? ` · +${awardedDiamonds} Diamonds` : ''}
                        </motion.div>
                      )}

                      {completionPending && !completing && (
                        <button
                          className={styles.shareButton}
                          type="button"
                          onClick={() => completeDailyAttempt(
                            activeAttemptId,
                            completionResponseTimeRef.current,
                          )}
                          aria-label="Retry Saving Daily Challenge Completion"
                        >
                          Retry Completion
                        </button>
                      )}

                      {(completion || alreadyCompleted) && !completionPending && !completing && (
                        <button
                          className={styles.shareButton}
                          type="button"
                          onClick={() => router.push('/hub/training')}
                          aria-label="Continue To Training Hub"
                        >
                          Continue To Training Hub
                        </button>
                      )}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>

              {alreadyCompleted && !showResult && (
                <div className={`${styles.resultDrawer} ${styles.resultCorrect}`}>
                  <div className={styles.explanation}>
                    Your Sealed Completion Is Saved. Detailed Feedback Is Temporarily Unavailable.
                  </div>
                  <div className={styles.resultActions}>
                    <button
                      className={styles.shareButton}
                      type="button"
                      onClick={() => router.push('/hub/training')}
                      aria-label="Continue To Training Hub"
                    >
                      Continue To Training Hub
                    </button>
                  </div>
                </div>
              )}
            </motion.div>
          )}

          {!loading && !challenge && !error && (
            <div className={styles.emptyBay}>
              <strong>No Challenge At The Table</strong>
              <span>Check Back Soon For The Next Audited Spot.</span>
            </div>
          )}
        </div>
      </main>
      <ConnectionToast />
    </>
  );
}
