/**
 * StatusPill - a status as TEXT, tinted.
 *
 * Colour is never the only carrier: the pill always renders a word, and the
 * border uses currentColor so the shape survives a monochrome display or a
 * forced-colours mode. Statuses this console has shipped as colour-only
 * before: ticket open/resolved, review flagged, horse resting.
 */
import React from 'react';
import styles from './shared.module.css';

const TONE_CLASS = {
  neutral: styles.pillNeutral,
  good: styles.pillGood,
  info: styles.pillInfo,
  warn: styles.pillWarn,
  danger: styles.pillDanger,
};

/** Known operator statuses mapped to a tone. Anything unknown reads neutral. */
export const STATUS_TONES = {
  open: 'danger',
  in_progress: 'warn',
  pending: 'warn',
  resolved: 'good',
  closed: 'neutral',
  active: 'good',
  playing: 'good',
  idle: 'neutral',
  resting: 'neutral',
  suspended: 'danger',
  flagged: 'warn',
  dismissed: 'neutral',
  reviewed: 'info',
  approved: 'good',
  rejected: 'danger',
  cancelled: 'neutral',
  high: 'danger',
  medium: 'warn',
  low: 'info',
};

export function toneForStatus(status) {
  if (!status) return 'neutral';
  return STATUS_TONES[String(status).toLowerCase()] || 'neutral';
}

export default function StatusPill({ status, label, tone }) {
  const text = label || (status ? String(status).replace(/_/g, ' ') : 'Unknown');
  const resolved = tone || toneForStatus(status);
  return (
    <span className={`${styles.pill} ${TONE_CLASS[resolved] || styles.pillNeutral}`}>
      {text}
    </span>
  );
}
