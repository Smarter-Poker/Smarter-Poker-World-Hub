/**
 * TIME ATTACK GAME - 30 seconds, answer as many as possible
 * Printed on the Trivia console glass (#ClubArenaConsole): live figures,
 * the shared answer rows and the report word; no frame, icon or motion chrome.
 * Speed creates adrenaline, 1 diamond per correct answer (capped daily)
 *
 * Grading is server-authoritative: the page supplies an async serverGrader
 * ({ questionId, displayIndex } -> verdict) backed by
 * /api/trivia/session-answer, and the reveal is driven by the verdict's
 * correctDisplayIndex. Served questions carry NO correct_index, so the
 * component holds no answer key and cannot grade locally.
 */

import React, { useState, useEffect, useRef } from 'react';
import { busEmit } from '../../engine/EventBus';
import { DAILY_DIAMOND_CAPS } from '../../lib/trivia/triviaEngine';
import TriviaAnswerOption from './TriviaAnswerOption';
import TriviaCardText from './TriviaCardText';
import TriviaNetworkBanner from './TriviaNetworkBanner';
import ReportQuestionButton from './ReportQuestionButton';
import { getAccessToken } from '../../lib/authUtils';
import { triggerTriviaHaptic } from '../../lib/trivia/triviaHaptics';
import useTriviaKeyboardControls from '../../hooks/useTriviaKeyboardControls';
import usePhase9ReducedMotion from './phase9/usePhase9ReducedMotion';

const GAME_DURATION = 30; // seconds
// Single source of truth for the cap lives in triviaEngine.
const DAILY_DIAMOND_CAP = DAILY_DIAMOND_CAPS?.['time-attack'] ?? 5;
const LOAD_MORE_THRESHOLD = 5;
const POST_ADVANCE_TAP_GUARD_MS = 220;

export default function TimeAttackGame({
    questions = [],
    onComplete,
    onLoadMoreQuestions,
    dailyDiamondsEarned = 0,
    // Optional: supabase access token for the per-question report button.
    // /api/trivia/report-question requires a Bearer token, so when the page
    // does not supply one we resolve it from the live session below.
    userToken = null,
    sessionId = null,
    accountId = null,
    // Server-authoritative grader (same contract as TriviaGame's):
    //   async ({questionId, displayIndex}) =>
    //     {wasCorrect, correctDisplayIndex, explanation}
    // Server-dealt questions have NO correct_index, so without a grader the
    // component cannot grade at all - time-attack.js (the only consumer)
    // always passes one; handleAnswer guards against a missing prop.
    serverGrader = null
}) {
    const [currentIndex, setCurrentIndex] = useState(0);
    const [correctCount, setCorrectCount] = useState(0);
    const [wrongCount, setWrongCount] = useState(0);
    const [timeLeft, setTimeLeft] = useState(GAME_DURATION);
    const [selectedAnswer, setSelectedAnswer] = useState(null);
    const [isRevealing, setIsRevealing] = useState(false);
    // Current question's server verdict; null while the session-answer call is
    // in flight (nothing is revealed until it resolves), cleared on advance.
    const [verdict, setVerdict] = useState(null);
    const [gameOver, setGameOver] = useState(false);
    const [diamondsEarned, setDiamondsEarned] = useState(0);
    const [fastAnswers, setFastAnswers] = useState(0);
    const [answerError, setAnswerError] = useState(null);
    const answerStartTime = useRef(Date.now());
    const answersRef = useRef([]); // Track per-question correct/incorrect
    // Synchronous ref lock prevents same-frame double-taps from firing
    // duplicate serverGrader calls or double-advancing currentIndex.
    const answerLockRef = useRef(false);
    // Stores the failed in-flight answer intent so reconnect can idempotently
    // replay the exact same choice while respecting answerLockRef & timeLeft.
    const pendingAnswerRef = useRef(null);
    // Brief tap cooldown after auto-advance prevents a late tap from landing
    // on the newly rendered question's option.
    const postAdvanceGuardUntilRef = useRef(0);
    const reduceMotion = usePhase9ReducedMotion();

    const currentQuestion = questions[currentIndex];
    const remainingCap = Math.max(0, DAILY_DIAMOND_CAP - dailyDiamondsEarned);

    // The report button needs a Bearer token. Prefer the one the page passes;
    // otherwise read the live session (client-only, so do it in an effect).
    const [reportToken, setReportToken] = useState(userToken || null);
    useEffect(() => {
        if (userToken) { setReportToken(userToken); return; }
        try { setReportToken(getAccessToken() || null); }
        catch (e) { console.warn('[TimeAttackGame] token lookup failed:', e?.message || e); }
    }, [userToken]);

    // Phase 69: track the 400ms reveal-and-advance setTimeouts so unmount
    // cancels them. Without this, navigating away mid-question fired
    // setState (correct count, advance, etc.) on an unmounted component.
    // Plus _completedRef so handleGameOver doesn't double-fire onComplete
    // if both the timer and the last-question handler set gameOver=true
    // in the same tick.
    const _pendingTimeoutsRef = useRef(new Set());
    const _isMountedRef = useRef(true);
    const _completedRef = useRef(false);
    const safeSetTimeout = (fn, delay) => {
        const id = setTimeout(() => {
            _pendingTimeoutsRef.current.delete(id);
            if (_isMountedRef.current) fn();
        }, delay);
        _pendingTimeoutsRef.current.add(id);
        return id;
    };
    useEffect(() => () => {
        _isMountedRef.current = false;
        for (const id of _pendingTimeoutsRef.current) clearTimeout(id);
        _pendingTimeoutsRef.current.clear();
    }, []);

    // Set when the clock expires mid-reveal: the pending answer must be
    // counted BEFORE the game ends. Previously the [gameOver] effect fired
    // onComplete immediately with the pre-answer counts and the reveal
    // timeout landed afterwards, so the player's last (possibly
    // milestone-earning) answer was excluded from the payload, the score
    // save and the diamond count.
    const pendingGameOverRef = useRef(false);

    // Main timer. The updater only decrements — deciding to end the game
    // inside a state updater is a side effect that React 18 StrictMode
    // double-invokes.
    useEffect(() => {
        if (gameOver) return undefined;

        const timer = setInterval(() => {
            setTimeLeft(prev => (prev <= 1 ? 0 : prev - 1));
        }, 1000);

        return () => clearInterval(timer);
    }, [gameOver]);

    useEffect(() => {
        if (gameOver || timeLeft > 0) return;
        if (isRevealing) {
            pendingGameOverRef.current = true;
            return;
        }
        setGameOver(true);
    }, [timeLeft, gameOver, isRevealing]);

    // Reset answer timer and release the synchronous answer lock only once
    // the next question has actually rendered.
    useEffect(() => {
        answerStartTime.current = Date.now();
        answerLockRef.current = false;
        pendingAnswerRef.current = null;
        if (currentIndex > 0) {
            postAdvanceGuardUntilRef.current = Date.now() + POST_ADVANCE_TAP_GUARD_MS;
        }
    }, [currentIndex]);

    // Top up the pool before it runs dry. time-attack.js currently passes a
    // large pool, but the 60-day non-repeat product goal will shrink pools
    // over time and this mode used to just hard-end the game when exhausted.
    useEffect(() => {
        if (!onLoadMoreQuestions || gameOver) return;
        if (questions.length > 0 && currentIndex >= questions.length - LOAD_MORE_THRESHOLD) {
            onLoadMoreQuestions();
        }
    }, [currentIndex, questions.length, onLoadMoreQuestions, gameOver]);

    const handleAnswer = (answerIndex) => {
        if (
            answerLockRef.current
            || isRevealing
            || gameOver
            || !currentQuestion
            || Date.now() < postAdvanceGuardUntilRef.current
        ) return;

        answerLockRef.current = true;
        triggerTriviaHaptic('tap');
        const answerTime = (Date.now() - answerStartTime.current) / 1000;
        setAnswerError(null);
        setSelectedAnswer(answerIndex);
        setIsRevealing(true);

        if (!serverGrader) {
            // No grader means no grading: served questions carry no answer
            // key. Release the tap instead of wedging the run - this only
            // happens on a wiring mistake, never in normal play.
            console.warn('[TimeAttackGame] serverGrader prop missing - cannot grade answer');
            answerLockRef.current = false;
            setSelectedAnswer(null);
            setIsRevealing(false);
            return;
        }

        pendingAnswerRef.current = {
            questionId: currentQuestion.id,
            displayIndex: answerIndex,
        };

        // The tap locks synchronously; every side effect waits for the server
        // verdict. The first answer per question is binding server-side, so a
        // failed call is safe to re-tap - a retry replays the stored verdict
        // instead of double-recording.
        serverGrader({ questionId: currentQuestion.id, displayIndex: answerIndex })
            .then((v) => {
                if (!_isMountedRef.current) return;
                pendingAnswerRef.current = null;
                setVerdict(v);
                triggerTriviaHaptic(v?.wasCorrect === true ? 'correct' : 'wrong');
                resolveAnswer(v?.wasCorrect === true, answerTime);
            })
            .catch((err) => {
                console.warn('[TimeAttackGame] serverGrader failed, unlocking for retry:', err?.message || err);
                if (!_isMountedRef.current) return;
                answerLockRef.current = false;
                setSelectedAnswer(null);
                setIsRevealing(false);
                setAnswerError('Could Not Submit That Answer. Tap The Same Answer Again.');
            });
    };

    const retryPendingAnswer = () => {
        if (
            !serverGrader
            || gameOver
            || timeLeft <= 0
            || answerLockRef.current
            || isRevealing
            || !currentQuestion
        ) return;
        const pending = pendingAnswerRef.current;
        if (!pending || pending.questionId !== currentQuestion.id) return;
        handleAnswer(pending.displayIndex);
    };

    // Side effects + advance for a settled verdict. The reveal itself is
    // driven by verdict.correctDisplayIndex in the render below; this runs
    // the 400ms reveal window and then moves on.
    // Phase 69: safeSetTimeout instead of setTimeout — was firing
    // setState on unmounted parent.
    const resolveAnswer = (isCorrect, answerTime) => {
        safeSetTimeout(() => {
            if (isCorrect) {
                const newCorrect = correctCount + 1;
                setCorrectCount(newCorrect);
                answersRef.current.push(true);
                busEmit.decisionCorrect(newCorrect);

                // Track fast answers (under 3 seconds)
                if (answerTime < 3) {
                    setFastAnswers(prev => prev + 1);
                }

                // Per-correct economy: 1 diamond per correct answer, matching
                // calculateDiamonds' count-based branch. Display-clamped to
                // what the daily cap can still pay; the real payout is capped
                // server-side at submit.
                setDiamondsEarned(prev => Math.min(remainingCap, prev + 1));
            } else {
                setWrongCount(prev => prev + 1);
                answersRef.current.push(false);
                busEmit.decisionIncorrect(correctCount);
                if (!reduceMotion) busEmit.screenShake('light');
            }

            // The clock ran out while this answer was revealing — end now that
            // the answer has been counted.
            if (pendingGameOverRef.current) {
                pendingGameOverRef.current = false;
                setGameOver(true);
                return;
            }

            // Quick next question
            if (currentIndex < questions.length - 1) {
                setCurrentIndex(prev => prev + 1);
                setSelectedAnswer(null);
                setVerdict(null);
                setIsRevealing(false);
            } else {
                setGameOver(true);
            }
        }, 400); // Fast reveal for speed mode
    };

    const handleGameOver = () => {
        // _completedRef was declared and documented as the double-fire guard
        // but was never actually checked.
        if (_completedRef.current) return;
        _completedRef.current = true;
        onComplete?.({
            correctCount,
            wrongCount,
            diamondsEarned: Math.min(diamondsEarned, remainingCap),
            fastAnswers,
            answerResults: [...answersRef.current], // Per-question true/false array
            mode: 'time-attack'
        });
    };

    useEffect(() => {
        if (gameOver) {
            handleGameOver();
        }
    }, [gameOver]);

    useTriviaKeyboardControls({
        enabled: !gameOver && Boolean(currentQuestion) && timeLeft > 0,
        optionCount: currentQuestion?.options?.length || 0,
        canSelect: !isRevealing && !answerLockRef.current && timeLeft > 0,
        canAdvance: false,
        onSelectOption: handleAnswer,
    });

    if (!currentQuestion && !gameOver) {
        return (
            <div className="trivia-challenge-state trivia-challenge-state--loading" role="status">
                <p>Loading Questions</p>
            </div>
        );
    }

    const warning = timeLeft <= 10;
    const isPendingAnswer = isRevealing && verdict == null;
    return (
        <div className="time-attack-game" data-game-over={gameOver ? 'true' : 'false'}>
            {/* The clock: live seconds printed on the glass (ice blue, red at ten
                seconds and under) over a native meter that drains with it. */}
            <div className="time-attack-clock" data-warning={warning ? 'true' : 'false'}>
                <p className="trivia-challenge-progress-label">
                    <span>Seconds Left</span>
                    <span className={`time-attack-clock__value tc-ink--${warning ? 'red' : 'cyan'}`} role="timer" aria-live="off">
                        {timeLeft}
                    </span>
                </p>
                <progress
                    className="trivia-challenge-progress time-attack-meter"
                    max={GAME_DURATION}
                    value={timeLeft}
                    aria-label={`${timeLeft} Seconds Left`}
                />
            </div>

            {/* Live run figures as engraved stat cells. */}
            <dl className="trivia-challenge-stats trivia-challenge-stats--compact time-attack-stats">
                <div className="trivia-challenge-stat">
                    <dt>Correct</dt>
                    <dd>{correctCount}</dd>
                </div>
                <div className="trivia-challenge-stat">
                    <dt>Fast Answers</dt>
                    <dd>{fastAnswers}</dd>
                </div>
                <div className="trivia-challenge-stat" data-tone="accent">
                    <dt>Diamonds</dt>
                    <dd>+{diamondsEarned}</dd>
                </div>
            </dl>

            {answerError && <p className="trivia-challenge-alert" role="alert">{answerError}</p>}

            <TriviaNetworkBanner
                hasPendingRetry={Boolean(answerError && pendingAnswerRef.current && !gameOver && timeLeft > 0)}
                isRetrying={isPendingAnswer}
                onRetryNow={retryPendingAnswer}
                onReconnect={retryPendingAnswer}
            />

            {/* Question */}
            {!gameOver && currentQuestion && (
                <div className="time-attack-question">
                    <p className="trivia-challenge-question"><TriviaCardText text={currentQuestion.question} /></p>

                    <div
                        className="trivia-challenge-options"
                        style={{ minHeight: '248px' }}
                        aria-busy={isPendingAnswer}
                        data-pending={isPendingAnswer ? 'true' : 'false'}
                    >
                        {currentQuestion.options.map((option, idx) => (
                            // Reveal comes from the server verdict - while the
                            // grading call is in flight (verdict null) the tap
                            // is locked and acknowledged as pending until confirmed.
                            <TriviaAnswerOption
                                key={`${currentQuestion.id}-${idx}`}
                                index={idx}
                                option={option}
                                selectedAnswer={selectedAnswer}
                                correctIndex={verdict != null ? verdict.correctDisplayIndex : null}
                                showResult={isRevealing && verdict != null}
                                disabled={isRevealing}
                                onSelect={handleAnswer}
                            />
                        ))}
                    </div>

                    {/* Per-question report affordance. The page used to import
                        ReportQuestionButton and never render it; the
                        per-question UI belongs here, where the question is. */}
                    <div className="trivia-challenge-report">
                        <ReportQuestionButton
                            key={currentQuestion.id}
                            questionId={currentQuestion.id}
                            sessionId={sessionId}
                            accountId={accountId}
                            userToken={reportToken}
                        />
                    </div>
                </div>
            )}

            {/* The page owns the only terminal composition. This bridge state
                avoids a second competing "Time Is Up" screen while the
                settlement callback moves the parent into Saving. */}
            {gameOver && (
                <div className="trivia-challenge-state" role="status"><p>Confirming Final Answer</p></div>
            )}
        </div>
    );
}
