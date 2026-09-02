/**
 * KpiTile - a number, the label that says exactly what it counts, and an
 * optional hint naming the denominator.
 *
 * The hint exists because this console has shipped two different populations
 * under one label before (content_authors rows versus horses with a poker
 * profile). A KPI without a stated denominator is a KPI nobody can check.
 */
import React from 'react';
import styles from './shared.module.css';

const TONES = {
  accent: styles.toneAccent,
  warn: styles.toneWarn,
  danger: styles.toneDanger,
};

export default function KpiTile({ label, value, hint, tone, onClick }) {
  const body = (
    <>
      <span className={styles.kpiTileValue}>{value}</span>
      <span className={styles.kpiTileLabel}>{label}</span>
      {hint ? <span className={styles.kpiTileHint}>{hint}</span> : null}
    </>
  );
  const className = `${styles.kpiTile} ${TONES[tone] || ''}`;

  if (typeof onClick === 'function') {
    return (
      <button type="button" className={className} onClick={onClick}>
        {body}
      </button>
    );
  }
  return <div className={className}>{body}</div>;
}
