/**
 * TrainerEmptyState
 * ●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●
 * Shared empty-state primitive for trainer surfaces. Covers the three most
 * common cases:
 *   variant='no-data'     — "Complete some sessions first"
 *   variant='locked'      — "This level is locked"
 *   variant='retry'       — "We hit a snag, try again"
 *   variant='complete'    — "All caught up"
 *   variant='custom'      — pass your own icon
 *
 * Props
 *   variant       string (see above)  default 'no-data'
 *   title         string
 *   message       string
 *   cta           { label, onClick }  primary CTA
 *   secondary     { label, onClick }  optional secondary
 *   icon          ReactNode  override
 *   tone          'neutral'|'success'|'warning'|'danger'  affects color
 *   compact       boolean
 *
 * Build-safety: no emoji chars, no JSX comments in conditional expressions.
 */
// TRAIN-EMPTY-STATE-1 — audit-marker registry token

import React from 'react';

const TONE = {
  neutral: { color: '#94a3b8', glow: 'rgba(148,163,184,0.18)' },
  success: { color: '#4ade80', glow: 'rgba(74,222,128,0.18)' },
  warning: { color: '#86daff', glow: 'rgba(134,218,255,0.13)' },
  danger:  { color: '#f87171', glow: 'rgba(248,113,113,0.18)' },
};

const ICON_PROPS = {
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 2,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
  'aria-hidden': true,
};

function InboxIcon({ size = 56 }) {
  return (
    <svg {...ICON_PROPS} width={size} height={size} viewBox="0 0 24 24">
      <polyline points="22 12 16 12 14 15 10 15 8 12 2 12" />
      <path d="M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6L18.55 5.11A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z" />
    </svg>
  );
}
function LockIcon({ size = 56 }) {
  return (
    <svg {...ICON_PROPS} width={size} height={size} viewBox="0 0 24 24">
      <rect x="3" y="11" width="18" height="11" rx="2" />
      <path d="M7 11V7a5 5 0 0 1 10 0v4" />
    </svg>
  );
}
function RetryIcon({ size = 56 }) {
  return (
    <svg {...ICON_PROPS} width={size} height={size} viewBox="0 0 24 24">
      <polyline points="23 4 23 10 17 10" />
      <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10" />
    </svg>
  );
}
function CheckIcon({ size = 56 }) {
  return (
    <svg {...ICON_PROPS} width={size} height={size} viewBox="0 0 24 24">
      <circle cx="12" cy="12" r="10" />
      <polyline points="9 12 12 15 16 10" />
    </svg>
  );
}

const VARIANT_DEFAULTS = {
  'no-data':  { title: 'Nothing here yet', message: 'Complete some training sessions to see your data.', tone: 'neutral', Icon: InboxIcon },
  'locked':   { title: 'Locked', message: 'Unlock this level by completing the previous one.', tone: 'warning', Icon: LockIcon },
  'retry':    { title: 'We hit a snag', message: 'Try again in a moment.', tone: 'danger',  Icon: RetryIcon },
  'complete': { title: 'All caught up', message: "You're done for now.", tone: 'success', Icon: CheckIcon },
};

const TrainerEmptyState = React.memo(function TrainerEmptyState({
  variant = 'no-data',
  title,
  message,
  cta,
  secondary,
  icon,
  tone,
  compact = false,
  className,
  style,
}) {
  const v = VARIANT_DEFAULTS[variant] || VARIANT_DEFAULTS['no-data'];
  const ToneTheme = TONE[tone || v.tone] || TONE.neutral;
  const IconC = v.Icon;

  const wrapStyle = {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    textAlign: 'center',
    padding: compact ? '32px 16px' : '56px 24px',
    color: '#cbd5e1',
    fontFamily: "'Inter', -apple-system, sans-serif",
    ...(style || {}),
  };

  const iconStyle = {
    display: 'inline-flex',
    width: compact ? 48 : 56,
    height: compact ? 48 : 56,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 999,
    background: ToneTheme.glow,
    color: ToneTheme.color,
    marginBottom: compact ? 12 : 16,
  };

  const titleStyle = {
    fontSize: compact ? 16 : 18,
    fontWeight: 800,
    color: '#fff',
    margin: 0,
  };

  const msgStyle = {
    fontSize: compact ? 12 : 13,
    color: '#94a3b8',
    margin: '6px 0 0 0',
    lineHeight: 1.5,
    maxWidth: 380,
  };

  const ctaRowStyle = {
    display: 'flex',
    gap: 8,
    marginTop: 20,
    flexWrap: 'wrap',
    justifyContent: 'center',
  };

  const resolvedIcon = icon || <IconC size={compact ? 28 : 32} />;
  const resolvedTitle = title || v.title;
  const resolvedMsg = message || v.message;

  return (
    <div className={['smarterdesign sd-panel', className].filter(Boolean).join(' ')} style={wrapStyle} role={variant === 'retry' ? 'alert' : 'status'}>
      <span style={iconStyle} aria-hidden>{resolvedIcon}</span>
      <h2 className="sd-section-title" style={titleStyle}>{resolvedTitle}</h2>
      <p style={msgStyle}>{resolvedMsg}</p>
      {cta || secondary ? (
        <div style={ctaRowStyle}>
          {secondary ? (
            <button type="button" onClick={secondary.onClick} aria-label={secondary.label} className="sd-button">
              {secondary.label}
            </button>
          ) : null}
          {cta ? (
            <button type="button" onClick={cta.onClick} aria-label={cta.label} className="sd-button sd-primary">
              {cta.label}
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
});

export default TrainerEmptyState;
export const TRAINER_EMPTY_STATE_VERSION = '1.0.0';
