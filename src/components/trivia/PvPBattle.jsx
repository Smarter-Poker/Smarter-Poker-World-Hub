/**
 * PVP BATTLE — Real-time 1v1 trivia battle (presentational)
 * Same questions, fastest correct answer wins each round.
 *
 * ╔══════════════════════════════════════════════════════════════════════════╗
 * ║ NOT CURRENTLY WIRED — production PvP runs inline in                      ║
 * ║ pages/hub/trivia/pvp.js. This component is kept as the reusable          ║
 * ║ presentation layer, but it is now SAFE by construction:                  ║
 * ║                                                                          ║
 * ║  * The Math.random() fake-opponent simulation is GONE. It used to invent ║
 * ║    an opponent's answers (60% accuracy) and then settle a real stake     ║
 * ║    against that phantom — a money bug waiting for someone to import it.  ║
 * ║    Opponent results must now be fed in from the server via the           ║
 * ║    `opponentAnswer` / `opponentAnsweredAt` props. With no feed the       ║
 * ║    component refuses to run and says so, instead of silently faking one. ║
 * ║  * handleGameEnd no longer emits diamond events. Nothing here writes to  ║
 * ║    the database, so emitting diamondsEarned/diamondsSpent moved the HUD  ║
 * ║    balance with no backing transaction. Settlement is the caller's       ║
 * ║    server-side job; this component only reports the result via           ║
 * ║    onComplete.                                                           ║
 * ║  * The round timer no longer captures stale state (it read playerAnswered║
 * ║    and opponentAnswer from the effect's frozen closure).                 ║
 * ╚══════════════════════════════════════════════════════════════════════════╝
 */

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Swords, Gem, Check, X, Crown, Clock, User, AlertTriangle } from 'lucide-react';
import MetalFrame from '../ui/MetalFrame';
import HexButton from '../ui/HexButton';
import { busEmit } from '../../engine/EventBus';

const QUESTIONS_PER_BATTLE = 5;
const TIME_PER_QUESTION = 15;

export default function PvPBattle({
    questions = [],
    player = {},
    opponent = {},
    stakeAmount = 10,
    onComplete,
    onAnswer,               // (roundIndex, answerIndex, elapsedMs) => void — report to server
    opponentAnswer = null,  // opponent's selected index for the CURRENT round, from the server
    opponentAnsweredAt = null, // epoch ms the server recorded for that answer
    onOpponentAnswer        // legacy no-op passthrough, kept for prop compatibility
}) {
    const [currentRound, setCurrentRound] = useState(0);
    const [playerScore, setPlayerScore] = useState(0);
    const [opponentScore, setOpponentScore] = useState(0);
    const [selectedAnswer, setSelectedAnswer] = useState(null);
    const [timeLeft, setTimeLeft] = useState(TIME_PER_QUESTION);
    const [roundResult, setRoundResult] = useState(null); // 'player', 'opponent', 'tie'
    const [gameOver, setGameOver] = useState(false);
    const [playerAnswered, setPlayerAnswered] = useState(false);
    const answerTimeRef = useRef(null);
    const roundStartRef = useRef(Date.now());
    const resolvedRef = useRef(false);
    const settledRef = useRef(false);

    const currentQuestion = questions[currentRound];
    const totalRounds = Math.min(questions.length, QUESTIONS_PER_BATTLE);

    // Live mirrors so timers and async callbacks never read a stale closure.
    const playerAnsweredRef = useRef(false);
    const roundResultRef = useRef(null);
    const selectedAnswerRef = useRef(null);
    const opponentAnswerRef = useRef(null);
    const opponentAnsweredAtRef = useRef(null);
    useEffect(() => { playerAnsweredRef.current = playerAnswered; }, [playerAnswered]);
    useEffect(() => { roundResultRef.current = roundResult; }, [roundResult]);
    useEffect(() => { selectedAnswerRef.current = selectedAnswer; }, [selectedAnswer]);
    useEffect(() => { opponentAnswerRef.current = opponentAnswer; }, [opponentAnswer]);
    useEffect(() => { opponentAnsweredAtRef.current = opponentAnsweredAt; }, [opponentAnsweredAt]);

    const nextRound = useCallback(() => {
        setCurrentRound(prev => {
            if (prev >= totalRounds - 1) {
                setGameOver(true);
                return prev;
            }
            return prev + 1;
        });
    }, [totalRounds]);

    // Reset per-round state whenever the round index changes.
    useEffect(() => {
        resolvedRef.current = false;
        roundStartRef.current = Date.now();
        answerTimeRef.current = null;
        setSelectedAnswer(null);
        setRoundResult(null);
        setPlayerAnswered(false);
        setTimeLeft(TIME_PER_QUESTION);
    }, [currentRound]);

    /**
     * Settle a round. Runs at most once per round (resolvedRef), and only ever
     * from real inputs: the player's answer, the SERVER's opponent answer, or
     * the clock running out.
     */
    const resolveRound = useCallback(
        (playerIdx, oppIdx, playerMs, oppMs) => {
            if (resolvedRef.current) return;
            resolvedRef.current = true;

            const correct = currentQuestion?.correct_index;
            const playerCorrect = playerIdx != null && playerIdx === correct;
            const opponentCorrect = oppIdx != null && oppIdx === correct;

            let result;
            if (playerCorrect && !opponentCorrect) result = 'player';
            else if (!playerCorrect && opponentCorrect) result = 'opponent';
            else if (playerCorrect && opponentCorrect) {
                const pt = Number.isFinite(playerMs) ? playerMs : Number.MAX_SAFE_INTEGER;
                const ot = Number.isFinite(oppMs) ? oppMs : Number.MAX_SAFE_INTEGER;
                if (pt === ot) result = 'tie';
                else result = pt < ot ? 'player' : 'opponent';
            } else result = 'tie';

            setRoundResult(result);
            if (result === 'player') {
                setPlayerScore(prev => {
                    busEmit.decisionCorrect(prev + 1);
                    return prev + 1;
                });
            } else if (result === 'opponent') {
                setOpponentScore(prev => prev + 1);
                busEmit.decisionIncorrect(playerScore);
                busEmit.screenShake('light');
            }

            setTimeout(nextRound, 2000);
        },
        [currentQuestion, nextRound, playerScore]
    );

    // Timer — reads live refs, so it can no longer act on a frozen snapshot of
    // playerAnswered / opponentAnswer from the render that created it.
    useEffect(() => {
        if (gameOver || roundResult) return;

        const timer = setInterval(() => {
            setTimeLeft(prev => {
                if (prev <= 1) {
                    clearInterval(timer);
                    if (!roundResultRef.current) {
                        resolveRound(
                            playerAnsweredRef.current ? selectedAnswerRef.current : null,
                            opponentAnswerRef.current,
                            answerTimeRef.current ? answerTimeRef.current - roundStartRef.current : null,
                            opponentAnsweredAtRef.current
                                ? opponentAnsweredAtRef.current - roundStartRef.current
                                : null
                        );
                    }
                    return 0;
                }
                return prev - 1;
            });
        }, 1000);

        return () => clearInterval(timer);
    }, [currentRound, gameOver, roundResult, resolveRound]);

    // Settle as soon as BOTH real answers are in.
    useEffect(() => {
        if (gameOver || roundResult || resolvedRef.current) return;
        if (!playerAnswered || opponentAnswer == null) return;
        resolveRound(
            selectedAnswer,
            opponentAnswer,
            answerTimeRef.current ? answerTimeRef.current - roundStartRef.current : null,
            opponentAnsweredAt ? opponentAnsweredAt - roundStartRef.current : null
        );
    }, [playerAnswered, opponentAnswer, opponentAnsweredAt, selectedAnswer, gameOver, roundResult, resolveRound]);

    const handleAnswer = (answerIndex) => {
        if (playerAnswered || roundResult) return;

        setSelectedAnswer(answerIndex);
        selectedAnswerRef.current = answerIndex;
        setPlayerAnswered(true);
        playerAnsweredRef.current = true;
        answerTimeRef.current = Date.now();

        // Report upward so the caller can persist it and relay to the opponent.
        // NOTHING here invents what the opponent did.
        onAnswer?.(currentRound, answerIndex, answerTimeRef.current - roundStartRef.current);
        onOpponentAnswer?.(currentRound, answerIndex);
    };

    const handleGameEnd = () => {
        if (settledRef.current) return;
        settledRef.current = true;

        const playerWon = playerScore > opponentScore;
        const rakeAmount = Math.floor(stakeAmount * 2 * 0.1);
        const winnings = playerWon ? stakeAmount * 2 - rakeAmount : 0;

        // Celebration only. No diamond events: this component performs no
        // database write, so emitting them moved the HUD balance against a
        // transaction that never happened. The caller settles server-side.
        if (playerWon) busEmit.celebration('confetti');

        onComplete?.({
            won: playerWon,
            playerScore,
            opponentScore,
            stake: stakeAmount,
            winnings,
            opponent
        });
    };

    // Hard stop: without a real opponent feed this component must not be used
    // for a stake-bearing battle. Previously it would have quietly simulated one.
    const hasOpponentFeed = typeof onAnswer === 'function' || opponentAnswer != null;
    if (!hasOpponentFeed && !gameOver) {
        return (
            <div className="pvp-battle">
                <MetalFrame padding="24px" showBolts={true}>
                    <div className="no-feed">
                        <AlertTriangle size={28} />
                        <h3>Battle Unavailable</h3>
                        <p>
                            No live opponent connection. This battle cannot start until the
                            server is relaying your opponent&apos;s answers.
                        </p>
                    </div>
                </MetalFrame>
                <style>{`
                    .pvp-battle { padding: 20px; max-width: 600px; margin: 0 auto; }
                    .no-feed { text-align: center; color: #fbbf24; }
                    .no-feed h3 { margin: 12px 0 8px; color: #fff; font-size: 18px; }
                    .no-feed p { margin: 0; color: rgba(255,255,255,0.6); font-size: 14px; line-height: 1.5; }
                `}</style>
            </div>
        );
    }

    if (!currentQuestion && !gameOver) {
        return <div className="loading">Loading Battle...</div>;
    }

    const playerWon = playerScore > opponentScore;

    return (
        <div className="pvp-battle">
            {/* Score Header */}
            <div className="score-header">
                <div className="player-side you">
                    <div className="player-avatar">
                        <User size={24} />
                    </div>
                    <span className="player-name">You</span>
                    <span className="player-score">{playerScore}</span>
                </div>

                <div className="vs-badge">
                    <Swords size={20} />
                    <span>Round {currentRound + 1}/{totalRounds}</span>
                </div>

                <div className="player-side opponent">
                    <span className="player-score">{opponentScore}</span>
                    <span className="player-name">{opponent.username || 'Opponent'}</span>
                    <div className="player-avatar">
                        <User size={24} />
                    </div>
                </div>
            </div>

            {/* Timer */}
            {!gameOver && (
                <div className="timer-bar">
                    <motion.div
                        className="timer-fill"
                        initial={{ width: '100%' }}
                        animate={{ width: `${(timeLeft / TIME_PER_QUESTION) * 100}%` }}
                    />
                    <div className="timer-text">
                        <Clock size={16} />
                        {timeLeft}s
                    </div>
                </div>
            )}

            {/* Question */}
            {!gameOver && currentQuestion && (
                <div className="question-container">
                    <MetalFrame padding="20px" showBolts={true}>
                        <p className="question-text">{currentQuestion.question}</p>
                    </MetalFrame>

                    <div className="answers-grid">
                        {currentQuestion.options.map((option, idx) => {
                            const isSelected = selectedAnswer === idx;
                            const isCorrect = idx === currentQuestion.correct_index;
                            const showResult = roundResult !== null;

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
                                    disabled={playerAnswered}
                                >
                                    <span className="answer-label">{String.fromCharCode(65 + idx)}</span>
                                    <span className="answer-text">{option}</span>
                                </button>
                            );
                        })}
                    </div>

                    {/* Round Result */}
                    <AnimatePresence>
                        {roundResult && (
                            <motion.div
                                initial={{ opacity: 0, y: 20 }}
                                animate={{ opacity: 1, y: 0 }}
                                exit={{ opacity: 0 }}
                                className={`round-result ${roundResult}`}
                            >
                                {roundResult === 'player' && (
                                    <>
                                        <Check size={24} />
                                        <span>You Won This Round!</span>
                                    </>
                                )}
                                {roundResult === 'opponent' && (
                                    <>
                                        <X size={24} />
                                        <span>{opponent.username} won this round</span>
                                    </>
                                )}
                                {roundResult === 'tie' && (
                                    <>
                                        <span>Tie! No Points Awarded</span>
                                    </>
                                )}
                            </motion.div>
                        )}
                    </AnimatePresence>
                </div>
            )}

            {/* Game Over */}
            {gameOver && (
                <motion.div
                    initial={{ opacity: 0, scale: 0.9 }}
                    animate={{ opacity: 1, scale: 1 }}
                    className="game-over"
                >
                    <MetalFrame padding="32px" showBolts={true} showNeonStrips={true}>
                        <div className={`result-header ${playerWon ? 'win' : 'lose'}`}>
                            <Crown size={48} />
                            <h2>{playerWon ? 'VICTORY!' : 'DEFEAT'}</h2>
                        </div>

                        <div className="final-score">
                            <div className="score-box you">
                                <span className="name">You</span>
                                <span className="score">{playerScore}</span>
                            </div>
                            <span className="score-divider">-</span>
                            <div className="score-box opponent">
                                <span className="name">{opponent.username}</span>
                                <span className="score">{opponentScore}</span>
                            </div>
                        </div>

                        <div className={`winnings-display ${playerWon ? 'win' : 'lose'}`}>
                            <Gem size={24} />
                            <span>
                                {playerWon
                                    ? `+${Math.floor(stakeAmount * 2 * 0.9)}`
                                    : `-${stakeAmount}`
                                }
                            </span>
                        </div>

                        <HexButton
                            label="Continue"
                            onClick={handleGameEnd}
                            variant="primary"
                            fullWidth
                        />
                    </MetalFrame>
                </motion.div>
            )}

            <style>{`
                .pvp-battle {
                    padding: 20px;
                    max-width: 600px;
                    margin: 0 auto;
                }

                .score-header {
                    display: flex;
                    align-items: center;
                    justify-content: space-between;
                    padding: 16px;
                    background: rgba(30, 41, 59, 0.8);
                    border: 1px solid rgba(255, 255, 255, 0.1);
                    border-radius: 12px;
                    margin-bottom: 16px;
                }

                .player-side {
                    display: flex;
                    align-items: center;
                    gap: 10px;
                }

                .player-side.opponent {
                    flex-direction: row-reverse;
                }

                .player-avatar {
                    width: 40px;
                    height: 40px;
                    border-radius: 50%;
                    background: rgba(255, 255, 255, 0.1);
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    color: rgba(255, 255, 255, 0.5);
                }

                .player-name {
                    font-size: 14px;
                    font-weight: 600;
                    color: #fff;
                }

                .player-score {
                    font-size: 24px;
                    font-weight: 700;
                    color: #00d4ff;
                }

                .vs-badge {
                    display: flex;
                    flex-direction: column;
                    align-items: center;
                    gap: 4px;
                    color: rgba(255, 255, 255, 0.5);
                    font-size: 12px;
                }

                .timer-bar {
                    height: 8px;
                    background: rgba(255, 255, 255, 0.1);
                    border-radius: 4px;
                    overflow: hidden;
                    margin-bottom: 16px;
                    position: relative;
                }

                .timer-fill {
                    height: 100%;
                    background: linear-gradient(90deg, #00d4ff, #22c55e);
                    border-radius: 4px;
                }

                .timer-text {
                    position: absolute;
                    right: 0;
                    top: 12px;
                    display: flex;
                    align-items: center;
                    gap: 6px;
                    color: rgba(255, 255, 255, 0.6);
                    font-size: 13px;
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
                    line-height: 1.5;
                }

                .answers-grid {
                    display: grid;
                    gap: 10px;
                    margin-top: 16px;
                }

                .answer-btn {
                    display: flex;
                    align-items: center;
                    gap: 12px;
                    padding: 14px;
                    background: rgba(30, 41, 59, 0.8);
                    border: 2px solid rgba(255, 255, 255, 0.1);
                    border-radius: 10px;
                    cursor: pointer;
                    transition: all 0.2s ease;
                    text-align: left;
                }

                .answer-btn:hover:not(:disabled) {
                    border-color: #ef4444;
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
                    width: 28px;
                    height: 28px;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    background: rgba(255, 255, 255, 0.1);
                    border-radius: 6px;
                    font-weight: 700;
                    color: #fff;
                    flex-shrink: 0;
                }

                .answer-text {
                    font-size: 14px;
                    color: #fff;
                }

                .round-result {
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    gap: 10px;
                    padding: 14px;
                    margin-top: 16px;
                    border-radius: 10px;
                    font-weight: 600;
                }

                .round-result.player {
                    background: rgba(34, 197, 94, 0.15);
                    border: 1px solid rgba(34, 197, 94, 0.3);
                    color: #22c55e;
                }

                .round-result.opponent {
                    background: rgba(239, 68, 68, 0.15);
                    border: 1px solid rgba(239, 68, 68, 0.3);
                    color: #ef4444;
                }

                .round-result.tie {
                    background: rgba(251, 191, 36, 0.15);
                    border: 1px solid rgba(251, 191, 36, 0.3);
                    color: #fbbf24;
                }

                .game-over {
                    text-align: center;
                }

                .result-header {
                    margin-bottom: 24px;
                }

                .result-header.win { color: #22c55e; }
                .result-header.lose { color: #ef4444; }

                .result-header h2 {
                    font-size: 32px;
                    margin: 12px 0 0 0;
                }

                .final-score {
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    gap: 24px;
                    margin-bottom: 24px;
                }

                .score-box {
                    display: flex;
                    flex-direction: column;
                    align-items: center;
                    gap: 8px;
                }

                .score-box .name {
                    font-size: 14px;
                    color: rgba(255, 255, 255, 0.6);
                }

                .score-box .score {
                    font-size: 48px;
                    font-weight: 700;
                    color: #fff;
                }

                .score-divider {
                    font-size: 32px;
                    color: rgba(255, 255, 255, 0.3);
                }

                .winnings-display {
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    gap: 12px;
                    padding: 20px;
                    border-radius: 12px;
                    font-size: 32px;
                    font-weight: 700;
                    margin-bottom: 24px;
                }

                .winnings-display.win {
                    background: rgba(34, 197, 94, 0.15);
                    border: 1px solid rgba(34, 197, 94, 0.3);
                    color: #22c55e;
                }

                .winnings-display.lose {
                    background: rgba(239, 68, 68, 0.15);
                    border: 1px solid rgba(239, 68, 68, 0.3);
                    color: #ef4444;
                }
            `}</style>
        </div>
    );
}
