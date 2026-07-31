/**
 * useTriviaQuestion
 * ═══════════════════════════════════════════════════════════════════════════
 * Shared state plumbing for trivia question rendering. Captures the
 * selectedAnswer / showResult / isCorrect pattern that was duplicated
 * verbatim across five 1,000+ line trivia mode files (mixed, pvp,
 * tournaments, endless, survival-game).
 *
 * Usage:
 *   const trivia = useTriviaQuestion(currentQuestion, {
 *     onAnswer: ({ index, isCorrect }) => { ... persist + advance ... },
 *     autoRevealMs: 1500,  // optional — auto-flip showResult after pick
 *   });
 *
 *   trivia.selectAnswer(idx);   // user picks an option
 *   trivia.reset();              // call when advancing to next question
 *   trivia.selectedAnswer        // null | number
 *   trivia.showResult            // boolean (true after selectAnswer)
 *   trivia.isCorrect             // boolean (only meaningful when showResult)
 *
 * Build-safety: pure hook, no JSX, no emoji chars.
 */
// TRAIN-TRIVIA-HOOK-1 — audit-marker registry token

import { useState, useCallback, useRef, useEffect } from 'react';

export default function useTriviaQuestion(currentQuestion, options = {}) {
  const { onAnswer, autoRevealMs } = options || {};
  const [selectedAnswer, setSelectedAnswer] = useState(null);
  const [showResult, setShowResult] = useState(false);
  // Correctness is CAPTURED at selection time. Deriving it live
  // (selectedAnswer === currentQuestion.correct_index) meant that if the page
  // advanced currentQuestion before calling reset() — or a background refresh
  // swapped the questions array — the displayed correct/wrong feedback flipped
  // to compare the old pick against the NEW question's answer key.
  const [lastResult, setLastResult] = useState(null);
  const lockedRef = useRef(false);

  const selectAnswer = useCallback(
    (index) => {
      if (lockedRef.current) return;
      if (selectedAnswer !== null) return;
      lockedRef.current = true;

      const correctIdx = currentQuestion?.correct_index;
      const isCorrect = index >= 0 && Number.isInteger(correctIdx) && index === correctIdx;

      setSelectedAnswer(index);
      setShowResult(true);
      setLastResult({ index, isCorrect, correctIndex: correctIdx, questionId: currentQuestion?.id });

      if (typeof onAnswer === 'function') {
        try {
          onAnswer({ index, isCorrect, correctIndex: correctIdx });
        } catch (_err) {
          if (typeof console !== 'undefined' && console.warn) {
            console.warn('[useTriviaQuestion] onAnswer threw:', _err);
          }
        }
      }
    },
    [selectedAnswer, currentQuestion, onAnswer]
  );

  const reset = useCallback(() => {
    setSelectedAnswer(null);
    setShowResult(false);
    setLastResult(null);
    lockedRef.current = false;
  }, []);

  // Auto-unlock when the question identity changes. Previously lockedRef
  // stayed latched across question changes until an explicit reset(), so a
  // forgotten reset() bricked input for the rest of the game.
  const questionId = currentQuestion?.id;
  useEffect(() => {
    setSelectedAnswer(null);
    setShowResult(false);
    setLastResult(null);
    lockedRef.current = false;
  }, [questionId]);

  // NOTE: `autoRevealMs` is accepted for API compatibility but intentionally
  // not acted on — no caller passes it, and every page drives its own reveal
  // timing. Left unimplemented rather than guessing at semantics.
  void autoRevealMs;

  const isCorrect = showResult && lastResult ? lastResult.isCorrect : false;

  return {
    selectedAnswer,
    setSelectedAnswer, // exposed for legacy compat in advanced flows
    showResult,
    setShowResult,
    isCorrect,
    lastResult,
    selectAnswer,
    reset,
    correctIndex: currentQuestion?.correct_index,
  };
}

export const USE_TRIVIA_QUESTION_VERSION = '1.0.0';
