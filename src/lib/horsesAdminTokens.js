/**
 * Shared inline-style tokens for the /horses admin surface.
 *
 * The real palette lives in horses.module.css, declared as CSS custom
 * properties on .dashboard (and the other top-level containers of that
 * module). Custom properties inherit, so any inline style rendered inside the
 * dashboard can reference them with var(). This file just gives those var()
 * strings short names so an inline style reads as a colour role rather than a
 * hex code.
 *
 * NO RAW HEX BELONGS IN pages/horses/*.js. If a colour is missing here, add
 * the token to horses.module.css first and then name it here — do not reach
 * for a literal. Dan 2026-08-26: smarter.poker schema only, no purples, no
 * greens. Cyan is the accent AND the success/active colour.
 */
export const T = {
  // Surfaces
  page: 'var(--bg-page)',
  panel: 'var(--bg-panel)',
  surface: 'var(--bg-surface)',
  elevated: 'var(--bg-elevated)',
  inset: 'var(--bg-inset)',

  // Accent — also SUCCESS / ACTIVE / ONLINE / POSITIVE
  accent: 'var(--accent)',
  accentDim: 'var(--accent-dim)',
  accentSoft: 'var(--accent-soft)',
  accentLine: 'var(--accent-line)',
  accentGlow: 'var(--accent-glow)',

  // Semantic
  info: 'var(--info)',
  infoSoft: 'var(--info-soft)',
  warn: 'var(--warn)',
  warnSoft: 'var(--warn-soft)',
  danger: 'var(--danger)',
  dangerSoft: 'var(--danger-soft)',
  dangerLine: 'var(--danger-line)',

  // Text
  text: 'var(--text)',
  dim: 'var(--text-dim)',
  muted: 'var(--text-muted)',

  // Lines
  line: 'var(--line)',
  lineStrong: 'var(--line-strong)',
};

/** A number that may legitimately be unknown. Never render a fabricated 0. */
export function num(value, fallback = '—') {
  if (value === null || value === undefined || Number.isNaN(Number(value))) return fallback;
  return Number(value).toLocaleString();
}

/** Money-ish value with an explicit sign, coloured by direction at the call site. */
export function signed(value) {
  const n = Number(value || 0);
  return `${n > 0 ? '+' : ''}${n.toLocaleString()}`;
}

/** Dates from the DB are frequently null. Never let toLocaleString throw. */
export function when(value, withTime = false) {
  if (!value) return '—';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '—';
  return withTime ? d.toLocaleString() : d.toLocaleDateString();
}
