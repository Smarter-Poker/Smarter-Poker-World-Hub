/**
 * TriviaAnswerOption
 * ═══════════════════════════════════════════════════════════════════════════
 * Shared answer button for mixed, PvP, tournament, endless and survival
 * Trivia. The live answer state is expressed through data attributes and
 * text; its visual treatment is owned once by the Console content layer.
 *
 * Props
 *   index           number  - 0-based option index
 *   option          string  - answer label (caller is responsible for
 *                              toTitleCase; the primitive stays formatter-
 *                              agnostic)
 *   selectedAnswer  number|null - index of the user's current pick
 *   correctIndex    number  - solver-correct index
 *   showResult      boolean - has the answer been revealed
 *   disabled        boolean - explicit disable (defaults to
 *                              showResult || eliminated)
 *   eliminated      boolean - was this option struck by a 50/50 lifeline
 *   onSelect        (index) => void
 *   className       string  - extra wrapper className
 *   variant         'css' | 'inline'  - retained as a compatibility marker
 *   announceResult  boolean - render a visually-hidden 'Correct answer' /
 *                              'Your answer, incorrect' string on reveal so
 *                              screen-reader users get the outcome
 *
 * Build-safety: no decorative icon dependency and no runtime style injection.
 */
// TRAIN-TRIVIA-ANSWER-OPTION-1 - audit-marker registry token

import React from 'react';

const TriviaAnswerOption = React.memo(function TriviaAnswerOption({
  index,
  option,
  selectedAnswer,
  correctIndex,
  showResult,
  disabled,
  eliminated = false,
  onSelect,
  className: extraClassName = '',
  variant = 'css',
  announceResult = false,
}) {
  const isCorrect = showResult && index === correctIndex;
  const isWrong = showResult && index === selectedAnswer && index !== correctIndex;
  const isSelected = !showResult && index === selectedAnswer;
  const isDisabled = disabled !== undefined ? disabled : (showResult || eliminated);
  const letter = String.fromCharCode(65 + index); // A / B / C / D ...
  const visibleStatus = isCorrect
    ? 'Correct'
    : isWrong
      ? 'Incorrect'
      : eliminated
        ? 'Removed'
        : isSelected
          ? 'Selected'
          : null;

  // Optional screen-reader announcement of the reveal. Rendered inside the
  // button (which is in the tab order) so it is read when the result flips.
  const srResult = announceResult && showResult && (index === correctIndex || index === selectedAnswer)
    ? (index === correctIndex ? 'Correct Answer' : 'Your Answer, Incorrect')
    : null;

  const handleClick = React.useCallback(() => {
    if (isDisabled) return;
    onSelect && onSelect(index);
  }, [isDisabled, onSelect, index]);

  // Common a11y/data attributes shared across variants.
  const commonProps = {
    onClick: handleClick,
    disabled: isDisabled,
    type: 'button',
    'aria-label': eliminated
      ? `Answer ${letter}: ${option}, Removed By 50/50`
      : `Answer ${letter}: ${option}`,
    // Always a boolean: toggling the ATTRIBUTE's presence (undefined when
    // unselected) makes screen readers announce only the selected option as a
    // toggle and the rest as plain buttons.
    'aria-pressed': selectedAnswer === index,
    'data-trivia-answer': true,
    'data-correct': isCorrect ? 'true' : undefined,
    'data-wrong': isWrong ? 'true' : undefined,
    'data-eliminated': eliminated ? 'true' : undefined,
  };

  let className = `trivia-answer-option option trivia-answer-option--${variant}`;
  if (eliminated) className += ' eliminated';
  if (isCorrect) className += ' correct';
  else if (isWrong) className += ' wrong';
  else if (isSelected) className += ' selected';
  if (extraClassName) className += ' ' + extraClassName;

  return (
    <button {...commonProps} className={className}>
      <span className="option-letter" aria-hidden="true">{letter}</span>
      <span className="option-text" aria-hidden={eliminated || undefined}>{option}</span>
      {visibleStatus ? <span className="trivia-answer-option__status" aria-hidden="true">{visibleStatus}</span> : null}
      {srResult ? <span className="trivia-sr-only">{srResult}</span> : null}
    </button>
  );
});

export default TriviaAnswerOption;

export const TRIVIA_ANSWER_OPTION_VERSION = '2.0.0';
