/**
 * GHOST OPPONENT - Simulated "live" opponent for trivia games
 * Shows an avatar + name + running score alongside the player.
 * Opponent "answers" with realistic delays and ~55% accuracy
 * (so the player wins ~60% of the time - positive dopamine loop).
 */

import { useState, useEffect, useRef } from 'react';

// ══ Realistic poker player names ══
const OPPONENT_NAMES = [
    'AcesHighMike', 'RiverRat_22', 'PokerShark99', 'TheNut$',
    'All1nAndy', 'FoldQueen', 'ChipDust42', 'Bluff_Daddy',
    'PocketKings_J', 'SetMiner88', 'FloatTheFlop', 'StackEmUp',
    'BigSlick_Pro', 'ColdDeck_Chris', 'TiltMaster', 'NittyNate',
    'SuitedAce', 'RunItTwice', 'ValueBet_V', 'CrushTheTable',
    'WSOP_Dreamer', 'GTO_Grinder', 'TripleBrrl', 'FishHunter',
];

function getOpponent(seed) {
    const nameIdx = Math.abs(seed) % OPPONENT_NAMES.length;
    return {
        name: OPPONENT_NAMES[nameIdx],
    };
}

// Difficulty-scaled "thinking" time. A believable opponent hesitates longer on
// a hard question than on an easy one - the old flat 1-4s felt mechanical.
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

            // Hide reaction after 1.5s - tracked in ref so cleanup can clear.
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
    const opponentLeading = !playerLeading && !tied;
    const opponentStatus = !isGameActive
        ? 'Finished'
        : showReaction
            ? (opponentCorrect ? 'Correct' : 'Wrong')
            : opponentAnswered
                ? 'Answered'
                : 'Thinking';
    const statusInk = showReaction && isGameActive
        ? (opponentCorrect ? 'tc-ink--green' : 'tc-ink--red')
        : 'tc-ink--muted';

    // Printed on the console glass as two label / value rows with an
    // engraved rule between them. No avatar, badge or bar is drawn.
    return (
        <div className="ghost-opponent" role="group" aria-label={`Head To Head Over ${Math.max(1, totalQuestions)} Questions`}>
            <ul className="tc-rows ghost-opponent__rows">
                <li className="tc-row ghost-opponent__row">
                    <span className="tc-row__label">You</span>
                    <span className={`tc-row__value ${playerLeading ? 'tc-ink--green' : 'tc-ink--silver'}`}>
                        {playerCorrectCount} Correct
                    </span>
                </li>
                <li className="tc-row ghost-opponent__row">
                    <span className="tc-row__label ghost-opponent__name">{opponent.name}</span>
                    <span className="tc-row__value ghost-opponent__value">
                        <span className={`ghost-opponent__status ${statusInk}`} aria-live="polite">{opponentStatus}</span>
                        <span className={opponentLeading ? 'tc-ink--green' : 'tc-ink--silver'}>{opponentScore} Correct</span>
                    </span>
                </li>
            </ul>
        </div>
    );
}
