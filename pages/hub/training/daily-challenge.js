/**
 * Daily GTO Challenge - Hand of the Day
 * ●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●
 * Phase 24: Daily solver-verified GTO spot with leaderboard and streak
 * tracking. One challenge per day, changes at midnight UTC.
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
import { eventBus, EventType, busEmit } from '../../../src/engine/EventBus';
import Card, { parseCards } from '../../../src/components/training/Card';
import { authedFetch, getAuthUser } from '../../../src/lib/authUtils';
import ConnectionToast from '../../../src/components/training/ConnectionToast';
import { useTrainingFeedback } from '../../../src/hooks/useTrainingFeedback';
import QuizAnswer from '../../../src/components/poker/QuizAnswer';
import FeedbackCard from '../../../src/components/poker/FeedbackCard';
import { toast } from '../../../src/stores/toastStore';
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

function StreakCalendar({ completedDays }) {
  const days = [];
  const today = new Date();
  for (let i = 29; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    const key = d.toISOString().split('T')[0];
    const isCompleted = completedDays.includes(key);
    const isToday = i === 0;
    days.push({ key, isCompleted, isToday, day: d.getDate() });
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
  const [showResult, setShowResult] = useState(false);
  const [alreadyCompleted, setAlreadyCompleted] = useState(false);
  const [completedDays, setCompletedDays] = useState([]);
  const [currentStreak, setCurrentStreak] = useState(0);
  const [sharingResult, setSharingResult] = useState(false);
  const [pendingSave, setPendingSave] = useState(null);
  const [savingAnswer, setSavingAnswer] = useState(false);
  const answered = useRef(false);

  // Fetch daily challenge
  const fetchChallenge = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await authedFetch('/api/training/hand-of-the-day');
      if (!res.ok) throw new Error(`Request failed (${res.status})`);
      const data = await res.json();
      if (data.success) {
        setChallenge(data.question);
        setDailyId(data.dailyId);
        setExpiresAt(data.expiresAt);
        answerStartRef.current = Date.now(); // Reset timer when challenge loads

        // Check local storage for prior completion today
        const today = String(data.dailyId || '').replace(/^daily-/, '');
        const todayKey = `daily-challenge-${today}`;
        const prior = localStorage.getItem(todayKey);
        if (data.completion) {
          setAlreadyCompleted(true);
          setSelected(data.completion.selected_action || null);
          setPersistedCorrect(Number(data.completion.score) >= 100);
          setShowResult(true);
          answered.current = true;
        } else if (prior) {
          const parsed = JSON.parse(prior);
          setAlreadyCompleted(true);
          setSelected(parsed.selected);
          setPersistedCorrect(Boolean(parsed.isCorrect));
          setShowResult(true);
          answered.current = true;
          if (parsed.serverSaved === false) {
            setPendingSave({ action: parsed.selected, isCorrect: Boolean(parsed.isCorrect), today });
            setError('Your Answer Is Safe On This Device, But It Still Needs To Be Saved. Tap Retry Save Below.');
          }
        }

        // Load streak data from local storage
        let streakData = Array.isArray(data.completedDays) ? data.completedDays : [];
        if (streakData.length === 0) {
          try { streakData = JSON.parse(localStorage.getItem('daily-challenge-streak') || '[]'); } catch (_err) { if (typeof console !== "undefined" && console.warn) console.warn(`[daily-challenge] swallowed:`, _err); /* TRAIN-CATCH-FIX-1 */ }
        }
        setLoading(false);
        setCompletedDays(streakData);

        // Calculate current streak
        let streak = 0;
        const d = new Date();
        for (let i = 0; i < 365; i++) {
          const key = d.toISOString().split('T')[0];
          if (streakData.includes(key) || (i === 0 && prior)) {
            streak++;
          } else if (i > 0) {
            break;
          }
          d.setDate(d.getDate() - 1);
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
  }, []);

  // Bus listener
  useEffect(() => {
    const unsub = eventBus.on(EventType?.SESSION_END || 'session:end', () => fetchChallenge());
    return unsub;
  }, [fetchChallenge]);

  const saveAnswer = useCallback(async ({ action, isCorrect, today }) => {
    const user = getAuthUser();
    if (!user?.id) {
      const storageKey = `daily-challenge-${today}`;
      try {
        const localResult = JSON.parse(localStorage.getItem(storageKey) || '{}');
        localStorage.setItem(storageKey, JSON.stringify({ ...localResult, serverSaved: true }));
      } catch (storageError) {
        console.warn('[DailyChallenge] Could Not Finalize Local Result:', storageError?.message || storageError);
      }
      return true;
    }
    const saveResponse = await authedFetch('/api/training/hand-of-the-day', {
      method: 'POST',
      body: JSON.stringify({
        dailyId: dailyId || `daily-${today}`,
        selectedAction: action,
        policyChecksum: challenge?.policyChecksum || null,
      }),
    });
    const saved = await saveResponse.json().catch(() => null);
    if (!saveResponse.ok || saved?.success === false) {
      throw new Error(saved?.error || 'Daily Result Could Not Be Saved');
    }
    const storageKey = `daily-challenge-${today}`;
    try {
      const localResult = JSON.parse(localStorage.getItem(storageKey) || '{}');
      localStorage.setItem(storageKey, JSON.stringify({ ...localResult, serverSaved: true }));
    } catch (storageError) {
      console.warn('[DailyChallenge] Could Not Mark Local Result As Saved:', storageError?.message || storageError);
    }
    setPendingSave(null);
    return true;
  }, [challenge?.policyChecksum, dailyId]);

  // Handle answer
  const handleAnswer = useCallback(
    async (action) => {
      if (answered.current || !challenge) return;
      answered.current = true;
      setSelected(action);
      setShowResult(true);

      const correctAction = challenge.correct_answer || challenge.gto_action;
      const isCorrect = action === correctAction;
      setPersistedCorrect(isCorrect);
      if (isCorrect) fb.correct(); else fb.incorrect();

      // Save to local storage
      const today = String(dailyId || '').replace(/^daily-/, '');
      localStorage.setItem(
        `daily-challenge-${today}`,
        JSON.stringify({
          selected: action,
          isCorrect,
          serverSaved: false,
          timestamp: Date.now(),
        })
      );

      // Update streak
      let streakData = [];
      try { streakData = JSON.parse(localStorage.getItem('daily-challenge-streak') || '[]'); } catch (_err) { if (typeof console !== "undefined" && console.warn) console.warn(`[daily-challenge] swallowed:`, _err); /* TRAIN-CATCH-FIX-1 */ }
      if (!streakData.includes(today)) {
        streakData.push(today);
        localStorage.setItem('daily-challenge-streak', JSON.stringify(streakData));
        setCompletedDays([...streakData]);
      }

      // Record on server and surface persistence failures.
      try {
        await saveAnswer({ action, isCorrect, today });
      } catch (saveError) {
        console.warn('[DailyChallenge] Save failed:', saveError?.message || saveError);
        setPendingSave({ action, isCorrect, today });
        setError('Your Answer Is Safe On This Device, But It Could Not Be Saved. Tap Retry Save Below.');
      }

      // Emit bus events
      try {
        const responseTimeMs = Date.now() - answerStartRef.current;

        // Answer speed for Leak Detection telemetry
        if (bus?.emitAnswerSpeed) bus.emitAnswerSpeed(responseTimeMs, { is_correct: isCorrect });

        // Streak update propagation
        if (bus?.emitStreakUpdate) {
          const streakData = JSON.parse(localStorage.getItem('daily-challenge-streak') || '[]');
          bus.emitStreakUpdate(streakData.length);
        }

        // Card exposure tracking
        if (bus?.emitCardViewed && challenge?.board_cards)
          bus.emitCardViewed(challenge.board_cards);

        eventBus?.emit?.(
          'training:daily-challenge-completed',
          { accuracy: isCorrect ? 100 : 0, responseTimeMs },
          'DailyChallenge'
        );
        busEmit.sessionEnd('DailyChallenge');
      } catch (_) { console.warn('[App] Handled exception:', _?.message || _); }
    },
    [challenge, bus, dailyId, fb, saveAnswer]
  );

  // Derive question data
  const options = challenge?.options || challenge?.choices || ['Fold', 'Call', 'Raise', 'All-In'];
  const correctAnswer = challenge?.correct_answer || challenge?.gto_action || options[0];
  const board = challenge?.board_cards || challenge?.board || [];
  const heroHand = challenge?.hero_hand || challenge?.hand || '';
  const scenario = challenge?.scenario_text || challenge?.question || 'What is the GTO play?';
  const explanation = challenge?.explanation || challenge?.gto_explanation || '';
  const frequencies = challenge?.action_breakdown || challenge?.gto_frequencies || null;
  const position = challenge?.hero_position || challenge?.position || '';
  const street = challenge?.street || '';
  const resultIsCorrect = persistedCorrect ?? (selected === correctAnswer);
  const sourceBadge = trainingSourcePresentation(challenge?.sourceClassification);

  return (
    <>
      <Head>
        <title>Daily GTO Challenge | Smarter.Poker</title>
        <meta
          name="description"
          content="Daily source-classified poker policy spot. Test your skills, track your streak, and compete on the leaderboard."
        />
      </Head>

      <main className={`sp-training-command sp-training-command--daily ${styles.shell}`}>
        <header className={`sp-command-header ${styles.marquee}`}>
          <div className={styles.marqueeArtwork} aria-hidden="true" />
          <div className={styles.marqueeContent}>
            <button type="button" onClick={() => router.push('/hub/training')} aria-label="Back To Training" className={styles.backButton}>
              <span aria-hidden="true">‹</span> Training
            </button>
            <div className={styles.titleBlock}>
              <span className={styles.eyebrow} title={sourceBadge.title}>{sourceBadge.label} · One Seat · One Shot</span>
              <h1>Daily Challenge</h1>
              <p>Read The Table. Lock Your Decision. Protect Your Streak.</p>
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
            <div className={styles.rewardMetric}><span>Perfect Read</span><strong>{DAILY_CHALLENGE_DIAMOND_REWARD}</strong><small>Diamonds</small></div>
          </section>

          {error && (
            <div className={styles.errorBay} role="alert">
              <span>{error}</span>
              <button type="button" onClick={fetchChallenge} aria-label="Retry Loading Today's Challenge">Retry Challenge</button>
            </div>
          )}

          {loading && (
            <div className={styles.loadingBay} role="status">
              <span className={styles.dealerLight} aria-hidden="true" />
              <strong>Dealing Today’s Challenge</strong>
              <small>Synchronizing Solver Evidence</small>
            </div>
          )}

          {!loading && challenge && (
            <motion.div className={styles.challengeStage} initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
              <div className={styles.challengeLayout}>
                <article className={styles.feltTable} aria-labelledby="daily-spot-question">
                  <div className={styles.tableRail}>
                    <div className={styles.spotMeta}>
                      <span>Today’s Table</span>
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
                      {handToCards(heroHand).map((c, i) => (
                        <Card key={i} rank={c.rank} suit={c.suit} size="small" />
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
                    key={action}
                    label={action}
                    shortcut={idx + 1}
                    selected={selected === action}
                    correct={action === correctAnswer}
                    show={showResult}
                    onClick={() => handleAnswer(action)}
                    ariaLabel={`Choose ${action}`}
                    size="md"
                  />
                ))}
                  </div>
                </article>

                <aside className={styles.pitRail} aria-label="Challenge Progress And Rules">
                  <section className={styles.streakPanel}>
                    <div className={styles.panelHeading}><span>Last Thirty Days</span><strong>{currentStreak} Day Run</strong></div>
                    <StreakCalendar completedDays={completedDays} />
                    <div className={styles.legend}><span><i className={styles.completeKey} /> Completed</span><span><i className={styles.todayKey} /> Today</span></div>
                  </section>
                  <section className={styles.rulesPanel}>
                    <span>House Rules</span>
                    <h2>One Canonical Policy Spot Every Day</h2>
                    <p>Lock The Best Policy Action To Extend Your Streak And Earn {DAILY_CHALLENGE_DIAMOND_REWARD} Diamonds. The Table Resets At Midnight Central Time.</p>
                    <div title={sourceBadge.title}><strong>{sourceBadge.label}</strong><small>Source Classification</small></div>
                    <div><strong>Worldwide</strong><small>Daily Leaderboard</small></div>
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
                        userAction={selected || ''}
                        solverAction={correctAnswer}
                        referenceLabel={sourceBadge.label}
                        evLoss={resultIsCorrect ? 0 : undefined}
                        whyShort={resultIsCorrect ? "Policy-correct." : `The canonical policy prefers ${correctAnswer}.`}
                        compact
                      />
                    </div>
                    <div className={styles.answerReadout}>
                      Policy Answer: {correctAnswer}
                    </div>

                    {frequencies && (
                      <div className={styles.frequencyBlock}>
                        <span>Policy Frequencies</span>
                        <div>
                          {Object.entries(frequencies || {})
                            .sort(([, a], [, b]) => b - a)
                            .map(([act, freq]) => (
                              <span
                                key={act}
                                data-optimal={act === correctAnswer || undefined}
                              >
                                {act}: {freq}%
                              </span>
                            ))}
                        </div>
                      </div>
                    )}

                    {explanation && (
                      <div className={styles.explanation}>
                        {explanation}
                      </div>
                    )}

                    {(!alreadyCompleted || pendingSave) && (
                      <div className={styles.resultActions}>
                        {resultIsCorrect && !alreadyCompleted && (
                          <motion.div
                            className={styles.rewardWin}
                            initial={{ scale: 0.9, opacity: 0 }}
                            animate={{ scale: 1, opacity: 1 }}
                            transition={{ delay: 0.3 }}
                          >
                            Perfect Read · +{DAILY_CHALLENGE_DIAMOND_REWARD} Diamonds
                          </motion.div>
                        )}
                        {pendingSave && (
                          <button
                            className={styles.shareButton}
                            type="button"
                            disabled={savingAnswer}
                            onClick={async () => {
                              if (savingAnswer) return;
                              setSavingAnswer(true);
                              try {
                                await saveAnswer(pendingSave);
                                setError(null);
                                toast.success('Daily Challenge Result Saved!');
                              } catch (retryError) {
                                console.warn('[DailyChallenge] Retry Save Failed:', retryError?.message || retryError);
                                setError('Your Answer Is Still Safe On This Device. Saving Failed Again, So Please Retry.');
                              } finally {
                                setSavingAnswer(false);
                              }
                            }}
                          >
                            {savingAnswer ? 'Saving Result' : 'Retry Save'}
                          </button>
                        )}
                        <button
                          className={styles.shareButton}
                          type="button"
                          aria-label="Share Result To Your Social Feed"
                          disabled={sharingResult}
                          onClick={async () => {
                            if (sharingResult) return;
                            setSharingResult(true);
                            try {
                              const user = getAuthUser();
                              if (!user?.id) { setSharingResult(false); return; }
                              const res = await authedFetch('/api/training/share', {
                                method: 'POST',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({
                                  userId: user.id,
                                  shareType: 'session_complete',
                                  data: {
                                    gameName: 'Daily GTO Challenge',
                                    accuracy: resultIsCorrect ? 100 : 0,
                                  },
                                }),
                              });
                              const d = await res.json();
                              if (d.success) toast.success('Result Shared To Your Feed!');
                              else toast.error(d.error || 'Failed To Share Result.');
                            } catch (err) {
                              console.warn('Share error:', err);
                            } finally {
                              setSharingResult(false);
                            }
                          }}
                        >
                          {sharingResult ? 'Sharing Result' : 'Share Result'}
                        </button>
                      </div>
                    )}
                  </motion.div>
                )}
              </AnimatePresence>

            </motion.div>
          )}

          {!loading && !challenge && !error && (
            <div className={styles.emptyBay}>
              <strong>No Challenge At The Table</strong>
              <span>Check Back Soon For The Next Solver Spot.</span>
            </div>
          )}
        </div>
      </main>
      <ConnectionToast />
    </>
  );
}
