/**
 * TIME ATTACK GAME — 30 seconds, answer as many as possible
 * Speed creates adrenaline, 1 diamond per correct answer (capped daily)
 *
 * Grading is server-authoritative: the page supplies an async serverGrader
 * ({ questionId, displayIndex } -> verdict) backed by
 * /api/trivia/session-answer, and the reveal is driven by the verdict's
 * correctDisplayIndex. Served questions carry NO correct_index, so the
 * component holds no answer key and cannot grade locally.
 */

import React, { useState, useEffect, useRef } from 'react';
import { motion } from 'framer-motion';
import { Clock, Zap, Gem, Target, Timer } from 'lucide-react';
import { busEmit } from '../../engine/EventBus';
import { DAILY_DIAMOND_CAPS } from '../../lib/trivia/triviaEngine';
import MetalFrame from '../ui/MetalFrame';
import ReportQuestionButton from './ReportQuestionButton';
import { getAccessToken } from '../../lib/authUtils';

const GAME_DURATION = 30; // seconds
// Single source of truth for the cap lives in triviaEngine.
const DAILY_DIAMOND_CAP = DAILY_DIAMOND_CAPS?.['time-attack'] ?? 5;
const LOAD_MORE_THRESHOLD = 5;

export default function TimeAttackGame({
    questions = [],
    onComplete,
    onLoadMoreQuestions,
    dailyDiamondsEarned = 0,
    // Optional: supabase access token for the per-question report button.
    // /api/trivia/report-question requires a Bearer token, so when the page
    // does not supply one we resolve it from the live session below.
    userToken = null,
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
    const answerStartTime = useRef(Date.now());
    const answersRef = useRef([]); // Track per-question correct/incorrect

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

    // Reset answer timer on new question
    useEffect(() => {
        answerStartTime.current = Date.now();
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
        if (isRevealing || gameOver || !currentQuestion) return;

        const answerTime = (Date.now() - answerStartTime.current) / 1000;
        setSelectedAnswer(answerIndex);
        setIsRevealing(true);

        if (!serverGrader) {
            // No grader means no grading: served questions carry no answer
            // key. Release the tap instead of wedging the run - this only
            // happens on a wiring mistake, never in normal play.
            console.warn('[TimeAttackGame] serverGrader prop missing - cannot grade answer');
            setSelectedAnswer(null);
            setIsRevealing(false);
            return;
        }

        // The tap locks instantly; every side effect waits for the server
        // verdict. The first answer per question is binding server-side, so a
        // failed call is safe to re-tap - a retry replays the stored verdict
        // instead of double-recording.
        serverGrader({ questionId: currentQuestion.id, displayIndex: answerIndex })
            .then((v) => {
                if (!_isMountedRef.current) return;
                setVerdict(v);
                resolveAnswer(v?.wasCorrect === true, answerTime);
            })
            .catch((err) => {
                console.warn('[TimeAttackGame] serverGrader failed, unlocking for retry:', err?.message || err);
                if (!_isMountedRef.current) return;
                setSelectedAnswer(null);
                setIsRevealing(false);
            });
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
                busEmit.screenShake('light');
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

    if (!currentQuestion && !gameOver) {
        return (
            <div className="loading">
                <div className="spinner" />
                <p>Loading...</p>
            </div>
        );
    }

    // Calculate progress bar width
    const timeProgress = (timeLeft / GAME_DURATION) * 100;

    return (
        <div className="time-attack-game">
            {/* Timer Bar */}
            <div className="timer-container">
                <div className="timer-bar">
                    <motion.div
                        className="timer-fill"
                        initial={{ width: '100%' }}
                        animate={{ width: `${timeProgress}%` }}
                        style={{
                            background: timeLeft <= 10
                                ? 'linear-gradient(90deg, #ef4444, #dc2626)'
                                : 'linear-gradient(90deg, #00d4ff, #22c55e)'
                        }}
                    />
                </div>
                <div className="timer-text" data-warning={timeLeft <= 10}>
                    <Clock size={20} />
                    <span>{timeLeft}s</span>
                </div>
            </div>

            {/* Stats */}
            <div className="stats-bar">
                <div className="stat">
                    <Target size={18} />
                    <span>{correctCount}</span>
                </div>
                <div className="stat">
                    <Zap size={18} />
                    <span>{fastAnswers} fast</span>
                </div>
                <div className="stat diamonds">
                    <Gem size={18} />
                    <span>+{diamondsEarned}</span>
                </div>
            </div>

            {/* Question */}
            {!gameOver && currentQuestion && (
                <div className="question-container">
                    <MetalFrame padding="20px" showBolts={false}>
                        <p className="question-text">{currentQuestion.question}</p>
                    </MetalFrame>

                    <div className="answers-grid">
                        {currentQuestion.options.map((option, idx) => {
                            const isSelected = selectedAnswer === idx;
                            // Reveal comes from the server verdict - while the
                            // grading call is in flight (verdict null) the tap
                            // is locked but nothing is marked right or wrong.
                            const isCorrect = verdict != null && idx === verdict.correctDisplayIndex;
                            const showResult = isRevealing && verdict != null;

                            let className = 'answer-btn';
                            if (showResult) {
                                if (isCorrect) className += ' correct';
                                else if (isSelected) className += ' wrong';
                            }

                            return (
                                <button
                                    key={idx}
                                    className={className}
                                    onClick={() => handleAnswer(idx)}
                                    disabled={isRevealing}
                                >
                                    <span className="answer-label">{String.fromCharCode(65 + idx)}</span>
                                    <span className="answer-text">{option}</span>
                                </button>
                            );
                        })}
                    </div>

                    {/* Per-question report affordance. The page used to import
                        ReportQuestionButton and never render it; the
                        per-question UI belongs here, where the question is. */}
                    <div className="report-row">
                        <ReportQuestionButton
                            key={currentQuestion.id}
                            questionId={currentQuestion.id}
                            userToken={reportToken}
                        />
                    </div>
                </div>
            )}

            {/* Game Over */}
            {gameOver && (
                <motion.div
                    initial={{ opacity: 0, scale: 0.9 }}
                    animate={{ opacity: 1, scale: 1 }}
                    className="game-over"
                >
                    <MetalFrame padding="32px" showBolts={true}>
                        <Timer size={48} className="game-over-icon" />
                        <h2>TIME'S UP!</h2>

                        <div className="final-stats">
                            <div className="stat-row">
                                <Target size={24} />
                                <span className="stat-value">{correctCount}</span>
                                <span className="stat-label">Correct</span>
                            </div>
                            <div className="stat-row">
                                <Zap size={24} />
                                <span className="stat-value">{fastAnswers}</span>
                                <span className="stat-label">Fast Answers</span>
                            </div>
                            <div className="stat-row highlight">
                                <Gem size={24} />
                                <span className="stat-value">+{Math.min(diamondsEarned, remainingCap)}</span>
                                <span className="stat-label">Diamonds</span>
                            </div>
                        </div>
                    </MetalFrame>
                </motion.div>
            )}

            <style>{`
                .time-attack-game {
                    padding: 20px;
                    max-width: 600px;
                    margin: 0 auto;
                }

                .timer-container {
                    margin-bottom: 16px;
                }

                .timer-bar {
                    height: 12px;
                    background: rgba(255, 255, 255, 0.1);
                    border-radius: 6px;
                    overflow: hidden;
                    margin-bottom: 8px;
                }

                .timer-fill {
                    height: 100%;
                    border-radius: 6px;
                    transition: background 0.3s ease;
                }

                .timer-text {
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    gap: 8px;
                    font-size: 24px;
                    font-weight: 700;
                    color: #fff;
                }

                .timer-text[data-warning="true"] {
                    color: #ef4444;
                    animation: pulse 0.5s ease-in-out infinite;
                }

                @keyframes pulse {
                    0%, 100% { opacity: 1; transform: scale(1); }
                    50% { opacity: 0.8; transform: scale(1.05); }
                }

                .stats-bar {
                    display: flex;
                    justify-content: space-between;
                    margin-bottom: 16px;
                    padding: 10px 16px;
                    background: rgba(0, 0, 0, 0.3);
                    border-radius: 10px;
                }

                .stat {
                    display: flex;
                    align-items: center;
                    gap: 6px;
                    font-size: 14px;
                    font-weight: 600;
                    color: #fff;
                }

                .stat.diamonds {
                    color: #00d4ff;
                }

                .question-container {
                    margin-bottom: 24px;
                }

                .question-text {
                    font-size: 17px;
                    font-weight: 600;
                    color: #fff;
                    text-align: center;
                    margin: 0;
                    line-height: 1.4;
                }

                .answers-grid {
                    display: grid;
                    grid-template-columns: 1fr 1fr;
                    gap: 10px;
                    margin-top: 16px;
                }

                .report-row {
                    display: flex;
                    justify-content: flex-end;
                    margin-top: 10px;
                }

                .answer-btn {
                    display: flex;
                    flex-direction: column;
                    align-items: center;
                    gap: 6px;
                    padding: 14px 10px;
                    min-height: 56px;
                    background: rgba(30, 41, 59, 0.8);
                    border: 2px solid rgba(255, 255, 255, 0.1);
                    border-radius: 10px;
                    cursor: pointer;
                    /* explicit properties only — transition:all also animated
                       layout-affecting properties */
                    transition: border-color 0.15s ease, transform 0.15s ease;
                    text-align: center;
                }

                .answer-btn:hover:not(:disabled) {
                    border-color: #00d4ff;
                    transform: scale(1.02);
                }

                .answer-btn.correct {
                    border-color: #22c55e;
                    background: rgba(34, 197, 94, 0.3);
                }

                .answer-btn.wrong {
                    border-color: #ef4444;
                    background: rgba(239, 68, 68, 0.3);
                }

                .answer-label {
                    width: 28px;
                    height: 28px;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    background: rgba(255, 255, 255, 0.1);
                    border-radius: 6px;
                    font-weight: 700;
                    font-size: 13px;
                    color: #fff;
                }

                .answer-text {
                    font-size: 13px;
                    color: #fff;
                    line-height: 1.3;
                }

                .game-over {
                    text-align: center;
                }

                .game-over-icon {
                    color: #f97316;
                    margin-bottom: 12px;
                }

                .game-over h2 {
                    font-size: 28px;
                    font-weight: 700;
                    color: #fff;
                    margin: 0 0 20px 0;
                }

                .final-stats {
                    display: flex;
                    flex-direction: column;
                    gap: 12px;
                }

                .stat-row {
                    display: flex;
                    align-items: center;
                    gap: 12px;
                    padding: 14px;
                    background: rgba(0, 0, 0, 0.2);
                    border-radius: 10px;
                }

                .stat-row.highlight {
                    background: rgba(0, 212, 255, 0.1);
                    border: 1px solid rgba(0, 212, 255, 0.3);
                }

                .stat-value {
                    font-size: 22px;
                    font-weight: 700;
                    color: #fff;
                }

                .stat-label {
                    font-size: 13px;
                    color: rgba(255, 255, 255, 0.6);
                    margin-left: auto;
                }

                .loading {
                    display: flex;
                    flex-direction: column;
                    align-items: center;
                    justify-content: center;
                    min-height: 300px;
                    color: rgba(255, 255, 255, 0.6);
                }

                .spinner {
                    width: 40px;
                    height: 40px;
                    border: 3px solid rgba(255, 255, 255, 0.1);
                    border-top-color: #00d4ff;
                    border-radius: 50%;
                    animation: spin 1s linear infinite;
                }

                @keyframes spin {
                    to { transform: rotate(360deg); }
                }

                @media (prefers-reduced-motion: reduce) {
                    .timer-text[data-warning="true"] { animation: none; }
                    .answer-btn { transition: none; }
                    .answer-btn:hover:not(:disabled) { transform: none; }
                    .spinner { animation-duration: 2s; }
                }
            `}</style>
        </div>
    );
}
