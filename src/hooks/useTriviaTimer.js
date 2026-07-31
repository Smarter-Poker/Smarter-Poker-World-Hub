import { useState, useRef, useEffect, useCallback } from 'react';

/**
 * useTriviaTimer — shared shot-clock hook for trivia game pages.
 * TRAIN-TRIVIA-TIMER-1
 *
 * Encapsulates the duplicated timer pattern that previously lived in
 * mixed.js, pvp.js, tournaments.js, endless.js, and survival-game.js.
 *
 * Correctness/fairness fixes over the original implementation:
 *  1. DRIFT — the clock was a `setInterval(1000)` that decremented by 1. Every
 *     tick lands at >= 1000ms, so a "24 second" clock ran measurably long and
 *     the arcade time bonus (timeRemaining / 6) paid out for time that never
 *     existed. The countdown is now anchored to a wall-clock deadline and
 *     sampled at 200ms, so elapsed time is exact regardless of tick jitter.
 *  2. IMPURE UPDATER — onTimeout() was called from inside a setState updater.
 *     React 18 StrictMode double-invokes updaters in dev and concurrent
 *     rendering may replay them, so onTimeout could fire twice (double
 *     game-over processing in endless.js). Expiry is now detected in an
 *     effect and guarded by a fired-ref that only resetTimer clears.
 *  3. STUCK CLOCK — on expiry the hook cleared the interval but left
 *     isTimerRunning === true, so a later resetTimer() was a no-op and the
 *     clock silently froze. The hook now stops itself on expiry.
 *  4. TAB-HIDE CHEAT — pausing on `visibilitychange` with no wall-clock anchor
 *     let a PvP/tournament player hide the tab, look the answer up, and come
 *     back to the same reading. Competitive callers pass pauseOnHide:false and
 *     keep burning real time; solo modes keep the old forgiving behaviour.
 *
 * @param {object}   opts
 * @param {number}   [opts.initialTime=24]         Starting seconds per question.
 * @param {boolean}  opts.showResult               When true, halts the countdown.
 * @param {string}   opts.gameState                Current game state string.
 * @param {string}   [opts.playingState='playing'] Which gameState value means "playing".
 * @param {function} opts.onTimeout                Called when the countdown reaches zero.
 * @param {boolean}  [opts.autoResumeOnVisible=true] Auto-resume when tab returns.
 * @param {boolean}  [opts.pauseOnHide=true]       Set false for competitive modes
 *                                                 (pvp/tournaments) so hiding the
 *                                                 tab does not stop the clock.
 *
 * @returns {{ timeLeft, setTimeLeft, isTimerRunning, setIsTimerRunning, resetTimer, getPreciseTimeLeft }}
 */
export default function useTriviaTimer({
  initialTime = 24,
  showResult,
  gameState,
  playingState = 'playing',
  onTimeout,
  autoResumeOnVisible = true,
  pauseOnHide = true,
}) {
  const [timeLeft, setTimeLeft] = useState(initialTime);
  const [isTimerRunning, setIsTimerRunning] = useState(false);
  const timerRef = useRef(null);

  // Wall-clock anchor. deadlineRef is the epoch ms at which timeLeft hits 0
  // while running; remainingMsRef holds the frozen remainder while paused.
  const deadlineRef = useRef(null);
  const remainingMsRef = useRef(initialTime * 1000);
  const firedRef = useRef(false);

  // Keep onTimeout in a ref so the interval callback always calls the latest
  // version without needing it in the effect deps array.
  const onTimeoutRef = useRef(onTimeout);
  useEffect(() => {
    onTimeoutRef.current = onTimeout;
  });

  /** Exact seconds remaining right now (float), independent of render timing. */
  const getPreciseTimeLeft = useCallback(() => {
    if (deadlineRef.current != null) {
      return Math.max(0, (deadlineRef.current - Date.now()) / 1000);
    }
    return Math.max(0, remainingMsRef.current / 1000);
  }, []);

  /**
   * Manual override of the displayed time (legacy API — several pages call
   * setTimeLeft directly). Re-anchors the deadline so the wall clock and the
   * displayed number never disagree.
   */
  const setTimeLeftAnchored = useCallback((value) => {
    setTimeLeft((prev) => {
      const next = typeof value === 'function' ? value(prev) : value;
      const safe = Number.isFinite(next) ? Math.max(0, next) : 0;
      remainingMsRef.current = safe * 1000;
      if (deadlineRef.current != null) deadlineRef.current = Date.now() + safe * 1000;
      if (safe > 0) firedRef.current = false;
      return safe;
    });
  }, []);

  // Visibility-based pause + optional auto-resume.
  useEffect(() => {
    if (!pauseOnHide) return undefined;
    const handleVisibilityChange = () => {
      if (document.hidden && isTimerRunning) {
        setIsTimerRunning(false);
      } else if (
        autoResumeOnVisible &&
        !document.hidden &&
        !isTimerRunning &&
        gameState === playingState &&
        !showResult
      ) {
        setIsTimerRunning(true);
      }
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, [isTimerRunning, gameState, showResult, playingState, autoResumeOnVisible, pauseOnHide]);

  // Shot clock countdown — deadline based, no cumulative drift.
  useEffect(() => {
    if (!isTimerRunning || showResult) {
      // Freeze the remainder so a later resume picks up exactly where we left.
      if (deadlineRef.current != null) {
        remainingMsRef.current = Math.max(0, deadlineRef.current - Date.now());
        deadlineRef.current = null;
      }
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
      return undefined;
    }

    deadlineRef.current = Date.now() + Math.max(0, remainingMsRef.current);

    const tick = () => {
      const remainingMs = Math.max(0, (deadlineRef.current ?? Date.now()) - Date.now());
      // Pure updater: display value only. No side effects in here.
      setTimeLeft(Math.ceil(remainingMs / 1000));
      if (remainingMs <= 0) {
        remainingMsRef.current = 0;
        deadlineRef.current = null;
        if (timerRef.current) {
          clearInterval(timerRef.current);
          timerRef.current = null;
        }
        // Stop ourselves so a later resetTimer() reliably restarts the clock
        // instead of being swallowed as a no-op state write.
        setIsTimerRunning(false);
        if (!firedRef.current) {
          firedRef.current = true;
          try {
            onTimeoutRef.current?.();
          } catch (err) {
            console.warn('[useTriviaTimer] onTimeout threw:', err?.message || err);
          }
        }
      }
    };

    // 200ms sampling keeps the displayed second accurate without the 1s
    // quantisation error that made every question run long.
    timerRef.current = setInterval(tick, 200);
    tick();

    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
    };
  }, [isTimerRunning, showResult]);

  /**
   * Reset the clock to a given time (defaults to initialTime) and start it.
   * Used by onAnswer and startGame handlers.
   */
  const resetTimer = useCallback((time = initialTime) => {
    const safe = Number.isFinite(time) && time > 0 ? time : 0;
    firedRef.current = false;
    remainingMsRef.current = safe * 1000;
    // Re-anchor the deadline directly. resetTimer is usually called while the
    // clock is ALREADY running (next question), in which case setIsTimerRunning
    // is a no-op, the countdown effect does not re-run, and the live interval
    // keeps ticking — so it must see the new deadline, not a stale/null one.
    deadlineRef.current = Date.now() + safe * 1000;
    setTimeLeft(safe);
    setIsTimerRunning(true);
  }, [initialTime]);

  return {
    timeLeft,
    setTimeLeft: setTimeLeftAnchored,
    isTimerRunning,
    setIsTimerRunning,
    resetTimer,
    getPreciseTimeLeft,
  };
}
