/**
 * ActionButton
 * ═══════════════════════════════════════════════════════════════════════════
 * Shared poker action button (Fold / Check / Call / Bet / Raise / All-in)
 * modeled on GTO Wizard's 4-button display: large hit area, distinct color
 * per action, visible keyboard shortcut chip, and a subtle pressed/hover
 * microinteraction. Designed to drop into the UDT action bar and any other
 * trainer that needs a row of action choices.
 *
 * Props
 *   action      'fold' | 'check' | 'call' | 'bet' | 'raise' | 'allin'
 *   label       optional override (default derived from action)
 *   amount      optional number/string — rendered below the label
 *               (e.g. amount='100' for "Call 100" or "Bet 100")
 *   shortcut    number/string — keyboard shortcut chip (e.g. 1, 2, 3, 4)
 *   disabled    boolean
 *   selected    boolean — last action chosen (subtle ring)
 *   recommended boolean — solver-optimal action (subtle glow)
 *   onClick     handler
 *   size        'sm' | 'md' | 'lg'  (default 'md', md uses min 44px touch)
 *   fullWidth   boolean — expand to 100% width inside its row
 *   ariaLabel   override
 *   className   string
 *   style       object — merged AFTER built-in styles
 *
 * Keyboard shortcut handling: the parent should still wire up the global
 * keydown listener (number keys 1/2/3/4) — this component just RENDERS
 * the kbd hint chip. That separation keeps the button reusable in contexts
 * where the parent has different shortcut assignments.
 *
 * Build-safety: no emoji chars, no JSX comments inside conditional
 * expressions. Follows the rules from PR #362/#365/#369.
 */
// TRAIN-ACTIONBTN-1 — audit-marker registry token

import React from 'react';

const ACTION_THEMES = {
  fold:    { fill: '#1f2937', border: '#374151', text: '#94a3b8', label: 'Fold' },
  check:   { fill: '#0f3a52', border: '#0891b2', text: '#67e8f9', label: 'Check' },
  call:    { fill: '#063d33', border: '#10b981', text: '#6ee7b7', label: 'Call' },
  bet:     { fill: '#3b2d00', border: '#f59e0b', text: '#fcd34d', label: 'Bet' },
  raise:   { fill: '#4a1010', border: '#ef4444', text: '#fca5a5', label: 'Raise' },
  allin:   { fill: '#3b0a3b', border: '#a855f7', text: '#d8b4fe', label: 'All-in' },
};

const SIZE_PRESETS = {
  sm: { height: 40, fontSize: 13, labelSize: 13, amountSize: 11, padX: 12, kbdSize: 10 },
  md: { height: 56, fontSize: 15, labelSize: 15, amountSize: 12, padX: 16, kbdSize: 11 },
  lg: { height: 72, fontSize: 17, labelSize: 17, amountSize: 13, padX: 20, kbdSize: 12 },
};

function deriveAriaLabel({ action, label, amount, shortcut, recommended }) {
  const baseLabel = label || (ACTION_THEMES[action] || {}).label || action;
  const parts = [baseLabel];
  if (amount !== undefined && amount !== null && amount !== '') parts.push(String(amount));
  if (shortcut !== undefined && shortcut !== null) parts.push(`shortcut ${shortcut}`);
  if (recommended) parts.push('solver-optimal');
  return parts.join(', ');
}

const ActionButton = React.forwardRef(function ActionButton(
  {
    action = 'fold',
    label,
    amount,
    shortcut,
    disabled = false,
    selected = false,
    recommended = false,
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
  const theme = ACTION_THEMES[action] || ACTION_THEMES.fold;
  const sz = SIZE_PRESETS[size] || SIZE_PRESETS.md;
  const displayLabel = label || theme.label;
  const computedAria = ariaLabel || deriveAriaLabel({ action, label: displayLabel, amount, shortcut, recommended });

  const baseStyle = {
    position: 'relative',
    display: 'inline-flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: 88,
    width: fullWidth ? '100%' : undefined,
    minHeight: sz.height,
    height: sz.height,
    padding: `0 ${sz.padX}px`,
    border: `1px solid ${selected || recommended ? theme.border : 'rgba(255,255,255,0.08)'}`,
    background: disabled ? 'rgba(255,255,255,0.04)' : theme.fill,
    color: disabled ? '#475569' : theme.text,
    borderRadius: 10,
    fontFamily: "'Inter', -apple-system, sans-serif",
    fontWeight: 700,
    letterSpacing: 0.3,
    cursor: disabled ? 'not-allowed' : 'pointer',
    opacity: disabled ? 0.55 : 1,
    boxShadow: recommended
      ? `0 0 0 2px ${theme.border}, 0 4px 14px ${theme.border}33`
      : selected
        ? `0 0 0 1.5px ${theme.border}`
        : '0 1px 2px rgba(0,0,0,0.3)',
    transition: 'transform 120ms ease, box-shadow 120ms ease, background 120ms ease',
    outline: 'none',
    WebkitTapHighlightColor: 'transparent',
  };

  const labelStyle = {
    fontSize: sz.labelSize,
    fontWeight: 800,
    textTransform: 'uppercase',
    lineHeight: 1.1,
  };

  const amountStyle = {
    fontSize: sz.amountSize,
    fontWeight: 600,
    color: disabled ? '#475569' : 'rgba(255,255,255,0.85)',
    marginTop: 2,
    letterSpacing: 0,
    fontVariantNumeric: 'tabular-nums',
  };

  const kbdStyle = {
    position: 'absolute',
    top: 4,
    right: 6,
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

  const onMouseDown = (e) => {
    if (disabled) return;
    e.currentTarget.style.transform = 'translateY(1px)';
  };
  const onMouseUp = (e) => {
    e.currentTarget.style.transform = 'translateY(0)';
  };

  return (
    <button
      ref={ref}
      type={type}
      className={className}
      onClick={onClick}
      disabled={disabled}
      aria-label={computedAria}
      aria-pressed={selected ? true : undefined}
      data-action={action}
      data-recommended={recommended ? 'true' : undefined}
      onMouseDown={onMouseDown}
      onMouseUp={onMouseUp}
      onMouseLeave={onMouseUp}
      style={{ ...baseStyle, ...(style || {}) }}
      {...rest}
    >
      <span style={labelStyle}>{displayLabel}</span>
      {amount !== undefined && amount !== null && amount !== '' ? (
        <span style={amountStyle}>{amount}</span>
      ) : null}
      {shortcut !== undefined && shortcut !== null ? (
        <span style={kbdStyle} aria-hidden>{shortcut}</span>
      ) : null}
    </button>
  );
});

export default ActionButton;

/**
 * ActionButtonRow
 * Convenience wrapper that lays out 2–4 ActionButtons in a row with
 * GTO-Wizard-style equal flex distribution, mobile-first spacing.
 */
export function ActionButtonRow({ children, gap = 8, style, className }) {
  return (
    <div
      className={className}
      style={{
        display: 'flex',
        alignItems: 'stretch',
        gap,
        width: '100%',
        ...(style || {}),
      }}
      role="group"
      aria-label="Poker actions"
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

export const ACTION_BUTTON_VERSION = '1.0.0';
