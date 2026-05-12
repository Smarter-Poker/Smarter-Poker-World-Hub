/**
 * TriviaAnswerOption
 * ═══════════════════════════════════════════════════════════════════════════
 * Shared answer-button used by all trivia game-mode pages (mixed, pvp,
 * tournaments, endless, survival-game). Wraps the bg/border/letter/✓/✗
 * pattern that was previously copy-pasted across five 1,000+ line files.
 *
 * Render contract is intentionally identical to the prior inline JSX so
 * existing trivia CSS (.option, .option.correct, .option.wrong,
 * .option.selected) keeps working without changes:
 *
 *   <button className="option [correct|wrong|selected]">
 *     <span className="option-letter">A</span>
 *     <span className="option-text">Title-cased option label</span>
 *     {showResult && correct  → <CheckCircle .. /> }
 *     {showResult && selected && !correct → <XCircle .. /> }
 *   </button>
 *
 * Props
 *   index           number  — 0-based option index
 *   option          string  — answer label (will be passed through toTitleCase
 *                              by the caller; we don't title-case here so the
 *                              primitive stays formatter-agnostic)
 *   selectedAnswer  number|null — index of the user's current pick
 *   correctIndex    number  — solver-correct index
 *   showResult      boolean — has the answer been revealed
 *   disabled        boolean — explicit disable (defaults to showResult)
 *   eliminated      boolean — was this option struck by a 50/50 lifeline
 *   onSelect        (index) => void
 *   iconSize        number  — CheckCircle/XCircle px (default 20)
 *   className       string  — extra wrapper className (rare)
 *
 * Build-safety: no emoji chars, no JSX comments inside conditional
 * expressions. Uses lucide-react icons (already CDN-cached for trivia).
 */
// TRAIN-TRIVIA-ANSWER-OPTION-1 — audit-marker registry token

import React from 'react';
import { CheckCircle, XCircle } from 'lucide-react';

const TriviaAnswerOption = React.memo(function TriviaAnswerOption({
  index,
  option,
  selectedAnswer,
  correctIndex,
  showResult,
  disabled,
  eliminated = false,
  onSelect,
  iconSize = 20,
  className: extraClassName = '',
}) {
  let className = 'option';
  if (eliminated) className += ' eliminated';
  if (showResult) {
    if (index === correctIndex) className += ' correct';
    else if (index === selectedAnswer) className += ' wrong';
  } else if (index === selectedAnswer) {
    className += ' selected';
  }
  if (extraClassName) className += ' ' + extraClassName;

  const isDisabled = disabled !== undefined ? disabled : (showResult || eliminated);
  const letter = String.fromCharCode(65 + index); // A / B / C / D ...

  const handleClick = React.useCallback(() => {
    if (isDisabled) return;
    onSelect && onSelect(index);
  }, [isDisabled, onSelect, index]);

  return (
    <button
      className={className}
      onClick={handleClick}
      disabled={isDisabled}
      type="button"
      aria-label={`Answer ${letter}: ${option}`}
      aria-pressed={selectedAnswer === index ? true : undefined}
      data-trivia-answer
      data-correct={showResult && index === correctIndex ? 'true' : undefined}
      data-wrong={showResult && index === selectedAnswer && index !== correctIndex ? 'true' : undefined}
      data-eliminated={eliminated ? 'true' : undefined}
    >
      <span className="option-letter">{eliminated ? '✗' : letter}</span>
      <span className="option-text">{option}</span>
      {showResult && index === correctIndex ? (
        <CheckCircle size={iconSize} className="result-icon correct-icon" aria-hidden />
      ) : null}
      {showResult && index === selectedAnswer && index !== correctIndex ? (
        <XCircle size={iconSize} className="result-icon incorrect-icon" aria-hidden />
      ) : null}
    </button>
  );
});

export default TriviaAnswerOption;

export const TRIVIA_ANSWER_OPTION_VERSION = '1.0.0';
