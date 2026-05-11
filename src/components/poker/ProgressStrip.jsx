/**
 * ProgressStrip
 * ═══════════════════════════════════════════════════════════════════════════
 * Persistent in-play progress affordance: a slim strip showing the current
 * question position, a completion ring, a difficulty indicator, and an
 * optional best-streak chip. Designed to live above the action bar so the
 * player keeps orientation without leaving the table.
 *
 * Props
 *   current        number — 1-based current question index
 *   total          number — total questions in session
 *   correct        number — answered correctly so far (optional)
 *   difficulty     'beginner' | 'easy' | 'intermediate' | 'advanced' | 'expert'
 *   bestStreak     number — current run-length of correct answers
 *   sessionMs      number — elapsed session ms (optional, for compact time chip)
 *   compact        boolean — slimmer for narrow viewports
 *   className      string
 *   style          object
 *
 * Build-safety: no emoji chars, no JSX comments inside conditional expressions.
 */
// TRAIN-PROGRESS-STRIP-1 — audit-marker registry token

import React from 'react';

const DIFFICULTY_THEMES = {
  beginner:     { color: '#4ade80', label: 'Beginner' },
  easy:         { color: '#22c55e', label: 'Easy' },
  intermediate: { color: '#fbbf24', label: 'Intermediate' },
  advanced:     { color: '#f97316', label: 'Advanced' },
  expert:       { color: '#ef4444', label: 'Expert' },
};

const ICON_PROPS = {
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 2,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
  'aria-hidden': true,
};

function FlameIcon({ size = 12 }) {
  return (
    <svg {...ICON_PROPS} width={size} height={size} viewBox="0 0 24 24">
      <path d="M8.5 14.5A2.5 2.5 0 0 0 11 17a2.5 2.5 0 0 0 2.5-2.5c0-1.5-.5-2.5-2-3.5l-2 2c-.5-.5-1-1-1-2 0-1 1.5-2 1.5-2s-3 1-4 3.5C5 14 6 17 8.5 19c1.5 1.5 4 2 5.5 1.5C17 19.5 19 17 19 13c0-3-1-5-2.5-7C15 4 12 2 12 2s1 4-1 7c-.7 1-1.5 1.5-2.5 2.5z" />
    </svg>
  );
}
function ClockIcon({ size = 12 }) {
  return (
    <svg {...ICON_PROPS} width={size} height={size} viewBox="0 0 24 24">
      <circle cx="12" cy="12" r="10" />
      <polyline points="12 6 12 12 16 14" />
    </svg>
  );
}

function formatMs(ms) {
  if (typeof ms !== 'number' || ms < 0) return '0:00';
  const s = Math.floor(ms / 1000);
  const m = Math.floor(s / 60);
  const ss = (s % 60).toString().padStart(2, '0');
  return `${m}:${ss}`;
}

function CompletionRing({ pct, size = 28, stroke = 3, color = '#00d4ff' }) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const clamped = Math.max(0, Math.min(100, pct || 0));
  const offset = c - (clamped / 100) * c;
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden>
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="rgba(255,255,255,0.1)" strokeWidth={stroke} />
      <circle
        cx={size / 2}
        cy={size / 2}
        r={r}
        fill="none"
        stroke={color}
        strokeWidth={stroke}
        strokeLinecap="round"
        strokeDasharray={c}
        strokeDashoffset={offset}
        transform={`rotate(-90 ${size / 2} ${size / 2})`}
      />
    </svg>
  );
}

const ProgressStrip = React.memo(function ProgressStrip({
  current = 0,
  total = 0,
  correct,
  difficulty,
  bestStreak,
  sessionMs,
  compact = false,
  className,
  style,
}) {
  const safeTotal = total > 0 ? total : 1;
  const safeCurrent = Math.max(0, Math.min(current, safeTotal));
  const completionPct = Math.round((safeCurrent / safeTotal) * 100);
  const accuracyPct = typeof correct === 'number' && safeCurrent > 0
    ? Math.round((correct / safeCurrent) * 100)
    : null;

  const theme = DIFFICULTY_THEMES[difficulty] || null;

  const wrapStyle = {
    display: 'flex',
    alignItems: 'center',
    gap: compact ? 8 : 12,
    padding: compact ? '6px 10px' : '8px 14px',
    background: 'rgba(0,0,0,0.35)',
    border: '1px solid rgba(255,255,255,0.06)',
    borderRadius: 10,
    color: '#cbd5e1',
    fontFamily: "'Inter', -apple-system, sans-serif",
    fontVariantNumeric: 'tabular-nums',
    ...(style || {}),
  };

  const positionStyle = {
    fontSize: compact ? 12 : 13,
    fontWeight: 800,
    color: '#fff',
    letterSpacing: 0.4,
  };

  const labelStyle = {
    fontSize: 10,
    fontWeight: 700,
    color: '#64748b',
    textTransform: 'uppercase',
    letterSpacing: 1,
  };

  const chipStyle = {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 4,
    padding: '3px 8px',
    borderRadius: 999,
    fontSize: 11,
    fontWeight: 700,
    background: 'rgba(255,255,255,0.04)',
    border: '1px solid rgba(255,255,255,0.06)',
  };

  return (
    <div
      className={className}
      style={wrapStyle}
      role="status"
      aria-label={`Question ${safeCurrent} of ${safeTotal}${accuracyPct != null ? `, ${accuracyPct}% accuracy` : ''}`}
    >
      <CompletionRing pct={completionPct} size={compact ? 22 : 28} stroke={3} color={accuracyPct != null && accuracyPct < 60 ? '#fbbf24' : '#00d4ff'} />
      <div style={{ display: 'flex', flexDirection: 'column', lineHeight: 1.05 }}>
        <span style={positionStyle}>{safeCurrent} / {safeTotal}</span>
        <span style={labelStyle}>Question</span>
      </div>

      {accuracyPct != null ? (
        <span style={{ ...chipStyle, color: accuracyPct >= 75 ? '#4ade80' : accuracyPct >= 50 ? '#fbbf24' : '#f87171' }}>
          {accuracyPct}% acc
        </span>
      ) : null}

      {theme ? (
        <span style={{ ...chipStyle, color: theme.color, borderColor: `${theme.color}55` }}>
          {theme.label}
        </span>
      ) : null}

      {typeof bestStreak === 'number' && bestStreak > 1 ? (
        <span style={{ ...chipStyle, color: '#fbbf24' }}>
          <FlameIcon size={11} /> {bestStreak}
        </span>
      ) : null}

      {typeof sessionMs === 'number' ? (
        <span style={{ ...chipStyle, marginLeft: 'auto', color: '#94a3b8' }}>
          <ClockIcon size={11} /> {formatMs(sessionMs)}
        </span>
      ) : null}
    </div>
  );
});

export default ProgressStrip;
export const PROGRESS_STRIP_VERSION = '1.0.0';
