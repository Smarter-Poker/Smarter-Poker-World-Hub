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

// Difficulty-scaled "thinking" time. A believable opponent hesitates longer on
// a hard question than on an easy one — the old flat 1-4s felt mechanical.
function answerDelayFor(difficulty) {
    switch (String(difficulty || '').toLowerCase()) {
        case 'easy': return 800 + Math.random() * 1400; // 0.8-2.2s
        case 'hard': return 2000 + Math.random() * 3000; // 2.0-5.0s
        case 'medium': return 1400 + Math.random() * 2400; // 1.4-3.8s
        default: return 1000 + Math.random() * 3000; // 1.0-4.0s
    }
}

export default function GhostOpponent({
    totalQuestions = 10,
    currentQuestionIndex = 0,
    playerCorrectCount = 0,
    isGameActive = true,
    realAccuracy = null, // Community accuracy from trivia_scores (0-1), null = fallback
    questionDifficulty = null, // optional: 'easy' | 'medium' | 'hard'
    onOpponentResult, // callback: (opponentScore, opponentName) when game ends
}) {
    const [opponent] = useState(() => getOpponent(Date.now()));
    const [opponentScore, setOpponentScore] = useState(0);
    const [opponentAnswered, setOpponentAnswered] = useState(false);
    const [opponentCorrect, setOpponentCorrect] = useState(null);
    const [showReaction, setShowReaction] = useState(false);
    const answeredQuestionsRef = useRef(new Set());

    // Use real community accuracy if available, otherwise 55% default
    const accuracy = realAccuracy != null ? Math.max(0.35, Math.min(0.75, realAccuracy)) : 0.55;

    // Latest values for use inside cleanup, which must not close over a stale
    // render (accuracy in particular arrives asynchronously).
    const accuracyRef = useRef(accuracy);
    accuracyRef.current = accuracy;
    const scoreRef = useRef(0);

    const applyOpponentAnswer = (questionIndex) => {
        if (answeredQuestionsRef.current.has(questionIndex)) return null;
        answeredQuestionsRef.current.add(questionIndex);
        const correct = Math.random() < accuracyRef.current;
        if (correct) {
            scoreRef.current += 1;
            setOpponentScore(scoreRef.current);
        }
        return correct;
    };

    // Simulate opponent answering each question.
    // Phase 69: track inner reaction-hide setTimeout so it gets cleared
    // alongside the outer timer on unmount/dep-change. Was previously
    // firing setShowReaction(false) on an unmounted component when user
    // navigated away mid-reaction-flash.
    const reactionHideTimerRef = useRef(null);
    const isMountedRef = useRef(true);
    useEffect(() => () => { isMountedRef.current = false; }, []);

    useEffect(() => {
        if (!isGameActive || answeredQuestionsRef.current.has(currentQuestionIndex)) return undefined;

        setOpponentAnswered(false);
        setOpponentCorrect(null);
        setShowReaction(false);

        const delay = answerDelayFor(questionDifficulty);
        const timer = setTimeout(() => {
            const correct = applyOpponentAnswer(currentQuestionIndex);
            if (correct === null) return;
            setOpponentCorrect(correct);
            setOpponentAnswered(true);
            setShowReaction(true);

            // Hide reaction after 1.5s — tracked in ref so cleanup can clear.
            if (reactionHideTimerRef.current) clearTimeout(reactionHideTimerRef.current);
            reactionHideTimerRef.current = setTimeout(() => setShowReaction(false), 1500);
        }, delay);

        const questionIndexAtSetup = currentQuestionIndex;
        return () => {
            clearTimeout(timer);
            if (reactionHideTimerRef.current) clearTimeout(reactionHideTimerRef.current);
            // A fast player advances the question (arcade auto-advances 800ms
            // after answering) long before the ghost's 1-4s timer fires. The
            // old cleanup simply dropped that answer, so the "opponent" ended
            // most games on ~0 points and the intended ~60% win rate collapsed
            // into a hollow guaranteed win. Resolve the pending answer now
            // instead of discarding it.
            if (isMountedRef.current) applyOpponentAnswer(questionIndexAtSetup);
        };
    }, [currentQuestionIndex, isGameActive, questionDifficulty]);

    // Report final score + name when game ends. Read from the ref so a
    // just-resolved final answer is included rather than a stale state value.
    const reportedRef = useRef(false);
    useEffect(() => {
        if (isGameActive || reportedRef.current || !onOpponentResult) return;
        reportedRef.current = true;
        onOpponentResult(scoreRef.current, opponent.name);
    }, [isGameActive, onOpponentResult, opponent.name]);

    const playerLeading = playerCorrectCount > opponentScore;
    const tied = playerCorrectCount === opponentScore;
    const progressTotal = Math.max(1, totalQuestions);
    const playerProgress = Math.min(100, (Math.min(currentQuestionIndex, progressTotal) / progressTotal) * 100);
    const oppProgress = Math.min(100, (answeredQuestionsRef.current.size / progressTotal) * 100);

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
                        className={`score-avatar opp ${showReaction ? (opponentCorrect ? 'ring-correct' : 'ring-wrong') : ''}`}
                        style={{
                            background: `linear-gradient(135deg, ${opponent.colors[0]}, ${opponent.colors[1]})`
                        }}
                    >
                        {opponent.initial}
                    </div>
                </div>
            </div>

            {/* Dual race progress — the core mechanic is racing someone, so
                show it rather than leaving it implied by two numbers. */}
            <div className="race-bars" aria-hidden="true">
                <div className="race-track">
                    <div className="race-fill you" style={{ width: `${playerProgress}%` }} />
                </div>
                <div className="race-track">
                    <div className="race-fill opp" style={{ width: `${oppProgress}%` }} />
                </div>
            </div>

            {/* Opponent name + status */}
            <div className="opponent-info">
                <span className="opp-name">{opponent.name}</span>
                {opponentAnswered && isGameActive && !showReaction && (
                    <span className="opp-answered">answered!</span>
                )}
                <AnimatePresence>
                    {showReaction && (
                        <motion.span
                            className={`opp-reaction ${opponentCorrect ? 'correct' : 'wrong'}`}
                            initial={{ opacity: 0, y: 5 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0 }}
                        >
                            {opponentCorrect ? 'Correct' : 'Wrong'}
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

            <style>{`
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
                    color: #31a24c;
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
                    background: linear-gradient(135deg, #2374e1, #1a5cc4);
                    color: #fff;
                    font-size: 10px;
                    letter-spacing: 0.5px;
                }

                .score-avatar.opp {
                    color: #fff;
                    font-size: 16px;
                    box-shadow: 0 0 0 0 rgba(0, 0, 0, 0);
                    transition: box-shadow 0.2s ease;
                }

                .score-avatar.opp.ring-correct {
                    box-shadow: 0 0 0 3px rgba(49, 162, 76, 0.9), 0 0 12px rgba(49, 162, 76, 0.6);
                }

                .score-avatar.opp.ring-wrong {
                    box-shadow: 0 0 0 3px rgba(240, 40, 73, 0.9), 0 0 12px rgba(240, 40, 73, 0.6);
                }

                .race-bars {
                    display: flex;
                    flex-direction: column;
                    gap: 3px;
                    margin-top: 6px;
                }

                .race-track {
                    height: 4px;
                    background: rgba(255, 255, 255, 0.08);
                    border-radius: 2px;
                    overflow: hidden;
                }

                .race-fill {
                    height: 100%;
                    border-radius: 2px;
                    transition: width 0.35s ease;
                }

                .race-fill.you {
                    background: linear-gradient(90deg, #2374e1, #00d4ff);
                }

                .race-fill.opp {
                    background: linear-gradient(90deg, rgba(255, 255, 255, 0.25), rgba(255, 255, 255, 0.5));
                }

                .opp-answered {
                    font-size: 11px;
                    font-weight: 700;
                    color: #fbbf24;
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
                    color: #31a24c;
                }

                .opp-reaction.wrong {
                    color: #f02849;
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

                @media (prefers-reduced-motion: reduce) {
                    .opp-thinking { animation: none; opacity: 0.6; }
                    .race-fill,
                    .score-side,
                    .score-num,
                    .score-avatar.opp { transition: none; }
                }
            `}</style>
        </div>
    );
}
