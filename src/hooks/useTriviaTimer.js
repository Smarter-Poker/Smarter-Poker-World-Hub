import { useState, useRef, useEffect } from 'react';

/**
 * useTriviaTimer — shared shot-clock hook for trivia game pages.
 * TRAIN-TRIVIA-TIMER-1
 *
 * Encapsulates the duplicated timer pattern that previously lived in
 * mixed.js, pvp.js, tournaments.js, endless.js, and survival-game.js:
 *   - timeLeft / isTimerRunning / timerRef local state
 *   - visibility-change effect (pause on tab-hide, resume on tab-return)
 *   - setInterval shot-clock effect with onTimeout callback
 *
 * @param {object}   opts
 * @param {number}   [opts.initialTime=24]         Starting seconds per question.
 * @param {boolean}  opts.showResult               When true, halts the countdown.
 * @param {string}   opts.gameState                Current game state string.
 * @param {string}   [opts.playingState='playing'] Which gameState value means "playing".
 * @param {function} opts.onTimeout                Called when the countdown reaches zero.
 * @param {boolean}  [opts.autoResumeOnVisible=true] Auto-resume when tab returns.
 *
 * @returns {{ timeLeft, setTimeLeft, isTimerRunning, setIsTimerRunning, resetTimer }}
 */
export default function useTriviaTimer({
    initialTime = 24,
    showResult,
    gameState,
    playingState = 'playing',
    onTimeout,
    autoResumeOnVisible = true,
}) {
    const [timeLeft, setTimeLeft] = useState(initialTime);
    const [isTimerRunning, setIsTimerRunning] = useState(false);
    const timerRef = useRef(null);

    // Keep onTimeout in a ref so the interval callback always calls the latest
    // version without needing it in the effect deps array.
    const onTimeoutRef = useRef(onTimeout);
    useEffect(() => { onTimeoutRef.current = onTimeout; });

    // Visibility-based pause + optional auto-resume.
    // Phase 57 note (originally in mixed.js): previously paused on tab-switch but
    // never resumed → user stuck on question with no countdown. Auto-resume is ON
    // by default; set autoResumeOnVisible=false for pages that handle resume
    // themselves (e.g. endless.js which shows an explicit resume UI).
    useEffect(() => {
        const handleVisibilityChange = () => {
            if (document.hidden && isTimerRunning) {
                setIsTimerRunning(false);
            } else if (autoResumeOnVisible && !document.hidden && !isTimerRunning && gameState === playingState && !showResult) {
                setIsTimerRunning(true);
            }
        };
        document.addEventListener('visibilitychange', handleVisibilityChange);
        return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
    }, [isTimerRunning, gameState, showResult, playingState, autoResumeOnVisible]);

    // Shot clock countdown.
    useEffect(() => {
        if (!isTimerRunning || showResult) {
            if (timerRef.current) clearInterval(timerRef.current);
            return;
        }

        timerRef.current = setInterval(() => {
            setTimeLeft(prev => {
                if (prev <= 1) {
                    clearInterval(timerRef.current);
                    onTimeoutRef.current?.();
                    return 0;
                }
                return prev - 1;
            });
        }, 1000);

        return () => {
            if (timerRef.current) clearInterval(timerRef.current);
        };
    }, [isTimerRunning, showResult]);

    /**
     * Reset the clock to a given time (defaults to initialTime) and start it.
     * Used by onAnswer and startGame handlers.
     */
    function resetTimer(time = initialTime) {
        setTimeLeft(time);
        setIsTimerRunning(true);
    }

    return { timeLeft, setTimeLeft, isTimerRunning, setIsTimerRunning, resetTimer };
}
