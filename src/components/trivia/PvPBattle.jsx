/**
 * PVP BATTLE — Real-time 1v1 trivia battle
 * Same questions, fastest correct answer wins each round
 *
 * ╔══════════════════════════════════════════════════════════════════════════╗
 * ║ ⚠️  DEPRECATED / ORPHANED — DO NOT USE THIS COMPONENT                    ║
 * ╠══════════════════════════════════════════════════════════════════════════╣
 * ║ Phase 69 audit: zero imports anywhere in pages/ or src/. The simulated   ║
 * ║ opponent logic below (lines 78-86: Math.random() < 0.4 to fake an        ║
 * ║ opponent's answer) is a leftover prototype. The real production PvP      ║
 * ║ battle runs inline in pages/hub/trivia/pvp.js, which uses Supabase       ║
 * ║ realtime to receive the actual opponent's score. Importing this          ║
 * ║ component would silently substitute fake opponents into the user's      ║
 * ║ stake-bearing battles — money bug.                                       ║
 * ║                                                                          ║
 * ║ If you need the PvP UI, edit pages/hub/trivia/pvp.js. If you want to     ║
 * ║ delete this file, verify with grep -rn 'PvPBattle' first; safe as of    ║
 * ║ Phase 69.                                                                ║
 * ╚══════════════════════════════════════════════════════════════════════════╝
 */

import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Swords, Gem, Check, X, Crown, Clock, User } from 'lucide-react';
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
    onOpponentAnswer // Called when opponent answers (for real-time)
}) {
    const [currentRound, setCurrentRound] = useState(0);
    const [playerScore, setPlayerScore] = useState(0);
    const [opponentScore, setOpponentScore] = useState(0);
    const [selectedAnswer, setSelectedAnswer] = useState(null);
    const [opponentAnswer, setOpponentAnswer] = useState(null);
    const [timeLeft, setTimeLeft] = useState(TIME_PER_QUESTION);
    const [roundResult, setRoundResult] = useState(null); // 'player', 'opponent', 'tie'
    const [gameOver, setGameOver] = useState(false);
    const [playerAnswered, setPlayerAnswered] = useState(false);
    const answerTimeRef = useRef(null);

    const currentQuestion = questions[currentRound];
    const totalRounds = Math.min(questions.length, QUESTIONS_PER_BATTLE);

    // Timer
    useEffect(() => {
        if (gameOver || roundResult) return;

        const timer = setInterval(() => {
            setTimeLeft(prev => {
                if (prev <= 1) {
                    handleTimeout();
                    return 0;
                }
                return prev - 1;
            });
        }, 1000);

        return () => clearInterval(timer);
    }, [currentRound, gameOver, roundResult]);

    const handleTimeout = () => {
        if (!playerAnswered) {
            // Player didn't answer - opponent wins round if they did
            if (opponentAnswer !== null) {
                setRoundResult('opponent');
                setOpponentScore(prev => prev + 1);
            } else {
                setRoundResult('tie');
            }
        }
        setTimeout(nextRound, 2000);
    };

    const handleAnswer = (answerIndex) => {
        if (playerAnswered || roundResult) return;

        setSelectedAnswer(answerIndex);
        setPlayerAnswered(true);
        answerTimeRef.current = Date.now();

        const isCorrect = answerIndex === currentQuestion.correct_index;

        // Simulate opponent answer (in real implementation, this comes from server)
        const opponentTime = Math.random() * 3000 + 500;
        setTimeout(() => {
            const oppCorrect = Math.random() > 0.4; // 60% chance correct
            setOpponentAnswer(oppCorrect ? currentQuestion.correct_index :
                currentQuestion.options.findIndex((_, i) => i !== currentQuestion.correct_index));

            // Determine round winner
            determineRoundWinner(isCorrect, oppCorrect, answerTimeRef.current, Date.now());
        }, opponentTime);
    };

    const determineRoundWinner = (playerCorrect, opponentCorrect, playerTime, opponentTime) => {
        setTimeout(() => {
            if (playerCorrect && !opponentCorrect) {
                setRoundResult('player');
                setPlayerScore(prev => prev + 1);
                busEmit.decisionCorrect(playerScore + 1);
            } else if (!playerCorrect && opponentCorrect) {
                setRoundResult('opponent');
                setOpponentScore(prev => prev + 1);
                busEmit.decisionIncorrect(playerScore);
                busEmit.screenShake('light');
            } else if (playerCorrect && opponentCorrect) {
                // Both correct - faster wins
                if (playerTime < opponentTime) {
                    setRoundResult('player');
                    setPlayerScore(prev => prev + 1);
                    busEmit.decisionCorrect(playerScore + 1);
                } else {
                    setRoundResult('opponent');
                    setOpponentScore(prev => prev + 1);
                    busEmit.decisionIncorrect(playerScore);
                }
            } else {
                setRoundResult('tie');
            }

            // Move to next round after delay
            setTimeout(nextRound, 2000);
        }, 500);
    };

    const nextRound = () => {
        if (currentRound >= totalRounds - 1) {
            setGameOver(true);
            return;
        }

        setCurrentRound(prev => prev + 1);
        setSelectedAnswer(null);
        setOpponentAnswer(null);
        setRoundResult(null);
        setPlayerAnswered(false);
        setTimeLeft(TIME_PER_QUESTION);
    };

    const handleGameEnd = () => {
        const playerWon = playerScore > opponentScore;
        const rakeAmount = Math.floor(stakeAmount * 2 * 0.1);
        const winnings = playerWon ? (stakeAmount * 2 - rakeAmount) : 0;

        if (playerWon) {
            busEmit.diamondsEarned(winnings, 'PvP Battle Victory');
            busEmit.celebration('confetti');
        } else {
            busEmit.diamondsSpent(stakeAmount, 'PvP Battle Loss');
        }

        onComplete?.({
            won: playerWon,
            playerScore,
            opponentScore,
            stake: stakeAmount,
            winnings,
            opponent: opponent
        });
    };

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
