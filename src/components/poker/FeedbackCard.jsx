/**
 * FeedbackCard
 * ═══════════════════════════════════════════════════════════════════════════
 * Post-answer feedback card modeled 1:1 on GTO Wizard's two-tier layout.
 *
 * Tier 1 (always visible — verdict band):
 *   - Verdict pill: "CORRECT" / "INCORRECT" / "MIXED" with color + icon
 *   - Action chosen + Optimal action (e.g. "You: Call · Solver: Raise")
 *   - EV cost line: "-0.32 bb EV lost" or "+0.00 (perfect)"
 *   - Optional accuracy percent + best-streak chip
 *
 * Tier 2 (collapsible — explanation + range):
 *   - "Why" paragraph (under 50 words shown, full inside <details>)
 *   - Optional range matrix slot via the `rangeSlot` prop
 *   - Optional structured-explanation slot via the `detailsSlot` prop
 *
 * Bottom CTA row:
 *   - Primary: "Next Hand →" (or whatever the parent passes)
 *   - Secondary: "Review" / "Ask Jarvis" / "Share"
 *
 * Mobile: Next Hand becomes sticky-bottom (handled by parent via prop).
 *
 * Props
 *   verdict       'correct' | 'incorrect' | 'mixed'
 *   userAction    string — what the user chose
 *   solverAction  string — solver-optimal
 *   evLoss        number  — bb lost (0 for perfect)
 *   evUnit        string  — default 'bb'
 *   whyShort      string  — under-50-words explanation
 *   whyFull       string  — full explanation (rendered inside <details>)
 *   accuracy      number  — 0..100 for session
 *   bestStreak    number
 *   rangeSlot     ReactNode — range matrix or null
 *   detailsSlot   ReactNode — extra structured panels
 *   onNext        handler — primary CTA
 *   onReview      handler — optional secondary CTA
 *   nextLabel     string  — default 'Next Hand'
 *   stickyNext    boolean — render the Next button as sticky-bottom on mobile
 *   compact       boolean — narrower layout (e.g. in side rail)
 *   className     string
 *   style         object
 *
 * Build-safety: no emoji chars, no JSX comments inside conditionals.
 */
// TRAIN-FEEDBACK-V2 — audit-marker registry token
// TRAIN-CSS-TOKENS-SHARED-2 — adoption of --sp-* token contract in shared component

import React, { useState } from 'react';

const VERDICT_THEMES = {
  correct:   { fill: '#063d33', border: 'var(--sp-accent-emerald)', text: 'var(--sp-accent-green)', label: 'Correct' },
  incorrect: { fill: '#4a1010', border: 'var(--sp-accent-red)', text: 'var(--sp-accent-red)', label: 'Incorrect' },
  mixed:     { fill: '#3b2d00', border: 'var(--sp-accent-amber)', text: 'var(--sp-accent-amber)', label: 'Mixed Strategy' },
};

const ICON_PROPS = {
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 2,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
  'aria-hidden': true,
};

function CheckCircleIcon({ size = 20 }) {
  return (
    <svg {...ICON_PROPS} width={size} height={size} viewBox="0 0 24 24">
      <circle cx="12" cy="12" r="10" />
      <polyline points="9 12 12 15 16 10" />
    </svg>
  );
}
function XCircleIcon({ size = 20 }) {
  return (
    <svg {...ICON_PROPS} width={size} height={size} viewBox="0 0 24 24">
      <circle cx="12" cy="12" r="10" />
      <line x1="9" y1="9" x2="15" y2="15" />
      <line x1="15" y1="9" x2="9" y2="15" />
    </svg>
  );
}
function HalfCircleIcon({ size = 20 }) {
  return (
    <svg {...ICON_PROPS} width={size} height={size} viewBox="0 0 24 24">
      <circle cx="12" cy="12" r="10" />
      <path d="M12 2v20" />
    </svg>
  );
}
function ArrowRightIcon({ size = 14 }) {
  return (
    <svg {...ICON_PROPS} width={size} height={size} viewBox="0 0 24 24">
      <line x1="5" y1="12" x2="19" y2="12" />
      <polyline points="12 5 19 12 12 19" />
    </svg>
  );
}
function VerdictIcon({ verdict, size = 22 }) {
  if (verdict === 'correct') return <CheckCircleIcon size={size} />;
  if (verdict === 'incorrect') return <XCircleIcon size={size} />;
  return <HalfCircleIcon size={size} />;
}

function truncate(text, maxWords = 50) {
  if (!text) return '';
  const words = text.trim().split(/\s+/);
  if (words.length <= maxWords) return text;
  return words.slice(0, maxWords).join(' ') + '...';
}

const FeedbackCard = React.memo(function FeedbackCard({
  verdict = 'correct',
  userAction,
  solverAction,
  evLoss,
  evUnit = 'bb',
  whyShort,
  whyFull,
  accuracy,
  bestStreak,
  rangeSlot,
  detailsSlot,
  onNext,
  onReview,
  nextLabel = 'Next Hand',
  stickyNext = false,
  compact = false,
  className,
  style,
}) {
  const theme = VERDICT_THEMES[verdict] || VERDICT_THEMES.correct;
  const [expanded, setExpanded] = useState(false);
  const isPerfect = typeof evLoss === 'number' && Math.abs(evLoss) < 0.005;

  const wrapStyle = {
    background: 'linear-gradient(180deg, rgba(0,0,0,0.35) 0%, rgba(0,0,0,0.55) 100%)',
    border: '1px solid rgba(255,255,255,0.06)',
    borderRadius: 14,
    padding: compact ? 14 : 18,
    color: 'var(--sp-fg)',
    fontFamily: "'Inter', -apple-system, sans-serif",
    ...(style || {}),
  };

  const verdictBandStyle = {
    display: 'flex',
    alignItems: 'center',
    gap: 12,
    padding: compact ? '10px 12px' : '12px 14px',
    borderRadius: 10,
    background: theme.fill,
    border: `1px solid ${theme.border}66`,
    color: theme.text,
    marginBottom: 12,
  };

  const verdictLabelStyle = {
    fontSize: compact ? 13 : 15,
    fontWeight: 800,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  };

  const actionLineStyle = {
    fontSize: 13,
    color: 'var(--sp-fg)',
    fontWeight: 600,
    marginLeft: 'auto',
    textAlign: 'right',
  };

  const evLineStyle = {
    fontSize: 12,
    fontWeight: 700,
    color: isPerfect ? 'var(--sp-accent-green)' : 'var(--sp-accent-amber)',
    fontVariantNumeric: 'tabular-nums',
  };

  const chipRowStyle = {
    display: 'flex',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 12,
  };

  const chipStyle = {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 6,
    padding: '4px 10px',
    borderRadius: 999,
    fontSize: 11,
    fontWeight: 700,
    background: 'rgba(255,255,255,0.04)',
    border: '1px solid rgba(255,255,255,0.06)',
    color: 'var(--sp-fg-muted)',
  };

  const whyStyle = {
    fontSize: 13,
    color: 'var(--sp-fg)',
    lineHeight: 1.55,
    margin: '0 0 12px 0',
  };

  const ctaRowStyle = {
    display: 'flex',
    gap: 8,
    marginTop: 14,
    position: stickyNext ? 'sticky' : undefined,
    bottom: stickyNext ? 'calc(env(safe-area-inset-bottom, 0px) + 12px)' : undefined,
  };

  const primaryBtnStyle = {
    flex: stickyNext ? 1 : 2,
    minHeight: 48,
    padding: '0 18px',
    borderRadius: 10,
    border: 'none',
    background: 'linear-gradient(135deg, #00d4ff, #0099ff)',
    color: '#0a0a0a',
    fontWeight: 800,
    fontSize: 14,
    letterSpacing: 0.3,
    textTransform: 'uppercase',
    cursor: 'pointer',
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  };

  const secondaryBtnStyle = {
    flex: 1,
    minHeight: 48,
    padding: '0 16px',
    borderRadius: 10,
    border: '1px solid rgba(255,255,255,0.1)',
    background: 'rgba(255,255,255,0.04)',
    color: 'var(--sp-fg)',
    fontWeight: 700,
    fontSize: 13,
    cursor: 'pointer',
  };

  const evDisplay = isPerfect
    ? `+0.00 ${evUnit} (perfect)`
    : `${evLoss > 0 ? '-' : ''}${Math.abs(evLoss).toFixed(2)} ${evUnit} EV lost`;

  return (
    <section
      className={className}
      style={wrapStyle}
      aria-label="Hand feedback"
      role="region"
    >
      <div style={verdictBandStyle}>
        <span style={{ display: 'inline-flex', color: theme.text }} aria-hidden>
          <VerdictIcon verdict={verdict} size={22} />
        </span>
        <span style={verdictLabelStyle}>{theme.label}</span>
        {(userAction || solverAction) ? (
          <span style={actionLineStyle}>
            {userAction ? <span style={{ color: theme.text }}>{userAction}</span> : null}
            {userAction && solverAction ? <span style={{ color: 'var(--sp-fg-dim)' }}> · </span> : null}
            {solverAction ? <span>Solver: <strong style={{ color: '#fff' }}>{solverAction}</strong></span> : null}
          </span>
        ) : null}
      </div>

      <div style={chipRowStyle}>
        {typeof evLoss === 'number' ? (
          <span style={{ ...chipStyle, color: isPerfect ? 'var(--sp-accent-green)' : 'var(--sp-accent-amber)' }}>
            <span style={evLineStyle}>{evDisplay}</span>
          </span>
        ) : null}
        {typeof accuracy === 'number' ? (
          <span style={chipStyle}>Accuracy: <strong style={{ color: 'var(--sp-fg)' }}>{Math.round(accuracy)}%</strong></span>
        ) : null}
        {typeof bestStreak === 'number' && bestStreak > 0 ? (
          <span style={chipStyle}>Streak: <strong style={{ color: 'var(--sp-fg)' }}>{bestStreak}</strong></span>
        ) : null}
      </div>

      {whyShort ? (
        <p style={whyStyle}>
          {expanded || !whyFull ? (whyFull || whyShort) : truncate(whyShort, 50)}
        </p>
      ) : null}

      {whyFull && !expanded ? (
        <button
          type="button"
          aria-label="Read full explanation"
          onClick={() => setExpanded(true)}
          style={{
            background: 'none',
            border: 'none',
            color: 'var(--sp-accent-cyan)',
            fontSize: 12,
            fontWeight: 700,
            cursor: 'pointer',
            padding: 0,
            marginBottom: 12,
          }}
        >
          Read more
        </button>
      ) : null}

      {rangeSlot ? <div style={{ marginTop: 4, marginBottom: 12 }}>{rangeSlot}</div> : null}
      {detailsSlot ? <div style={{ marginTop: 4 }}>{detailsSlot}</div> : null}

      <div style={ctaRowStyle}>
        {onReview ? (
          <button
            type="button"
            aria-label="Review this hand"
            onClick={onReview}
            style={secondaryBtnStyle}
          >
            Review
          </button>
        ) : null}
        {onNext ? (
          <button
            type="button"
            aria-label={nextLabel}
            onClick={onNext}
            style={primaryBtnStyle}
          >
            {nextLabel}
            <ArrowRightIcon size={14} />
          </button>
        ) : null}
      </div>
    </section>
  );
});

export default FeedbackCard;
export const FEEDBACK_CARD_VERSION = '2.0.0';