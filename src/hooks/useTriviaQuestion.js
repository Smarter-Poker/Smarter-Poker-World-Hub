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

import { useState, useCallback, useRef } from 'react';

export default function useTriviaQuestion(currentQuestion, options = {}) {
  const { onAnswer, autoRevealMs } = options || {};
  const [selectedAnswer, setSelectedAnswer] = useState(null);
  const [showResult, setShowResult] = useState(false);
  const lockedRef = useRef(false);

  const selectAnswer = useCallback(
    (index) => {
      if (lockedRef.current) return;
      if (selectedAnswer !== null) return;
      lockedRef.current = true;

      const correctIdx = currentQuestion?.correct_index;
      const isCorrect = index >= 0 && index === correctIdx;

      setSelectedAnswer(index);
      setShowResult(true);

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
    lockedRef.current = false;
  }, []);

  const isCorrect = showResult && selectedAnswer !== null && currentQuestion
    ? selectedAnswer === currentQuestion.correct_index
    : false;

  return {
    selectedAnswer,
    setSelectedAnswer, // exposed for legacy compat in advanced flows
    showResult,
    setShowResult,
    isCorrect,
    selectAnswer,
    reset,
    correctIndex: currentQuestion?.correct_index,
  };
}

export const USE_TRIVIA_QUESTION_VERSION = '1.0.0';
