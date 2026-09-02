/**
 * Pager - Previous / Next and an honest "Showing X-Y Of Z".
 *
 * When `total` is unknown the range is still stated and the total is named as
 * unknown rather than guessed at, because a fabricated total is how a list
 * ends up looking complete when it is not.
 */
import React from 'react';
import styles from './shared.module.css';

function fmt(n) {
  return Number(n).toLocaleString();
}

/** Pure so the copy can be asserted without a DOM. */
export function rangeLabel({ offset = 0, count = 0, total = null, noun = 'Rows' }) {
  if (!count) {
    return total ? `Showing 0 Of ${fmt(total)} ${noun}` : `Showing 0 ${noun}`;
  }
  const first = offset + 1;
  const last = offset + count;
  return total === null || total === undefined
    ? `Showing ${fmt(first)}-${fmt(last)} ${noun}`
    : `Showing ${fmt(first)}-${fmt(last)} Of ${fmt(total)} ${noun}`;
}

export default function Pager({
  offset = 0,
  limit = 50,
  count = 0,
  total = null,
  loading = false,
  noun = 'Rows',
  onPrevious,
  onNext,
}) {
  const hasPrevious = offset > 0;
  const hasNext = total === null || total === undefined
    ? count >= limit
    : offset + count < total;

  return (
    <div className={styles.pager}>
      <button
        type="button"
        className={styles.pagerBtn}
        onClick={onPrevious}
        disabled={!hasPrevious || loading}
      >
        Previous
      </button>
      <span className={styles.pagerInfo}>{rangeLabel({ offset, count, total, noun })}</span>
      <button
        type="button"
        className={styles.pagerBtn}
        onClick={onNext}
        disabled={!hasNext || loading}
      >
        Next
      </button>
    </div>
  );
}
