/**
 * TriviaAnswerOption
 * ═══════════════════════════════════════════════════════════════════════════
 * Shared answer-button used by all trivia game-mode pages (mixed, pvp,
 * tournaments, endless, survival-game). Wraps the bg/border/letter/✓/✗
 * pattern that was previously copy-pasted across five 1,000+ line files.
 *
 * Two render variants share all logic; only the visual layer differs:
 *
 *   variant='css' (default — used by mixed, pvp, tournaments)
 *     className-driven (.option, .option.correct, .option.wrong,
 *     .option.selected, .option.eliminated). Shows CheckCircle/XCircle
 *     icons on reveal. The trivia.css styles ship the look.
 *
 *   variant='inline' (used by endless, survival-game)
 *     inline-style driven (bg/border/padding/color/opacity/line-through).
 *     Matches the prior inline JSX byte-for-byte so existing visual
 *     contract is preserved. No checkmark/xmark icons — those files
 *     reveal correctness via bg/border tint only, same as prior inline.
 *
 * Render contract (variant='css'):
 *
 *   <button className="option [correct|wrong|selected|eliminated]">
 *     <span className="option-letter">A</span>
 *     <span className="option-text">Title-cased option label</span>
 *     {showResult && correct  → <CheckCircle .. /> }
 *     {showResult && selected && !correct → <XCircle .. /> }
 *   </button>
 *
 * Render contract (variant='inline'):
 *
 *   <button style={{display:flex, alignItems:center, gap:14, padding:14/18,
 *                   background:<bg>, border:`2px solid ${borderColor}`,
 *                   borderRadius:10, color:<fg>, fontSize:15,
 *                   textAlign:left, opacity:<1|0.5>,
 *                   textDecoration:<none|line-through>, cursor:<pointer|default>,
 *                   transition:'all 0.2s'}}>
 *     <span style={{width:28, height:28, display:flex, alignItems:center,
 *                    justifyContent:center, background:<...>, borderRadius:6,
 *                    fontWeight:700, fontSize:13, color:<...>}}>
 *       {eliminated ? '✗' : 'A'}
 *     </span>
 *     <span style={{flex:1}}>{option}</span>
 *   </button>
 *
 * Props
 *   index           number  — 0-based option index
 *   option          string  — answer label (caller is responsible for
 *                              toTitleCase; the primitive stays formatter-
 *                              agnostic)
 *   selectedAnswer  number|null — index of the user's current pick
 *   correctIndex    number  — solver-correct index
 *   showResult      boolean — has the answer been revealed
 *   disabled        boolean — explicit disable (defaults to
 *                              showResult || eliminated)
 *   eliminated      boolean — was this option struck by a 50/50 lifeline
 *   onSelect        (index) => void
 *   iconSize        number  — CheckCircle/XCircle px (default 20, css only)
 *   className       string  — extra wrapper className (rare, css only)
 *   variant         'css' | 'inline'  — render mode (default 'css')
 *
 * Build-safety: no emoji chars in code, no JSX comments inside conditional
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
  variant = 'css',
}) {
  const isCorrect = showResult && index === correctIndex;
  const isWrong = showResult && index === selectedAnswer && index !== correctIndex;
  const isSelected = !showResult && index === selectedAnswer;
  const isDisabled = disabled !== undefined ? disabled : (showResult || eliminated);
  const letter = String.fromCharCode(65 + index); // A / B / C / D ...

  const handleClick = React.useCallback(() => {
    if (isDisabled) return;
    onSelect && onSelect(index);
  }, [isDisabled, onSelect, index]);

  // Common a11y/data attributes shared across variants.
  const commonProps = {
    onClick: handleClick,
    disabled: isDisabled,
    type: 'button',
    'aria-label': `Answer ${letter}: ${option}`,
    'aria-pressed': selectedAnswer === index ? true : undefined,
    'data-trivia-answer': true,
    'data-correct': isCorrect ? 'true' : undefined,
    'data-wrong': isWrong ? 'true' : undefined,
    'data-eliminated': eliminated ? 'true' : undefined,
  };

  if (variant === 'inline') {
    // Mirrors the inline-styled JSX previously hand-rolled inside
    // endless.js and survival-game.js so visual output is byte-equivalent.
    let bg = 'rgba(255,255,255,0.05)';
    let borderColor = 'rgba(255,255,255,0.1)';
    if (showResult) {
      if (index === correctIndex) {
        bg = 'rgba(34, 197, 94, 0.15)';
        borderColor = '#22c55e';
      } else if (index === selectedAnswer) {
        bg = 'rgba(239, 68, 68, 0.15)';
        borderColor = '#ef4444';
      }
    }
    return (
      <button
        {...commonProps}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '14px',
          padding: '14px 18px',
          background: bg,
          border: `2px solid ${borderColor}`,
          borderRadius: '10px',
          color: eliminated ? 'rgba(255,255,255,0.3)' : 'rgba(255,255,255,0.9)',
          fontSize: '15px',
          textAlign: 'left',
          cursor: isDisabled ? 'default' : 'pointer',
          transition: 'all 0.2s',
          textDecoration: eliminated ? 'line-through' : 'none',
          opacity: eliminated ? 0.5 : 1,
        }}
      >
        <span
          style={{
            width: '28px',
            height: '28px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: eliminated ? 'rgba(239, 68, 68, 0.2)' : 'rgba(255,255,255,0.1)',
            borderRadius: '6px',
            fontWeight: 700,
            fontSize: '13px',
            color: eliminated ? '#ef4444' : 'inherit',
          }}
        >
          {eliminated ? '✗' : letter}
        </span>
        <span style={{ flex: 1 }}>{option}</span>
      </button>
    );
  }

  // Default 'css' variant — className-driven.
  let className = 'option';
  if (eliminated) className += ' eliminated';
  if (isCorrect) className += ' correct';
  else if (isWrong) className += ' wrong';
  else if (isSelected) className += ' selected';
  if (extraClassName) className += ' ' + extraClassName;

  return (
    <button {...commonProps} className={className}>
      <span className="option-letter">{eliminated ? '✗' : letter}</span>
      <span className="option-text">{option}</span>
      {isCorrect ? (
        <CheckCircle size={iconSize} className="result-icon correct-icon" aria-hidden />
      ) : null}
      {isWrong ? (
        <XCircle size={iconSize} className="result-icon incorrect-icon" aria-hidden />
      ) : null}
    </button>
  );
});

export default TriviaAnswerOption;

export const TRIVIA_ANSWER_OPTION_VERSION = '1.1.0';
