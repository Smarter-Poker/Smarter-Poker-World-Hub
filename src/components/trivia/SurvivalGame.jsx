/**
 * SURVIVAL MODE GAME — Answer until you miss
 * Endless questions, leaderboard for longest runs
 * Earns 1 diamond per 5 correct (capped per DAILY_DIAMOND_CAPS.survival)
 *
 * WARNING: CURRENTLY UNREFERENCED — do not assume this is the live Survival mode.
 * /hub/trivia/survival is now a thin redirect to /hub/trivia/survival-game,
 * whose page-level implementation is the one players actually reach. This
 * component is kept (and kept correct) so it can be adopted deliberately, but
 * before wiring it up: reconcile its reward economy with survival-game.js, or
 * you will ship two different payouts and split leaderboard/history writes.
 */

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Clock, Target, AlertTriangle, Gem } from 'lucide-react';
import { busEmit } from '../../engine/EventBus';
import { DAILY_DIAMOND_CAPS } from '../../lib/trivia/triviaEngine';
import MetalFrame from '../ui/MetalFrame';
import HexButton from '../ui/HexButton';
import ReportQuestionButton from './ReportQuestionButton';
import { getAccessToken } from '../../lib/authUtils';

// Single source of truth for the cap lives in triviaEngine.
const DAILY_DIAMOND_CAP = DAILY_DIAMOND_CAPS?.survival ?? 10;
const DIAMONDS_PER_MILESTONE = 1;
const MILESTONE_INTERVAL = 5; // Every 5 correct = 1 diamond
const START_SECONDS = 15;
const MIN_SECONDS = 8;
const SPEEDUP_PER_QUESTION = 0.2;

export default function SurvivalGame({
    questions = [],
    onComplete,
    onLoadMoreQuestions,
    dailyDiamondsEarned = 0,
    // Optional: supabase access token for the per-question report button.
    // /api/trivia/report-question requires a Bearer token, so when the host
    // page does not supply one we resolve it from the live session below.
    userToken = null
}) {
    const [currentIndex, setCurrentIndex] = useState(0);
    const [correctCount, setCorrectCount] = useState(0);
    const [lives, setLives] = useState(1); // Survival = 1 life
    const [selectedAnswer, setSelectedAnswer] = useState(null);
    const [isRevealing, setIsRevealing] = useState(false);
    const [gameOver, setGameOver] = useState(false);
    const [timePerQuestion, setTimePerQuestion] = useState(START_SECONDS);
    const [timeLeft, setTimeLeft] = useState(START_SECONDS);
    const [diamondsEarned, setDiamondsEarned] = useState(0);
    const [streak, setStreak] = useState(0);
    const [bestStreak, setBestStreak] = useState(0);

    const currentQuestion = questions[currentIndex];
    const remainingCap = Math.max(0, DAILY_DIAMOND_CAP - dailyDiamondsEarned);

    // The report button needs a Bearer token. Prefer the one the host passes;
    // otherwise read the live session (client-only, so do it in an effect).
    const [reportToken, setReportToken] = useState(userToken || null);
    useEffect(() => {
        if (userToken) { setReportToken(userToken); return; }
        try { setReportToken(getAccessToken() || null); }
        catch (e) { console.warn('[SurvivalGame] token lookup failed:', e?.message || e); }
    }, [userToken]);
    const capReached = remainingCap <= 0 || diamondsEarned >= remainingCap;

    // Phase 69 parity (this component was missed by that pass): pending
    // timeouts are tracked so unmount cancels them, instead of firing setState
    // on an unmounted component when the user navigates away mid-reveal.
    const _pendingTimeoutsRef = useRef(new Set());
    const _isMountedRef = useRef(true);
    const _completedRef = useRef(false);
    // Synchronous answer lock. `isRevealing` is state and does not update in
    // time to stop a second call in the same tick (React 18 StrictMode
    // double-invokes effects), which previously double-emitted the bus events
    // and stacked two 1500ms reveal timers.
    const _answerLockRef = useRef(false);
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

    // Timer countdown. The timeout is NOT triggered from inside the state
    // updater any more — a side effect in an updater is double-invoked under
    // StrictMode. The updater only decrements; a separate effect reacts to
    // timeLeft hitting 0.
    useEffect(() => {
        if (gameOver || isRevealing || !currentQuestion) return undefined;

        const timer = setInterval(() => {
            setTimeLeft(prev => (prev <= 1 ? 0 : prev - 1));
        }, 1000);

        return () => clearInterval(timer);
    }, [currentIndex, gameOver, isRevealing, currentQuestion]);

    // Load more questions when running low
    useEffect(() => {
        if (currentIndex >= questions.length - 3 && onLoadMoreQuestions) {
            onLoadMoreQuestions();
        }
    }, [currentIndex, questions.length, onLoadMoreQuestions]);

    const handleAnswer = useCallback((answerIndex) => {
        if (_answerLockRef.current || isRevealing || gameOver || !currentQuestion) return;
        _answerLockRef.current = true;

        setSelectedAnswer(answerIndex);
        setIsRevealing(true);

        const isCorrect = answerIndex === currentQuestion.correct_index;

        safeSetTimeout(() => {
            if (isCorrect) {
                const newCorrect = correctCount + 1;
                setCorrectCount(newCorrect);
                busEmit.decisionCorrect(newCorrect);
                setStreak(prev => prev + 1);
                setBestStreak(prev => Math.max(prev, streak + 1));

                // Check for diamond milestone
                if (newCorrect % MILESTONE_INTERVAL === 0) {
                    const potentialDiamonds = diamondsEarned + DIAMONDS_PER_MILESTONE;
                    if (potentialDiamonds <= remainingCap) {
                        setDiamondsEarned(potentialDiamonds);
                    }
                }

                // Speed up as you go. The next question's visible countdown is
                // seeded from the UPDATED speed (the old code used the stale
                // pre-decrement value, so the speed-up lagged a question and
                // the display drifted to 14.8s, 14.6s, ...).
                const nextSpeed = Math.max(MIN_SECONDS, timePerQuestion - SPEEDUP_PER_QUESTION);
                setTimePerQuestion(nextSpeed);
                setTimeLeft(Math.ceil(nextSpeed));

                // Next question
                setCurrentIndex(prev => prev + 1);
                setSelectedAnswer(null);
                setIsRevealing(false);
                _answerLockRef.current = false;
            } else {
                // Wrong answer = game over in survival.
                // Report the REAL run length — the old stale-closure handler
                // always reported 0 here on a timeout.
                busEmit.decisionIncorrect(correctCount);
                busEmit.screenShake('medium');
                setLives(0);
                setGameOver(true);
            }
        }, 1500);
    }, [isRevealing, gameOver, currentQuestion, correctCount, streak, diamondsEarned, remainingCap, timePerQuestion]);

    // Keep the latest handler in a ref so the timeout path never runs against
    // a first-render closure (correctCount=0, questions[0], stale guards).
    const handleAnswerRef = useRef(handleAnswer);
    useEffect(() => { handleAnswerRef.current = handleAnswer; }, [handleAnswer]);

    // Time ran out = wrong answer
    useEffect(() => {
        if (gameOver || isRevealing || !currentQuestion) return;
        if (timeLeft > 0) return;
        handleAnswerRef.current?.(-1);
    }, [timeLeft, gameOver, isRevealing, currentQuestion]);

    const handleGameOver = () => {
        if (_completedRef.current) return;
        _completedRef.current = true;
        onComplete?.({
            correctCount,
            diamondsEarned: Math.min(diamondsEarned, remainingCap),
            bestStreak,
            mode: 'survival'
        });
    };

    if (!currentQuestion && !gameOver) {
        return (
            <div className="survival-loading">
                <div className="spinner" />
                <p>Loading Questions...</p>
            </div>
        );
    }

    return (
        <div className="survival-game">
            {/* Stats Bar */}
            <div className="stats-bar">
                <div className="stat">
                    <Target size={18} />
                    <span>{correctCount}</span>
                </div>
                <div className="stat timer" data-warning={timeLeft <= 5}>
                    <Clock size={18} />
                    <span>{Math.ceil(timeLeft)}s</span>
                </div>
                <div className="stat diamonds" title={`Daily cap: ${DAILY_DIAMOND_CAP}`}>
                    <Gem size={18} />
                    <span>+{diamondsEarned}</span>
                    <span className="cap-hint">/ {remainingCap} left today</span>
                </div>
            </div>

            {/* Progress indicator */}
            <div className="milestone-progress">
                <div className="milestone-bar">
                    <div
                        className={`milestone-fill ${capReached ? 'capped' : ''}`}
                        style={{ width: `${(correctCount % MILESTONE_INTERVAL) / MILESTONE_INTERVAL * 100}%` }}
                    />
                </div>
                {/* Milestones silently stopped paying once the daily cap was
                    hit, and the player only found out at game over. */}
                <span className="milestone-text">
                    {capReached
                        ? 'Daily cap reached — playing for the leaderboard'
                        : `${MILESTONE_INTERVAL - (correctCount % MILESTONE_INTERVAL)} more for +1 diamond`}
                </span>
            </div>

            {/* Question */}
            <AnimatePresence mode="wait">
                {!gameOver && currentQuestion && (
                    <motion.div
                        key={currentIndex}
                        initial={{ opacity: 0, x: 50 }}
                        animate={{ opacity: 1, x: 0 }}
                        exit={{ opacity: 0, x: -50 }}
                        className="question-container"
                    >
                        <MetalFrame padding="24px" showBolts={true}>
                            <p className="question-text">{currentQuestion.question}</p>
                        </MetalFrame>

                        <div className="answers-grid">
                            {currentQuestion.options.map((option, idx) => {
                                const isSelected = selectedAnswer === idx;
                                const isCorrect = idx === currentQuestion.correct_index;
                                const showResult = isRevealing;

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

                        {/* Per-question report affordance — the per-question UI
                            belongs in this component, not the host page. */}
                        <div className="report-row">
                            <ReportQuestionButton
                                key={currentQuestion.id}
                                questionId={currentQuestion.id}
                                userToken={reportToken}
                            />
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* Game Over Screen */}
            {gameOver && (
                <motion.div
                    initial={{ opacity: 0, scale: 0.9 }}
                    animate={{ opacity: 1, scale: 1 }}
                    className="game-over"
                >
                    <MetalFrame padding="32px" showBolts={true} showNeonStrips={true}>
                        <AlertTriangle size={48} className="game-over-icon" />
                        <h2>SURVIVAL ENDED</h2>

                        <div className="final-stats">
                            <div className="stat-row">
                                <Target size={24} />
                                <span className="stat-value">{correctCount}</span>
                                <span className="stat-label">Questions Answered</span>
                            </div>
                            <div className="stat-row highlight">
                                <Gem size={24} />
                                <span className="stat-value">+{Math.min(diamondsEarned, remainingCap)}</span>
                                <span className="stat-label">Diamonds Earned</span>
                            </div>
                            {remainingCap <= 0 && (
                                <div className="cap-warning">
                                    Daily diamond cap reached!
                                </div>
                            )}
                        </div>

                        <HexButton
                            label="Continue"
                            onClick={handleGameOver}
                            variant="primary"
                            size="lg"
                        />
                    </MetalFrame>
                </motion.div>
            )}

            <style>{`
                .survival-game {
                    padding: 20px;
                    max-width: 600px;
                    margin: 0 auto;
                }

                .stats-bar {
                    display: flex;
                    justify-content: space-between;
                    margin-bottom: 16px;
                    padding: 12px 16px;
                    background: rgba(0, 0, 0, 0.3);
                    border-radius: 12px;
                    border: 1px solid rgba(255, 255, 255, 0.1);
                }

                .stat {
                    display: flex;
                    align-items: center;
                    gap: 8px;
                    font-size: 16px;
                    font-weight: 600;
                    color: #fff;
                }

                .stat.timer[data-warning="true"] {
                    color: #ef4444;
                    animation: pulse 0.5s ease-in-out infinite;
                }

                .stat.diamonds {
                    color: #00d4ff;
                }

                @keyframes pulse {
                    0%, 100% { opacity: 1; }
                    50% { opacity: 0.5; }
                }

                .milestone-progress {
                    margin-bottom: 20px;
                    text-align: center;
                }

                .milestone-bar {
                    height: 6px;
                    background: rgba(255, 255, 255, 0.1);
                    border-radius: 3px;
                    overflow: hidden;
                    margin-bottom: 8px;
                }

                .milestone-fill {
                    height: 100%;
                    background: linear-gradient(90deg, #00d4ff, #22c55e);
                    transition: width 0.3s ease;
                }

                .milestone-fill.capped {
                    background: linear-gradient(90deg, rgba(148, 163, 184, 0.6), rgba(148, 163, 184, 0.9));
                }

                .cap-hint {
                    font-size: 11px;
                    font-weight: 500;
                    color: rgba(255, 255, 255, 0.4);
                }

                .milestone-text {
                    font-size: 12px;
                    color: rgba(255, 255, 255, 0.5);
                }

                .question-container {
                    margin-bottom: 24px;
                }

                .question-text {
                    font-size: 18px;
                    font-weight: 600;
                    color: #fff;
                    text-align: center;
                    margin: 0;
                    line-height: 1.5;
                }

                .answers-grid {
                    display: grid;
                    gap: 12px;
                    margin-top: 20px;
                }

                .report-row {
                    display: flex;
                    justify-content: flex-end;
                    margin-top: 10px;
                }

                .answer-btn {
                    display: flex;
                    align-items: center;
                    gap: 12px;
                    padding: 16px;
                    min-height: 56px;
                    background: rgba(30, 41, 59, 0.8);
                    border: 2px solid rgba(255, 255, 255, 0.1);
                    border-radius: 12px;
                    cursor: pointer;
                    /* explicit properties only — transition:all also animated
                       layout-affecting properties */
                    transition: border-color 0.2s ease, background-color 0.2s ease;
                    text-align: left;
                }

                .answer-btn:hover:not(:disabled) {
                    border-color: #00d4ff;
                    background: rgba(0, 212, 255, 0.1);
                }

                .answer-btn:disabled {
                    cursor: not-allowed;
                }

                .answer-btn.correct {
                    border-color: #22c55e;
                    background: rgba(34, 197, 94, 0.2);
                }

                .answer-btn.wrong {
                    border-color: #ef4444;
                    background: rgba(239, 68, 68, 0.2);
                }

                .answer-label {
                    width: 32px;
                    height: 32px;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    background: rgba(255, 255, 255, 0.1);
                    border-radius: 8px;
                    font-weight: 700;
                    color: #fff;
                    flex-shrink: 0;
                }

                .answer-text {
                    font-size: 15px;
                    color: #fff;
                }

                .game-over {
                    text-align: center;
                }

                .game-over-icon {
                    color: #f97316;
                    margin-bottom: 16px;
                }

                .game-over h2 {
                    font-size: 28px;
                    font-weight: 700;
                    color: #fff;
                    margin: 0 0 24px 0;
                }

                .final-stats {
                    display: flex;
                    flex-direction: column;
                    gap: 16px;
                    margin-bottom: 24px;
                }

                .stat-row {
                    display: flex;
                    align-items: center;
                    gap: 12px;
                    padding: 16px;
                    background: rgba(0, 0, 0, 0.2);
                    border-radius: 12px;
                }

                .stat-row.highlight {
                    background: rgba(0, 212, 255, 0.1);
                    border: 1px solid rgba(0, 212, 255, 0.3);
                }

                .stat-row .stat-value {
                    font-size: 24px;
                    font-weight: 700;
                    color: #fff;
                }

                .stat-row .stat-label {
                    font-size: 14px;
                    color: rgba(255, 255, 255, 0.6);
                    margin-left: auto;
                }

                .cap-warning {
                    padding: 12px;
                    background: rgba(251, 191, 36, 0.1);
                    border: 1px solid rgba(251, 191, 36, 0.3);
                    border-radius: 8px;
                    color: #fbbf24;
                    font-size: 14px;
                }

                .survival-loading {
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
                    margin-bottom: 16px;
                }

                @keyframes spin {
                    to { transform: rotate(360deg); }
                }

                @media (prefers-reduced-motion: reduce) {
                    .stat.timer[data-warning="true"] { animation: none; }
                    .spinner { animation-duration: 2s; }
                    .answer-btn, .milestone-fill { transition: none; }
                }
            `}</style>
        </div>
    );
}
