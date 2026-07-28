/**
 * QuizAnswer
 * ═══════════════════════════════════════════════════════════════════════════
 * Shared multiple-choice quiz answer button used by trainers that ask the
 * player to pick one of N pre-computed options (scenario-demo, pot-geometry,
 * quiz-gauntlet, short-deck-trainer, daily-challenge).
 *
 * Unlike ActionButton (which carries poker-action theme colors fold/call/raise
 * etc.), QuizAnswer is theme-neutral: in idle state it uses --sp-bg-elev0 /
 * --sp-border / --sp-fg, and only takes a colored state after the answer is
 * revealed (correct → green band + ✓, picked-wrong → red band + ✕).
 *
 * Props
 *   label             string — the visible answer text (e.g. "A-6-7-8-9")
 *   shortcut          number/string — optional kbd hint chip (e.g. 1/2/3/4)
 *   shortcutPosition  'top-left' | 'top-right' (default 'top-right')
 *   selected          boolean — has the user picked THIS option
 *   correct           boolean — is THIS option the correct answer
 *   show              boolean — has the user picked any option yet (reveal gate)
 *   disabled          boolean — explicit disable (defaults to `show`)
 *   onClick           handler
 *   size              'sm' | 'md' | 'lg' (default 'md', md uses min 44px touch)
 *   fullWidth         boolean — expand to 100% width inside its row
 *   ariaLabel         override
 *   className         string
 *   style             object — merged AFTER built-in styles
 *
 * Verdict states (precedence top-down):
 *   show && correct                 → green band + ✓ overlay
 *   show && selected && !correct    → red band + ✕ overlay
 *   show && !selected && !correct   → muted (un-picked, wrong, faded)
 *   !show                           → default interactive
 *
 * Keyboard shortcut handling: parent should wire up the global keydown
 * listener (number keys 1/2/3/4) — this component just RENDERS the kbd
 * hint chip. Same pattern as ActionButton.
 *
 * Build-safety: no emoji chars (✓/✕ are basic-multilingual-plane), no
 * JSX comments inside conditional expressions.
 */
// TRAIN-QUIZ-ANSWER-1 — audit-marker registry token

import React from 'react';

const SIZE_PRESETS = {
  sm: { height: 40, fontSize: 12, padX: 10, kbdSize: 10, radius: 8 },
  md: { height: 48, fontSize: 13, padX: 12, kbdSize: 11, radius: 8 },
  lg: { height: 56, fontSize: 15, padX: 16, kbdSize: 12, radius: 10 },
};

function deriveAriaLabel({ label, shortcut, correct, selected, show }) {
  const parts = [label];
  if (shortcut !== undefined && shortcut !== null) parts.push(`shortcut ${shortcut}`);
  if (show && correct) parts.push('correct answer');
  if (show && selected && !correct) parts.push('your answer, incorrect');
  return parts.join(', ');
}

const QuizAnswer = React.forwardRef(function QuizAnswer(
  {
    label,
    shortcut,
    shortcutPosition = 'top-right',
    selected = false,
    correct = false,
    show = false,
    disabled,
    onClick,
    size = 'md',
    fullWidth = false,
    ariaLabel,
    className,
    style,
    type = 'button',
    ...rest
  },
  ref
) {
  const sz = SIZE_PRESETS[size] || SIZE_PRESETS.md;
  const isDisabled = disabled !== undefined ? disabled : show;
  const computedAria = ariaLabel || deriveAriaLabel({ label, shortcut, correct, selected, show });

  // Compute verdict-tinted bg / border via rgba(var(--sp-*-rgb), 0.12)
  let bg = 'var(--sp-bg-elev1)';
  let border = 'var(--sp-border)';
  let color = 'var(--sp-fg)';
  let opacity = 1;
  let overlay = null;

  if (show) {
    if (correct) {
      bg = 'rgba(var(--sp-accent-green-rgb), 0.12)';
      border = 'rgba(var(--sp-accent-green-rgb), 0.4)';
      color = 'var(--sp-fg)';
      overlay = '✓'; // ✓
    } else if (selected) {
      bg = 'rgba(var(--sp-accent-red-rgb), 0.12)';
      border = 'rgba(var(--sp-accent-red-rgb), 0.4)';
      color = 'var(--sp-fg)';
      overlay = '✕'; // ✕
    } else {
      bg = 'rgba(0,0,0,0.2)';
      border = 'var(--sp-border)';
      color = 'var(--sp-fg-muted)';
      opacity = 0.7;
    }
  }

  const baseStyle = {
    position: 'relative',
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: 88,
    width: fullWidth ? '100%' : undefined,
    minHeight: sz.height,
    height: sz.height,
    padding: `0 ${sz.padX}px`,
    border: `1px solid ${border}`,
    background: bg,
    color,
    opacity,
    borderRadius: sz.radius,
    fontFamily: "'Inter', -apple-system, sans-serif",
    fontWeight: 600,
    fontSize: sz.fontSize,
    cursor: isDisabled ? 'default' : 'pointer',
    transition: 'transform 120ms ease, background 120ms ease, border-color 120ms ease',
    outline: 'none',
    WebkitTapHighlightColor: 'transparent',
    gap: 6,
  };

  const labelStyle = {
    lineHeight: 1.2,
  };

  const overlayStyle = {
    fontWeight: 800,
    fontSize: sz.fontSize + 2,
    color: correct
      ? 'rgba(var(--sp-accent-green-rgb), 0.95)'
      : 'rgba(var(--sp-accent-red-rgb), 0.95)',
    pointerEvents: 'none',
  };

  const kbdBaseStyle = {
    position: 'absolute',
    top: 4,
    fontSize: sz.kbdSize,
    fontWeight: 800,
    color: 'rgba(255,255,255,0.45)',
    background: 'rgba(0,0,0,0.35)',
    border: '1px solid rgba(255,255,255,0.1)',
    padding: '1px 5px',
    borderRadius: 4,
    fontFamily: "'JetBrains Mono', 'SF Mono', Menlo, monospace",
    lineHeight: 1,
    pointerEvents: 'none',
  };
  const kbdStyle = shortcutPosition === 'top-left'
    ? { ...kbdBaseStyle, left: 4 }
    : { ...kbdBaseStyle, right: 6 };

  const onMouseDown = (e) => {
    if (isDisabled) return;
    e.currentTarget.style.transform = 'translateY(1px)';
  };
  const onMouseUp = (e) => {
    e.currentTarget.style.transform = 'translateY(0)';
  };

  const showShortcut = shortcut !== undefined && shortcut !== null;

  return (
    <button
      ref={ref}
      type={type}
      className={className}
      onClick={onClick}
      disabled={isDisabled}
      aria-label={computedAria}
      aria-pressed={selected ? true : undefined}
      data-quiz-answer
      data-correct={show && correct ? 'true' : undefined}
      data-wrong={show && selected && !correct ? 'true' : undefined}
      onMouseDown={onMouseDown}
      onMouseUp={onMouseUp}
      onMouseLeave={onMouseUp}
      style={{ ...baseStyle, ...(style || {}) }}
      {...rest}
    >
      <span style={labelStyle}>{label}</span>
      {overlay ? <span style={overlayStyle} aria-hidden>{overlay}</span> : null}
      {showShortcut ? (
        <span style={kbdStyle} aria-hidden>{shortcut}</span>
      ) : null}
    </button>
  );
});

export default QuizAnswer;

/**
 * QuizAnswerStack
 * Convenience wrapper laying out 2–N QuizAnswer buttons in a vertical column,
 * defaulting to max-width 320 + centered, matching the existing scenario-demo
 * layout.
 */
export function QuizAnswerStack({ children, gap = 8, maxWidth = 320, style, className }) {
  return (
    <div
      className={className}
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap,
        maxWidth,
        margin: '0 auto',
        ...(style || {}),
      }}
      role="group"
      aria-label="Quiz answers"
    >
      {React.Children.map(children, (child) => {
        if (!child) return null;
        return React.cloneElement(child, {
          fullWidth: child.props.fullWidth ?? true,
        });
      })}
    </div>
  );
}

export const QUIZ_ANSWER_VERSION = '1.0.0';
