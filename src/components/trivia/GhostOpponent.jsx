/**
 * GHOST OPPONENT — Simulated "live" opponent for trivia games
 * Shows an avatar + name + running score alongside the player.
 * Opponent "answers" with realistic delays and ~55% accuracy
 * (so the player wins ~60% of the time — positive dopamine loop).
 */

import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

// ══ Realistic poker player names ══
const OPPONENT_NAMES = [
    'AcesHighMike', 'RiverRat_22', 'PokerShark99', 'TheNut$',
    'All1nAndy', 'FoldQueen', 'ChipDust42', 'Bluff_Daddy',
    'PocketKings_J', 'SetMiner88', 'FloatTheFlop', 'StackEmUp',
    'BigSlick_Pro', 'ColdDeck_Chris', 'TiltMaster', 'NittyNate',
    'SuitedAce', 'RunItTwice', 'ValueBet_V', 'CrushTheTable',
    'WSOP_Dreamer', 'GTO_Grinder', 'TripleBrrl', 'FishHunter',
];

// ══ Avatar colors (gradient pairs) ══
const AVATAR_COLORS = [
    ['#f97316', '#ea580c'], ['#06b6d4', '#0891b2'],
    ['#8b5cf6', '#7c3aed'], ['#ef4444', '#dc2626'],
    ['#22c55e', '#16a34a'], ['#ec4899', '#db2777'],
    ['#fbbf24', '#f59e0b'], ['#14b8a6', '#0d9488'],
];

function getOpponent(seed) {
    const nameIdx = Math.abs(seed) % OPPONENT_NAMES.length;
    const colorIdx = Math.abs(seed * 7) % AVATAR_COLORS.length;
    return {
        name: OPPONENT_NAMES[nameIdx],
        colors: AVATAR_COLORS[colorIdx],
        initial: OPPONENT_NAMES[nameIdx][0].toUpperCase(),
    };
}

export default function GhostOpponent({
    totalQuestions = 10,
    currentQuestionIndex = 0,
    playerCorrectCount = 0,
    isGameActive = true,
    onOpponentResult, // callback: (opponentScore) when game ends
}) {
    const [opponent] = useState(() => getOpponent(Date.now()));
    const [opponentScore, setOpponentScore] = useState(0);
    const [opponentAnswered, setOpponentAnswered] = useState(false);
    const [opponentCorrect, setOpponentCorrect] = useState(null);
    const [showReaction, setShowReaction] = useState(false);
    const answeredQuestionsRef = useRef(new Set());

    // Simulate opponent answering each question
    useEffect(() => {
        if (!isGameActive || answeredQuestionsRef.current.has(currentQuestionIndex)) return;

        setOpponentAnswered(false);
        setOpponentCorrect(null);
        setShowReaction(false);

        // Opponent answers with realistic delay (1-4 seconds)
        const delay = 1000 + Math.random() * 3000;
        const timer = setTimeout(() => {
            answeredQuestionsRef.current.add(currentQuestionIndex);

            // ~55% accuracy for the opponent (player wins ~60%)
            const correct = Math.random() < 0.55;
            setOpponentCorrect(correct);
            if (correct) setOpponentScore(prev => prev + 1);
            setOpponentAnswered(true);
            setShowReaction(true);

            // Hide reaction after 1.5s
            setTimeout(() => setShowReaction(false), 1500);
        }, delay);

        return () => clearTimeout(timer);
    }, [currentQuestionIndex, isGameActive]);

    // Report final score when game ends
    useEffect(() => {
        if (!isGameActive && onOpponentResult) {
            onOpponentResult(opponentScore);
        }
    }, [isGameActive]);

    const playerLeading = playerCorrectCount > opponentScore;
    const tied = playerCorrectCount === opponentScore;

    return (
        <div className="ghost-opponent">
            <div className="opponent-bar">
                {/* Player side */}
                <div className={`score-side player ${playerLeading ? 'leading' : ''}`}>
                    <div className="score-avatar you">YOU</div>
                    <span className="score-num">{playerCorrectCount}</span>
                </div>

                {/* VS badge */}
                <div className="vs-badge">
                    <span>VS</span>
                </div>

                {/* Opponent side */}
                <div className={`score-side opponent ${!playerLeading && !tied ? 'leading' : ''}`}>
                    <span className="score-num">{opponentScore}</span>
                    <div
                        className="score-avatar opp"
                        style={{
                            background: `linear-gradient(135deg, ${opponent.colors[0]}, ${opponent.colors[1]})`
                        }}
                    >
                        {opponent.initial}
                    </div>
                </div>
            </div>

            {/* Opponent name + status */}
            <div className="opponent-info">
                <span className="opp-name">{opponent.name}</span>
                <AnimatePresence>
                    {showReaction && (
                        <motion.span
                            className={`opp-reaction ${opponentCorrect ? 'correct' : 'wrong'}`}
                            initial={{ opacity: 0, y: 5 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0 }}
                        >
                            {opponentCorrect ? '✓' : '✗'}
                        </motion.span>
                    )}
                    {!opponentAnswered && isGameActive && (
                        <motion.span
                            className="opp-thinking"
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                        >
                            thinking...
                        </motion.span>
                    )}
                </AnimatePresence>
            </div>

            <style jsx>{`
                .ghost-opponent {
                    margin-bottom: 16px;
                }

                .opponent-bar {
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    gap: 0;
                    background: linear-gradient(135deg, rgba(15, 23, 42, 0.9), rgba(30, 41, 59, 0.8));
                    border: 1px solid rgba(255, 255, 255, 0.1);
                    border-radius: 16px;
                    padding: 10px 16px;
                    position: relative;
                }

                .score-side {
                    display: flex;
                    align-items: center;
                    gap: 10px;
                    flex: 1;
                    transition: all 0.3s ease;
                }

                .score-side.player {
                    justify-content: flex-end;
                }

                .score-side.opponent {
                    justify-content: flex-start;
                }

                .score-side.leading .score-num {
                    color: #22c55e;
                    text-shadow: 0 0 10px rgba(34, 197, 94, 0.5);
                }

                .score-num {
                    font-size: 28px;
                    font-weight: 900;
                    color: rgba(255, 255, 255, 0.9);
                    font-family: 'Orbitron', monospace;
                    min-width: 30px;
                    text-align: center;
                    transition: color 0.3s, text-shadow 0.3s;
                }

                .score-avatar {
                    width: 36px;
                    height: 36px;
                    border-radius: 50%;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    font-weight: 800;
                    font-size: 13px;
                    flex-shrink: 0;
                }

                .score-avatar.you {
                    background: linear-gradient(135deg, #0ea5e9, #0284c7);
                    color: #fff;
                    font-size: 10px;
                    letter-spacing: 0.5px;
                }

                .score-avatar.opp {
                    color: #fff;
                    font-size: 16px;
                }

                .vs-badge {
                    width: 36px;
                    height: 36px;
                    border-radius: 50%;
                    background: rgba(255, 255, 255, 0.08);
                    border: 1px solid rgba(255, 255, 255, 0.15);
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    flex-shrink: 0;
                    margin: 0 8px;
                }

                .vs-badge span {
                    font-size: 11px;
                    font-weight: 800;
                    color: rgba(255, 255, 255, 0.5);
                    letter-spacing: 1px;
                }

                .opponent-info {
                    display: flex;
                    align-items: center;
                    justify-content: flex-end;
                    gap: 8px;
                    margin-top: 6px;
                    padding-right: 4px;
                }

                .opp-name {
                    font-size: 12px;
                    color: rgba(255, 255, 255, 0.4);
                    font-style: italic;
                }

                .opp-reaction {
                    font-size: 14px;
                    font-weight: 700;
                }

                .opp-reaction.correct {
                    color: #22c55e;
                }

                .opp-reaction.wrong {
                    color: #ef4444;
                }

                .opp-thinking {
                    font-size: 11px;
                    color: rgba(255, 255, 255, 0.3);
                    animation: blink 1s ease-in-out infinite;
                }

                @keyframes blink {
                    0%, 100% { opacity: 0.3; }
                    50% { opacity: 0.8; }
                }
            `}</style>
        </div>
    );
}
